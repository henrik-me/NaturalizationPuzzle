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
  current head and that human is not the PR author. The App never approves an
  external-author PR. An owner-authored PR whose head repository is controlled
  by another identity deliberately remains blocked because GitHub does not
  permit the owner to approve their own PR; recreate it from an owner-controlled
  branch or use a separately approved human reviewer.
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
- reconciliation at minutes 7, 22, 37, and 52 each hour.

Every surviving run reconciles every open PR. With
`cancel-in-progress: false`, GitHub preserves the running workflow, but the
default single pending run can still be canceled and replaced by a newer run.
That replacement is safe because the survivor re-fetches the complete
authoritative set, as documented by GitHub's [concurrency semantics][concurrency].

There is intentionally no direct `pull_request_review` trigger. GitHub assigns
that event the PR merge ref and merge commit, so a same-repository PR can
change the workflow definition that receives repository secrets. Fork-triggered
workflows, conversely, do not receive repository secrets. Running App secrets
on that event would therefore either expose them to proposed workflow code or
fail to evaluate forks. A separate secretless signal plus trusted
`workflow_run` could provide immediate review wake-up, but the approved local
architecture explicitly removes that dependency. Human review changes are
therefore reflected by the next scheduled reconciliation, within roughly 15
minutes under normal GitHub availability.

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
2. Have a distinct external human author the initial bootstrap PR containing
   this workflow and its tests. The current owner-authored branch cannot be
   approved by its own author, and the App policy is not active before merge.
3. `henrik-me` reviews the bootstrap PR's current head. The existing one
   approval and code-owner rules can then be satisfied without self-approval,
   RepositoryRole bypass, admin merge, or settings weakening.
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
