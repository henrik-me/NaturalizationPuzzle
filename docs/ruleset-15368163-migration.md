# Ruleset 15368163 migration artifact

This is a reviewed rollout plan, **not** an applied settings change. Snapshot
captured 2026-08-27 from active repository ruleset `main-protection`.

## Current state to preserve until rollout

- Target: `~DEFAULT_BRANCH`; enforcement: active.
- Rules: block deletion and non-fast-forward updates; require linear history.
- Pull requests: one approval, dismiss stale approvals on push, require code
  owner review, resolve all review threads, retain the extra approval for
  unattributed Copilot changes, and allow merge/squash/rebase.
- Strict required checks:
  - `Build & Test`
  - `Analyze (csharp)`
  - `Analyze (javascript-typescript)`
  - `E2E (Playwright)`
- Bypass actor: `RepositoryRole` actor ID 5, mode `always`.

## Approved target state

Change only these two existing settings:

1. Set `require_code_owner_review` to `false`. Leave `.github/CODEOWNERS`
   unchanged.
2. Remove the `RepositoryRole` bypass actor. Configure no replacement bypass,
   including no administrator bypass.

Preserve every other rule and pull request parameter:

- one native approval;
- stale-approval dismissal on push;
- all review threads resolved;
- `require_last_push_approval: false`;
- `require_extra_approval_for_unattributed_changes: true`;
- the current allowed merge methods;
- strict/up-to-date required checks and `do_not_enforce_on_create: false`;
- deletion, non-fast-forward, and linear-history rules.

After the dedicated App has produced the check on a canary current head, add:

| Context | Expected source |
| --- | --- |
| `external-review-policy` | the observed dedicated External Review Policy GitHub App |

Bind the required check to the App's observed source/integration; do not add a
name-only context. Keep all four existing required checks.

## Preconditions and evidence

Do not edit the ruleset until all are true:

- Private policy `main` is protected with no bypass and its source digest
  verifies.
- Private policy config allowlists `henrik-me/NaturalizationPuzzle` and `main`.
- Private policy config temporarily allowlists `policy-canary`, with the
  workflow-embedded digest updated, while the disposable canary runs.
- The dedicated App is installed only on approved targets and reports exactly
  Metadata read, Pull requests write, and Checks write.
- `EXTERNAL_REVIEW_POLICY_DISPATCH_TOKEN` is provisioned as documented.
- The target workflows and policy contract test are on trusted `main`.
- The App-produced check has been observed on the authoritative current head.
- A disposable canary ruleset proves the App approval counts toward the one
  native approval and an external PR without a current-head human approval
  remains blocked.
- After the canary succeeds, its branch/ruleset and private-policy
  `policy-canary` allowlist entry are removed through the documented reviewed
  digest update.
- The full verification matrix in the private policy
  [setup guide][policy-setup] passes, including push-after-approval, base
  retarget, duplicate-head, main-push reconciliation, missing dispatcher, API
  failure, and scheduled reconciliation cases.

Export ruleset 15368163 immediately before applying and compare it with this
artifact. Apply through the repository settings UI so the observed App source
can be selected. Re-fetch the ruleset afterward and verify no other field
changed.

## Rollout and rollback

Keep the existing ruleset enforcing throughout rollout. After migration,
confirm all five required contexts, one native approval, and resolved threads
on both owner and external canary cases before using the gate for production
work.

If validation fails, stop rollout without bypass or admin merge. Restore a
blocking state that retains all four existing checks, one approval, stale
dismissal, resolved threads, and no bypass; re-enable code-owner review if the
external policy check must be removed while repaired. Preserve evidence and
repeat the full canary matrix before attempting the migration again.

GitHub documents [required checks and App source binding][ruleset-checks] and
[stale review behavior][ruleset-reviews].

[policy-setup]: https://github.com/henrik-me/github-pr-policy/blob/main/docs/setup.md
[ruleset-checks]: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets#require-status-checks-to-pass-before-merging
[ruleset-reviews]: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets#require-a-pull-request-before-merging
