import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import worker, {
  authorizeInternalReviewRequest,
  isInternalPath,
} from "../src/worker.mjs";

const candidateTitle = "Copilot users can now see AI credits used per billing cycle";

function request(url, headers = {}) {
  return new Request(url, { headers });
}

async function read(response) {
  return {
    status: response.status,
    body: await response.text(),
  };
}

assert.equal(isInternalPath("/internal"), true, "/internal must be protected");
assert.equal(
  isInternalPath("/internal/review-candidates"),
  true,
  "/internal/review-candidates must be protected"
);
assert.equal(isInternalPath("/news"), false, "public routes must remain unprotected");

{
  const wranglerConfig = JSON.parse(readFileSync(new URL("../wrangler.jsonc", import.meta.url)));
  const runWorkerFirst = wranglerConfig.assets?.run_worker_first;

  assert.deepEqual(
    runWorkerFirst,
    ["/internal", "/internal/*"],
    "wrangler must run the Worker before Static Assets for /internal routes"
  );
}

{
  let assetFetchCalled = false;
  const response = await worker.fetch(
    request("https://example.com/internal/review-candidates"),
    {
      ASSETS: {
        fetch: async () => {
          assetFetchCalled = true;
          return new Response(candidateTitle);
        },
      },
    }
  );
  const result = await read(response);

  assert.equal(result.status, 404, "unauthorized internal requests must return 404");
  assert.equal(
    response.headers.get("x-robots-tag"),
    "noindex, nofollow",
    "unauthorized responses must remain noindex"
  );
  assert.equal(assetFetchCalled, false, "unauthorized internal requests must not reach ASSETS");
  assert.equal(
    result.body.includes(candidateTitle),
    false,
    "unauthorized responses must not contain candidate data"
  );
}

{
  let assetFetchCalled = false;
  const response = await worker.fetch(request("https://example.com/news"), {
    ASSETS: {
      fetch: async () => {
        assetFetchCalled = true;
        return new Response("public page");
      },
    },
  });
  const result = await read(response);

  assert.equal(result.status, 200, "public routes must remain reachable");
  assert.equal(
    response.headers.get("x-robots-tag"),
    "noindex, nofollow",
    "public responses must keep noindex"
  );
  assert.equal(assetFetchCalled, true, "public routes must reach ASSETS");
  assert.equal(result.body, "public page", "public route response must be preserved");
}

{
  const authorization = await authorizeInternalReviewRequest(
    request("https://example.com/internal/review-candidates", {
      "cf-access-jwt-assertion": "header.payload.signature",
    }),
    {
      INTERNAL_REVIEW_ALLOWED_EMAILS: "canae.tokyo@gmail.com",
    },
    {
      verifyAccessJwt: async () => ({
        valid: false,
        reason: "missing-access-verification-config",
      }),
    }
  );

  assert.equal(authorization.allowed, false, "invalid JWT verification must fail closed");
}

{
  const authorization = await authorizeInternalReviewRequest(
    request("https://example.com/internal/review-candidates", {
      "cf-access-jwt-assertion": "header.payload.signature",
    }),
    {
      INTERNAL_REVIEW_ALLOWED_EMAILS: "canae.tokyo@gmail.com",
    },
    {
      verifyAccessJwt: async () => ({
        valid: true,
        payload: {
          email: "other@example.com",
        },
      }),
    }
  );

  assert.equal(authorization.allowed, false, "unlisted Access users must be rejected");
}

{
  const authorization = await authorizeInternalReviewRequest(
    request("https://example.com/internal/review-candidates", {
      "cf-access-jwt-assertion": "header.payload.signature",
    }),
    {
      INTERNAL_REVIEW_ALLOWED_EMAILS: "canae.tokyo@gmail.com",
    },
    {
      verifyAccessJwt: async () => ({
        valid: true,
        payload: {
          email: "CANAE.TOKYO@gmail.com",
        },
      }),
    }
  );

  assert.equal(authorization.allowed, true, "allowed Access users must pass");
}

{
  let assetFetchCalled = false;
  const response = await worker.fetch(
    request("http://localhost:8787/internal/review-candidates"),
    {
      INTERNAL_REVIEW_LOCAL_BYPASS: "true",
      ASSETS: {
        fetch: async () => {
          assetFetchCalled = true;
          return new Response("local review");
        },
      },
    }
  );
  const result = await read(response);

  assert.equal(result.status, 200, "local bypass must work only on localhost");
  assert.equal(assetFetchCalled, true, "local bypass must reach ASSETS");
}

{
  let assetFetchCalled = false;
  const response = await worker.fetch(
    request("https://example.com/internal/review-candidates"),
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
  const result = await read(response);

  assert.equal(result.status, 404, "local bypass must not work on production hosts");
  assert.equal(assetFetchCalled, false, "production hosts must fail closed without Access");
}

console.log("Access control validation passed.");
