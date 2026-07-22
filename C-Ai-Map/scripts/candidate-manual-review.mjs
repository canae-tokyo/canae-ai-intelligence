import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";

const root = process.cwd();
const defaultOptions = {
  date: null,
  candidateStore: "data/update-candidates.json",
  output: "reports/manual-review-report.local.json",
  candidateId: null,
  decision: null,
  reviewedBy: null,
  notes: null,
  apply: false,
  resolveHold: false,
};
const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const decisions = new Set(["approved", "rejected", "on-hold"]);
const decisionToReviewStatus = {
  approved: "accepted",
  rejected: "rejected",
  "on-hold": "reviewing",
};

function todayIsoDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function fail(message) {
  console.error(`Candidate manual review failed: ${message}`);
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
    } else if (arg.startsWith("--candidate-store=")) {
      options.candidateStore = arg.slice("--candidate-store=".length);
    } else if (arg.startsWith("--output=")) {
      options.output = arg.slice("--output=".length);
    } else if (arg.startsWith("--candidate-id=")) {
      options.candidateId = arg.slice("--candidate-id=".length);
    } else if (arg.startsWith("--decision=")) {
      options.decision = arg.slice("--decision=".length);
    } else if (arg.startsWith("--reviewed-by=")) {
      options.reviewedBy = arg.slice("--reviewed-by=".length);
    } else if (arg.startsWith("--notes=")) {
      options.notes = arg.slice("--notes=".length);
    } else if (arg === "--apply") {
      options.apply = true;
    } else if (arg === "--resolve-hold") {
      options.resolveHold = true;
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
  validatePath(options.candidateStore, "--candidate-store", ["data", "reports"]);
  validatePath(options.output, "--output", ["reports"]);
  if (!options.candidateId || options.candidateId.trim() !== options.candidateId) {
    fail("--candidate-id is required and must not contain surrounding whitespace");
  }
  if (!decisions.has(options.decision)) {
    fail("--decision must be approved, rejected, or on-hold");
  }
  if (
    !options.reviewedBy ||
    options.reviewedBy.trim() !== options.reviewedBy ||
    options.reviewedBy.length > 80 ||
    /[\r\n\t]/.test(options.reviewedBy)
  ) {
    fail("--reviewed-by is required and must be a single line up to 80 characters");
  }
  if (
    !options.notes ||
    options.notes.trim() !== options.notes ||
    options.notes.length > 500 ||
    /[\r\n\t]/.test(options.notes)
  ) {
    fail("--notes is required and must be a single line up to 500 characters");
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

function writeJsonAtomic(file, data, expectedInputHash) {
  const fullPath = path.join(root, file);
  const directory = path.dirname(fullPath);
  const tmpPath = path.join(directory, `.tmp-${path.basename(file)}-${process.pid}`);
  const payload = `${JSON.stringify(data, null, 2)}\n`;
  const currentHash = sha256(fs.readFileSync(fullPath, "utf8"));

  if (currentHash !== expectedInputHash) {
    fail("--candidate-store changed after it was read; aborting write");
  }

  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(tmpPath, payload);
  JSON.parse(fs.readFileSync(tmpPath, "utf8"));
  fs.renameSync(tmpPath, fullPath);
}

function validateCandidateStore(candidateStore) {
  if (!Array.isArray(candidateStore)) fail("--candidate-store must be a JSON array");
}

function reviewCandidate(candidate, options) {
  const nextReviewStatus = decisionToReviewStatus[options.decision];
  const existingChangeLog = Array.isArray(candidate.changeLog) ? candidate.changeLog : [];
  const actionType = candidate.reviewStatus === "reviewing" ? "manual-review-resolved" : "manual-review";

  return {
    ...candidate,
    reviewStatus: nextReviewStatus,
    reviewDecision: options.decision,
    reviewedAt: options.date,
    reviewedBy: options.reviewedBy,
    reviewNotes: options.notes,
    promotedRecordType: null,
    promotedRecordId: null,
    promotedAt: null,
    changeLog: [
      ...existingChangeLog,
      {
        date: options.date,
        type: actionType,
        summary: `Manual review decision recorded: ${options.decision}. No canonical data was changed.`,
        actor: options.reviewedBy,
      },
    ],
  };
}

function reviewDecision(candidateStore, options) {
  const index = candidateStore.findIndex((candidate) => candidate.id === options.candidateId);

  if (index === -1) {
    return {
      action: "rejected",
      reason: "candidate-not-found",
      candidate: null,
      previousReviewStatus: null,
      updatedStore: candidateStore,
    };
  }

  const candidate = candidateStore[index];
  if (candidate.reviewStatus === "reviewing") {
    if (!options.resolveHold) {
      return {
        action: "rejected",
        reason: "resolve-hold-required",
        candidate,
        previousReviewStatus: candidate.reviewStatus,
        updatedStore: candidateStore,
      };
    }
    if (options.decision === "on-hold") {
      return {
        action: "rejected",
        reason: "hold-cannot-resolve-to-hold",
        candidate,
        previousReviewStatus: candidate.reviewStatus,
        updatedStore: candidateStore,
      };
    }
  } else if (candidate.reviewStatus !== "pending") {
    return {
      action: "rejected",
      reason: "candidate-already-reviewed",
      candidate,
      previousReviewStatus: candidate.reviewStatus,
      updatedStore: candidateStore,
    };
  }
  if (candidate.suggestedStatus !== "draft") {
    return {
      action: "rejected",
      reason: "suggested-status-not-draft",
      candidate,
      previousReviewStatus: candidate.reviewStatus,
      updatedStore: candidateStore,
    };
  }

  const reviewedCandidate = reviewCandidate(candidate, options);
  const updatedStore = candidateStore.map((item, itemIndex) => (itemIndex === index ? reviewedCandidate : item));

  return {
    action: "reviewed",
    reason: "manual-review-recorded",
    candidate: reviewedCandidate,
    previousReviewStatus: candidate.reviewStatus,
    updatedStore,
  };
}

const options = parseArgs(process.argv.slice(2));
const candidateStoreText = readText(options.candidateStore);
let candidateStore;

try {
  candidateStore = JSON.parse(candidateStoreText);
} catch (error) {
  fail(`failed to read JSON ${options.candidateStore}: ${error.message}`);
}

validateCandidateStore(candidateStore);

const result = reviewDecision(candidateStore, options);
const storeChanged = options.apply && result.action === "reviewed";
const outputStoreText = `${JSON.stringify(result.updatedStore, null, 2)}\n`;

const inputHash = sha256(candidateStoreText);

if (storeChanged) {
  writeJsonAtomic(options.candidateStore, result.updatedStore, inputHash);
}

const report = {
  reportType: "manual-review-foundation",
  reportVersion: "1.0",
  generatedAt: options.date,
  executionStatus: result.action === "reviewed" ? "completed" : "completed-with-rejection",
  generator: {
    script: "scripts/candidate-manual-review.mjs",
    version: "1.0",
  },
  input: {
    candidateStoreFile: options.candidateStore,
    candidateCount: candidateStore.length,
    candidateId: options.candidateId,
  },
  mode: "manual-candidate-review",
  writes: {
    updateCandidates: storeChanged,
    canonicalData: false,
  },
  reviewPolicy: {
    allowedSourceReviewStatus: "pending",
    allowedHoldResolutionSourceStatus: "reviewing",
    allowedDecisions: ["approved", "rejected", "on-hold"],
    decisionStatusMap: decisionToReviewStatus,
    suggestedStatusRequired: "draft",
    resolveHoldRequired: true,
    rejectHoldToHold: true,
    rejectAlreadyReviewed: true,
    rejectVerifiedPromotion: true,
    writeConflictDetection: "input-hash-recheck-before-rename",
    atomicWrite: true,
  },
  reviewInput: {
    decision: options.decision,
    mappedReviewStatus: decisionToReviewStatus[options.decision],
    resolveHold: options.resolveHold,
    reviewedAt: options.date,
    reviewedBy: options.reviewedBy,
    reviewNotes: options.notes,
  },
  storeAudit: {
    apply: options.apply,
    storeChanged,
    previousCandidateCount: candidateStore.length,
    updatedCandidateCount: storeChanged ? result.updatedStore.length : candidateStore.length,
    inputHash,
    outputHash: storeChanged ? sha256(outputStoreText) : inputHash,
  },
  output: {
    candidateStoreFile: options.candidateStore,
    reportFile: options.output,
    updatedCandidateCount: storeChanged ? result.updatedStore.length : candidateStore.length,
  },
  summary: {
    reviewed: result.action === "reviewed" ? 1 : 0,
    rejected: result.action === "rejected" ? 1 : 0,
    storeChanged,
  },
  result: {
    candidateId: options.candidateId,
    action: result.action,
    reason: result.reason,
    previousReviewStatus: result.previousReviewStatus,
    nextReviewStatus: result.action === "reviewed" ? decisionToReviewStatus[options.decision] : null,
    reviewDecision: result.action === "reviewed" ? options.decision : null,
    promotedRecordType: null,
    promotedRecordId: null,
    promotedAt: null,
  },
};

writeJson(options.output, report);

console.log(
  `Candidate manual review ${storeChanged ? "applied" : "dry-run"} ${options.output}: ${report.summary.reviewed} reviewed / ${report.summary.rejected} rejected.`
);
