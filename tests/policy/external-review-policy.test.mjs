import assert from "node:assert/strict";
import { generateKeyPairSync, verify } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowPath = ".github/workflows/external-review-policy.yml";
const signalWorkflowPath =
  ".github/workflows/external-review-policy-signal.yml";
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

function makePull({
  number = 42,
  author = "external-user",
  headSha = HEAD,
  base = "main",
  state = "open",
} = {}) {
  const owner = author === "henrik-me";
  return {
    number,
    state,
    user: {
      login: author,
      id: owner ? 34380746 : 123456,
      type: "User",
    },
    head: {
      sha: headSha,
      repo: {
        full_name: owner
          ? "henrik-me/NaturalizationPuzzle"
          : `${author}/NaturalizationPuzzle`,
        owner: { id: owner ? 34380746 : 123456 },
      },
    },
    base: { ref: base },
    html_url: `https://github.com/henrik-me/NaturalizationPuzzle/pull/${number}`,
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

// Build a snapshot descriptor from authoritative pull objects: the raw open
// list returned by listOpenPulls plus the getPull response keyed by number.
function listing(pulls) {
  return {
    list: pulls.map((entry) => ({ number: entry.number })),
    pulls: Object.fromEntries(pulls.map((entry) => [entry.number, entry])),
  };
}

// FakeGitHub replays a sequence of authoritative snapshots. Each reconcile
// takes an initial snapshot plus a preliminary and a final snapshot per
// prepared publication, so it reads listOpenPulls several times; the last
// snapshot entry is reused if reconcile reads beyond the provided sequence. A
// snapshot entry with a `throwError` simulates the open-pull list becoming
// unavailable. Reviews can vary per call via `reviewSequences` to model
// dismissal between preparation and publication. `log` records the ordered
// sequence of API operations for ordering assertions.
class FakeGitHub {
  constructor({ snapshots = [], reviewsByNumber = {}, reviewSequences = {} } = {}) {
    this.snapshots = snapshots;
    this.reviewsByNumber = reviewsByNumber;
    this.reviewSequences = reviewSequences;
    this.reviewCalls = {};
    this.index = -1;
    this.current = { list: [], pulls: {} };
    this.upserts = [];
    this.duplicateFailures = [];
    this.log = [];
  }

  async listOpenPulls() {
    this.index += 1;
    const snapshot =
      this.snapshots[Math.min(this.index, this.snapshots.length - 1)];
    if (snapshot && snapshot.throwError) {
      this.log.push("listOpenPulls:throw");
      throw snapshot.throwError;
    }
    this.log.push("listOpenPulls");
    this.current = snapshot;
    return this.current.list;
  }

  async getPull(_session, number) {
    this.log.push(`getPull:${number}`);
    return this.current.pulls[number];
  }

  async listReviews(_session, number) {
    this.log.push(`listReviews:${number}`);
    const sequence = this.reviewSequences[number];
    if (sequence) {
      const call = this.reviewCalls[number] ?? 0;
      this.reviewCalls[number] = call + 1;
      return sequence[Math.min(call, sequence.length - 1)];
    }
    return this.reviewsByNumber[number] ?? [];
  }

  async upsertCheck(_session, input) {
    this.log.push(`upsertCheck:${input.status}`);
    this.upserts.push(input);
  }

  async prepareCheck(_session, input) {
    this.log.push(`prepareCheck:${input.pullNumber}`);
    return {
      pullNumber: input.pullNumber,
      headSha: input.headSha,
      detailsUrl: input.detailsUrl,
      externalId: `v1:pr${input.pullNumber}:head:${input.headSha}`,
      matchingIds: [],
    };
  }

  async applyCheck(_session, plan, mutation) {
    this.log.push(`applyCheck:${plan.pullNumber}`);
    this.upserts.push({
      pullNumber: plan.pullNumber,
      headSha: plan.headSha,
      detailsUrl: plan.detailsUrl,
      status: mutation.status,
      conclusion: mutation.conclusion,
      title: mutation.title,
      summary: mutation.summary,
    });
  }

  async failDuplicateHeadChecks(_session, headSha, detailsUrl) {
    this.log.push(`failDuplicate:${headSha}`);
    this.duplicateFailures.push({ headSha, detailsUrl });
  }
}

const OWNER_PR_42_URL =
  "https://github.com/henrik-me/NaturalizationPuzzle/pull/42";

const session = {
  appId: 123,
  appSlug: "external-review-policy",
  token: "installation-token",
};

test("trusted workflow reconciles after local review signals and backstop triggers", async () => {
  const workflow = await read(workflowPath);

  assert.match(
    workflow,
    /pull_request_target:\s*\n\s+types: \[opened, reopened, synchronize, edited, closed, ready_for_review\]/,
  );
  assert.match(workflow, /push:\s*\n\s+branches: \[main\]/);
  assert.match(
    workflow,
    /workflow_run:\s*\n\s+workflows: \["External review policy signal"\]\s*\n\s+types: \[completed\]/,
  );
  assert.match(workflow, /schedule:\s*\n\s+- cron: "7,22,37,52 \* \* \* \*"/);
  assert.match(workflow, /permissions: \{\}/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /APP_ID: \$\{\{ secrets\.APP_ID \}\}/);
  assert.match(workflow, /APP_PRIVATE_KEY: \$\{\{ secrets\.APP_PRIVATE_KEY \}\}/);
  assert.doesNotMatch(
    workflow,
    /pull_request_review:|workflow_dispatch:|repository_dispatch:|EXTERNAL_REVIEW_POLICY_DISPATCH_TOKEN|github-pr-policy|secrets\.GITHUB_TOKEN|github\.token/i,
  );
});

test("review signal is unprivileged and executes no pull request content", async () => {
  const workflow = await read(signalWorkflowPath);
  const trustedWorkflow = await read(workflowPath);

  assert.equal(
    workflow.replace(/\r\n/g, "\n").trim(),
    [
      "name: External review policy signal",
      "",
      "on:",
      "  pull_request_review:",
      "    types: [submitted, edited, dismissed]",
      "",
      "permissions: {}",
      "",
      "jobs:",
      "  signal:",
      "    runs-on: ubuntu-24.04",
      "    timeout-minutes: 1",
      "    steps:",
      "      - name: Signal trusted policy reconciliation",
      '        run: echo "Review change observed; trusted reconciliation runs separately."',
    ].join("\n"),
  );
  assert.match(
    trustedWorkflow,
    /workflows: \["External review policy signal"\]/,
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

test("Copilot Bot accounts are valid but never satisfy author or reviewer policy", async () => {
  const { POLICY, decidePolicy } = await loadPolicy();
  const copilotAuthor = pull("Copilot");
  copilotAuthor.user = {
    login: "Copilot",
    id: 198982749,
    type: "Bot",
  };
  copilotAuthor.head.repo.owner.id = 34380746;
  copilotAuthor.head.repo.full_name =
    "henrik-me/NaturalizationPuzzle";

  assert.equal(decidePolicy(copilotAuthor, [], POLICY).conclusion, "failure");
  assert.equal(
    decidePolicy(
      pull(),
      [
        review({
          login: "Copilot",
          id: 198982749,
          type: "Bot",
        }),
      ],
      POLICY,
    ).conclusion,
    "failure",
  );
});

test("unique owner PR publishes success with no approval writes", async () => {
  const { POLICY, PolicyEvaluator, reconcile } = await loadPolicy();
  const ownerPull = makePull({ number: 42, author: "henrik-me" });
  const github = new FakeGitHub({
    snapshots: [listing([ownerPull]), listing([ownerPull])],
  });
  const evaluator = new PolicyEvaluator({ github, policy: POLICY });

  const result = await reconcile(github, evaluator, session, []);

  assert.deepEqual(result, { reconciled: 1 });
  assert.equal(github.duplicateFailures.length, 0);
  assert.deepEqual(
    github.upserts.map(({ status, conclusion, headSha }) => ({
      status,
      conclusion,
      headSha,
    })),
    [
      { status: "in_progress", conclusion: undefined, headSha: HEAD },
      { status: "completed", conclusion: "success", headSha: HEAD },
    ],
  );
});

test("unique external PR reflects the human decision without approval writes", async () => {
  const { POLICY, PolicyEvaluator, reconcile } = await loadPolicy();
  const externalPull = makePull({ number: 7, author: "external-user" });

  const approved = new FakeGitHub({
    snapshots: [listing([externalPull]), listing([externalPull])],
    reviewsByNumber: { 7: [review()] },
  });
  await reconcile(
    approved,
    new PolicyEvaluator({ github: approved, policy: POLICY }),
    session,
    [],
  );
  assert.equal(approved.upserts.at(-1).conclusion, "success");
  assert.equal(approved.duplicateFailures.length, 0);

  const unapproved = new FakeGitHub({
    snapshots: [listing([externalPull]), listing([externalPull])],
  });
  await reconcile(
    unapproved,
    new PolicyEvaluator({ github: unapproved, policy: POLICY }),
    session,
    [],
  );
  assert.equal(unapproved.upserts.at(-1).conclusion, "failure");
  assert.equal(unapproved.duplicateFailures.length, 0);
});

test("owner and external PRs sharing a head are quarantined and failed, never satisfied", async () => {
  const { POLICY, PolicyEvaluator, reconcile } = await loadPolicy();
  const ownerPull = makePull({ number: 42, author: "henrik-me", headSha: HEAD });
  const externalPull = makePull({
    number: 43,
    author: "external-user",
    headSha: HEAD,
  });
  const snap = listing([ownerPull, externalPull]);
  const github = new FakeGitHub({
    snapshots: [snap, snap],
    reviewsByNumber: { 42: [], 43: [review()] },
  });

  await reconcile(
    github,
    new PolicyEvaluator({ github, policy: POLICY }),
    session,
    [],
  );

  assert.deepEqual(github.duplicateFailures, [
    { headSha: HEAD, detailsUrl: OWNER_PR_42_URL },
  ]);
  assert.equal(github.upserts.length, 0);
});

test("two owner PRs sharing a head are failed exactly like the mixed case", async () => {
  const { POLICY, PolicyEvaluator, reconcile } = await loadPolicy();
  const first = makePull({ number: 42, author: "henrik-me", headSha: HEAD });
  const second = makePull({ number: 50, author: "henrik-me", headSha: HEAD });
  const snap = listing([first, second]);
  const github = new FakeGitHub({ snapshots: [snap, snap] });

  await reconcile(
    github,
    new PolicyEvaluator({ github, policy: POLICY }),
    session,
    [],
  );

  assert.deepEqual(github.duplicateFailures, [
    { headSha: HEAD, detailsUrl: OWNER_PR_42_URL },
  ]);
  assert.equal(github.upserts.length, 0);
});

test("malformed or duplicate open-pull entries fail closed with zero writes", async () => {
  const { POLICY, PolicyEvaluator, reconcile } = await loadPolicy();

  const malformed = new FakeGitHub({
    snapshots: [{ list: [{ number: 0 }], pulls: {} }],
  });
  await assert.rejects(
    reconcile(
      malformed,
      new PolicyEvaluator({ github: malformed, policy: POLICY }),
      session,
      [],
    ),
    /expected a positive integer/,
  );
  assert.equal(malformed.upserts.length, 0);
  assert.equal(malformed.duplicateFailures.length, 0);

  const duplicated = new FakeGitHub({
    snapshots: [{ list: [{ number: 42 }, { number: 42 }], pulls: {} }],
  });
  await assert.rejects(
    reconcile(
      duplicated,
      new PolicyEvaluator({ github: duplicated, policy: POLICY }),
      session,
      [],
    ),
    /duplicate pull number 42/,
  );
  assert.equal(duplicated.upserts.length, 0);
  assert.equal(duplicated.duplicateFailures.length, 0);
});

test("authoritative getPull number mismatch fails closed with zero writes", async () => {
  const { POLICY, PolicyEvaluator, reconcile } = await loadPolicy();
  const mismatched = makePull({ number: 99, author: "henrik-me" });
  const github = new FakeGitHub({
    snapshots: [{ list: [{ number: 42 }], pulls: { 42: mismatched } }],
  });

  await assert.rejects(
    reconcile(
      github,
      new PolicyEvaluator({ github, policy: POLICY }),
      session,
      [],
    ),
    /Authoritative pull number mismatch for 42/,
  );
  assert.equal(github.upserts.length, 0);
  assert.equal(github.duplicateFailures.length, 0);
});

test("a head that becomes duplicated before finalization is failed and never published", async () => {
  const { POLICY, PolicyEvaluator, reconcile } = await loadPolicy();
  const ownerPull = makePull({ number: 42, author: "henrik-me", headSha: HEAD });
  const collidingPull = makePull({
    number: 43,
    author: "external-user",
    headSha: HEAD,
  });
  const github = new FakeGitHub({
    snapshots: [listing([ownerPull]), listing([ownerPull, collidingPull])],
  });

  await reconcile(
    github,
    new PolicyEvaluator({ github, policy: POLICY }),
    session,
    [],
  );

  assert.deepEqual(
    github.upserts.map(({ status, conclusion }) => ({ status, conclusion })),
    [{ status: "in_progress", conclusion: undefined }],
  );
  assert.deepEqual(github.duplicateFailures, [
    { headSha: HEAD, detailsUrl: OWNER_PR_42_URL },
  ]);
});

test("a head duplicated initially stays failed even after it becomes unique", async () => {
  const { POLICY, PolicyEvaluator, reconcile } = await loadPolicy();
  const ownerPull = makePull({ number: 42, author: "henrik-me", headSha: HEAD });
  const siblingPull = makePull({
    number: 43,
    author: "external-user",
    headSha: HEAD,
  });
  const github = new FakeGitHub({
    snapshots: [listing([ownerPull, siblingPull]), listing([ownerPull])],
  });

  await reconcile(
    github,
    new PolicyEvaluator({ github, policy: POLICY }),
    session,
    [],
  );

  assert.equal(github.upserts.length, 0);
  assert.deepEqual(github.duplicateFailures, [
    { headSha: HEAD, detailsUrl: OWNER_PR_42_URL },
  ]);
});

test("a PR that changes head, base, or state between snapshots is never completed as success", async () => {
  const { POLICY, PolicyEvaluator, reconcile } = await loadPolicy();
  const NEW_HEAD = "c".repeat(40);
  const cases = [
    [
      makePull({ number: 42, author: "henrik-me", headSha: HEAD }),
      makePull({ number: 42, author: "henrik-me", headSha: NEW_HEAD }),
    ],
    [
      makePull({ number: 42, author: "henrik-me", headSha: HEAD }),
      makePull({
        number: 42,
        author: "henrik-me",
        headSha: HEAD,
        base: "feature",
      }),
    ],
    [
      makePull({ number: 42, author: "henrik-me", headSha: HEAD }),
      makePull({
        number: 42,
        author: "henrik-me",
        headSha: HEAD,
        state: "closed",
      }),
    ],
  ];

  for (const [initialPull, finalPull] of cases) {
    const github = new FakeGitHub({
      snapshots: [listing([initialPull]), listing([finalPull])],
    });
    await assert.rejects(
      reconcile(
        github,
        new PolicyEvaluator({ github, policy: POLICY }),
        session,
        [],
      ),
      (error) => {
        assert.ok(error instanceof AggregateError);
        assert.match(error.errors[0].message, /reconciliation mismatch/i);
        return true;
      },
    );
    assert.ok(github.upserts.every(({ status }) => status === "in_progress"));
    assert.equal(github.duplicateFailures.length, 0);
  }
});

test("review API failure during preparation leaves the check in progress and reports an error", async () => {
  const { POLICY, PolicyEvaluator, reconcile } = await loadPolicy();
  const ownerPull = makePull({ number: 42, author: "henrik-me" });
  const github = new FakeGitHub({
    snapshots: [listing([ownerPull]), listing([ownerPull])],
  });
  github.listReviews = async () => {
    throw new Error("reviews unavailable");
  };

  await assert.rejects(
    reconcile(
      github,
      new PolicyEvaluator({ github, policy: POLICY }),
      session,
      [],
    ),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.match(error.errors[0].message, /PR #42: Error: reviews unavailable/);
      return true;
    },
  );
  assert.deepEqual(
    github.upserts.map(({ status, conclusion }) => ({ status, conclusion })),
    [{ status: "in_progress", conclusion: undefined }],
  );
});

test("failDuplicateHeadChecks patches every App-owned run to failure and omits external_id", async () => {
  const { GitHubService } = await loadPolicy();
  const requests = [];
  const service = new GitHubService({
    api: {
      request: async (method, path, options) => {
        requests.push({ method, path, options });
        if (method === "GET") {
          return {
            total_count: 2,
            check_runs: [
              {
                id: 11,
                name: "external-review-policy",
                head_sha: HEAD,
                external_id: `v1:pr42:head:${HEAD}`,
                app: { id: 123 },
              },
              {
                id: 12,
                name: "external-review-policy",
                head_sha: HEAD,
                external_id: `v1:pr43:head:${HEAD}`,
                app: { id: 123 },
              },
            ],
          };
        }
        return { id: 0 };
      },
    },
    appId: 123,
    privateKeyPem: "unused",
    now: () => new Date("2026-08-28T16:00:00Z"),
  });

  await service.failDuplicateHeadChecks(session, HEAD, OWNER_PR_42_URL);

  const patches = requests.filter((request) => request.method === "PATCH");
  assert.deepEqual(
    patches.map((request) => request.path),
    [
      "/repos/henrik-me/NaturalizationPuzzle/check-runs/11",
      "/repos/henrik-me/NaturalizationPuzzle/check-runs/12",
    ],
  );
  for (const patch of patches) {
    assert.equal(patch.options.body.status, "completed");
    assert.equal(patch.options.body.conclusion, "failure");
    assert.equal("external_id" in patch.options.body, false);
    assert.equal("head_sha" in patch.options.body, false);
    assert.match(
      patch.options.body.output.title,
      /Duplicate protected pull request heads/,
    );
    assert.match(
      patch.options.body.output.summary,
      /blocked until the heads are made unique/,
    );
  }
  assert.equal(
    requests.some((request) => request.method === "POST"),
    false,
  );
});

test("failDuplicateHeadChecks creates a single deterministic failure when no run exists", async () => {
  const { GitHubService } = await loadPolicy();
  const requests = [];
  const service = new GitHubService({
    api: {
      request: async (method, path, options) => {
        requests.push({ method, path, options });
        if (method === "GET") {
          return { total_count: 0, check_runs: [] };
        }
        return { id: 5 };
      },
    },
    appId: 123,
    privateKeyPem: "unused",
    now: () => new Date("2026-08-28T16:00:00Z"),
  });

  await service.failDuplicateHeadChecks(session, HEAD, OWNER_PR_42_URL);

  const posts = requests.filter((request) => request.method === "POST");
  assert.equal(posts.length, 1);
  assert.equal(posts[0].path, "/repos/henrik-me/NaturalizationPuzzle/check-runs");
  assert.equal(posts[0].options.body.external_id, `v1:duplicate-head:${HEAD}`);
  assert.equal(posts[0].options.body.head_sha, HEAD);
  assert.equal(posts[0].options.body.conclusion, "failure");
  assert.equal(
    requests.some((request) => request.method === "PATCH"),
    false,
  );
});

test("failDuplicateHeadChecks ignores foreign apps and names and posts one App failure", async () => {
  const { GitHubService } = await loadPolicy();
  const requests = [];
  const service = new GitHubService({
    api: {
      request: async (method, path, options) => {
        requests.push({ method, path, options });
        if (method === "GET") {
          return {
            total_count: 2,
            check_runs: [
              {
                id: 21,
                name: "external-review-policy",
                head_sha: HEAD,
                external_id: null,
                app: { id: 999 },
              },
              {
                id: 22,
                name: "other-check",
                head_sha: HEAD,
                external_id: null,
                app: { id: 123 },
              },
            ],
          };
        }
        return { id: 30 };
      },
    },
    appId: 123,
    privateKeyPem: "unused",
    now: () => new Date("2026-08-28T16:00:00Z"),
  });

  await service.failDuplicateHeadChecks(session, HEAD, OWNER_PR_42_URL);

  assert.equal(
    requests.filter((request) => request.method === "PATCH").length,
    0,
  );
  const posts = requests.filter((request) => request.method === "POST");
  assert.equal(posts.length, 1);
  assert.equal(posts[0].options.body.external_id, `v1:duplicate-head:${HEAD}`);
});

test("failDuplicateHeadChecks fails closed on malformed or truncated check lists", async () => {
  const { GitHubService } = await loadPolicy();
  const build = (getResponse) => {
    const requests = [];
    const service = new GitHubService({
      api: {
        request: async (method) => {
          requests.push({ method });
          if (method === "GET") {
            return getResponse;
          }
          return {};
        },
      },
      appId: 123,
      privateKeyPem: "unused",
    });
    return { service, requests };
  };

  const truncated = build({
    total_count: 5,
    check_runs: Array.from({ length: 100 }, (_, index) => ({
      id: index + 1,
      name: "external-review-policy",
      head_sha: HEAD,
      external_id: null,
      app: { id: 123 },
    })),
  });
  await assert.rejects(
    truncated.service.failDuplicateHeadChecks(session, HEAD, OWNER_PR_42_URL),
    /pagination or response is invalid/,
  );

  const countMismatch = build({ total_count: 3, check_runs: [] });
  await assert.rejects(
    countMismatch.service.failDuplicateHeadChecks(session, HEAD, OWNER_PR_42_URL),
    /pagination or response is invalid/,
  );

  const malformedItem = build({
    total_count: 1,
    check_runs: [
      {
        id: 1,
        name: "external-review-policy",
        head_sha: HEAD,
        external_id: null,
        app: {},
      },
    ],
  });
  await assert.rejects(
    malformedItem.service.failDuplicateHeadChecks(session, HEAD, OWNER_PR_42_URL),
    /list item 0 is invalid/,
  );

  for (const harness of [truncated, countMismatch, malformedItem]) {
    assert.equal(
      harness.requests.filter((request) => request.method !== "GET").length,
      0,
    );
  }
});

test("initial duplicate is failed before finalization even when a later snapshot throws", async () => {
  const { POLICY, PolicyEvaluator, reconcile } = await loadPolicy();
  const OTHER = "d".repeat(40);
  const sharedA = makePull({ number: 42, author: "henrik-me", headSha: HEAD });
  const sharedB = makePull({ number: 43, author: "external-user", headSha: HEAD });
  const singleton = makePull({ number: 44, author: "henrik-me", headSha: OTHER });
  const github = new FakeGitHub({
    snapshots: [
      listing([sharedA, sharedB, singleton]),
      { throwError: new Error("open pull list unavailable") },
    ],
  });

  await assert.rejects(
    reconcile(
      github,
      new PolicyEvaluator({ github, policy: POLICY }),
      session,
      [],
    ),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.match(error.message, /open pull list unavailable|1 pull request/);
      return true;
    },
  );

  // The initial duplicate was failed in phase 2, before the throwing
  // pre-publication snapshot was ever taken.
  assert.deepEqual(github.duplicateFailures, [
    { headSha: HEAD, detailsUrl: OWNER_PR_42_URL },
  ]);
  // Only the singleton opened an in-progress check; no success was published.
  assert.deepEqual(
    github.upserts.map(({ status, headSha }) => ({ status, headSha })),
    [{ status: "in_progress", headSha: OTHER }],
  );
});

test("a late duplicate observed at a publication snapshot defers all success in that reconciliation", async () => {
  const { POLICY, PolicyEvaluator, reconcile } = await loadPolicy();
  const OTHER = "e".repeat(40);
  const first = makePull({ number: 42, author: "henrik-me", headSha: HEAD });
  const second = makePull({ number: 44, author: "henrik-me", headSha: OTHER });
  const latecomer = makePull({ number: 45, author: "external-user", headSha: HEAD });
  const github = new FakeGitHub({
    snapshots: [
      listing([first, second]),
      listing([first, second, latecomer]),
      listing([first, second, latecomer]),
    ],
  });

  await assert.rejects(
    reconcile(
      github,
      new PolicyEvaluator({ github, policy: POLICY }),
      session,
      [],
    ),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.ok(
        error.errors.some(({ message }) =>
          /Duplicate protected pull request heads observed/.test(message),
        ),
      );
      return true;
    },
  );

  // HEAD became duplicated during a publication snapshot; it is failed, and no
  // prepared PR — not even the still-unique #44 — publishes a success.
  assert.deepEqual(github.duplicateFailures, [
    { headSha: HEAD, detailsUrl: OWNER_PR_42_URL },
  ]);
  assert.deepEqual(
    github.upserts.map(({ status, conclusion, headSha }) => ({
      status,
      conclusion,
      headSha,
    })),
    [
      { status: "in_progress", conclusion: undefined, headSha: HEAD },
      { status: "in_progress", conclusion: undefined, headSha: OTHER },
    ],
  );
});

test("an approval dismissed between preparation and publication yields a failure", async () => {
  const { POLICY, PolicyEvaluator, reconcile } = await loadPolicy();
  const externalPull = makePull({ number: 7, author: "external-user" });
  const github = new FakeGitHub({
    snapshots: [listing([externalPull]), listing([externalPull])],
    reviewSequences: {
      7: [
        [review()],
        [review({ state: "DISMISSED", reviewId: 2, submittedAt: "2026-08-29T09:00:00Z" })],
      ],
    },
  });

  await reconcile(
    github,
    new PolicyEvaluator({ github, policy: POLICY }),
    session,
    [],
  );

  // Preparation saw the approval, but publication re-fetched reviews and saw
  // the dismissal, so the completed check is a failure, not a stale success.
  assert.deepEqual(
    github.upserts.map(({ status, conclusion }) => ({ status, conclusion })),
    [
      { status: "in_progress", conclusion: undefined },
      { status: "completed", conclusion: "failure" },
    ],
  );
  assert.equal(github.duplicateFailures.length, 0);
});

test("failDuplicateHeadChecks attempts every PATCH and aggregates after one fails", async () => {
  const { GitHubService } = await loadPolicy();
  const requests = [];
  const service = new GitHubService({
    api: {
      request: async (method, path, options) => {
        requests.push({ method, path, options });
        if (method === "GET") {
          return {
            total_count: 2,
            check_runs: [
              {
                id: 11,
                name: "external-review-policy",
                head_sha: HEAD,
                external_id: `v1:pr42:head:${HEAD}`,
                app: { id: 123 },
              },
              {
                id: 12,
                name: "external-review-policy",
                head_sha: HEAD,
                external_id: `v1:pr43:head:${HEAD}`,
                app: { id: 123 },
              },
            ],
          };
        }
        if (method === "PATCH" && path.endsWith("/check-runs/11")) {
          throw new Error("check-run 11 patch failed");
        }
        return { id: 12 };
      },
    },
    appId: 123,
    privateKeyPem: "unused",
    now: () => new Date("2026-08-28T16:00:00Z"),
  });

  await assert.rejects(
    service.failDuplicateHeadChecks(session, HEAD, OWNER_PR_42_URL),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.match(error.message, /Failed to fail 1 duplicate-head check run/);
      return true;
    },
  );

  // Both PATCHes were attempted even though the first rejected.
  assert.deepEqual(
    requests.filter((request) => request.method === "PATCH").map((request) => request.path),
    [
      "/repos/henrik-me/NaturalizationPuzzle/check-runs/11",
      "/repos/henrik-me/NaturalizationPuzzle/check-runs/12",
    ],
  );
});

test("failDuplicateHeadChecks ignores an app:null foreign run and patches the dedicated App run", async () => {
  const { GitHubService } = await loadPolicy();
  const requests = [];
  const service = new GitHubService({
    api: {
      request: async (method, path, options) => {
        requests.push({ method, path, options });
        if (method === "GET") {
          return {
            total_count: 2,
            check_runs: [
              {
                id: 31,
                name: "external-review-policy",
                head_sha: HEAD,
                external_id: null,
                app: null,
              },
              {
                id: 32,
                name: "external-review-policy",
                head_sha: HEAD,
                external_id: `v1:pr42:head:${HEAD}`,
                app: { id: 123 },
              },
            ],
          };
        }
        return { id: 32 };
      },
    },
    appId: 123,
    privateKeyPem: "unused",
    now: () => new Date("2026-08-28T16:00:00Z"),
  });

  await service.failDuplicateHeadChecks(session, HEAD, OWNER_PR_42_URL);

  const patches = requests.filter((request) => request.method === "PATCH");
  assert.deepEqual(
    patches.map((request) => request.path),
    ["/repos/henrik-me/NaturalizationPuzzle/check-runs/32"],
  );
  assert.equal(
    requests.some((request) => request.method === "POST"),
    false,
  );
});

test("listOpenPulls paginates explicitly and returns every page's entries", async () => {
  const { GitHubService } = await loadPolicy();
  const paths = [];
  const page1 = Array.from({ length: 100 }, (_, index) => ({ number: index + 1 }));
  const page2 = [{ number: 101 }, { number: 102 }];
  const service = new GitHubService({
    api: {
      request: async (_method, path) => {
        paths.push(path);
        if (path.endsWith("page=1")) return page1;
        if (path.endsWith("page=2")) return page2;
        throw new Error(`unexpected page fetch: ${path}`);
      },
    },
    appId: 123,
    privateKeyPem: "unused",
  });

  const result = await service.listOpenPulls(session);

  assert.equal(result.length, 102);
  assert.equal(result.at(-1).number, 102);
  assert.ok(paths.some((path) => path.endsWith("page=1")));
  assert.ok(paths.some((path) => path.endsWith("page=2")));
  assert.equal(
    paths.some((path) => path.endsWith("page=3")),
    false,
  );
});

test("listOpenPulls fails closed on a malformed later page", async () => {
  const { GitHubService } = await loadPolicy();
  const service = new GitHubService({
    api: {
      request: async (_method, path) => {
        if (path.endsWith("page=1")) {
          return Array.from({ length: 100 }, (_, index) => ({ number: index + 1 }));
        }
        return { not: "an array" };
      },
    },
    appId: 123,
    privateKeyPem: "unused",
  });

  await assert.rejects(
    service.listOpenPulls(session),
    /page is malformed/,
  );
});

test("listOpenPulls fails closed when the maximum page bound is saturated", async () => {
  const { GitHubService } = await loadPolicy();
  let pages = 0;
  const service = new GitHubService({
    api: {
      request: async () => {
        pages += 1;
        return Array.from({ length: 100 }, (_, index) => ({
          number: pages * 100 + index,
        }));
      },
    },
    appId: 123,
    privateKeyPem: "unused",
  });

  await assert.rejects(
    service.listOpenPulls(session),
    /pagination bound reached/,
  );
  assert.equal(pages, 10);
});

test("a duplicate head at or after record 100 across pages is detected and failed", async () => {
  const { POLICY, PolicyEvaluator, reconcile } = await loadPolicy();
  const SHARED = "f".repeat(40);
  const entries = [];
  // 99 unprotected fillers on the first page (records 0..98) are dropped.
  for (let number = 1; number <= 99; number += 1) {
    entries.push(
      makePull({
        number,
        author: "henrik-me",
        headSha: number.toString(16).padStart(40, "0"),
        base: "feature",
      }),
    );
  }
  // Record 99 (end of page 1) and record 100 (page 2) share a protected head,
  // so the collision is only visible after reading past record 100.
  entries.push(makePull({ number: 100, author: "henrik-me", headSha: SHARED }));
  entries.push(makePull({ number: 101, author: "external-user", headSha: SHARED }));
  const github = new FakeGitHub({
    snapshots: [listing(entries), listing(entries)],
  });

  await reconcile(
    github,
    new PolicyEvaluator({ github, policy: POLICY }),
    session,
    [],
  );

  assert.deepEqual(github.duplicateFailures, [
    {
      headSha: SHARED,
      detailsUrl: "https://github.com/henrik-me/NaturalizationPuzzle/pull/100",
    },
  ]);
  assert.equal(github.upserts.length, 0);
});

test("a duplicate PR number anywhere in the paginated list fails closed before writes", async () => {
  const { POLICY, PolicyEvaluator, reconcile } = await loadPolicy();
  const entries = [];
  for (let number = 1; number <= 100; number += 1) {
    entries.push({ number });
  }
  entries.push({ number: 50 });
  const github = new FakeGitHub({
    snapshots: [{ list: entries, pulls: {} }],
  });

  await assert.rejects(
    reconcile(
      github,
      new PolicyEvaluator({ github, policy: POLICY }),
      session,
      [],
    ),
    /duplicate pull number 50/,
  );
  assert.equal(github.upserts.length, 0);
  assert.equal(github.duplicateFailures.length, 0);
});

test("duplicate remediation, reviews and check-list preparation precede the final snapshot, and the success write immediately follows it", async () => {
  const { POLICY, PolicyEvaluator, reconcile } = await loadPolicy();
  const Z = "9".repeat(40);
  const target = makePull({ number: 42, author: "henrik-me", headSha: HEAD });
  const collidingA = makePull({ number: 60, author: "henrik-me", headSha: Z });
  const collidingB = makePull({ number: 61, author: "external-user", headSha: Z });
  const github = new FakeGitHub({
    snapshots: [
      listing([target]),
      // Preliminary snapshot: an unrelated pair shares Z (remediated here).
      listing([target, collidingA, collidingB]),
      // Final snapshot: the Z collision is resolved, so #42 may publish.
      listing([target, collidingA]),
    ],
  });

  await reconcile(
    github,
    new PolicyEvaluator({ github, policy: POLICY }),
    session,
    [],
  );

  const log = github.log;
  const apply = log.lastIndexOf("applyCheck:42");
  const finalList = log.lastIndexOf("listOpenPulls");
  const publicationReviews = log.lastIndexOf("listReviews:42");
  const checkList = log.indexOf("prepareCheck:42");
  const remediation = log.indexOf(`failDuplicate:${Z}`);

  // The success write is the very last operation.
  assert.equal(apply, log.length - 1);
  // Duplicate remediation, publication reviews and the check-list lookup all
  // precede the final authoritative snapshot.
  assert.ok(remediation !== -1 && remediation < finalList);
  assert.ok(publicationReviews < checkList);
  assert.ok(checkList < finalList);
  assert.ok(remediation < publicationReviews);
  // Between the final snapshot and the write there are only snapshot getPull
  // reads — no reviews, check-list, or other reads intervene.
  const between = log.slice(finalList + 1, apply);
  assert.ok(between.length > 0);
  assert.ok(between.every((operation) => operation.startsWith("getPull:")));

  assert.deepEqual(github.duplicateFailures, [
    {
      headSha: Z,
      detailsUrl: "https://github.com/henrik-me/NaturalizationPuzzle/pull/60",
    },
  ]);
  assert.equal(github.upserts.at(-1).conclusion, "success");
});

test("an unrelated duplicate at a final snapshot fails those heads and blocks a unique PR's success", async () => {
  const { POLICY, PolicyEvaluator, reconcile } = await loadPolicy();
  const HEAD_B = "2".repeat(40);
  const HEAD_C = "3".repeat(40);
  const HEAD_D = "4".repeat(40);
  const SHARED = "5".repeat(40);
  const a = makePull({ number: 42, author: "henrik-me", headSha: HEAD });
  const b = makePull({ number: 50, author: "henrik-me", headSha: HEAD_B });
  const c = makePull({ number: 51, author: "external-user", headSha: HEAD_C });
  const d = makePull({ number: 60, author: "henrik-me", headSha: HEAD_D });
  const github = new FakeGitHub({
    snapshots: [
      listing([a, b, c, d]),
      // A's preliminary snapshot: everything still unique.
      listing([a, b, c, d]),
      // A's final snapshot: B and C now share a head (a stale App success on
      // that SHA would otherwise satisfy both).
      listing([
        a,
        makePull({ number: 50, author: "henrik-me", headSha: SHARED }),
        makePull({ number: 51, author: "external-user", headSha: SHARED }),
        d,
      ]),
    ],
  });

  await assert.rejects(
    reconcile(
      github,
      new PolicyEvaluator({ github, policy: POLICY }),
      session,
      [],
    ),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.ok(
        error.errors.some(({ message }) =>
          /Duplicate protected pull request heads observed/.test(message),
        ),
      );
      return true;
    },
  );

  // The unrelated shared head is failed...
  assert.deepEqual(github.duplicateFailures, [
    {
      headSha: SHARED,
      detailsUrl: "https://github.com/henrik-me/NaturalizationPuzzle/pull/50",
    },
  ]);
  // ...and neither A (unique) nor any later prepared PR publishes a success.
  assert.ok(github.upserts.every(({ status }) => status === "in_progress"));
  assert.equal(
    github.log.some((operation) => operation.startsWith("applyCheck:")),
    false,
  );
});

test("remediation failure at a final snapshot aggregates and still blocks the unique PR's success", async () => {
  const { POLICY, PolicyEvaluator, reconcile } = await loadPolicy();
  const HEAD_B = "2".repeat(40);
  const SHARED = "5".repeat(40);
  const a = makePull({ number: 42, author: "henrik-me", headSha: HEAD });
  const b = makePull({ number: 50, author: "henrik-me", headSha: HEAD_B });
  const github = new FakeGitHub({
    snapshots: [
      listing([a, b]),
      listing([a, b]),
      listing([
        a,
        makePull({ number: 50, author: "henrik-me", headSha: SHARED }),
        makePull({ number: 51, author: "external-user", headSha: SHARED }),
      ]),
    ],
  });
  github.failDuplicateHeadChecks = async () => {
    throw new Error("remediation boom");
  };

  await assert.rejects(
    reconcile(
      github,
      new PolicyEvaluator({ github, policy: POLICY }),
      session,
      [],
    ),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.ok(
        error.errors.some(({ message }) => /remediation boom/.test(message)),
      );
      assert.ok(
        error.errors.some(({ message }) =>
          /Duplicate protected pull request heads observed/.test(message),
        ),
      );
      return true;
    },
  );

  assert.ok(github.upserts.every(({ status }) => status === "in_progress"));
  assert.equal(
    github.log.some((operation) => operation.startsWith("applyCheck:")),
    false,
  );
});

test("workflow removes App approval creation and adds duplicate-head failure", async () => {
  const workflow = await read(workflowPath);

  assert.doesNotMatch(workflow, /ensureTrustedAuthorApproval/);
  assert.doesNotMatch(workflow, /event: "APPROVE"/);
  assert.match(workflow, /failDuplicateHeadChecks/);
  assert.match(workflow, /v1:duplicate-head:/);
  assert.match(workflow, /snapshotOpenPulls/);
  assert.match(workflow, /async prepareCheck\(session, input\)/);
  assert.match(workflow, /async applyCheck\(session, plan, mutation\)/);
  assert.match(workflow, /per_page=\$\{perPage\}&page=\$\{page\}/);
});

test("JWT is short-lived RS256 and uses a numeric App ID issuer", async () => {
  const { createAppJwt } = await loadPolicy();
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const pem = privateKey.export({ format: "pem", type: "pkcs8" });

  const jwt = createAppJwt(123, pem, 2_000_000_000);
  assert.throws(
    () => createAppJwt("123", pem, 2_000_000_000),
    /APP_ID is invalid/,
  );
  const [header, payload, signature] = jwt.split(".");
  const decode = (part) =>
    JSON.parse(Buffer.from(part, "base64url").toString("utf8"));

  assert.deepEqual(decode(header), { alg: "RS256", typ: "JWT" });
  assert.deepEqual(decode(payload), {
    iat: 1_999_999_940,
    exp: 2_000_000_540,
    iss: 123,
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
});

test("review API wrapper rejects a non-numeric pull request identifier", async () => {
  const { GitHubService } = await loadPolicy();
  const service = new GitHubService({
    api: {
      request: async () => {
        throw new Error("API must not be called");
      },
    },
    appId: 123,
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
    appId: 123,
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
    appId: 123,
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

test("reconciliation retains bounded redacted diagnostics with PR identifiers", async () => {
  const { POLICY, reconcile, safeError } = await loadPolicy();
  const secret = "sensitive-installation-token";
  const pulls = Array.from({ length: 12 }, (_, index) =>
    makePull({
      number: index + 1,
      author: "henrik-me",
      headSha: (index + 1).toString(16).padStart(40, "0"),
    }),
  );
  const snap = listing(pulls);
  const github = new FakeGitHub({ snapshots: [snap, snap] });
  const evaluator = {
    policy: POLICY,
    prepare: async (entry) => {
      throw new Error(
        entry.number === 1
          ? `failure ${secret}\r\nforged ${"x".repeat(1_900)}`
          : `failure ${entry.number}`,
      );
    },
    publish: async () => {},
  };

  await assert.rejects(
    reconcile(github, evaluator, session, [secret]),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.match(error.message, /12 pull request\(s\)/);
      assert.equal(error.errors.length, 10);
      assert.match(error.errors[0].message, /^PR #1: Error: failure/);
      assert.doesNotMatch(error.errors[0].message, /sensitive|[\r\n]/);
      assert.match(error.errors.at(-1).message, /^PR #10:/);
      assert.ok(error.errors.every(({ message }) => message.length <= 160));

      const rendered = safeError(error, [secret]);
      assert.match(rendered, /PR #1: Error: failure \[REDACTED\] forged/);
      assert.match(rendered, /PR #10: Error: failure 10/);
      assert.doesNotMatch(rendered, /sensitive|[\r\n]/);
      assert.ok(rendered.length <= 2_000);
      return true;
    },
  );
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
    appId: 123,
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
});
