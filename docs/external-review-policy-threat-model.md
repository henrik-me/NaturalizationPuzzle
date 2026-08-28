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
- `APP_CLIENT_ID` and `APP_PRIVATE_KEY` in repository Actions secrets;
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
| PR claims trusted author, approval, or SHA | Event data is not used for decisions; App API re-fetches every open PR and review | Invalid/missing API state stops evaluation |
| Policy PR changes its own evaluator | Until merge, PR events and schedules use old `main` policy; external authors need current-head owner approval | Proposed policy cannot approve itself |
| Copilot modifies policy or protection | Its fine-grained credential has no Workflows, Actions secrets, Administration, or ruleset write | API refuses the operation |
| App is installed broadly | Runtime requires selected-repository installation and mints a token explicitly scoped to NaturalizationPuzzle | Authentication fails before target API calls |
| App permission drift | Runtime requires exactly Metadata read, Pull requests write, and Checks write on App, installation, and token | Authentication fails |
| Fork review withholds secrets | Direct `pull_request_review` execution is not used; scheduled trusted reconciliation observes the review through API | Approval propagation is delayed, not weakened |
| Same-repo review event executes proposed YAML | Direct review triggers and ref-selectable manual dispatch are absent | App secrets are not exposed to merge-ref policy code |
| Owner approval predates a push | Effective review `commit_id` must equal authoritative current `head.sha` | New head fails until approved |
| Approval is later changed or dismissed | Latest decisive review per allowlisted identity wins; scheduled reconciliation reopens and updates the check | Check returns to failure after reconciliation |
| External PR receives App approval | Evaluator calls App approval only for immutable trusted author whose identity owns the head repository | External path never invokes approval |
| Another publisher forges the name | Ruleset binds the required context to the observed dedicated App source | Name-only result does not satisfy protection |
| Duplicate or racing runs | Global concurrency plus full reconciliation on every surviving run; PR/head-keyed App check IDs | Final authoritative state is re-fetched |
| Reviews/open PRs/checks are truncated | Bounds fail at 100 records rather than consume a partial page | Workflow fails; no new success |
| API/log error leaks credentials | Private key is never printed; derived credentials are masked; error bodies are bounded and redacted | Sanitized failure only |
| Policy disappears or workflow fails | No other component can publish the App-bound check | New heads remain blocked |

## Bootstrap boundary

The current ruleset requires one approval and code-owner review by the sole
owner. The App policy is not active before its workflow reaches `main`, while
GitHub forbids self-approval. Therefore the initial bootstrap must be authored
by a distinct external human and approved by `henrik-me`. Using the current
RepositoryRole bypass, admin merge, temporarily reducing approvals, or
disabling code-owner review for bootstrap is outside the approved design.

The App's review counting toward a native approval is not guaranteed by
GitHub's public documentation. A disposable branch covered by an identical
temporary no-bypass ruleset must prove an actual owner-authored merge using
only the App review. Failure requires a distinct second human approver; it must
not be converted into a bypass or zero-approval rule.

## Residual risks

1. **Pre-authentication stale success.** An App/API outage before
   authentication or authoritative head lookup cannot safely identify and
   reopen an existing same-head check, so an earlier success may remain. The
   native PR-specific approval still blocks external PRs after dismissal;
   monitor failed and missing scheduled runs.
2. **Review propagation delay.** Without an unsafe direct review event or the
   prohibited signal/workflow-run split, approval/revocation reaches the App
   check on the next scheduled run, normally within about 15 minutes.
3. **Reopening check support.** The Checks API accepts status updates, but the
   staged canary must prove that a completed check can return to
   `in_progress`. Stop rollout if GitHub rejects that transition.
4. **App-key concentration.** The same App key creates both the trusted-owner
   review and check. Compromise defeats both layers. Restrict installation,
   use hardware-backed owner MFA, rotate keys, and audit every App review.
5. **Workflow-capable collaborators.** A same-repository writer with workflow
   permission can create a branch workflow that references repository
   secrets. Keep that permission limited to the owner and exclude automation.
6. **Same-head checks.** Checks are commit-scoped. Two PRs sharing one head can
   influence the visible name result, while deterministic external IDs keep
   writes separate. Native PR-specific approval remains mandatory; investigate
   duplicate-head cases and never bypass.
7. **GitHub availability.** Actions or API outages deny policy freshness and
   may deny merges. This is intentional fail-closed behavior except for the
   bounded stale-success condition above.
8. **Review flooding.** A PR with 100 reviews fails closed. Preserve evidence
   and replace the PR rather than widening the bound without review.
9. **Unproven platform semantics.** App approval counting and reopening a
   completed check are rollout gates, not assumptions.
10. **Account-level attribution.** GitHub does not distinguish an interactive
    owner action from a fine-grained token acting as that owner. The policy
    intentionally trusts both for ordinary-content PRs. Its safety depends on
    the Copilot credential having no Workflows, Actions secrets,
    Administration, or ruleset write permission, and on retaining those
    denials.

Official GitHub references are collected in
[`external-review-policy.md`](external-review-policy.md#official-references).
