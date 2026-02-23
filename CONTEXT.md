# NaturalizationPuzzle — Project Context

## Current Status

Project initialized with repository structure, copilot instructions, and Playwright MCP configuration.

## What Has Been Implemented

- `.github/copilot-instructions.md` — full project conventions and architecture guide
- `.vscode/mcp.json` — Playwright MCP server configuration
- `.gitignore` — covers .NET, Node, IDE, and OS artifacts

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| React 19 + Vite | Most mature PWA/offline ecosystem for the frontend |
| .NET 9 Minimal APIs | Concise, modern, great for small-to-medium services |
| SQLite + EF Core | Simple file-based database, no external setup needed |
| Tailwind CSS v4 | Utility-first styling, fast prototyping |
| URL path API versioning (`/api/v1/`) | Simple, explicit, no header negotiation needed |
| Conventional Commits | Clear commit history, separate functional from refactoring changes |

## Known Issues / Tech Debt

- None yet — project is in initial setup phase.

## Next Steps

1. Initialize .NET 9 API project with EF Core + SQLite
2. Create data models and seed 128 civics questions
3. Build service layer and API endpoints
4. Initialize React frontend with Vite + TypeScript + Tailwind
5. Build UI components and wire up to API
6. Configure PWA offline support
7. Set up testing infrastructure
