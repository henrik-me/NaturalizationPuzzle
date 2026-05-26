# Contributing to NaturalizationPuzzle

Thanks for your interest in contributing. This document explains how to set up the project, run tests, and submit changes.

## Prerequisites

- **.NET 10 SDK** (preview / RC). The API targets `net10.0`.
- **Node.js `^22.13.17` or `^24.0.0`** and npm (enforced by `engines.node` in `src/client/package.json` and `engine-strict=true` in `src/client/.npmrc`; other majors, including 25+, fail `npm install`).
- **Git** with a configured user name and email.
- Optional: Docker Desktop for container-based testing, PowerShell 7+ on non-Windows.

## Repository layout

```
src/client   React 19 + Vite + TypeScript frontend (PWA)
src/api      .NET 10 Minimal API + EF Core + SQLite
tests/api    xUnit tests for the API
tests/e2e    Playwright end-to-end tests
```

## Getting started

```bash
# Clone
git clone https://github.com/henrik-me/NaturalizationPuzzle.git
cd NaturalizationPuzzle

# Backend
cd src/api
dotnet restore
dotnet run            # starts API

# Frontend (new terminal)
cd src/client
npm ci
npm run dev           # starts Vite dev server
```

Or start both together on Windows:

```
servers-start.bat     # uses servers.ps1
```

## Running tests

**Backend (xUnit):**

```bash
# from repo root — discovers all test projects via the solution
dotnet test
```

The xUnit project lives in `tests/api/`; running `dotnet test` from `src/api/` would only target the API project and execute zero tests.

**Frontend (Vitest):**

```bash
cd src/client
npm test
npm run lint
```

**End-to-end (Playwright):** Requires both servers running.

```bash
cd tests/e2e
npx playwright install   # first time
npx playwright test
```

## Container validation

```
container-test.ps1       # build, start, health check, smoke test, cleanup
```

## Coding conventions

See `.github/copilot-instructions.md` for the full style guide. The key rules:

- **TypeScript** strict mode, no `any`, named exports, explicit return types.
- **C#** file-scoped namespaces, `record` for DTOs, nullable enabled, `CancellationToken` on all async methods, `Async` suffix.
- **Async everywhere** — never `.Result` or `.Wait()`; use EF Core async variants.
- **Dependency injection** — services, repositories, and `DbContext` registered in DI; use constructor injection.
- **Errors** — client returns `ApiResult<T>` union types; API uses `ProblemDetails` via the global exception handler.
- **Accessibility** — WCAG 2.1 AA; semantic HTML; `data-testid` selectors for E2E.

## Commit conventions

This project uses [Conventional Commits](https://www.conventionalcommits.org/) and enforces a **one-commit-per-change** rule. Keep functional changes and refactors in separate commits.

Prefixes: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`, `ci:`.

**Every commit must include the Copilot co-author trailer:**

```
Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
```

## Pull request process

1. Fork the repo and create a feature branch (`feat/short-description`).
2. Make your change as a focused, single-purpose commit (or a small logical series).
3. Run the full test suite locally (`dotnet test`, `npm test`, `npm run lint`).
4. Update `README.md` if behavior, setup, endpoints, or architecture changed.
5. Update `CONTEXT.md` to reflect the new state of the project.
6. Open a PR. CI must pass. At least one approving review is required.

The PR template has a checklist — please complete it.

## Reporting issues

Use the issue templates under **New issue** to file bugs or request features. For security vulnerabilities, see [SECURITY.md](./SECURITY.md).

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE).
