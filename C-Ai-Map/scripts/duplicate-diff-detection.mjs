import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const defaultOptions = {
  date: null,
  candidateReport: "reports/candidate-generation-report.example.json",
  canonicalNews: "data/news.json",
  output: "reports/duplicate-diff-report.local.json",
};
const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const titleSimilarityThreshold = 0.82;

function todayIsoDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function fail(message) {
  console.error(`Duplicate diff detection failed: ${message}`);
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

function validateProjectPath(value, label, requiredPrefix) {
  const resolved = path.resolve(root, value);
  const allowedRoot = path.resolve(root, requiredPrefix);

  if (path.isAbsolute(value)) fail(`${label} must be relative to the project root`);
  if (resolved !== allowedRoot && !resolved.startsWith(`${allowedRoot}${path.sep}`)) {
    fail(`${label} must stay under ${requiredPrefix}/`);
  }
}

function validateReadableProjectPath(value, label, allowedPrefixes) {
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
    } else if (arg.startsWith("--candidate-report=")) {
      options.candidateReport = arg.slice("--candidate-report=".length);
    } else if (arg.startsWith("--canonical-news=")) {
      options.canonicalNews = arg.slice("--canonical-news=".length);
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
  validateProjectPath(options.candidateReport, "--candidate-report", "reports");
  validateReadableProjectPath(options.canonicalNews, "--canonical-news", ["data", "reports"]);
  validateProjectPath(options.output, "--output", "reports");
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

function normalizeTitle(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleTokens(value) {
  const normalized = normalizeTitle(value);
  return normalized ? normalized.split(" ") : [];
}

function titleSimilarity(left, right) {
  const leftTokens = new Set(titleTokens(left));
  const rightTokens = new Set(titleTokens(right));
  if (leftTokens.size === 0 && rightTokens.size === 0) return 1;
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;

  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) intersection += 1;
  }

  return Number((intersection / new Set([...leftTokens, ...rightTokens]).size).toFixed(3));
}

function contentFingerprint(candidate) {
  const source = [
    normalizeUrl(candidate.canonicalUrl) ?? candidate.canonicalUrl,
    normalizeTitle(candidate.title),
    candidate.sourcePublishedAt ?? "",
  ].join("\n");

  return `sha256:${crypto.createHash("sha256").update(source).digest("hex")}`;
}

function canonicalUrlForNews(record) {
  return record.canonicalUrl ?? record.sourceUrl ?? null;
}

function makeExistingRecord(record) {
  const canonicalUrl = canonicalUrlForNews(record);

  return {
    id: record.id,
    recordType: "news",
    title: record.title,
    publishedAt: record.publishedAt,
    summary: record.summary ?? null,
    sourceUrl: record.sourceUrl,
    canonicalUrl,
    normalizedUrl: canonicalUrl ? normalizeUrl(canonicalUrl) : null,
  };
}

function diffItems(candidate, existing) {
  const items = [];
  const comparisons = [
    ["title", candidate.title, existing.title],
    ["sourcePublishedAt", candidate.sourcePublishedAt, existing.publishedAt],
    ["canonicalUrl", candidate.canonicalUrl, existing.canonicalUrl],
    ["summary", candidate.summary ?? null, existing.summary ?? null],
  ];

  for (const [field, candidateValue, existingValue] of comparisons) {
    if (candidateValue !== existingValue) {
      items.push({
        field,
        candidateValue,
        existingValue,
      });
    }
  }

  return items;
}

function matchReasons(candidate, existing, similarity) {
  if (!existing) return ["none"];

  const reasons = [];
  const normalizedCandidateUrl = normalizeUrl(candidate.canonicalUrl);

  if (existing.canonicalUrl === candidate.canonicalUrl) reasons.push("canonical-url");
  if (existing.normalizedUrl && existing.normalizedUrl === normalizedCandidateUrl) {
    reasons.push("normalized-url");
  }
  if (similarity >= titleSimilarityThreshold && candidate.sourcePublishedAt === existing.publishedAt) {
    reasons.push("title-similarity");
  }

  return reasons;
}

function findMatch(candidate, existingRecords) {
  const exact = existingRecords.find((record) => record.canonicalUrl === candidate.canonicalUrl);
  if (exact) {
    const similarity = titleSimilarity(candidate.title, exact.title);
    return {
      status: "duplicate",
      reason: "canonical-url",
      record: exact,
      titleSimilarity: similarity,
      reasons: matchReasons(candidate, exact, similarity),
    };
  }

  const normalizedCandidateUrl = normalizeUrl(candidate.canonicalUrl);
  const normalized = existingRecords.find(
    (record) => record.normalizedUrl && record.normalizedUrl === normalizedCandidateUrl
  );
  if (normalized) {
    const similarity = titleSimilarity(candidate.title, normalized.title);
    return {
      status: "duplicate",
      reason: "normalized-url",
      record: normalized,
      titleSimilarity: similarity,
      reasons: matchReasons(candidate, normalized, similarity),
    };
  }

  let bestTitleMatch = null;
  for (const record of existingRecords) {
    const similarity = titleSimilarity(candidate.title, record.title);
    if (
      similarity >= titleSimilarityThreshold &&
      candidate.sourcePublishedAt === record.publishedAt &&
      (!bestTitleMatch || similarity > bestTitleMatch.titleSimilarity)
    ) {
      bestTitleMatch = {
        status: "possible-duplicate",
        reason: "title-similarity",
        record,
        titleSimilarity: similarity,
        reasons: matchReasons(candidate, record, similarity),
      };
    }
  }

  return (
    bestTitleMatch ?? {
      status: "new",
      reason: "none",
      record: null,
      titleSimilarity: 0,
      reasons: ["none"],
    }
  );
}

function validateCandidateReport(report) {
  if (report.reportType !== "candidate-generation-foundation") {
    fail("--candidate-report must be a candidate-generation-foundation report");
  }
  if (report.writes?.canonicalData !== false || report.writes?.updateCandidates !== false) {
    fail("--candidate-report must be report-only and must not write canonical data");
  }
  if (!Array.isArray(report.candidates)) fail("--candidate-report must include candidates");
}

const options = parseArgs(process.argv.slice(2));
const candidateReport = readJson(options.candidateReport);
const canonicalNews = readJson(options.canonicalNews);

validateCandidateReport(candidateReport);
if (!Array.isArray(canonicalNews)) fail("--canonical-news must be a JSON array");

const existingRecords = canonicalNews
  .filter((record) => record?.id && canonicalUrlForNews(record))
  .map(makeExistingRecord);

const results = candidateReport.candidates.map((candidate) => {
  const normalizedCandidateUrl = normalizeUrl(candidate.canonicalUrl);
  const match = findMatch(candidate, existingRecords);
  const matchedRecord = match.record;

  return {
    candidateId: candidate.id,
    sourceId: candidate.sourceId,
    candidateType: candidate.candidateType,
    candidateTitle: candidate.title,
    candidateCanonicalUrl: candidate.canonicalUrl,
    normalizedCandidateUrl,
    sourcePublishedAt: candidate.sourcePublishedAt,
    contentFingerprint: contentFingerprint(candidate),
    duplicateStatus: match.status,
    matchStatus: match.status,
    matchReason: match.reason,
    matchReasons: match.reasons,
    matchedRecordType: matchedRecord?.recordType ?? null,
    matchedRecordId: matchedRecord?.id ?? null,
    matchedCanonicalUrl: matchedRecord?.canonicalUrl ?? null,
    normalizedMatchedUrl: matchedRecord?.normalizedUrl ?? null,
    titleSimilarity: match.titleSimilarity,
    diffItems: matchedRecord ? diffItems(candidate, matchedRecord) : [],
  };
});

const summary = {
  candidates: results.length,
  duplicates: results.filter((result) => result.matchStatus === "duplicate").length,
  exactCanonicalUrlMatches: results.filter((result) => result.matchReason === "canonical-url").length,
  normalizedUrlMatches: results.filter((result) => result.matchReason === "normalized-url").length,
  possibleDuplicates: results.filter((result) => result.matchStatus === "possible-duplicate").length,
  similar: results.filter((result) => result.matchStatus === "possible-duplicate").length,
  newCandidates: results.filter((result) => result.matchStatus === "new").length,
  titleDifferenceMatches: results.filter((result) =>
    result.diffItems.some((item) => item.field === "title")
  ).length,
  diffItems: results.reduce((total, result) => total + result.diffItems.length, 0),
  contentFingerprints: results.filter((result) => /^sha256:[0-9a-f]{64}$/.test(result.contentFingerprint))
    .length,
};

const report = {
  reportType: "duplicate-diff-foundation",
  reportVersion: "1.0",
  generatedAt: options.date,
  executionStatus: "completed",
  generator: {
    script: "scripts/duplicate-diff-detection.mjs",
    version: "1.0",
  },
  input: {
    candidateReportFile: options.candidateReport,
    candidateCount: candidateReport.candidates.length,
    canonicalDataFiles: [options.canonicalNews],
    canonicalNewsCount: existingRecords.length,
  },
  mode: "report-only-duplicate-diff-detection",
  writes: {
    canonicalData: false,
    updateCandidates: false,
  },
  matchingPolicy: {
    primaryIdentityField: "canonicalUrl",
    secondaryIdentityField: "normalizedUrl",
    tertiarySignal: "title-similarity",
    titleSimilarityThreshold,
    contentFingerprintRole: "audit-signal",
  },
  fingerprintPolicy: {
    algorithm: "SHA-256",
    outputFormat: "sha256:<hex>",
    inputFields: ["normalizedCanonicalUrl", "normalizedTitle", "sourcePublishedAt"],
    urlNormalization: ["lowercase protocol", "lowercase host", "remove query", "remove fragment", "trim trailing slash"],
    titleNormalization: ["lowercase", "remove punctuation", "collapse whitespace"],
  },
  diffPolicy: {
    fieldOrder: ["title", "sourcePublishedAt", "canonicalUrl", "summary"],
  },
  summary,
  results,
};

writeJson(options.output, report);

console.log(
  `Duplicate diff detection wrote ${options.output}: ${summary.duplicates} duplicates / ${summary.possibleDuplicates} possible / ${summary.newCandidates} new.`
);
