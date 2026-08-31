# External review policy threat model

## Security objective

Only the dedicated GitHub App, acting from reviewed
NaturalizationPuzzle default-branch workflow code, can publish the required
`external-review-policy` result. Pull request code cannot choose identity,
approval, head SHA, check conclusion, or executable policy.

## Trust boundaries

Trusted:

- reviewed `.github/workflows/external-review-policy.yml` on `main`;
- GitHub's authenticated API responses after strict validation;
- immutable owner identity `henrik-me`/`34380746`;
- `APP_ID` and `APP_PRIVATE_KEY` in repository Actions secrets;
- the App identity attached to Checks API results;
- GitHub's authoritative owner attribution for ordinary-content PRs, including
  owner-attributed PRs created with the deliberately constrained Copilot CLI
  credential;
- GitHub-hosted runner and Actions control plane.

Untrusted:

- PR branches, forks, merge refs, changed files, titles, bodies, and event
  identity/review/head claims;
- artifacts, caches, packages, actions, and repository code;
- API response shapes until validated;
- error bodies, rate limits, network availability, and event delivery;
- Copilot CLI for policy, workflow, secret, administration, and ruleset
  operations; its ordinary-content PR authorship is intentionally
  owner-attributed and follows the trusted-author path.

## Controls

| Threat | Control | Failure behavior |
| --- | --- | --- |
| PR executes with App key | Policy uses `pull_request_target` default-branch code and performs no checkout, action, artifact, cache, package, or repository-code execution | No PR-controlled execution path exists |
| Review event reaches untrusted workflow context | Reviewed signal has empty permissions and a literal no-op; only owner/bootstrap App may write workflows; its completion wakes default-branch `workflow_run` policy code | Forks receive no secrets; an untrusted same-repo principal must not receive Workflows write; trusted run re-fetches all state |
| PR claims trusted author, approval, or SHA | Event data is not used for decisions; App API re-fetches every open PR and review | Invalid/missing API state stops evaluation |
| Policy PR changes its own evaluator | Until merge, PR events and schedules use old `main` policy; external authors need current-head owner approval | Proposed policy cannot approve itself |
| Copilot modifies policy or protection | Its fine-grained credential has no Workflows, Actions secrets, Administration, or ruleset write | API refuses the operation |
| App is installed broadly | Runtime requires selected-repository installation and mints a token explicitly scoped to NaturalizationPuzzle | Authentication fails before target API calls |
| App permission drift | Runtime requires exactly Metadata read, Pull requests write, and Checks write on App, installation, and token | Authentication fails |
| Fork review withholds secrets | Review signal needs no secrets; completed signal wakes trusted reconciliation; schedule remains independent | A PR can suppress or break its merge-ref signal and delay its own update, but cannot influence the eventual authoritative decision |
| Same-repo review event executes proposed YAML | GitHub uses the merge-ref signal definition, so Workflows write is denied to untrusted principals; the committed signal requests no secrets, while App work occurs only in default-branch `workflow_run` code | Safety depends on the documented workflow-write restriction; proposed ordinary code never reaches App execution |
| Owner approval predates a push | Effective review `commit_id` must equal authoritative current `head.sha` | New head fails until approved |
| Approval is later changed or dismissed | Latest decisive review per allowlisted identity wins; signal completion wakes reconciliation and schedule backs it up | Check returns to failure after authoritative reconciliation; during an App/API outage a same-head success can persist with no independent native-approval block (see residual risk 1) |
| Dependabot or another Bot is treated as owner | Generic Bot identities validate, but trusted authors and approvers must have exact immutable owner User identity | Bot PR requires current-head owner approval; Bot reviews are ignored |
| External PR receives App approval | Evaluator calls App approval only for immutable trusted author whose identity owns the head repository | External path never invokes approval |
| Another publisher forges the name | Ruleset binds the required context to the observed dedicated App source | Name-only result does not satisfy protection |
| Duplicate or racing runs | Global concurrency plus full reconciliation on every surviving run; PR/head-keyed App check IDs | Final authoritative state is re-fetched; but commit-scoped required checks are shared across duplicate-head PRs and are not yet failed closed (see residual risk 6) |
| Reviews/open PRs/checks are truncated | Bounds fail at 100 records rather than consume a partial page | Workflow fails; no new success |
| API/log error leaks credentials | Private key is never printed; derived credentials are masked; error bodies are bounded and redacted | Sanitized failure only |
| Policy disappears or workflow fails | No other component can publish the App-bound check | New heads remain blocked |

## Bootstrap boundary (completed)

Before the policy workflow reached `main`, GitHub forbade self-approval, so the
dedicated App temporarily received Contents and Workflows write solely to
author the reviewed bootstrap PR #173. `henrik-me` approved its frozen current
head, then immediately revoked those two permissions and verified the App's
exact runtime grant before the normal merge as `d1de384`. No `RepositoryRole`
bypass, admin merge, approval reduction, or code-owner-review disabling was
used.

A canary on a disposable branch under an identical temporary no-bypass ruleset
proved the observed platform semantics: at `required_approving_review_count` 1,
owner canary PR #174 carrying only the App's approval stayed `REVIEW_REQUIRED`
and could not merge, showing a GitHub App approval does not count toward a
native required-review count. The production ruleset therefore sets
`required_approving_review_count` to 0 and enforces owner review of external
PRs through the App-bound `external-review-policy` check rather than a native
approval. After the count was switched to 0, owner canary PR #174 merged as
`900f406` on CI plus the App-bound check; external App canary PR #175 was
blocked until the owner approved its current head, then merged as `60139a9`.

## Residual risks

1. **Pre-authentication stale success (zero-approval window).** The required
   check is commit-scoped and `required_approving_review_count` is 0, so an
   external PR's merge gate is solely the App-bound `external-review-policy`
   success on the current head; no native approval requirement blocks
   independently. If the owner dismisses or revokes an approval while the
   App/API or its reconciliation is unavailable, the workflow cannot flip the
   still-successful same-head check to failure, so the PR can merge on a stale
   success without a current valid approval. Do not assume safe immediate
   failure during such an outage. Mitigation and incident response: the merge
   remains gated by resolved threads and strict status, but on any owner
   dismissal or revocation treat the affected PR as merge-capable until the App
   reconciles; close the PR, push an invalidating new head, or disable the
   App-bound requirement or App installation until the App recovers and
   re-fetches. Monitor and alert on failed or missing scheduled reconciliation
   runs so the outage is detected promptly. Once the App is reachable again, a
   new head after dismissal still fails until re-approved.
2. **Review signal delivery.** The local secretless signal and trusted
   `workflow_run` normally propagate review changes immediately after Actions
   scheduling, but a PR can modify/remove its merge-ref signal and delivery or
   queueing can fail or lag. Scheduled reconciliation remains the independent
   roughly 15-minute timing guarantee and backstop.
3. **Reopening check support.** The canary confirmed the Checks API returns a
   completed check to `in_progress` on reconciliation; an induced review API
   failure leaves it non-successful.
4. **App-key concentration.** The same App key creates both the trusted-owner
   review and check. Compromise defeats both layers. Restrict installation,
   use hardware-backed owner MFA, rotate keys, and audit every App review.
5. **Workflow-capable collaborators.** A same-repository writer with workflow
   permission can create a branch workflow that references repository
   secrets. Keep that permission limited to the owner and exclude automation.
6. **Duplicate-head cross-PR bypass (code hardening required).** Required
   status checks are commit-scoped, and the ruleset matches the
   `external-review-policy` context by name and App source on the head commit;
   it ignores the App's PR-specific `external_id`. If two open PRs share the
   same head SHA, a success the App wrote for the approved PR is visible at that
   same commit to the other PR, so an unapproved duplicate-head PR could satisfy
   the gate -- a potential bypass. The current workflow does not fail closed
   across duplicate-head PRs, so do not treat the deterministic external IDs as
   sufficient separation for merge protection. A code hardening change (detect
   multiple open PRs sharing one head and refuse to write, or actively fail,
   the check for every PR except the authoritatively approved one) is a required
   follow-up before POL-001 is considered complete or the design is reused for
   another rollout. Operational mitigation until then: detect and close
   duplicate-head PRs, and disable the App-bound requirement or the App
   installation while investigating; never bypass.
7. **GitHub availability.** Actions or API outages deny policy freshness and
   may deny merges. This is intentional fail-closed behavior except for the
   zero-approval stale-success window in residual risk 1, which can permit a
   merge on an already-successful head during an App/API outage.
8. **Review flooding.** A PR with 100 reviews fails closed. Each pushed owner
   head normally appends an App approval; each approved external head appends
   an owner review; automated reviewers can add more per push. With 99 records
   and no current-head App approval, policy re-fetches and refuses to create
   record 100. GitHub has no atomic count-and-create review API, so a
   concurrent review can still race that last check; subsequent reconciliation
   fails closed. Preserve the old PR as evidence and replace it rather than
   widening the bound. The replacement must repeat CI, reviews/thread
   handling, and current-head owner approval.
9. **Proven platform semantics.** The canary proved that a GitHub App approval
   does not count toward a native required-review count and that a completed
   check can reopen. Production enforcement relies on the App-bound check with
   `required_approving_review_count` 0, not on native App-approval counting.
10. **Account-level attribution.** GitHub does not distinguish an interactive
    owner action from a fine-grained token acting as that owner. The policy
    intentionally trusts both for ordinary-content PRs. Its safety depends on
    the Copilot credential having no Workflows, Actions secrets,
    Administration, or ruleset write permission, and on retaining those
    denials.

Official GitHub references are collected in
[`external-review-policy.md`](external-review-policy.md#official-references).
