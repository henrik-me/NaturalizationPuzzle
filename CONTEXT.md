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
- Models: Question, Answer, UsState, QuizSession + record DTOs
- SeedData: all 128 USCIS 2025 civics questions with answers, categories, 65/20 designations
- RepresentativeSeedData: all 435 U.S. House Representatives (119th Congress) by state and district
- Models: Representative entity (Id, StateId, District, Name) for per-district House rep data
- Services: QuestionService (state-specific answer resolution with per-rep data), StateService, QuizService, RepresentativeService (vacant seat detection & update)
- Endpoints: versioned under `/api/v1/` — questions, states, quiz, representatives, health
- Program.cs: DI registration, CORS, static file serving, SPA fallback, auto-create DB on startup, HTTPS redirect (dev only), Application Insights via OpenTelemetry (conditional)
- `appsettings.Production.json` — production logging configuration (includes Azure Monitor log levels)

### Frontend (`src/client/`)
- React 19 + Vite + TypeScript (strict mode)
- Tailwind CSS v4 for styling
- PWA via vite-plugin-pwa with service worker and runtime caching
- React Router DOM (/, /quiz, /history, /settings)
- AppContext with useReducer for state management (hydrates persisted state on load)
- Typed API client with ApiResult<T> union type
- Service layer: questionService, stateService, quizService
- Components: Navigation, OfflineBanner, StateSelector, QuizCard (study + quiz modes)
- Pages: StudyPage (with progress tracking and keyword search/filter), QuizPage (with scoring), HistoryPage (quiz attempt history with summary stats), SettingsPage
- Quiz mode: typed answer input, no answer reveal until results, auto-grading with fuzzy matching
- Quiz scoring: real-time pass/fail (12/20 standard, 6/10 for 65/20), early stop on pass/fail
- Progress tracking: localStorage-based tracking of studied questions and quiz history via useProgress hook
- Quiz history page: summary stats (total quizzes, pass rate, best score, current streak), reverse-chronological attempt list, clear history with confirmation
- Answer checking: case-insensitive normalized matching with substring and word-overlap strategies
- Cache warm-up: useWarmUpCache hook eagerly fetches all API endpoints on mount for offline readiness

### Tests (`tests/api/`)
- xUnit project with 30 passing tests
- QuestionServiceTests: 6 tests (CRUD, filtering, state resolution)
- QuizServiceTests: 4 tests (create, retrieve, modes)
- RepresentativeSeedDataTests: 12 tests (count=435, all states covered, no duplicate districts, unique IDs, non-empty names, at-large states, per-state counts)
- RepresentativeServiceTests: 8 tests (vacant seat detection, update, persistence, refetch validation, state-filtered queries)

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
- state-selection.spec.ts: 2 tests (select state, persistence)
- study-flow.spec.ts: 3 tests (display, reveal/advance, 65/20 filter)
- offline.spec.ts: 5 tests (study offline, answers offline, navigation offline, quiz load offline, offline banner)
- accessibility.spec.ts: 7 tests (settings, settings+state, study, study+answer, quiz start, quiz in-progress, quiz typed answer)

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

## Known Issues / Tech Debt

- Playwright E2E tests require both .NET API and Vite dev server running (config handles auto-start)
- State seed data uses "Varies by district" for multi-district states — a future enhancement could let users specify their congressional district
- 3 House seats vacant in 119th Congress (CA-1, GA-14, NJ-11) — seeded as "Vacant", update when filled

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

**Storage**: No persistent storage required. The SQLite database contains only read-only seed data (128 questions, 50 states, 435 representatives) and is recreated identically on every container start via `EnsureCreatedAsync()`.

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
