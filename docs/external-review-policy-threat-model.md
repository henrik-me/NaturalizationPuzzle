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
| App permission drift | Runtime requires exactly Metadata read, Pull requests read, and Checks write on App, installation, and token | Authentication fails |
| Fork review withholds secrets | Review signal needs no secrets; completed signal wakes trusted reconciliation; schedule remains independent | A PR can suppress or break its merge-ref signal and delay its own update, but cannot influence the eventual authoritative decision |
| Same-repo review event executes proposed YAML | GitHub uses the merge-ref signal definition, so Workflows write is denied to untrusted principals; the committed signal requests no secrets, while App work occurs only in default-branch `workflow_run` code | Safety depends on the documented workflow-write restriction; proposed ordinary code never reaches App execution |
| Owner approval predates a push | Effective review `commit_id` must equal authoritative current `head.sha` | New head fails until approved |
| Approval is later changed or dismissed | Latest decisive review per allowlisted identity wins; signal completion wakes reconciliation and schedule backs it up | Check returns to failure after authoritative reconciliation; during an App/API outage a same-head success can persist with no independent native-approval block (see residual risk 1) |
| Dependabot or another Bot is treated as owner | Generic Bot identities validate, but trusted authors and approvers must have exact immutable owner User identity | Bot PR requires current-head owner approval; Bot reviews are ignored |
| External PR receives an App-written result it did not earn | The App writes no review of any kind; it only writes the `external-review-policy` check, and it writes success for an external PR solely when the allowlisted owner's latest decisive review of the authoritative current head is `APPROVED` | No App review exists to forge; an unapproved external head never receives a success |
| Another publisher forges the name | Ruleset binds the required context to the observed dedicated App source | Name-only result does not satisfy protection |
| Duplicate or racing runs | Global concurrency plus full reconciliation on every surviving run; PR/head-keyed App check IDs; duplicate protected heads are detected and failed closed in code (PR #177, `6e15df2`) | Final authoritative state is re-fetched; duplicate-head reuse is fail-closed, with only the narrow timing races in residual risk 6 remaining |
| Reviews/open PRs/checks are truncated | Bounds fail at 100 records rather than consume a partial page | Workflow fails; no new success |
| API/log error leaks credentials | Private key is never printed; derived credentials are masked; error bodies are bounded and redacted | Sanitized failure only |
| Policy disappears or workflow fails | No other component can publish the App-bound check | New heads remain blocked |

## Bootstrap boundary (completed)

Before the policy workflow reached `main`, GitHub forbade self-approval, so the
dedicated App temporarily received Contents and Workflows write solely to
author the reviewed bootstrap PR #173. Pull requests write was already the
steady-state grant at that time, because the pre-PR-#177 workflow created
informational `np-app[bot]` App approvals. `henrik-me` approved the PR's frozen
current head, then only the temporary Contents and Workflows write were
revoked; the App was verified back to its then-steady-state grant of Checks
write, Metadata read, and Pull requests write before the normal merge as
`d1de384`. (Pull requests read became the correct steady state only later, once
App-authored PR #177 / `6e15df2` removed all review creation.) No
`RepositoryRole` bypass, admin merge, approval reduction, or code-owner-review
disabling was used.

A canary on a disposable branch under an identical temporary no-bypass ruleset
proved the observed platform semantics: at `required_approving_review_count` 1,
owner canary PR #174 carrying the pre-PR-#177 workflow's informational
`np-app[bot]` APPROVED review stayed `REVIEW_REQUIRED` and could not merge,
showing a GitHub App approval does not count toward a native required-review
count. The production ruleset therefore sets `required_approving_review_count`
to 0 and enforces owner review of external PRs through the App-bound
`external-review-policy` check rather than a native approval. After the count
was switched to 0, owner canary PR #174 merged as `900f406` on CI plus the
App-bound check; external App canary PR #175 was blocked until the owner
approved its current head, then merged as `60139a9`.

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
   remains gated by resolved threads and strict status. On any owner dismissal
   or revocation, treat the affected PR as merge-capable until the App
   reconciles, and contain in this order: (a) first restore an independent
   block that does not depend on the App -- through owner settings set
   `required_approving_review_count` to 1 (or add another independently
   unsatisfied required gate) so a native requirement blocks the merge; (b)
   close the affected PRs and/or push an invalidating new head; (c) only then,
   if the App is suspected compromised, suspend or disable it. Never disable the
   App-bound rule or suspend the App as the containment step: removing the App
   check alone deletes the only external-approval gate, and suspending the App
   alone does not invalidate an already-successful stale check. Monitor and
   alert on failed or missing scheduled reconciliation runs so the outage is
   detected promptly. Once the App is reachable again, a new head after
   dismissal still fails until re-approved; only then switch the native count
   back to 0.
2. **Review signal delivery.** The local secretless signal and trusted
   `workflow_run` normally propagate review changes immediately after Actions
   scheduling, but a PR can modify/remove its merge-ref signal and delivery or
   queueing can fail or lag. Scheduled reconciliation remains the independent
   roughly 15-minute timing guarantee and backstop.
3. **Reopening check support.** The canary confirmed the Checks API returns a
   completed check to `in_progress` on reconciliation; an induced review API
   failure leaves it non-successful.
4. **App-key concentration.** The same App key authenticates every policy
   action and writes the required `external-review-policy` check. Compromise
   defeats the gate. Restrict installation, use hardware-backed owner MFA,
   rotate keys, and audit every App check write.
5. **Workflow-capable collaborators.** A same-repository writer with workflow
   permission can create a branch workflow that references repository
   secrets. Keep that permission limited to the owner and exclude automation.
6. **Duplicate-head reuse residual timing races (fail-closed in code).**
   Required status checks are commit-scoped, and the ruleset matches the
   `external-review-policy` context by name and App source on the head commit;
   it ignores the App's PR-specific `external_id`. If two open PRs share the
   same head SHA, one PR's commit-scoped success is visible to the other. This
   duplicate-head cross-PR reuse is now **failed closed in code** through
   App-authored PR #177 (main commit `6e15df2`): the workflow detects multiple
   open protected PRs that share one head SHA and fails the check for every
   such PR, so no unapproved duplicate-head PR inherits an approved PR's
   success. Two narrow residual timing races remain and are inherent to a
   non-atomic read-decide-write against GitHub's API, not gaps in the
   fail-closed logic:
   - **Reviews-read-to-check-write race.** Between reading the authoritative
     reviews and writing the resulting check conclusion, an owner approval can
     be dismissed (or a new one added). The write reflects the state read a
     moment earlier; the next reconciliation re-fetches and corrects it.
   - **Final authoritative PR snapshot-to-write race.** The workflow takes a
     final authoritative open-PR snapshot immediately before the success write
     to catch a head that became duplicated during preparation, but a duplicate
     that appears in the instant between that snapshot and the write is caught
     only by the next reconciliation.
   These races self-correct on the next scheduled or event-driven
   reconciliation. Until a race is reconciled, contain exactly as in residual
   risk 1: through owner settings raise `required_approving_review_count` to 1
   (or add another independently unsatisfied required gate) so an independent
   block that does not share the commit-scoped check is in force, and close all
   affected duplicate-head PRs or move their heads. Do not rely on disabling the
   App-bound rule or suspending the App as containment, and never bypass.
7. **GitHub availability.** Actions or API outages deny policy freshness and
   may deny merges. This is intentional fail-closed behavior except for the
   zero-approval stale-success window in residual risk 1, which can permit a
   merge on an already-successful head during an App/API outage.
8. **Review flooding.** A PR with 100 reviews fails closed. The App writes no
   review and never appends to this count; each approved external head appends
   one owner review, and automated reviewers can add more per push. When a
   review list reaches 100 records the workflow re-fetches and fails closed
   rather than publishing a new success. Preserve the old PR as evidence and
   replace it rather than widening the bound. The replacement must repeat CI,
   reviews/thread handling, and current-head owner approval.
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
