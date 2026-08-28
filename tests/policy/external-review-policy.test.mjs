import assert from "node:assert/strict";
import { generateKeyPairSync, verify } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowPath = ".github/workflows/external-review-policy.yml";
const read = (path) =>
  readFile(new URL(`../../${path}`, import.meta.url), "utf8");

async function loadPolicy() {
  const workflow = await read(workflowPath);
  const match = workflow.match(
    /^([ \t]*)node --input-type=module <<'POLICY'\r?\n([\s\S]*?)^\1POLICY\r?$/m,
  );
  const indent = match?.[1];
  const block = match?.[2];
  assert.notEqual(indent, undefined);
  assert.ok(block, "embedded policy script must be present");
  const source = block
    .split(/\r?\n/)
    .map((line) =>
      line.startsWith(indent) ? line.slice(indent.length) : line,
    )
    .join("\n");
  assert.match(source, /\nawait runMain\(\);\s*$/);
  const testableSource = source.replace(/\nawait runMain\(\);\s*$/, "");
  return import(
    `data:text/javascript;base64,${Buffer.from(testableSource).toString("base64")}`
  );
}

const HEAD = "a".repeat(40);
const OLD_HEAD = "b".repeat(40);

function pull(author = "external-user") {
  const owner = author === "henrik-me";
  return {
    number: 42,
    state: "open",
    user: {
      login: author,
      id: owner ? 34380746 : 123456,
      type: "User",
    },
    head: {
      sha: HEAD,
      repo: {
        full_name: owner
          ? "henrik-me/NaturalizationPuzzle"
          : `${author}/NaturalizationPuzzle`,
        owner: { id: owner ? 34380746 : 123456 },
      },
    },
    base: { ref: "main" },
    html_url:
      "https://github.com/henrik-me/NaturalizationPuzzle/pull/42",
  };
}

function review({
  login = "henrik-me",
  id = 34380746,
  state = "APPROVED",
  commitId = HEAD,
  type = "User",
  reviewId = 1,
  submittedAt = "2026-08-28T16:00:00Z",
} = {}) {
  return {
    id: reviewId,
    state,
    commit_id: commitId,
    submitted_at: submittedAt,
    user: { login, id, type },
  };
}

class FakeGitHub {
  constructor({ pullResponse = pull(), reviews = [] } = {}) {
    this.pullResponse = pullResponse;
    this.reviews = reviews;
    this.checks = [];
    this.approvals = [];
  }

  async getPull() {
    return this.pullResponse;
  }

  async listReviews() {
    return this.reviews;
  }

  async listOpenPulls() {
    return [{ number: this.pullResponse.number }];
  }

  async upsertCheck(_session, input) {
    this.checks.push(input);
  }

  async ensureTrustedAuthorApproval(_session, target, headSha, reviews) {
    this.approvals.push({ target, headSha, reviews });
  }
}

const session = {
  appId: 123,
  appSlug: "external-review-policy",
  token: "installation-token",
};

test("workflow uses only trusted reconciliation triggers and local secrets", async () => {
  const workflow = await read(workflowPath);

  assert.match(
    workflow,
    /pull_request_target:\s*\n\s+types: \[opened, reopened, synchronize, edited, closed, ready_for_review\]/,
  );
  assert.match(workflow, /push:\s*\n\s+branches: \[main\]/);
  assert.match(workflow, /schedule:\s*\n\s+- cron: "7,22,37,52 \* \* \* \*"/);
  assert.match(workflow, /permissions: \{\}/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /APP_CLIENT_ID: \$\{\{ secrets\.APP_CLIENT_ID \}\}/);
  assert.match(workflow, /APP_PRIVATE_KEY: \$\{\{ secrets\.APP_PRIVATE_KEY \}\}/);
  assert.doesNotMatch(
    workflow,
    /pull_request_review:|workflow_run:|workflow_dispatch:|repository_dispatch:|EXTERNAL_REVIEW_POLICY_DISPATCH_TOKEN|github-pr-policy|secrets\.GITHUB_TOKEN|github\.token/i,
  );
});

test("workflow never loads pull request code or external executable content", async () => {
  const workflow = await read(workflowPath);

  assert.doesNotMatch(
    workflow,
    /actions\/checkout|^\s*uses:|artifact|cache|github\.event\.pull_request|github\.head_ref|curl\s|wget\s|npm\s+(?:install|ci)|npx\s/im,
  );
  assert.equal(workflow.match(/^\s+run: \|$/gm)?.length, 1);
  assert.match(workflow, /const OWNER = "henrik-me";/);
  assert.match(workflow, /const REPOSITORY = "NaturalizationPuzzle";/);
  assert.match(workflow, /const OWNER_ID = 34380746;/);
  assert.match(workflow, /const CHECK_NAME = "external-review-policy";/);
  assert.doesNotMatch(workflow, /evaluated\s*\+=/);
});

test("policy accepts only the immutable owner on an owner-controlled head", async () => {
  const { POLICY, decidePolicy } = await loadPolicy();

  assert.equal(decidePolicy(pull("henrik-me"), [], POLICY).conclusion, "success");

  const recycled = pull("henrik-me");
  recycled.user.id = 999999;
  assert.equal(decidePolicy(recycled, [], POLICY).conclusion, "failure");

  const thirdPartyHead = pull("henrik-me");
  thirdPartyHead.head.repo.owner.id = 999999;
  assert.equal(decidePolicy(thirdPartyHead, [], POLICY).conclusion, "failure");

  const deletedHead = pull("henrik-me");
  deletedHead.head.repo = null;
  assert.equal(decidePolicy(deletedHead, [], POLICY).conclusion, "failure");
});

test("external policy requires the allowlisted human's current-head approval", async () => {
  const { POLICY, decidePolicy } = await loadPolicy();

  assert.equal(decidePolicy(pull(), [], POLICY).conclusion, "failure");
  assert.equal(decidePolicy(pull(), [review()], POLICY).conclusion, "success");
  assert.equal(
    decidePolicy(pull(), [review({ commitId: OLD_HEAD })], POLICY).conclusion,
    "failure",
  );
  assert.equal(
    decidePolicy(
      pull(),
      [
        review(),
        review({ state: "CHANGES_REQUESTED", reviewId: 2 }),
      ],
      POLICY,
    ).conclusion,
    "failure",
  );
  assert.equal(
    decidePolicy(
      pull(),
      [
        review({
          state: "CHANGES_REQUESTED",
          reviewId: 2,
          submittedAt: "2026-08-28T17:00:00Z",
        }),
        review({
          reviewId: 1,
          submittedAt: "2026-08-28T16:00:00Z",
        }),
      ],
      POLICY,
    ).conclusion,
    "failure",
  );
  assert.equal(
    decidePolicy(
      pull(),
      [
        review({
          login: "github-actions[bot]",
          id: 41898282,
          type: "Bot",
        }),
      ],
      POLICY,
    ).conclusion,
    "failure",
  );
  assert.equal(
    decidePolicy(
      pull(),
      [review({ login: "external-user", id: 123456 })],
      POLICY,
    ).conclusion,
    "failure",
  );
});

test("evaluator re-fetches authoritative state and approves only trusted owners", async () => {
  const { POLICY, PolicyEvaluator } = await loadPolicy();
  const ownerGitHub = new FakeGitHub({
    pullResponse: pull("henrik-me"),
  });
  const ownerEvaluator = new PolicyEvaluator({
    github: ownerGitHub,
    policy: POLICY,
  });

  const ownerDecision = await ownerEvaluator.evaluate(42, session);

  assert.equal(ownerDecision.conclusion, "success");
  assert.equal(ownerGitHub.approvals.length, 1);
  assert.deepEqual(
    ownerGitHub.checks.map(({ status, conclusion, headSha }) => ({
      status,
      conclusion,
      headSha,
    })),
    [
      { status: "in_progress", conclusion: undefined, headSha: HEAD },
      { status: "completed", conclusion: "success", headSha: HEAD },
    ],
  );

  const externalGitHub = new FakeGitHub({
    reviews: [review()],
  });
  const externalEvaluator = new PolicyEvaluator({
    github: externalGitHub,
    policy: POLICY,
  });

  assert.equal(
    (await externalEvaluator.evaluate(42, session)).conclusion,
    "success",
  );
  assert.equal(externalGitHub.approvals.length, 0);
});

test("review API failure leaves the current-head check in progress", async () => {
  const { POLICY, PolicyEvaluator } = await loadPolicy();
  const github = new FakeGitHub();
  github.listReviews = async () => {
    throw new Error("reviews unavailable");
  };
  const evaluator = new PolicyEvaluator({ github, policy: POLICY });

  await assert.rejects(evaluator.evaluate(42, session), /reviews unavailable/);
  assert.deepEqual(
    github.checks.map(({ status, conclusion }) => ({ status, conclusion })),
    [{ status: "in_progress", conclusion: undefined }],
  );
});

test("JWT is short-lived RS256 and uses the client ID issuer", async () => {
  const { createAppJwt } = await loadPolicy();
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const pem = privateKey.export({ format: "pem", type: "pkcs8" });

  const jwt = createAppJwt("Iv1.example", pem, 2_000_000_000);
  const [header, payload, signature] = jwt.split(".");
  const decode = (part) =>
    JSON.parse(Buffer.from(part, "base64url").toString("utf8"));

  assert.deepEqual(decode(header), { alg: "RS256", typ: "JWT" });
  assert.deepEqual(decode(payload), {
    iat: 1_999_999_940,
    exp: 2_000_000_540,
    iss: "Iv1.example",
  });
  assert.equal(
    verify(
      "RSA-SHA256",
      Buffer.from(`${header}.${payload}`),
      publicKey,
      Buffer.from(signature, "base64url"),
    ),
    true,
  );
});

test("fatal error rendering redacts secrets and control characters", async () => {
  const { safeError } = await loadPolicy();
  const secret = "sensitive-private-key";

  assert.equal(
    safeError(
      new Error(
        `failed for ${secret}\r\nforged\u0000\u001b[31m\t\u0085next\u2028line`,
      ),
      [secret],
    ),
    "Error: failed for [REDACTED] forged[31m next line",
  );
  assert.equal(
    safeError(
      new AggregateError(
        [
          new Error("GitHub API returned 403"),
          new Error(`credential ${secret} rejected`),
        ],
        "Reconciliation failed",
      ),
      [secret],
    ),
    "AggregateError: Reconciliation failed; causes: Error: GitHub API returned 403 | Error: credential [REDACTED] rejected",
  );
});

test("review API wrapper rejects a non-numeric pull request identifier", async () => {
  const { GitHubService } = await loadPolicy();
  const service = new GitHubService({
    api: {
      request: async () => {
        throw new Error("API must not be called");
      },
    },
    clientId: "Iv1.example",
    privateKeyPem: "unused",
  });

  await assert.rejects(
    service.listReviews(session, "../../app"),
    /pullNumber: expected a positive integer/,
  );
});

test("API wrappers reject tokens containing any line or control character", async () => {
  const { GitHubService } = await loadPolicy();
  const service = new GitHubService({
    api: {
      request: async () => {
        throw new Error("API must not be called");
      },
    },
    clientId: "Iv1.example",
    privateKeyPem: "unused",
  });

  for (const character of ["\t", "\u0085", "\u2028", "\u2029"]) {
    await assert.rejects(
      service.listReviews(
        {
          appId: 123,
          appSlug: "external-review-policy",
          token: `installation${character}token`,
        },
        42,
      ),
      /Authentication token is invalid/,
    );
  }
});

test("GitHub API retries a timed-out idempotent request", async () => {
  const { GitHubApi } = await loadPolicy();
  let calls = 0;
  const api = new GitHubApi({
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) {
        throw new DOMException("request timed out", "AbortError");
      }
      return new Response('{"id":123}', { status: 200 });
    },
    sleep: async () => {},
  });

  assert.deepEqual(
    await api.request("GET", "/app", { token: "test-token" }),
    { id: 123 },
  );
  assert.equal(calls, 2);
});

test("GitHub API retries when an idempotent response body times out", async () => {
  const { GitHubApi } = await loadPolicy();
  let calls = 0;
  const api = new GitHubApi({
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) {
        return {
          status: 200,
          text: async () => {
            throw new DOMException("body timed out", "AbortError");
          },
        };
      }
      return new Response('{"id":123}', { status: 200 });
    },
    sleep: async () => {},
  });

  assert.deepEqual(
    await api.request("GET", "/app", { token: "test-token" }),
    { id: 123 },
  );
  assert.equal(calls, 2);
});

test("App authentication is repository-scoped and exact least privilege", async () => {
  const { GitHubService } = await loadPolicy();
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const privateKeyPem = privateKey.export({ format: "pem", type: "pkcs8" });
  const requests = [];
  const responses = [
    {
      id: 123,
      client_id: "Iv1.example",
      slug: "external-review-policy",
      events: [],
      permissions: {
        checks: "write",
        metadata: "read",
        pull_requests: "write",
      },
    },
    {
      id: 456,
      account: { login: "henrik-me", id: 34380746 },
      repository_selection: "selected",
      suspended_at: null,
      permissions: {
        checks: "write",
        metadata: "read",
        pull_requests: "write",
      },
    },
    {
      token: "ghs_installation_token",
      expires_at: "2033-05-18T03:34:00Z",
      permissions: {
        checks: "write",
        metadata: "read",
        pull_requests: "write",
      },
      repositories: [
        {
          name: "NaturalizationPuzzle",
          full_name: "henrik-me/NaturalizationPuzzle",
        },
      ],
    },
  ];
  const api = {
    request: async (method, path, options) => {
      requests.push({ method, path, options });
      return responses.shift();
    },
  };
  const service = new GitHubService({
    api,
    clientId: "Iv1.example",
    privateKeyPem,
    now: () => new Date("2033-05-18T03:33:20Z"),
  });

  assert.deepEqual(await service.authenticate(), {
    appId: 123,
    appSlug: "external-review-policy",
    token: "ghs_installation_token",
  });
  assert.equal(
    requests[1].path,
    "/repos/henrik-me/NaturalizationPuzzle/installation",
  );
  assert.deepEqual(requests[2].options.body, {
    repositories: ["NaturalizationPuzzle"],
    permissions: {
      checks: "write",
      metadata: "read",
      pull_requests: "write",
    },
  });
});

test("reevaluation reopens an existing successful App check", async () => {
  const { GitHubService } = await loadPolicy();
  const requests = [];
  const api = {
    request: async (method, path, options) => {
      requests.push({ method, path, options });
      if (method === "GET") {
        return {
          total_count: 1,
          check_runs: [
            {
              id: 77,
              name: "external-review-policy",
              head_sha: HEAD,
              external_id: `v1:pr42:head:${HEAD}`,
              app: { id: 123 },
            },
          ],
        };
      }
      return { id: 77 };
    },
  };
  const service = new GitHubService({
    api,
    clientId: "Iv1.example",
    privateKeyPem: "unused",
    now: () => new Date("2026-08-28T16:00:00Z"),
  });

  await service.upsertCheck(session, {
    pullNumber: 42,
    headSha: HEAD,
    detailsUrl:
      "https://github.com/henrik-me/NaturalizationPuzzle/pull/42",
    status: "in_progress",
    title: "Evaluating external review policy",
    summary: "Fetching authoritative pull request and review data.",
  });

  assert.equal(requests.at(-1).method, "PATCH");
  assert.equal(
    requests.at(-1).path,
    "/repos/henrik-me/NaturalizationPuzzle/check-runs/77",
  );
  assert.equal(requests.at(-1).options.body.status, "in_progress");
});

test("Build & Test enforces the local policy suite", async () => {
  const workflow = await read(".github/workflows/ci-cd.yml");
  const buildAndTestJob = workflow.match(
    /^  build-and-test:\r?\n[\s\S]*?(?=^  [a-z][a-z0-9-]*:\r?\n|(?![\s\S]))/m,
  )?.[0];

  assert.ok(buildAndTestJob);
  assert.match(
    buildAndTestJob,
    /run: node --test tests\/policy\/external-review-policy\.test\.mjs/,
  );
  assert.match(workflow, /pull_request:\s*\n\s+branches: \[main, master, policy-canary\]/);

  const codeql = await read(".github/workflows/codeql.yml");
  assert.match(
    codeql,
    /pull_request:\s*\n\s+branches: \[main, master, policy-canary\]/,
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
    "docs/external-review-policy-threat-model.md",
    "docs/ruleset-15368163-migration.md",
  ]) {
    assert.equal(pushPathsIgnore.split(`- '${path}'`).length - 1, 1);
    assert.equal(docsPathsFilter.split(`- '!${path}'`).length - 1, 1);
  }

  const instructions = await read(".github/copilot-instructions.md");
  assert.match(
    instructions,
    /admin-merge exception never applies to external-review-policy bootstrap, workflow, App, secret, CODEOWNERS, protection, or ruleset changes/i,
  );
});
