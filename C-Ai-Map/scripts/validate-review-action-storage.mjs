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
const reviewerEmail = "canae.tokyo@gmail.com";

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
    apply: true,
    ...overrides,
  };
}

function createFakeD1({ shouldFail = false } = {}) {
  const statements = [];
  return {
    statements,
    prepare(sql) {
      return {
        bind(...args) {
          return { sql, args };
        },
      };
    },
    async batch(preparedStatements) {
      if (shouldFail) {
        throw new Error("simulated d1 failure");
      }
      statements.push(...preparedStatements);
      return preparedStatements.map(() => ({ success: true }));
    },
  };
}

async function readJson(response) {
  return {
    status: response.status,
    body: await response.json(),
  };
}

// D1 binding not configured must fail closed with 501.
{
  const candidateStore = [clone(baseCandidate)];
  const result = await processReviewActionRequestBody(
    await validBody(candidateStore),
    candidateStore,
    { now, reviewerEmail }
  );

  assert.equal(result.status, 501, "apply without D1 binding must return 501");
  assert.equal(result.body.error, "storage-not-configured", "must report storage-not-configured");
  assert.equal(result.body.storeChanged, false, "storeChanged must remain false");
}

// D1 binding configured: successful apply upserts state and inserts an audit log entry.
{
  const candidateStore = [clone(baseCandidate)];
  const db = createFakeD1();
  const result = await processReviewActionRequestBody(
    await validBody(candidateStore),
    candidateStore,
    { now, reviewerEmail, db }
  );

  assert.equal(result.status, 200, "apply with D1 binding should succeed");
  assert.equal(result.body.ok, true, "apply should be ok");
  assert.equal(result.body.mode, "applied", "mode should be applied");
  assert.equal(result.body.reviewStatus, "accepted", "approved maps to accepted");
  assert.equal(result.body.storeChanged, false, "data/update-candidates.json must remain untouched");
  assert.equal(result.body.persistence.available, true, "persistence should report available");
  assert.equal(result.body.persistence.backend, "d1", "persistence backend should be d1");
  assert.equal(typeof result.body.actionId, "string", "actionId should be generated");

  assert.equal(db.statements.length, 2, "one upsert and one audit log insert must be issued");

  const [upsertStatement, logStatement] = db.statements;
  assert.match(upsertStatement.sql, /INSERT INTO review_candidate_actions/, "first statement upserts latest state");
  assert.match(logStatement.sql, /INSERT INTO review_candidate_action_logs/, "second statement inserts audit log");

  const [
    upsertCandidateId,
    upsertCandidateType,
    upsertReviewDecision,
    upsertReviewStatus,
    ,
    ,
    ,
    upsertActorEmail,
  ] = upsertStatement.args;

  assert.equal(upsertCandidateId, candidateId, "upsert must target the requested candidate");
  assert.equal(upsertCandidateType, "news", "candidateType must be recorded");
  assert.equal(upsertReviewDecision, "approved", "review decision must be recorded");
  assert.equal(upsertReviewStatus, "accepted", "review status must be recorded");
  assert.equal(upsertActorEmail, reviewerEmail, "actor_email must come from Access authorization, not request body");

  const logActorEmail = logStatement.args[9];
  assert.equal(logActorEmail, reviewerEmail, "audit log actor_email must come from Access authorization");
}

// D1 write failures must fail closed with 500, not silently succeed.
{
  const candidateStore = [clone(baseCandidate)];
  const db = createFakeD1({ shouldFail: true });
  const result = await processReviewActionRequestBody(
    await validBody(candidateStore),
    candidateStore,
    { now, reviewerEmail, db }
  );

  assert.equal(result.status, 500, "D1 write failure must return 500");
  assert.equal(result.body.error, "storage-write-failed", "must report storage-write-failed");
  assert.equal(result.body.ok, false, "failed write must not report ok");
  assert.equal(result.body.storeChanged, false, "storeChanged must remain false on failure");
}

// Dry-run (apply omitted/false) must never touch storage even if D1 is bound.
{
  const candidateStore = [clone(baseCandidate)];
  const db = createFakeD1();
  const result = await processReviewActionRequestBody(
    await validBody(candidateStore, { apply: false }),
    candidateStore,
    { now, reviewerEmail, db }
  );

  assert.equal(result.status, 200, "dry-run should succeed");
  assert.equal(result.body.mode, "dry-run", "mode should remain dry-run");
  assert.equal(db.statements.length, 0, "dry-run must not write to D1");
}

// expectedStoreHash mismatch must remain a 409 conflict and must not touch storage.
{
  const candidateStore = [clone(baseCandidate)];
  const db = createFakeD1();
  const result = await processReviewActionRequestBody(
    await validBody(candidateStore, {
      expectedStoreHash: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
    }),
    candidateStore,
    { now, reviewerEmail, db }
  );

  assert.equal(result.status, 409, "hash mismatch must be a conflict");
  assert.equal(result.body.error, "store-hash-mismatch", "hash mismatch reason is required");
  assert.equal(db.statements.length, 0, "hash mismatch must not write to D1");
}

// Nonexistent candidate must be a 404 and must not touch storage.
{
  const candidateStore = [clone(baseCandidate)];
  const db = createFakeD1();
  const result = await processReviewActionRequestBody(
    await validBody(candidateStore, { candidateId: "candidate-does-not-exist" }),
    candidateStore,
    { now, reviewerEmail, db }
  );

  assert.equal(result.status, 404, "unknown candidateId must return 404");
  assert.equal(result.body.error, "candidate-not-found", "unknown candidateId reason is required");
  assert.equal(db.statements.length, 0, "unknown candidateId must not write to D1");
}

// Invalid decision must remain a 400 and must not touch storage.
{
  const candidateStore = [clone(baseCandidate)];
  const db = createFakeD1();
  const result = await processReviewActionRequestBody(
    await validBody(candidateStore, { decision: "delete" }),
    candidateStore,
    { now, reviewerEmail, db }
  );

  assert.equal(result.status, 400, "invalid decision must return 400");
  assert.equal(result.body.error, "decision-invalid", "invalid decision reason is required");
  assert.equal(db.statements.length, 0, "invalid decision must not write to D1");
}

// Terminal state re-action must remain a 409 conflict and must not touch storage.
{
  const acceptedCandidate = { ...clone(baseCandidate), reviewStatus: "accepted", reviewDecision: "approved" };
  const candidateStore = [acceptedCandidate];
  const db = createFakeD1();
  const result = await processReviewActionRequestBody(
    await validBody(candidateStore),
    candidateStore,
    { now, reviewerEmail, db }
  );

  assert.equal(result.status, 409, "terminal state re-action must be rejected");
  assert.equal(result.body.error, "candidate-already-reviewed", "terminal state reason is required");
  assert.equal(db.statements.length, 0, "terminal state re-action must not write to D1");
}

// End-to-end through the worker: unauthorized requests must not reach D1 or leak candidate content.
{
  let dbTouched = false;
  const db = createFakeD1();
  const originalBatch = db.batch.bind(db);
  db.batch = async (...args) => {
    dbTouched = true;
    return originalBatch(...args);
  };

  const response = await worker.fetch(
    new Request("https://example.com/internal/api/review-candidates", {
      method: "POST",
      body: JSON.stringify(await validBody(undefined, { expectedStoreHash: await getReviewActionStoreHash() })),
    }),
    {
      REVIEW_ACTION_DB: db,
      ASSETS: {
        fetch: async () => new Response(candidateTitle),
      },
    }
  );
  const body = await response.text();

  assert.equal(response.status, 404, "unauthorized apply requests must fail closed");
  assert.equal(dbTouched, false, "unauthorized apply requests must not reach D1");
  assert.equal(body.includes(candidateTitle), false, "unauthorized API response must not leak candidate content");
}

// End-to-end through the worker: authorized local apply persists to the bound D1 database.
{
  const db = createFakeD1();
  const response = await worker.fetch(
    new Request("http://localhost:8787/internal/api/review-candidates", {
      method: "POST",
      body: JSON.stringify(await validBody(undefined, { expectedStoreHash: await getReviewActionStoreHash() })),
    }),
    {
      INTERNAL_REVIEW_LOCAL_BYPASS: "true",
      REVIEW_ACTION_DB: db,
      ASSETS: {
        fetch: async () => new Response(candidateTitle),
      },
    }
  );
  const result = await readJson(response);

  assert.equal(response.status, 200, "authorized local apply should succeed");
  assert.equal(result.body.ok, true, "authorized apply response should be ok");
  assert.equal(result.body.mode, "applied", "authorized apply should report applied mode");
  assert.equal(db.statements.length, 2, "authorized apply should write upsert and audit log");
}

console.log("Review Action Storage validation passed.");
