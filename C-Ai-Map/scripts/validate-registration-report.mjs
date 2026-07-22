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
]);

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
assert(report.writes?.updateCandidates === true, "updateCandidates writes must be true for registration");
assert(report.writes?.canonicalData === false, "canonicalData writes must remain false");
assert(report.registrationPolicy?.allowedMatchStatus === "new", "allowedMatchStatus must be new");
assert(report.registrationPolicy?.requiredReviewStatus === "pending", "requiredReviewStatus must be pending");
assert(report.registrationPolicy?.forcedReviewStatus === "pending", "forcedReviewStatus must be pending");
assert(report.registrationPolicy?.forcedSuggestedStatus === "draft", "forcedSuggestedStatus must be draft");
assert(report.registrationPolicy?.rejectVerifiedPromotion === true, "verified promotion must be rejected");
assert(Array.isArray(report.registrationPolicy?.duplicateKeys), "duplicateKeys must be an array");
assert(Array.isArray(report.registeredCandidateIds), "registeredCandidateIds must be an array");
assert(Array.isArray(report.results), "results must be an array");
assert(report.results.length > 0, "at least one registration result is required");
assert(report.summary?.inputCandidates === report.results.length, "summary inputCandidates mismatch");
assert(report.summary?.registered >= 1, "example report must include a registration");
assert(report.summary?.skipped >= 1, "example report must include skipped duplicates");

for (const result of report.results) {
  assertRequiredString(result.candidateId, "candidateId");
  assertHttpsUrl(result.canonicalUrl, `canonicalUrl ${result.candidateId}`);
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
