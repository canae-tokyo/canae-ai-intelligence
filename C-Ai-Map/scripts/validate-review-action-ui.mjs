import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getReviewActionStoreHash } from "../src/worker.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const outDir = path.join(rootDir, "out");

const INTERIM_VALUES = [
  "s365963w",
  "young-frost-5d7d",
  "b204fefa1ddd1f78ad153aa9dc99e1c63e5da188f69ae27dd6780c42924e0179",
  "canae-ai-intelligence.canae-ai-intelligence.workers.dev",
];

function assertBuildExists() {
  if (!fs.existsSync(outDir)) {
    throw new Error(
      "out/ directory not found. Run `npm run build` before `npm run validate:review-action-ui`."
    );
  }
}

function listFilesRecursive(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    return entry.isDirectory() ? listFilesRecursive(fullPath) : [fullPath];
  });
}

function readAll(paths) {
  return paths.map((filePath) => fs.readFileSync(filePath, "utf8")).join("\n");
}

assertBuildExists();

const reviewCandidatesTxt = path.join(outDir, "internal", "review-candidates.txt");
assert.ok(fs.existsSync(reviewCandidatesTxt), "out/internal/review-candidates.txt must exist after build");

const flightPayload = fs.readFileSync(reviewCandidatesTxt, "utf8");
const embeddedHashMatch = flightPayload.match(/sha256:[0-9a-f]{64}/);

assert.ok(embeddedHashMatch, "expectedStoreHash must be embedded in the review-candidates page payload");

const expectedHash = await getReviewActionStoreHash();

assert.equal(
  embeddedHashMatch[0],
  expectedHash,
  "embedded expectedStoreHash must match the Review Action API's own hash of data/update-candidates.json"
);

const internalChunkDir = path.join(outDir, "_next", "static", "chunks", "app", "internal");
assert.ok(fs.existsSync(internalChunkDir), "internal review-candidates client chunk must exist after build");

const internalChunkFiles = listFilesRecursive(internalChunkDir).filter((file) => file.endsWith(".js"));
const internalChunkSource = readAll(internalChunkFiles);

for (const label of ["承認", "却下", "保留"]) {
  assert.ok(internalChunkSource.includes(label), `review action button label "${label}" must be present in the internal chunk`);
}

assert.ok(
  internalChunkSource.includes("/internal/api/review-candidates"),
  "internal chunk must call the existing Review Action API path"
);

const allChunkDir = path.join(outDir, "_next", "static", "chunks");
const allChunkFiles = listFilesRecursive(allChunkDir).filter((file) => file.endsWith(".js"));
const nonInternalChunkFiles = allChunkFiles.filter((file) => !file.includes(`${path.sep}internal${path.sep}`));
const nonInternalChunkSource = readAll(nonInternalChunkFiles);

for (const label of ["承認", "却下", "保留"]) {
  assert.ok(
    !nonInternalChunkSource.includes(label),
    `review action button label "${label}" must not leak into public page bundles`
  );
}

const allOutputFiles = listFilesRecursive(outDir);
const allOutputSource = readAll(
  allOutputFiles.filter((file) => file.endsWith(".js") || file.endsWith(".html") || file.endsWith(".txt"))
);

assert.ok(
  !allOutputSource.includes("9d53a0e4773553030826e4ff6c4e33bedd53e0b592ca0071b0c624f1cd7a3dbf"),
  "production CF_ACCESS_AUD must not be embedded in client-facing build output"
);
assert.ok(
  !allOutputSource.includes("ancient-dream-d0c9"),
  "production Access team / certs URL must not be embedded in client-facing build output"
);
assert.ok(
  !internalChunkSource.includes("actor_email") && !internalChunkSource.includes("actorEmail"),
  "actor_email must never be sent from the client; it is derived server-side from Cloudflare Access"
);

for (const interimValue of INTERIM_VALUES) {
  assert.ok(!allOutputSource.includes(interimValue), `interim Cloudflare value "${interimValue}" must not appear in build output`);
}

for (const label of ["Promotion planを生成", "GitHub PRを作成", "承認済み候補を昇格PRにする"]) {
  assert.ok(internalChunkSource.includes(label), `promotion UI label "${label}" must be present in the internal chunk`);
}

for (const apiPath of ["/internal/api/promotion-candidates", "/internal/api/promotion-plan", "/internal/api/promotion-pr"]) {
  assert.ok(internalChunkSource.includes(apiPath), `internal chunk must call the promotion API path ${apiPath}`);
}

for (const label of ["Promotion planを生成", "GitHub PRを作成", "承認済み候補を昇格PRにする"]) {
  assert.ok(
    !nonInternalChunkSource.includes(label),
    `promotion UI label "${label}" must not leak into public page bundles`
  );
}

assert.ok(
  !allOutputSource.includes("GITHUB_PROMOTION_TOKEN") && !/gh[pousr]_[A-Za-z0-9_]{20,}/.test(allOutputSource),
  "GitHub token / secret name must never appear in client-facing build output"
);

console.log("Review Action UI validation passed.");
