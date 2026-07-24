import assert from "node:assert/strict";
import {
  getReviewActionStoreHash,
  processPromotionPlanRequest,
  processPromotionPrRequest,
} from "../src/worker.mjs";

const now = new Date("2026-07-25T00:00:00.000Z");
const reviewerEmail = "canae.tokyo@gmail.com";

const approvedProposedRecord = {
  id: "news-2026-07-24-promotion-test",
  title: "Copilot users can now see AI credits used per billing cycle",
  company: "GitHub",
  category: "coding",
  importance: "medium",
  publishedAt: "2026-07-20",
  summary: "GitHub CopilotがAIクレジット利用量を課金サイクル単位で可視化する機能を追加した。",
  impact: "Copilot利用コストの可視化が進み、社内利用計画の精度が上がる。",
  sourceType: "official",
  sourceUrl: "https://github.blog/changelog/2026-07-20-copilot-users-can-now-see-ai-credits-used-per-billing-cycle",
  sourceCheckedAt: "2026-07-22",
  status: "draft",
};

function makeCandidate(overrides = {}) {
  return {
    id: "candidate-news-github-changelog-2026-07-20-copilot-users-can-now-see-ai-credits-used-per-billing-cycle",
    sourceId: "source-github-changelog",
    candidateType: "news",
    title: "Copilot users can now see AI credits used per billing cycle",
    sourceUrl:
      "https://github.blog/changelog/2026-07-20-copilot-users-can-now-see-ai-credits-used-per-billing-cycle",
    canonicalUrl:
      "https://github.blog/changelog/2026-07-20-copilot-users-can-now-see-ai-credits-used-per-billing-cycle",
    sourcePublishedAt: "2026-07-20",
    detectedAt: "2026-07-22",
    registeredAt: "2026-07-22",
    suggestedStatus: "draft",
    duplicateCheck: { status: "clear", matchedIds: [] },
    diffSummary: "Registered from duplicate/diff report as a pending draft candidate.",
    reviewStatus: "accepted",
    reviewDecision: "approved",
    reviewedAt: "2026-07-24T00:00:00.000Z",
    reviewedBy: "CANAE/Sato",
    reviewNotes: "公式情報と内容を確認",
    promotedRecordType: null,
    promotedRecordId: null,
    promotedAt: null,
    notes: "Manual review is required.",
    changeLog: [],
    proposedRecord: approvedProposedRecord,
    ...overrides,
  };
}

function approvedRowFor(candidate, storeHash) {
  return {
    candidate_id: candidate.id,
    candidate_type: candidate.candidateType,
    source_store_hash: storeHash,
    actor_email: reviewerEmail,
  };
}

function createPromotionD1({ approvedRows = [], completedCandidateIds = [] } = {}) {
  const promotionPlans = new Map();
  const promotionRuns = [];
  const promotionRunItems = [];
  const completed = new Set(completedCandidateIds);

  function statement(sql, args) {
    return {
      sql,
      args,
      bind(...newArgs) {
        return statement(sql, newArgs);
      },
      async all() {
        if (/FROM review_candidate_actions WHERE review_decision = 'approved'/.test(sql)) {
          return { results: approvedRows };
        }
        if (/FROM promotion_run_items WHERE status = 'completed'/.test(sql)) {
          return {
            results: [...completed, ...promotionRunItems.filter((i) => i.status === "completed").map((i) => i.candidate_id)]
              .filter((value, index, all) => all.indexOf(value) === index)
              .map((candidateId) => ({ candidate_id: candidateId })),
          };
        }
        throw new Error(`Unhandled .all() query: ${sql}`);
      },
      async first() {
        if (/FROM promotion_plans WHERE id = \?/.test(sql)) {
          return promotionPlans.get(args[0]) ?? null;
        }
        throw new Error(`Unhandled .first() query: ${sql}`);
      },
      async run() {
        if (/INSERT INTO promotion_plans/.test(sql)) {
          const [id, candidateIds, sourceStoreHash, plan, actorEmail, createdAt] = args;
          promotionPlans.set(id, {
            id,
            candidate_ids: candidateIds,
            source_store_hash: sourceStoreHash,
            plan,
            actor_email: actorEmail,
            created_at: createdAt,
            consumed_at: null,
          });
          return { success: true };
        }
        if (/UPDATE promotion_plans SET consumed_at/.test(sql)) {
          const [consumedAt, id] = args;
          const row = promotionPlans.get(id);
          if (row) row.consumed_at = consumedAt;
          return { success: true };
        }
        throw new Error(`Unhandled .run() statement: ${sql}`);
      },
    };
  }

  return {
    promotionPlans,
    promotionRuns,
    promotionRunItems,
    prepare(sql) {
      return statement(sql, []);
    },
    async batch(statements) {
      for (const stmt of statements) {
        if (/INSERT INTO promotion_runs/.test(stmt.sql)) {
          const [
            id,
            status,
            actorEmail,
            sourceStoreHash,
            targetBranch,
            pullRequestUrl,
            pullRequestNumber,
            errorCode,
            errorMessage,
            createdAt,
            updatedAt,
          ] = stmt.args;
          promotionRuns.push({
            id,
            status,
            actor_email: actorEmail,
            source_store_hash: sourceStoreHash,
            target_branch: targetBranch,
            pull_request_url: pullRequestUrl,
            pull_request_number: pullRequestNumber,
            error_code: errorCode,
            error_message: errorMessage,
            created_at: createdAt,
            updated_at: updatedAt,
          });
        } else if (/INSERT INTO promotion_run_items/.test(stmt.sql)) {
          const [id, promotionRunId, candidateId, candidateType, targetFile, operation, status, errorCode, createdAt] = stmt.args;
          promotionRunItems.push({
            id,
            promotion_run_id: promotionRunId,
            candidate_id: candidateId,
            candidate_type: candidateType,
            target_file: targetFile,
            operation,
            status,
            error_code: errorCode,
            created_at: createdAt,
          });
        } else {
          throw new Error(`Unhandled batch statement: ${stmt.sql}`);
        }
      }
      return statements.map(() => ({ success: true }));
    },
  };
}

function seedGithubFiles() {
  return {
    "data/news.json": {
      sha: "news-sha-1",
      content: `${JSON.stringify(
        [{ id: "news-2026-03-09-001", title: "existing item", sourceUrl: "https://example.com/existing" }],
        null,
        2
      )}\n`,
    },
    "data/update-candidates.json": {
      sha: "candidates-sha-1",
      content: `${JSON.stringify([makeCandidate()], null, 2)}\n`,
    },
  };
}

function createMockGithubFetch({ files, blockedBranchNames = new Set(), captured = [], failPullRequest = false }) {
  return async function mockFetch(url, init = {}) {
    const method = init.method ?? "GET";
    const parsedBody = init.body ? JSON.parse(init.body) : null;
    captured.push({ url, method, body: parsedBody });

    if (method === "GET" && /\/git\/ref\/heads\//.test(url)) {
      return new Response(JSON.stringify({ object: { sha: "base-sha-123" } }), { status: 200 });
    }

    if (method === "POST" && /\/git\/refs$/.test(url)) {
      const branchName = parsedBody.ref.replace("refs/heads/", "");
      if (blockedBranchNames.has(branchName)) {
        return new Response(JSON.stringify({ message: "Reference already exists" }), { status: 422 });
      }
      return new Response(JSON.stringify({ ref: parsedBody.ref }), { status: 201 });
    }

    if (method === "GET" && /\/contents\//.test(url)) {
      const path = decodeURIComponent(url.split("/contents/")[1].split("?")[0]);
      const file = files[path];
      if (!file) return new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
      return new Response(JSON.stringify({ sha: file.sha, content: Buffer.from(file.content, "utf8").toString("base64") }), {
        status: 200,
      });
    }

    if (method === "PUT" && /\/contents\//.test(url)) {
      const path = decodeURIComponent(url.split("/contents/")[1].split("?")[0]);
      const decodedContent = Buffer.from(parsedBody.content, "base64").toString("utf8");
      files[path] = { sha: `${path}-updated-sha`, content: decodedContent };
      return new Response(JSON.stringify({ content: { sha: files[path].sha } }), { status: 200 });
    }

    if (method === "POST" && /\/pulls$/.test(url)) {
      if (failPullRequest) {
        return new Response(JSON.stringify({ message: "validation failed" }), { status: 422 });
      }
      return new Response(
        JSON.stringify({ html_url: "https://github.com/canae-tokyo/canae-ai-intelligence/pull/999", number: 999 }),
        { status: 201 }
      );
    }

    return new Response(JSON.stringify({ message: `unhandled mock route: ${method} ${url}` }), { status: 500 });
  };
}

async function planFor(candidate, db) {
  const storeHash = await getReviewActionStoreHash([candidate]);
  const planResult = await processPromotionPlanRequest(
    { candidateIds: [candidate.id], expectedStoreHash: storeHash },
    [candidate],
    { db, reviewerEmail, now }
  );
  assert.equal(planResult.status, 200, "plan generation must succeed for the fixture candidate");
  return { storeHash, promotionPlanId: planResult.body.promotionPlanId };
}

// GITHUB_PROMOTION_TOKEN missing must fail closed with 501, before any GitHub calls or D1 writes.
{
  const candidate = makeCandidate();
  const db = createPromotionD1({ approvedRows: [approvedRowFor(candidate, await getReviewActionStoreHash([candidate]))] });
  const { storeHash, promotionPlanId } = await planFor(candidate, db);

  const result = await processPromotionPrRequest(
    { promotionPlanId, expectedStoreHash: storeHash, confirm: true },
    [candidate],
    { db, reviewerEmail, now, githubToken: undefined, repoOwner: "canae-tokyo", repoName: "canae-ai-intelligence", baseBranch: "main" }
  );

  assert.equal(result.status, 501, "missing GitHub token must return 501");
  assert.equal(result.body.error, "github-promotion-not-configured");
  assert.equal(db.promotionRuns.length, 0, "no promotion_runs row should be written when token is missing");
}

// confirm:true is required.
{
  const candidate = makeCandidate();
  const db = createPromotionD1({ approvedRows: [approvedRowFor(candidate, await getReviewActionStoreHash([candidate]))] });
  const { storeHash, promotionPlanId } = await planFor(candidate, db);

  const result = await processPromotionPrRequest(
    { promotionPlanId, expectedStoreHash: storeHash, confirm: false },
    [candidate],
    { db, reviewerEmail, now, githubToken: "test-token", repoOwner: "canae-tokyo", repoName: "canae-ai-intelligence" }
  );

  assert.equal(result.status, 400);
  assert.equal(result.body.error, "invalid-request");
}

// Happy path: token configured, GitHub API mocked -> branch created, files updated, PR created,
// promotion_runs/promotion_run_items recorded, main is never merged into (no merge endpoint is ever called).
{
  const candidate = makeCandidate();
  const db = createPromotionD1({ approvedRows: [approvedRowFor(candidate, await getReviewActionStoreHash([candidate]))] });
  const { storeHash, promotionPlanId } = await planFor(candidate, db);
  const files = seedGithubFiles();
  const captured = [];
  const githubFetchImpl = createMockGithubFetch({ files, captured });

  const result = await processPromotionPrRequest(
    { promotionPlanId, expectedStoreHash: storeHash, confirm: true },
    [candidate],
    {
      db,
      reviewerEmail,
      now,
      githubToken: "test-token",
      repoOwner: "canae-tokyo",
      repoName: "canae-ai-intelligence",
      baseBranch: "main",
      githubFetchImpl,
    }
  );

  assert.equal(result.status, 200, `expected 200, got ${result.status}: ${JSON.stringify(result.body)}`);
  assert.equal(result.body.ok, true);
  assert.equal(result.body.pullRequestUrl, "https://github.com/canae-tokyo/canae-ai-intelligence/pull/999");
  assert.equal(result.body.pullRequestNumber, 999);
  assert.match(result.body.targetBranch, /^promotion\/verified-\d{8}-\d{6}$/);

  assert.equal(captured.some((call) => call.method === "PUT" && call.url.includes("/contents/data/news.json")), true);
  assert.equal(
    captured.some((call) => call.method === "PUT" && call.url.includes("/contents/data/update-candidates.json")),
    true
  );
  assert.equal(
    captured.some((call) => /\/merges$/.test(call.url) || (call.method === "PUT" && /\/pulls\/\d+\/merge$/.test(call.url))),
    false,
    "the automation must never call a merge endpoint"
  );

  const updatedNews = JSON.parse(files["data/news.json"].content);
  assert.equal(updatedNews.length, 2, "news.json must gain exactly the new record");
  assert.equal(updatedNews[1].id, approvedProposedRecord.id);

  const updatedCandidates = JSON.parse(files["data/update-candidates.json"].content);
  const updatedCandidate = updatedCandidates.find((c) => c.id === candidate.id);
  assert.equal(updatedCandidate.promotedRecordType, "news");
  assert.equal(updatedCandidate.promotedRecordId, approvedProposedRecord.id);
  assert.equal(typeof updatedCandidate.promotedAt, "string");
  assert.equal(
    updatedCandidate.changeLog.some((entry) => entry.type === "promoted"),
    true
  );

  assert.equal(db.promotionRuns.length, 1);
  assert.equal(db.promotionRuns[0].status, "completed");
  assert.equal(db.promotionRuns[0].actor_email, reviewerEmail);
  assert.equal(db.promotionRunItems.length, 1);
  assert.equal(db.promotionRunItems[0].status, "completed");
  assert.equal(db.promotionRunItems[0].candidate_id, candidate.id);

  const planRow = db.promotionPlans.get(promotionPlanId);
  assert.ok(planRow.consumed_at, "plan must be marked consumed after a successful PR");
}

// Already-promoted candidate (completed run item exists) must be rejected before any GitHub call.
{
  const candidate = makeCandidate();
  const storeHash = await getReviewActionStoreHash([candidate]);
  const db = createPromotionD1({
    approvedRows: [approvedRowFor(candidate, storeHash)],
    completedCandidateIds: [candidate.id],
  });

  // Plan generation itself already refuses already-promoted candidates; simulate a plan that
  // predates the completed run to exercise the confirm-time re-check.
  const planId = "promotion-plan-stale";
  db.promotionPlans.set(planId, {
    id: planId,
    candidate_ids: JSON.stringify([candidate.id]),
    source_store_hash: storeHash,
    plan: JSON.stringify([
      {
        candidateId: candidate.id,
        candidateType: "news",
        targetFile: "data/news.json",
        operation: "append",
        summary: "Add news item",
        record: approvedProposedRecord,
        reviewActor: reviewerEmail,
      },
    ]),
    actor_email: reviewerEmail,
    created_at: now.toISOString(),
    consumed_at: null,
  });

  const captured = [];
  const result = await processPromotionPrRequest(
    { promotionPlanId: planId, expectedStoreHash: storeHash, confirm: true },
    [candidate],
    {
      db,
      reviewerEmail,
      now,
      githubToken: "test-token",
      repoOwner: "canae-tokyo",
      repoName: "canae-ai-intelligence",
      baseBranch: "main",
      githubFetchImpl: createMockGithubFetch({ files: seedGithubFiles(), captured }),
    }
  );

  assert.equal(result.status, 409);
  assert.equal(result.body.error, "promotion-pr-already-exists");
  assert.equal(captured.length, 0, "no GitHub API call should happen for an already-promoted candidate");
}

// GitHub PR creation failure is recorded as a failed run and does not silently pretend success.
{
  const candidate = makeCandidate();
  const db = createPromotionD1({ approvedRows: [approvedRowFor(candidate, await getReviewActionStoreHash([candidate]))] });
  const { storeHash, promotionPlanId } = await planFor(candidate, db);
  const files = seedGithubFiles();

  const result = await processPromotionPrRequest(
    { promotionPlanId, expectedStoreHash: storeHash, confirm: true },
    [candidate],
    {
      db,
      reviewerEmail,
      now,
      githubToken: "test-token",
      repoOwner: "canae-tokyo",
      repoName: "canae-ai-intelligence",
      baseBranch: "main",
      githubFetchImpl: createMockGithubFetch({ files, failPullRequest: true }),
    }
  );

  assert.equal(result.status, 500);
  assert.equal(result.body.error, "github-promotion-failed");
  assert.equal(db.promotionRuns.length, 1);
  assert.equal(db.promotionRuns[0].status, "failed");
}

// Branch name collision is retried with a numeric suffix instead of failing.
{
  const candidate = makeCandidate();
  const db = createPromotionD1({ approvedRows: [approvedRowFor(candidate, await getReviewActionStoreHash([candidate]))] });
  const { storeHash, promotionPlanId } = await planFor(candidate, db);
  const files = seedGithubFiles();
  const stamp = `${now.toISOString().slice(0, 4)}${now.toISOString().slice(5, 7)}${now.toISOString().slice(8, 10)}-${now
    .toISOString()
    .slice(11, 13)}${now.toISOString().slice(14, 16)}${now.toISOString().slice(17, 19)}`;
  const blockedBranchNames = new Set([`promotion/verified-${stamp}`]);

  const result = await processPromotionPrRequest(
    { promotionPlanId, expectedStoreHash: storeHash, confirm: true },
    [candidate],
    {
      db,
      reviewerEmail,
      now,
      githubToken: "test-token",
      repoOwner: "canae-tokyo",
      repoName: "canae-ai-intelligence",
      baseBranch: "main",
      githubFetchImpl: createMockGithubFetch({ files, blockedBranchNames }),
    }
  );

  assert.equal(result.status, 200);
  assert.equal(result.body.targetBranch, `promotion/verified-${stamp}-2`);
}

console.log("Verified Promotion GitHub-integration validation passed.");
