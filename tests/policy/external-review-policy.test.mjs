import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) =>
  readFile(new URL(`../../${path}`, import.meta.url), "utf8");

const sha256 = (value) =>
  createHash("sha256")
    .update(value.replaceAll("\r\n", "\n"))
    .digest("hex");

const dispatcherPath =
  ".github/workflows/external-review-policy-dispatch.yml";
const signalPath =
  ".github/workflows/external-review-policy-signal.yml";

test("workflows match the templates reviewed at policy commit 45e86ef", async () => {
  assert.equal(
    sha256(await read(dispatcherPath)),
    "c7aa914827003fd1ff41e34ad2475fe412fc01a06c8713aa609cc71900fad3ad",
  );
  assert.equal(
    sha256(await read(signalPath)),
    "56885613b8cc8576c63e9c1b64c5b1830877d43ed26d2e363b679e8251f7811e",
  );
});

test("dispatcher uses only trusted base-workflow triggers", async () => {
  const workflow = await read(dispatcherPath);

  assert.match(workflow, /pull_request_target:\s*\n\s+types: \[opened, reopened, synchronize, edited, closed, ready_for_review\]/);
  assert.match(workflow, /workflow_run:\s*\n\s+workflows: \["External review policy signal"\]\s*\n\s+types: \[completed\]/);
  assert.match(workflow, /push:\s*\n\s+branches: \[main\]/);
  assert.doesNotMatch(workflow, /^\s+pull_request:\s*$/m);
  assert.doesNotMatch(workflow, /pull_request_review:/);
  assert.match(workflow, /permissions: \{\}/);
});

test("review signal is unprivileged, secretless, and review-triggered", async () => {
  const workflow = await read(signalPath);

  assert.match(workflow, /pull_request_review:\s*\n\s+types: \[submitted, edited, dismissed\]/);
  assert.match(workflow, /permissions: \{\}/);
  assert.match(
    workflow,
    /run: echo "Trusted workflow_run reconciliation requested\."/,
  );
  assert.doesNotMatch(
    workflow,
    /secrets\.|DISPATCH_TOKEN|env:|uses:|actions\/checkout|artifact|cache|\$\{\{/i,
  );
});

test("privileged dispatcher never checks out or executes pull request code", async () => {
  const workflow = await read(dispatcherPath);

  assert.doesNotMatch(
    workflow,
    /actions\/checkout|uses:|artifact|cache|github\.event\.pull_request\.(?:head|title|body)|github\.head_ref|pull_request\.head|head\.sha/i,
  );
  assert.match(
    workflow,
    /    if: >-\r?\n      github\.event_name != 'workflow_run'\r?\n      \|\| github\.event\.workflow_run\.actor\.login == 'henrik-me'\r?\n    runs-on:/,
  );
  assert.equal(
    workflow.match(/workflow_run\.actor\.login ==/g)?.length,
    1,
  );
  assert.doesNotMatch(workflow, /client_payload[\s\S]*(?:path|ref|sha|command)/i);
});

test("dispatcher sends the exact identifier-only v1 contract", async () => {
  const workflow = await read(dispatcherPath);

  assert.match(workflow, /event_type: "external-review-policy-v1"/);
  assert.match(
    workflow,
    /client_payload: \{\s*version: 1,\s*target: \{\s*owner,\s*repo,\s*pull_number: pullNumber,\s*\},\s*\},/s,
  );
  assert.match(
    workflow,
    /body = \{ event_type: "external-review-policy-reconcile-v1" \};/,
  );
  assert.doesNotMatch(
    workflow,
    /\b(?:author|reviewer|head_sha|approval|approved|conclusion|decision|check_run|check-runs)\b/i,
  );
});

test("dispatcher target and credential are fixed", async () => {
  const workflow = await read(dispatcherPath);

  assert.match(
    workflow,
    /https:\/\/api\.github\.com\/repos\/henrik-me\/github-pr-policy\/dispatches/,
  );
  assert.equal(
    workflow.match(/https:\/\/api\.github\.com\/repos\//g)?.length,
    1,
  );
  assert.match(
    workflow,
    /DISPATCH_TOKEN: \$\{\{ secrets\.EXTERNAL_REVIEW_POLICY_DISPATCH_TOKEN \}\}/,
  );
});

test("dispatcher fails closed when dispatch cannot be trusted or delivered", async () => {
  const workflow = await read(dispatcherPath);

  assert.match(workflow, /throw new Error\("Dispatch credential is unavailable"\)/);
  assert.match(workflow, /throw new Error\("Invalid target repository identifier"\)/);
  assert.match(workflow, /throw new Error\("Invalid pull request number"\)/);
  assert.match(workflow, /throw new Error\("Invalid dispatch kind"\)/);
  assert.match(workflow, /if \(response\.status !== 204\)/);
  assert.match(workflow, /throw new Error\(`Policy dispatch failed with HTTP \$\{response\.status\}`\)/);
  assert.doesNotMatch(
    workflow,
    /continue-on-error|\|\| true|catch\s*\(|check-runs|external-review-policy.*success/i,
  );
});

test("CI enforces the contract and treats policy guides as docs", async () => {
  const workflow = await read(".github/workflows/ci-cd.yml");
  const buildAndTestJob = workflow.match(
    /^  build-and-test:\r?\n[\s\S]*?(?=^  [a-z][a-z0-9-]*:\r?\n|(?![\s\S]))/m,
  )?.[0];

  assert.ok(buildAndTestJob);
  assert.match(
    buildAndTestJob,
    /run: node --test tests\/policy\/external-review-policy\.test\.mjs/,
  );
  const pushPathsIgnore = workflow.match(
    /^    paths-ignore:\r?\n[\s\S]*?(?=^  pull_request:)/m,
  )?.[0];
  const docsPathsFilter = workflow.match(
    /^          filters: &docs_paths_filter \|\r?\n[\s\S]*?(?=^      - name: Setup \.NET)/m,
  )?.[0];
  assert.ok(pushPathsIgnore);
  assert.ok(docsPathsFilter);
  for (const path of [
    "docs/external-review-policy.md",
    "docs/ruleset-15368163-migration.md",
  ]) {
    assert.equal(pushPathsIgnore.split(`- '${path}'`).length - 1, 1);
    assert.equal(docsPathsFilter.split(`- '!${path}'`).length - 1, 1);
  }
});
