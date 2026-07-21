import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const reportPath = process.argv[2] ?? "reports/candidate-generation-report.example.json";
const errors = [];
const isoDate = /^\d{4}-\d{2}-\d{2}$/;

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
}

function assertUrl(value, label) {
  try {
    const url = new URL(value);
    assert(url.protocol === "https:", `${label} must use https: ${value}`);
  } catch {
    assert(false, `${label} is not a valid URL: ${value}`);
  }
}

function assertRequiredString(value, label) {
  assert(typeof value === "string" && value.trim().length > 0, `${label} is required`);
}

function assertNullableIsoDate(value, label) {
  assert(value === null || isoDate.test(value), `${label} must be null or YYYY-MM-DD`);
}

function dateFromGithubChangelogUrl(value) {
  const match = value.match(/\/changelog\/(\d{4})-(\d{2})-(\d{2})-/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function assertUnique(values, label) {
  const seen = new Set();
  for (const value of values) {
    assert(!seen.has(value), `${label} duplicate: ${value}`);
    seen.add(value);
  }
}

const report = readJson(reportPath);

assert(report.reportType === "candidate-generation-foundation", "reportType is invalid");
assert(report.reportVersion === "1.0", "reportVersion is invalid");
assert(isoDate.test(report.generatedAt), "generatedAt must be YYYY-MM-DD");
assert(report.mode === "report-only-candidate-generation", "mode is invalid");
assert(report.writes?.canonicalData === false, "canonicalData writes must remain false");
assert(report.writes?.updateCandidates === false, "updateCandidates writes must remain false");
assert(report.input?.sourceId === "source-github-changelog", "sourceId must remain source-github-changelog");
assert(report.input?.sourceStatus === 200, "sourceStatus must be 200");
assert(Array.isArray(report.excludedSources), "excludedSources must be an array");
assert(
  report.excludedSources.some(
    (source) => source.sourceId === "source-openai-news" && source.reason === "not-eligible-fetch-result"
  ),
  "OpenAI 403 source must remain excluded from candidate generation"
);
assert(Array.isArray(report.candidates), "candidates must be an array");
assert(report.candidates.length > 0, "at least one candidate is required");
assertUnique(
  report.candidates.map((candidate) => candidate.id),
  "candidate id"
);
assertUnique(
  report.candidates.map((candidate) => candidate.canonicalUrl),
  "canonicalUrl"
);

for (const candidate of report.candidates) {
  assertRequiredString(candidate.id, "candidate id");
  assert(candidate.sourceId === "source-github-changelog", `candidate sourceId is invalid: ${candidate.id}`);
  assert(candidate.candidateType === "news", `candidateType must be news: ${candidate.id}`);
  assertRequiredString(candidate.title, `candidate title ${candidate.id}`);
  assertUrl(candidate.sourceUrl, `candidate sourceUrl ${candidate.id}`);
  assertUrl(candidate.canonicalUrl, `candidate canonicalUrl ${candidate.id}`);
  assert(candidate.sourceUrl === candidate.canonicalUrl, `sourceUrl must equal canonicalUrl: ${candidate.id}`);
  assertNullableIsoDate(candidate.sourcePublishedAt, `sourcePublishedAt ${candidate.id}`);
  assert(
    candidate.sourcePublishedAt === dateFromGithubChangelogUrl(candidate.canonicalUrl),
    `sourcePublishedAt must match GitHub Changelog URL date: ${candidate.id}`
  );
  assert(isoDate.test(candidate.detectedAt), `detectedAt must be YYYY-MM-DD: ${candidate.id}`);
  assert(candidate.summarySource === "extracted", `summarySource must be extracted: ${candidate.id}`);
  assert(candidate.reviewStatus === "pending", `reviewStatus must remain pending: ${candidate.id}`);
  assert(candidate.suggestedStatus === "draft", `suggestedStatus must remain draft: ${candidate.id}`);
  assert(candidate.suggestedStatus !== "verified", `candidate must not auto-promote: ${candidate.id}`);
  assert(candidate.duplicateCheck?.status === "not-run", `duplicateCheck must remain not-run: ${candidate.id}`);
  assert(Array.isArray(candidate.duplicateCheck?.matchedIds), `matchedIds must be an array: ${candidate.id}`);
  assert(candidate.duplicateCheck.matchedIds.length === 0, `matchedIds must be empty: ${candidate.id}`);
  assert(candidate.promotedRecordType === null, `promotedRecordType must be null: ${candidate.id}`);
  assert(candidate.promotedRecordId === null, `promotedRecordId must be null: ${candidate.id}`);
  assert(candidate.promotedAt === null, `promotedAt must be null: ${candidate.id}`);
  assert(Array.isArray(candidate.missingFields), `missingFields must be an array: ${candidate.id}`);
}

if (errors.length > 0) {
  console.error("Candidate report validation failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `Candidate report validation passed: ${report.candidates.length} candidates from ${report.input.sourceId}.`
);
