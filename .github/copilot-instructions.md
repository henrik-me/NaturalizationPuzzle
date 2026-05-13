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
- The questions data (128 civics questions + state-specific answers) is seeded into SQLite via EF Core's `HasData` model configuration, materialized at startup by `EnsureDatabaseSchemaAsync` → `EnsureCreatedAsync` (no migrations are used in this path).

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
- **Monitoring / polling sub-agents** (e.g., a `task` agent whose only job is to repeatedly poll `gh pr view` or `gh run view` until a CI run finishes, or to tail a log until a marker appears): use a fast/cheap model — `claude-haiku-4.5` is the recommended default. There is no reasoning-heavy work for a stronger model to do, and Opus 4.7 (1M) would be wasteful for a 25-minute sleep loop. The reasoning that decides *what to do with the result* happens in the orchestrator after the polling agent returns.
- **Fallback when `claude-opus-4.7-1m-internal` is unavailable** (e.g., the sub-agent invocation errors with model-access denied, or an external contributor lacks access to the internal variant): substitute the strongest available high-reasoning Claude Opus model with the largest context window the environment offers (e.g., `claude-opus-4.7-high`, `claude-opus-4.7`, then `claude-opus-4.6`). State the substitution to the user in the same response that launches the sub-agent. If no Claude Opus model is available, ask the user how to proceed rather than silently falling back to a much weaker model.
- **Parallelize independent work.** Multiple `explore` or `code-review` agents can run concurrently — launch them in a single response when their scopes don't overlap.
- **Give complete context.** Sub-agents are stateless. Provide the full task, file paths, success criteria, constraints (e.g., "do not modify code", "do not post to the PR"), and the expected output format in the prompt.
- **Own the scope you delegate.** Once a sub-agent owns a scope, do not duplicate its work with your own grep/view calls; wait for the result.
- **Fall back gracefully.** If a sub-agent fails twice on the same task, finish it yourself rather than spinning a third.
- **Stay available.** Between sub-agent launches and notifications, remain ready to accept new user input. Do not block on long shell loops or polling when a sub-agent or background process can do the waiting. **Hard rule:** any polling/waiting expected to exceed ~60 seconds (CI status, PR review wait, etc.) MUST run in a background sub-agent. Never run a foreground PowerShell `while`/`Start-Sleep` loop that waits longer than that — it locks the user's terminal.
- **Self-monitor and ping the user at least every ~30 minutes during long-running operations.** Long deploys, CI runs, dependency-update loops, "wait for user to click approve in the UI" gates — none of these grant license to go silent. Concretely: when launching a polling sub-agent for a long-running operation, **set its hard cap to ~25 minutes (not the usual 30 or 45)** so it returns with a status update inside the cadence even if its terminal condition hasn't fired. On the agent's return, send the user a short status ping ("still waiting on the deploy gate, currently <state>") and re-launch the poller if more waiting is needed. Do **not** treat "task delegated to a background agent" as equivalent to "task complete" — it isn't.

#### Never Let a Poller Go Silent — and Never Trust an Early Return

The user's stated cost model: **multiple Copilot review rounds in 30 minutes are healthy as long as findings are meaningful — the failure mode to avoid is missing reviews entirely** (silent pollers, false-positive "clean" returns, prose dumps the orchestrator can't parse). This subsection codifies the disciplines that prevent that failure mode. They were learned the hard way during PR #77, where four separate polling agents misbehaved before the loop finally completed correctly.

- **Validate elapsed time on every poller return.** When a polling sub-agent returns, the orchestrator MUST inspect `elapsed_seconds` and `iterations` from the structured output. If `state` is non-terminal (e.g. ci=pending was reported and the loop simply gave up) OR `elapsed_seconds` is much smaller than the requested cap AND no terminal condition is genuinely met, the early return is invalid — re-launch a fresh poller rather than acting on it. Pollers have returned `state=clean` after 58 seconds, after 92 seconds, and after 275 seconds with `iterations=2` on PR #77; only the strictest prompt with explicit minimum floors produced a faithful loop.
- **Never trust a poller's "clean" claim without independent verification.** Before merging or otherwise acting on `state=clean`: query `gh pr view <N> --json statusCheckRollup,reviews,reviewDecision` and the GraphQL `reviewThreads` and confirm directly. The polling agent has been wrong about "review complete" in ways the orchestrator can detect immediately by comparing the latest Copilot review's `submittedAt` against the known push timestamp.
- **Symmetric rule: never trust a poller's `state=findings` claim when `threads_unresolved=0` either.** Copilot's review summary text can be CLEAN ("Copilot reviewed 11 out of 11 changed files... and generated **no new comments**") while a polling agent still classifies the return as `findings` — observed on PR #86 round 3 with a Haiku polling agent. Before re-launching for fixes, the orchestrator MUST fetch the actual review body (`gh api repos/<o>/<r>/pulls/<N>/reviews --jq '.[].body'` or via the GitHub MCP `pull_request_read` get_reviews method) and confirm the latest review's body summary matches the poller's claimed `state`. The cost of a false-positive `findings` (wasted fix-up cycle, re-verification, re-review) is the same as a false-positive `clean` (wasted merge attempt). Apply the same independent-verification discipline to both.
- **If the polling agent returns prose instead of the structured single line**, do NOT paste that prose anywhere. Extract the structured data (or re-launch the poller with the format clause restated). Verbose poller output was the single largest source of context bloat during PR #77; the structured format exists precisely to keep that out of the orchestrator window.
- **If a poller exceeds its hard cap by more than ~5 minutes without returning**, the orchestrator does not wait — it inspects PR/CI state directly via `gh` and proceeds based on the direct evidence. The eventual completion notification arrives later and is treated as a confirming echo, not as a fresh signal. Concrete past examples: the earlier `pr77-poll-r4` agent ran 37 minutes against a 25-minute cap before returning verbose prose; the orchestrator should have intervened at minute 30.
- **Background `task` agents cannot be force-stopped — the cap discipline IS the only kill switch.** Tools like `stop_powershell` do not terminate background `task`/`code-review` sub-agents (they only terminate PowerShell sessions started via the `powershell` tool). A `task` agent runs until either its terminal condition fires OR its prompt's hard cap elapses; the orchestrator has no `stop_agent` tool. Practical implications:
  - Always include an explicit hard cap in every polling-agent prompt (see the **Sub-Agent Output Format** → Polling sub-agents block — 1500 s default).
  - When a poller is rendered redundant by a direct check (e.g., the orchestrator queried `gh` and now knows the answer), the agent is allowed to run to completion in the background. Its eventual notification will arrive and should be acknowledged briefly, not acted on. PR #81 round 1 had the orchestrator believe `stop_powershell` would kill `pr81-poll-r1`; the agent kept polling and returned 26 minutes later with stale data. That was a wasted notification cycle, not a recoverable error — but the lesson is to not expect the stop to work.
  - Concurrent pollers on the same scope are acceptable when one is known-stale and the other is current. Just track which agent's return matters and ignore the redundant one.

#### Sub-Agent Output Format

Sub-agent return values are loaded into the orchestrator's context window in full. Long, unstructured sub-agent output is one of the largest causes of premature context compaction. **Every sub-agent prompt MUST mandate one of the structured output formats below.** If a prompt does not include an explicit output-format clause, the launch is incomplete — fix the prompt before sending.

The goal is **lossless compression**: every actionable item must be reported (no truncation, no "and N more"), but format overhead — prose preambles, restated diffs, quoted code blocks, JSON dumps, sign-off paragraphs — is forbidden. If a structured response is large, that itself is a signal (e.g. "diff too big, split the PR"; "too many test failures, fix the most upstream one first") — do not hide the signal by truncating.

Required prompt language is given verbatim per role; copy it into the sub-agent prompt.

##### Review sub-agents (`code-review`, `rubber-duck`, GPT-5.5 plan/diff reviews)

```
Output format (REQUIRED, no other content):

If no findings, exactly one line:
  CLEAN scope=<short scope description>

If findings, a Markdown table — every finding, no truncation:
  | file:line | severity | category | finding | suggested_fix |
  |-----------|----------|----------|---------|---------------|
  | path/to/file.ts:42 | blocker|major|minor|nit | bug|security|perf|style|docs | one sentence | one sentence |

Then exactly one trailer line:
  TOTAL findings=<N> blocker=<N> major=<N> minor=<N> nit=<N>

No prose preamble, no per-finding paragraphs, no quoted code blocks, no closing remarks.
```

##### Verification sub-agents (`task` agent running build/test/lint/e2e)

```
Output format (REQUIRED, no other content):

One line per side that ran, in this exact key=value form. Each value is one of: OK | FAIL | FAIL:<N> | SKIP | ERROR | <P>/<T>. Use SKIP when an earlier step on the same side failed and the later step was therefore not run; use ERROR when the step itself could not execute (missing tool, crashed runner). Never fabricate a numeric result — report SKIP or ERROR instead.

  client: lint=<OK|FAIL:N|SKIP|ERROR> tests=<P>/<T>|SKIP|ERROR build=<OK|FAIL|SKIP|ERROR>
  api:    build=<OK|FAIL|SKIP|ERROR> tests=<P>/<T>|SKIP|ERROR
  e2e:    tests=<P>/<T>|SKIP|ERROR

If any value is FAIL, FAIL:<N>, ERROR, or P<T, append a FAILURES block — one structured entry per failing item, no truncation:
  --- FAILURES ---
  side=<client|api|e2e> kind=<lint|test|build|e2e> id=<file:line or test name>
  excerpt: <≤10 lines of the most diagnostic log lines for this failure>

End with exactly one trailer line:
  VERIFY: <PASS|FAIL|ERROR> sides_run=<comma-separated>

PASS = every reported value is OK or P==T with no FAIL/ERROR. FAIL = at least one FAIL/FAIL:<N>/P<T present. ERROR = at least one ERROR present and no FAIL.

No prose, no full log dumps, no environment chatter.
```

##### Polling sub-agents (`task` agent polling CI / PR review state)

```
Output format (REQUIRED, single line, exactly these keys in this order):

  state=<clean|findings|ci_failed|merged|timeout|error>
  action=<none|apply_fixes|re_request_review|merge|investigate_ci|investigate_error>
  pr=<number>
  ci=<pending|success|failure|none>
  threads_unresolved=<N>
  new_review=<true|false>
  latest_review_at=<ISO8601 or none>
  iterations=<N>
  elapsed_seconds=<N>
  detail="<≤140 chars, no commas>"

Loop discipline (REQUIRED, written verbatim into the prompt):
- The orchestrator gives an explicit `push_at` timestamp; "new review" means a Copilot review with `submittedAt > push_at`. Older reviews — even if "Copilot reviewed N files" — DO NOT count as new. Verify the timestamp comparison on every iteration.
- "ci_running", "review_pending", "ci_success_no_review_yet" are NOT valid return states. They are non-terminal — the agent MUST sleep (default 90 s) and loop again.
- Minimum total wall time before any non-failure return: 4 minutes (240 s). Even when terminal conditions look met, if `elapsed_seconds < 240`, sleep and re-check.
- Maximum total wall time: 25 minutes (1500 s). At the cap, return `state=timeout action=re_request_review`.
- ci=failure is the only condition allowed to return immediately (no minimum-elapsed gate).

No PR/run JSON dump, no log lines, no prose preamble or postamble.
```

##### Explore sub-agents

```
Output format (REQUIRED, no other content):

For each question asked, a numbered block:
  Q<N>: <restatement of the question in ≤1 line>
  ANSWER: <≤3 lines of direct answer>
  EVIDENCE:
    - file/path.ts:LL-LL — <≤1 line of why this is evidence>
    - file/path.ts:LL    — <≤1 line>

End with exactly one trailer line:
  COVERAGE: questions=<N> files_examined=<N>

No file dumps, no quoted code blocks longer than 3 lines, no exploratory narrative.
```

##### General-purpose / implementation sub-agents (writing code or running multi-step changes)

```
Output format (REQUIRED, no other content):

A Markdown changeset table — every file touched, no truncation:
  | file | action | rationale |
  |------|--------|-----------|
  | path/to/file.ts | created|modified|deleted|renamed | one sentence |

Then a verification block in the verification-sub-agent format above (one line per side, plus FAILURES if any, plus the `VERIFY:` trailer).

Then exactly one trailer line:
  RESULT: <DONE|PARTIAL|BLOCKED> commits=<comma-separated short SHAs or "uncommitted"> open_issues=<N>

If RESULT is PARTIAL or BLOCKED, append an OPEN_ISSUES block — one structured entry per item, no truncation:
  --- OPEN_ISSUES ---
  id=<short slug> blocker=<yes|no> detail="<≤140 chars>"

No prose preamble, no full diffs, no closing remarks.
```

##### Orchestrator handling of sub-agent output

- **Treat the structured output as the source of truth.** Do not re-quote it back to the user verbatim — the user can be told the trailer line plus the actionable subset (e.g. "3 blockers, addressing now" + the 3 relevant rows).
- **If a sub-agent returns prose or violates the format**, do not paste that output anywhere. Instruct the sub-agent (or a re-launched one) to re-emit in the required format, or extract the structured subset yourself.
- **Persist non-actionable-now findings to SQL `inbox_entries`** rather than carrying them in chat context across rounds.

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

#### Context Hygiene

The orchestrator's context window is finite and compaction is destructive (loses precise file contents, exact line numbers, and prior tool outputs). Treat context as a budget to manage, not an infinite resource.

- **Re-read on the right triggers, not on every round and not never.** Re-reading wastes context if the file is unchanged; failing to re-read is dangerous if it has changed. Re-read a file when ANY of these is true:
  1. **Compaction has occurred** since the last view (the prior view is now lossy or summarized).
  2. **The file has been modified** since the last view, by anyone — you, a sub-agent, the user, `git pull` / `checkout` / `rebase` / `merge`, a formatter, an autofix, etc.
  3. **You need to act on a section** (edit, reason about exact line numbers, quote behavior) for which you do not have a current `view` in this turn's context.
  4. **You are uncertain** whether (1) or (2) applies. Cheap re-read beats acting on a stale view.
  When (1)–(4) are all false, do not re-read. After the first full read, record the line ranges of relevant sections (SQL `inbox_entries` or `plan.md`) so subsequent targeted reads use `view_range` over the specific section, not a full-file fetch.
- **Don't re-quote sub-agent output to the user.** Extract the actionable items and respond in your own words. Pasting a full review back into the chat doubles the context cost of that review.
- **Don't re-run verification or review on identical inputs.** If the diff hasn't changed since the last sub-agent run, the result hasn't changed either; reuse the prior result.
- **Prefer SQL `inbox_entries` over re-derivation.** When you discover a fact that will matter in a later round (e.g. "Q68 not yet covered", "round-2 review may flag this"), insert it as an inbox entry instead of relying on remembering it.
- **Edit precisely.** Use `edit` with minimal `old_str` rather than re-creating large chunks of a file. Re-creating a section forces the orchestrator to hold both the old and new versions in context until the edit is applied.

### Git Workflow

- **Every change gets its own commit.** No batching unrelated changes.
- **Functional changes and refactoring are always separate commits.** A refactoring commit message must start with `refactor:`. This makes it easy to distinguish code changes that alter behavior from those that improve structure.
- Use [Conventional Commits](https://www.conventionalcommits.org/) prefixes: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`.
- **Every commit message must fully capture the change made.** The subject line summarizes the intent; the body (if needed) lists specifics so the change is understandable without reading the diff.
- Always include the trailer: `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`

### Code Review

- **Every change must receive a local GPT-5.5 review of the final diff before it is pushed or opened as a PR. No exceptions** — this applies to features, fixes, refactors, dependency bumps, infrastructure, workflows, scripts, **and documentation-only changes**.
- Perform the review by invoking the code-review sub-agent (e.g. `rubber-duck`) with `model: "gpt-5.5"`. **The review MUST run as a sub-agent — never review the diff inline in the orchestrator.** Inline review consumes orchestrator context for material the orchestrator only needs the *conclusions* of. The sub-agent counts as a local review.
- The review sub-agent prompt MUST include the verbatim **Review sub-agents** output-format block from the **Sub-Agent Output Format** section above. If the sub-agent returns prose or otherwise violates the format, re-launch with the format clause restated rather than accepting the malformed output.
- The review sub-agent prompt MUST also include the **Review Depth Checklist** below. Without an explicit checklist, GPT-5.5 reviews tend to spot-check obvious diffs and miss the categorical issues (brittle tests, stale comments, ordering dependencies, factual content claims) that Copilot then catches across multiple rounds. Prescribing the checklist up front lets the local review surface those findings before the push.
- For **non-trivial** changes (multi-file, architectural, security-sensitive, or dependency/infra), also do a **plan review** with GPT-5.5 *before* implementing. Plan review may be skipped only for trivial changes (single small edit, typo fix, renaming).
- The review must cover correctness, security, edge cases, and blast radius. Adopt findings that prevent bugs, regressions, or merging a broken change. A finding may be dismissed only when clearly non-blocking; record a one-line rationale for each dismissed finding.
- When summarizing review outcomes to the user, be concise: state the key findings and how you addressed each. Do not copy the critique verbatim.

#### Review Depth Checklist

Every code-review sub-agent prompt MUST include a checklist that tells the reviewer **what categories of issue to look for**, not just "review the diff". Without an explicit checklist, GPT-5.5 returns sparse reviews; with the checklist, it matches or exceeds Copilot's thoroughness. PR #77 round 5 demonstrated the difference: the round-5 GPT-5.5 review using the checklist returned 10 findings (1 major, 2 minor, 7 nit), while earlier ad-hoc reviews on the same PR had returned 0–3 findings on similar diffs.

Required prompt language (copy verbatim into the review sub-agent prompt; trim categories that are clearly N/A for the diff under review and label them as such, but do NOT silently drop them):

```
Apply this checklist explicitly — for each item, name the file/line you checked and the verdict:

A. Brittle test patterns: exact-list assertions; hardcoded counts in tests; iteration-order assumptions; positional/index dependencies.
B. Misleading or stale comments / docs: factual claims about platform/runtime behavior — verify each is true. Comments describing an old mechanism after a refactor.
C. Positional / ordering dependencies: array index reads without semantic anchor; reliance on dict/map iteration order; Promise.allSettled element ordering; fragile destructuring.
D. Factual content claims (in any user-facing prose, story content, README, etc.): dates, ages, jurisdictions, eligibility regimes, constitutional minimums, USCIS test answers — flag oversimplification or conflation of distinct categories.
E. Stale XML/JSDoc/test-name comments: a renamed test whose XML doc still describes the old behavior; doc strings that no longer match the function they document.
F. Cache invalidation correctness: cache-key shape, cache version bumps, asymmetric request-vs-warm-up keys, missed bumps after content changes.
G. Race conditions / error swallowing in async code: silent .catch(() => undefined), void-discarded promises, useEffect cleanup omissions, double-await semantics.
H. Scaling concerns: would this work at 10x the current N? Concurrency caps still right? O(N²) hidden in an "obvious" loop?
I. Domain invariants: any per-PR invariant the reviewer should verify (e.g. coverage contracts, route registration, schema migration shape).
J. "What would Copilot likely flag here?" Apply categorical thinking that has surfaced findings in prior Copilot rounds: brittle invariants, oversimplifications, false comments, ordering dependencies, missed citations, missing source for a factual claim.
K. Audit-whole-file: when you find one instance of a class of issue, check the whole file (and sibling files of the same kind) for other instances of the same class. Flag every instance, not just the first. **For state-mutation patterns specifically** (React `setX(prev => ...)` updaters, async append/remove operations, event handlers that mutate shared state), this requires an explicit grep across the file (and sibling components in the same module) for ALL functions calling that pattern, then verifying each is robust to the same trigger (rapid double-click, double-await, StrictMode double-render, etc.). One fix per class per round is incomplete — bug classes in state mutators almost always exist in multiple sibling handlers and surfacing them one round at a time wastes review cycles. PR #86 went through 4 review rounds finding the same double-click race in 4 different handlers (`restoreStoryQuizResult` → `handleSubmit` → `handleNextOrResults` → `handleStudyNext`) when one proactive sweep would have caught all of them.

Out of scope: stylistic preferences, anything in [explicit list of exclusions for this PR].
```

Add per-PR specific checks below the standard checklist as letters L, M, N, ... (e.g. "L. Architecture diagram alignment after the box-art edit", "M. Specific to round-X: …"). Always retain the A–K standard items even if a few are clearly N/A — explicitly noting "N/A" forces the reviewer to consider and rule out the category rather than skip it silently.

#### PR Size Discipline

Prefer scoping a PR to a single concern. The motivation here is **review quality**, not context cost: smaller diffs let both Copilot and GPT-5.5 reason about each layer independently, which surfaces better findings and produces clearer commit history. Multiple Copilot review rounds with meaningful findings on a single PR are a healthy outcome — the failure mode to avoid is silent reviews or missed categorical issues, not "more than two rounds".

- **Prefer splitting test-infrastructure changes from content/feature changes.** Land the test-infra refactor first as its own PR; then layer content/feature commits against the new contract. Reviewers reason about each layer in isolation and tend to find more.
- **Prefer splitting unrelated concerns.** A PR that bundles "expand catalog + rewrite warm-up cache + bump cache version + restructure tests" is harder to review well as one diff than as 3–4 focused PRs even if the total LOC is the same.
- **Don't optimize away review rounds.** A PR that ships in one round may have skipped findings that a multi-round loop would have caught. The user's explicit stated cost model: "it's ok to go around with copilot for longer, assuming it's 4 rounds in 30 minutes; the issue is if you don't see a review at all, as long as the issues reported by GPT-5.5 are meaningful."

#### Pre-Push Verification (build + tests + e2e)

- **Every non-docs change must pass full local verification before it is pushed or opened as a PR, and again before every subsequent push to the PR branch** (e.g., commits that address Copilot or GPT-5.5 review feedback). This is a mandatory pre-push gate, peer to the GPT-5.5 review above.
- "Non-docs" uses the same definition as the Copilot PR Review Loop — paths outside the CI/CD workflow's `paths-ignore` list. Docs-only changes are exempt from build/test/e2e verification.
- Verification runs on the change's affected sides; at minimum:
  - **Frontend changes** (`src/client/**`): `npm run lint && npm test -- --run && npm run build` from `src/client/`.
  - **Backend changes** (`src/api/**`, `tests/api/**`, `NaturalizationPuzzle.sln`): `dotnet build` and `dotnet test` from the **repo root** (so the `.sln` resolves the xUnit project at `tests/api/`; never run `dotnet test` from `src/api/` — that's the web app project and the suite is silently skipped).
  - **End-to-end tests** must run for any change that touches `src/client/**`, `src/api/**`, or `infra/**`, or whose effects could plausibly affect runtime behavior. From `tests/e2e/`: `npm ci` (first time) then `npx playwright test --reporter=list` (headless). The Playwright config auto-starts the API (`dotnet run`) and the Vite dev server via `webServer` blocks — do **not** start them manually. Ensure the Chromium browser is installed (`npx playwright install chromium`). **Critical ordering**: also run `npm ci` from `src/client/` BEFORE the e2e step — the Playwright `webServer` block does `cd src/client && npm run dev`, which needs `src/client/node_modules/.bin/vite` to exist. Verification agents that only `npm ci` in `tests/e2e/` will hit `'vite' is not recognized as an internal or external command` and fail e2e even though the change itself is fine. PR #76's round-1 verify hit exactly this.
  - **Never use the default `html` reporter for agent/CI runs.** Playwright's HTML reporter starts a local web server (default port 9323) on failure that blocks the test process from exiting and hangs sub-agents. Always pass `--reporter=list` (or `--reporter=line`/`dot`/`github`) on the CLI to override the config's `reporter: 'html'`. Pass/fail status and per-test details must be reported directly from the CLI output, not from a UI report.
  - Cross-cutting changes (infra, workflows, dependencies) must run all three sides.
- If any step fails, fix it and rerun **the full set** before pushing — never push with known failures, even if "unrelated."
- **Verification MUST be delegated to a sub-agent in its own worktree** (see **Worktree Isolation for Sub-Agents**). The orchestrator does not run `dotnet test` / `npm test` / `npx playwright test` directly — those commands produce thousands of lines of output that consume orchestrator context for material the orchestrator only needs the pass/fail outcome of. The verification sub-agent prompt MUST include the verbatim **Verification sub-agents** output-format block from the **Sub-Agent Output Format** section above.

#### Stale-Comment Maintenance

When refactoring or behavior-changing code, also update **any comments that describe the old mechanism** — in source code, in tests, and in docs. Stale comments are reviewable defects: PR #37's review #5 was entirely about three comments that became inaccurate after a refactor. This applies to inline `//` comments, JSDoc/XML doc comments, test descriptions, and prose in `CONTEXT.md` / `README.md` / progress summaries.

#### Audit Whole-File for Class of Issue

When a reviewer (Copilot or GPT-5.5) flags one occurrence of a class of issue — hardcoded count, missing citation, stale comment, magic number, etc. — **audit the entire affected file (and sibling files of the same kind) for every other instance of that class in one pass**. The motivation is **fix completeness**, not minimizing review rounds: a partial fix that addresses only the flagged occurrence leaves siblings in an obviously inconsistent state, which is itself a defect. Bias toward over-fixing within the class; under-fixing is the more expensive mistake because it ships a known-incomplete change.

A concrete past example: PR #77 round 1 flagged one hardcoded story count in `CONTEXT.md`. The orchestrator fixed only that occurrence; rounds 2 and 3 then surfaced the obvious siblings (subcategory question counts in the same file, then the PR title's hardcoded count). Each was a real defect — the issue isn't that they cost rounds, it's that shipping the round-1 fix knowingly left the same class of problem elsewhere in the same file.

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

#### Editing an existing issue or PR body programmatically

When the orchestrator needs to make incremental edits to an existing issue or PR body (e.g. fold new findings into a tracker issue), **keep the local source markdown around and edit the local file in place**, then push the updated content back via `gh issue edit <N> --body-file <path>` (or `gh pr edit`). Path:

- When you author an issue/PR body via `--body-file <path>`, hold onto `<path>` for the duration of the related work — that file is the durable source of truth, easier to edit reliably than a round-trip through the API.
- Avoid round-tripping the body through shell pipelines on Windows — `Out-File` may apply CRLF line-ending conversion or insert a UTF-8 BOM, which subsequently breaks string-matching edit tools that compose `old_str` from the original LF-terminated source. Editing the original-source local file sidesteps the entire encoding-mismatch class of failure (observed during issue #87 manipulation).
- If the body genuinely lives only on GitHub and a fetch is unavoidable, write it to a file via `gh issue view <N> --json body --jq .body > <path>` and then **inspect the file's encoding/line endings before relying on multi-line string matches against it** — `(Get-Content -Raw <path>) -match "\r\n"` will tell you if CRLFs were introduced.

#### Copilot PR Review Loop (non-docs changes)

Any change that is **not docs-only** must additionally pass an iterative GitHub Copilot review on the pull request itself. This is in addition to (not a replacement for) the local GPT-5.5 review above. "Docs-only" here means the change touches only paths covered by the CI/CD workflow's `paths-ignore` list (the enumerated top-level docs — `README.md`, `CONTEXT.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `LastSession.md`, `src/client/README.md`, `LICENSE`, `.gitignore`, `.editorconfig` — plus copilot/contributor instructions and PR/issue templates). **Story Mode catalog files at `content/stories/*.md` are product code, NOT docs** — they ship as `<EmbeddedResource>` in the API DLL, so a content-only edit must run CI, smoke test, and deploy. Treat such PRs as non-docs.

- **PR required.** Never push non-docs changes directly to `main`. **`gh pr merge --admin` is banned by default** for non-docs PRs and may be used only as a narrow exception when **all** of the following are true: (i) every other gate in this file is satisfied — local GPT-5.5 plan review (if applicable) and final-diff review, full pre-push verification (build + tests + e2e), Copilot PR review loop clean, and all review threads resolved; (ii) CI is green and the PR is otherwise mergeable (`mergeable == MERGEABLE`, no conflicts, not draft); (iii) the **only** remaining blocker is the missing `APPROVED` review and **no human approver can grant it** — including the case where the PR was opened by the orchestrator on the user's behalf via `gh pr create`, because GitHub blocks self-approval and the user (the sole human reviewer on this personal repo) is then both the author and the only possible approver, so `gh pr review --approve` will fail; and (iv) the rationale (which condition above is unmet, e.g. "PR authored on user's behalf, self-approval blocked") is documented in a PR comment before the merge. If any of these is false, do not use `--admin` — escalate to the user and ask for approval instead.
- **Add Copilot as a reviewer** as soon as the PR is opened. **Do NOT use `gh pr edit <N> --add-reviewer "@copilot"`** — gh CLI translates that to a `requestReviewsByLogin` GraphQL mutation that puts the slug in `userLogins[]`, but `copilot-pull-request-reviewer` is a Bot, not a User, so the API rejects it with `Could not resolve user with login 'copilot'`. Likewise the REST `POST /repos/{o}/{r}/pulls/{N}/requested_reviewers` endpoint with `{"reviewers":["Copilot"]}` returns HTTP 201 but silently no-ops (the reviewer list is unchanged on the next query). Use the `requestReviewsByLogin` mutation directly with the slug in `botLogins[]`:

  ```powershell
  # 1. Look up the PR's GraphQL node ID
  $prId = gh api graphql -f query='query { repository(owner:"<owner>",name:"<repo>"){ pullRequest(number:<N>){ id } } }' --jq .data.repository.pullRequest.id

  # 2. Request the Copilot bot reviewer
  $body = @{
    query = 'mutation($input:RequestReviewsByLoginInput!){requestReviewsByLogin(input:$input){clientMutationId}}'
    variables = @{ input = @{
      pullRequestId = $prId
      userLogins    = @()
      botLogins     = @("copilot-pull-request-reviewer")
      teamSlugs     = @()
      union         = $true
    } }
  } | ConvertTo-Json -Depth 10 -Compress
  $body | gh api graphql --input -
  ```

  Verify the request landed (the bot login should appear in `reviewRequests`):

  ```powershell
  gh api graphql -f query='query { repository(owner:"<owner>",name:"<repo>"){ pullRequest(number:<N>){ reviewRequests(first:10){ nodes{ requestedReviewer{ __typename ... on Bot{login} } } } } } }'
  ```

  The bot slug `copilot` is also accepted as an alias; `copilot-pull-request-reviewer[bot]` and `github-copilot` are NOT. `union: true` adds to the existing reviewer list rather than replacing it.

  Clicking "Request a review from Copilot" in the GitHub UI is an equivalent fallback if you're already in the browser.
- **Address every Copilot suggestion** — push fixes as additional commits on the PR branch. The dismissal policy from the Code Review section still applies: a suggestion may be dismissed only when clearly non-blocking, and the rationale must be recorded in a PR comment replying to that suggestion.
- **Re-request Copilot review after each push** of new commits using the same `requestReviewsByLogin` mutation above (it is idempotent — re-running with `union: true` just keeps the bot in the list and triggers a fresh review on the new commits), or the "Re-request review" button in the UI.
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

**Sequential Dependabot PRs and silent sibling-dep downgrades:**

When you process multiple Dependabot PRs in sequence, the second (and later) PRs may carry stale lockfile context that **silently downgrades a sibling dependency you just bumped in the first PR** — re-introducing whatever vulnerability you just closed. This is a real failure mode, not a theoretical one. PR #76 (`@babel/plugin-transform-modules-systemjs`) was rebased before PR #75 (`fast-uri`) merged; PR #76's rebased lockfile still contained `fast-uri@3.1.0` (the vulnerable version) even though PR #75 had just bumped it to `3.1.2`. Merging PR #76 as-is would have re-introduced the two `fast-uri` vulnerabilities I'd just closed.

Mitigations:

1. **After merging the first Dependabot PR in a sequence, comment `@dependabot rebase` on every other open Dependabot PR before validating it.** Do not trust the head you fetched before the prior merge — its lockfile predates the bump.
2. **The GPT-5.5 final-diff review prompt for Dependabot PRs MUST include an explicit "audit the entire lockfile diff for unrelated package shifts" instruction.** The Review Depth Checklist's category K (audit-whole-file) is the canonical hook; combine it with an explicit per-PR checklist item (added as the next available letter — L, M, …) titled "Dependency change correctness" with the rule "verify ONLY the targeted dep shifts; flag any sibling dep that moves in either direction". Without that item, the reviewer will look at the targeted package and miss the silent sibling downgrade.
3. **The verification-agent prompt for Dependabot PRs SHOULD include a `npm ls <bumped-package>` AND a `npm ls <other-recently-bumped-package>` sanity check** so that if a sibling silently downgrades, the resolved-version line in the structured output makes it visible to the orchestrator before merge.

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
- **Service-worker cache version bumps** (`questions-cache-vN`, `stories-cache-vN`, etc.) are required when the **content of a cached HTTP response** changes (API response shape, story body, sources, embedded question set, tag namespace additions). They are **NOT** required for **localStorage shape changes** — those are versioned/migrated in code (`migrateProgress` in `useProgress.ts` is the canonical pattern: handle missing keys by defaulting to a safe empty value, never reset the whole object). Adding `storyQuizHistory` to `naturalizationProgress` in PR #86 needed no SW cache bump because it didn't touch any cached HTTP response. Don't bump cache versions defensively for unrelated changes — the bump invalidates everyone's offline cache and forces a fresh download.

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
