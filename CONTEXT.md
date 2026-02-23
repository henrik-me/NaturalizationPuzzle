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

- None yet — project is in initial setup phase.

## Next Steps

1. Add state seed data (all 50 states with governors, senators, capitals, representatives)
2. Set up Vitest for frontend unit tests
3. Set up Playwright for E2E tests
4. Add error boundary component
5. Add global exception handling middleware to API
