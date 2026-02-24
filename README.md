# NaturalizationPuzzle

A web-based study app for the **2025 USCIS Naturalization Civics Test** (128-question pool). Users select their U.S. state to get customized, state-specific answers (e.g., governor, senators). The app works **fully offline** after the first load.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Browser (PWA)                              │
│                                                                     │
│  ┌──────────────┐   ┌──────────────┐   ┌─────────────────────────┐ │
│  │  React 19    │   │  React Router│   │  Service Worker         │ │
│  │  + TypeScript│──▶│  (3 routes)  │   │  (Workbox / PWA)        │ │
│  │  + Tailwind  │   │  / /quiz     │   │  • precaches app shell  │ │
│  │    CSS v4    │   │    /settings │   │  • stale-while-revalidate│ │
│  └──────┬───────┘   └──────────────┘   │    for /api/v1/*        │ │
│         │                              └────────────┬────────────┘ │
│         ▼                                           │              │
│  ┌──────────────┐                                   │              │
│  │  API Client  │───────────────────────────────────┘              │
│  │  (services/) │                                                  │
│  └──────┬───────┘                                                  │
└─────────┼──────────────────────────────────────────────────────────┘
          │  HTTP (fetch)
          │  Proxied in dev: /api → localhost:5099
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

### Quick Start (Recommended)

Run the startup script from the repository root — it launches both servers and opens the app in your default browser:

```bash
start.bat
```

Two console windows will open (one for the API, one for the frontend). Close them to stop the servers.

### Start the Backend API

```bash
cd src/api
dotnet restore
dotnet run
```

The API starts at **http://localhost:5099**. The SQLite database is created and seeded automatically on first run.

### Start the Frontend

```bash
cd src/client
npm install
npm run dev
```

The dev server starts at **http://localhost:5173** and proxies `/api` requests to the backend.

### Open the App

Navigate to **http://localhost:5173** in your browser. Both servers must be running.

---

## Backend API (`src/api/`)

### Architecture

```
src/api/
├── Program.cs              # App bootstrap, DI, middleware pipeline
├── Data/                   # EF Core DbContext & seed data
├── Models/                 # Entity models & record DTOs
├── Services/               # Business logic (Question, State, Quiz)
├── Endpoints/              # Minimal API route definitions
├── Middleware/              # GlobalExceptionHandler (ProblemDetails)
└── Properties/             # launchSettings.json
```

- **DI container** registers `QuestionService`, `StateService`, and `QuizService` as scoped.
- **EF Core + SQLite** with all 128 USCIS civics questions and 435 U.S. House Representatives (119th Congress) seeded on startup.
- **Global exception handler** returns RFC 9457 `ProblemDetails` with correlation IDs.
- **CORS** configured to allow the frontend origin (`http://localhost:5173`).

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
  Vite Dev Proxy ──────────▶ .NET API (localhost:5099)
       │
       │ (offline)
       ▼
  Service Worker Cache
  (stale-while-revalidate)
```

### Routes

| Path | Page | Description |
|------|------|-------------|
| `/` | StudyPage | Browse and study all 128 civics questions, with progress tracking |
| `/quiz` | QuizPage | Take a practice quiz with typed answers and real-time scoring |
| `/settings` | SettingsPage | Select U.S. state, manage preferences |

### Quiz Mode

In quiz mode, the user types their answer for each question and submits it. **Answers are not revealed until the quiz is complete.** The quiz simulates the real USCIS test:

- **Standard**: 20 questions, 12 correct to pass. Stops early at 12 correct or 9 wrong.
- **65/20**: 10 questions, 6 correct to pass. Stops early at 6 correct or 5 wrong.

After completion, a detailed results screen shows each question with the user's answer, accepted answers, and a correct/incorrect indicator alongside a pass/fail verdict.

Answer checking uses case-insensitive, normalized fuzzy matching (substring + word overlap) to accommodate natural phrasing variations.

### Study Progress

The app tracks which questions you've studied and your quiz history in `localStorage`. The study page shows a progress bar indicating how many questions in the current set you've reviewed.

### PWA & Offline

- **Service worker** (via `vite-plugin-pwa` + Workbox) precaches the app shell and static assets.
- **API responses** for questions and states are cached with a **stale-while-revalidate** strategy.
- After the first load, the app is **fully functional offline** — all 128 questions are available from cache.
- An **OfflineBanner** component shows when the network is unavailable.

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
npx playwright test                        # run all E2E tests (12 tests)
npx playwright test accessibility          # run accessibility checks only
npx playwright test state-selection        # run a specific spec
```

> Both the API and frontend dev server must be running for E2E tests.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + Vite + TypeScript |
| Styling | Tailwind CSS v4 |
| Offline/PWA | `vite-plugin-pwa` with Workbox |
| Backend API | .NET 10 Minimal APIs (C#) |
| Database | SQLite via Entity Framework Core |
| Testing | Vitest (frontend), xUnit (backend) |
| E2E Testing | Playwright |

---

## Civics Test Domain

- **128 questions** in the 2025 USCIS civics test study pool.
- **Standard test**: 20 questions asked, 12 correct to pass (stops at 12 correct or 9 wrong).
- **65/20 rule**: applicants 65+ with 20+ years of residency study only 20 designated questions, are asked 10, and need 6 correct.
- **Categories**: American Government (principles, system, rights/responsibilities), American History, and Integrated Civics (geography, symbols, holidays).
- **State-specific answers**: governor, U.S. senators, U.S. House Representatives (all 435 by state/district), and capital are dynamically resolved based on the user's selected state.
