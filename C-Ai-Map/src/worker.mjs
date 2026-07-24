import updateCandidates from "../data/update-candidates.json" with { type: "json" };
import newsData from "../data/news.json" with { type: "json" };
import toolsData from "../data/tools.json" with { type: "json" };
import benchmarksData from "../data/benchmarks.json" with { type: "json" };
import canaeEvaluationsData from "../data/canae-evaluations.json" with { type: "json" };

const INTERNAL_PATH_PREFIX = "/internal/";
const REVIEW_ACTION_API_PATH = "/internal/api/review-candidates";
const PROMOTION_CANDIDATES_API_PATH = "/internal/api/promotion-candidates";
const PROMOTION_PLAN_API_PATH = "/internal/api/promotion-plan";
const PROMOTION_PR_API_PATH = "/internal/api/promotion-pr";
const ACCESS_JWT_HEADER = "cf-access-jwt-assertion";
const ACCESS_USER_EMAIL_HEADER = "cf-access-authenticated-user-email";
const REVIEW_DECISIONS = new Set(["approved", "rejected", "on-hold"]);
const DECISION_TO_REVIEW_STATUS = {
  approved: "accepted",
  rejected: "rejected",
  "on-hold": "reviewing",
};
const MAX_REVIEW_BODY_BYTES = 16 * 1024;
const UPDATE_CANDIDATES_FILE = "data/update-candidates.json";

const CANDIDATE_TYPE_TARGET_FILE = {
  news: "data/news.json",
  tool: "data/tools.json",
  benchmark: "data/benchmarks.json",
  "canae-evaluation": "data/canae-evaluations.json",
};

const TARGET_FILE_DATA = {
  "data/news.json": newsData,
  "data/tools.json": toolsData,
  "data/benchmarks.json": benchmarksData,
  "data/canae-evaluations.json": canaeEvaluationsData,
};

// Fields a proposedRecord must already contain before Verified Promotion will
// treat a candidate as promotable. Mirrors the required fields on the
// corresponding lib/types.ts interface. Promotion never invents values for
// these — a candidate missing any of them is reported as
// "incomplete-proposed-record" instead of being silently skipped or filled in.
const REQUIRED_PROPOSED_RECORD_FIELDS = {
  news: [
    "id",
    "title",
    "company",
    "category",
    "importance",
    "publishedAt",
    "summary",
    "impact",
    "sourceType",
    "sourceUrl",
    "sourceCheckedAt",
    "status",
  ],
  tool: [
    "id",
    "name",
    "company",
    "category",
    "description",
    "scores",
    "benchmarkRank",
    "internalGrade",
    "price",
    "apiAvailable",
    "commercialUse",
    "lastUpdated",
    "officialUrl",
    "tags",
  ],
  benchmark: [
    "id",
    "toolId",
    "benchmarkName",
    "benchmarkVersion",
    "scope",
    "sourceUrl",
    "sourceType",
    "verifiedAt",
    "comparability",
    "dataStatus",
  ],
  "canae-evaluation": [
    "id",
    "toolId",
    "evaluationVersion",
    "overallGrade",
    "scores",
    "useCase",
    "evidence",
    "evaluatedAt",
    "evaluatedBy",
    "reviewStatus",
  ],
};

const PROMOTION_COMMIT_MESSAGE = "Promote verified AI intelligence candidates";
const PROMOTION_PR_TITLE = "Promote verified AI intelligence candidates";
const MAX_BRANCH_NAME_ATTEMPTS = 5;

const REVIEW_ACTION_UPSERT_SQL = `
INSERT INTO review_candidate_actions (
  candidate_id, candidate_type, review_decision, review_status,
  previous_review_decision, previous_review_status, reason,
  actor_email, source_store_hash, action_id, created_at, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(candidate_id) DO UPDATE SET
  candidate_type = excluded.candidate_type,
  review_decision = excluded.review_decision,
  review_status = excluded.review_status,
  previous_review_decision = excluded.previous_review_decision,
  previous_review_status = excluded.previous_review_status,
  reason = excluded.reason,
  actor_email = excluded.actor_email,
  source_store_hash = excluded.source_store_hash,
  action_id = excluded.action_id,
  updated_at = excluded.updated_at
`;

const REVIEW_ACTION_LOG_INSERT_SQL = `
INSERT INTO review_candidate_action_logs (
  id, candidate_id, candidate_type, action, review_decision, review_status,
  previous_review_decision, previous_review_status, reason, actor_email,
  source_store_hash, request_hash, created_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

const textEncoder = new TextEncoder();
let cachedJwks;

const worker = {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (isInternalPath(url.pathname)) {
      const authorization = await authorizeInternalReviewRequest(request, env);

      if (!authorization.allowed) {
        return notFoundResponse();
      }

      if (url.pathname === REVIEW_ACTION_API_PATH) {
        return withSecurityHeaders(await handleReviewActionApi(request, authorization, env));
      }

      if (url.pathname === PROMOTION_CANDIDATES_API_PATH) {
        return withSecurityHeaders(await handlePromotionCandidatesApi(request, authorization, env));
      }

      if (url.pathname === PROMOTION_PLAN_API_PATH) {
        return withSecurityHeaders(await handlePromotionPlanApi(request, authorization, env));
      }

      if (url.pathname === PROMOTION_PR_API_PATH) {
        return withSecurityHeaders(await handlePromotionPrApi(request, authorization, env));
      }
    }

    return withSecurityHeaders(await env.ASSETS.fetch(request));
  },
};

export default worker;

export function isInternalPath(pathname) {
  return pathname === "/internal" || pathname.startsWith(INTERNAL_PATH_PREFIX);
}

export async function authorizeInternalReviewRequest(
  request,
  env,
  options = {}
) {
  const url = new URL(request.url);

  if (isLocalBypassAllowed(url, env)) {
    return { allowed: true, reason: "local-bypass", email: "local-dev" };
  }

  const allowedEmails = parseAllowedEmails(env.INTERNAL_REVIEW_ALLOWED_EMAILS);

  if (allowedEmails.size === 0) {
    return { allowed: false, reason: "missing-allowed-emails" };
  }

  const jwt = request.headers.get(ACCESS_JWT_HEADER);

  if (!jwt) {
    return { allowed: false, reason: "missing-access-jwt" };
  }

  const verifier = options.verifyAccessJwt ?? verifyCloudflareAccessJwt;
  const verification = await verifier(jwt, env);

  if (!verification.valid) {
    return { allowed: false, reason: verification.reason ?? "invalid-access-jwt" };
  }

  const emailFromJwt = normalizeEmail(verification.payload?.email);
  const emailFromHeader = normalizeEmail(request.headers.get(ACCESS_USER_EMAIL_HEADER));
  const email = emailFromJwt || emailFromHeader;

  if (!email || !allowedEmails.has(email)) {
    return { allowed: false, reason: "email-not-allowed" };
  }

  return { allowed: true, reason: "access-authorized", email };
}

export async function handleReviewActionApi(request, authorization, env = {}) {
  if (request.method !== "POST") {
    return jsonResponse(
      {
        ok: false,
        error: "method-not-allowed",
        storeChanged: false,
      },
      405,
      { allow: "POST" }
    );
  }

  let body;

  try {
    body = await readJsonBody(request);
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error: error.message,
        storeChanged: false,
      },
      error.status ?? 400
    );
  }

  const result = await processReviewActionRequestBody(body, updateCandidates, {
    now: new Date(),
    reviewerEmail: authorization.email,
    db: env.REVIEW_ACTION_DB,
  });

  return jsonResponse(result.body, result.status);
}

export async function processReviewActionRequestBody(body, candidateStore, options = {}) {
  const validationError = validateReviewActionBody(body);

  if (validationError) {
    return reviewActionError(validationError, 400);
  }

  if (!Array.isArray(candidateStore)) {
    return reviewActionError("candidate-store-invalid", 500);
  }

  const currentStoreText = serializeCandidateStore(candidateStore);
  const currentStoreHash = await sha256(currentStoreText);

  if (body.expectedStoreHash !== currentStoreHash) {
    return {
      status: 409,
      body: {
        ok: false,
        error: "store-hash-mismatch",
        storeChanged: false,
      },
    };
  }

  const decision = reviewCandidateDecision(candidateStore, {
    candidateId: body.candidateId,
    decision: body.decision,
    reviewedBy: body.reviewedBy,
    notes: body.notes,
    resolveHold: body.resolveHold === true,
    reviewedAt: toIsoDateTime(options.now ?? new Date()),
    changeLogDate: toIsoDate(options.now ?? new Date()),
  });

  if (decision.action !== "reviewed") {
    return {
      status: decision.reason === "candidate-not-found" ? 404 : 409,
      body: {
        ok: false,
        error: decision.reason,
        candidateId: body.candidateId,
        previousReviewStatus: decision.previousReviewStatus,
        storeChanged: false,
      },
    };
  }

  const outputStoreText = serializeCandidateStore(decision.updatedStore);
  const outputStoreHash = await sha256(outputStoreText);

  if (body.apply === true) {
    if (!options.db) {
      return {
        status: 501,
        body: {
          ok: false,
          error: "storage-not-configured",
          message:
            "Review action storage is not configured. Bind REVIEW_ACTION_DB (Cloudflare D1) before enabling apply.",
          candidateId: body.candidateId,
          previousReviewStatus: decision.previousReviewStatus,
          nextReviewStatus: DECISION_TO_REVIEW_STATUS[body.decision],
          reviewDecision: body.decision,
          storeChanged: false,
        },
      };
    }

    if (!options.reviewerEmail) {
      return reviewActionError("actor-email-missing", 500);
    }

    const actionId = crypto.randomUUID();
    const nowIso = toIsoDateTime(options.now ?? new Date());
    const requestHash = await sha256(JSON.stringify(body));

    try {
      await recordReviewActionInStorage(options.db, {
        actionId,
        candidateId: body.candidateId,
        candidateType: decision.candidate.candidateType ?? "unknown",
        reviewDecision: body.decision,
        reviewStatus: DECISION_TO_REVIEW_STATUS[body.decision],
        previousReviewDecision: decision.previousReviewDecision,
        previousReviewStatus: decision.previousReviewStatus,
        reason: decision.reason,
        actorEmail: options.reviewerEmail,
        sourceStoreHash: currentStoreHash,
        requestHash,
        createdAt: nowIso,
      });
    } catch {
      return reviewActionError("storage-write-failed", 500, { candidateId: body.candidateId });
    }

    return {
      status: 200,
      body: {
        ok: true,
        mode: "applied",
        actionId,
        candidateId: body.candidateId,
        previousReviewStatus: decision.previousReviewStatus,
        reviewStatus: DECISION_TO_REVIEW_STATUS[body.decision],
        reviewDecision: body.decision,
        reviewedAt: decision.candidate.reviewedAt,
        reviewedBy: body.reviewedBy,
        storeChanged: false,
        storeAudit: {
          inputHash: currentStoreHash,
          outputHash: outputStoreHash,
          previousCandidateCount: candidateStore.length,
          updatedCandidateCount: decision.updatedStore.length,
        },
        persistence: {
          available: true,
          backend: "d1",
        },
      },
    };
  }

  return {
    status: 200,
    body: {
      ok: true,
      mode: "dry-run",
      candidateId: body.candidateId,
      previousReviewStatus: decision.previousReviewStatus,
      reviewStatus: DECISION_TO_REVIEW_STATUS[body.decision],
      reviewDecision: body.decision,
      reviewedAt: decision.candidate.reviewedAt,
      reviewedBy: body.reviewedBy,
      storeChanged: false,
      storeAudit: {
        inputHash: currentStoreHash,
        outputHash: outputStoreHash,
        previousCandidateCount: candidateStore.length,
        updatedCandidateCount: decision.updatedStore.length,
      },
      persistence: {
        available: false,
        reason: "static-assets-immutable",
      },
    },
  };
}

export async function getReviewActionStoreHash(candidateStore = updateCandidates) {
  return sha256(serializeCandidateStore(candidateStore));
}

export async function handlePromotionCandidatesApi(request, authorization, env = {}) {
  if (request.method !== "GET") {
    return jsonResponse({ ok: false, error: "method-not-allowed" }, 405, { allow: "GET" });
  }

  const result = await processPromotionCandidatesRequest(updateCandidates, {
    db: env.REVIEW_ACTION_DB,
  });

  return jsonResponse(result.body, result.status);
}

export async function processPromotionCandidatesRequest(candidateStore, options = {}) {
  if (!options.db) {
    return { status: 501, body: { ok: false, error: "storage-not-configured" } };
  }

  const currentStoreHash = await sha256(serializeCandidateStore(candidateStore));
  let approvedRows;
  let promotedIds;

  try {
    approvedRows = await fetchApprovedReviewRows(options.db);
    promotedIds = await fetchCompletedPromotionCandidateIds(options.db);
  } catch {
    return { status: 500, body: { ok: false, error: "storage-read-failed" } };
  }

  const candidates = evaluatePromotionCandidates(candidateStore, approvedRows, promotedIds, currentStoreHash);

  return {
    status: 200,
    body: { ok: true, storeHash: currentStoreHash, candidates },
  };
}

export async function handlePromotionPlanApi(request, authorization, env = {}) {
  if (request.method !== "POST") {
    return jsonResponse({ ok: false, error: "method-not-allowed" }, 405, { allow: "POST" });
  }

  let body;

  try {
    body = await readJsonBody(request);
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message }, error.status ?? 400);
  }

  const result = await processPromotionPlanRequest(body, updateCandidates, {
    db: env.REVIEW_ACTION_DB,
    reviewerEmail: authorization.email,
    now: new Date(),
  });

  return jsonResponse(result.body, result.status);
}

export async function processPromotionPlanRequest(body, candidateStore, options = {}) {
  if (!validatePromotionPlanBody(body)) {
    return { status: 400, body: { ok: false, error: "invalid-request" } };
  }

  if (!options.db) {
    return { status: 501, body: { ok: false, error: "storage-not-configured" } };
  }

  const currentStoreHash = await sha256(serializeCandidateStore(candidateStore));

  if (body.expectedStoreHash !== currentStoreHash) {
    return {
      status: 409,
      body: { ok: false, error: "promotion-conflict", reason: "store-hash-mismatch" },
    };
  }

  let approvedRows;
  let promotedIds;

  try {
    approvedRows = await fetchApprovedReviewRows(options.db);
    promotedIds = await fetchCompletedPromotionCandidateIds(options.db);
  } catch {
    return { status: 500, body: { ok: false, error: "storage-read-failed" } };
  }

  const approvedById = new Map(approvedRows.map((row) => [row.candidate_id, row]));
  const candidatesById = new Map(candidateStore.map((candidate) => [candidate.id, candidate]));
  const changes = [];
  const requestedIds = [...new Set(body.candidateIds)];

  for (const candidateId of requestedIds) {
    const row = approvedById.get(candidateId);
    const candidate = candidatesById.get(candidateId);

    if (!row || !candidate) {
      return {
        status: 409,
        body: { ok: false, error: "promotion-conflict", reason: "not-approved-or-not-found", candidateId },
      };
    }

    if (row.source_store_hash !== currentStoreHash) {
      return {
        status: 409,
        body: { ok: false, error: "promotion-conflict", reason: "source-store-hash-mismatch", candidateId },
      };
    }

    if (promotedIds.has(candidateId) || candidate.promotedRecordId) {
      return {
        status: 409,
        body: { ok: false, error: "promotion-conflict", reason: "already-promoted", candidateId },
      };
    }

    if (candidate.duplicateCheck?.status === "duplicate") {
      return {
        status: 409,
        body: { ok: false, error: "promotion-conflict", reason: "duplicate-candidate", candidateId },
      };
    }

    const targetFile = CANDIDATE_TYPE_TARGET_FILE[row.candidate_type];

    if (!targetFile) {
      return {
        status: 400,
        body: { ok: false, error: "unsupported-candidate-type", candidateId },
      };
    }

    const proposedRecord = isPlainObject(candidate.proposedRecord) ? candidate.proposedRecord : null;
    const missingFields = findMissingProposedRecordFields(row.candidate_type, proposedRecord);

    if (!proposedRecord || missingFields.length > 0) {
      return {
        status: 400,
        body: { ok: false, error: "incomplete-proposed-record", candidateId, missingFields },
      };
    }

    const duplicateReason = findDuplicateInTarget(targetFile, proposedRecord);

    if (duplicateReason) {
      return {
        status: 409,
        body: { ok: false, error: "promotion-conflict", reason: duplicateReason, candidateId },
      };
    }

    changes.push({
      candidateId,
      candidateType: row.candidate_type,
      targetFile,
      operation: "append",
      summary: `Add ${row.candidate_type} item: ${candidate.title}`,
      record: proposedRecord,
      reviewActor: row.actor_email,
    });
  }

  const promotionPlanId = `promotion-plan-${crypto.randomUUID()}`;
  const nowIso = toIsoDateTime(options.now ?? new Date());

  try {
    await options.db
      .prepare(
        "INSERT INTO promotion_plans (id, candidate_ids, source_store_hash, plan, actor_email, created_at) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .bind(
        promotionPlanId,
        JSON.stringify(requestedIds),
        currentStoreHash,
        JSON.stringify(changes),
        options.reviewerEmail ?? "unknown",
        nowIso
      )
      .run();
  } catch {
    return { status: 500, body: { ok: false, error: "storage-write-failed" } };
  }

  return {
    status: 200,
    body: { ok: true, promotionPlanId, changes: changes.map(stripInternalPlanFields) },
  };
}

export async function handlePromotionPrApi(request, authorization, env = {}) {
  if (request.method !== "POST") {
    return jsonResponse({ ok: false, error: "method-not-allowed" }, 405, { allow: "POST" });
  }

  let body;

  try {
    body = await readJsonBody(request);
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message }, error.status ?? 400);
  }

  const result = await processPromotionPrRequest(body, updateCandidates, {
    db: env.REVIEW_ACTION_DB,
    reviewerEmail: authorization.email,
    now: new Date(),
    githubToken: env.GITHUB_PROMOTION_TOKEN,
    repoOwner: env.GITHUB_PROMOTION_REPO_OWNER,
    repoName: env.GITHUB_PROMOTION_REPO_NAME,
    baseBranch: env.GITHUB_PROMOTION_BASE_BRANCH || "main",
  });

  return jsonResponse(result.body, result.status);
}

export async function processPromotionPrRequest(body, candidateStore, options = {}) {
  if (!validatePromotionPrBody(body)) {
    return { status: 400, body: { ok: false, error: "invalid-request" } };
  }

  if (!options.githubToken) {
    return { status: 501, body: { ok: false, error: "github-promotion-not-configured" } };
  }

  if (!options.repoOwner || !options.repoName) {
    return { status: 501, body: { ok: false, error: "github-promotion-not-configured" } };
  }

  if (!options.db) {
    return { status: 501, body: { ok: false, error: "storage-not-configured" } };
  }

  const now = options.now ?? new Date();
  const nowIso = toIsoDateTime(now);
  const currentStoreHash = await sha256(serializeCandidateStore(candidateStore));

  if (body.expectedStoreHash !== currentStoreHash) {
    return {
      status: 409,
      body: { ok: false, error: "promotion-conflict", reason: "store-hash-mismatch" },
    };
  }

  let planRow;

  try {
    planRow = await options.db
      .prepare("SELECT * FROM promotion_plans WHERE id = ?")
      .bind(body.promotionPlanId)
      .first();
  } catch {
    return { status: 500, body: { ok: false, error: "storage-read-failed" } };
  }

  if (!planRow) {
    return { status: 404, body: { ok: false, error: "promotion-plan-not-found" } };
  }

  if (planRow.consumed_at) {
    return {
      status: 409,
      body: { ok: false, error: "promotion-conflict", reason: "plan-already-used" },
    };
  }

  if (planRow.source_store_hash !== currentStoreHash) {
    return {
      status: 409,
      body: { ok: false, error: "promotion-conflict", reason: "store-hash-mismatch" },
    };
  }

  const candidateIds = JSON.parse(planRow.candidate_ids);
  const changes = JSON.parse(planRow.plan);

  let approvedRows;
  let promotedIds;

  try {
    approvedRows = await fetchApprovedReviewRows(options.db);
    promotedIds = await fetchCompletedPromotionCandidateIds(options.db);
  } catch {
    return { status: 500, body: { ok: false, error: "storage-read-failed" } };
  }

  const approvedById = new Map(approvedRows.map((row) => [row.candidate_id, row]));

  for (const candidateId of candidateIds) {
    const row = approvedById.get(candidateId);

    if (!row || row.source_store_hash !== currentStoreHash) {
      return {
        status: 409,
        body: { ok: false, error: "promotion-conflict", reason: "source-store-hash-mismatch", candidateId },
      };
    }

    if (promotedIds.has(candidateId)) {
      return {
        status: 409,
        body: { ok: false, error: "promotion-pr-already-exists", candidateId },
      };
    }
  }

  const runId = `promotion-run-${crypto.randomUUID()}`;
  const github = createGithubPromotionClient({
    token: options.githubToken,
    owner: options.repoOwner,
    repo: options.repoName,
    fetchImpl: options.githubFetchImpl ?? fetch,
  });

  try {
    const baseRef = await github.getBranchRef(options.baseBranch);
    const branchName = await github.createUniqueBranch(baseRef.sha, buildPromotionBranchName(now));

    await executePromotionChangesOnGithub(github, options.baseBranch, branchName, changes, candidateStore, {
      runId,
      nowIso,
      changeLogDate: toIsoDate(now),
      actorEmail: options.reviewerEmail,
    });

    const prBody = buildPromotionPrBody({
      runId,
      changes,
      candidateIds,
      actorEmail: options.reviewerEmail,
      sourceStoreHash: currentStoreHash,
    });

    const pr = await github.createPullRequest({
      title: PROMOTION_PR_TITLE,
      head: branchName,
      base: options.baseBranch,
      body: prBody,
    });

    await recordPromotionRun(options.db, {
      runId,
      status: "completed",
      actorEmail: options.reviewerEmail,
      sourceStoreHash: currentStoreHash,
      targetBranch: branchName,
      pullRequestUrl: pr.htmlUrl,
      pullRequestNumber: pr.number,
      items: changes.map((change) => ({ ...change, status: "completed" })),
      createdAt: nowIso,
    });

    try {
      await options.db
        .prepare("UPDATE promotion_plans SET consumed_at = ? WHERE id = ?")
        .bind(nowIso, body.promotionPlanId)
        .run();
    } catch {
      // Plan consumption bookkeeping failure does not invalidate an already-created PR.
    }

    return {
      status: 200,
      body: {
        ok: true,
        promotionRunId: runId,
        pullRequestUrl: pr.htmlUrl,
        pullRequestNumber: pr.number,
        targetBranch: branchName,
        candidateIds,
      },
    };
  } catch (error) {
    const errorCode = error.code === "promotion-conflict" ? "promotion-conflict" : "github-promotion-failed";

    try {
      await recordPromotionRun(options.db, {
        runId,
        status: "failed",
        actorEmail: options.reviewerEmail,
        sourceStoreHash: currentStoreHash,
        targetBranch: error.branchName ?? null,
        pullRequestUrl: null,
        pullRequestNumber: null,
        errorCode,
        errorMessage: "Verified Promotion GitHub request failed.",
        items: changes.map((change) => ({ ...change, status: "failed", errorCode })),
        createdAt: nowIso,
      });
    } catch {
      // Best-effort audit trail; do not mask the original failure.
    }

    return {
      status: errorCode === "promotion-conflict" ? 409 : 500,
      body: { ok: false, error: errorCode, promotionRunId: runId },
    };
  }
}

export function parseAllowedEmails(value) {
  return new Set(
    String(value ?? "")
      .split(",")
      .map((email) => normalizeEmail(email))
      .filter(Boolean)
  );
}

export function isLocalBypassAllowed(url, env) {
  if (env.INTERNAL_REVIEW_LOCAL_BYPASS !== "true") {
    return false;
  }

  return url.hostname === "localhost" || url.hostname === "127.0.0.1";
}

export function notFoundResponse() {
  return withSecurityHeaders(new Response("Not Found", {
    status: 404,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  }));
}

export function withSecurityHeaders(response) {
  const guarded = new Response(response.body, response);

  guarded.headers.set("x-robots-tag", "noindex, nofollow");

  if (!guarded.headers.has("x-content-type-options")) {
    guarded.headers.set("x-content-type-options", "nosniff");
  }

  if (!guarded.headers.has("referrer-policy")) {
    guarded.headers.set("referrer-policy", "strict-origin-when-cross-origin");
  }

  if (!guarded.headers.has("permissions-policy")) {
    guarded.headers.set("permissions-policy", "camera=(), microphone=(), geolocation=()");
  }

  if (!guarded.headers.has("x-frame-options")) {
    guarded.headers.set("x-frame-options", "DENY");
  }

  return guarded;
}

export async function verifyCloudflareAccessJwt(jwt, env) {
  if (!env.CF_ACCESS_AUD || !env.CF_ACCESS_CERTS_URL) {
    return { valid: false, reason: "missing-access-verification-config" };
  }

  const parts = jwt.split(".");

  if (parts.length !== 3) {
    return { valid: false, reason: "malformed-access-jwt" };
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = parseBase64UrlJson(encodedHeader);
  const payload = parseBase64UrlJson(encodedPayload);

  if (!header || !payload || header.alg !== "RS256" || !header.kid) {
    return { valid: false, reason: "unsupported-access-jwt" };
  }

  if (!isExpectedAudience(payload.aud, env.CF_ACCESS_AUD)) {
    return { valid: false, reason: "audience-mismatch" };
  }

  const now = Math.floor(Date.now() / 1000);

  if (typeof payload.exp !== "number" || payload.exp <= now) {
    return { valid: false, reason: "access-jwt-expired" };
  }

  if (typeof payload.nbf === "number" && payload.nbf > now) {
    return { valid: false, reason: "access-jwt-not-yet-valid" };
  }

  const jwks = await getCloudflareAccessJwks(env.CF_ACCESS_CERTS_URL);
  const jwk = jwks.keys?.find((key) => key.kid === header.kid);

  if (!jwk) {
    return { valid: false, reason: "access-jwk-not-found" };
  }

  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    false,
    ["verify"]
  );
  const signedData = textEncoder.encode(`${encodedHeader}.${encodedPayload}`);
  const signature = base64UrlToUint8Array(encodedSignature);
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    signature,
    signedData
  );

  return valid
    ? { valid: true, payload }
    : { valid: false, reason: "access-jwt-signature-invalid" };
}

async function readJsonBody(request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");

  if (contentLength > MAX_REVIEW_BODY_BYTES) {
    const error = new Error("request-too-large");
    error.status = 413;
    throw error;
  }

  const text = await request.text();

  if (text.length > MAX_REVIEW_BODY_BYTES) {
    const error = new Error("request-too-large");
    error.status = 413;
    throw error;
  }

  try {
    return JSON.parse(text);
  } catch {
    const error = new Error("invalid-json");
    error.status = 400;
    throw error;
  }
}

function validateReviewActionBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return "request-body-invalid";
  }
  if (!isCleanSingleLine(body.candidateId, 180)) return "candidate-id-invalid";
  if (!REVIEW_DECISIONS.has(body.decision)) return "decision-invalid";
  if (!isCleanSingleLine(body.reviewedBy, 80)) return "reviewed-by-invalid";
  if (!isCleanSingleLine(body.notes, 500)) return "notes-invalid";
  if (!/^sha256:[0-9a-f]{64}$/.test(String(body.expectedStoreHash ?? ""))) {
    return "expected-store-hash-invalid";
  }
  if (body.resolveHold !== undefined && typeof body.resolveHold !== "boolean") {
    return "resolve-hold-invalid";
  }
  if (body.apply !== undefined && typeof body.apply !== "boolean") {
    return "apply-invalid";
  }
  return null;
}

function isCleanSingleLine(value, maxLength) {
  return (
    typeof value === "string" &&
    value.trim() === value &&
    value.length > 0 &&
    value.length <= maxLength &&
    !/[\r\n\t]/.test(value)
  );
}

function reviewCandidateDecision(candidateStore, options) {
  const index = candidateStore.findIndex((candidate) => candidate.id === options.candidateId);

  if (index === -1) {
    return rejectedReview("candidate-not-found", null, null, null, candidateStore);
  }

  const candidate = candidateStore[index];

  if (candidate.reviewStatus === "reviewing") {
    if (!options.resolveHold) {
      return rejectedReview("resolve-hold-required", candidate, candidate.reviewStatus, candidate.reviewDecision, candidateStore);
    }
    if (options.decision === "on-hold") {
      return rejectedReview("hold-cannot-resolve-to-hold", candidate, candidate.reviewStatus, candidate.reviewDecision, candidateStore);
    }
  } else if (candidate.reviewStatus !== "pending") {
    return rejectedReview("candidate-already-reviewed", candidate, candidate.reviewStatus, candidate.reviewDecision, candidateStore);
  }

  if (candidate.suggestedStatus !== "draft") {
    return rejectedReview("suggested-status-not-draft", candidate, candidate.reviewStatus, candidate.reviewDecision, candidateStore);
  }

  const reviewedCandidate = applyReviewDecision(candidate, options);
  const updatedStore = candidateStore.map((item, itemIndex) => (itemIndex === index ? reviewedCandidate : item));
  const actionReason = candidate.reviewStatus === "reviewing" ? "manual-review-resolved" : "manual-review-recorded";

  return {
    action: "reviewed",
    reason: actionReason,
    candidate: reviewedCandidate,
    previousReviewStatus: candidate.reviewStatus,
    previousReviewDecision: candidate.reviewDecision ?? null,
    updatedStore,
  };
}

function rejectedReview(reason, candidate, previousReviewStatus, previousReviewDecision, updatedStore) {
  return {
    action: "rejected",
    reason,
    candidate,
    previousReviewStatus,
    previousReviewDecision,
    updatedStore,
  };
}

function applyReviewDecision(candidate, options) {
  const existingChangeLog = Array.isArray(candidate.changeLog) ? candidate.changeLog : [];
  const actionType = candidate.reviewStatus === "reviewing" ? "manual-review-resolved" : "manual-review";

  return {
    ...candidate,
    reviewStatus: DECISION_TO_REVIEW_STATUS[options.decision],
    reviewDecision: options.decision,
    reviewedAt: options.reviewedAt,
    reviewedBy: options.reviewedBy,
    reviewNotes: options.notes,
    promotedRecordType: null,
    promotedRecordId: null,
    promotedAt: null,
    changeLog: [
      ...existingChangeLog,
      {
        date: options.changeLogDate,
        type: actionType,
        summary: `Review Action API dry-run decision: ${options.decision}. No canonical data was changed.`,
        actor: options.reviewedBy,
      },
    ],
  };
}

function reviewActionError(error, status, extra = {}) {
  return {
    status,
    body: {
      ok: false,
      error,
      storeChanged: false,
      ...extra,
    },
  };
}

async function recordReviewActionInStorage(db, params) {
  const upsertStatement = db
    .prepare(REVIEW_ACTION_UPSERT_SQL)
    .bind(
      params.candidateId,
      params.candidateType,
      params.reviewDecision,
      params.reviewStatus,
      params.previousReviewDecision,
      params.previousReviewStatus,
      params.reason,
      params.actorEmail,
      params.sourceStoreHash,
      params.actionId,
      params.createdAt,
      params.createdAt
    );
  const logStatement = db
    .prepare(REVIEW_ACTION_LOG_INSERT_SQL)
    .bind(
      params.actionId,
      params.candidateId,
      params.candidateType,
      "review-decision",
      params.reviewDecision,
      params.reviewStatus,
      params.previousReviewDecision,
      params.previousReviewStatus,
      params.reason,
      params.actorEmail,
      params.sourceStoreHash,
      params.requestHash,
      params.createdAt
    );

  await db.batch([upsertStatement, logStatement]);
}

async function fetchApprovedReviewRows(db) {
  const result = await db
    .prepare(
      "SELECT candidate_id, candidate_type, source_store_hash, actor_email FROM review_candidate_actions WHERE review_decision = 'approved' AND review_status = 'accepted'"
    )
    .all();

  return result.results ?? [];
}

async function fetchCompletedPromotionCandidateIds(db) {
  const result = await db
    .prepare("SELECT DISTINCT candidate_id FROM promotion_run_items WHERE status = 'completed'")
    .all();

  return new Set((result.results ?? []).map((row) => row.candidate_id));
}

function evaluatePromotionCandidates(candidateStore, approvedRows, promotedIds, currentStoreHash) {
  const candidatesById = new Map(candidateStore.map((candidate) => [candidate.id, candidate]));
  const results = [];

  for (const row of approvedRows) {
    const candidate = candidatesById.get(row.candidate_id);

    if (!candidate) continue;
    if (row.source_store_hash !== currentStoreHash) continue;
    if (promotedIds.has(row.candidate_id) || candidate.promotedRecordId) continue;
    if (candidate.duplicateCheck?.status === "duplicate") continue;

    const targetFile = CANDIDATE_TYPE_TARGET_FILE[row.candidate_type];

    if (!targetFile) {
      results.push({
        candidateId: row.candidate_id,
        candidateType: row.candidate_type,
        title: candidate.title,
        targetFile: null,
        reviewDecision: "approved",
        reviewStatus: "accepted",
        canPromote: false,
        reason: "unsupported-candidate-type",
      });
      continue;
    }

    const proposedRecord = isPlainObject(candidate.proposedRecord) ? candidate.proposedRecord : null;
    const missingFields = findMissingProposedRecordFields(row.candidate_type, proposedRecord);

    if (!proposedRecord || missingFields.length > 0) {
      results.push({
        candidateId: row.candidate_id,
        candidateType: row.candidate_type,
        title: candidate.title,
        targetFile,
        reviewDecision: "approved",
        reviewStatus: "accepted",
        canPromote: false,
        reason: "incomplete-proposed-record",
        missingFields,
      });
      continue;
    }

    results.push({
      candidateId: row.candidate_id,
      candidateType: row.candidate_type,
      title: candidate.title,
      targetFile,
      reviewDecision: "approved",
      reviewStatus: "accepted",
      canPromote: true,
    });
  }

  return results;
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function findMissingProposedRecordFields(candidateType, proposedRecord) {
  const requiredFields = REQUIRED_PROPOSED_RECORD_FIELDS[candidateType] ?? [];

  return requiredFields.filter((field) => {
    if (!proposedRecord) return true;
    const value = proposedRecord[field];
    return value === undefined || value === null || value === "";
  });
}

function findDuplicateInTarget(targetFile, proposedRecord) {
  const existing = Array.isArray(TARGET_FILE_DATA[targetFile]) ? TARGET_FILE_DATA[targetFile] : [];

  if (existing.some((item) => item?.id === proposedRecord.id)) {
    return "duplicate-id";
  }

  const urlFields = ["sourceUrl", "officialUrl", "canonicalUrl"];

  for (const field of urlFields) {
    const value = proposedRecord[field];

    if (value && existing.some((item) => item?.[field] === value)) {
      return "duplicate-url";
    }
  }

  return null;
}

function stripInternalPlanFields(change) {
  const { reviewActor, ...publicChange } = change;
  return publicChange;
}

function validatePromotionPlanBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  if (!Array.isArray(body.candidateIds) || body.candidateIds.length === 0) return false;
  if (!body.candidateIds.every((id) => isCleanSingleLine(id, 180))) return false;
  if (!/^sha256:[0-9a-f]{64}$/.test(String(body.expectedStoreHash ?? ""))) return false;
  return true;
}

function validatePromotionPrBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  if (!isCleanSingleLine(body.promotionPlanId, 120)) return false;
  if (!/^sha256:[0-9a-f]{64}$/.test(String(body.expectedStoreHash ?? ""))) return false;
  if (body.confirm !== true) return false;
  return true;
}

function promotionError(code, message) {
  return Object.assign(new Error(message), { code });
}

function buildPromotionBranchName(date) {
  const iso = date.toISOString();
  const stamp = `${iso.slice(0, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}-${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 19)}`;
  return `promotion/verified-${stamp}`;
}

function buildPromotionPrBody({ runId, changes, candidateIds, actorEmail, sourceStoreHash }) {
  const targetFiles = [...new Set(changes.map((change) => change.targetFile))];
  const candidateList = candidateIds.map((id) => `- ${id}`).join("\n");
  const summaryList = changes.map((change) => `- ${change.summary} (\`${change.targetFile}\`)`).join("\n");
  const reviewActors = [...new Set(changes.map((change) => change.reviewActor).filter(Boolean))];

  return [
    `Promotion run: \`${runId}\``,
    "",
    "## Candidates",
    candidateList,
    "",
    "## Target files",
    targetFiles.map((file) => `- \`${file}\``).join("\n"),
    "- `data/update-candidates.json` (marks promoted candidates; see below)",
    "",
    "## Change summary",
    summaryList,
    "",
    "## Provenance",
    `- review actor(s): ${reviewActors.join(", ") || "unknown"}`,
    `- promotion actor: ${actorEmail}`,
    `- source store hash: \`${sourceStoreHash}\``,
    "",
    "## Verification",
    "- npm run validate:access-control",
    "- npm run validate:data",
    "- npm run validate:collection",
    "",
    "## Safety",
    "- Created automatically by the Verified Promotion Automation Foundation.",
    "- This PR does not merge automatically.",
    "- `data/update-candidates.json` is updated on this branch only, to record promotedRecordType/promotedRecordId/promotedAt for the candidates above.",
    "- Human review and CI must pass before merging to main.",
  ].join("\n");
}

async function recordPromotionRun(db, params) {
  const statements = [
    db
      .prepare(
        "INSERT INTO promotion_runs (id, status, actor_email, source_store_hash, target_branch, pull_request_url, pull_request_number, error_code, error_message, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .bind(
        params.runId,
        params.status,
        params.actorEmail,
        params.sourceStoreHash,
        params.targetBranch,
        params.pullRequestUrl,
        params.pullRequestNumber ?? null,
        params.errorCode ?? null,
        params.errorMessage ?? null,
        params.createdAt,
        params.createdAt
      ),
  ];

  for (const item of params.items) {
    statements.push(
      db
        .prepare(
          "INSERT INTO promotion_run_items (id, promotion_run_id, candidate_id, candidate_type, target_file, operation, status, error_code, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(
          crypto.randomUUID(),
          params.runId,
          item.candidateId,
          item.candidateType,
          item.targetFile,
          item.operation,
          item.status,
          item.errorCode ?? null,
          params.createdAt
        )
    );
  }

  await db.batch(statements);
}

async function executePromotionChangesOnGithub(github, baseBranch, branchName, changes, candidateStore, context) {
  const appendsByFile = new Map();

  for (const change of changes) {
    if (!appendsByFile.has(change.targetFile)) {
      appendsByFile.set(change.targetFile, []);
    }
    appendsByFile.get(change.targetFile).push(change.record);
  }

  for (const [targetFile, records] of appendsByFile) {
    const file = await github.getFileContent(targetFile, baseBranch);
    const currentArray = JSON.parse(file.contentText);

    if (!Array.isArray(currentArray)) {
      throw promotionError("github-promotion-failed", `${targetFile} is not an array`);
    }

    for (const record of records) {
      if (currentArray.some((item) => item?.id === record.id)) {
        throw promotionError("promotion-conflict", `duplicate id in ${targetFile}`);
      }
    }

    const updatedText = `${JSON.stringify([...currentArray, ...records], null, 2)}\n`;

    await github.updateFileContent({
      path: targetFile,
      message: PROMOTION_COMMIT_MESSAGE,
      content: updatedText,
      sha: file.sha,
      branch: branchName,
    });
  }

  const candidateFile = await github.getFileContent(UPDATE_CANDIDATES_FILE, baseBranch);
  const currentCandidates = JSON.parse(candidateFile.contentText);

  if (!Array.isArray(currentCandidates)) {
    throw promotionError("github-promotion-failed", `${UPDATE_CANDIDATES_FILE} is not an array`);
  }

  const changeByCandidateId = new Map(changes.map((change) => [change.candidateId, change]));
  const updatedCandidates = currentCandidates.map((candidate) => {
    const change = changeByCandidateId.get(candidate.id);

    if (!change) return candidate;

    const existingChangeLog = Array.isArray(candidate.changeLog) ? candidate.changeLog : [];

    return {
      ...candidate,
      promotedRecordType: change.candidateType,
      promotedRecordId: change.record.id,
      promotedAt: context.nowIso,
      changeLog: [
        ...existingChangeLog,
        {
          date: context.changeLogDate,
          type: "promoted",
          summary: `Promoted to ${change.targetFile} via automated promotion PR (${context.runId}).`,
          actor: context.actorEmail,
        },
      ],
    };
  });

  const updatedCandidatesText = `${JSON.stringify(updatedCandidates, null, 2)}\n`;

  await github.updateFileContent({
    path: UPDATE_CANDIDATES_FILE,
    message: PROMOTION_COMMIT_MESSAGE,
    content: updatedCandidatesText,
    sha: candidateFile.sha,
    branch: branchName,
  });
}

function createGithubPromotionClient({ token, owner, repo, fetchImpl }) {
  async function request(method, path, body) {
    const response = await fetchImpl(`https://api.github.com${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
        "content-type": "application/json",
        "user-agent": "canae-ai-intelligence-promotion-bot",
        "x-github-api-version": "2022-11-28",
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const responseText = await response.text();
    let parsed = null;

    try {
      parsed = responseText ? JSON.parse(responseText) : null;
    } catch {
      parsed = null;
    }

    if (!response.ok) {
      const error = promotionError("github-promotion-failed", `GitHub API ${method} ${path} failed with ${response.status}`);
      error.status = response.status;
      throw error;
    }

    return parsed;
  }

  return {
    async getBranchRef(branch) {
      const data = await request("GET", `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
      return { sha: data.object.sha };
    },
    async createUniqueBranch(baseSha, preferredName) {
      let candidateName = preferredName;

      for (let attempt = 0; attempt < MAX_BRANCH_NAME_ATTEMPTS; attempt += 1) {
        try {
          await request("POST", `/repos/${owner}/${repo}/git/refs`, {
            ref: `refs/heads/${candidateName}`,
            sha: baseSha,
          });
          return candidateName;
        } catch (error) {
          if (error.status === 422 && attempt < MAX_BRANCH_NAME_ATTEMPTS - 1) {
            candidateName = `${preferredName}-${attempt + 2}`;
            continue;
          }
          throw error;
        }
      }

      throw promotionError("github-promotion-failed", "Unable to create a unique promotion branch");
    },
    async getFileContent(path, ref) {
      const data = await request("GET", `/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`);
      return { sha: data.sha, contentText: base64DecodeUtf8(data.content) };
    },
    async updateFileContent({ path, message, content, sha, branch }) {
      await request("PUT", `/repos/${owner}/${repo}/contents/${path}`, {
        message,
        content: base64EncodeUtf8(content),
        sha,
        branch,
      });
    },
    async createPullRequest({ title, head, base, body }) {
      const data = await request("POST", `/repos/${owner}/${repo}/pulls`, { title, head, base, body });
      return { htmlUrl: data.html_url, number: data.number };
    },
  };
}

function base64EncodeUtf8(text) {
  const bytes = textEncoder.encode(text);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

function base64DecodeUtf8(base64) {
  const binary = atob(base64.replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new TextDecoder().decode(bytes);
}

function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });
}

function serializeCandidateStore(candidateStore) {
  return `${JSON.stringify(candidateStore, null, 2)}\n`;
}

async function getCloudflareAccessJwks(certsUrl) {
  if (cachedJwks?.url === certsUrl) {
    return cachedJwks.value;
  }

  const response = await fetch(certsUrl, {
    headers: {
      accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Cloudflare Access certs fetch failed: ${response.status}`);
  }

  const value = await response.json();
  cachedJwks = { url: certsUrl, value };

  return value;
}

function parseBase64UrlJson(value) {
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlToUint8Array(value)));
  } catch {
    return null;
  }
}

function base64UrlToUint8Array(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function isExpectedAudience(audience, expectedAudience) {
  if (Array.isArray(audience)) {
    return audience.includes(expectedAudience);
  }

  return audience === expectedAudience;
}

function normalizeEmail(email) {
  return String(email ?? "").trim().toLowerCase();
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(value));
  return `sha256:${[...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}

function toIsoDateTime(date) {
  return date.toISOString();
}

function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}
