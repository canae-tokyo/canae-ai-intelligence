const INTERNAL_PATH_PREFIX = "/internal/";
const ACCESS_JWT_HEADER = "cf-access-jwt-assertion";
const ACCESS_USER_EMAIL_HEADER = "cf-access-authenticated-user-email";

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
    return { allowed: true, reason: "local-bypass" };
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
