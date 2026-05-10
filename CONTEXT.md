# NaturalizationPuzzle — Project Context

## Current Status

Full-stack application scaffolded and building. Backend API is functional with seeded data and passing tests. Frontend builds with PWA support. Phase 1 (containerization) ✅, Phase 2 (CI/CD + App Insights) ✅, Phase 3 (Azure Container Apps deployment) ✅. Live in production at **https://np.metzger.dk** (custom domain with Azure-managed TLS; default FQDN `https://ca-natpuzzle-prod.wittyisland-552f7b95.westus2.azurecontainerapps.io` also works).

## What Has Been Implemented

- `.github/copilot-instructions.md` — full project conventions and architecture guide
- `.vscode/mcp.json` — Playwright MCP server configuration
- `.gitignore` — covers .NET, Node, IDE, and OS artifacts
- `CONTEXT.md` — project context and decision log
- `servers.ps1` — PowerShell server management script (start/stop/status) with process state files, window title tagging, and multi-strategy process discovery
- `servers-start.bat` / `servers-stop.bat` / `servers-status.bat` — batch wrappers for `servers.ps1`
- `Dockerfile` — multi-stage build (node frontend → dotnet publish → aspnet runtime)
- `docker-compose.yml` — local container testing with volume mount for SQLite, port 8080
- `.dockerignore` — excludes build artifacts, tests, docs, dev files
- `container-test.ps1` — automated container validation (build, start, health check, smoke test, cleanup)
- `container-start.bat` — builds/starts container with running detection, health check, smoke test
- `container-stop.bat` — stops container and verifies port is free
- `.github/workflows/ci-cd.yml` — GitHub Actions CI/CD (build, test, docker build, push to GHCR)

### Backend (`src/api/`)
- .NET 10 Minimal API project with EF Core + SQLite
- Models: Question, Answer, UsState, QuizSession, Representative + record DTOs; **Story / StorySource / OrphanedQuestion** + StoryListItemDto / StoryDetailDto (POCOs, not EF entities — story content ships as embedded resources)
- SeedData: all 128 USCIS 2025 civics questions with answers, categories, 65/20 designations
- RepresentativeSeedData: all 435 U.S. House Representatives (119th Congress) by state and district
- Services: QuestionService (state-specific answer resolution with per-rep data), StateService, QuizService, RepresentativeService (vacant seat detection & update), **StoryService** (lazy-loads embedded stories on first use, resolves state-aware Questions[] via IQuestionService) + internal **StoryParser** (paragraph-citation enforcement, source-snippet enforcement, FK floor, model-memory marker computation)
- Endpoints: versioned under `/api/v1/` — questions, states, quiz, representatives, **stories**, health
- Program.cs: DI registration, CORS, static file serving, SPA fallback, auto-create DB on startup, HTTPS redirect (dev only), Application Insights via OpenTelemetry (conditional)
- `appsettings.Production.json` — production logging configuration (includes Azure Monitor log levels)
- **Story content** lives in `content/stories/<slug>.md` + `<slug>.sources.json` and ships as `<EmbeddedResource>` in `NaturalizationPuzzle.Api.csproj`

### Frontend (`src/client/`)
- React 19 + Vite + TypeScript (strict mode)
- Tailwind CSS v4 for styling
- PWA via vite-plugin-pwa with service worker and runtime caching
- React Router DOM (`/`, `/quiz`, **`/stories`**, **`/stories/:slug`**, `/history`, `/settings`)
- AppContext with useReducer for state management (hydrates persisted state on load)
- Typed API client with ApiResult<T> union type
- Service layer: questionService, stateService, quizService, **storyService**
- Components: Navigation, OfflineBanner, StateSelector, QuizCard (study + quiz modes), **StoryRenderer** (narrow custom Markdown renderer with XSS guards: no `dangerouslySetInnerHTML`, link-protocol allowlist `http`/`https`/`mailto`, explicit allowlist of supported Markdown constructs)
- Pages: StudyPage (with progress tracking and keyword search/filter), QuizPage (with scoring), HistoryPage (quiz attempt history with summary stats), SettingsPage, **StoriesPage** (cards grouped by category, X-of-N progress), **StoryPage** (state-personalized preamble for `stateAwarePreamble` stories, body rendered via StoryRenderer, sources list with quoted support snippets, end-of-story comprehension quiz that hands off to QuizCard, model-memory disclosure shown only when flag is true)
- Quiz mode: typed answer input, no answer reveal until results, auto-grading with fuzzy matching
- Quiz scoring: real-time pass/fail (12/20 standard, 6/10 for 65/20), early stop on pass/fail
- Progress tracking: localStorage-based tracking of studied questions, quiz history, **and `storiesRead` slugs** via useProgress hook (with backward-compatible migration for users whose stored shape predates Story Mode)
- Quiz history page: summary stats (total quizzes, pass rate, best score, current streak), reverse-chronological attempt list, clear history with confirmation
- Answer checking: case-insensitive normalized matching with substring and word-overlap strategies
- Cache warm-up: useWarmUpCache hook eagerly fetches all API endpoints on mount for offline readiness, **including the stories index and every pilot story detail** (with `stateId` where set) so all pilots are fully readable offline after the first online visit

### Tests (`tests/api/`)
- xUnit project with API tests covering questions, quiz, representatives, story content, and story service
- QuestionServiceTests, QuizServiceTests, RepresentativeSeedDataTests, RepresentativeServiceTests, QuestionTagsPersistenceTests
- **StoryContentTests**: drives `StoryParser` over every embedded pilot story; asserts every `QuestionId` exists in seed data, `(Category, SubCategory)` matches, every source has a non-empty `SupportSnippet`, every `[N]` marker resolves to a source, `FleschReadingEase >= ReadingLevelMin`, the **coverage contract** (every Question whose `(Category, SubCategory)` matches a pilot story's scope is in `QuestionIds` OR `OrphanedQuestionIds` with a reason), and that `three-branches` includes the state-aware Q23+Q29.
- **StoryServiceTests**: list returns all pilots; `GetAsync` returns null for unknown slug; `GetAsync("three-branches", stateId: <CA>)` resolves Q23 to non-`[Answers vary by state]` strings; `Sources`/Markdown pass through unchanged; `GetAllStories()` is memoized via `Lazy<T>`.

### Tests (`src/client/` — co-located)
- Vitest with jsdom, @testing-library/react, @testing-library/user-event
- apiClient.test.ts: 5 tests (GET/POST success, error, network failure)
- QuizCard.test.tsx: 9 tests (render, 65/20 badge, reveal/next, category, quiz mode input, submit, disabled)
- OfflineBanner.test.tsx: 1 test (hidden when online)
- answerChecker.test.ts: 9 tests (exact match, case-insensitive, substring, parentheticals, empty, wrong answers)
- AppContext.test.tsx: 9 tests (default state, provider requirement, SET_STATE/SET_6520/SET_LOADING dispatch, state hydration from API, no-hydration without stateId, hydration failure, online/offline events)
- StateSelector.test.tsx: 4 tests (loading state, dropdown rendering, dispatch on select, accessible label)
- Navigation.test.tsx: 4 tests (menu items render, app title, nav landmark, correct routes)
- HistoryPage.test.tsx: 8 tests (empty state, renders entries, newest first, summary stats, confirm dialog, cancel clear, clear history, accessible labels)
- ErrorBoundary.test.tsx: 3 tests (renders children, default fallback on error, custom fallback)
- useProgress.test.ts: 7 tests (empty initial, mark studied + persist, no duplicates, quiz results + persist, load existing, corrupt data, clear quiz history preserving studied)
- useWarmUpCache.test.ts: 3 tests (fetches without stateId, fetches with stateId, runs only once)

### E2E Tests (`tests/e2e/`)
- Playwright with Chromium, Page Object Model pattern
- @axe-core/playwright for WCAG 2.1 AA automated accessibility checks
- SettingsPage/StudyPage/QuizPage page objects
- state-selection.spec.ts (state selection + persistence)
- study-flow.spec.ts (display, reveal/advance, 65/20 filter, category, tag, studied status)
- offline.spec.ts (study, answers, navigation, quiz, banner — all offline)
- accessibility.spec.ts (settings, study, quiz, **stories index, story detail**)
- dark-mode.spec.ts (theme selector + system preference + FOUC prevention + keyboard nav)
- **story-flow.spec.ts** (Stories index renders all 3 pilot cards; state-aware preamble on three-branches with a state selected; complete comprehension quiz marks story read and persists across reload; story remains readable offline after warm-up)

### Error Handling
- React ErrorBoundary wrapping Routes with user-friendly fallback
- .NET GlobalExceptionHandler middleware returning ProblemDetails (RFC 9457)
  with correlation IDs and structured logging
- `LogSanitizer` (`src/api/Logging/`) sanitizes user-controlled values to prevent
  log forging (CWE-117). GlobalExceptionHandler logs sanitized exception fields by
  default; set `Logging:Exceptions:IncludeRawException=true` to restore raw
  `Exception` logging (richer OTel/AppInsights telemetry, used for debugging).

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| React 19 + Vite | Most mature PWA/offline ecosystem for the frontend |
| .NET 10 Minimal APIs | Latest .NET with concise, modern API style (RC1 installed) |
| SQLite + EF Core | Simple file-based database, no external setup needed |
| Tailwind CSS v4 | Utility-first styling, fast prototyping |
| URL path API versioning (`/api/v1/`) | Simple, explicit, no header negotiation needed |
| Conventional Commits | Clear commit history, separate functional from refactoring changes |
| HTTPS in development | `@vitejs/plugin-basic-ssl` for Vite, .NET dev cert for API; ensures dev parity with production |

## Story Mode — Authoring Guide

Required reading for adding any new Story Mode story. Captures the conventions baked into `StoryParser` and `StoryContentTests` so the build/CI fail-fast invariants stay correct as the catalog grows.

### File layout

Each story is two files under `content/stories/`:

- `<slug>.md` — YAML frontmatter + Markdown body
- `<slug>.sources.json` — citation sources (one per `[N]` marker)

Both ship as `<EmbeddedResource>` in `src/api/NaturalizationPuzzle.Api.csproj` (the existing wildcard pattern picks them up automatically — no csproj change needed when adding a story).

### Frontmatter fields

```yaml
---
slug: my-story-slug                         # convention: equal the .md filename stem; if frontmatter slug differs, parser uses frontmatter (see Tech Debt)
title: Human Title
category: American Government               # must match a Question.Category value
subCategory: System of Government           # must match a Question.SubCategory value
questionIds: [15, 16, 17]                   # in-scope questions covered by the story body
orphanedQuestionIds:                        # in-scope questions NOT covered (with reason)
  - id: 20
    reason: "Specific Congress powers — covered by future Legislative-Branch story"
estReadMinutes: 4                           # optional; default = max(1, round(words/200))
readingLevelMin: 70                         # optional; default = 70 (Flesch Reading Ease floor)
stateAwarePreamble: false                   # set true when the story includes Q23/Q29/Q61/Q62
---
```

### Body markup rules (all enforced by `StoryContentTests`; build fails on violation)

1. **Paragraph-level citation** — every body paragraph must contain at least one `[N]` citation marker, OR be preceded by an explicit `<!-- model-memory -->` HTML comment (signals "drafted from model memory; verify before test day"), OR be preceded by `<!-- narrative -->` (signals an opening scene-setting hook). Headings and list-only paragraphs are exempt.
2. **Citation marker resolution** — every `[N]` must reference an `id: N` entry in `<slug>.sources.json`.
3. **Source uniqueness** — every `id` in `sources.json` must be unique (parser rejects duplicates).
4. **Source URL allowlist** — every `url` must be an absolute `http`/`https`/`mailto` URL. Other schemes (and relative URLs) are rejected at parse time.
5. **`StorySource.supportSnippet` is required and non-empty** — 1–3 sentences quoting or paraphrasing the supporting passage. **This is the layer that catches AI-fabricated citations** during human review: the reviewer can quickly check "did this snippet really come from the linked URL?" without re-reading the whole source.
6. **`Story.ModelMemoryUsed`** is computed by the parser from the presence of `<!-- model-memory -->` markers (whitespace-tolerant: `<!--model-memory-->` also counts). Renderer shows the disclosure block only when `true`.
7. **Readability lint** — Flesch Reading Ease score ≥ `readingLevelMin` (default 70 = "fairly easy English"). Higher = easier; this is the **Flesch Reading Ease** formula, NOT Flesch-Kincaid Grade Level.
8. **Coverage contract** — every Question whose `(Category, SubCategory)` matches a story's scope must be in that story's `QuestionIds` OR `OrphanedQuestionIds` (with a reason) OR claimed by some other story's `QuestionIds`. Multi-story membership is allowed and encouraged when a question fits multiple topics. The `GlobalCoverage_EveryQuestionIsClaimedByAtLeastOneStory` test is the hard global guarantee that no question is dropped.

### License posture

- **Wikipedia** content: paraphrased, attributed (CC-BY-SA). Don't copy-paste blocks.
- **`.gov` sources** (USCIS, archives.gov, loc.gov): public domain.
- **Educational nonprofits** (Bill of Rights Institute, Khan Academy, etc.): link out only — don't reproduce.

### Checklist for adding a story

- [ ] Pick `(Category, SubCategory)` and identify in-scope questions.
- [ ] Author `<slug>.md` body at Flesch Reading Ease ≥ 70 (default `readingLevelMin`).
- [ ] Author `<slug>.sources.json` with one entry per `[N]` marker, each carrying a non-empty `supportSnippet`.
- [ ] List every in-scope question in `QuestionIds` OR `OrphanedQuestionIds` (with reason).
- [ ] Run `dotnet test tests/api/NaturalizationPuzzle.Api.Tests.csproj` from repo root — `StoryContentTests` will catch any rule violation before commit.
- [ ] If the new story includes Q23/Q29/Q61/Q62 (state-specific), set `stateAwarePreamble: true` so `StoryPage` renders the user's state preamble.
- [ ] Update `useWarmUpCache.ts` `PILOT_STORY_SLUGS` const (or migrate to `listStories()`-based warm-up if the catalog grows beyond a handful).
- [ ] **Bump `stories-cache-vN`** in `vite.config.ts` for *any* change that affects what `/api/v1/stories*` returns: a new story added to the catalog (changes the index payload), a body/sources/`QuestionIds` change on an existing story, OR a change to the embedded question text/answers that a story returns. This is wider than "embedded question payload only" — adding a story is enough on its own.

## Known Issues / Tech Debt

- Playwright E2E tests require both .NET API and Vite dev server running (config handles auto-start)
- State seed data uses "Varies by district" for multi-district states — a future enhancement could let users specify their congressional district
- 3 House seats vacant in 119th Congress (CA-1, GA-14, NJ-11) — seeded as "Vacant", update when filled
- `GET /api/v1/representatives` (no subpath) silently returns the SPA `index.html` because the `MapGroup` defines only `/vacant`, `/{id}` (PUT), and `/reset` — request falls through to `MapFallbackToFile`. Latent (no client consumer) but surprising for anyone exploring the API. Tracked in **#72**.
- `RepresentativeService.UpdateRepresentativeAsync` writes to the in-container SQLite file, which has no persistent volume on Container Apps Consumption. Edits are silently lost when the replica scales to zero (~5 min idle). Tracked in **#73** with three resolution options (persist, deprecate the endpoint, or move source-of-truth client-side).
- `src/client/package.json` has no `engines.node` field, so `npm install` doesn't enforce Node 20.19+ even though `@vitejs/plugin-react@5.x` requires it. README also says "Node.js 20+" which under-specifies the patch version. Tracked in **#70**.
- `StoryParser` does NOT enforce that the YAML frontmatter `slug` matches the `.md` filename stem — it falls back to the filename-derived slug when frontmatter `slug` is absent, but if both are present and differ, frontmatter wins silently. The Story Mode Authoring Guide treats matching as a convention; if a future story typos this, the URL `/stories/<filename-stem>` works but consumers reading `Story.Slug` see the frontmatter value. Low impact (the build still passes, the story still loads), but a small `StoryContentTests` assertion would close the footgun. Not yet ticketed.

## Azure Hosting Plan

### Decision: Azure Container Apps (Consumption Plan)

Containerized deployment chosen over App Service for cost efficiency, local validation, and revision-based deployments.

> **Correction**: The original plan proposed App Service B1 (~$13/mo) with deployment slots, but B1 does **not** support deployment slots — those require Standard S1 (~$73/mo). Container Apps provides equivalent functionality (revision-based blue/green) at lower cost.

### Architecture

```
Browser (PWA) ──HTTPS──▶ Azure Container Apps (Consumption)
                          ├─ .NET 10 Container
                          │   ├─ /api/v1/*  → Minimal API
                          │   ├─ /api/health → Health check
                          │   └─ /*         → React static files (wwwroot/)
                          └─ SQLite DB (seeded at startup, ephemeral)
```

**Local validation**: The same Docker image runs locally via `docker compose up` on port 8080, providing a pre-production validation gate without a cloud staging slot.

**Image registry**: GitHub Container Registry (GHCR) — free, integrated with GitHub Actions. No Azure Container Registry needed.

**Storage**: No persistent storage volume is currently provisioned. The SQLite database is mostly read-only seed data (128 questions, 50 states, 435 representatives) recreated identically on every container start via `EnsureCreatedAsync()`. **Caveat:** `RepresentativeService.UpdateRepresentativeAsync` does write back to the same in-container DB; those edits are silently lost on scale-to-zero. Tracked in **#73**.

### Azure Resources (all in `NaturalizationPuzzle` resource group)

| Resource | SKU | Cost |
|----------|-----|------|
| Container Apps Environment | Consumption (180K vCPU-s, 2M req free) | ~$0–5/mo |
| Application Insights | Free tier (5 GB/mo) | $0 |
| **Total** | | **~$0–5/mo** |

Cost is purely usage-based. **$0/mo when the app has no traffic** (scale-to-zero).

### Application Insights — Observability

Application Insights (free tier, 5 GB/mo ingest) provides production observability via the Azure Portal:

| Telemetry | What's Collected | Where to View |
|-----------|-----------------|---------------|
| **Requests** | HTTP requests (subject to trace sampling — see below) — duration, status code, URL, success/failure | Portal → Application Insights → Performance |
| **Failures** | Unhandled exceptions with full stack traces, error rates | Portal → Failures → drill into exception details |
| **Dependencies** | Outbound calls (SQLite queries via EF Core) — duration, success | Portal → Performance → Dependencies |
| **Traces / Logs** | ILogger output (structured logging with correlation IDs) | Portal → Transaction search, or Logs (KQL queries) |
| **Live Metrics** | Real-time request rate, failure rate, CPU/memory (1-second latency) | Portal → Live Metrics Stream |
| **Metrics** | CPU, memory, request count, response time, active containers | Portal → Metrics explorer, or pin to Dashboards |

**How to access**: Azure Portal → Resource Group `NaturalizationPuzzle` → Application Insights resource → choose a blade (Performance, Failures, Logs, Live Metrics). Use KQL queries in the Logs blade for custom analysis (e.g., `requests | where resultCode >= 500 | summarize count() by bin(timestamp, 1h)`).

**Trace sampling**: As of `Azure.Monitor.OpenTelemetry.AspNetCore` 1.5.0 (PR #69), the package's default sampler is `RateLimitedSampler` at **5 traces/sec** (changed from 100% sampling in 1.4.0). This app accepts the new default — np.metzger.dk runs scale-to-zero with sustained traffic well below 5 req/sec, so 100% of traces continue to be retained in practice and the rate limit better aligns with the App Insights free 5 GB/mo tier. To restore 100% sampling if traffic ever exceeds the limit, configure `UseAzureMonitor(o => { o.SamplingRatio = 1.0f; o.TracesPerSecond = null; })` in `Program.cs`.

### Production Performance Characteristics

Measured on np.metzger.dk during the 2026-05-04 cold-start investigation. Useful baseline for any future "the site feels slow" diagnosis — start by checking whether the user hit a cold replica before investigating anywhere else.

- **Scale-to-zero is by design.** Container App is configured `minReplicas: 0`, `maxReplicas: 2`, scale rule `http-concurrency: 50`. Replicas are reaped after the default Container Apps cooldown (~5 min idle).
- **Cold start ≈ 22 seconds before App Insights sees the request.** Breakdown for a fresh replica: image pull from GHCR (private; uses Container App secret) + .NET host start + `EnsureDatabaseSchemaAsync` running `EnsureCreatedAsync` (seeds 128 questions + 50 states + 435 reps into a fresh in-container SQLite file) + readiness probe pass. The user's HTTP request queues at the Container Apps front door for the entire duration; App Insights only records the request once the host is ready.
- **Warm-state TTFB is excellent** — `/api/health` ≈ 14–70 ms, `/api/v1/states` ≈ 50 ms, `/api/v1/questions` ≈ 70 ms (38 KB). First-hit JIT cost on `/api/health` is ~324 ms, then drops to <70 ms within seconds.
- **Mitigation chosen:** UI feedback via `SlowConnectionBanner` (PR #71) — when any API request exceeds 3 s, an animated amber banner with a pulsing dot, rotating civics-themed messages, and an elapsed-seconds counter appears at the top of the page. No warmup ping, no `minReplicas: 1` (deliberately keeping the $0/mo scale-to-zero budget). Pre-seeding the SQLite file at image build time would shave only ~3–5 s off the ~22 s cold start, so it's not currently worth the Dockerfile complexity.
- **Diagnosing a slow-load report:** check `az containerapp replica list -g rg-naturalizationpuzzle-prod -n ca-natpuzzle-prod` and compare the replica `createdTime` to the user's report timestamp. If they're within ~30 s of each other, it was a cold start.

### Implementation (Three Phases)

**Phase 1 — Local Container Setup** ✅ complete:
1. ✅ Add `/api/health` endpoint (API running, DB accessible, question count)
2. ✅ Configure .NET to serve React static files (`UseStaticFiles` + `MapFallbackToFile`)
3. ✅ Add `appsettings.Production.json` (production logging config)
4. ✅ Create multi-stage Dockerfile (node build → dotnet publish → aspnet runtime)
5. ✅ Create `docker-compose.yml` for local container testing
6. ✅ Create `.dockerignore`
7. ✅ Create `container-test.ps1` automated validation script
8. ✅ Create `container-start.bat` / `container-stop.bat` convenience scripts

**Phase 2 — GitHub CI/CD** ✅ complete:
1. ✅ Add Application Insights SDK to the .NET API (`Azure.Monitor.OpenTelemetry.AspNetCore`)
2. ✅ Create GitHub Actions CI/CD workflow (build → test → docker build → push to GHCR)
3. ✅ Cache warm-up hook (`useWarmUpCache`) — eagerly fetches all API endpoints on mount
4. ✅ Playwright offline E2E tests — 5 tests verifying study, quiz, navigation, banner offline
5. ✅ Manual offline validation steps documented in README
6. ✅ Update README and CONTEXT.md

**Phase 3 — Azure Deployment** ✅ complete:
1. ✅ Bicep templates in `infra/` (Log Analytics, App Insights workspace-based, Container Apps Environment, Container App with liveness/readiness/startup probes on `/api/health`, private GHCR pull via Container App secret).
2. ✅ Deployed to `westus2` in resource group `rg-naturalizationpuzzle-prod`. Default FQDN `https://ca-natpuzzle-prod.wittyisland-552f7b95.westus2.azurecontainerapps.io`; **custom domain `https://np.metzger.dk`** with Azure-managed TLS (env-level managed certificate `np-metzger-dk`, SNI binding, auto-renewing). DNS records (CNAME `np` + TXT `asuid.np`) hosted at one.com.
3. ✅ App Insights telemetry verified (requests, dependencies, probes flowing).
4. ✅ Pipeline gates added: `image-smoke-test` (runs container, curls health + endpoints) and `deploy-plan` (`az deployment sub what-if` printed in job summary).
5. ✅ `deploy-apply` job gated by GitHub `production` environment with `henrik-me` as required reviewer.
6. ✅ OIDC federated credentials for GitHub Actions (no long-lived secrets in the pipeline). AAD app `github-actions-NaturalizationPuzzle`.
7. ✅ One-click rollback via `.github/workflows/rollback.yml` (also gated by `production`).
8. ✅ Container Apps revision model provides automatic rollback: failed revisions never receive traffic.

**Phase 4 — Make Repository Public** ✅ complete:

Repository is public at https://github.com/henrik-me/NaturalizationPuzzle. Default branch renamed `master` → `main`.

Community health & legal:
1. ✅ `LICENSE` (MIT, © 2025 henrik-me)
2. ✅ `CODE_OF_CONDUCT.md` (Contributor Covenant v2.1)
3. ✅ `CONTRIBUTING.md` (setup, tests, Conventional Commits, Co-authored-by trailer, PR process)
4. ✅ `SECURITY.md` (private vulnerability reporting via GitHub Security tab)

GitHub templates & automation:
5. ✅ `.github/ISSUE_TEMPLATE/{bug_report,feature_request,config}.yml` — blank issues disabled
6. ✅ `.github/PULL_REQUEST_TEMPLATE.md`
7. ✅ `.github/dependabot.yml` — weekly npm / nuget / github-actions / docker, grouped minor+patch
8. ✅ `.github/CODEOWNERS` — `@henrik-me` default reviewer

CI hardening & code scanning:
9. ✅ `.github/workflows/codeql.yml` — CodeQL for `csharp` + `javascript-typescript`
10. ✅ `ci-cd.yml` — `concurrency` group cancels superseded runs

README polish:
11. ✅ Badges (CI/CD, CodeQL, License, .NET 10, Node 22)
12. ✅ Content Attribution (USCIS = U.S. federal public domain, 17 U.S.C. § 105)
13. ✅ Links to LICENSE / CONTRIBUTING / SECURITY / CODE_OF_CONDUCT

Verification:
14. ✅ `gitleaks detect` on full history — clean (exit 0)
15. ✅ CI green on `main` (Build & Test, CodeQL csharp, CodeQL js/ts)

Repo settings (configured via `gh api`):
16. ✅ Visibility: **public**
17. ✅ Description + topics (`uscis`, `civics`, `naturalization`, `pwa`, `offline-first`, `dotnet`, `react`, `typescript`)
18. ✅ Wiki + Projects disabled (reduce surface area)
19. ✅ Secret scanning + push protection enabled
20. ✅ Dependabot alerts + automated security updates enabled
21. ✅ Private vulnerability reporting enabled
22. ✅ Default `GITHUB_TOKEN` workflow permissions: **read-only**
23. ✅ "Allow Actions to create and approve PRs": **off**
24. ✅ Branch ruleset `main-protection` on `~DEFAULT_BRANCH`: require PR + 1 approval, dismiss stale, require code-owner review, require status checks (Build & Test, Analyze csharp, Analyze javascript-typescript), require linear history, block force push and deletion. Bypass: Repository admin role.
25. ✅ Tag ruleset `release-tag-protection` on `refs/tags/v*` and `refs/tags/release-*`: block create/update/delete. Bypass: Repository admin role.

Deferred / handled outside Phase 4:
Deferred / handled outside Phase 4:
- **GHCR package visibility** — intentionally kept **private**. Container App pulls the image using a GHCR PAT stored as the `GHCR_PULL_TOKEN` secret on the `production` GitHub environment, flowed through Bicep as a `@secure()` parameter into a Container App secret.
- **Fork PR workflow approval ("require approval for all outside collaborators")** — **not available for personal-account repositories.** This UI toggle and the matching `actions/permissions/fork-pr-workflows` API endpoint exist only for organization-owned repos and enterprise accounts. Personal repos get a fixed GitHub default: workflow runs from **first-time contributors** require manual approval; subsequent runs from the same contributor are auto-approved. To get the explicit "approve all outside collaborator runs" toggle, the repo would need to be transferred to a (free) GitHub Organization. Residual risk on this personal repo is mitigated by:
  - Default `GITHUB_TOKEN` workflow permissions = read-only (no write tokens leak to fork PRs).
  - "Allow Actions to create and approve pull requests" = off (a fork PR cannot self-approve).
  - Branch ruleset on `main` requires PR + approval + status checks (a fork PR cannot land code without admin sign-off).
  - Concurrency group on CI cancels superseded fork-PR runs.

## Next Steps

1. ~~**Containerized local deployment** (Phase 1)~~ ✅ complete
2. ~~**GitHub CI/CD** (Phase 2)~~ ✅ complete
3. ~~**Azure Container Apps deployment** (Phase 3)~~ ✅ complete
4. ~~**Make repository public** (Phase 4)~~ ✅ complete
5. ~~**Resolve 18 Dependabot security alerts** (Phase 5)~~ ✅ complete — merged as `002d823` via PR #24 on 2026-04-21. Bumped `vite` to 7.3.2 + added scoped npm override `@rollup/plugin-terser → serialize-javascript: 7.0.5`. All 18 alerts auto-closed (0 open / 24 fixed). Plan + diff both reviewed with GPT-5.4.
6. ~~**Resolve outstanding Dependabot version-bump PRs** (Phase 6)~~ ✅ complete — 3 merged PRs on 2026-04-21 closed 13 Dependabot PRs and hardened `dependabot.yml`:
   - **PR #31** (`a35923c`) — 5 GitHub Actions bumps: `checkout 4→6`, `setup-dotnet 4→5`, `docker/login 3→4`, `docker/metadata 5→6`, `docker/build-push 6→7` (#7 #8 #9 #10 #11).
   - **PR #32** (`e75a316`) — .NET test stack: `Microsoft.NET.Test.Sdk 17→18`, `xunit.v3 3.0→3.2.2`, EF Core + Mvc.Testing `10.0.3→10.0.7`, `AspNetCore.OpenApi` RC→10.0.7 stable (#21 #23; #25 auto-closed as subset).
   - **PR #33** (`0cf3aa2`) — client devDeps: `eslint 9→10`, `jsdom 28→29`, `globals 16→17`, `eslint-plugin-react-hooks 7.0→7.1.1` (requires added `react-hooks/use-memo` suppression in `useFetch.ts`), plus react 19.2.5 patch + minor-patch group (#26 #27 #28 #29 #30).
   - **Blocked bumps**: Vite 8 (blocked by `@tailwindcss/vite` peer range ^5‖^6‖^7) and Node 25-alpine (non-LTS). Both ignored in `.github/dependabot.yml` (commit `9784380`) — #12 and #22 auto-closed.
   - **Validation technique**: for workflow-touching batches (#31, #32), push-only CI jobs (`docker-build-push`, `image-smoke-test`) were validated by temporarily adding the feature branch to `on.push.branches`, pushing, observing a green run, then dropping the TEMP commit before opening the PR. Deploy jobs stayed guarded by `ref == main` and correctly skipped. For #33 (non-workflow-touching), standard PR CI plus local `npm ci`/build/lint/test served as authoritative validation.
   - All PRs received GPT-5.4 plan + diff reviews. As of 2026-04-21, 0 open Dependabot PRs and 0 open security alerts.
7. ~~**Add dark mode support** (Phase 7)~~ ✅ complete — three-way Light/Dark/System theme selector on the Settings page (`Appearance` section). Defaults to System (`prefers-color-scheme`). Implemented via a global `ThemeProvider` mounted at the app root, an inline FOUC-prevention script in `index.html` that applies the persisted theme synchronously before React mounts, Tailwind v4 `@custom-variant dark`, and runtime updates to `meta[name="theme-color"]` + `documentElement.style.colorScheme` so browser chrome and native form controls match. Persisted as `localStorage.themePreference`. Live system-preference changes propagate while in System mode. 16 new client tests added (10 `ThemeContext`, 6 `ThemeToggle`); client tests pass.
8. ~~**Category-based filtering on the Study Page**~~ ✅ complete — Study page now exposes Category, Subcategory, 65/20, and Studied/Unstudied filters that compose with the existing keyword search. Filters are session-only; subcategory options derive from the loaded data so they don't drift from the seed; progress bar denominator reflects the current filtered set. Added a stale-response cancel guard to the fetch effect (regression test included), kept the spinner local to the question card so filter UI stays reachable during reloads, and fixed `useWarmUpCache` to re-arm when `selectedStateId` transitions from null to a value (regression test included). New Vitest suite `StudyPage.test.tsx` (11 tests) covers all filter combinations, empty-intersection state, denominator semantics, and the stale-race; Playwright `study-flow.spec.ts` adds category and studied-status cases.
9. Add congressional district selector for multi-district states (currently shows all reps)
10. ~~**Add tests for StudyPage keyword search feature**~~ ✅ complete — covered by the new `StudyPage.test.tsx` introduced alongside the filter work in #8.
11. ~~**Tag-based study filters**~~ ✅ complete — adds `Question.Tags` (namespaced strings: `people:`, `wars:`, `documents:`, `timePeriod:`) on the API model and DTO with an EF Core JSON value converter and matching collection comparer; all 128 seed questions tagged per a strict policy (only what's named in the question text or canonical USCIS answer). New `TagFilterPanel` component groups chips by namespace; OR within a namespace, AND across; per-namespace Clear plus the shared Clear-filters reset. Tag options derive from the post-Studied pipeline so chips reflect realistically narrowable values; orphaned selections are reconciled in render via a memoized effective set. Schema upgrade is handled by a startup auto-recovery in `Program.cs` that drops the dev SQLite file when the `Tags` column is missing (data is read-only seed). Service-worker runtime cache for questions bumped to `questions-cache-v2`. Tests: API sentinel-set theory tests for every tag plus SQLite-backed converter round-trip; Vitest covers chip rendering, OR/AND composition, reconciliation, per-namespace Clear, and full reset; Playwright spec asserts `documents:Constitution` narrows to the 11-question sentinel set.

12. ~~**Collapsible 'More filters' disclosure**~~ ✅ complete (PR #61) — wraps tag-namespace chip groups in a button-controlled, collapsed-by-default disclosure with an aria-labelled count badge so the panel surfaces hidden active filters without taking permanent vertical space.

13. ~~**Additional tag namespaces (branches, amendments, civicConcepts)**~~ ✅ complete — extends the tag system from 4 to 7 namespaces. `branches:Legislative|Executive|Judicial` (40 questions tagged where the question is structurally about that branch); `amendments:Bill of Rights|10th|14th|15th|19th|24th|26th` (8 question-tag pairs across 7 distinct amendments, strict named-in-text or explicit-set rule); `civicConcepts:Rule of Law|Separation of Powers|Federalism|Civic Participation|Civil Rights` (9 questions, conservative scope). Schema unchanged (still `List<string>`). SW runtime cache for questions bumped to `questions-cache-v3` so deployed clients don't serve a stale cached response missing the new tags. New API sentinel-set theory tests cover every new tag value; `AllTagsAreNamespaced` allowlist updated; persistence test's empty-tags subject moved from Q15 (now tagged) to Q1.

14. ~~**Story Mode v1 (pilot)**~~ ✅ complete — adds 3 short cited narratives (one per USCIS category) that connect related questions into coherent explanations, ending in an embedded comprehension quiz. Pilot scope: `three-branches` (American Government / System of Government, 16 questions including the state-aware Q23 and Q29), `civil-war-and-reconstruction` (American History / The 1800s, 8 questions), `national-symbols-and-holidays` (Integrated Civics / Symbols and Holidays, 8 questions). Story content lives in `content/stories/*.md` + `*.sources.json`, ships as `<EmbeddedResource>` in the API assembly, and is parsed lazily by `StoryService` on first use — no SQL schema changes. Authoring rules enforced by `StoryParser` and `StoryContentTests`: paragraph-level `[N]` citations or explicit `<!-- model-memory -->` markers, every source has a non-empty `SupportSnippet` (the layer that catches AI-fabricated citations), Flesch Reading Ease ≥ per-story `readingLevelMin` (NOT the Flesch-Kincaid Grade Level formula despite the loose colloquial usage; higher = easier prose), **coverage contract** (every Question in the story's `(Category, SubCategory)` is either in `QuestionIds` or `OrphanedQuestionIds` with a reason — fails CI on silent omissions). Frontend ships `StoriesPage` (cards grouped by category, X-of-N progress) and `StoryPage` (state-personalized preamble for stories with `stateAwarePreamble`, body via narrow `StoryRenderer` with XSS guards — no `dangerouslySetInnerHTML`, link-protocol allowlist `http`/`https`/`mailto`, explicit Markdown subset; sources list with quoted support snippets; end-of-story comprehension quiz reusing `QuizCard`; model-memory disclosure only when flag is true). `useProgress` extended with `storiesRead: string[]` and a backward-compat migration that preserves old-shape `naturalizationProgress` instead of resetting it. PWA: `stories-cache-v1` runtime cache (StaleWhileRevalidate); `useWarmUpCache` warms the index plus every pilot detail (with `stateId` where set) so all pilots are fully readable offline after first visit. Navigation gained a 5th tab "Stories" between Quiz and History. Cache-versioning rule documented: bump `stories-cache-vN` for any story body / sources / `QuestionIds` / embedded-question change; bump `questions-cache-vN` independently for standalone `/api/v1/questions` payload changes.

### Story Mode — postponed work (deferred from v1, not yet ticketed)

15. ~~**Additional pilot stories**~~ ✅ complete — full Story Mode catalog now covers every USCIS seed question with at least one story claiming each. New stories added in this round: `principles-of-american-democracy` (AG/Principles); `executive-branch` / `legislative-branch` / `judicial-branch` / `federalism-and-states` (AG/SoG, splitting the System-of-Government subcategory across per-topic stories alongside the existing `three-branches` overview); `rights-and-responsibilities` (AG/Rights); `colonial-era-and-revolution` (AH/Colonial Period and Independence); `early-20th-century-and-world-wars`, `cold-war-era`, `civil-rights-movement`, and `modern-america` (AH/Recent American History, splitting that subcategory across multiple stories). The existing `civil-war-and-reconstruction` and `national-symbols-and-holidays` were extended to claim their previously-orphaned questions (Q90/Q91 and Q119/Q120 respectively). **Multi-membership policy**: a question that fits multiple topics is included in every relevant story (e.g. SoG questions appear in `three-branches` AND in their per-branch stories; Q98/Q99 appear in both `civil-war-and-reconstruction` and `civil-rights-movement`). New `GlobalCoverage_EveryQuestionIsClaimedByAtLeastOneStory` test is the hard guarantee that no Q is dropped; new `CoverageSummary_PrintsUsageCountPerQuestion` prints the histogram and the most-shared questions via `ITestOutputHelper`. `useWarmUpCache` switched from a hardcoded pilot-slug list to `listStories()`-driven fan-out (with bounded concurrency and stateId-only-for-state-aware-stories) so the catalog can grow without touching the hook. PWA `stories-cache-v1 → v2`.

16. **Story Mode v2 — engagement mechanics** (deferred from v1 to keep the pilot scope bounded):
    - **Inline "Quick check" mini-quizzes** inside the story body — 1–2 in-story checks with instant feedback, between paragraphs, before the end-of-story comprehension quiz. Likely needs a Markdown extension (e.g. `{{quickcheck:Q23}}`) and a renderer hook that swaps the marker for a `QuizCard` instance.
    - **Glossary popovers** for USCIS reading-vocabulary words ("Congress", "right", "amendment", …) — hover/tap a glossary word to see a one-sentence definition and mark it as known. Bridges Story Mode to the reading portion of the actual exam.
    - **Search/filter** on the Stories index (out of scope at 3 cards; revisit when the catalog passes ~10).
    - **Per-story 65/20 mode** — let the comprehension quiz follow the user's 65/20 preference instead of always running standard mode.
    - **Per-story analytics beyond local progress** (would need backend persistence — currently rejected by the "backend stays read-only" rule; revisit only if that rule changes).
    - **Audio narration / TTS** — out per the original issue scope, but logical extension once the writing mechanic exists.

17. **Story Mode v2 — full naturalization-interview support** (the wider goal beyond the 20-question civics oral, sketched in the v1 plan):
    - **Reading practice card** — surface USCIS reading-vocabulary sentences for the learner to read aloud. v1 idea: no STT, just self-rated easy/hard. Source: USCIS Reading Vocabulary List PDF (~80 words).
    - **Writing practice card** — show a sentence audibly (or as a prompt) and let the learner type it back. Source: USCIS Writing Vocabulary List PDF (~80 words).
    - **N-400 vocabulary primer** — plain-English explanations of the terms the officer uses ("oath of allegiance", "good moral character", "continuous residence"). Surfaced from Story #10-equivalent (Rights & Responsibilities) and Principles stories once those land.
    - These are out of scope for "civics test prep" but very much in scope for "naturalization interview prep" and complete the goal Story Mode was aimed at.

18. **Story Mode — UX risks to revisit if/when followed up**:
    - **Mobile nav at 5 tabs** — nav was widened from 4 to 5 columns at 375 px (~75 px per tab). v1 verified the existing `min-h-[44px] px-2` keeps the tap target at ≥ 44 px tall, and the longest label ("Settings", 8 chars) fits. If a 6th tab is ever added, fall back to a hamburger menu OR move "History" under "Settings".
    - **`react-markdown` footprint** — v1 deliberately ships a custom narrow renderer (`StoryRenderer.tsx`) instead of `react-markdown` to keep the JS bundle small AND to keep XSS posture explicit (no `dangerouslySetInnerHTML`, no plugin-allowlist debate). If a future story needs richer Markdown (tables, footnotes, embedded images) the trade-off may shift; before adopting `react-markdown` make sure the protocol allowlist + sanitizer still apply.

19. **Story comprehension quiz: optional "real-quiz" (typed-input) mode** — v1 always hands the user off to `QuizCard` in `mode='study'` (reveal-on-click) for the end-of-story comprehension check. Add a per-story toggle (or a Settings preference) that runs the comprehension quiz in `mode='quiz'` instead — typed-answer input, no answer reveal until the end, scored. The benefit: actually drills the user the way the real USCIS test does (typed-answer-equivalent of an oral response), but **scoped to the story's questions** rather than randomized from the full 128 — this is intentional (a study tool, not a substitute for the real test). **Implementation note: this is more than swapping a prop.** `QuizCard` in `mode='quiz'` only renders the input + a Submit button and calls `onSubmitAnswer`; grading and advancement happen in the parent (see how `QuizPage` does it: keeps a `quizState` of typed answers, calls `checkAnswer` from `answerChecker.ts` to grade each submission, advances `currentIndex`, computes pass/fail, and tracks the running score). The follow-up needs to add equivalent state to `StoryPage` (or the `ComprehensionQuiz` child component) and an `onSubmitAnswer` handler that does the grading. Decisions still open: (a) per-story toggle on `StoryPage` vs a Settings-level preference; (b) whether to record a `QuizHistoryEntry` in `naturalizationProgress.quizHistory` for these scoped runs, or keep that history limited to the full-pool quiz mode at `/quiz`. Tracker: not yet ticketed; this entry is the source of truth until a GitHub issue is opened.

## Resume Guide (read this first when picking up after a restart)

Session-only artifacts (e.g. `~/.copilot/session-state/<id>/plan.md`, the SQL todos table) **do not survive** a session restart. Everything you need to continue work is in the repository. Use this section as the entry point.

### Last completed work

The most recent feature is **Story Mode v1 (pilot)** — see Phase 14 in [Next Steps](#next-steps) for the full surface area, and the [Story Mode — Authoring Guide](#story-mode--authoring-guide) section for how to add a story.

Active state at the time of writing this guide:

- Story Mode v1 was merged via PR #74; the docs commits in this section follow it. CI is green on `main` at the time of writing.
- Production deploy follows the normal `production` GitHub-environment approval gate; check Actions for the latest run state if uncertain.

### Where the work that's still on the table lives

| What | Where |
|---|---|
| All deferred / postponed work | [Next Steps](#next-steps) — items 9 and 15–19 are open |
| Existing tech debt | [Known Issues / Tech Debt](#known-issues--tech-debt), plus tracked GitHub issues (#70, #72, #73) |
| How to add another Story Mode story | [Story Mode — Authoring Guide](#story-mode--authoring-guide) — file layout, frontmatter spec, the 8 enforced body-markup rules, license posture, and a per-story checklist |
| Project conventions, agent orchestration rules, review workflow | `.github/copilot-instructions.md` (single source of truth — keep that file authoritative) |

### How to spin up local dev

Two options, both documented in `README.md` → "Getting Started":

- **`start.bat`** (root) — opens two console windows for the API + Vite client. Browser opens to `https://localhost:5173`.
- **`servers.ps1 start` / `stop` / `status`** — same thing with explicit window-title tagging (`NatPuzzle-API`, `NatPuzzle-Client`) and persisted PIDs in `.servers/*.json`. Use this when you want the orchestrator to find/stop the right processes deterministically.

For container parity (closer to production): `container-start.bat` builds the multi-stage image and runs it on `http://localhost:8080`.

### How to validate before pushing

Per `.github/copilot-instructions.md` Pre-Push Verification:

```
# Frontend (from src/client/)
npm run lint && npm test -- --run && npm run build

# Backend (from REPO ROOT — not src/api/, that's the web project)
dotnet build && dotnet test

# E2E (from tests/e2e/) — --reporter=list is mandatory
npm ci                           # once per environment / fresh checkout
npx playwright install chromium  # once per environment
npx playwright test --reporter=list
```

### Picking up a deferred item

1. Read this section + the relevant Next Steps entry.
2. If it's a Story-Mode item: also read the Story Mode — Authoring Guide.
3. For non-trivial work, do a GPT-5.5 plan review **before** writing code (see Code Review section in `.github/copilot-instructions.md`).
4. Open a feature branch, commit, push, open PR, run the Copilot PR review loop until clean, then merge.
5. After merging, sync `main` and update the Next Steps entry to `~~strikethrough ✅ complete~~` with a one-line summary of what shipped.
