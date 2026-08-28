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

- An open PR to `main` or temporary `policy-canary` succeeds when its
  authoritative author is the human account `henrik-me` with immutable user ID
  `34380746` and that same identity owns the head repository. The App
  idempotently approves the authoritative current head.
- Every other PR succeeds only when the latest decisive review from the
  allowlisted human `henrik-me`/`34380746` is `APPROVED` for the authoritative
  current head. The App never approves an external-author PR.
- Dependabot is an external Bot author. Its PRs require the allowlisted owner's
  approval of the authoritative current head; green dependency checks do not
  substitute for that approval. A Dependabot rebase or other branch update
  changes the head, so strict branch protection dismisses the old approval and
  policy requires a new current-head approval.
- Missing secrets, invalid API data, API errors, pagination bounds, permission
  drift, suspended or broad installation state, and check-write failures stop
  the workflow. There is no success fallback.

The App writes `external-review-policy` on the authoritative current head.
Ruleset 15368163 must eventually bind that required context to the observed
dedicated App source, not merely to the check name.

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
Fork-authored definitions receive no repository secrets. When the signal job
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
| Pull requests | Read and write | Read authoritative PR/reviews and approve trusted-owner PRs |
| Checks | Read and write | Create and update the App-owned required check |

Subscribe to no events and install it using **Only select repositories**, with
only `henrik-me/NaturalizationPuzzle` selected.

Store only these repository Actions secrets in NaturalizationPuzzle:

- `APP_CLIENT_ID` — the App client ID, not a client secret;
- `APP_PRIVATE_KEY` — the complete generated private-key PEM.

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
read Actions secrets, administer the repository, or write rulesets—not an
attempt to distinguish sessions belonging to the same account.

Do not grant workflow-write permission to other automation or collaborators.
A same-repository branch author with that permission could propose or execute
workflow changes; fork PRs do not receive repository secrets.

## No-bypass bootstrap and rollout

1. Register the App, install it only on NaturalizationPuzzle, and create
   `APP_CLIENT_ID` and `APP_PRIVATE_KEY` in repository Actions secrets.
2. Before the policy executes on `main`, temporarily grant this dedicated App
   only the additional Contents and Workflows write permissions needed to
   create a branch containing the reviewed bootstrap commit and author the
   bootstrap PR. Pull requests write is already part of its eventual runtime
   grant. This is an owner-operated provisioning step, not implemented here.
3. `henrik-me` reviews and approves the App-authored bootstrap PR's frozen
   current head. Immediately revoke Contents and Workflows access, verify the
   App is back to exactly Metadata read, Pull requests write, and Checks write,
   and only then merge normally. Any head update invalidates the approval and
   must repeat current-head review; never use RepositoryRole bypass, admin
   merge, self-approval, or settings weakening.
4. After normal merge, the `main` push runs the protected local policy. Open an
   ordinary owner-authored PR and observe the App-owned current-head check and
   App approval. Inspect logs for credential disclosure.
5. Create a disposable `policy-canary` branch and an identical temporary
   no-bypass ruleset targeting only that branch. Require the four existing CI
   contexts, one approval with stale dismissal, resolved threads, and the
   observed App-bound `external-review-policy` check.
6. Merge an owner-authored canary PR using only the App approval and green
   checks. Confirm the App approval counts in the review summary. Confirm an
   external canary PR without current-head human approval remains blocked,
   then approve its current head and verify the policy changes to success.
7. If and only if the canary passes, apply the reviewed
   [ruleset 15368163 migration](ruleset-15368163-migration.md).
8. After production migration, remove `policy-canary` from the policy workflow
   and CI/CodeQL PR filters in a normally evaluated owner-authored PR. The
   canary has already proved the App approval counts, and production no longer
   requires a code-owner review. Then delete the temporary branch and ruleset.

If the App approval does not count toward one native approval, stop. The
owner-required fallback is a distinct write/admin human approver; do not set
required approvals to zero and do not add a bypass.

## Maintenance and incidents

- Policy changes use an ordinary PR. `pull_request_target` and scheduled runs
  continue executing the old default-branch policy until merge. An external
  policy PR therefore remains blocked until the allowlisted human approves its
  current head.
- On every reevaluation after successful App authentication and authoritative
  head lookup, the workflow reopens matching App checks as `in_progress`
  before fetching reviews.
- Review lists deliberately fail closed at 100 returned records. Observed
  growth is append-only at this API boundary: each new owner-authored head
  normally adds one App approval, each newly approved external head adds an
  owner review, and review tools can add further records on the same push.
  At 99 records without a current-head App approval, the workflow refuses to
  create record 100. Do not redesign pagination or widen the bound here.
  Preserve the old PR as evidence and replace it before record 100;
  replacement resets the review list but costs a new PR, complete CI/review
  reruns, resolved-thread handling, and a fresh owner approval of the
  replacement's current head.
- Alert on failed or missing scheduled runs and App approvals on PRs not
  authored by `henrik-me`/`34380746`.
- On suspected compromise, disable the App installation and rotate its key.
  Restore reviewed workflow code through the protected PR process. Never add a
  success fallback or bypass.

See the local [threat model](external-review-policy-threat-model.md).

## Official references

- [Secure use and untrusted workflow checkout][secure-use]
- [`pull_request_target` and `pull_request_review` event contexts][events]
- [Secrets withheld from fork workflows][fork-secrets]
- [GitHub App JWTs][app-jwt]
- [Installation token scoping][installation-token]
- [Checks API and App-only writes][checks-api]
- [Create a pull request review][create-review]
- [Fine-grained token permissions][fine-grained]
- [Workflow concurrency and pending-run replacement][concurrency]

[secure-use]: https://docs.github.com/en/actions/reference/security/secure-use#mitigating-the-risks-of-untrusted-code-checkout
[events]: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows
[fork-secrets]: https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions#accessing-secrets
[app-jwt]: https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-json-web-token-jwt-for-a-github-app
[installation-token]: https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app
[checks-api]: https://docs.github.com/en/rest/checks/runs
[create-review]: https://docs.github.com/en/rest/pulls/reviews#create-a-review-for-a-pull-request
[fine-grained]: https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens
[concurrency]: https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency
