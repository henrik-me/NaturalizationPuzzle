# NaturalizationPuzzle — Project Context

## Current Status

Full-stack application scaffolded and building. Backend API is functional with seeded data and passing tests. Frontend builds with PWA support. Ready for integration testing and end-to-end wiring.

## What Has Been Implemented

- `.github/copilot-instructions.md` — full project conventions and architecture guide
- `.vscode/mcp.json` — Playwright MCP server configuration
- `.gitignore` — covers .NET, Node, IDE, and OS artifacts
- `CONTEXT.md` — project context and decision log

### Backend (`src/api/`)
- .NET 10 Minimal API project with EF Core + SQLite
- Models: Question, Answer, UsState, QuizSession + record DTOs
- SeedData: all 128 USCIS 2025 civics questions with answers, categories, 65/20 designations
- Services: QuestionService (state-specific answer resolution), StateService, QuizService
- Endpoints: versioned under `/api/v1/` — questions, states, quiz
- Program.cs: DI registration, CORS, auto-create DB on startup

### Frontend (`src/client/`)
- React 19 + Vite + TypeScript (strict mode)
- Tailwind CSS v4 for styling
- PWA via vite-plugin-pwa with service worker and runtime caching
- React Router DOM (/, /quiz, /settings)
- AppContext with useReducer for state management
- Typed API client with ApiResult<T> union type
- Service layer: questionService, stateService, quizService
- Components: Navigation, OfflineBanner, StateSelector, QuizCard
- Pages: StudyPage, QuizPage, SettingsPage

### Tests (`tests/api/`)
- xUnit project with 10 passing tests
- QuestionServiceTests: 6 tests (CRUD, filtering, state resolution)
- QuizServiceTests: 4 tests (create, retrieve, modes)

### Tests (`src/client/` — co-located)
- Vitest with jsdom, @testing-library/react, @testing-library/user-event
- apiClient.test.ts: 5 tests (GET/POST success, error, network failure)
- QuizCard.test.tsx: 6 tests (render, 65/20 badge, reveal/next, category)
- OfflineBanner.test.tsx: 1 test (hidden when online)

### E2E Tests (`tests/e2e/`)
- Playwright with Chromium, Page Object Model pattern
- SettingsPage/StudyPage page objects
- state-selection.spec.ts: 2 tests (select state, persistence)
- study-flow.spec.ts: 3 tests (display, reveal/advance, 65/20 filter)

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

## Known Issues / Tech Debt

- Playwright E2E tests require both .NET API and Vite dev server running (config handles auto-start)
- State seed data uses "Varies by district" for multi-district states — a future enhancement could let users specify their congressional district
- No @axe-core/playwright integration yet for automated accessibility checks in E2E tests

## Next Steps

1. Add @axe-core/playwright for automated accessibility testing in E2E specs
2. Add user progress tracking (track which questions have been studied/answered)
3. Add quiz scoring with real-time pass/fail evaluation (stop at 12 correct or 9 wrong)
4. Add search/filter by keyword within questions
5. Add dark mode support
