import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const reportPath = process.argv[2] ?? "reports/duplicate-diff-report.example.json";
const errors = [];
const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const fingerprint = /^sha256:[0-9a-f]{64}$/;
const matchStatuses = new Set(["duplicate", "possible-duplicate", "new"]);
const matchReasons = new Set(["canonical-url", "normalized-url", "title-similarity", "none"]);

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
}

function assertRequiredString(value, label) {
  assert(typeof value === "string" && value.trim().length > 0, `${label} is required`);
}

function assertNullableString(value, label) {
  assert(value === null || (typeof value === "string" && value.trim().length > 0), `${label} is invalid`);
}

function assertHttpsUrl(value, label) {
  try {
    const url = new URL(value);
    assert(url.protocol === "https:", `${label} must use https: ${value}`);
  } catch {
    assert(false, `${label} is not a valid URL: ${value}`);
  }
}

function assertUnique(values, label) {
  const seen = new Set();
  for (const value of values) {
    assert(!seen.has(value), `${label} duplicate: ${value}`);
    seen.add(value);
  }
}

const report = readJson(reportPath);

assert(report.reportType === "duplicate-diff-foundation", "reportType is invalid");
assert(report.reportVersion === "1.0", "reportVersion is invalid");
assert(isoDate.test(report.generatedAt), "generatedAt must be YYYY-MM-DD");
assert(report.executionStatus === "completed", "executionStatus must be completed");
assert(report.generator?.script === "scripts/duplicate-diff-detection.mjs", "generator script is invalid");
assert(report.generator?.version === "1.0", "generator version is invalid");
assert(report.mode === "report-only-duplicate-diff-detection", "mode is invalid");
assert(report.writes?.canonicalData === false, "canonicalData writes must remain false");
assert(report.writes?.updateCandidates === false, "updateCandidates writes must remain false");
assert(
  report.matchingPolicy?.primaryIdentityField === "canonicalUrl",
  "primary identity field must be canonicalUrl"
);
assert(
  report.matchingPolicy?.secondaryIdentityField === "normalizedUrl",
  "secondary identity field must be normalizedUrl"
);
assert(report.matchingPolicy?.tertiarySignal === "title-similarity", "tertiary signal is invalid");
assert(
  typeof report.matchingPolicy?.titleSimilarityThreshold === "number",
  "title similarity threshold must be numeric"
);
assert(Array.isArray(report.input?.canonicalDataFiles), "canonicalDataFiles must be an array");
assert(report.input.canonicalDataFiles.length > 0, "canonicalDataFiles must not be empty");
assert(Array.isArray(report.results), "results must be an array");
assert(report.results.length > 0, "at least one result is required");
assert(report.summary?.candidates === report.results.length, "summary candidates mismatch");
assert(report.summary?.contentFingerprints === report.results.length, "all results must have fingerprints");
assert(report.summary?.exactCanonicalUrlMatches >= 1, "fixture must include an exact canonical URL match");
assert(report.summary?.normalizedUrlMatches >= 1, "fixture must include a normalized URL match");
assert(report.summary?.newCandidates >= 1, "fixture must include a new candidate");
assert(report.summary?.titleDifferenceMatches >= 1, "fixture must include a title difference");

assertUnique(
  report.results.map((result) => result.candidateId),
  "candidateId"
);
assertUnique(
  report.results.map((result) => result.contentFingerprint),
  "contentFingerprint"
);

for (const result of report.results) {
  assertRequiredString(result.candidateId, "candidateId");
  assert(result.sourceId === "source-github-changelog", `sourceId is invalid: ${result.candidateId}`);
  assert(result.candidateType === "news", `candidateType must be news: ${result.candidateId}`);
  assertRequiredString(result.candidateTitle, `candidateTitle ${result.candidateId}`);
  assertHttpsUrl(result.candidateCanonicalUrl, `candidateCanonicalUrl ${result.candidateId}`);
  assertHttpsUrl(result.normalizedCandidateUrl, `normalizedCandidateUrl ${result.candidateId}`);
  assert(isoDate.test(result.sourcePublishedAt), `sourcePublishedAt must be YYYY-MM-DD: ${result.candidateId}`);
  assert(fingerprint.test(result.contentFingerprint), `contentFingerprint is invalid: ${result.candidateId}`);
  assert(matchStatuses.has(result.matchStatus), `matchStatus is invalid: ${result.candidateId}`);
  assert(matchReasons.has(result.matchReason), `matchReason is invalid: ${result.candidateId}`);
  assertNullableString(result.matchedRecordType, `matchedRecordType ${result.candidateId}`);
  assertNullableString(result.matchedRecordId, `matchedRecordId ${result.candidateId}`);
  assert(
    result.matchedCanonicalUrl === null || typeof result.matchedCanonicalUrl === "string",
    `matchedCanonicalUrl is invalid: ${result.candidateId}`
  );
  assert(
    result.normalizedMatchedUrl === null || typeof result.normalizedMatchedUrl === "string",
    `normalizedMatchedUrl is invalid: ${result.candidateId}`
  );
  assert(
    typeof result.titleSimilarity === "number" &&
      result.titleSimilarity >= 0 &&
      result.titleSimilarity <= 1,
    `titleSimilarity must be 0..1: ${result.candidateId}`
  );
  assert(Array.isArray(result.diffItems), `diffItems must be an array: ${result.candidateId}`);

  if (result.matchStatus === "new") {
    assert(result.matchReason === "none", `new result must use none reason: ${result.candidateId}`);
    assert(result.matchedRecordId === null, `new result must not have matchedRecordId: ${result.candidateId}`);
    assert(result.diffItems.length === 0, `new result must not have diffItems: ${result.candidateId}`);
  } else {
    assert(result.matchedRecordType === "news", `matchedRecordType must be news: ${result.candidateId}`);
    assertRequiredString(result.matchedRecordId, `matchedRecordId ${result.candidateId}`);
  }

  for (const item of result.diffItems) {
    assertRequiredString(item.field, `diff field ${result.candidateId}`);
    assert("candidateValue" in item, `candidateValue missing: ${result.candidateId}`);
    assert("existingValue" in item, `existingValue missing: ${result.candidateId}`);
  }
}

if (errors.length > 0) {
  console.error("Duplicate diff report validation failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `Duplicate diff report validation passed: ${report.results.length} results, ${report.summary.diffItems} diff items.`
);
