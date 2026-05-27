// API benchmark — k6 harness for the NaturalizationPuzzle backend.
//
// Design choices (locked in by the Layer-2 plan in issue #97):
//   - Scenarios are run SEQUENTIALLY (chained `startTime` offsets) instead of
//     in parallel. With 5 VUs per scenario and 7 endpoints, running in
//     parallel would saturate the runner CPU and contaminate per-endpoint
//     latency. Sequential execution keeps per-endpoint numbers comparable
//     across runs.
//   - The slug for `/api/v1/stories/{slug}` is resolved DYNAMICALLY in
//     `setup()` from the live `/api/v1/stories` index. We never hardcode a
//     slug (Story Mode catalog changes would silently break the bench).
//   - Default `Accept-Encoding` is left intact so the production compression
//     middleware (Brotli/Gzip, see PR #96) is exercised on the wire. The
//     bench reports the *decoded* per-endpoint body size in bytes (via the
//     `bench_response_bytes` Counter populated from `res.body.byteLength`,
//     with `responseType: 'binary'` so the count is true UTF-8 bytes
//     rather than JS string UTF-16 code units) as a proxy for payload
//     bloat; on-the-wire compressed-byte attribution per endpoint is
//     intentionally out of scope (see tests/perf/README.md).
//   - This bench is ADVISORY ONLY in CI. `thresholds.json` ships empty;
//     real thresholds get added after ~10 main-branch baselines (see
//     tests/perf/README.md).
import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.2/index.js';

const BASE_URL = __ENV.BENCH_BASE_URL || 'http://127.0.0.1:5099';
const STATE_ID = __ENV.BENCH_STATE_ID || '5'; // 5 = California in SeedData.cs
const OVERRIDE_SLUG = __ENV.BENCH_STORY_SLUG || null;

// Custom per-endpoint *uncompressed* response-body counter.
//
// Earlier iterations tried to measure compressed wire bytes via the response's
// `Content-Length` header, but the API is fronted by
// `Microsoft.AspNetCore.ResponseCompression`, which streams compressed
// responses with `Transfer-Encoding: chunked` and no `Content-Length`.
// Every sample would have been silently skipped and the "Avg size" column
// would have come out blank in CI.
//
// Built-in `data_received` is also unsuitable: it is accounted at the
// connection layer (so it folds in TLS / HTTP framing overhead), and its
// per-request tag propagation has been inconsistent across k6 versions.
//
// `res.body.length` is the *decoded* (decompressed) body length. It is
// reliably available for every request regardless of transfer encoding, and
// it's a stable proxy for "did this endpoint's payload accidentally bloat?".
// It is NOT a proxy for "did the compression middleware regress?" -- that
// requires harness-level access to on-the-wire bytes per request, which k6
// doesn't currently expose. That gap is tracked separately.
const responseBytes = new Counter('bench_response_bytes');

// Endpoint tags MUST stay in sync with summarize.mjs's ENDPOINT_TAGS list.
const ENDPOINT_TAGS = [
  'questions-all',
  'questions-65-20',
  'questions-stateid',
  'states-list',
  'states-detail',
  'stories-list',
  'stories-detail',
];

// k6 only materializes a tagged sub-metric (e.g. `http_req_duration{endpoint:foo}`)
// in handleSummary output when a threshold is registered for it. Without these
// no-op thresholds, the empty `thresholds.json` would mean summarize.mjs sees
// zero per-endpoint data and incorrectly reports every scenario as 0 requests.
// `count>=0` and `p(95)>=0` are always-true: they materialize the submetric
// without imposing any pass/fail criteria.
//
// `http_req_failed{endpoint:foo}: ['rate==0']` is NOT a no-op -- it is an
// intentional correctness sentinel. A typoed URL returning 404 (or any 5xx)
// would otherwise silently produce a "normal" summary because k6's `check()`
// failures do not by themselves affect exit code. With this threshold, any
// failed request trips the threshold, k6 exits non-zero, the GH step is
// marked failure, and the "Dump API log on bench failure" step fires. The
// JOB itself still succeeds because `continue-on-error: true`, so deploy is
// not blocked -- but the failure is surfaced for human review.
//
// Real gating thresholds added via thresholds.json take precedence (object
// spread below).
function buildAdvisoryThresholds() {
  const out = {};
  for (const tag of ENDPOINT_TAGS) {
    out[`http_reqs{endpoint:${tag}}`] = ['count>=0'];
    out[`http_req_duration{endpoint:${tag}}`] = ['p(95)>=0'];
    out[`bench_response_bytes{endpoint:${tag}}`] = ['count>=0'];
    out[`http_req_failed{endpoint:${tag}}`] = ['rate==0'];
  }
  return out;
}

// Load advisory thresholds at init time. File contents (typically `{}`) override
// or extend the auto-generated no-op thresholds.
const fileThresholds = JSON.parse(open('./thresholds.json'));
const thresholds = { ...buildAdvisoryThresholds(), ...fileThresholds };

// Sequential scenarios: each one runs for 30s, with 5s of headroom between
// scenarios so the previous scenario's tail latency doesn't bleed into the
// next scenario's numbers. Total wall time ≈ 7 × 35s = 4m05s.
const VUS = 5;
const DURATION = '30s';
const STEP = 35; // seconds between scenario starts

function scenario(endpointTag, index) {
  return {
    executor: 'constant-vus',
    vus: VUS,
    duration: DURATION,
    startTime: `${index * STEP}s`,
    // k6's default gracefulStop is 30s. With STEP=35s and DURATION=30s, a
    // request started near the end of scenario N could otherwise still be
    // in-flight up to 30s into scenario N+1, contaminating both scenarios'
    // latency tails. 0s = hard-cut at scenario end; any straggler counts
    // as a (likely failed) request in scenario N, not as overlap into N+1.
    gracefulStop: '0s',
    exec: endpointTag.replace(/-/g, '_'),
    tags: { endpoint: endpointTag },
  };
}

export const options = {
  discardResponseBodies: false,
  // k6's default summaryTrendStats is ['avg','min','med','max','p(90)','p(95)'].
  // We want p(99) too because tail latency is a primary axis of this bench.
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
  scenarios: {
    questions_all:      scenario('questions-all', 0),
    questions_65_20:    scenario('questions-65-20', 1),
    questions_stateid:  scenario('questions-stateid', 2),
    states_list:        scenario('states-list', 3),
    states_detail:      scenario('states-detail', 4),
    stories_list:       scenario('stories-list', 5),
    stories_detail:     scenario('stories-detail', 6),
  },
  thresholds,
};

export function setup() {
  // Resolve the story slug dynamically from the live index so the bench
  // doesn't silently break when the Story Mode catalog evolves.
  if (OVERRIDE_SLUG) {
    return { storySlug: OVERRIDE_SLUG };
  }
  const res = http.get(`${BASE_URL}/api/v1/stories`);
  if (res.status !== 200) {
    throw new Error(
      `setup: GET /api/v1/stories returned ${res.status}; cannot resolve story slug for stories-detail scenario`,
    );
  }
  const body = JSON.parse(res.body);
  if (!Array.isArray(body) || body.length === 0 || !body[0].slug) {
    throw new Error(
      `setup: /api/v1/stories returned no usable entries (got ${res.body && res.body.slice(0, 200)})`,
    );
  }
  return { storySlug: body[0].slug };
}

function hit(url, tag) {
  // `responseType: 'binary'` makes res.body an ArrayBuffer rather than a
  // JavaScript string. We need this so we can read `byteLength` (the true
  // UTF-8 payload size) instead of `length` (UTF-16 code units, which
  // would understate the size of any non-ASCII content -- e.g. story
  // bodies with em-dashes / smart-quotes / accented characters).
  const res = http.get(url, { tags: { endpoint: tag }, responseType: 'binary' });
  check(res, {
    'status is 200': r => r.status === 200,
    'body is non-empty': r => r.body && r.body.byteLength > 0,
  });
  // Record the decoded body length (in bytes) per endpoint. See the
  // comment on `responseBytes` above for why this is the decompressed
  // body, not wire bytes.
  if (res.body) {
    responseBytes.add(res.body.byteLength, { endpoint: tag });
  }
}

export function questions_all() {
  hit(`${BASE_URL}/api/v1/questions`, 'questions-all');
}

export function questions_65_20() {
  hit(`${BASE_URL}/api/v1/questions/6520?stateId=${STATE_ID}`, 'questions-65-20');
}

export function questions_stateid() {
  hit(`${BASE_URL}/api/v1/questions?stateId=${STATE_ID}`, 'questions-stateid');
}

export function states_list() {
  hit(`${BASE_URL}/api/v1/states`, 'states-list');
}

export function states_detail() {
  hit(`${BASE_URL}/api/v1/states/${STATE_ID}`, 'states-detail');
}

export function stories_list() {
  hit(`${BASE_URL}/api/v1/stories`, 'stories-list');
}

export function stories_detail(data) {
  hit(
    `${BASE_URL}/api/v1/stories/${encodeURIComponent(data.storySlug)}?stateId=${STATE_ID}`,
    'stories-detail',
  );
}

export function handleSummary(data) {
  return {
    'tests/perf/k6-results.json': JSON.stringify(data, null, 2),
    'tests/perf/k6-stdout.txt': textSummary(data, { indent: ' ', enableColors: false }),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}
