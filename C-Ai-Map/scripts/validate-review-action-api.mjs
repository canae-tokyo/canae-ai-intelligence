import assert from "node:assert/strict";
import worker, {
  getReviewActionStoreHash,
  processReviewActionRequestBody,
} from "../src/worker.mjs";

const candidateId =
  "candidate-news-github-changelog-2026-07-20-copilot-users-can-now-see-ai-credits-used-per-billing-cycle";
const candidateTitle = "Copilot users can now see AI credits used per billing cycle";
const baseCandidate = {
  id: candidateId,
  sourceId: "source-github-changelog",
  candidateType: "news",
  title: candidateTitle,
  sourceUrl: "https://github.blog/changelog/2026-07-20-copilot-users-can-now-see-ai-credits-used-per-billing-cycle",
  canonicalUrl: "https://github.blog/changelog/2026-07-20-copilot-users-can-now-see-ai-credits-used-per-billing-cycle",
  sourcePublishedAt: "2026-07-20",
  detectedAt: "2026-07-22",
  registeredAt: "2026-07-22",
  suggestedStatus: "draft",
  duplicateCheck: {
    status: "clear",
    matchedIds: [],
  },
  diffSummary: "Registered from duplicate/diff report as a pending draft candidate.",
  reviewStatus: "pending",
  reviewedAt: null,
  reviewedBy: null,
  promotedRecordType: null,
  promotedRecordId: null,
  promotedAt: null,
  notes: "Manual review is required.",
  changeLog: [
    {
      date: "2026-07-22",
      type: "registered",
      summary: "Registered as pending update candidate from duplicate/diff report.",
      actor: "CANAE/Codex",
    },
  ],
};
const now = new Date("2026-07-24T00:00:00.000Z");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

async function validBody(candidateStore = [baseCandidate], overrides = {}) {
  return {
    candidateId,
    decision: "approved",
    reviewedBy: "CANAE/Sato",
    notes: "公式情報と内容を確認",
    expectedStoreHash: await getReviewActionStoreHash(candidateStore),
    ...overrides,
  };
}

async function readJson(response) {
  return {
    status: response.status,
    body: await response.json(),
  };
}

{
  const candidateStore = [clone(baseCandidate)];
  const result = await processReviewActionRequestBody(await validBody(candidateStore), candidateStore, { now });

  assert.equal(result.status, 200, "pending approved dry-run should succeed");
  assert.equal(result.body.ok, true, "dry-run should be ok");
  assert.equal(result.body.mode, "dry-run", "mode should remain dry-run");
  assert.equal(result.body.reviewStatus, "accepted", "approved maps to accepted");
  assert.equal(result.body.reviewDecision, "approved", "decision should be recorded");
  assert.equal(result.body.reviewedAt, "2026-07-24T00:00:00.000Z", "reviewedAt should be server generated");
  assert.equal(result.body.storeChanged, false, "API foundation must not persist static JSON");
  assert.equal(result.body.persistence.available, false, "persistence must be disabled");
}

{
  const candidateStore = [clone(baseCandidate)];
  const result = await processReviewActionRequestBody(
    await validBody(candidateStore, { decision: "rejected" }),
    candidateStore,
    { now }
  );

  assert.equal(result.status, 200, "pending rejected dry-run should succeed");
  assert.equal(result.body.reviewStatus, "rejected", "rejected maps to rejected");
}

{
  const candidateStore = [clone(baseCandidate)];
  const result = await processReviewActionRequestBody(
    await validBody(candidateStore, { decision: "on-hold" }),
    candidateStore,
    { now }
  );

  assert.equal(result.status, 200, "pending on-hold dry-run should succeed");
  assert.equal(result.body.reviewStatus, "reviewing", "on-hold maps to reviewing");
}

{
  const reviewingCandidate = { ...clone(baseCandidate), reviewStatus: "reviewing", reviewDecision: "on-hold" };
  const candidateStore = [reviewingCandidate];
  const result = await processReviewActionRequestBody(await validBody(candidateStore), candidateStore, { now });

  assert.equal(result.status, 409, "reviewing approval without resolveHold must be rejected");
  assert.equal(result.body.error, "resolve-hold-required", "resolveHold must be required");
}

{
  const reviewingCandidate = { ...clone(baseCandidate), reviewStatus: "reviewing", reviewDecision: "on-hold" };
  const candidateStore = [reviewingCandidate];
  const result = await processReviewActionRequestBody(
    await validBody(candidateStore, { resolveHold: true }),
    candidateStore,
    { now }
  );

  assert.equal(result.status, 200, "reviewing approval with resolveHold should succeed");
  assert.equal(result.body.previousReviewStatus, "reviewing", "previous status should be reviewing");
}

{
  const acceptedCandidate = { ...clone(baseCandidate), reviewStatus: "accepted", reviewDecision: "approved" };
  const candidateStore = [acceptedCandidate];
  const result = await processReviewActionRequestBody(await validBody(candidateStore), candidateStore, { now });

  assert.equal(result.status, 409, "accepted candidate must be terminal");
  assert.equal(result.body.error, "candidate-already-reviewed", "terminal state must be rejected");
}

{
  const candidateStore = [clone(baseCandidate)];
  const result = await processReviewActionRequestBody(
    await validBody(candidateStore, { expectedStoreHash: "sha256:0000000000000000000000000000000000000000000000000000000000000000" }),
    candidateStore,
    { now }
  );

  assert.equal(result.status, 409, "hash mismatch must be a conflict");
  assert.equal(result.body.error, "store-hash-mismatch", "hash mismatch reason is required");
}

{
  const candidateStore = [clone(baseCandidate)];
  const result = await processReviewActionRequestBody(
    await validBody(candidateStore, { apply: true }),
    candidateStore,
    { now }
  );

  assert.equal(result.status, 501, "apply must fail until storage is configured");
  assert.equal(result.body.error, "storage-not-configured", "apply must fail closed");
  assert.equal(result.body.storeChanged, false, "apply must not claim persistence");
}

{
  const candidateStore = [clone(baseCandidate)];
  const result = await processReviewActionRequestBody(
    await validBody(candidateStore, { reviewedBy: " " }),
    candidateStore,
    { now }
  );

  assert.equal(result.status, 400, "blank reviewer must be rejected");
  assert.equal(result.body.error, "reviewed-by-invalid", "reviewedBy validation is required");
}

{
  let assetFetchCalled = false;
  const response = await worker.fetch(
    new Request("https://example.com/internal/api/review-candidates", {
      method: "POST",
      body: JSON.stringify(await validBody(undefined, { expectedStoreHash: await getReviewActionStoreHash() })),
    }),
    {
      ASSETS: {
        fetch: async () => {
          assetFetchCalled = true;
          return new Response(candidateTitle);
        },
      },
    }
  );
  const body = await response.text();

  assert.equal(response.status, 404, "unauthorized API requests must fail closed");
  assert.equal(assetFetchCalled, false, "unauthorized API requests must not reach ASSETS");
  assert.equal(body.includes(candidateTitle), false, "unauthorized API response must not leak candidate content");
}

{
  let assetFetchCalled = false;
  const response = await worker.fetch(
    new Request("http://localhost:8787/internal/api/review-candidates", {
      method: "POST",
      body: JSON.stringify(await validBody(undefined, { expectedStoreHash: await getReviewActionStoreHash() })),
    }),
    {
      INTERNAL_REVIEW_LOCAL_BYPASS: "true",
      ASSETS: {
        fetch: async () => {
          assetFetchCalled = true;
          return new Response(candidateTitle);
        },
      },
    }
  );
  const result = await readJson(response);

  assert.equal(response.status, 200, "authorized local API dry-run should succeed");
  assert.equal(assetFetchCalled, false, "API requests must not reach ASSETS");
  assert.equal(result.body.ok, true, "authorized API response should be ok");
  assert.equal(result.body.storeChanged, false, "authorized API must remain non-persistent");
}

console.log("Review Action API validation passed.");
