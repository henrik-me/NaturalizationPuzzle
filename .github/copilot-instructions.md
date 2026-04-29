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

### Backend (`src/api/` for app commands, repo root for tests)

```bash
# From src/api/ — app commands
dotnet restore                    # restore NuGet packages
dotnet build                      # compile
dotnet run                        # start API (Development)

# From repo root — test commands (xUnit project lives in tests/api/, NOT src/api/)
dotnet test                                                            # full xUnit suite (resolves the test project via the .sln)
dotnet test tests/api/NaturalizationPuzzle.Api.Tests.csproj            # explicit test project
dotnet test --filter "FullyQualifiedName~QuestionServiceTests"         # single test class
dotnet test --filter "DisplayName~Returns_questions_for_state"         # single test by name
```

> **Note:** Running `dotnet test` from `src/api/` runs against the web app project and silently executes zero tests. Always run tests from the repo root (or pass the test project explicitly).

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

### Orchestration & Sub-Agents

The main agent acts as an **orchestrator** whose top priority is to remain responsive to the user. Long-running, investigative, or otherwise time-consuming work must be delegated to sub-agents whenever possible so the orchestrator stays free to plan, decide, and answer follow-up questions.

- **Default to delegation.** For any task that involves more than a few tool calls of investigation or execution, spin up a sub-agent (`explore`, `task`, `general-purpose`, or `code-review` — `rubber-duck` is an example of the `code-review` agent) instead of doing the work inline. Examples: codebase exploration across many files, running long test/build/lint commands, reviewing diffs or PRs, validating plans, batch refactors.
- **Prefer background mode** (`mode: "background"`) for sub-agents whose results you don't need before your very next step. End the turn after launching; the completion notification will bring you back. This keeps the user's terminal interactive.
- **Default to background even for "mandatory" reviews.** Sync sub-agent calls block the orchestrator from receiving user input until the agent returns. For the GPT-5.5 plan/diff reviews and other long-ish reviews, launch in **background**, end the turn, and resume from the completion notification. Only use `mode: "sync"` when (a) the agent is expected to return in well under 10 seconds, or (b) the orchestrator literally has nothing meaningful to do or say to the user until the result arrives. **A pending review is not a license to ignore the user.**

#### Model Selection for Sub-Agents

Always pass an explicit `model` argument when launching a non-`explore` sub-agent — never rely on the agent type's default model. Read-only `explore` agents are the only exception and may use the default fast model.

- **Code-review / rubber-duck reviews (plan reviews and final-diff reviews):** use `model: "gpt-5.5"`. This is the only model used for review work, including the local pre-push GPT-5.5 review and the GPT-5.5 plan review.
- **Code, test, and implementation-plan generation** (`general-purpose`, `task`, and any sub-agent that writes/edits source code, writes/runs tests, or produces an implementation plan for the orchestrator to execute): use `model: "claude-opus-4.7-1m-internal"` (Claude Opus 4.7, 1M context). The 1M-context window is required so the sub-agent can hold the full repository context it needs for non-trivial implementation and test work. Note: this covers *generating* implementation plans; *reviewing* a plan is still a code-review task and uses `gpt-5.5` per the bullet above.
- **Explore agents** doing read-only investigation may use the agent type's default fast model. If a specific exploration genuinely benefits from deeper reasoning, override to `claude-opus-4.7-1m-internal`.
- **Fallback when `claude-opus-4.7-1m-internal` is unavailable** (e.g., the sub-agent invocation errors with model-access denied, or an external contributor lacks access to the internal variant): substitute the strongest available high-reasoning Claude Opus model with the largest context window the environment offers (e.g., `claude-opus-4.7-high`, `claude-opus-4.7`, then `claude-opus-4.6`). State the substitution to the user in the same response that launches the sub-agent. If no Claude Opus model is available, ask the user how to proceed rather than silently falling back to a much weaker model.
- **Parallelize independent work.** Multiple `explore` or `code-review` agents can run concurrently — launch them in a single response when their scopes don't overlap.
- **Give complete context.** Sub-agents are stateless. Provide the full task, file paths, success criteria, constraints (e.g., "do not modify code", "do not post to the PR"), and the expected output format in the prompt.
- **Own the scope you delegate.** Once a sub-agent owns a scope, do not duplicate its work with your own grep/view calls; wait for the result.
- **Fall back gracefully.** If a sub-agent fails twice on the same task, finish it yourself rather than spinning a third.
- **Stay available.** Between sub-agent launches and notifications, remain ready to accept new user input. Do not block on long shell loops or polling when a sub-agent or background process can do the waiting. **Hard rule:** any polling/waiting expected to exceed ~60 seconds (CI status, PR review wait, etc.) MUST run in a background sub-agent. Never run a foreground PowerShell `while`/`Start-Sleep` loop that waits longer than that — it locks the user's terminal.

#### Worktree Isolation for Sub-Agents

Sub-agents that build, test, modify files, or check out different branches **must** run in their own dedicated **git worktree** so they cannot interfere with the orchestrator's working directory or with each other. Without this, two agents working concurrently can swap branches/files under each other (a real failure mode previously observed: a validation agent checked out a PR branch while the orchestrator was creating a feature branch, causing the new branch to fork from the wrong commit).

**Naming scheme:** `<src-location>_wt-<N>` where:
- `<src-location>` is the repository's working directory path (e.g. `C:\src\NaturalizationPuzzle` → worktrees at `C:\src\NaturalizationPuzzle_wt-1`, `C:\src\NaturalizationPuzzle_wt-2`, ...).
- `<N>` is a small integer assigned by the orchestrator. The orchestrator owns the numbering and must not reuse a number that is currently in use.

**Orchestrator responsibilities:**
1. **Choose N** for each isolation-needing sub-agent (track in-use numbers in memory or via `git worktree list`).
2. **Create the worktree before launching the sub-agent**:
   ```
   git worktree add <src-location>_wt-<N> <ref>
   ```
   `<ref>` is usually `main` for fresh work, or a fetched PR ref (e.g. `pull/<N>/head`) for PR validation.
3. **Pass the absolute worktree path to the sub-agent** in its prompt and instruct it to operate exclusively inside that path. Tell it explicitly **not** to `cd` outside the worktree, **not** to switch branches in the orchestrator's repo, and **not** to push or open PRs unless the task says so.
4. **Remove the worktree after the sub-agent completes:**
   ```
   git worktree remove <src-location>_wt-<N>
   ```
   If the sub-agent left uncommitted changes that the orchestrator wants, copy or commit them first. Use `git worktree remove --force` only when the worktree state is known to be discardable.
5. **Never reuse a worktree path across overlapping sub-agents.** Two simultaneous sub-agents must have distinct N values.

**When a worktree is NOT required:**
- Read-only investigation that does not change branches or run builds (e.g. an `explore` agent doing only `grep`/`view`/`glob`). The orchestrator's working directory is fine for these.
- The orchestrator's own work; it stays in the primary checkout.

**Constraints from git:** A given branch can be checked out in only one worktree at a time. If two agents need the same branch, give one a detached checkout (`git worktree add --detach <path> <ref>`) or have one work on a fresh branch.

### Git Workflow

- **Every change gets its own commit.** No batching unrelated changes.
- **Functional changes and refactoring are always separate commits.** A refactoring commit message must start with `refactor:`. This makes it easy to distinguish code changes that alter behavior from those that improve structure.
- Use [Conventional Commits](https://www.conventionalcommits.org/) prefixes: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`.
- **Every commit message must fully capture the change made.** The subject line summarizes the intent; the body (if needed) lists specifics so the change is understandable without reading the diff.
- Always include the trailer: `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`

### Code Review

- **Every change must receive a local GPT-5.5 review of the final diff before it is pushed or opened as a PR. No exceptions** — this applies to features, fixes, refactors, dependency bumps, infrastructure, workflows, scripts, **and documentation-only changes**.
- Perform the review by invoking the code-review sub-agent (e.g. `rubber-duck`) with `model: "gpt-5.5"`. The sub-agent counts as a local review.
- For **non-trivial** changes (multi-file, architectural, security-sensitive, or dependency/infra), also do a **plan review** with GPT-5.5 *before* implementing. Plan review may be skipped only for trivial changes (single small edit, typo fix, renaming).
- The review must cover correctness, security, edge cases, and blast radius. Adopt findings that prevent bugs, regressions, or merging a broken change. A finding may be dismissed only when clearly non-blocking; record a one-line rationale for each dismissed finding.
- When summarizing review outcomes to the user, be concise: state the key findings and how you addressed each. Do not copy the critique verbatim.

#### Pre-Push Verification (build + tests + e2e)

- **Every non-docs change must pass full local verification before it is pushed or opened as a PR, and again before every subsequent push to the PR branch** (e.g., commits that address Copilot or GPT-5.5 review feedback). This is a mandatory pre-push gate, peer to the GPT-5.5 review above.
- "Non-docs" uses the same definition as the Copilot PR Review Loop — paths outside the CI/CD workflow's `paths-ignore` list. Docs-only changes are exempt from build/test/e2e verification.
- Verification runs on the change's affected sides; at minimum:
  - **Frontend changes** (`src/client/**`): `npm run lint && npm test -- --run && npm run build` from `src/client/`.
  - **Backend changes** (`src/api/**`, `tests/api/**`, `NaturalizationPuzzle.sln`): `dotnet build` and `dotnet test` from the **repo root** (so the `.sln` resolves the xUnit project at `tests/api/`; never run `dotnet test` from `src/api/` — that's the web app project and the suite is silently skipped).
  - **End-to-end tests** must run for any change that touches `src/client/**`, `src/api/**`, or `infra/**`, or whose effects could plausibly affect runtime behavior. From `tests/e2e/`: `npm ci` (first time) then `npx playwright test --reporter=list` (headless). The Playwright config auto-starts the API (`dotnet run`) and the Vite dev server via `webServer` blocks — do **not** start them manually. Ensure the Chromium browser is installed (`npx playwright install chromium`).
  - **Never use the default `html` reporter for agent/CI runs.** Playwright's HTML reporter starts a local web server (default port 9323) on failure that blocks the test process from exiting and hangs sub-agents. Always pass `--reporter=list` (or `--reporter=line`/`dot`/`github`) on the CLI to override the config's `reporter: 'html'`. Pass/fail status and per-test details must be reported directly from the CLI output, not from a UI report.
  - Cross-cutting changes (infra, workflows, dependencies) must run all three sides.
- If any step fails, fix it and rerun **the full set** before pushing — never push with known failures, even if "unrelated."
- Verification work is well-suited for delegation to a sub-agent in its own worktree (see **Worktree Isolation for Sub-Agents**) so the orchestrator stays responsive. The sub-agent reports pass/fail and surfaces logs only for failures.

#### Stale-Comment Maintenance

When refactoring or behavior-changing code, also update **any comments that describe the old mechanism** — in source code, in tests, and in docs. Stale comments are reviewable defects: PR #37's review #5 was entirely about three comments that became inaccurate after a refactor. This applies to inline `//` comments, JSDoc/XML doc comments, test descriptions, and prose in `CONTEXT.md` / `README.md` / progress summaries.

#### Avoid Hardcoded Counts in Living Docs

Prefer "all client tests pass" over "78 client tests pass", "all xUnit tests pass" over "all 142 backend tests pass", and "16 new tests added" over "14 new tests added". Hardcoded counts go stale on the next commit and become reviewable findings. This applies to `CONTEXT.md`, `README.md`, PR descriptions, and progress summaries the orchestrator writes for the user. Counts that genuinely matter (e.g., domain-meaningful constants like "128 civics questions") are fine.

#### Local Servers / Long-Running Processes for Manual Testing

When the user asks the orchestrator to spin up servers for manual validation on Windows:

- Use `Start-Process -FilePath <exe> -ArgumentList ... -WorkingDirectory ... -WindowStyle Hidden -PassThru` and capture/report the PID. The powershell tool's `mode: "async", detach: true` does **not** reliably persist a process across the agent session boundary in all scenarios (observed during the dark-mode session: detached `npm run dev` and `dotnet run` were marked "completed" almost immediately and the servers died with them).
- Tell the user the URLs and the PIDs so they (or you) can stop them later: `Stop-Process -Id <PID>`.
- This applies **only** to user-driven manual testing. Do **not** start the API or Vite dev server yourself for E2E runs — Playwright's `webServer` config in `tests/e2e/playwright.config.ts` already starts both, and starting them manually causes port conflicts.

#### Pre-Merge Checklist (non-docs PRs)

Before running `gh pr merge`, verify **all four** gates explicitly. Skipping any of these turns into the "why is this still BLOCKED?" diagnostic that surfaced on PR #37:

1. **CI green.** Every required check in `statusCheckRollup` is COMPLETED with `SUCCESS` (or `SKIPPED`/`NEUTRAL`).
2. **All review threads resolved.** Run:
   ```
   gh api graphql -F owner=<owner> -F repo=<repo> -F num=<N> -f query='
     query($owner:String!,$repo:String!,$num:Int!){
       repository(owner:$owner,name:$repo){
         pullRequest(number:$num){ reviewThreads(first:100){ nodes { id isResolved } } }
       }
     }' --jq '.data.repository.pullRequest.reviewThreads.nodes | map(select(.isResolved==false)) | length'
   ```
   Result must be `0`. Resolve via `mutation resolveReviewThread`. **Note:** the query fetches only the first 100 threads; for PRs with more than 100 threads, paginate using `pageInfo.hasNextPage` / `endCursor` until exhausted, otherwise unresolved threads on later pages will be silently missed.
3. **`reviewDecision == APPROVED`.**Check with `gh pr view <N> --json reviewDecision`. Empty string or `REVIEW_REQUIRED` blocks the merge. **Important:** Copilot's PR reviews are always submitted as `COMMENTED`, never `APPROVED`. A clean Copilot loop does not satisfy this gate; the PR still needs an `APPROVED` review from a human (or self-approval if branch protection allows). The previous version of these instructions implied "Loop until Copilot returns a clean review" was sufficient to merge — it is not.
4. **Mergeable & up-to-date with base.** `mergeable == MERGEABLE` and `mergeStateStatus == CLEAN` (i.e., not `BEHIND`, `DIRTY`, `BLOCKED`, `UNSTABLE`, `DRAFT`, or `UNKNOWN`). If `BEHIND`, merge `origin/main` into the PR branch (or rebase). If `DIRTY`, resolve conflicts. If `DRAFT`, mark ready for review. **After updating the branch, re-request Copilot review and wait for CI to re-run** before merging — the previous Copilot review and CI run no longer cover the new tip.

Single command to inspect most state: `gh pr view <N> --json mergeable,mergeStateStatus,reviewDecision,statusCheckRollup,isDraft` — but combine with the GraphQL `reviewThreads` query above, since thread state is not in that JSON projection. Use this as the **first** debugging step whenever a merge unexpectedly fails.

#### Copilot PR Review Loop (non-docs changes)

Any change that is **not docs-only** must additionally pass an iterative GitHub Copilot review on the pull request itself. This is in addition to (not a replacement for) the local GPT-5.5 review above. "Docs-only" here means the change touches only paths covered by the CI/CD workflow's `paths-ignore` list (Markdown, `LICENSE`, `.gitignore`, `.editorconfig`, copilot/contributor instructions, PR/issue templates).

- **PR required.** Never push non-docs changes directly to `main`. **`gh pr merge --admin` is banned by default** for non-docs PRs and may be used only as a narrow exception when **all** of the following are true: (i) every other gate in this file is satisfied — local GPT-5.5 plan review (if applicable) and final-diff review, full pre-push verification (build + tests + e2e), Copilot PR review loop clean, and all review threads resolved; (ii) CI is green and the PR is otherwise mergeable (`mergeable == MERGEABLE`, no conflicts, not draft); (iii) the **only** remaining blocker is the missing `APPROVED` review and no human approver is available; and (iv) the rationale is documented in a PR comment before the merge. If any of these is false, do not use `--admin` — escalate to the user and ask for approval instead.
- **Add Copilot as a reviewer** as soon as the PR is opened: `gh pr edit <N> --add-reviewer "@copilot"` (or click "Request a review from Copilot" in the GitHub UI).
- **Address every Copilot suggestion** — push fixes as additional commits on the PR branch. The dismissal policy from the Code Review section still applies: a suggestion may be dismissed only when clearly non-blocking, and the rationale must be recorded in a PR comment replying to that suggestion.
- **Re-request Copilot review after each push** of new commits using the same `gh pr edit <N> --add-reviewer "@copilot"` invocation, or the "Re-request review" button in the UI.
- **Loop until Copilot returns a clean review** with no further comments or change suggestions. **A clean Copilot review is necessary but not sufficient to merge** — old unresolved review threads can still exist, and a non-docs PR additionally needs an `APPROVED` review (Copilot reviews are always `COMMENTED`). See the Pre-Merge Checklist above.
- The local pre-push GPT-5.5 review is still required for every commit pushed to the PR branch — including commits that address Copilot's feedback.
- **Dependabot/bot PRs:** the Copilot review loop applies to them too. If Copilot has actionable feedback on a bot PR, push fix-up commits directly to the bot's branch to address it. This will stop Dependabot from further auto-managing that PR (no more auto-rebase), which is acceptable because the PR is about to be merged. Only use `@dependabot rebase` when you genuinely want Dependabot to keep managing the PR (e.g., it's behind `main` and you have no fix-ups to push).

### Dependabot & Security PRs

Dependabot PRs (dependency bumps) and other automated security PRs are **first-class code changes** and must be validated, reviewed, and merged through the same discipline as human-authored PRs. Never blindly merge them based on green CI alone.

**Triage priority:**
- **Security advisories / vulnerability fixes**: handle promptly. Don't let them sit.
- **Patch / minor bumps without security impact**: validate and merge in normal cadence.
- **Major bumps**: extra scrutiny — analyze breaking changes and peer-dep constraints.

**Plan review:** dependency/infra changes are classed as non-trivial under the **Code Review** section, so a GPT-5.5 plan review applies. In practice, for a routine patch-level Dependabot PR (no breaking changes, narrow blast radius), the validation checklist below is itself the plan; for minor or major bumps run a separate plan review before starting validation.

**Validation checklist — delegate to a sub-agent running in its own worktree** (see Worktree Isolation for Sub-Agents). The orchestrator creates worktree `<src-location>_wt-<N>` from the PR ref, hands the path to the sub-agent, and removes the worktree when done.

1. **Create a worktree from the PR head** (orchestrator step):
   ```
   git fetch origin pull/<PR>/head
   git worktree add <src-location>_wt-<N> FETCH_HEAD
   ```
2. **Inspect the diff scope** (in the worktree): `git diff main..HEAD`. For a clean Dependabot PR with no fix-up commits, confirm only the expected dependency files change (e.g., `package.json`, `package-lock.json`, `*.csproj`, `packages.lock.json`) and flag any unrelated edits. If Copilot review feedback led to fix-up commits on the PR (per the Copilot PR Review Loop), source/config edits required to land the bump are expected and allowed — but they must be directly justified by the bump or by a Copilot finding. Anything outside that scope is still flagged.
3. **Restore dependencies** in the affected workspace inside the worktree:
   - Frontend bumps: `cd src/client && npm ci`
   - Backend bumps: `cd src/api && dotnet restore`
4. **Verify the resolved version** matches what the PR claims (`npm ls <pkg> --all` from `src/client/`, or `dotnet list package --include-transitive` from `src/api/`). Note any unexpected transitive shifts.
5. **Lint, test, build** on the affected side:
   - Frontend (run from `src/client/`): `npm run lint && npm test -- --run && npm run build`
   - Backend: `dotnet build` from the worktree root (or `src/api/`), and `dotnet test` from the **worktree root** so the solution resolves the xUnit project at `tests/api/`. Do **not** run `dotnet test` from `src/api/` — that project is the web app, not the test project, so the suite would be silently skipped.
6. **Run the GPT-5.5 `code-review` sub-agent** on the final diff (mandatory per Code Review section). The reviewer can read from the same worktree.
7. **Re-run the validation checklist (steps 2–6) after every fix-up commit** pushed to the PR branch in response to Copilot or GPT-5.5 review feedback. The pre-push verification gate already covers build + unit tests + e2e for the new commit; this step ensures the diff scope, resolved versions, and final-diff GPT-5.5 review reflect the latest PR head before merge.
8. **Remove the worktree** when validation is complete (orchestrator step): `git worktree remove <src-location>_wt-<N>`.

**Merging:**
- Use **squash merge**. The PR's CI status checks must be passing.
- If the PR is behind `main` and conflicts, comment `@dependabot rebase` on the PR to have Dependabot rebase it — do not manually rebase. (Pushing fix-up commits to address Copilot review feedback is allowed and expected per the Copilot PR Review Loop; it just ends Dependabot's auto-management of the PR, which is fine when you're about to merge.)
- A bump that touches deploy-relevant paths (e.g., `src/**`, `Dockerfile`) will trigger a production deploy through the normal `production` environment approval gate. Plan accordingly.

**Grouping & cadence:**
- Process Dependabot PRs promptly to avoid security drift, but **one at a time**. Don't batch-merge multiple bumps in the same session unless they are intentionally grouped by Dependabot config.
- After merging, sync `main` locally and delete the merged branch.

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

### Logging — Sanitize User-Controlled Input (CWE-117)

Log forging (CWE-117) happens when attacker-controlled CR/LF or other control characters end up in a log entry, letting an attacker forge fake log lines, hide activity, or inject ANSI terminal escapes. Always assume **anything derived from a request is hostile**: paths, query strings, route values, header values, request bodies, and any string built from them — including exception messages that quote user input.

**Rules:**

- **Never log a user-controlled string directly.** Wrap it with `LogSanitizer.Clean(value)` or, for ASP.NET types, the `.ForLog()` extension (`PathString`, `QueryString`, `string?`). Both live in `NaturalizationPuzzle.Api.Logging`. They strip CR/LF, NEL/LS/PS, other C0/C1 control characters, and DEL; preserve TAB; truncate to a fixed cap with an explicit truncation marker.
- **Always use structured-log placeholders** (`{Foo}`) and pass the value as an argument. Never interpolate or concatenate user input into the message template; never use user input as the format string itself.
- **Stack traces use `LogSanitizer.Clean(value, LogSanitizer.MaxStackTraceLength)`** (32 KB cap) — the default 4 KB cap is for short scalar fields and would truncate real traces.
- **Raw `Exception` is opt-in.** `GlobalExceptionHandler` defaults to logging sanitized `ExceptionType` / `ExceptionMessage` / `ExceptionStackTrace` fields and does **not** pass the raw `Exception` to the logger. Set `Logging:Exceptions:IncludeRawException = true` (config or env var) to restore raw-exception logging for debugging — this re-enables first-class structured exception telemetry on OpenTelemetry / Application Insights at the cost of plaintext-sink CWE-117 safety.
- **Tests for new logging sites** that emit user-controlled values must include at least one assertion that the rendered log message contains no `\r` / `\n` when the input contains them.

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
