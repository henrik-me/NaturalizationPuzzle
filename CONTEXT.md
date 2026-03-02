# NaturalizationPuzzle — Project Context

## Current Status

Full-stack application scaffolded and building. Backend API is functional with seeded data and passing tests. Frontend builds with PWA support. Containerized deployment (Phase 1) complete — Dockerfile, docker-compose, and validation script ready for local testing. Phase 2 (Azure Container Apps deployment) is next.

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

### Backend (`src/api/`)
- .NET 10 Minimal API project with EF Core + SQLite
- Models: Question, Answer, UsState, QuizSession + record DTOs
- SeedData: all 128 USCIS 2025 civics questions with answers, categories, 65/20 designations
- RepresentativeSeedData: all 435 U.S. House Representatives (119th Congress) by state and district
- Models: Representative entity (Id, StateId, District, Name) for per-district House rep data
- Services: QuestionService (state-specific answer resolution with per-rep data), StateService, QuizService, RepresentativeService (vacant seat detection & update)
- Endpoints: versioned under `/api/v1/` — questions, states, quiz, representatives, health
- Program.cs: DI registration, CORS, static file serving, SPA fallback, auto-create DB on startup
- `appsettings.Production.json` — production logging configuration

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

### E2E Tests (`tests/e2e/`)
- Playwright with Chromium, Page Object Model pattern
- @axe-core/playwright for WCAG 2.1 AA automated accessibility checks
- SettingsPage/StudyPage/QuizPage page objects
- state-selection.spec.ts: 2 tests (select state, persistence)
- study-flow.spec.ts: 3 tests (display, reveal/advance, 65/20 filter)
- accessibility.spec.ts: 7 tests (settings, settings+state, study, study+answer, quiz start, quiz in-progress, quiz typed answer)

### Error Handling
- React ErrorBoundary wrapping Routes with user-friendly fallback
- .NET GlobalExceptionHandler middleware returning ProblemDetails (RFC 9457)
  with correlation IDs and structured logging

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
                          └─ Azure File Share
                              └─ naturalization.db (persistent)
```

**Local validation**: The same Docker image runs locally via `docker compose up` on port 8080, providing a pre-production validation gate without a cloud staging slot.

### Azure Resources (all in `NaturalizationPuzzle` resource group)

| Resource | SKU | Cost |
|----------|-----|------|
| Container Apps Environment | Consumption (180K vCPU-s, 2M req free) | ~$0–5/mo |
| Container Registry | Basic | ~$5/mo |
| Storage Account + File Share | Standard LRS | ~$1/mo |
| Application Insights | Free tier (5 GB/mo) | $0 |
| **Total** | | **~$6–11/mo** |

### Implementation (Two Phases)

**Phase 1 — Local Container Setup** ✅ complete:
1. ✅ Add `/api/health` endpoint (API running, DB accessible, question count)
2. ✅ Configure .NET to serve React static files (`UseStaticFiles` + `MapFallbackToFile`)
3. ✅ Add `appsettings.Production.json` (production logging config)
4. ✅ Create multi-stage Dockerfile (node build → dotnet publish → aspnet runtime)
5. ✅ Create `docker-compose.yml` for local container testing
6. ✅ Create `.dockerignore`
7. ✅ Create `container-test.ps1` automated validation script
8. Verify PWA caching works in container (requires Docker Desktop running)

**Phase 2 — Azure Deployment** (blocked on Phase 1):
1. Create Bicep templates (Container Apps Environment, ACR, File Share, App Insights)
2. Create GitHub Actions CI/CD workflow (build → test → docker build → push ACR → deploy revision → health check)
3. Configure custom domain + TLS ingress

## Next Steps

1. ~~**Containerized local deployment** (Phase 1)~~ ✅ complete
2. **Azure Container Apps deployment** (Phase 2) — ready to start
3. Add dark mode support
4. Add category-based filtering on the Study Page (API endpoint exists, not wired to UI)
5. Add congressional district selector for multi-district states (currently shows all reps)
6. Add tests for StudyPage keyword search feature
