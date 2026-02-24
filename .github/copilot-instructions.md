# Copilot Instructions — NaturalizationPuzzle

## Project Overview

A web-based study app for the **2025 USCIS Naturalization Civics Test** (128-question pool). Users select their U.S. state to customize state-specific answers (e.g., governor, senators). The app supports **offline mode** so users can study without connectivity.

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + Vite + TypeScript |
| Styling | Tailwind CSS v4 |
| Offline/PWA | `vite-plugin-pwa` with Workbox |
| Backend API | .NET 10 Minimal APIs (C#) |
| Database | SQLite via Entity Framework Core |
| Testing | Vitest (frontend), xUnit (backend) |
| E2E Testing | Playwright (via MCP server) |

### Solution Structure

```
NaturalizationPuzzle/
├── src/
│   ├── client/          # React 19 + Vite frontend
│   └── api/             # .NET 10 Minimal API backend
├── tests/
│   ├── client/          # Vitest frontend tests
│   ├── api/             # xUnit backend tests
│   └── e2e/             # Playwright E2E tests
└── .github/
```

## Build, Test & Lint

### Frontend (`src/client/`)

```bash
npm install                       # restore packages
npm run dev                       # dev server with HMR
npm run build                     # production build
npm run lint                      # ESLint
npm run test                      # full Vitest suite
npx vitest run src/components/QuizCard.test.tsx   # single test file
npx vitest -t "shows correct answer"              # single test by name
```

### Backend (`src/api/`)

```bash
dotnet restore                    # restore NuGet packages
dotnet build                      # compile
dotnet run                        # start API (Development)
dotnet test                       # full xUnit suite
dotnet test --filter "FullyQualifiedName~QuestionServiceTests"   # single test class
dotnet test --filter "DisplayName~Returns_questions_for_state"   # single test by name
```

## Architecture

### Data Flow

```
[React PWA] ──async fetch──▶ [.NET 10 Minimal API] ──async EF Core──▶ [SQLite]
     │                              │
     ▼                              ▼
[Service Worker Cache]        [DI Container]
  (offline fallback)         (services, repos)
```

### Frontend Architecture

- **Pages/views** live in `src/client/src/pages/`.
- **Reusable UI components** live in `src/client/src/components/`.
- **API calls** are centralized in `src/client/src/services/` — never call `fetch` directly from components.
- **State management** uses React Context + `useReducer` for quiz state and user preferences (selected state, progress).
- **Offline strategy**: the service worker (via `vite-plugin-pwa`) precaches the app shell and static assets. API responses for questions are cached with a **stale-while-revalidate** strategy so the full question set is available offline after first load.

### Backend Architecture

- **Endpoint definitions** are grouped in static extension method classes (e.g., `QuestionEndpoints.MapQuestionEndpoints(app)`), not inline in `Program.cs`.
- **Business logic** lives in service classes registered via DI, never in endpoint handlers directly.
- **Data access** uses the repository pattern over EF Core `DbContext`.
- The questions data (128 civics questions + state-specific answers) is seeded into SQLite via EF Core migrations.

## Key Conventions

### Git Workflow

- **Every change gets its own commit.** No batching unrelated changes.
- **Functional changes and refactoring are always separate commits.** A refactoring commit message must start with `refactor:`. This makes it easy to distinguish code changes that alter behavior from those that improve structure.
- Use [Conventional Commits](https://www.conventionalcommits.org/) prefixes: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`.
- **Every commit message must fully capture the change made.** The subject line summarizes the intent; the body (if needed) lists specifics so the change is understandable without reading the diff.
- Always include the trailer: `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`

### Context File

Maintain a `CONTEXT.md` file in the repository root. This file captures:

- Current project status and what has been implemented
- Decisions made and their rationale
- Known issues and technical debt
- Next steps

Update `CONTEXT.md` whenever significant progress is made. This ensures any new session (human or AI) can quickly understand the current state.

### README File

Maintain the `README.md` file in the repository root. The README is the public-facing entry point for the project and **must always reflect the current state of the system**. Treat it as a living document — every change to the codebase that affects how the system works, how it is used, or how it is structured must be accompanied by a corresponding README update.

**Usage information** — The README must document how to install, configure, and run both the backend API and frontend client. When startup commands, ports, environment variables, prerequisites, or configuration change, update the Getting Started section immediately.

**System architecture** — The README contains system diagrams showing how the frontend, backend, service worker, and database interact. When new services, middleware, endpoints, components, or data flows are added or modified, update the relevant architecture diagrams to match.

**API reference** — The README documents all API endpoints in tables (method, path, description). When endpoints are added, removed, renamed, or their parameters change, update the API Endpoints tables.

**Frontend routes & features** — The README lists all client-side routes and major features (PWA, offline, state selection). When pages are added/removed or routes change, update the Routes table and feature descriptions.

**Tech stack & dependencies** — When dependencies are added/upgraded or the tech stack changes, update the Tech Stack table.

**Test commands** — When test projects are added or test scripts change, update the test-running sections.

### Async Everywhere

- **Frontend**: All API calls use `async/await`. Service functions return `Promise<T>`. Components use async data fetching patterns (e.g., `useEffect` with async IIFE or a custom `useFetch` hook).
- **Backend**: All endpoint handlers are `async`. All EF Core calls use async variants (`ToListAsync`, `FirstOrDefaultAsync`, `SaveChangesAsync`). All service and repository interfaces define `Task<T>` return types. Never use `.Result` or `.Wait()`.

### Dependency Injection

- **Backend (.NET)**: All services, repositories, and the `DbContext` are registered in the DI container. Use constructor injection. Service lifetimes: `Scoped` for `DbContext` and request-scoped services, `Singleton` for configuration/caches, `Transient` for stateless utilities.
- **Frontend (React)**: Use React Context for dependency injection. Wrap service instances in context providers so components never instantiate services directly.

### TypeScript Rules

- **Strict mode enabled** (`"strict": true` in `tsconfig.json`).
- Use `interface` for object shapes, `type` for unions/intersections.
- No `any` — use `unknown` and narrow with type guards when the type is genuinely unknown.
- Prefer `const` over `let`; never use `var`.
- All functions must have explicit return types (except inline arrow callbacks).
- Use named exports, not default exports.
- Destructure props in component signatures.
- Use `readonly` for props and state interfaces.

### JavaScript / React Rules

- Functional components only — no class components.
- Custom hooks for any reusable logic (prefix with `use`).
- Memoize expensive computations with `useMemo` and callbacks with `useCallback` when passed as props.
- Keep components small — extract sub-components when a component exceeds ~80 lines.
- Co-locate test files next to their source files (e.g., `QuizCard.tsx` / `QuizCard.test.tsx`).

### C# / .NET Rules

- Use file-scoped namespaces.
- Use `record` types for DTOs and request/response models.
- Use primary constructors where appropriate.
- Nullable reference types enabled (`<Nullable>enable</Nullable>`).
- Prefer pattern matching (`is`, `switch` expressions) over type casting.
- Use `CancellationToken` in all async endpoint handlers and pass it through to EF Core calls.
- Name async methods with the `Async` suffix.
- Seal classes that are not designed for inheritance.

### ESLint & Formatting

- ESLint with `@typescript-eslint/recommended` and `react-hooks` plugin.
- Prettier for formatting (integrated with ESLint via `eslint-config-prettier`).
- Backend uses `.editorconfig` and `dotnet format` for consistent C# style.

### PWA / Offline

- The `vite-plugin-pwa` config lives in `vite.config.ts`. Use `registerType: 'autoUpdate'` so users always get the latest version.
- Precache the full question set JSON so study mode works completely offline.
- Show a clear offline indicator in the UI when the network is unavailable.
- The app must be fully functional offline after the first load — this is a core requirement, not a nice-to-have.

### State Selection

- Users select their U.S. state on first launch (persisted to `localStorage` — client-side only, never sent to the backend).
- On subsequent visits, the `AppProvider` hydrates the full state details (capital, governor, senators, representatives) from the API using the persisted state ID.
- State-specific answers (e.g., governor name, U.S. senators) are dynamically inserted into relevant questions.
- The state selector must be accessible from settings at any time, not just first launch.

### Client-Side State & Persistence

- **All user preferences and progress are stored exclusively in `localStorage`** — the backend is a read-only data source and never stores per-user state.
- `selectedStateId` — the user's chosen U.S. state (persisted in `localStorage`, hydrated from API on load).
- `naturalizationProgress` — study progress (studied question IDs) and quiz history (date, mode, score, pass/fail).
- No server-side sessions, cookies, or user accounts exist. Clearing browser storage resets all user data.

### Error Handling

**Frontend:**

- Wrap all `fetch` calls in try/catch. Service functions must never throw raw fetch errors to components — translate them into typed result objects (e.g., `{ success: true, data: T } | { success: false, error: string }`).
- Use an `ErrorBoundary` component at the route level to catch unexpected React render errors and show a user-friendly fallback.
- Display toast notifications for transient errors (network timeouts, 5xx) and inline messages for validation errors (4xx).
- When offline, suppress network errors silently and serve from cache — never show a network error if cached data is available.

**Backend (.NET):**

- Use a global exception handler middleware that catches unhandled exceptions, logs them, and returns a consistent `ProblemDetails` JSON response (RFC 9457).
- Endpoint handlers return `Results.Ok()`, `Results.NotFound()`, `Results.BadRequest()`, etc. — never throw exceptions for expected conditions (e.g., "question not found" is a 404, not an exception).
- Use `FluentValidation` or `DataAnnotations` for request validation. Return `Results.ValidationProblem()` with field-level error details.
- Log errors with structured logging (`ILogger<T>`) including correlation IDs for traceability.

### API Versioning

- Use **URL path versioning**: `/api/v1/questions`, `/api/v2/questions`.
- Version the API from the start — all endpoints live under `/api/v1/`.
- Group versioned endpoints using `MapGroup("/api/v1")` in the endpoint mapping extensions.
- When a breaking change is needed, add a new version group while keeping the old one functional until deprecated.
- The frontend API service layer references the version in a single constant (`API_BASE = '/api/v1'`) so version bumps are a one-line change.

### Accessibility (a11y)

- Target **WCAG 2.1 AA** compliance.
- All interactive elements must be keyboard-navigable. Quiz flows must be fully operable with Tab, Enter, Space, and arrow keys.
- Use semantic HTML elements (`<main>`, `<nav>`, `<section>`, `<button>`) — not `<div>` with click handlers.
- All images and icons require `alt` text or `aria-label`. Decorative icons use `aria-hidden="true"`.
- Form inputs must have associated `<label>` elements (not just placeholder text).
- Color must never be the sole indicator of state (e.g., correct/incorrect answers use icons + color + text).
- Maintain a minimum contrast ratio of 4.5:1 for normal text and 3:1 for large text.
- Quiz result announcements use `aria-live="polite"` regions so screen readers announce score changes.
- Run `axe-core` accessibility checks in Playwright E2E tests via `@axe-core/playwright`.

### Playwright E2E Testing

- The Playwright MCP server is configured in `.vscode/mcp.json` for AI-driven browser automation and test generation.
- E2E tests live in `tests/e2e/` and use the Page Object Model pattern.
- Test files are named `*.spec.ts` (e.g., `quiz-flow.spec.ts`, `state-selection.spec.ts`).
- Use stable selectors: `data-testid` attributes preferred over CSS classes or text content.
- All tests must pass in headless mode for CI compatibility.
- Include accessibility checks using `@axe-core/playwright` in critical user flows.

### Civics Test Domain

- The 2025 USCIS civics test has **128 questions** in the study pool.
- During the actual test: 20 questions asked, 12 correct to pass (stops at 12 correct or 9 wrong).
- The **65/20 rule**: applicants 65+ with 20+ years of permanent residency study only 20 designated questions, are asked 10, and need 6 correct.
- The app should support both standard and 65/20 study modes.
- Questions are categorized: American Government (principles, system, rights/responsibilities), American History, and Integrated Civics (geography, symbols, holidays).
