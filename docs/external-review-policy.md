# External review policy operations

NaturalizationPuzzle carries a manual target-side installation of the private
`henrik-me/github-pr-policy` service. It is **not** managed by agent-harness and
has no future harness synchronization. Maintainers must review and apply
upstream template changes manually.

The installed workflows are pinned by contract tests to policy commit
`45e86ef7d66144cd6eb8a3eccf54c8310725e4c9`:

- `external-review-policy-signal.yml` observes submitted, edited, and dismissed
  reviews with no permissions, secrets, checkout, artifacts, or PR execution.
- `external-review-policy-dispatch.yml` runs trusted default-branch code for
  `pull_request_target`, signal completion through `workflow_run`, and pushes
  to `main`. It never checks out PR code or consumes artifacts.
- The dispatcher sends only the repository and pull request identifier:

  ```json
  {
    "version": 1,
    "target": {
      "owner": "henrik-me",
      "repo": "NaturalizationPuzzle",
      "pull_number": 123
    }
  }
  ```

  A `main` push or accepted review signal instead sends the versioned empty
  reconciliation event. Identity, review, SHA, and policy decisions are always
  re-fetched by the private policy service.

Missing credentials, invalid identifiers, and non-204 dispatch responses fail
the workflow. No target workflow can publish a check attributed to the
dedicated policy App; binding the required check to that observed App source
ensures a missing or failed dispatcher cannot create an accepted success.

## User-owned provisioning and rollout

Merging these files does not activate enforcement. Complete the authoritative
private [setup and staged rollout guide][policy-setup] in order:

1. Make private policy `main` protectable under the account plan and apply its
   documented no-bypass protection.
2. Register/install the dedicated App exactly as documented, selecting
   NaturalizationPuzzle explicitly. Do not grant it to all repositories.
3. Through a separately reviewed policy-repository change, allowlist
   `henrik-me/NaturalizationPuzzle` with protected bases `main` and the
   temporary `policy-canary`, update the workflow-embedded policy digest, and
   keep the policy workflow green.
4. Create a separate short-lived fine-grained token restricted to the private
   `github-pr-policy` repository, with Contents read/write (the permission
   GitHub requires for repository dispatch), Workflows no access, and no other
   permissions.
5. Store that value in this repository as the Actions secret
   `EXTERNAL_REVIEW_POLICY_DISPATCH_TOKEN`. The requirement is recorded here;
   no secret value belongs in source, issues, logs, or chat.
6. Observe an App-produced `external-review-policy` check and App approval on
   the authoritative current head, inspect logs for disclosure, and complete
   the canary and verification matrix in the private setup guide.
7. After the canary, remove `policy-canary` from NaturalizationPuzzle's private
   policy allowlist in another reviewed digest update and delete its temporary
   ruleset/branch.
8. Only then apply the reviewed
   [ruleset 15368163 migration](ruleset-15368163-migration.md). Never select an
   unbound name-only check or use a bypass to recover availability.

Until every prerequisite passes, leave the current ruleset unchanged. A
missing secret is intentionally blocking for dispatcher runs, but the policy
check is not required until rollout completes.

## Maintenance and incidents

- To update either workflow, review a new private-policy `main` commit, copy
  both templates together, update their canonical SHA-256 values in
  `tests/policy/external-review-policy.test.mjs`, and repeat security review.
- Keep the signal actor filter synchronized with the private policy's
  `humanApprovers`; never broaden it to untrusted contributors.
- Alert on failed dispatcher/policy runs and any App approval of a PR not
  authored by the configured immutable owner identity.
- On suspected credential or App compromise, disable the App installation,
  rotate the App key and dispatch token, restore reviewed policy `main`, and
  rerun the full matrix. Do not add a success fallback or bypass.

## References

- Private policy [setup][policy-setup] and [threat model][policy-threat]
- GitHub: [secure use and untrusted checkout][secure-use]
- GitHub: [`pull_request_target`, `workflow_run`, and review events][events]
- GitHub: [repository dispatch endpoint][repository-dispatch]
- GitHub: [using Actions secrets][actions-secrets]

[policy-setup]: https://github.com/henrik-me/github-pr-policy/blob/main/docs/setup.md
[policy-threat]: https://github.com/henrik-me/github-pr-policy/blob/main/docs/threat-model.md
[secure-use]: https://docs.github.com/en/actions/reference/security/secure-use#mitigating-the-risks-of-untrusted-code-checkout
[events]: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows
[repository-dispatch]: https://docs.github.com/en/rest/repos/repos#create-a-repository-dispatch-event
[actions-secrets]: https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets
