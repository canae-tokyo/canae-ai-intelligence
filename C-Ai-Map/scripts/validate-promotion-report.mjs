import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const reportPath = process.argv[2] ?? "reports/verified-promotion-report.example.json";
const errors = [];
const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const hash = /^sha256:[0-9a-f]{64}$/;
const actions = new Set(["promoted", "rejected"]);
const reasons = new Set([
  "approved-candidate-promoted",
  "candidate-not-found",
  "candidate-type-not-news",
  "candidate-not-approved",
  "candidate-already-promoted",
  "suggested-status-not-draft",
  "source-published-at-missing",
  "invalid-normalized-source-url",
  "duplicate-news-id",
  "duplicate-source-url",
  "duplicate-normalized-source-url",
  "id-missing",
  "title-missing",
  "company-missing",
  "category-missing",
  "importance-missing",
  "publishedAt-missing",
  "summary-missing",
  "impact-missing",
  "sourceType-missing",
  "sourceUrl-missing",
  "sourceCheckedAt-missing",
  "verifiedAt-missing",
  "status-missing",
  "dataQuality-missing",
  "verifiedBy-missing",
  "invalid-news-id",
  "invalid-category",
  "invalid-importance",
  "invalid-publishedAt",
  "invalid-sourceCheckedAt",
  "invalid-verifiedAt",
  "sourceType-not-official",
  "status-not-verified",
  "dataQuality-not-verified",
  "invalid-sourceUrl",
  "changeLog-missing",
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

function assertNullableHttpsUrl(value, label) {
  if (value === null) return;
  try {
    const url = new URL(value);
    assert(url.protocol === "https:", `${label} must use https`);
  } catch {
    assert(false, `${label} is invalid`);
  }
}

const report = readJson(reportPath);

assert(report.reportType === "verified-promotion-foundation", "reportType is invalid");
assert(report.reportVersion === "1.0", "reportVersion is invalid");
assert(isoDate.test(report.generatedAt), "generatedAt must be YYYY-MM-DD");
assert(
  report.executionStatus === "completed" || report.executionStatus === "completed-with-rejection",
  "executionStatus must be completed or completed-with-rejection"
);
assert(report.generator?.script === "scripts/verified-promotion.mjs", "generator script is invalid");
assert(report.mode === "verified-news-promotion", "mode is invalid");
assert(typeof report.writes?.updateCandidates === "boolean", "writes.updateCandidates must be boolean");
assert(typeof report.writes?.news === "boolean", "writes.news must be boolean");
assert(report.writes?.otherCanonicalData === false, "otherCanonicalData must remain false");
assert(report.promotionPolicy?.requiredCandidateType === "news", "requiredCandidateType must be news");
assert(report.promotionPolicy?.requiredReviewDecision === "approved", "requiredReviewDecision must be approved");
assert(report.promotionPolicy?.requiredReviewStatus === "accepted", "requiredReviewStatus must be accepted");
assert(report.promotionPolicy?.target === "news.json", "target must be news.json");
assert(report.promotionPolicy?.forcedStatus === "verified", "forcedStatus must be verified");
assert(report.promotionPolicy?.forcedDataQuality === "verified", "forcedDataQuality must be verified");
assert(report.promotionPolicy?.twoFileAtomicWrite === true, "twoFileAtomicWrite must be true");
assert(report.promotionPolicy?.rollbackOnFailure === true, "rollbackOnFailure must be true");
assert(report.promotionPolicy?.preWriteHashRecheck === true, "preWriteHashRecheck must be true");
assert(report.promotionPolicy?.rejectAlreadyPromoted === true, "rejectAlreadyPromoted must be true");
assert(report.promotionPolicy?.rejectNonApprovedCandidates === true, "rejectNonApprovedCandidates must be true");
assert(report.promotionPolicy?.rejectAutoImpactGeneration === true, "rejectAutoImpactGeneration must be true");
assert(report.writes.updateCandidates === report.writes.news, "news and candidate writes must be paired");
assert(report.writes.updateCandidates === report.storeAudit?.storeChanged, "writes must match storeChanged");
assert(typeof report.storeAudit?.apply === "boolean", "storeAudit.apply must be boolean");
assert(typeof report.storeAudit?.storeChanged === "boolean", "storeAudit.storeChanged must be boolean");
assert(Number.isInteger(report.storeAudit?.previousCandidateCount), "previousCandidateCount must be integer");
assert(Number.isInteger(report.storeAudit?.updatedCandidateCount), "updatedCandidateCount must be integer");
assert(Number.isInteger(report.storeAudit?.previousNewsCount), "previousNewsCount must be integer");
assert(Number.isInteger(report.storeAudit?.updatedNewsCount), "updatedNewsCount must be integer");
assert(hash.test(report.storeAudit?.candidateInputHash ?? ""), "candidateInputHash is invalid");
assert(hash.test(report.storeAudit?.candidateOutputHash ?? ""), "candidateOutputHash is invalid");
assert(hash.test(report.storeAudit?.newsInputHash ?? ""), "newsInputHash is invalid");
assert(hash.test(report.storeAudit?.newsOutputHash ?? ""), "newsOutputHash is invalid");
assert(report.summary?.promoted + report.summary?.rejected === 1, "exactly one promotion result is required");
assert(typeof report.summary?.storeChanged === "boolean", "summary.storeChanged must be boolean");
assertRequiredString(report.result?.candidateId, "result.candidateId");
assertRequiredString(report.result?.newsId, "result.newsId");
assert(actions.has(report.result?.action), "result.action is invalid");
assert(reasons.has(report.result?.reason), "result.reason is invalid");
assertNullableHttpsUrl(report.result?.sourceUrl, "result.sourceUrl");
assertNullableHttpsUrl(report.result?.normalizedSourceUrl, "result.normalizedSourceUrl");

if (report.result.action === "promoted") {
  assert(report.executionStatus === "completed", "promoted report must have completed status");
  assert(report.result.reason === "approved-candidate-promoted", "promoted reason is invalid");
  assert(report.result.status === "verified", "promoted status must be verified");
  assert(report.result.dataQuality === "verified", "promoted dataQuality must be verified");
  assert(report.result.promotedRecordType === "news", "promotedRecordType must be news");
  assert(report.result.promotedRecordId === report.result.newsId, "promotedRecordId must match newsId");
  assert(isoDate.test(report.result.promotedAt ?? ""), "promotedAt must be YYYY-MM-DD");
}

if (report.result.action === "rejected") {
  assert(report.executionStatus === "completed-with-rejection", "rejected report must have completed-with-rejection status");
  assert(report.result.status === null, "rejected status must be null");
  assert(report.result.dataQuality === null, "rejected dataQuality must be null");
  assert(report.result.promotedRecordType === null, "rejected promotedRecordType must be null");
  assert(report.result.promotedRecordId === null, "rejected promotedRecordId must be null");
  assert(report.result.promotedAt === null, "rejected promotedAt must be null");
}

if (errors.length > 0) {
  console.error("Verified promotion report validation failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `Verified promotion report validation passed: ${report.summary.promoted} promoted, ${report.summary.rejected} rejected.`
);
