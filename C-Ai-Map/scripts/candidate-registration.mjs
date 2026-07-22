import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const defaultOptions = {
  date: null,
  duplicateDiffReport: "reports/duplicate-diff-report.example.json",
  candidateReport: "reports/candidate-generation-report.example.json",
  candidateStore: "data/update-candidates.json",
  output: "reports/candidate-registration-report.local.json",
};
const isoDate = /^\d{4}-\d{2}-\d{2}$/;

function todayIsoDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function fail(message) {
  console.error(`Candidate registration failed: ${message}`);
  process.exit(1);
}

function isRealIsoDate(value) {
  if (!isoDate.test(value)) return false;

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function validatePath(value, label, allowedPrefixes) {
  const resolved = path.resolve(root, value);

  if (path.isAbsolute(value)) fail(`${label} must be relative to the project root`);

  const isAllowed = allowedPrefixes.some((prefix) => {
    const allowedRoot = path.resolve(root, prefix);
    return resolved === allowedRoot || resolved.startsWith(`${allowedRoot}${path.sep}`);
  });

  if (!isAllowed) fail(`${label} must stay under ${allowedPrefixes.join(" or ")}/`);
}

function parseArgs(argv) {
  const options = { ...defaultOptions };

  for (const arg of argv) {
    if (arg.startsWith("--date=")) {
      options.date = arg.slice("--date=".length);
    } else if (arg.startsWith("--duplicate-diff-report=")) {
      options.duplicateDiffReport = arg.slice("--duplicate-diff-report=".length);
    } else if (arg.startsWith("--candidate-report=")) {
      options.candidateReport = arg.slice("--candidate-report=".length);
    } else if (arg.startsWith("--candidate-store=")) {
      options.candidateStore = arg.slice("--candidate-store=".length);
    } else if (arg.startsWith("--output=")) {
      options.output = arg.slice("--output=".length);
    } else {
      fail(`unknown argument: ${arg}`);
    }
  }

  options.date = options.date ?? todayIsoDate();
  validateOptions(options);

  return options;
}

function validateOptions(options) {
  if (!isRealIsoDate(options.date)) fail("--date must be a real YYYY-MM-DD date");
  validatePath(options.duplicateDiffReport, "--duplicate-diff-report", ["reports"]);
  validatePath(options.candidateReport, "--candidate-report", ["reports"]);
  validatePath(options.candidateStore, "--candidate-store", ["data", "reports"]);
  validatePath(options.output, "--output", ["reports"]);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
  } catch (error) {
    fail(`failed to read JSON ${file}: ${error.message}`);
  }
}

function writeJson(file, data) {
  const fullPath = path.join(root, file);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, `${JSON.stringify(data, null, 2)}\n`);
}

function validateReports(duplicateDiffReport, candidateReport, candidateStore) {
  if (duplicateDiffReport.reportType !== "duplicate-diff-foundation") {
    fail("--duplicate-diff-report must be a duplicate-diff-foundation report");
  }
  if (duplicateDiffReport.writes?.canonicalData !== false || duplicateDiffReport.writes?.updateCandidates !== false) {
    fail("--duplicate-diff-report must be report-only");
  }
  if (!Array.isArray(duplicateDiffReport.results)) fail("--duplicate-diff-report must include results");

  if (candidateReport.reportType !== "candidate-generation-foundation") {
    fail("--candidate-report must be a candidate-generation-foundation report");
  }
  if (candidateReport.writes?.canonicalData !== false || candidateReport.writes?.updateCandidates !== false) {
    fail("--candidate-report must be report-only");
  }
  if (!Array.isArray(candidateReport.candidates)) fail("--candidate-report must include candidates");
  if (!Array.isArray(candidateStore)) fail("--candidate-store must be a JSON array");
}

function makeRegisteredCandidate(candidate, registeredAt) {
  return {
    id: candidate.id,
    sourceId: candidate.sourceId,
    candidateType: candidate.candidateType,
    title: candidate.title,
    sourceUrl: candidate.sourceUrl,
    canonicalUrl: candidate.canonicalUrl,
    sourcePublishedAt: candidate.sourcePublishedAt,
    detectedAt: candidate.detectedAt,
    registeredAt,
    suggestedStatus: "draft",
    duplicateCheck: {
      status: "clear",
      matchedIds: [],
    },
    diffSummary: "Registered from duplicate/diff report as a pending draft candidate. No canonical data was changed.",
    reviewStatus: "pending",
    reviewedAt: null,
    reviewedBy: null,
    promotedRecordType: null,
    promotedRecordId: null,
    promotedAt: null,
    notes: "Candidate Registration Foundation. Manual review is required before any promotion.",
    changeLog: [
      {
        date: registeredAt,
        type: "registered",
        summary: "Registered as pending update candidate from duplicate/diff report.",
        actor: "CANAE/Codex",
      },
    ],
  };
}

function decision(candidateResult, sourceCandidate, existingIds, existingCanonicalUrls, batchIds, batchCanonicalUrls) {
  if (candidateResult.matchStatus !== "new") {
    return {
      action: "skipped",
      reason: "not-new-candidate",
    };
  }
  if (!sourceCandidate) {
    return {
      action: "rejected",
      reason: "source-candidate-not-found",
    };
  }
  if (sourceCandidate.reviewStatus !== "pending") {
    return {
      action: "rejected",
      reason: "source-review-status-not-pending",
    };
  }
  if (sourceCandidate.suggestedStatus !== "draft") {
    return {
      action: "rejected",
      reason: "source-suggested-status-not-draft",
    };
  }
  if (existingIds.has(sourceCandidate.id) || batchIds.has(sourceCandidate.id)) {
    return {
      action: "rejected",
      reason: "duplicate-candidate-id",
    };
  }
  if (existingCanonicalUrls.has(sourceCandidate.canonicalUrl) || batchCanonicalUrls.has(sourceCandidate.canonicalUrl)) {
    return {
      action: "rejected",
      reason: "duplicate-canonical-url",
    };
  }

  return {
    action: "registered",
    reason: "new-pending-candidate",
  };
}

const options = parseArgs(process.argv.slice(2));
const duplicateDiffReport = readJson(options.duplicateDiffReport);
const candidateReport = readJson(options.candidateReport);
const candidateStore = readJson(options.candidateStore);

validateReports(duplicateDiffReport, candidateReport, candidateStore);

const sourceCandidates = new Map(
  candidateReport.candidates.map((candidate) => [candidate.id, candidate])
);
const existingIds = new Set(candidateStore.map((candidate) => candidate.id));
const existingCanonicalUrls = new Set(candidateStore.map((candidate) => candidate.canonicalUrl));
const batchIds = new Set();
const batchCanonicalUrls = new Set();
const registeredCandidates = [];
const results = [];

for (const candidateResult of duplicateDiffReport.results) {
  const sourceCandidate = sourceCandidates.get(candidateResult.candidateId) ?? null;
  const currentDecision = decision(
    candidateResult,
    sourceCandidate,
    existingIds,
    existingCanonicalUrls,
    batchIds,
    batchCanonicalUrls
  );

  if (currentDecision.action === "registered") {
    const registeredCandidate = makeRegisteredCandidate(sourceCandidate, options.date);
    registeredCandidates.push(registeredCandidate);
    batchIds.add(registeredCandidate.id);
    batchCanonicalUrls.add(registeredCandidate.canonicalUrl);
  }

  results.push({
    candidateId: candidateResult.candidateId,
    canonicalUrl: sourceCandidate?.canonicalUrl ?? candidateResult.candidateCanonicalUrl,
    matchStatus: candidateResult.matchStatus,
    duplicateStatus: candidateResult.duplicateStatus,
    action: currentDecision.action,
    reason: currentDecision.reason,
  });
}

const updatedCandidates = [...candidateStore, ...registeredCandidates];
writeJson(options.candidateStore, updatedCandidates);

const summary = {
  inputCandidates: duplicateDiffReport.results.length,
  registered: registeredCandidates.length,
  skipped: results.filter((result) => result.action === "skipped").length,
  rejected: results.filter((result) => result.action === "rejected").length,
  duplicateCandidateIds: results.filter((result) => result.reason === "duplicate-candidate-id").length,
  duplicateCanonicalUrls: results.filter((result) => result.reason === "duplicate-canonical-url").length,
};

const report = {
  reportType: "candidate-registration-foundation",
  reportVersion: "1.0",
  generatedAt: options.date,
  executionStatus: "completed",
  generator: {
    script: "scripts/candidate-registration.mjs",
    version: "1.0",
  },
  input: {
    duplicateDiffReportFile: options.duplicateDiffReport,
    candidateReportFile: options.candidateReport,
    candidateStoreFile: options.candidateStore,
    existingCandidateCount: candidateStore.length,
  },
  mode: "candidate-store-registration",
  writes: {
    updateCandidates: true,
    canonicalData: false,
  },
  registrationPolicy: {
    allowedMatchStatus: "new",
    requiredReviewStatus: "pending",
    forcedReviewStatus: "pending",
    forcedSuggestedStatus: "draft",
    rejectVerifiedPromotion: true,
    duplicateKeys: ["id", "canonicalUrl"],
  },
  output: {
    candidateStoreFile: options.candidateStore,
    reportFile: options.output,
    updatedCandidateCount: updatedCandidates.length,
  },
  summary,
  registeredCandidateIds: registeredCandidates.map((candidate) => candidate.id),
  results,
};

writeJson(options.output, report);

console.log(
  `Candidate registration wrote ${options.candidateStore} and ${options.output}: ${summary.registered} registered / ${summary.skipped} skipped / ${summary.rejected} rejected.`
);
