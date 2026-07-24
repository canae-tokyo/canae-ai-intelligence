import assert from "node:assert/strict";
import {
  getReviewActionStoreHash,
  processPromotionCandidatesRequest,
  processPromotionPlanRequest,
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

function createPromotionD1({ approvedRows = [], completedCandidateIds = [] } = {}) {
  const promotionPlans = new Map();
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
          return { results: [...completed].map((candidateId) => ({ candidate_id: candidateId })) };
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
        throw new Error(`Unhandled .run() statement: ${sql}`);
      },
    };
  }

  return {
    promotionPlans,
    prepare(sql) {
      return statement(sql, []);
    },
  };
}

function approvedRowFor(candidate, storeHash, overrides = {}) {
  return {
    candidate_id: candidate.id,
    candidate_type: candidate.candidateType,
    source_store_hash: storeHash,
    actor_email: reviewerEmail,
    ...overrides,
  };
}

// GET promotion-candidates: no D1 binding must fail closed with 501.
{
  const result = await processPromotionCandidatesRequest([makeCandidate()], {});
  assert.equal(result.status, 501, "missing D1 binding must return 501");
  assert.equal(result.body.error, "storage-not-configured");
}

// GET promotion-candidates: approved + complete proposedRecord is listed as promotable.
{
  const candidate = makeCandidate();
  const storeHash = await getReviewActionStoreHash([candidate]);
  const db = createPromotionD1({ approvedRows: [approvedRowFor(candidate, storeHash)] });
  const result = await processPromotionCandidatesRequest([candidate], { db });

  assert.equal(result.status, 200);
  assert.equal(result.body.candidates.length, 1, "one promotable candidate expected");
  assert.equal(result.body.candidates[0].canPromote, true);
  assert.equal(result.body.candidates[0].targetFile, "data/news.json");
  assert.equal(result.body.storeHash, storeHash);
}

// GET promotion-candidates: rejected/on-hold decisions never appear (query itself excludes them,
// simulated here by simply not including such rows — the SQL WHERE clause is the real guard).
{
  const candidate = makeCandidate({ reviewStatus: "rejected", reviewDecision: "rejected" });
  const storeHash = await getReviewActionStoreHash([candidate]);
  const db = createPromotionD1({ approvedRows: [] });
  const result = await processPromotionCandidatesRequest([candidate], { db });

  assert.equal(result.body.candidates.length, 0, "rejected candidates must not be promotable");
}

// GET promotion-candidates: source_store_hash mismatch excludes the candidate.
{
  const candidate = makeCandidate();
  const db = createPromotionD1({
    approvedRows: [approvedRowFor(candidate, "sha256:0000000000000000000000000000000000000000000000000000000000000000")],
  });
  const result = await processPromotionCandidatesRequest([candidate], { db });

  assert.equal(result.body.candidates.length, 0, "stale source_store_hash must exclude the candidate");
}

// GET promotion-candidates: unsupported candidate type is listed but not promotable.
{
  const candidate = makeCandidate({ candidateType: "unknown-type" });
  const storeHash = await getReviewActionStoreHash([candidate]);
  const db = createPromotionD1({ approvedRows: [approvedRowFor(candidate, storeHash, { candidate_type: "unknown-type" })] });
  const result = await processPromotionCandidatesRequest([candidate], { db });

  assert.equal(result.body.candidates.length, 1);
  assert.equal(result.body.candidates[0].canPromote, false);
  assert.equal(result.body.candidates[0].reason, "unsupported-candidate-type");
}

// GET promotion-candidates: missing proposedRecord is listed with the missing fields, not fabricated.
{
  const candidate = makeCandidate({ proposedRecord: null });
  const storeHash = await getReviewActionStoreHash([candidate]);
  const db = createPromotionD1({ approvedRows: [approvedRowFor(candidate, storeHash)] });
  const result = await processPromotionCandidatesRequest([candidate], { db });

  assert.equal(result.body.candidates.length, 1);
  assert.equal(result.body.candidates[0].canPromote, false);
  assert.equal(result.body.candidates[0].reason, "incomplete-proposed-record");
  assert.ok(result.body.candidates[0].missingFields.includes("company"));
}

// GET promotion-candidates: already-promoted candidates (completed run item) are excluded.
{
  const candidate = makeCandidate();
  const storeHash = await getReviewActionStoreHash([candidate]);
  const db = createPromotionD1({
    approvedRows: [approvedRowFor(candidate, storeHash)],
    completedCandidateIds: [candidate.id],
  });
  const result = await processPromotionCandidatesRequest([candidate], { db });

  assert.equal(result.body.candidates.length, 0, "already-promoted candidates must be excluded");
}

// POST promotion-plan: candidateIds required.
{
  const candidate = makeCandidate();
  const storeHash = await getReviewActionStoreHash([candidate]);
  const db = createPromotionD1({ approvedRows: [approvedRowFor(candidate, storeHash)] });
  const result = await processPromotionPlanRequest({ expectedStoreHash: storeHash }, [candidate], { db, reviewerEmail, now });

  assert.equal(result.status, 400);
  assert.equal(result.body.error, "invalid-request");
}

// POST promotion-plan: expectedStoreHash mismatch is a conflict, not silently applied.
{
  const candidate = makeCandidate();
  const storeHash = await getReviewActionStoreHash([candidate]);
  const db = createPromotionD1({ approvedRows: [approvedRowFor(candidate, storeHash)] });
  const result = await processPromotionPlanRequest(
    {
      candidateIds: [candidate.id],
      expectedStoreHash: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
    },
    [candidate],
    { db, reviewerEmail, now }
  );

  assert.equal(result.status, 409);
  assert.equal(result.body.error, "promotion-conflict");
  assert.equal(result.body.reason, "store-hash-mismatch");
}

// POST promotion-plan: happy path generates a diff without touching data/*.json (no fs writes; the
// function is pure and only returns the proposed change plus a promotionPlanId).
{
  const candidate = makeCandidate();
  const storeHash = await getReviewActionStoreHash([candidate]);
  const db = createPromotionD1({ approvedRows: [approvedRowFor(candidate, storeHash)] });
  const result = await processPromotionPlanRequest(
    { candidateIds: [candidate.id], expectedStoreHash: storeHash },
    [candidate],
    { db, reviewerEmail, now }
  );

  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.match(result.body.promotionPlanId, /^promotion-plan-/);
  assert.equal(result.body.changes.length, 1);
  assert.equal(result.body.changes[0].targetFile, "data/news.json");
  assert.equal(result.body.changes[0].operation, "append");
  assert.equal(result.body.changes[0].record.id, approvedProposedRecord.id);
  assert.equal(
    result.body.changes[0].reviewActor,
    undefined,
    "internal reviewActor bookkeeping must not leak into the client-facing plan response"
  );
  assert.equal(db.promotionPlans.size, 1, "plan must be persisted for the confirm step to reference");
}

// POST promotion-plan: candidate not approved must be a conflict, not silently skipped.
{
  const candidate = makeCandidate();
  const storeHash = await getReviewActionStoreHash([candidate]);
  const db = createPromotionD1({ approvedRows: [] });
  const result = await processPromotionPlanRequest(
    { candidateIds: [candidate.id], expectedStoreHash: storeHash },
    [candidate],
    { db, reviewerEmail, now }
  );

  assert.equal(result.status, 409);
  assert.equal(result.body.error, "promotion-conflict");
  assert.equal(result.body.reason, "not-approved-or-not-found");
}

// POST promotion-plan: incomplete proposedRecord blocks plan generation with the missing fields.
{
  const candidate = makeCandidate({ proposedRecord: { id: "x", title: "x" } });
  const storeHash = await getReviewActionStoreHash([candidate]);
  const db = createPromotionD1({ approvedRows: [approvedRowFor(candidate, storeHash)] });
  const result = await processPromotionPlanRequest(
    { candidateIds: [candidate.id], expectedStoreHash: storeHash },
    [candidate],
    { db, reviewerEmail, now }
  );

  assert.equal(result.status, 400);
  assert.equal(result.body.error, "incomplete-proposed-record");
  assert.ok(Array.isArray(result.body.missingFields) && result.body.missingFields.length > 0);
}

// POST promotion-plan: duplicate id already present in the target file is rejected.
{
  const candidate = makeCandidate({
    proposedRecord: { ...approvedProposedRecord, id: "news-2026-03-09-001" },
  });
  const storeHash = await getReviewActionStoreHash([candidate]);
  const db = createPromotionD1({ approvedRows: [approvedRowFor(candidate, storeHash)] });
  const result = await processPromotionPlanRequest(
    { candidateIds: [candidate.id], expectedStoreHash: storeHash },
    [candidate],
    { db, reviewerEmail, now }
  );

  assert.equal(result.status, 409);
  assert.equal(result.body.error, "promotion-conflict");
  assert.equal(result.body.reason, "duplicate-id");
}

console.log("Verified Promotion validation passed.");
