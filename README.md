# NaturalizationPuzzle

[![CI/CD](https://github.com/henrik-me/NaturalizationPuzzle/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/henrik-me/NaturalizationPuzzle/actions/workflows/ci-cd.yml)
[![CodeQL](https://github.com/henrik-me/NaturalizationPuzzle/actions/workflows/codeql.yml/badge.svg)](https://github.com/henrik-me/NaturalizationPuzzle/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![.NET 10](https://img.shields.io/badge/.NET-10.0-512BD4?logo=dotnet)](https://dotnet.microsoft.com/)
[![Node 22](https://img.shields.io/badge/Node-22-339933?logo=node.js)](https://nodejs.org/)

A web-based study app for the **2025 USCIS Naturalization Civics Test** (128-question pool). Users select their U.S. state to get customized, state-specific answers (e.g., governor, senators). The app works **fully offline** after the first load.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Browser (PWA)                              │
│                                                                     │
│  ┌──────────────┐   ┌──────────────┐   ┌─────────────────────────┐ │
│  │  React 19    │   │  React Router│   │  Service Worker         │ │
│  │  + TypeScript│──▶│  (4 routes)  │   │  (Workbox / PWA)        │ │
│  │  + Tailwind  │   │  / /quiz     │   │  • precaches app shell  │ │
│  │    CSS v4    │   │    /history  │   │  • stale-while-revalidate│ │
│  │              │   │    /settings │   │    for /api/v1/*        │ │
│  └──────┬───────┘   └──────────────┘   │    for /api/v1/*        │ │
│         │                              └────────────┬────────────┘ │
│         ▼                                           │              │
│  ┌──────────────┐                                   │              │
│  │  API Client  │───────────────────────────────────┘              │
│  │  (services/) │                                                  │
│  └──────┬───────┘                                                  │
└─────────┼──────────────────────────────────────────────────────────┘
          │  HTTPS (fetch)
          │  Proxied in dev: /api → https://localhost:7075
          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    .NET 10 Minimal API                               │
│                                                                     │
│  ┌──────────────┐   ┌──────────────┐   ┌─────────────────────────┐ │
│  │  Endpoints   │   │  Services    │   │  Middleware              │ │
│  │  /questions  │──▶│  Question    │   │  • GlobalExceptionHandler│ │
│  │  /states     │   │  State       │   │  • CORS                 │ │
│  │  /quiz       │   │  Quiz        │   │  • OpenAPI              │ │
│  └──────────────┘   └──────┬───────┘   └─────────────────────────┘ │
│                            │                                        │
│                            ▼                                        │
│                     ┌──────────────┐                                │
│                     │  EF Core     │                                │
│                     │  DbContext   │                                │
│                     └──────┬───────┘                                │
│                            │                                        │
│                            ▼                                        │
│                     ┌──────────────┐                                │
│                     │   SQLite     │                                │
│                     │  (seeded     │                                │
│                     │  128 Q&As +  │                                │
│                     │  435 reps)   │                                │
│                     └──────────────┘                                │
└─────────────────────────────────────────────────────────────────────┘
```

## Getting Started

### Prerequisites

- [.NET 10 SDK](https://dotnet.microsoft.com/download)
- [Node.js 20+](https://nodejs.org/) with npm
- **HTTPS dev certificate** (one-time setup): `dotnet dev-certs https --trust`

### Quick Start (Recommended)

Run the startup script from the repository root — it launches both servers and opens the app in your default browser:

```bash
start.bat
```

Two console windows will open (one for the API, one for the frontend). Close them to stop the servers.

### Server Management Scripts

For more control, use the PowerShell-based server management scripts. These persist process state in `.servers/*.json` files and tag each server window with a title (`NatPuzzle-API` / `NatPuzzle-Client`) so services can be found even if the controlling terminal crashes.

```powershell
.\servers.ps1 start                 # Start both servers + open browser
.\servers.ps1 start -NoBrowser      # Start without opening browser
.\servers.ps1 start -Service api    # Start only the API
.\servers.ps1 stop                  # Stop all servers
.\servers.ps1 stop -Service client  # Stop only the frontend
.\servers.ps1 status                # Show server status, PIDs, and ports
```

Batch wrappers are also available for convenience:

```bash
servers-start.bat                   # Same as: .\servers.ps1 start
servers-stop.bat                    # Same as: .\servers.ps1 stop
servers-status.bat                  # Same as: .\servers.ps1 status
```

**Process recovery:** If the controlling terminal crashes, `servers.ps1` can still find running services using three discovery strategies (in order): state file PIDs → window title matching → port listener detection.

### Start the Backend API

```bash
cd src/api
dotnet restore
dotnet run --launch-profile https
```

The API starts at **https://localhost:7075** (with HTTP fallback at `http://localhost:5099`). The SQLite database is created and seeded automatically on first run.

### Start the Frontend

```bash
cd src/client
npm install
npm run dev
```

The dev server starts at **https://localhost:5173** and proxies `/api` requests to the backend. Your browser may show a certificate warning for the self-signed cert — accept it to proceed.

### Open the App

Navigate to **https://localhost:5173** in your browser. Both servers must be running.

---

## Backend API (`src/api/`)

### Architecture

```
src/api/
├── Program.cs              # App bootstrap, DI, middleware pipeline
├── Data/                   # EF Core DbContext & seed data
├── Logging/                # LogSanitizer (CWE-117 defense) & options
├── Models/                 # Entity models & record DTOs
├── Services/               # Business logic (Question, State, Quiz)
├── Endpoints/              # Minimal API route definitions
├── Middleware/              # GlobalExceptionHandler (ProblemDetails)
└── Properties/             # launchSettings.json
```

- **DI container** registers `QuestionService`, `StateService`, and `QuizService` as scoped.
- **EF Core + SQLite** with all 128 USCIS civics questions and 435 U.S. House Representatives (119th Congress) seeded on startup.
- **Global exception handler** returns RFC 9457 `ProblemDetails` with correlation IDs. By default it logs sanitized exception fields (type, message, stack trace) without the raw `Exception` object to prevent log forging (CWE-117). Set `Logging:Exceptions:IncludeRawException = true` to log the raw `Exception` for full structured exception telemetry on OpenTelemetry / Application Insights when debugging.
- **`LogSanitizer`** (`NaturalizationPuzzle.Api.Logging`) strips control characters (CR, LF, NEL, LS, PS, other C0/C1, DEL) and truncates user-controlled values before they enter log entries. Use `LogSanitizer.Clean(...)` or the `.ForLog()` extension on every log site that touches request input.
- **CORS** configured to allow the frontend origins (`https://localhost:5173` and `http://localhost:5173`).

### API Endpoints

All endpoints are versioned under `/api/v1/`.

#### Questions

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/questions` | Get all 128 questions. Optional `?stateId=` for state-specific answers. |
| `GET` | `/api/v1/questions/{id}` | Get a single question by ID. Optional `?stateId=`. |
| `GET` | `/api/v1/questions/category/{category}` | Filter questions by category. Optional `?stateId=`. |
| `GET` | `/api/v1/questions/6520` | Get the 20 designated 65/20 questions. Optional `?stateId=`. |

#### States

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/states` | Get all 50 U.S. states + territories. |
| `GET` | `/api/v1/states/{id}` | Get a single state by ID. |

#### Quiz

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/quiz/start` | Start a new quiz session. Body: `QuizStartRequest`. Returns `201` with session. |
| `GET` | `/api/v1/quiz/{sessionId}` | Get quiz session results by session ID. |

#### Representatives

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/representatives/vacant` | Get all vacant House seats. Optional `?stateId=` filter. |
| `PUT` | `/api/v1/representatives/{id}` | Update a representative's name. Body: `{ "name": "string" }`. |

### Running Backend Tests

```bash
cd tests/api
dotnet test                                                          # all tests
dotnet test --filter "FullyQualifiedName~QuestionServiceTests"       # single class
dotnet test --filter "DisplayName~Returns_questions_for_state"       # single test
```

---

## Frontend Client (`src/client/`)

### Architecture

```
src/client/
├── src/
│   ├── App.tsx             # Router & layout (ErrorBoundary, Nav, OfflineBanner)
│   ├── pages/              # Route-level views
│   │   ├── StudyPage.tsx   #   / — browse & study questions
│   │   ├── QuizPage.tsx    #   /quiz — timed quiz mode
│   │   ├── HistoryPage.tsx #   /history — quiz attempt history & stats
│   │   └── SettingsPage.tsx#   /settings — state selector & preferences
│   ├── components/         # Reusable UI (QuizCard, Navigation, StateSelector, etc.)
│   ├── services/           # API client layer (never call fetch from components)
│   │   ├── apiClient.ts    #   Generic apiGet/apiPost returning ApiResult<T>
│   │   ├── questionService.ts
│   │   ├── quizService.ts
│   │   └── stateService.ts
│   ├── context/            # React Context + useReducer (quiz state, preferences)
│   └── types/              # TypeScript interfaces & types
├── public/                 # Static assets & PWA icons
└── vite.config.ts          # Vite + React + Tailwind + PWA + proxy config
```

### Client Data Flow

```
  Component (page)
       │
       │ calls
       ▼
  Service Layer              ◄── apiClient.ts (apiGet / apiPost)
  (questionService, etc.)         returns ApiResult<T>
       │                          { success: true, data } | { success: false, error }
       │ fetch /api/v1/...
       ▼
  Vite Dev Proxy ──────────▶ .NET API (https://localhost:7075)
       │
       │ (offline)
       ▼
  Service Worker Cache
  (stale-while-revalidate)
```

### Routes

| Path | Page | Description |
|------|------|-------------|
| `/` | StudyPage | Browse and study all 128 civics questions, with keyword search and progress tracking |
| `/quiz` | QuizPage | Take a practice quiz with typed answers and real-time scoring |
| `/history` | HistoryPage | View all past quiz attempts with summary stats (pass rate, best score, streak) and clear history |
| `/settings` | SettingsPage | Select U.S. state, manage preferences |

### Quiz Mode

In quiz mode, the user types their answer for each question and submits it. **Answers are not revealed until the quiz is complete.** The quiz simulates the real USCIS test:

- **Standard**: 20 questions, 12 correct to pass. Stops early at 12 correct or 9 wrong.
- **65/20**: 10 questions, 6 correct to pass. Stops early at 6 correct or 5 wrong.

After completion, a detailed results screen shows each question with the user's answer, accepted answers, and a correct/incorrect indicator alongside a pass/fail verdict.

Answer checking uses case-insensitive, normalized fuzzy matching (substring + word overlap) to accommodate natural phrasing variations.

### Study Progress

The app tracks which questions you've studied and your quiz history in `localStorage`. The study page shows a progress bar indicating how many questions in the current set you've reviewed.

The **History page** (`/history`) shows all past quiz attempts in reverse chronological order with summary statistics: total quizzes taken, pass rate, best score, and current pass streak. Each entry shows the date, quiz mode (Standard/65/20), score, and pass/fail result. Users can clear their quiz history with a confirmation dialog (study progress is preserved).

A **keyword search box** lets you filter questions by typing words that appear in the question text, answers, category, or subcategory (e.g., "amendment", "president", "1776"). The search works with all-word matching, combines with the 65/20 filter, and operates entirely client-side. When no questions match, a clear-search prompt is shown.

### Dark Mode

The app supports **Light**, **Dark**, and **System** themes (default: System, which follows the OS `prefers-color-scheme`). The theme is selected from a 3-way segmented control on the **Settings** page under the *Appearance* section, persisted to `localStorage` as `themePreference`, and applied app-wide before React mounts (no flash of unstyled content). The `<meta name="theme-color">` tag and `color-scheme` CSS property are updated to match the resolved theme so browser chrome and native form controls render correctly. When the OS theme changes while the app is running in System mode, the UI updates live.

### Data Storage

All user data is stored **client-side only** in the browser's `localStorage`. The backend API is a read-only data source — it never stores per-user state.

| Data | Storage | Key | Details |
|------|---------|-----|---------|
| Selected state ID | `localStorage` | `selectedStateId` | Numeric ID of the user's chosen U.S. state. On page load, the app hydrates full state details (capital, governor, senators, representatives) from the API. |
| Study progress | `localStorage` | `naturalizationProgress` | Studied question IDs and quiz history (date, mode, score, pass/fail). |
| Theme preference | `localStorage` | `themePreference` | `'light'`, `'dark'`, or `'system'` (default). Drives the app-wide color theme. |
| State details (capital, governor, senators, reps) | Backend API | — | Read-only, fetched from `/api/v1/states/{id}`. Cached by the service worker for offline use. |
| Question data (128 questions) | Backend API | — | Read-only, fetched from `/api/v1/questions`. Cached by the service worker for offline use. |

> **No server-side sessions, cookies, or user accounts exist.** Clearing browser storage resets all user data.

### PWA & Offline

- **Service worker** (via `vite-plugin-pwa` + Workbox) precaches the app shell and static assets.
- **API responses** for questions and states are cached with a **stale-while-revalidate** strategy.
- A **cache warm-up hook** (`useWarmUpCache`) runs on app mount and eagerly fetches all API endpoints, ensuring offline readiness regardless of which page the user visits first.
- After the first load, the app is **fully functional offline** — all 128 questions, state data, and quiz functionality are available from cache.
- An **OfflineBanner** component shows when the network is unavailable.

#### Validating Offline Capabilities

**Automated (Playwright):**

```bash
cd tests/e2e
npx playwright test offline                    # run offline E2E tests
```

**Manual validation:**

1. Run `container-start.bat` (or `docker compose up -d`)
2. Open `http://localhost:8080` — browse any page (warm-up runs automatically)
3. Run `container-stop.bat` (or `docker compose down`)
4. Reload the browser — the app should still load and function fully
5. Verify: study questions display, quiz can start, navigation works, OfflineBanner shows
6. Check DevTools → Application → Service Workers → status is "activated"
7. Check DevTools → Application → Cache Storage → `questions-cache` and `states-cache` have entries

### Running Frontend Tests

```bash
cd src/client
npm run test                                                  # all tests
npx vitest run src/components/QuizCard.test.tsx                # single file
npx vitest -t "shows correct answer"                           # single test by name
```

### Linting

```bash
cd src/client
npm run lint
```

---

## E2E Tests (`tests/e2e/`)

End-to-end tests use **Playwright** with Chromium and the **Page Object Model** pattern.
Automated **WCAG 2.1 AA** accessibility checks are run via `@axe-core/playwright` on all critical flows.

```bash
cd tests/e2e
npx playwright test                  # run all E2E tests (29 tests)
npx playwright test accessibility    # run accessibility checks only
npx playwright test state-selection  # run a specific spec
```

> The Playwright config's `webServer` blocks auto-start the .NET API and Vite dev server — you do **not** need to start them manually.
>
> The repo pins `reporter: 'list'` in `playwright.config.ts`. Do not switch to the default `html` reporter for CI or agent runs — its built-in server holds port 9323 and blocks the process from exiting.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + Vite + TypeScript |
| Styling | Tailwind CSS v4 |
| Offline/PWA | `vite-plugin-pwa` with Workbox |
| Backend API | .NET 10 Minimal APIs (C#) |
| Database | SQLite via Entity Framework Core |
| Observability | Azure Monitor OpenTelemetry (Application Insights) |
| CI/CD | GitHub Actions → GHCR |
| Testing | Vitest (frontend), xUnit (backend) |
| E2E Testing | Playwright |

---

## Deployment Architecture

The app is containerized and deployed to **Azure Container Apps** (Consumption plan). The same Docker image used locally is what runs in production — local container testing serves as a pre-production validation gate.

### Local Container Deployment

Build and run the production image locally to validate before pushing to Azure. The container serves both the React SPA and .NET API from the same origin, exactly as in production.

```
  docker compose up
        │
        ▼
  ┌─────────────────────────────────────────┐
  │  Docker Container (same image as prod)  │
  │                                         │
  │  .NET 10 Runtime                        │
  │  ├─ Static files (wwwroot/) → React SPA │
  │  ├─ /api/v1/* → Minimal API             │
  │  ├─ /api/health → Health check          │
  │  └─ SQLite DB (volume mount)            │
  │                                         │
  │  Port 8080 → http://localhost:8080      │
  └─────────────────────────────────────────┘
```

#### Local Container Commands

Batch wrappers for quick start/stop:

```bash
container-start.bat                  # Build image, start container, run health checks
container-stop.bat                   # Stop container, verify port is free
```

Or use docker compose / individual commands directly:

```powershell
# Build the production image
docker build -t natpuzzle:local .

# Run with docker compose (volume mount for DB persistence)
docker compose up -d

# Verify health
curl http://localhost:8080/api/health

# Open in browser for manual testing
start http://localhost:8080

# View logs
docker compose logs -f

# Stop and clean up
docker compose down

# Full automated validation (build + start + health check + stop — tears down after)
.\container-test.ps1
```

### Production Architecture (Azure Container Apps)

```
  GitHub Actions
       │
       ▼
  ┌──────────┐     ┌───────────────┐     ┌──────────────────────────────────┐
  │ Build &  │────▶│ Push image to │────▶│ Azure Container Apps             │
  │ Test     │     │ GHCR          │     │ (Consumption plan)               │
  └──────────┘     └───────────────┘     │                                  │
                                         │  Revision N (active, 100%)       │
                                         │  ┌────────────────────────────┐  │
  Browser (PWA) ──HTTPS──────────────────▶  │  .NET 10 Container        │  │
                                         │  │  ├─ wwwroot/ (React SPA)  │  │
                                         │  │  ├─ /api/v1/* (API)       │  │
                                         │  │  └─ /api/health           │  │
                                         │  └────────────────────────────┘  │
                                         │                                  │
                                         │  SQLite (seeded at startup,      │
                                         │   ephemeral — read-only data)    │
                                         │                                  │
                                         │  Application Insights            │
                                         └──────────────────────────────────┘
```

**Image registry**: GitHub Container Registry (GHCR) — free, integrated with GitHub Actions. No Azure Container Registry (ACR) needed.

**Storage**: No persistent storage required. The SQLite database contains only read-only seed data (128 questions, 50 states, 435 representatives) and is recreated identically on every container start.

**Request routing**: Container Apps ingress terminates TLS and forwards requests to the container on port 8080. Requests to `/api/*` are handled by the .NET Minimal API. All other requests fall through to the React SPA via `MapFallbackToFile("index.html")`, enabling client-side routing.

**Revision-based deployments**: Each deploy creates a new revision. Traffic can be split between revisions for blue/green validation, and previous revisions can be instantly reactivated for rollback.

### CI/CD Pipeline

The pipeline is implemented in `.github/workflows/ci-cd.yml`:

```
  Push to master                Pull Request
       │                             │
       ▼                             ▼
  ┌─────────────────┐          ┌─────────────────┐
  │ Build & Test     │          │ Build & Test     │  ← PR validation only
  │                  │          │                  │
  │ • dotnet build   │          │ (same steps)     │
  │ • dotnet test    │          └─────────────────┘
  │ • npm lint       │
  │ • npm build      │
  │ • npm test       │
  └────────┬─────────┘
           │
           ▼
  ┌─────────────────────┐     ┌─────────────────────────┐
  │ Docker Build & Push │────▶│ Image Smoke Test        │
  │                     │     │                         │
  │ • Build image       │     │ • docker run image      │
  │ • Push to GHCR      │     │ • curl /api/health      │
  │ • Tags: SHA, latest │     │ • assert 128 questions  │
  └─────────────────────┘     │ • curl /api/v1/states   │
                              └────────────┬────────────┘
                                           │
                                           ▼
                              ┌─────────────────────────┐
                              │ Deploy Plan (what-if)   │  ← Surfaces infra
                              │                         │     diff in job log
                              │ az deployment           │
                              │   sub what-if           │
                              └────────────┬────────────┘
                                           │
                              ╔════════════▼════════════╗
                              ║  🛑 MANUAL APPROVAL      ║  ← `production` env
                              ║   (henrik-me only)       ║     required reviewer
                              ╚════════════╤════════════╝
                                           │
                                           ▼
                              ┌─────────────────────────┐
                              │ Deploy Apply            │
                              │                         │
                              │ • az deployment         │
                              │     sub create (Bicep)  │
                              │ • az containerapp       │
                              │     update --image SHA  │
                              │ • Wait for healthy      │
                              │     revision            │
                              │ • Smoke-test FQDN       │
                              │                         │
                              │ On failure: old         │
                              │ revision keeps traffic  │
                              │ (auto rollback via      │
                              │ liveness probes)        │
                              └─────────────────────────┘
```

### Hosting Decision

Three options were evaluated. **Azure Container Apps** was chosen for its cost efficiency, local validation story, and revision-based deployments.

| | App Service S1 | App Service B1 | Container Apps ⭐ |
|---|---|---|---|
| **Monthly cost** | ~$73 | ~$13 | ~$0–5 |
| **Staging/pre-prod** | ✅ Deployment slots | ❌ Not available on B1 | ✅ Local Docker + revision-based |
| **Zero-downtime deploy** | ✅ Slot swap | ❌ Brief restart | ✅ Revision traffic split |
| **Instant rollback** | ✅ Re-swap | ❌ Redeploy ~2-3 min | ✅ Reactivate old revision |
| **Local validation** | ❌ Different runtime | ❌ Different runtime | ✅ Same container image |
| **Cold starts** | None | None | ⚠️ 2-5s from scale-to-zero |
| **Scale to zero** | ❌ Always running | ❌ Always running | ✅ $0 when idle |
| **Custom domains + SSL** | ✅ | ✅ | ✅ (ingress config) |

> **Note**: App Service B1 does **not** support deployment slots — that requires Standard S1 (~$73/mo). Container Apps provides equivalent functionality (revision-based blue/green) at a fraction of the cost.

### Azure Resources

All resources in resource group `rg-naturalizationpuzzle-prod`:

| Resource | Name | SKU | Monthly Cost |
|----------|------|-----|-------------|
| Resource Group | `rg-naturalizationpuzzle-prod` | — | $0 |
| Log Analytics workspace | `log-natpuzzle-prod` | PerGB2018 (30-day retention) | included |
| Application Insights | `appi-natpuzzle-prod` | Workspace-based, free tier (5 GB/mo) | $0 |
| Container Apps Environment | `cae-natpuzzle-prod` | Consumption (180K vCPU-s, 2M req free) | ~$0–5 |
| Container App | `ca-natpuzzle-prod` | 0.5 vCPU / 1 GiB, min 0 / max 2 replicas | included |
| **Total** | | | **~$0–5/mo** |

Cost is purely usage-based. **$0/mo when the app has no traffic** (scale-to-zero). No container registry cost (GHCR is free). No storage cost (read-only seeded data, no persistence needed).

Infrastructure as code lives in `infra/` (Bicep modules), with `azure.yaml` enabling `azd up` for local provisioning.

### Azure Deployment

#### Production URL

**🌐 https://np.metzger.dk** — custom domain with Azure-managed TLS certificate (auto-renewing).

The default Azure FQDN also still works:
`https://ca-natpuzzle-prod.<env-suffix>.westus2.azurecontainerapps.io` (look up via `az containerapp show -n ca-natpuzzle-prod -g rg-naturalizationpuzzle-prod --query properties.configuration.ingress.fqdn -o tsv`).

#### Custom domain (`np.metzger.dk`)

DNS hosted at one.com (`metzger.dk` zone):

| Type | Host | Value |
|---|---|---|
| CNAME | `np` | `<container-app-fqdn>` |
| TXT | `asuid.np` | Container App's `customDomainVerificationId` |

Hostname binding + free managed certificate are provisioned in Azure (env-level `np-metzger-dk` managed cert, SNI binding on the Container App). The cert auto-renews; nothing to maintain.

#### Deploy a new version

Just push to `main`. The pipeline:
1. Builds and tests the code.
2. Builds the Docker image and pushes to GHCR (private package).
3. Smoke-tests the image (runs the container, curls `/api/health` and key endpoints).
4. Runs `az deployment sub what-if` and prints the planned infra diff.
5. **Pauses for your approval** in the Actions UI (the `production` environment requires `henrik-me` to approve).
6. After approval: applies the Bicep deployment, updates the Container App image, waits for the new revision to become healthy, smoke-tests the live FQDN.

If the new revision fails liveness/readiness probes, Container Apps **automatically keeps the previous revision serving traffic** (zero user impact).

#### Rollback

For bugs that pass health checks but are still wrong, run the rollback workflow from the Actions UI:

1. Go to **Actions → Rollback Container App → Run workflow**.
2. Provide the target revision name (find it via Azure Portal → Container App → Revision management, or `az containerapp revision list -n ca-natpuzzle-prod -g rg-naturalizationpuzzle-prod -o table`).
3. Approve when prompted (same `production` gate).

The workflow activates the chosen revision and routes 100% of traffic to it. Old images stay in GHCR indefinitely, so any past revision can be reactivated.

Equivalent manual commands:

```powershell
az containerapp revision list -n ca-natpuzzle-prod -g rg-naturalizationpuzzle-prod -o table
az containerapp revision activate   -n ca-natpuzzle-prod -g rg-naturalizationpuzzle-prod --revision <prev>
az containerapp ingress traffic set -n ca-natpuzzle-prod -g rg-naturalizationpuzzle-prod --revision-weight <prev>=100
```

#### One-time setup (already done)

This is documented for future reference. None of these need to be re-run for normal operation.

| Item | How |
|---|---|
| Resource group + all infra | `az deployment sub create --location westus2 --template-file infra/main.bicep --parameters infra/main.parameters.json --parameters ghcrPullToken=<pat>` |
| GHCR PAT (private image pull) | Classic PAT with only `read:packages` scope, stored as the `GHCR_PULL_TOKEN` secret on the `production` GitHub environment. **Rotate before its 1-year expiry.** |
| GitHub Environment `production` | Created via `gh api PUT /repos/.../environments/production` with `henrik-me` as required reviewer and `master` branch policy. |
| Azure OIDC for GitHub Actions | AAD app `github-actions-NaturalizationPuzzle` with two federated credentials: `repo:henrik-me/NaturalizationPuzzle:environment:production` (for `deploy-apply` / `rollback`) and `repo:henrik-me/NaturalizationPuzzle:ref:refs/heads/master` (for `deploy-plan`). Contributor role on `rg-naturalizationpuzzle-prod`. |
| Repo / env variables | `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` (set at both repo and `production` env scope so plan job and apply job can both read them). |

### Application Insights — Observability

Application Insights (free tier, 5 GB/mo ingest) provides production observability:

| Telemetry | What's Collected | Where to View (Azure Portal) |
|-----------|-----------------|------------------------------|
| **Requests** | Every HTTP request — duration, status code, URL, success/failure | Application Insights → Performance |
| **Failures** | Unhandled exceptions with full stack traces, error rates | Application Insights → Failures |
| **Dependencies** | Outbound calls (SQLite/EF Core queries) — duration, success | Application Insights → Performance → Dependencies |
| **Traces / Logs** | `ILogger` output with structured logging and correlation IDs | Application Insights → Transaction search, or Logs (KQL) |
| **Live Metrics** | Real-time request rate, failure rate, CPU/memory (1s latency) | Application Insights → Live Metrics Stream |
| **Metrics** | CPU, memory, request count, response time, active containers | Application Insights → Metrics explorer |

**Access path**: Azure Portal → Resource Group `NaturalizationPuzzle` → Application Insights → choose a blade.

**Custom queries** via KQL in the Logs blade, e.g.:
```kusto
requests
| where resultCode >= 500
| summarize count() by bin(timestamp, 1h)
```

---

## Civics Test Domain

- **128 questions** in the 2025 USCIS civics test study pool.
- **Standard test**: 20 questions asked, 12 correct to pass (stops at 12 correct or 9 wrong).
- **65/20 rule**: applicants 65+ with 20+ years of residency study only 20 designated questions, are asked 10, and need 6 correct.
- **Categories**: American Government (principles, system, rights/responsibilities), American History, and Integrated Civics (geography, symbols, holidays).
- **State-specific answers**: governor, U.S. senators, U.S. House Representatives (all 435 by state/district), and capital are dynamically resolved based on the user's selected state.

---

## Content Attribution

The 2025 USCIS civics test questions and official answers are works of the U.S. federal government and are in the public domain under [17 U.S.C. § 105](https://www.law.cornell.edu/uscode/text/17/105). Source: [USCIS Citizenship Resource Center](https://www.uscis.gov/citizenship).

State-level data (governors, senators) and U.S. House Representatives (119th Congress) are sourced from public government records.

## Contributing

Contributions are welcome. Please read:

- [**CONTRIBUTING.md**](./CONTRIBUTING.md) — dev setup, test commands, coding conventions, commit discipline, PR process.
- [**CODE_OF_CONDUCT.md**](./CODE_OF_CONDUCT.md) — the Contributor Covenant we follow.
- [**SECURITY.md**](./SECURITY.md) — how to report a vulnerability privately.

## License

This project is licensed under the [MIT License](./LICENSE).
