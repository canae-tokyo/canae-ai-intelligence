import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";

const root = process.cwd();
const defaultOptions = {
  date: null,
  candidateStore: "data/update-candidates.json",
  newsFile: "data/news.json",
  output: "reports/verified-promotion-report.local.json",
  candidateId: null,
  newsId: null,
  company: null,
  category: null,
  importance: null,
  summary: null,
  impact: null,
  verifiedBy: "CANAE/Codex",
  apply: false,
};
const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const categories = new Set(["model", "coding", "image", "video", "audio", "agent"]);
const importances = new Set(["high", "medium", "low"]);
const hashPattern = /^sha256:[0-9a-f]{64}$/;

function todayIsoDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function fail(message) {
  console.error(`Verified promotion failed: ${message}`);
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

function requireSingleLine(value, label, maxLength = 500) {
  if (!value || value.trim() !== value || value.length > maxLength || /[\r\n\t]/.test(value)) {
    fail(`${label} is required and must be a single line up to ${maxLength} characters`);
  }
}

function parseArgs(argv) {
  const options = { ...defaultOptions };

  for (const arg of argv) {
    if (arg.startsWith("--date=")) {
      options.date = arg.slice("--date=".length);
    } else if (arg.startsWith("--candidate-store=")) {
      options.candidateStore = arg.slice("--candidate-store=".length);
    } else if (arg.startsWith("--news-file=")) {
      options.newsFile = arg.slice("--news-file=".length);
    } else if (arg.startsWith("--output=")) {
      options.output = arg.slice("--output=".length);
    } else if (arg.startsWith("--candidate-id=")) {
      options.candidateId = arg.slice("--candidate-id=".length);
    } else if (arg.startsWith("--news-id=")) {
      options.newsId = arg.slice("--news-id=".length);
    } else if (arg.startsWith("--company=")) {
      options.company = arg.slice("--company=".length);
    } else if (arg.startsWith("--category=")) {
      options.category = arg.slice("--category=".length);
    } else if (arg.startsWith("--importance=")) {
      options.importance = arg.slice("--importance=".length);
    } else if (arg.startsWith("--summary=")) {
      options.summary = arg.slice("--summary=".length);
    } else if (arg.startsWith("--impact=")) {
      options.impact = arg.slice("--impact=".length);
    } else if (arg.startsWith("--verified-by=")) {
      options.verifiedBy = arg.slice("--verified-by=".length);
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
  validatePath(options.candidateStore, "--candidate-store", ["data", "reports"]);
  validatePath(options.newsFile, "--news-file", ["data", "reports"]);
  validatePath(options.output, "--output", ["reports"]);
  requireSingleLine(options.candidateId, "--candidate-id", 160);
  requireSingleLine(options.newsId, "--news-id", 80);
  requireSingleLine(options.company, "--company", 80);
  requireSingleLine(options.summary, "--summary", 500);
  requireSingleLine(options.impact, "--impact", 500);
  requireSingleLine(options.verifiedBy, "--verified-by", 80);
  if (!/^news-\d{4}-\d{2}-\d{2}-\d{3}$/.test(options.newsId)) {
    fail("--news-id must use news-YYYY-MM-DD-NNN");
  }
  if (!categories.has(options.category)) fail("--category is invalid");
  if (!importances.has(options.importance)) fail("--importance is invalid");
}

function readText(file) {
  try {
    return fs.readFileSync(path.join(root, file), "utf8");
  } catch (error) {
    fail(`failed to read ${file}: ${error.message}`);
  }
}

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch (error) {
    fail(`failed to parse JSON ${label}: ${error.message}`);
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

function assertArray(value, label) {
  if (!Array.isArray(value)) fail(`${label} must be a JSON array`);
}

function assertHttpsUrl(value, label) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") fail(`${label} must use https`);
  } catch {
    fail(`${label} must be a valid URL`);
  }
}

function validateNewsRecord(record) {
  const required = [
    "id",
    "title",
    "company",
    "category",
    "importance",
    "publishedAt",
    "summary",
    "impact",
    "sourceType",
    "sourceUrl",
    "sourceCheckedAt",
    "verifiedAt",
    "status",
    "dataQuality",
    "verifiedBy",
  ];

  for (const field of required) {
    if (typeof record[field] !== "string" || record[field].trim().length === 0) {
      return `${field}-missing`;
    }
  }
  if (!/^news-\d{4}-\d{2}-\d{2}-\d{3}$/.test(record.id)) return "invalid-news-id";
  if (!categories.has(record.category)) return "invalid-category";
  if (!importances.has(record.importance)) return "invalid-importance";
  if (!isRealIsoDate(record.publishedAt)) return "invalid-publishedAt";
  if (!isRealIsoDate(record.sourceCheckedAt)) return "invalid-sourceCheckedAt";
  if (!isRealIsoDate(record.verifiedAt)) return "invalid-verifiedAt";
  if (record.sourceType !== "official") return "sourceType-not-official";
  if (record.status !== "verified") return "status-not-verified";
  if (record.dataQuality !== "verified") return "dataQuality-not-verified";
  try {
    assertHttpsUrl(record.sourceUrl, "sourceUrl");
  } catch {
    return "invalid-sourceUrl";
  }
  if (!Array.isArray(record.changeLog) || record.changeLog.length === 0) return "changeLog-missing";
  return null;
}

function makeNewsRecord(candidate, options) {
  return {
    id: options.newsId,
    title: candidate.title,
    company: options.company,
    category: options.category,
    importance: options.importance,
    publishedAt: candidate.sourcePublishedAt,
    summary: options.summary,
    impact: options.impact,
    sourceType: "official",
    sourceUrl: candidate.canonicalUrl,
    sourceCheckedAt: options.date,
    verifiedAt: options.date,
    status: "verified",
    dataQuality: "verified",
    verifiedBy: options.verifiedBy,
    changeLog: [
      {
        date: options.date,
        type: "promoted",
        summary: `Promoted from update candidate ${candidate.id}.`,
        actor: options.verifiedBy,
      },
    ],
  };
}

function promoteCandidate(candidate, newsRecord, options) {
  const existingChangeLog = Array.isArray(candidate.changeLog) ? candidate.changeLog : [];

  return {
    ...candidate,
    promotedRecordType: "news",
    promotedRecordId: newsRecord.id,
    promotedAt: options.date,
    changeLog: [
      ...existingChangeLog,
      {
        date: options.date,
        type: "promoted",
        summary: `Promoted to news record ${newsRecord.id}.`,
        actor: options.verifiedBy,
      },
    ],
  };
}

function promotionDecision(candidateStore, newsItems, options) {
  const index = candidateStore.findIndex((candidate) => candidate.id === options.candidateId);
  if (index === -1) return { action: "rejected", reason: "candidate-not-found", updatedCandidates: candidateStore };

  const candidate = candidateStore[index];
  if (candidate.candidateType !== "news") {
    return { action: "rejected", reason: "candidate-type-not-news", candidate, updatedCandidates: candidateStore };
  }
  if (candidate.reviewStatus !== "accepted" || candidate.reviewDecision !== "approved") {
    return { action: "rejected", reason: "candidate-not-approved", candidate, updatedCandidates: candidateStore };
  }
  if (candidate.promotedRecordType || candidate.promotedRecordId || candidate.promotedAt) {
    return { action: "rejected", reason: "candidate-already-promoted", candidate, updatedCandidates: candidateStore };
  }
  if (candidate.suggestedStatus !== "draft") {
    return { action: "rejected", reason: "suggested-status-not-draft", candidate, updatedCandidates: candidateStore };
  }
  if (!candidate.sourcePublishedAt || !isRealIsoDate(candidate.sourcePublishedAt)) {
    return { action: "rejected", reason: "source-published-at-missing", candidate, updatedCandidates: candidateStore };
  }
  assertHttpsUrl(candidate.canonicalUrl, "candidate canonicalUrl");

  const newsRecord = makeNewsRecord(candidate, options);
  const validationError = validateNewsRecord(newsRecord);
  if (validationError) {
    return { action: "rejected", reason: validationError, candidate, newsRecord, updatedCandidates: candidateStore };
  }

  const normalizedCandidateUrl = normalizeUrl(newsRecord.sourceUrl);
  if (!normalizedCandidateUrl) {
    return { action: "rejected", reason: "invalid-normalized-source-url", candidate, newsRecord, updatedCandidates: candidateStore };
  }

  const newsIds = new Set(newsItems.map((item) => item.id));
  const newsUrls = new Set(newsItems.map((item) => item.sourceUrl));
  const normalizedNewsUrls = new Set(newsItems.map((item) => normalizeUrl(item.sourceUrl)).filter(Boolean));

  if (newsIds.has(newsRecord.id)) {
    return { action: "rejected", reason: "duplicate-news-id", candidate, newsRecord, updatedCandidates: candidateStore };
  }
  if (newsUrls.has(newsRecord.sourceUrl)) {
    return { action: "rejected", reason: "duplicate-source-url", candidate, newsRecord, updatedCandidates: candidateStore };
  }
  if (normalizedNewsUrls.has(normalizedCandidateUrl)) {
    return { action: "rejected", reason: "duplicate-normalized-source-url", candidate, newsRecord, updatedCandidates: candidateStore };
  }

  const promotedCandidate = promoteCandidate(candidate, newsRecord, options);
  const updatedCandidates = candidateStore.map((item, itemIndex) => (itemIndex === index ? promotedCandidate : item));

  return {
    action: "promoted",
    reason: "approved-candidate-promoted",
    candidate,
    newsRecord,
    updatedCandidates,
    updatedNews: [newsRecord, ...newsItems],
  };
}

function writeJsonPairAtomic(candidateStoreFile, newsFile, updatedCandidates, updatedNews, expectedCandidateHash, expectedNewsHash) {
  const candidatePath = path.join(root, candidateStoreFile);
  const newsPath = path.join(root, newsFile);
  const candidateTmp = path.join(path.dirname(candidatePath), `.tmp-${path.basename(candidateStoreFile)}-${process.pid}`);
  const newsTmp = path.join(path.dirname(newsPath), `.tmp-${path.basename(newsFile)}-${process.pid}`);
  const candidateBackup = path.join(path.dirname(candidatePath), `.bak-${path.basename(candidateStoreFile)}-${process.pid}`);
  const newsBackup = path.join(path.dirname(newsPath), `.bak-${path.basename(newsFile)}-${process.pid}`);
  const candidatePayload = `${JSON.stringify(updatedCandidates, null, 2)}\n`;
  const newsPayload = `${JSON.stringify(updatedNews, null, 2)}\n`;

  const currentCandidateText = fs.readFileSync(candidatePath, "utf8");
  const currentNewsText = fs.readFileSync(newsPath, "utf8");
  if (sha256(currentCandidateText) !== expectedCandidateHash) {
    fail("--candidate-store changed after it was read; aborting write");
  }
  if (sha256(currentNewsText) !== expectedNewsHash) {
    fail("--news-file changed after it was read; aborting write");
  }

  fs.writeFileSync(candidateTmp, candidatePayload);
  fs.writeFileSync(newsTmp, newsPayload);
  parseJson(fs.readFileSync(candidateTmp, "utf8"), candidateTmp);
  parseJson(fs.readFileSync(newsTmp, "utf8"), newsTmp);

  fs.copyFileSync(candidatePath, candidateBackup);
  fs.copyFileSync(newsPath, newsBackup);

  try {
    fs.renameSync(candidateTmp, candidatePath);
    fs.renameSync(newsTmp, newsPath);
  } catch (error) {
    if (fs.existsSync(candidateBackup)) fs.copyFileSync(candidateBackup, candidatePath);
    if (fs.existsSync(newsBackup)) fs.copyFileSync(newsBackup, newsPath);
    fail(`atomic pair write failed and rollback was attempted: ${error.message}`);
  } finally {
    for (const file of [candidateTmp, newsTmp, candidateBackup, newsBackup]) {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  }
}

const options = parseArgs(process.argv.slice(2));
const candidateStoreText = readText(options.candidateStore);
const newsText = readText(options.newsFile);
const candidateStore = parseJson(candidateStoreText, options.candidateStore);
const newsItems = parseJson(newsText, options.newsFile);
assertArray(candidateStore, "--candidate-store");
assertArray(newsItems, "--news-file");

const result = promotionDecision(candidateStore, newsItems, options);
const storeChanged = options.apply && result.action === "promoted";
const inputCandidateHash = sha256(candidateStoreText);
const inputNewsHash = sha256(newsText);
const outputCandidateText = `${JSON.stringify(result.updatedCandidates ?? candidateStore, null, 2)}\n`;
const outputNewsText = `${JSON.stringify(result.updatedNews ?? newsItems, null, 2)}\n`;

if (storeChanged) {
  writeJsonPairAtomic(
    options.candidateStore,
    options.newsFile,
    result.updatedCandidates,
    result.updatedNews,
    inputCandidateHash,
    inputNewsHash
  );
}

const report = {
  reportType: "verified-promotion-foundation",
  reportVersion: "1.0",
  generatedAt: options.date,
  executionStatus: result.action === "promoted" ? "completed" : "completed-with-rejection",
  generator: {
    script: "scripts/verified-promotion.mjs",
    version: "1.0",
  },
  input: {
    candidateStoreFile: options.candidateStore,
    newsFile: options.newsFile,
    candidateCount: candidateStore.length,
    newsCount: newsItems.length,
    candidateId: options.candidateId,
    newsId: options.newsId,
  },
  mode: "verified-news-promotion",
  writes: {
    updateCandidates: storeChanged,
    news: storeChanged,
    otherCanonicalData: false,
  },
  promotionPolicy: {
    requiredCandidateType: "news",
    requiredReviewDecision: "approved",
    requiredReviewStatus: "accepted",
    target: "news.json",
    forcedStatus: "verified",
    forcedDataQuality: "verified",
    duplicateKeys: ["newsId", "sourceUrl", "normalizedSourceUrl"],
    applyRequired: true,
    twoFileAtomicWrite: true,
    rollbackOnFailure: true,
    preWriteHashRecheck: true,
    rejectAlreadyPromoted: true,
    rejectNonApprovedCandidates: true,
    rejectAutoImpactGeneration: true,
  },
  storeAudit: {
    apply: options.apply,
    storeChanged,
    previousCandidateCount: candidateStore.length,
    updatedCandidateCount: storeChanged ? result.updatedCandidates.length : candidateStore.length,
    previousNewsCount: newsItems.length,
    updatedNewsCount: storeChanged ? result.updatedNews.length : newsItems.length,
    candidateInputHash: inputCandidateHash,
    candidateOutputHash: storeChanged ? sha256(outputCandidateText) : inputCandidateHash,
    newsInputHash: inputNewsHash,
    newsOutputHash: storeChanged ? sha256(outputNewsText) : inputNewsHash,
  },
  output: {
    candidateStoreFile: options.candidateStore,
    newsFile: options.newsFile,
    reportFile: options.output,
  },
  summary: {
    promoted: result.action === "promoted" ? 1 : 0,
    rejected: result.action === "rejected" ? 1 : 0,
    storeChanged,
  },
  result: {
    candidateId: options.candidateId,
    newsId: result.newsRecord?.id ?? options.newsId,
    sourceUrl: result.newsRecord?.sourceUrl ?? result.candidate?.canonicalUrl ?? null,
    normalizedSourceUrl: normalizeUrl(result.newsRecord?.sourceUrl ?? result.candidate?.canonicalUrl ?? ""),
    action: result.action,
    reason: result.reason,
    status: result.action === "promoted" ? "verified" : null,
    dataQuality: result.action === "promoted" ? "verified" : null,
    promotedRecordType: result.action === "promoted" ? "news" : null,
    promotedRecordId: result.action === "promoted" ? result.newsRecord.id : null,
    promotedAt: result.action === "promoted" ? options.date : null,
  },
};

writeJson(options.output, report);

if (!hashPattern.test(report.storeAudit.candidateInputHash) || !hashPattern.test(report.storeAudit.newsInputHash)) {
  fail("internal hash generation failed");
}

console.log(
  `Verified promotion ${storeChanged ? "applied" : "dry-run"} ${options.output}: ${report.summary.promoted} promoted / ${report.summary.rejected} rejected.`
);
