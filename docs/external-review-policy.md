# External review policy operations

NaturalizationPuzzle owns and executes its review policy locally in
`.github/workflows/external-review-policy.yml`. The private
`henrik-me/github-pr-policy` repository is a reviewed design reference only;
there is no runtime dispatch, token, checkout, or availability dependency on
it.

The workflow contains all executable policy and GitHub App authentication
logic. It never checks out repository or pull request code, loads actions,
consumes artifacts or caches, or evaluates event claims about identity,
reviews, or the head SHA. Every run authenticates the dedicated App and
re-fetches open pull requests and reviews from GitHub's API.

## Policy

- An open PR to `main` is a trusted-author PR when its authoritative author is
  the human account `henrik-me` with immutable user ID `34380746` and that same
  identity owns the head repository. The App writes a passing
  `external-review-policy` check on the authoritative current head only for a
  unique protected head after a successful fail-closed reconciliation; trusted
  authorship is necessary but not sufficient, and duplicate-head detection
  (see below) or any reconciliation error deliberately withholds success. The
  workflow creates no App approval or review of any kind; GitHub tallies no App
  review, and none is written. Owner PRs merge on green CI plus the App-bound
  check, with zero native approvals required.
- Every other PR passes the App-bound check only when the latest decisive
  review from the allowlisted human `henrik-me`/`34380746` is `APPROVED` for
  the authoritative current head. This current-head enforcement holds during
  successful reconciliation of a unique head. Duplicate protected heads are
  failed closed in code (App-authored PR #177, main commit `6e15df2`), but
  three residual timing risks remain: a same-head stale-success window during
  an App/API/reconciliation outage; a reviews-read-to-check-write race; and a
  final authoritative PR snapshot-to-write race (see the
  [threat model](external-review-policy-threat-model.md) residual risks 1 and
  6). The App never writes any review of an external-author PR.
- Dependabot is an external Bot author. Its PRs require the allowlisted owner's
  approval of the authoritative current head, because otherwise the App-bound
  check is a failure; green dependency checks do not substitute for that
  approval. A Dependabot rebase or other branch update changes the head, so
  strict branch protection dismisses the old approval and policy requires a new
  current-head approval.
- Missing secrets, invalid API data, API errors, pagination bounds, permission
  drift, suspended or broad installation state, and check-write failures stop
  the workflow. There is no success fallback.

The App writes `external-review-policy` on the authoritative current head.
Ruleset 15368163 binds that required context to the observed dedicated App
source (NP-APP integration ID `4755833`), not merely to the check name.

## Event model

Trusted default-branch runs occur for:

- `pull_request_target` open, reopen, synchronize, edit, close, and
  ready-for-review events;
- pushes to `main`;
- completion of the repository-local `External review policy signal` workflow;
- reconciliation at minutes 7, 22, 37, and 52 each hour.

Every surviving run reconciles every open PR. With
`cancel-in-progress: false`, GitHub preserves the running workflow, but the
default single pending run can still be canceled and replaced by a newer run.
That replacement is safe because the survivor re-fetches the complete
authoritative set, as documented by GitHub's [concurrency semantics][concurrency].

The reviewed `.github/workflows/external-review-policy-signal.yml` receives
`pull_request_review` submit, edit, and dismiss events with `permissions: {}`.
Its committed job has no secrets, checkout, action, event interpolation,
artifact, cache, package, network request, or PR-code execution, and cannot
make a policy decision. GitHub executes the event's merge-ref workflow
definition, so preventing an untrusted same-repository author from changing
that definition is load-bearing: only the owner and the temporary bootstrap
App may have Workflows write, and the Copilot CLI credential must not.
Fork-authored definitions receive no repository secrets. Because
NaturalizationPuzzle is a personal repository, a review submitted by an
external reviewer such as Copilot can require a one-time Actions approval
before its signal run starts; after that approval the signal job remains
no-permission, no-secret, and no-checkout. When the signal job
completes, `workflow_run` wakes the trusted default-branch policy workflow,
which ignores predecessor claims, authenticates the App, and authoritatively
re-fetches every open PR, head, and review before making any App decision.
This normally propagates approval, revocation, or dismissal immediately after
Actions schedules the two runs; the quarter-hour schedule remains the
delivery/outage backstop. A PR can alter or remove its merge-ref signal and
delay its own update, but cannot affect the independent schedule or the
authoritative decision made when trusted reconciliation runs.

The split is required because placing App secrets directly in a
`pull_request_review` workflow would cross the untrusted PR/merge-ref boundary.
It is entirely local to NaturalizationPuzzle: no repository dispatch, central
or private repository, external token, artifact handoff, or runtime dependency
participates.

`workflow_dispatch` is also omitted because it can select a non-default ref.
Only event classes that execute the protected base/default-branch workflow may
receive the App secrets.

## App and secret requirements

Register a dedicated GitHub App with no webhook and no OAuth user
authorization. Grant exactly:

| Repository permission | Level | Purpose |
| --- | --- | --- |
| Metadata | Read | Installation and repository identity |
| Pull requests | Read | Read authoritative PR and review state |
| Checks | Read and write | Create and update the App-owned required check |

The current steady-state runtime grant is exactly Checks write, Metadata read,
and Pull requests read. This became correct only after App-authored PR #177
(main commit `6e15df2`) removed all review creation from the workflow. Before
PR #177 the workflow created informational `np-app[bot]` App approvals, so Pull
requests **write** was then the steady-state grant; the App-authored bootstrap
PR #173 and hardening PR #177 were both authored while Pull requests write was
still steady state, not under a temporary elevation. Since PR #177 the workflow
writes no review, so Pull requests write is no longer part of steady state.
Going forward it would be granted only temporarily -- for example if the App
must author a future publication PR after this read-only downgrade -- and
revoked immediately afterward.

Subscribe to no events and install it using **Only select repositories**, with
only `henrik-me/NaturalizationPuzzle` selected.

Store only these repository Actions secrets in NaturalizationPuzzle:

- `APP_ID` -- the numeric App ID shown on the App settings page;
- `APP_PRIVATE_KEY` -- the complete generated private-key PEM.

Do not put either value in source, issues, logs, artifacts, caches, chat, or an
environment accessible to other workflows. This change records the names
only; it does not create or handle either secret.

The workflow mints a short-lived RS256 JWT, verifies the App and installation
permissions at runtime, and requests an installation token explicitly scoped
to NaturalizationPuzzle and the same three permissions. Derived credentials
are masked before further use.

## Credential trust boundary

The Copilot CLI fine-grained credential must have:

- **Workflows: no access**;
- **Actions secrets: no access**;
- **Administration: no access**;
- no ruleset write permission.

Those denials are load-bearing. All executable policy is inside
`.github/workflows/external-review-policy.yml`; GitHub requires workflow
permission to modify workflow files. The credential may modify ordinary
contents only within its separately approved repository scope, but cannot
change this policy, expose its secrets, install the App, or alter the required
check/ruleset.

GitHub identifies a PR by account, not by whether `henrik-me` acted
interactively or through a fine-grained token. Owner-attributed ordinary-code
PRs created by Copilot CLI therefore intentionally use the trusted-author
path. The security boundary is the credential's inability to modify workflows,
read Actions secrets, administer the repository, or write rulesets -- not an
attempt to distinguish sessions belonging to the same account.

Do not grant workflow-write permission to other automation or collaborators.
A same-repository branch author with that permission could propose or execute
workflow changes; fork PRs do not receive repository secrets.

## Completed no-bypass bootstrap and rollout

This rollout is complete. Every step was executed without a `RepositoryRole`
bypass, admin merge, self-approval, or settings weakening.

1. The dedicated App was registered, installed only on NaturalizationPuzzle,
   and `APP_ID` and `APP_PRIVATE_KEY` were created as repository Actions
   secrets.
2. Before the policy executed on `main`, the dedicated App was temporarily
   granted the additional Contents and Workflows write permissions needed to
   create a branch containing the reviewed bootstrap commit and author the
   bootstrap PR. Pull requests write was already the steady-state grant at that
   time, because the pre-PR-#177 workflow created informational `np-app[bot]`
   App approvals; only Contents and Workflows write were the temporary
   elevation.
3. `henrik-me` reviewed and approved the App-authored bootstrap PR #173 at its
   frozen current head. Only the temporary Contents and Workflows write access
   was revoked; the App was verified back to its then-steady-state grant of
   Checks write, Metadata read, and Pull requests write (Pull requests write
   remained because the workflow still created informational App approvals),
   and the PR merged normally as `d1de384`.
4. The `main` push then ran the protected local policy. An owner-authored PR
   showed the App-owned current-head check and, under that pre-PR-#177
   workflow, an informational `np-app[bot]` APPROVED review that did not count
   toward the native required-review count. Logs revealed no credential
   disclosure.
5. A disposable `policy-canary` branch and an identical temporary no-bypass
   ruleset targeting only that branch required the four existing CI contexts,
   resolved threads, and the observed App-bound `external-review-policy` check.
   This canary evidence is complete and disposable; the branch and its ruleset
   are being retired (see the cleanup order below).
6. On the canary ruleset an owner-authored PR was first tested with
   `required_approving_review_count` 1. Owner canary PR #174, carrying the
   pre-PR-#177 workflow's informational `np-app[bot]` APPROVED review as its
   only review, remained `REVIEW_REQUIRED` and could not merge -- directly
   proving that a GitHub App approval does not count toward a native
   required-review count. The count was then switched to 0 under the same
   no-bypass ruleset, and PR #174 merged normally as `900f406` on green CI plus
   the App-bound check. External App canary PR #175 was blocked before the
   owner approved its current head, then merged normally as `60139a9` after
   that approval.
7. The reviewed [ruleset 15368163 migration](ruleset-15368163-migration.md)
   was applied: `bypass_actors` empty, `required_approving_review_count` 0,
   `require_code_owner_review` false, and the App-source-bound
   `external-review-policy` check appended.
8. Production proofs followed under the pre-PR-#177 workflow: owner security
   PR #168 merged as `85481ad` (it too carried an informational `np-app[bot]`
   APPROVED review that did not count natively), and Dependabot PR #153 merged
   as `dd7905f` after an owner approval of its current head. NaturalizationPuzzle
   now has zero open Dependabot alerts.
9. Duplicate protected pull request heads were made fail-closed in code through
   the App-authored PR #177, merged to `main` as commit `6e15df2`. The workflow
   detects multiple open protected PRs that share one head SHA and fails the
   `external-review-policy` check for every such PR, closing the former
   duplicate-head cross-PR gap in code. PR #177 also removed all App review
   creation: since `6e15df2` the workflow writes no `np-app[bot]` approval or
   review, which is what makes the steady-state Pull requests read grant valid.

Production steady state is now zero native approvals, an empty `bypass_actors`
list, and the NP-APP-bound `external-review-policy` required check. The
temporary `policy-canary` branch and its ruleset are completed, disposable
canary evidence and are the only remaining cleanup.

### Safe cleanup order (settings actions performed by the owner)

Perform these steps in this exact order. Deleting the ruleset first would strip
all protection from the still-live `policy-canary` branch, leaving an
unprotected live-branch interval until the branch is deleted; keeping the
ruleset (minus only the deletion restriction) preserves every other protection
right up to the moment the branch is removed:

1. The owner edits the temporary canary ruleset (#21943248) to remove **only**
   the deletion-protection rule, retaining every other protection on
   `policy-canary`.
2. The agent or user deletes the `policy-canary` branch.
3. The owner deletes the now-orphaned temporary ruleset #21943248.

This PR removes the `policy-canary` protected base from the policy workflow and
the `policy-canary` filters from the CI and CodeQL workflows; the branch and
ruleset deletions above are owner settings actions taken after it merges.

## Maintenance and incidents

- Policy changes use an ordinary PR. `pull_request_target` and scheduled runs
  continue executing the old default-branch policy until merge. An external
  policy PR therefore remains blocked until the allowlisted human approves its
  current head.
- On every reevaluation after successful App authentication and authoritative
  head lookup, the workflow reopens matching App checks as `in_progress`
  before fetching reviews.
- Review lists deliberately fail closed at 100 returned records. The workflow
  writes no App approval or review, so it never contributes to this count;
  growth is append-only from the owner's reviews of external heads and from
  review tools on the same push. When a review list reaches 100 records the
  workflow fails closed and writes no new success. Do not redesign pagination
  or widen the bound here. Preserve the old PR as evidence and replace it
  before record 100; replacement resets the review list but costs a new PR,
  complete CI/review reruns, resolved-thread handling, and a fresh owner
  approval of the replacement's current head.
- Alert on failed or missing scheduled runs and on any unexpected write by the
  App to PRs not authored by `henrik-me`/`34380746`.
- On suspected compromise, contain in the safe order before touching the App:
  first establish an App-independent block by setting
  `required_approving_review_count` to 1 (or another independently unsatisfied
  required gate) and closing or invalidating affected PR heads, because
  suspending the App alone does not invalidate an already-successful stale
  check and removing the App-bound rule alone deletes the only external-approval
  gate. Only then suspend or disable the App installation and rotate its key.
  Restore reviewed workflow code through the protected PR process (see the
  [ruleset record](ruleset-15368163-migration.md) rollback sequence), then
  switch the native count back to 0. Never add a success fallback or bypass.

See the local [threat model](external-review-policy-threat-model.md).

## Official references

- [Secure use and untrusted workflow checkout][secure-use]
- [`pull_request_target` and `pull_request_review` event contexts][events]
- [Secrets withheld from fork workflows][fork-secrets]
- [GitHub App JWTs][app-jwt]
- [Installation token scoping][installation-token]
- [Checks API and App-only writes][checks-api]
- [Fine-grained token permissions][fine-grained]
- [Workflow concurrency and pending-run replacement][concurrency]

[secure-use]: https://docs.github.com/en/actions/reference/security/secure-use#mitigating-the-risks-of-untrusted-code-checkout
[events]: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows
[fork-secrets]: https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions#accessing-secrets
[app-jwt]: https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-json-web-token-jwt-for-a-github-app
[installation-token]: https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app
[checks-api]: https://docs.github.com/en/rest/checks/runs
[fine-grained]: https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens
[concurrency]: https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency
