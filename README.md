# NaturalizationPuzzle

[![CI/CD](https://github.com/henrik-me/NaturalizationPuzzle/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/henrik-me/NaturalizationPuzzle/actions/workflows/ci-cd.yml)
[![CodeQL](https://github.com/henrik-me/NaturalizationPuzzle/actions/workflows/codeql.yml/badge.svg)](https://github.com/henrik-me/NaturalizationPuzzle/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![.NET 10](https://img.shields.io/badge/.NET-10.0-512BD4?logo=dotnet)](https://dotnet.microsoft.com/)
[![Node 22](https://img.shields.io/badge/Node-22-339933?logo=node.js)](https://nodejs.org/)

A web-based study app for the **2025 USCIS Naturalization Civics Test** (128-question pool). Users select their U.S. state to get customized, state-specific answers (e.g., governor, senators). The app works **fully offline** after the first load.

## System Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                          Browser (PWA)                             │
│                                                                    │
│  ┌──────────────┐   ┌──────────────┐   ┌─────────────────────────┐ │
│  │  React 19    │   │  React Router│   │  Service Worker         │ │
│  │  + TypeScript│──▶│  (SPA routes;│   │  (Workbox / PWA)        │ │
│  │  + Tailwind  │   │   see Routes │   │  • precaches app shell  │ │
│  │    CSS v4    │   │   table)     │   │  • SWR for questions,   │ │
│  │              │   │              │   │    states, stories      │ │
│  └──────┬───────┘   └──────────────┘   └────────────┬────────────┘ │
│         │                                           │              │
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
│                    .NET 10 Minimal API                              │
│                                                                     │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────────────────┐ │
│  │  Endpoints   │   │  Services    │   │  Middleware              │ │
│  │  /questions  │──▶│  Question    │   │  • GlobalExceptionHandler│ │
│  │  /states     │   │  State       │   │  • CORS                  │ │
│  │  /quiz       │   │  Quiz        │   │  • Response Compression  │ │
│  └──────────────┘   └──────┬───────┘   │  • OpenAPI               │ │
│                            │           └──────────────────────────┘ │
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
- [Node.js `^22.19.19` or `^24.0.0`](https://nodejs.org/) with npm (enforced by `engines.node` in `src/client/package.json` and `engine-strict=true` in `src/client/.npmrc` — other majors, including 25+, fail `npm install`)
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
- **Response compression** (`Microsoft.AspNetCore.ResponseCompression`) with Brotli (preferred) and Gzip providers at `CompressionLevel.Fastest`. Configured `MimeTypes` cover `application/json` (the dominant payload) and `application/problem+json` (configured defensively so future problem-details responses are compressed automatically — note that `GlobalExceptionHandler` currently writes via `WriteAsJsonAsync`, which emits `application/json`, and no call sites use `Results.ValidationProblem` yet). `EnableForHttps = true` is intentional: payloads are public read-only civics data with no per-user secrets, so the CRIME/BREACH side-channel threat model does not apply.
- **EF Core read-path convention:** every read-only service method calls `.AsNoTracking()` before the terminal `ToListAsync` / `FirstOrDefaultAsync`. Mutation paths (e.g. `RepresentativeService` write operations) deliberately remain tracked.

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

#### Stories

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/stories` | List the available Story Mode stories with title, category, est. read time, reading-level, and question count. |
| `GET` | `/api/v1/stories/{slug}` | Get a story's full body (Markdown), citation sources, and the embedded comprehension-quiz questions, addressed by URL slug. Optional `?stateId=` resolves state-aware answers (e.g. *Who is one of your state's U.S. senators now?*). |

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
| `/` | StudyPage | Browse and study all 128 civics questions; filter by category, subcategory, 65/20 set, studied/unstudied status, and namespaced tag chips (people, wars, documents, time period); keyword search; progress tracking |
| `/quiz` | QuizPage | Take a practice quiz with typed answers and real-time scoring |
| `/stories` | StoriesPage | Browse the Story Mode catalog — short, cited narratives that connect related civics questions into a coherent explanation, grouped by USCIS category, with an *X of N* read-progress count |
| `/stories/:slug` | StoryPage | Read a single story (Markdown body, sources list with quoted support snippets), then choose between two comprehension-quiz modes: **Continue with Study** (reveal-on-click flashcards) or **Continue with Quiz** (typed answers with per-question feedback and a final score). State-aware stories show a personalized preamble with the user's senators/representatives. |
| `/history` | HistoryPage | View all past quiz attempts with summary stats (pass rate, best score, streak), plus a separate **Story Comprehension** section listing typed-mode story-quiz attempts (totals, per-story best score and attempt count, full chronological list with per-row delete + undo). |
| `/settings` | SettingsPage | Select U.S. state, manage preferences |

### Quiz Mode

In quiz mode, the user types their answer for each question and submits it. **Answers are not revealed until the quiz is complete.** The quiz simulates the real USCIS test:

- **Standard**: 20 questions, 12 correct to pass. Stops early at 12 correct or 9 wrong.
- **65/20**: 10 questions, 6 correct to pass. Stops early at 6 correct or 5 wrong.

After completion, a detailed results screen shows each question with the user's answer, accepted answers, and a correct/incorrect indicator alongside a pass/fail verdict.

Answer checking uses case-insensitive, normalized fuzzy matching (substring + word overlap) to accommodate natural phrasing variations.

### Study Progress

The app tracks which questions you've studied and your quiz history in `localStorage`. The study page shows a progress bar indicating how many questions in the current set you've reviewed.

The **History page** (`/history`) shows two independent histories:

- **All Attempts** — past `/quiz` attempts in reverse chronological order with summary statistics: total quizzes taken, pass rate, best score, and current pass streak. Each entry shows the date, quiz mode (Standard/65/20), score, and pass/fail result. Users can clear this history with a confirmation dialog (study progress is preserved).
- **Story Comprehension** (below All Attempts) — typed-mode story-quiz attempts. Three sub-sections: a **Stats** panel (total attempts, average score across attempts), a **Per Story** aggregation (each attempted story listed with its best score and attempt count, sorted by most-recent attempt), and a **Chronological** list of every typed-mode completion with a trailing × delete button that supports a ~7-second inline **Undo**. A separate "Clear story comprehension history" link clears only this section, leaving the All Attempts history untouched. The block is hidden entirely until the user has at least one typed-mode attempt. Reveal-on-click study walkthroughs of stories are not recorded here — only typed-mode completions produce a scored entry.

A **keyword search box** lets you filter questions by typing words that appear in the question text, answers, category, or subcategory (e.g., "amendment", "president", "1776"). The search works with all-word matching, combines with the other study filters, and operates entirely client-side. When no questions match, a *Clear filters* button is shown.

### Study Filters

The Study page exposes five composable filters on top of the keyword search:

- **Category** dropdown — *American Government*, *American History*, *Integrated Civics*, or all.
- **Subcategory** dropdown — dependent on the chosen category (e.g., *System of Government*, *The 1800s*, *Symbols and Holidays*); disabled when no category is selected.
- **65/20 toggle** — switch between all 128 questions and the 20 questions designated for the 65/20 rule.
- **Studied status** toggle — *All*, *Unstudied*, or *Studied* (uses `localStorage` study progress).
- **Tag chips** grouped by namespace — *People*, *Wars*, *Documents*, *Time period*, *Branches of government*, *Amendments*, and *Civic concepts* — hidden behind a collapsible **More filters** disclosure that is collapsed by default and shows a count badge when any tag is selected. Within a group chips combine with **OR** ("any of these"); across groups they combine with **AND** ("must match every active group"). Each group offers a per-group *Clear* link, and the master *Clear filters* button resets every dimension at once. Tag chip options are derived from the post-Studied set, so you only see chips that can realistically narrow the current view; selecting a chip that another filter later removes is reconciled silently (no orphan filters).

All filters compose. Filter state is session-only (not persisted). The progress bar's denominator reflects the *current filtered set* so it always tells you "how much of what you're looking at have you studied"; the global *N total studied* counter sits next to it.

### Story Mode

Story Mode adds short, cited narratives that connect related civics questions into a single explanation, then ends in an end-of-story comprehension quiz built from the actual USCIS questions for that area. The catalog covers every USCIS subcategory, with multi-membership where a question fits more than one topic — so every one of the 128 civics questions is claimed by at least one story. Examples include:

- **The Three Branches of Government** (American Government → System of Government) — covers the three-branch system including the state-aware Q23 (your state's senator) and Q29 (your U.S. representative). Sibling stories `executive-branch`, `legislative-branch`, `judicial-branch`, and `federalism-and-states` cover the per-branch detail questions.
- **The Civil War and Reconstruction** (American History → The 1800s) — Q90–Q99.
- **National Symbols and Holidays** (Integrated Civics → Symbols and Holidays) — Q119–Q128.

See `/stories` in the running app for the full catalog.

The end-of-story comprehension quiz offers two modes via a two-button chooser (no default — the user makes an explicit choice each time):

- **Continue with Study** — the original reveal-on-click flow; click to show the answer, then advance.
- **Continue with Quiz** — typed-answer drill scoped to the story's question set: the user types each answer, gets immediate per-question feedback (✓/✗ with the accepted answers), and walks through every question to a final "X out of N correct" results panel. There is no PASS/FAIL banner and no early stop — story comprehension is a study tool, not a USCIS-test simulation. Completing a typed-mode quiz appends a scored entry to the new **Story Comprehension** history on the History page (see *Study Progress* above) and marks the story as read.

Each story is authored as Markdown in `content/stories/<slug>.md` with a companion `<slug>.sources.json` carrying one entry per `[N]` citation marker, including a non-empty `supportSnippet` (the layer that catches AI-fabricated citations during human review). Stories ship as `<EmbeddedResource>` in the API assembly and are parsed lazily by `StoryService` on first use; no SQL schema changes were required.

The `StoryRenderer` component renders the body via a narrow custom Markdown renderer that does **not** use `dangerouslySetInnerHTML`, allowlists link protocols to `http`/`https`/`mailto`, and renders an explicit subset (paragraphs, h2/h3, lists, bold/italic, links, citation markers). XSS posture is covered by dedicated tests for `<script>` tags, event-handler attributes, and `javascript:` / `data:` / `vbscript:` URLs.

### Dark Mode

The app supports **Light**, **Dark**, and **System** themes (default: System, which follows the OS `prefers-color-scheme`). The theme is selected from a 3-way segmented control on the **Settings** page under the *Appearance* section, persisted to `localStorage` as `themePreference`, and applied app-wide before React mounts (no flash of unstyled content). The `<meta name="theme-color">` tag and `color-scheme` CSS property are updated to match the resolved theme so browser chrome and native form controls render correctly. When the OS theme changes while the app is running in System mode, the UI updates live.

### Data Storage

All user data is stored **client-side only** in the browser's `localStorage`. The backend API is a read-only data source — it never stores per-user state.

| Data | Storage | Key | Details |
|------|---------|-----|---------|
| Selected state ID | `localStorage` | `selectedStateId` | Numeric ID of the user's chosen U.S. state. On page load, the app hydrates full state details (capital, governor, senators, representatives) from the API. |
| Study progress | `localStorage` | `naturalizationProgress` | Studied question IDs, `/quiz` history (date, mode, score, pass/fail), `storiesRead` (slugs of completed Story Mode stories — either mode counts), and `storyQuizHistory` (typed-mode story-quiz attempts: id, date, story slug + title, correct, total — surfaced on the History page in the *Story Comprehension* section, kept separate from `/quiz` history so the two summary-stats blocks stay independent). |
| Theme preference | `localStorage` | `themePreference` | `'light'`, `'dark'`, or `'system'` (default). Drives the app-wide color theme. |
| State details (capital, governor, senators, reps) | Backend API | — | Read-only, fetched from `/api/v1/states/{id}`. Cached by the service worker for offline use. |
| Question data (128 questions) | Backend API | — | Read-only, fetched from `/api/v1/questions`. Cached by the service worker for offline use. |

> **No server-side sessions, cookies, or user accounts exist.** Clearing browser storage resets all user data.

### PWA & Offline

- **Service worker** (via `vite-plugin-pwa` + Workbox) precaches the app shell and static assets.
- **API responses** for questions, **states**, and **stories** are cached with a **stale-while-revalidate** strategy; app-shell assets (scripts, styles, images, fonts) use a **network-first** strategy with a short timeout fallback.
- A **cache warm-up hook** (`useWarmUpCache`) runs on app mount and eagerly fetches the cached endpoints — the full and 65/20 question lists, the states list, the user's selected state details, the stories index, and every story detail — so offline reload works regardless of which page the user visits first.
- After the first load, the app is **fully functional offline** — all 128 questions, state data, quiz functionality, and the full Story Mode catalog are available from cache.
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
7. Check DevTools → Application → Cache Storage → `questions-cache-v3`, `states-cache`, `stories-cache-v2`, and `app-assets` have entries

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

### Bundle Size

A `size-limit` gate runs in CI after `npm run build` to catch bundle-size regressions. To check locally:

```bash
cd src/client
npm run build && npm run size
```

Budgets (brotli-compressed, measured on `dist/assets/index-*.{js,css}`): **180 kB** initial JS, **40 kB** initial CSS. Bumping the budget should be a deliberate edit to `src/client/package.json` with a brief rationale in the PR description.

### Web Vitals (runtime)

The client subscribes to Core Web Vitals (`LCP`, `INP`, `CLS`, `FCP`, `TTFB`) via the `web-vitals` library in `src/client/src/perf/webVitals.ts`. Each measurement is logged to the browser console (`console.info`). The perf module itself guards on `typeof window`/`typeof document` so direct callers without browser globals (e.g. a Vitest case importing the module without jsdom) skip subscription instead of throwing; `main.tsx` itself still requires a browser because it mounts React on `document.getElementById('root')`. There is no remote telemetry sink yet — that's a follow-up tracked under issue #97 (Layer 1.5). For now, open the DevTools console to inspect live numbers locally.

### Lighthouse CI (synthetic)

A `lighthouse` GitHub Actions job runs three Lighthouse passes against `vite preview` on every non-docs PR and asserts these budgets (config: [`src/client/lighthouserc.json`](src/client/lighthouserc.json)):

| Metric | Threshold | Severity |
|---|---|---|
| `largest-contentful-paint` | ≤ 2500 ms | `error` (Google Core Web Vitals "good") |
| `cumulative-layout-shift` | ≤ 0.1 | `error` (Google Core Web Vitals "good") |
| `categories:performance` | ≥ 0.85 | `warn` (will tighten after ~10 baseline runs) |
| `categories:accessibility` | ≥ 0.9 | `error` (synthetic backstop to the axe-core e2e checks) |

`INP` is intentionally omitted — Lighthouse can't measure interaction latency without user actions. Reports for every run upload to the `lighthouse-reports` artifact (14-day retention).

To run locally (after `npm install` and `npm run build` in `src/client/`):

```bash
cd src/client
# Single source of truth for the preview port: change PREVIEW_PORT and
# both vite preview and lhci pick it up.
PREVIEW_PORT=4173
PREVIEW_URL="http://127.0.0.1:${PREVIEW_PORT}/"
# LHCI_DISABLE_HTTPS=1 turns off the basic-ssl plugin so vite preview
# serves plain HTTP — wait-on and lhci can then target http://... without
# self-signed-cert handling. Locally without it, vite preview serves HTTPS.
LHCI_DISABLE_HTTPS=1 npx vite preview --host 127.0.0.1 --port "${PREVIEW_PORT}" --strictPort &
PREVIEW_PID=$!
# Ensure the background preview is killed when this shell exits or you Ctrl+C.
trap 'kill $PREVIEW_PID 2>/dev/null' EXIT INT TERM
npx wait-on "${PREVIEW_URL}"
# The preview URL is passed on the lhci CLI (not in lighthouserc.json) so
# the port stays defined once at the top of this snippet.
npx lhci autorun --collect.url="${PREVIEW_URL}"
# Cleanup runs automatically via the trap above. If you ran the commands
# individually instead of as a script, kill the preview manually with
# `kill "$PREVIEW_PID"` (or `kill %+` for the current background job).
```

`wait-on` and `@lhci/cli` are both declared as `src/client/package.json` devDependencies with their exact resolved versions locked via `package-lock.json`, so after `npm ci` the `npx wait-on` / `npx lhci` invocations resolve the local installs (no network fetch at run time).

The CI workflow follows the same start-preview / wait-on / run-lhci sequence, with `LHCI_DISABLE_HTTPS=1` set on the step (lhci's built-in `startServerCommand` is intentionally not used because its ready-pattern matching is unreliable against `vite preview`'s non-tty stdout).

**Known limitation — synthetic-only measurement:** The CI run targets `vite preview` without a backing API, so the client's `useWarmUpCache()` warm-up calls (e.g. `/api/v1/questions`, `/api/v1/stories`) resolve to the SPA's `index.html`. Those failed warm-ups don't affect LCP (warm-up fires inside a `useEffect` after first paint) and the budgets pass, but the synthetic perf/TBT numbers are slightly more conservative than production. Tracked as [#106](https://github.com/henrik-me/NaturalizationPuzzle/issues/106); the longer-term plan is to lean on real-world Web Vitals from Layer 1.5 (production telemetry) as the primary perf signal.

### API performance benchmark (k6)

A `api-benchmark` GitHub Actions job runs a [k6](https://k6.io/) load benchmark against a locally-started Release-build API on every PR and `main` push. It hits the seven endpoints that the client warms up on startup (`/api/v1/questions`, `/api/v1/questions/65-20`, `/api/v1/questions?stateId=…`, `/api/v1/states`, `/api/v1/states/{id}`, `/api/v1/stories`, `/api/v1/stories/{slug}`) sequentially with 5 VUs × 30 s each, and uploads per-endpoint p50/p95/p99 + throughput + average compressed response size as the `api-bench-results` artifact (90-day retention).

The job is **advisory only** — no thresholds today, and it is intentionally not in any downstream `needs:`, so it cannot block merge or deploy. The full design (scenario model, why sequential, slug resolution, threshold population workflow) and the advisory → gating promotion path live in [`tests/perf/README.md`](tests/perf/README.md). Layer 2 of issue [#97](https://github.com/henrik-me/NaturalizationPuzzle/issues/97).

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

**Storage**: No persistent storage volume is currently provisioned. The SQLite database is mostly read-only seed data (128 questions, 50 states, 435 representatives) recreated identically on every container start. The `Representative` table has a write path (`UpdateRepresentativeAsync`) whose edits are lost on scale-to-zero — see CONTEXT.md and issue #73.

**Request routing**: Container Apps ingress terminates TLS and forwards requests to the container on port 8080. Requests to `/api/*` are handled by the .NET Minimal API. All other requests fall through to the React SPA via `MapFallbackToFile("index.html")`, enabling client-side routing.

**Revision-based deployments**: Each deploy creates a new revision. Traffic can be split between revisions for blue/green validation, and previous revisions can be instantly reactivated for rollback.

### CI/CD Pipeline

The pipeline is implemented in `.github/workflows/ci-cd.yml`:

```
  Push to main                  Pull Request
       │                             │
       ▼                             ▼
  ┌─────────────────┐          ┌─────────────────┐
  │ Build & Test     │          │ Build & Test     │  ← PR validation only
  │                  │          │                  │
  │ • dotnet build   │          │ (same steps)     │
  │ • dotnet test    │          └─────────────────┘
  │ • npm run lint   │
  │ • npm run build  │
  │ • npm run size   │
  │ • npm run test   │
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
| GitHub Environment `production` | Created via `gh api PUT /repos/.../environments/production` with `henrik-me` as required reviewer and `main` branch policy. |
| Azure OIDC for GitHub Actions | AAD app `github-actions-NaturalizationPuzzle` with two federated credentials: `repo:henrik-me/NaturalizationPuzzle:environment:production` (for `deploy-apply` / `rollback`) and `repo:henrik-me/NaturalizationPuzzle:ref:refs/heads/main` (for `deploy-plan`). Contributor role on `rg-naturalizationpuzzle-prod`. |
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
