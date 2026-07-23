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
        return withSecurityHeaders(await handleReviewActionApi(request, authorization));
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

export async function handleReviewActionApi(request, authorization) {
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
      status: 409,
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
    return {
      status: 501,
      body: {
        ok: false,
        error: "storage-not-configured",
        message:
          "Cloudflare Workers Static Assets cannot persist data/update-candidates.json at runtime. Configure a storage backend before enabling apply.",
        candidateId: body.candidateId,
        previousReviewStatus: decision.previousReviewStatus,
        nextReviewStatus: DECISION_TO_REVIEW_STATUS[body.decision],
        reviewDecision: body.decision,
        storeChanged: false,
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
    return rejectedReview("candidate-not-found", null, null, candidateStore);
  }

  const candidate = candidateStore[index];

  if (candidate.reviewStatus === "reviewing") {
    if (!options.resolveHold) {
      return rejectedReview("resolve-hold-required", candidate, candidate.reviewStatus, candidateStore);
    }
    if (options.decision === "on-hold") {
      return rejectedReview("hold-cannot-resolve-to-hold", candidate, candidate.reviewStatus, candidateStore);
    }
  } else if (candidate.reviewStatus !== "pending") {
    return rejectedReview("candidate-already-reviewed", candidate, candidate.reviewStatus, candidateStore);
  }

  if (candidate.suggestedStatus !== "draft") {
    return rejectedReview("suggested-status-not-draft", candidate, candidate.reviewStatus, candidateStore);
  }

  const reviewedCandidate = applyReviewDecision(candidate, options);
  const updatedStore = candidateStore.map((item, itemIndex) => (itemIndex === index ? reviewedCandidate : item));

  return {
    action: "reviewed",
    reason: "manual-review-recorded",
    candidate: reviewedCandidate,
    previousReviewStatus: candidate.reviewStatus,
    updatedStore,
  };
}

function rejectedReview(reason, candidate, previousReviewStatus, updatedStore) {
  return {
    action: "rejected",
    reason,
    candidate,
    previousReviewStatus,
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

function reviewActionError(error, status) {
  return {
    status,
    body: {
      ok: false,
      error,
      storeChanged: false,
    },
  };
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
