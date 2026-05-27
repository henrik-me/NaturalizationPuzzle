# API Performance Benchmark

A k6-based load benchmark for the NaturalizationPuzzle backend. It runs as
the `api-benchmark` job in CI on every PR and on `main`, publishes
per-endpoint p50/p95/p99 + throughput + average compressed response size as
build artifacts, and is **advisory only** — it does not gate merges or
deploys.

This is Layer 2 of the perf measurement plan tracked in issue #97.

## What it measures

Seven endpoints, mirroring the production client's warm-up fan-out
(`src/client/src/hooks/useWarmUpCache.ts`):

| Scenario tag         | Endpoint                                        |
|----------------------|-------------------------------------------------|
| `questions-all`      | `GET /api/v1/questions`                         |
| `questions-65-20`    | `GET /api/v1/questions/6520`                    |
| `questions-stateid`  | `GET /api/v1/questions?stateId=5` (California)  |
| `states-list`        | `GET /api/v1/states`                            |
| `states-detail`      | `GET /api/v1/states/5` (California)             |
| `stories-list`       | `GET /api/v1/stories`                           |
| `stories-detail`     | `GET /api/v1/stories/{slug}` (first in index)   |

Each scenario uses k6's `constant-vus` executor: **5 virtual users for 30
seconds**. The `stories-detail` slug is resolved dynamically in `setup()`
from the live `/api/v1/stories` index — never hardcoded — so it stays
correct as the Story Mode catalog evolves. Override with the
`BENCH_STORY_SLUG` env var if you want to pin a specific story.

`Accept-Encoding` is left at k6's default so the production Brotli/Gzip
middleware (added in PR #96) is exercised. The "Avg compressed size"
column is `data_received / requests` per endpoint and therefore reflects
on-the-wire bytes.

## Why sequential, not parallel

Scenarios are chained with `startTime` offsets (`0s`, `35s`, `70s`, …) so
only one endpoint is under load at any moment. Running them in parallel
would make the runner CPU (and the API process) the bottleneck instead of
the individual endpoint code path, contaminating per-endpoint latency with
queueing delay from sibling scenarios. Total wall time is ≈ 4 min 5 s.

Each scenario also sets `gracefulStop: '0s'` (k6's default is 30s). With
`STEP=35s` and `DURATION=30s`, the default would let a request started in
the last second of scenario N stay in-flight for up to 30s into scenario
N+1, polluting both scenarios' p95/p99. With `gracefulStop: '0s'` the
scenario boundary is hard: any straggler counts as a (likely failed)
request in scenario N rather than as latency bleed into N+1.

## Why k6 over bombardier / wrk / autocannon

- **Per-endpoint tagging:** k6 scenarios with custom tags give us clean
  per-endpoint metric submetrics without running the tool seven times.
- **Structured JSON export:** `handleSummary()` gives us a single JSON blob
  the summarizer can post-process into a markdown table for the PR
  artifact.
- **Thresholds language:** when we promote this from advisory to gating,
  k6's threshold syntax (`p(95)<100`) sits directly in
  [`thresholds.json`](./thresholds.json) and the same script gates CI
  without extra glue.

## Running locally

Prereqs: [k6](https://k6.io/docs/get-started/installation/) installed.

In one terminal, start the API:

```bash
dotnet run --project src/api/NaturalizationPuzzle.Api.csproj --urls http://127.0.0.1:5099
```

In another terminal, run the bench:

```bash
k6 run tests/perf/api-bench.js
node tests/perf/summarize.mjs tests/perf/k6-results.json > tests/perf/k6-summary.md
cat tests/perf/k6-summary.md
```

Overrides:

```bash
# Hit a different host / port (e.g. the production image running locally):
BENCH_BASE_URL=http://localhost:8080 k6 run tests/perf/api-bench.js

# Pin a specific story slug instead of resolving from the live index:
BENCH_STORY_SLUG=my-story k6 run tests/perf/api-bench.js
```

## Interpreting results

- **p50 / p95 / p99** are the 50th / 95th / 99th percentile of
  `http_req_duration` (full request time, including TLS / TCP / server /
  download). With a localhost target the TLS/TCP terms are negligible, so
  this is effectively server time + body download.
- **Throughput (req/s)** is `http_reqs.rate` for the scenario. At 5 VUs
  with no think time, the ceiling is `5 / mean_request_time_seconds`, so a
  20 ms-per-request endpoint will report ≈ 250 req/s. This is **not** a
  saturation number; it's a "five concurrent clients hammering this one
  endpoint" number.
- **Avg compressed size** is `data_received / requests` per endpoint. This
  reflects on-the-wire bytes after the compression middleware. Watch this
  alongside PR #96's compression budgets — a regression here usually means
  the middleware is no longer matching the response's content type.

## CI artifacts

The `api-benchmark` job uploads `api-bench-results` on every PR run
(`if: always()`, even if the bench step itself failed). It contains:

- `k6-results.json` — full `handleSummary()` output (machine-readable).
- `k6-stdout.txt`   — k6's default text summary (human-readable).
- `k6-summary.md`   — the table produced by `summarize.mjs`.

Find them under the run's **Artifacts** section in the GitHub Actions UI.

## Advisory → gating promotion path

Today [`thresholds.json`](./thresholds.json) is `{}`. The k6 script
auto-generates no-op thresholds (`count>=0`, `p(95)>=0`) for every endpoint
tag so k6 materializes the per-tag submetrics that `summarize.mjs` needs to
build the report. Without those, k6 wouldn't emit per-endpoint breakdowns
at all and the bench would silently look "broken". User-supplied entries
in `thresholds.json` are merged on top (via object spread) and override
the auto-generated no-ops — so adding `"http_req_duration{endpoint:foo}":
["p(95)<100"]` replaces the no-op with a real threshold.

To promote to a gating check:

1. Collect ≈ 10 main-branch runs from the artifact and compute p95
   ceilings per endpoint (a 30 % headroom over the observed p95 is a
   reasonable first cut).
2. Populate `thresholds.json`, e.g.:

   ```json
   {
     "http_req_duration{endpoint:questions-all}": ["p(95)<100"],
     "http_req_duration{endpoint:stories-detail}": ["p(95)<150"]
   }
   ```

3. In `.github/workflows/ci-cd.yml`, flip the bench step from
   `continue-on-error: true` to `continue-on-error: false`. A k6 threshold
   breach will then fail the job, which (because `api-benchmark` is not in
   any downstream `needs:`) still won't block the deploy — gating that
   propagates to deploy is a separate, deliberate change.

## Failure semantics

`summarize.mjs` exits with code **1** if any scenario recorded zero
requests — that nearly always means the API died mid-run, and we want
the failure mode loud even though the bench step is otherwise advisory.
The `actions/upload-artifact@v7` step uses `if: always()` so partial
artifacts (including `k6-stdout.txt`) are still uploaded when this
happens.
