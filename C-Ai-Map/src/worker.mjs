import updateCandidates from "../data/update-candidates.json" with { type: "json" };

const INTERNAL_PATH_PREFIX = "/internal/";
const REVIEW_ACTION_API_PATH = "/internal/api/review-candidates";
const ACCESS_JWT_HEADER = "cf-access-jwt-assertion";
const ACCESS_USER_EMAIL_HEADER = "cf-access-authenticated-user-email";
const REVIEW_DECISIONS = new Set(["approved", "rejected", "on-hold"]);
const DECISION_TO_REVIEW_STATUS = {
  approved: "accepted",
  rejected: "rejected",
  "on-hold": "reviewing",
};
const MAX_REVIEW_BODY_BYTES = 16 * 1024;

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
