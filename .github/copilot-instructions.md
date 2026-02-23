# Copilot Instructions — NaturalizationPuzzle

## Project Overview

A web-based study app for the **2025 USCIS Naturalization Civics Test** (128-question pool). Users select their U.S. state to customize state-specific answers (e.g., governor, senators). The app supports **offline mode** so users can study without connectivity.

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + Vite + TypeScript |
| Styling | Tailwind CSS v4 |
| Offline/PWA | `vite-plugin-pwa` with Workbox |
| Backend API | .NET 9 Minimal APIs (C#) |
| Database | SQLite via Entity Framework Core |
| Testing | Vitest (frontend), xUnit (backend) |

### Solution Structure

```
NaturalizationPuzzle/
├── src/
│   ├── client/          # React 19 + Vite frontend
│   └── api/             # .NET 9 Minimal API backend
├── tests/
│   ├── client/          # Vitest frontend tests
│   └── api/             # xUnit backend tests
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
[React PWA] ──async fetch──▶ [.NET 9 Minimal API] ──async EF Core──▶ [SQLite]
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
- Always include the trailer: `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`

### Context File

Maintain a `CONTEXT.md` file in the repository root. This file captures:

- Current project status and what has been implemented
- Decisions made and their rationale
- Known issues and technical debt
- Next steps

Update `CONTEXT.md` whenever significant progress is made. This ensures any new session (human or AI) can quickly understand the current state.

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

- Users select their U.S. state on first launch (persisted to `localStorage` and synced to the backend when online).
- State-specific answers (e.g., governor name, U.S. senators) are dynamically inserted into relevant questions.
- The state selector must be accessible from settings at any time, not just first launch.

### Civics Test Domain

- The 2025 USCIS civics test has **128 questions** in the study pool.
- During the actual test: 20 questions asked, 12 correct to pass (stops at 12 correct or 9 wrong).
- The **65/20 rule**: applicants 65+ with 20+ years of permanent residency study only 20 designated questions, are asked 10, and need 6 correct.
- The app should support both standard and 65/20 study modes.
- Questions are categorized: American Government (principles, system, rights/responsibilities), American History, and Integrated Civics (geography, symbols, holidays).
