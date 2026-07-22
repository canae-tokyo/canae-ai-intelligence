import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const reportPath = process.argv[2] ?? "reports/candidate-registration-report.example.json";
const errors = [];
const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const actions = new Set(["registered", "skipped", "rejected"]);
const reasons = new Set([
  "new-pending-candidate",
  "not-new-candidate",
  "source-candidate-not-found",
  "source-review-status-not-pending",
  "source-suggested-status-not-draft",
  "duplicate-candidate-id",
  "duplicate-canonical-url",
  "duplicate-normalized-canonical-url",
  "duplicate-status-not-new",
  "source-id-mismatch",
  "candidate-type-mismatch",
  "canonical-url-mismatch",
  "invalid-canonical-url",
]);
const hash = /^sha256:[0-9a-f]{64}$/;

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
}

function assertRequiredString(value, label) {
  assert(typeof value === "string" && value.trim().length > 0, `${label} is required`);
}

function assertHttpsUrl(value, label) {
  try {
    const url = new URL(value);
    assert(url.protocol === "https:", `${label} must use https: ${value}`);
  } catch {
    assert(false, `${label} is not a valid URL: ${value}`);
  }
}

const report = readJson(reportPath);

assert(report.reportType === "candidate-registration-foundation", "reportType is invalid");
assert(report.reportVersion === "1.0", "reportVersion is invalid");
assert(isoDate.test(report.generatedAt), "generatedAt must be YYYY-MM-DD");
assert(report.executionStatus === "completed", "executionStatus must be completed");
assert(report.generator?.script === "scripts/candidate-registration.mjs", "generator script is invalid");
assert(report.mode === "candidate-store-registration", "mode is invalid");
assert(typeof report.writes?.updateCandidates === "boolean", "updateCandidates writes must be boolean");
assert(report.writes?.canonicalData === false, "canonicalData writes must remain false");
assert(report.registrationPolicy?.allowedMatchStatus === "new", "allowedMatchStatus must be new");
assert(report.registrationPolicy?.requiredReviewStatus === "pending", "requiredReviewStatus must be pending");
assert(report.registrationPolicy?.forcedReviewStatus === "pending", "forcedReviewStatus must be pending");
assert(report.registrationPolicy?.forcedSuggestedStatus === "draft", "forcedSuggestedStatus must be draft");
assert(report.registrationPolicy?.rejectVerifiedPromotion === true, "verified promotion must be rejected");
assert(report.registrationPolicy?.applyRequiredForDataStore === true, "applyRequiredForDataStore must be true");
assert(report.registrationPolicy?.atomicWrite === true, "atomicWrite must be true");
assert(Array.isArray(report.registrationPolicy?.duplicateKeys), "duplicateKeys must be an array");
assert(
  report.registrationPolicy.duplicateKeys.join(",") === "id,canonicalUrl,normalizedCanonicalUrl",
  "duplicateKeys are invalid"
);
assert(typeof report.storeAudit?.apply === "boolean", "storeAudit.apply must be boolean");
assert(typeof report.storeAudit?.storeChanged === "boolean", "storeAudit.storeChanged must be boolean");
assert(Number.isInteger(report.storeAudit?.previousCandidateCount), "previousCandidateCount must be integer");
assert(Number.isInteger(report.storeAudit?.updatedCandidateCount), "updatedCandidateCount must be integer");
assert(hash.test(report.storeAudit?.inputHash ?? ""), "inputHash is invalid");
assert(hash.test(report.storeAudit?.outputHash ?? ""), "outputHash is invalid");
assert(
  report.writes.updateCandidates === report.storeAudit.storeChanged,
  "writes.updateCandidates must match storeAudit.storeChanged"
);
assert(Array.isArray(report.registeredCandidateIds), "registeredCandidateIds must be an array");
assert(Array.isArray(report.results), "results must be an array");
assert(report.results.length > 0, "at least one registration result is required");
assert(report.summary?.inputCandidates === report.results.length, "summary inputCandidates mismatch");
assert(report.summary?.registered >= 1, "example report must include a registration");
assert(report.summary?.skipped >= 1, "example report must include skipped duplicates");

for (const result of report.results) {
  assertRequiredString(result.candidateId, "candidateId");
  assertHttpsUrl(result.canonicalUrl, `canonicalUrl ${result.candidateId}`);
  assertHttpsUrl(result.normalizedCanonicalUrl, `normalizedCanonicalUrl ${result.candidateId}`);
  assert(actions.has(result.action), `action is invalid: ${result.candidateId}`);
  assert(reasons.has(result.reason), `reason is invalid: ${result.candidateId}`);
  if (result.action === "registered") {
    assert(result.reason === "new-pending-candidate", `registered reason is invalid: ${result.candidateId}`);
  }
}

if (errors.length > 0) {
  console.error("Candidate registration report validation failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `Candidate registration report validation passed: ${report.summary.registered} registered, ${report.summary.skipped} skipped.`
);
