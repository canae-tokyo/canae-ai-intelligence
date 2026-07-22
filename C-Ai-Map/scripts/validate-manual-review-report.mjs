import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const reportPath = process.argv[2] ?? "reports/manual-review-report.example.json";
const errors = [];
const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const hash = /^sha256:[0-9a-f]{64}$/;
const decisions = new Set(["approved", "rejected", "on-hold"]);
const reviewStatuses = new Set(["accepted", "rejected", "reviewing"]);
const actions = new Set(["reviewed", "rejected"]);
const reasons = new Set([
  "manual-review-recorded",
  "candidate-not-found",
  "candidate-already-reviewed",
  "resolve-hold-required",
  "hold-cannot-resolve-to-hold",
  "suggested-status-not-draft",
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

const report = readJson(reportPath);

assert(report.reportType === "manual-review-foundation", "reportType is invalid");
assert(report.reportVersion === "1.0", "reportVersion is invalid");
assert(isoDate.test(report.generatedAt), "generatedAt must be YYYY-MM-DD");
assert(
  report.executionStatus === "completed" || report.executionStatus === "completed-with-rejection",
  "executionStatus must be completed or completed-with-rejection"
);
assert(report.generator?.script === "scripts/candidate-manual-review.mjs", "generator script is invalid");
assert(report.mode === "manual-candidate-review", "mode is invalid");
assert(typeof report.writes?.updateCandidates === "boolean", "writes.updateCandidates must be boolean");
assert(report.writes?.canonicalData === false, "canonicalData writes must remain false");
assert(report.reviewPolicy?.allowedSourceReviewStatus === "pending", "allowedSourceReviewStatus must be pending");
assert(report.reviewPolicy?.allowedHoldResolutionSourceStatus === "reviewing", "allowedHoldResolutionSourceStatus must be reviewing");
assert(Array.isArray(report.reviewPolicy?.allowedDecisions), "allowedDecisions must be an array");
assert(report.reviewPolicy.allowedDecisions.join(",") === "approved,rejected,on-hold", "allowedDecisions are invalid");
assert(report.reviewPolicy?.suggestedStatusRequired === "draft", "suggestedStatusRequired must be draft");
assert(report.reviewPolicy?.resolveHoldRequired === true, "resolveHoldRequired must be true");
assert(report.reviewPolicy?.rejectHoldToHold === true, "rejectHoldToHold must be true");
assert(report.reviewPolicy?.rejectAlreadyReviewed === true, "rejectAlreadyReviewed must be true");
assert(report.reviewPolicy?.rejectVerifiedPromotion === true, "rejectVerifiedPromotion must be true");
assert(report.reviewPolicy?.writeConflictDetection === "input-hash-recheck-before-rename", "writeConflictDetection is invalid");
assert(report.reviewPolicy?.atomicWrite === true, "atomicWrite must be true");
assert(decisions.has(report.reviewInput?.decision), "reviewInput.decision is invalid");
assert(reviewStatuses.has(report.reviewInput?.mappedReviewStatus), "mappedReviewStatus is invalid");
assert(typeof report.reviewInput?.resolveHold === "boolean", "resolveHold must be boolean");
assert(isoDate.test(report.reviewInput?.reviewedAt ?? ""), "reviewedAt must be YYYY-MM-DD");
assertRequiredString(report.reviewInput?.reviewedBy, "reviewedBy");
assertRequiredString(report.reviewInput?.reviewNotes, "reviewNotes");
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
assert(report.summary?.reviewed + report.summary?.rejected === 1, "exactly one candidate result is required");
assert(typeof report.summary?.storeChanged === "boolean", "summary.storeChanged must be boolean");
assertRequiredString(report.result?.candidateId, "result.candidateId");
assert(actions.has(report.result?.action), "result.action is invalid");
assert(reasons.has(report.result?.reason), "result.reason is invalid");
assert(report.result?.promotedRecordType === null, "promotedRecordType must remain null");
assert(report.result?.promotedRecordId === null, "promotedRecordId must remain null");
assert(report.result?.promotedAt === null, "promotedAt must remain null");

if (report.result.action === "reviewed") {
  assert(report.executionStatus === "completed", "reviewed report must have completed status");
  assert(report.result.reason === "manual-review-recorded", "reviewed reason is invalid");
  assert(
    report.result.previousReviewStatus === "pending" || report.result.previousReviewStatus === "reviewing",
    "reviewed candidate must start pending or reviewing"
  );
  if (report.result.previousReviewStatus === "reviewing") {
    assert(report.reviewInput.resolveHold === true, "reviewing candidate requires resolveHold");
    assert(report.result.nextReviewStatus !== "reviewing", "hold resolution must not remain reviewing");
  }
  assert(reviewStatuses.has(report.result.nextReviewStatus), "nextReviewStatus is invalid");
  assert(decisions.has(report.result.reviewDecision), "reviewDecision is invalid");
}

if (report.result.action === "rejected") {
  assert(report.executionStatus === "completed-with-rejection", "rejected report must have completed-with-rejection status");
  assert(report.result.nextReviewStatus === null, "rejected result must not include nextReviewStatus");
  assert(report.result.reviewDecision === null, "rejected result must not include reviewDecision");
}

if (errors.length > 0) {
  console.error("Manual review report validation failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `Manual review report validation passed: ${report.summary.reviewed} reviewed, ${report.summary.rejected} rejected.`
);
