import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";

const root = process.cwd();
const defaultOptions = {
  date: null,
  duplicateDiffReport: "reports/duplicate-diff-report.example.json",
  candidateReport: "reports/candidate-generation-report.example.json",
  candidateStore: "reports/candidate-registration-store.example.json",
  output: "reports/candidate-registration-report.local.json",
  apply: false,
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
    } else if (arg === "--apply") {
      options.apply = true;
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
  if (!options.apply && options.candidateStore.startsWith("data/")) {
    fail("--apply is required when --candidate-store points to data/");
  }
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
  } catch (error) {
    fail(`failed to read JSON ${file}: ${error.message}`);
  }
}

function readText(file) {
  try {
    return fs.readFileSync(path.join(root, file), "utf8");
  } catch (error) {
    fail(`failed to read ${file}: ${error.message}`);
  }
}

function sha256(value) {
  return `sha256:${crypto.createHash("sha256").update(value).digest("hex")}`;
}

function writeJson(file, data) {
  const fullPath = path.join(root, file);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, `${JSON.stringify(data, null, 2)}\n`);
}

function writeJsonAtomic(file, data) {
  const fullPath = path.join(root, file);
  const directory = path.dirname(fullPath);
  const tmpPath = path.join(directory, `.tmp-${path.basename(file)}-${process.pid}`);
  const payload = `${JSON.stringify(data, null, 2)}\n`;

  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(tmpPath, payload);
  JSON.parse(fs.readFileSync(tmpPath, "utf8"));
  fs.renameSync(tmpPath, fullPath);
}

function normalizeUrl(value) {
  try {
    const url = new URL(value);
    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase();
    url.hash = "";
    url.search = "";
    const normalized = url.toString();
    return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
  } catch {
    return null;
  }
}

function validateReports(duplicateDiffReport, candidateReport, candidateStore) {
  if (duplicateDiffReport.reportType !== "duplicate-diff-foundation") {
    fail("--duplicate-diff-report must be a duplicate-diff-foundation report");
  }
  if (duplicateDiffReport.writes?.canonicalData !== false || duplicateDiffReport.writes?.updateCandidates !== false) {
    fail("--duplicate-diff-report must be report-only");
  }
  if (!Array.isArray(duplicateDiffReport.results)) fail("--duplicate-diff-report must include results");
  if (
    duplicateDiffReport.input?.candidateReportFile &&
    duplicateDiffReport.input.candidateReportFile !== options.candidateReport
  ) {
    fail("--duplicate-diff-report input candidateReportFile must match --candidate-report");
  }

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

function decision(
  candidateResult,
  sourceCandidate,
  existingIds,
  existingCanonicalUrls,
  existingNormalizedCanonicalUrls,
  batchIds,
  batchCanonicalUrls,
  batchNormalizedCanonicalUrls
) {
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
  if (candidateResult.duplicateStatus !== "new") {
    return {
      action: "rejected",
      reason: "duplicate-status-not-new",
    };
  }
  if (candidateResult.sourceId !== sourceCandidate.sourceId) {
    return {
      action: "rejected",
      reason: "source-id-mismatch",
    };
  }
  if (candidateResult.candidateType !== sourceCandidate.candidateType) {
    return {
      action: "rejected",
      reason: "candidate-type-mismatch",
    };
  }
  if (candidateResult.candidateCanonicalUrl !== sourceCandidate.canonicalUrl) {
    return {
      action: "rejected",
      reason: "canonical-url-mismatch",
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
  const normalizedCanonicalUrl = normalizeUrl(sourceCandidate.canonicalUrl);
  if (!normalizedCanonicalUrl) {
    return {
      action: "rejected",
      reason: "invalid-canonical-url",
    };
  }
  if (
    existingNormalizedCanonicalUrls.has(normalizedCanonicalUrl) ||
    batchNormalizedCanonicalUrls.has(normalizedCanonicalUrl)
  ) {
    return {
      action: "rejected",
      reason: "duplicate-normalized-canonical-url",
    };
  }

  return {
    action: "registered",
    reason: "new-pending-candidate",
  };
}

const options = parseArgs(process.argv.slice(2));
const candidateStoreText = readText(options.candidateStore);
const duplicateDiffReport = readJson(options.duplicateDiffReport);
const candidateReport = readJson(options.candidateReport);
let candidateStore;
try {
  candidateStore = JSON.parse(candidateStoreText);
} catch (error) {
  fail(`failed to read JSON ${options.candidateStore}: ${error.message}`);
}

validateReports(duplicateDiffReport, candidateReport, candidateStore);

const sourceCandidates = new Map(
  candidateReport.candidates.map((candidate) => [candidate.id, candidate])
);
const existingIds = new Set(candidateStore.map((candidate) => candidate.id));
const existingCanonicalUrls = new Set(candidateStore.map((candidate) => candidate.canonicalUrl));
const existingNormalizedCanonicalUrls = new Set(
  candidateStore.map((candidate) => normalizeUrl(candidate.canonicalUrl)).filter(Boolean)
);
const batchIds = new Set();
const batchCanonicalUrls = new Set();
const batchNormalizedCanonicalUrls = new Set();
const registeredCandidates = [];
const results = [];

for (const candidateResult of duplicateDiffReport.results) {
  const sourceCandidate = sourceCandidates.get(candidateResult.candidateId) ?? null;
  const currentDecision = decision(
    candidateResult,
    sourceCandidate,
    existingIds,
    existingCanonicalUrls,
    existingNormalizedCanonicalUrls,
    batchIds,
    batchCanonicalUrls,
    batchNormalizedCanonicalUrls
  );

  if (currentDecision.action === "registered") {
    const registeredCandidate = makeRegisteredCandidate(sourceCandidate, options.date);
    registeredCandidates.push(registeredCandidate);
    batchIds.add(registeredCandidate.id);
    batchCanonicalUrls.add(registeredCandidate.canonicalUrl);
    batchNormalizedCanonicalUrls.add(normalizeUrl(registeredCandidate.canonicalUrl));
  }

  results.push({
    candidateId: candidateResult.candidateId,
    canonicalUrl: sourceCandidate?.canonicalUrl ?? candidateResult.candidateCanonicalUrl,
    normalizedCanonicalUrl: normalizeUrl(sourceCandidate?.canonicalUrl ?? candidateResult.candidateCanonicalUrl),
    matchStatus: candidateResult.matchStatus,
    duplicateStatus: candidateResult.duplicateStatus,
    action: currentDecision.action,
    reason: currentDecision.reason,
  });
}

const updatedCandidates = [...candidateStore, ...registeredCandidates];
const storeChanged = options.apply && registeredCandidates.length > 0;
if (storeChanged) {
  writeJsonAtomic(options.candidateStore, updatedCandidates);
}

const summary = {
  inputCandidates: duplicateDiffReport.results.length,
  registered: registeredCandidates.length,
  skipped: results.filter((result) => result.action === "skipped").length,
  rejected: results.filter((result) => result.action === "rejected").length,
  duplicateCandidateIds: results.filter((result) => result.reason === "duplicate-candidate-id").length,
  duplicateCanonicalUrls: results.filter((result) => result.reason === "duplicate-canonical-url").length,
  duplicateNormalizedCanonicalUrls: results.filter((result) => result.reason === "duplicate-normalized-canonical-url")
    .length,
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
    updateCandidates: storeChanged,
    canonicalData: false,
  },
  registrationPolicy: {
    allowedMatchStatus: "new",
    requiredReviewStatus: "pending",
    forcedReviewStatus: "pending",
    forcedSuggestedStatus: "draft",
    rejectVerifiedPromotion: true,
    duplicateKeys: ["id", "canonicalUrl", "normalizedCanonicalUrl"],
    applyRequiredForDataStore: true,
    atomicWrite: true,
  },
  storeAudit: {
    apply: options.apply,
    storeChanged,
    previousCandidateCount: candidateStore.length,
    updatedCandidateCount: storeChanged ? updatedCandidates.length : candidateStore.length,
    inputHash: sha256(candidateStoreText),
    outputHash: storeChanged ? sha256(`${JSON.stringify(updatedCandidates, null, 2)}\n`) : sha256(candidateStoreText),
  },
  output: {
    candidateStoreFile: options.candidateStore,
    reportFile: options.output,
    updatedCandidateCount: storeChanged ? updatedCandidates.length : candidateStore.length,
  },
  summary,
  registeredCandidateIds: registeredCandidates.map((candidate) => candidate.id),
  results,
};

writeJson(options.output, report);

console.log(
  `Candidate registration ${storeChanged ? "applied" : "dry-run"} ${options.output}: ${summary.registered} registered / ${summary.skipped} skipped / ${summary.rejected} rejected.`
);
