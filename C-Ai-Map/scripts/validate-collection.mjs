import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const readJson = (file) =>
  JSON.parse(fs.readFileSync(path.join(root, "data", file), "utf8"));

const sources = readJson("collection-sources.json");
const candidates = readJson("update-candidates.json");

const errors = [];
const sourceIds = new Set(sources.map((source) => source.id));
const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const sourceTypes = new Set(["official-blog", "official-changelog", "official-docs", "github-releases"]);
const priorities = new Set(["P0", "P1", "P2"]);
const methods = new Set(["manual-check", "rss-planned", "html-planned", "github-api-planned"]);
const cadences = new Set(["daily", "weekly", "monthly"]);
const candidateTypes = new Set(["news", "tool", "benchmark", "evaluation"]);
const suggestedStatuses = new Set(["draft"]);
const duplicateStatuses = new Set(["clear", "possible", "duplicate"]);
const reviewStatuses = new Set(["pending", "reviewing", "accepted", "rejected"]);
const promotedRecordTypes = new Set(["news", "tool", "benchmark", "evaluation"]);

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function assertRequiredString(value, label) {
  assert(typeof value === "string" && value.trim().length > 0, `${label} is required`);
}

function assertUnique(items, getKey, label) {
  const seen = new Set();
  for (const item of items) {
    const key = getKey(item);
    assert(!seen.has(key), `${label} duplicate: ${key}`);
    seen.add(key);
  }
}

function assertUrl(value, label) {
  try {
    const url = new URL(value);
    assert(url.protocol === "https:", `${label} must use https: ${value}`);
  } catch {
    assert(false, `${label} is not a valid URL: ${value}`);
  }
}

function assertNullableIsoDate(value, label) {
  assert(value === null || isoDate.test(value), `${label} must be null or YYYY-MM-DD`);
}

function assertNullableString(value, label) {
  assert(value === null || typeof value === "string", `${label} must be null or string`);
}

assertUnique(sources, (source) => source.id, "collection source id");
assertUnique(candidates, (candidate) => candidate.id, "update candidate id");

for (const source of sources) {
  assertRequiredString(source.id, `source id`);
  assertRequiredString(source.name, `source name ${source.id}`);
  assertRequiredString(source.company, `source company ${source.id}`);
  assertRequiredString(source.url, `source url ${source.id}`);
  assertUrl(source.url, `source url ${source.id}`);
  assert(sourceTypes.has(source.sourceType), `sourceType is invalid: ${source.id}`);
  assert(priorities.has(source.priority), `priority is invalid: ${source.id}`);
  assert(methods.has(source.collectionMethod), `collectionMethod is invalid: ${source.id}`);
  assert(cadences.has(source.cadence), `cadence is invalid: ${source.id}`);
  assert(source.owner === "CANAE", `source owner must remain CANAE: ${source.id}`);
  assert(typeof source.enabled === "boolean", `enabled must be boolean: ${source.id}`);
}

for (const candidate of candidates) {
  assertRequiredString(candidate.id, `candidate id`);
  assertRequiredString(candidate.sourceId, `candidate sourceId ${candidate.id}`);
  assertRequiredString(candidate.title, `candidate title ${candidate.id}`);
  assertRequiredString(candidate.sourceUrl, `candidate sourceUrl ${candidate.id}`);
  assertRequiredString(candidate.canonicalUrl, `candidate canonicalUrl ${candidate.id}`);
  assertRequiredString(candidate.detectedAt, `candidate detectedAt ${candidate.id}`);
  assertRequiredString(candidate.registeredAt, `candidate registeredAt ${candidate.id}`);
  assertRequiredString(candidate.diffSummary, `candidate diffSummary ${candidate.id}`);
  assert(sourceIds.has(candidate.sourceId), `candidate sourceId not found: ${candidate.id}`);
  assertUrl(candidate.sourceUrl, `candidate sourceUrl ${candidate.id}`);
  assertUrl(candidate.canonicalUrl, `candidate canonicalUrl ${candidate.id}`);
  assert(isoDate.test(candidate.detectedAt), `candidate detectedAt must be YYYY-MM-DD: ${candidate.id}`);
  assert(isoDate.test(candidate.registeredAt), `candidate registeredAt must be YYYY-MM-DD: ${candidate.id}`);
  assertNullableIsoDate(candidate.sourcePublishedAt, `candidate sourcePublishedAt ${candidate.id}`);
  assert(candidateTypes.has(candidate.candidateType), `candidateType is invalid: ${candidate.id}`);
  assert(suggestedStatuses.has(candidate.suggestedStatus), `suggestedStatus must remain draft: ${candidate.id}`);
  assert(candidate.suggestedStatus !== "verified", `candidate must not auto-promote to verified: ${candidate.id}`);
  assert(candidate.duplicateCheck && duplicateStatuses.has(candidate.duplicateCheck.status), `duplicateCheck.status is invalid: ${candidate.id}`);
  assert(Array.isArray(candidate.duplicateCheck?.matchedIds), `duplicateCheck.matchedIds must be an array: ${candidate.id}`);
  if (candidate.duplicateCheck?.status === "duplicate") {
    assert(candidate.duplicateCheck.matchedIds.length > 0, `duplicate candidate must include matchedIds: ${candidate.id}`);
  }
  if (candidate.duplicateCheck?.status === "clear") {
    assert(candidate.duplicateCheck.matchedIds.length === 0, `clear candidate must not include matchedIds: ${candidate.id}`);
  }
  assert(reviewStatuses.has(candidate.reviewStatus), `reviewStatus is invalid: ${candidate.id}`);
  assertNullableIsoDate(candidate.reviewedAt, `candidate reviewedAt ${candidate.id}`);
  assertNullableString(candidate.reviewedBy, `candidate reviewedBy ${candidate.id}`);
  if (candidate.reviewStatus === "accepted" || candidate.reviewStatus === "rejected") {
    assert(candidate.reviewedAt !== null, `reviewedAt is required when review is complete: ${candidate.id}`);
    assert(typeof candidate.reviewedBy === "string" && candidate.reviewedBy.trim().length > 0, `reviewedBy is required when review is complete: ${candidate.id}`);
  }
  if (candidate.reviewStatus === "pending") {
    assert(candidate.reviewedAt === null, `pending candidate reviewedAt must be null: ${candidate.id}`);
    assert(candidate.reviewedBy === null, `pending candidate reviewedBy must be null: ${candidate.id}`);
  }
  assert(candidate.promotedRecordType === null || promotedRecordTypes.has(candidate.promotedRecordType), `promotedRecordType is invalid: ${candidate.id}`);
  assertNullableString(candidate.promotedRecordId, `candidate promotedRecordId ${candidate.id}`);
  assertNullableIsoDate(candidate.promotedAt, `candidate promotedAt ${candidate.id}`);
  if (candidate.promotedRecordType === null) {
    assert(candidate.promotedRecordId === null, `promotedRecordId must be null without promotedRecordType: ${candidate.id}`);
    assert(candidate.promotedAt === null, `promotedAt must be null without promotedRecordType: ${candidate.id}`);
  }
}

if (errors.length > 0) {
  console.error("Collection validation failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `Collection validation passed: ${sources.length} sources, ${candidates.length} candidates.`
);
