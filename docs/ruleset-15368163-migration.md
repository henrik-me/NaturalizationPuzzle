# Ruleset 15368163 applied-state record

This document records the applied state of ruleset 15368163, the verification
that accompanied it, and the rollback procedure. The migration is complete: the
reviewed target state has been applied to the live active ruleset, and the
owner, external, and Dependabot proofs have all passed.

## Current complete state (applied)

- Name: `main-protection`
- Target: branch
- Condition: include `~DEFAULT_BRANCH`; no exclusions
- Enforcement: active
- Bypass: none (`bypass_actors` empty)
- Rules:
  1. deletion protection;
  2. non-fast-forward protection;
  3. required linear history;
  4. pull request:
     - `required_approving_review_count` 0 (no native approval required);
     - dismiss stale reviews on push;
     - do not require code-owner review;
     - resolve all review threads;
     - do not require last-push approval;
     - require extra approval for unattributed Copilot changes;
     - no named required reviewers;
     - allow merge, squash, and rebase;
  5. strict required status checks, enforced on branch creation:
     - `Build & Test`;
     - `Analyze (csharp)`;
     - `Analyze (javascript-typescript)`;
     - `E2E (Playwright)`;
     - `external-review-policy`, bound to the observed dedicated App source
       (NP-APP integration ID `4755833`).

A GitHub App approval does not count toward the native required-review count;
the canary proved this. Enforcement of owner review on external PRs is carried
by the App-bound `external-review-policy` check, not by a native approval, so
`required_approving_review_count` is 0.

## Applied change set

The following fields changed from the pre-migration ruleset; everything else
remained byte-for-field equivalent to the exported live ruleset:

1. removed the `RepositoryRole` bypass actor with no replacement
   (`bypass_actors` now empty);
2. set `required_approving_review_count` from 1 to 0;
3. set `require_code_owner_review` from `true` to `false`;
4. appended the App-source-bound `external-review-policy` required check.

## Exact target state (as applied)

```text
name: main-protection
target: branch
enforcement: active
conditions.ref_name.include: [~DEFAULT_BRANCH]
conditions.ref_name.exclude: []
bypass_actors: []

rules:
  - deletion
  - non_fast_forward
  - required_linear_history
  - pull_request:
      required_approving_review_count: 0
      dismiss_stale_reviews_on_push: true
      required_reviewers: []
      require_code_owner_review: false
      require_last_push_approval: false
      required_review_thread_resolution: true
      require_extra_approval_for_unattributed_changes: true
      allowed_merge_methods: [merge, squash, rebase]
  - required_status_checks:
      strict_required_status_checks_policy: true
      do_not_enforce_on_create: false
      required_status_checks:
        - context: Build & Test
        - context: Analyze (csharp)
        - context: Analyze (javascript-typescript)
        - context: E2E (Playwright)
        - context: external-review-policy
          integration_id: 4755833
```

The API representation binds the `external-review-policy` context to the
observed App integration ID `4755833` (NP-APP). The App-produced check was
selected in the settings UI after it existed; the requirement is never a
name-only requirement.

## Completed verification

The following were verified after applying the target state:

1. The live ruleset was exported immediately before editing, applied in
   repository settings (not via an API token held by Copilot CLI), then
   re-fetched and compared field by field: condition, empty bypass actors, each
   rule, every pull request parameter, merge methods, strictness flag, and each
   required context matched the target state.
2. Owner PRs merged on the four existing checks plus the App-bound policy
   check, with zero native approvals and resolved threads. This verification
   ran under the pre-PR-#177 workflow, which posted an informational
   `np-app[bot]` APPROVED review on owner PRs; that review did not count toward
   the native required-review count and was never an enforcement layer —
   enforcement was carried solely by the App-bound `external-review-policy`
   check. Owner security PR #168 merged as `85481ad`, carrying such an
   informational App approval. (Since App-authored PR #177 / `6e15df2` the
   workflow creates no review at all.)
3. External PRs required the owner's current-head APPROVED human review,
   surfaced through the App-bound check; the App never approved them, even under
   the pre-PR-#177 workflow that approved trusted-owner PRs. External App canary
   PR #175 was blocked before owner approval, then merged as `60139a9` after
   current-head approval.
4. Live-observed: a review submission completed the secretless signal, woke the
   trusted `workflow_run`, and propagated authoritative state immediately
   without waiting for the scheduled backstop; a new commit left the new head's
   App-bound check non-successful, blocking the merge until re-approval.
5. Configured and unit-tested but not live-proven (pending): review edit and
   review dismissal completing the signal and driving reconciliation, and a
   post-approval Dependabot rebase invalidating a prior approval. These follow
   the same code path but were not exercised end-to-end in production. The
   actual Dependabot PR #153 rebase occurred before any owner approval, so it
   did not test post-approval invalidation; PR #153 required and received a
   current-head owner approval and merged as `dd7905f`. NaturalizationPuzzle
   now has zero open Dependabot alerts.
6. Direct updates, force pushes, and deletion remained blocked.
7. Owner canary PR #174 merged as `900f406`, and the App-authored bootstrap
   PR #173 merged as `d1de384`, both without any bypass.

## Remaining cleanup

Duplicate-head hardening has landed (App-authored PR #177, main commit
`6e15df2`). The only remaining cleanup is the disposable `policy-canary` branch
and its separate temporary no-bypass ruleset (#21943248). This cleanup PR
removes the `policy-canary` protected base from the policy workflow and the
`policy-canary` filters from the CI and CodeQL workflows. After it merges, the
owner performs the branch and ruleset deletions in this exact order. Deleting
the ruleset first would strip all protection from the still-live `policy-canary`
branch, leaving an unprotected live-branch interval until the branch is
deleted; keeping the ruleset (minus only the deletion restriction) preserves
every other protection until the branch is gone:

1. The owner edits the temporary canary ruleset (#21943248) to remove **only**
   the deletion-protection rule, retaining every other protection on
   `policy-canary`.
2. The agent or user deletes the `policy-canary` branch.
3. The owner deletes the now-orphaned temporary ruleset #21943248.

## Remaining issues

- **Duplicate-head cross-PR reuse (fail-closed in code).** Required status
  checks are commit-scoped, and the ruleset matches the `external-review-policy`
  context by name and App source on the head commit, ignoring the App's
  PR-specific `external_id`. Two open PRs that share one head SHA see the same
  commit-scoped check. This reuse is now failed closed in code: App-authored
  PR #177 (`6e15df2`) detects multiple open protected PRs sharing one head SHA
  and fails the check for every such PR, so no unapproved duplicate-head PR
  inherits an approved PR's success. Two narrow residual timing races remain (a
  reviews-read-to-check-write race and a final authoritative PR
  snapshot-to-write race); both self-correct on the next reconciliation. See
  threat model residual risk 6 for containment. Containment is an independent
  native block, not disabling the App: through owner settings raise
  `required_approving_review_count` to 1 (or add another independently
  unsatisfied required gate) and close all affected duplicate-head PRs or move
  their heads. Do not disable the App-bound requirement or suspend the App as
  the containment step.
- **Zero-approval stale-success window.** With `required_approving_review_count`
  0, an owner dismissal during an App/API outage can leave a still-successful
  same-head check as the only gate. See threat model residual risk 1 for
  monitoring and incident response.

## Rollback (no-bypass repair)

Repairs never use a `RepositoryRole` bypass, admin merge, or self-approval, and
they never remove the external-approval gate before an independent one is
active. Because `required_approving_review_count` is 0 and the sole owner
cannot self-approve, naively removing the App-bound `external-review-policy`
requirement and relying on a restored native owner approval would deadlock this
single-owner repository. Use this exact sequence:

1. Establish an independent block, then disable only the failed check. Through
   owner settings, set `required_approving_review_count` to 1 and, only after
   that native block is active, remove or temporarily disable only the failed
   App check. Add no bypass actors. Preserve the CI checks, deletion,
   non-fast-forward, linear-history, stale dismissal, and thread-resolution
   rules.
2. Author the repair PR independently of `henrik-me`. Prefer a newly created or
   dedicated temporary repair App granted Contents and Workflows write, or a
   distinct human writer. If the existing App still authenticates and only its
   workflow logic is broken, it may author the repair PR temporarily; if it is
   compromised or suspended, use a separate repair App instead.
3. `henrik-me` submits an APPROVED review at the repair PR's exact current head.
4. Merge normally. Because native approvals is 1 and the author is not the
   owner, the owner's approval is a valid, counted gate with no App dependency.
5. Restore and verify the App-bound `external-review-policy` check, then switch
   `required_approving_review_count` back to 0.
6. Revoke the temporary repair App's Contents and Workflows write (or retire the
   dedicated repair App).

If no independent author is available, the repository remains intentionally
frozen until one is; do not use admin merge or a bypass to break the freeze.

GitHub documents [required status checks and expected App sources][checks] and
[pull request review rules][reviews].

[checks]: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets#require-status-checks-to-pass-before-merging
[reviews]: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets#require-a-pull-request-before-merging
