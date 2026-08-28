# Ruleset 15368163 migration artifact

This document is a reviewed replacement plan, not an applied settings change.
The live active ruleset snapshot was re-read on 2026-08-28.

## Current complete state

- Name: `main-protection`
- Target: branch
- Condition: include `~DEFAULT_BRANCH`; no exclusions
- Enforcement: active
- Bypass: `RepositoryRole` actor ID 5, mode `always`
- Rules:
  1. deletion protection;
  2. non-fast-forward protection;
  3. required linear history;
  4. pull request:
     - one approving review;
     - dismiss stale reviews on push;
     - require code-owner review;
     - resolve all review threads;
     - do not require last-push approval;
     - require extra approval for unattributed changes;
     - no named required reviewers;
     - allow merge, squash, and rebase;
  5. strict required status checks, enforced on branch creation:
     - `Build & Test`;
     - `Analyze (csharp)`;
     - `Analyze (javascript-typescript)`;
     - `E2E (Playwright)`.

## Preconditions

Do not edit ruleset 15368163 until all are true:

- Repository-local policy workflow is on trusted `main`.
- Dedicated App is installed only on NaturalizationPuzzle with exact
  Metadata read, Pull requests write, and Checks write.
- `APP_CLIENT_ID` and `APP_PRIVATE_KEY` exist only as this repository's Actions
  secrets.
- An owner-authored ordinary PR shows an App-owned current-head
  `external-review-policy` check and App approval.
- Logs reveal no PEM, JWT, installation token, or authorization header.
- A disposable `policy-canary` branch has a separate active, identical,
  no-bypass ruleset requiring the four existing checks, one native approval,
  stale dismissal, resolved threads, and the App-source-bound policy check.
- CI/CD and CodeQL emit all four existing contexts for PRs targeting
  `policy-canary`.
- An owner-authored canary PR actually merges with only the App approval.
- An external canary PR without current-head owner approval is blocked and
  succeeds only after current-head approval.
- Reconciliation reopens a completed policy check as `in_progress`; an induced
  review API failure leaves it non-successful.

If the App approval does not count or check reopening fails, stop. Do not
change production rules.

## Exact target state

Replace the active ruleset with the same name, target, condition, enforcement,
and complete rule set, changing only the explicitly identified fields below.

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
      required_approving_review_count: 1
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
          expected_source: observed dedicated External Review Policy App
```

The API representation of expected source uses the observed App integration
identifier. Select the App-produced check in the settings UI after it exists;
never create a name-only requirement or guess the identifier.

The approved changes are therefore only:

1. remove the RepositoryRole bypass actor with no replacement;
2. set `require_code_owner_review` from `true` to `false`;
3. append the App-source-bound `external-review-policy` required check.

Everything else remains byte-for-field equivalent to the exported live
ruleset.

## Apply and verify

1. Export ruleset 15368163 immediately before editing.
2. Apply the exact target state in repository settings. Do not use an API token
   held by Copilot CLI.
3. Re-fetch the ruleset and compare every condition, bypass actor, rule, pull
   request parameter, merge method, strictness flag, and required context.
4. Verify an owner PR requires the four existing checks, the App-bound policy
   check, one App approval, and resolved threads.
5. Verify an external PR requires the same checks plus the owner's
   current-head human approval. The App must not approve it.
6. Verify new commits dismiss the native approval and the next policy
   reconciliation fails the new head until reapproval.
7. Verify direct updates, force pushes, and deletion remain blocked.
8. Only after production verification, remove temporary `policy-canary`
   workflow/CI configuration through a normal protected PR and delete the
   temporary branch/ruleset.

If validation fails, stop without bypass or admin merge. Preserve the four
existing checks, one approval, stale dismissal, resolved threads, deletion,
non-fast-forward and linear-history rules. Re-enable code-owner review if the
App-bound requirement must be removed during repair.

GitHub documents [required status checks and expected App sources][checks] and
[pull request review rules][reviews].

[checks]: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets#require-status-checks-to-pass-before-merging
[reviews]: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets#require-a-pull-request-before-merging
