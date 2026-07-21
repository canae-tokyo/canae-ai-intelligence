import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const defaultOptions = {
  date: null,
  input: "reports/external-fetch-report.example.json",
  htmlInput: "reports/external-fetch-github-changelog.example.html",
  output: "reports/candidate-generation-report.local.json",
  sourceId: "source-github-changelog",
  maxCandidates: 10,
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
  console.error(`Candidate generation failed: ${message}`);
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

function parsePositiveInteger(value, label) {
  if (!/^\d+$/.test(value)) fail(`${label} must be a positive integer`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) fail(`${label} must be a positive integer`);
  return parsed;
}

function parseArgs(argv) {
  const options = { ...defaultOptions };

  for (const arg of argv) {
    if (arg.startsWith("--date=")) {
      options.date = arg.slice("--date=".length);
    } else if (arg.startsWith("--input=")) {
      options.input = arg.slice("--input=".length);
    } else if (arg.startsWith("--html-input=")) {
      options.htmlInput = arg.slice("--html-input=".length);
    } else if (arg.startsWith("--output=")) {
      options.output = arg.slice("--output=".length);
    } else if (arg.startsWith("--source-id=")) {
      options.sourceId = arg.slice("--source-id=".length);
    } else if (arg.startsWith("--max-candidates=")) {
      options.maxCandidates = parsePositiveInteger(
        arg.slice("--max-candidates=".length),
        "--max-candidates"
      );
    } else {
      fail(`unknown argument: ${arg}`);
    }
  }

  options.date = options.date ?? todayIsoDate();
  validateOptions(options);

  return options;
}

function validateProjectPath(value, label, requiredPrefix) {
  const resolved = path.resolve(root, value);
  const allowedRoot = path.resolve(root, requiredPrefix);

  if (path.isAbsolute(value)) fail(`${label} must be relative to the project root`);
  if (resolved !== allowedRoot && !resolved.startsWith(`${allowedRoot}${path.sep}`)) {
    fail(`${label} must stay under ${requiredPrefix}/`);
  }
}

function validateOptions(options) {
  if (!isRealIsoDate(options.date)) fail("--date must be a real YYYY-MM-DD date");
  if (options.sourceId !== "source-github-changelog") {
    fail("--source-id is limited to source-github-changelog in this foundation");
  }
  validateProjectPath(options.input, "--input", "reports");
  validateProjectPath(options.htmlInput, "--html-input", "reports");
  validateProjectPath(options.output, "--output", "reports");
}

function readText(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function readJson(file) {
  return JSON.parse(readText(file));
}

function writeJson(file, data) {
  const fullPath = path.join(root, file);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, `${JSON.stringify(data, null, 2)}\n`);
}

function decodeHtml(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function stripTags(value) {
  return decodeHtml(value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
}

function normalizeUrl(value, baseUrl) {
  try {
    const url = new URL(decodeHtml(value), baseUrl);
    url.hash = "";
    url.search = "";
    if (url.protocol !== "https:") return null;
    if (url.hostname !== "github.blog") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function extractDateFromSnippet(snippet, canonicalUrl) {
  const pathDateMatch = canonicalUrl.match(/\/changelog\/(\d{4})-(\d{2})-(\d{2})-/i);
  if (pathDateMatch) {
    const value = `${pathDateMatch[1]}-${pathDateMatch[2]}-${pathDateMatch[3]}`;
    if (isRealIsoDate(value)) return value;
  }

  const datetimeMatch = snippet.match(/datetime=["'](\d{4}-\d{2}-\d{2})/i);
  if (datetimeMatch?.[1] && isRealIsoDate(datetimeMatch[1])) return datetimeMatch[1];

  return null;
}

function extractTitleFromSnippet(snippet) {
  const headingLinkMatch = snippet.match(/<h[1-4][^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h[1-4]>/i);
  if (headingLinkMatch?.[1]) return stripTags(headingLinkMatch[1]);

  const ariaMatch = snippet.match(/aria-label=["']([^"']+)["']/i);
  if (ariaMatch?.[1]) return decodeHtml(ariaMatch[1]).trim();

  const titleMatch = snippet.match(/title=["']([^"']+)["']/i);
  if (titleMatch?.[1]) return decodeHtml(titleMatch[1]).trim();

  const linkTextMatch = snippet.match(/<a[^>]*>([\s\S]*?)<\/a>/i);
  if (linkTextMatch?.[1]) return stripTags(linkTextMatch[1]);

  return "";
}

function extractTitleFromAnchor(anchorHtml) {
  return stripTags(anchorHtml);
}

function makeCandidateId(sourceId, canonicalUrl, index) {
  const slug =
    canonicalUrl
      .replace(/^https:\/\/github\.blog\/changelog\//, "")
      .replace(/\/$/, "")
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase()
      .slice(0, 80) || `candidate-${index + 1}`;

  return `candidate-news-${sourceId.replace(/^source-/, "")}-${slug}`;
}

function extractGithubChangelogCandidates(html, source, detectedAt, maxCandidates) {
  const linkPattern = /<a\b[^>]*href=["']([^"']*\/changelog\/[^"']+)["'][^>]*>[\s\S]*?<\/a>/gi;
  const seen = new Set();
  const candidates = [];
  const extractionIssues = [];

  for (const match of html.matchAll(linkPattern)) {
    const canonicalUrl = normalizeUrl(match[1], source.finalUrl);
    if (!canonicalUrl) continue;
    if (!/^https:\/\/github\.blog\/changelog\/\d{4}-\d{2}-\d{2}-/.test(canonicalUrl)) continue;
    if (seen.has(canonicalUrl)) continue;

    seen.add(canonicalUrl);
    const start = Math.max(0, match.index - 1200);
    const end = Math.min(html.length, match.index + match[0].length + 1200);
    const snippet = html.slice(start, end);
    const title = extractTitleFromAnchor(match[0]) || extractTitleFromSnippet(snippet);
    const sourcePublishedAt = extractDateFromSnippet(snippet, canonicalUrl);
    const missingFields = [];

    if (!title) missingFields.push("title");
    if (!sourcePublishedAt) missingFields.push("sourcePublishedAt");

    const candidate = {
      id: makeCandidateId(source.sourceId, canonicalUrl, candidates.length),
      sourceId: source.sourceId,
      candidateType: "news",
      title,
      sourceUrl: canonicalUrl,
      canonicalUrl,
      sourcePublishedAt,
      detectedAt,
      summary: "",
      summarySource: "extracted",
      diffSummary: "Candidate generated from GitHub Changelog HTML. No canonical data was changed.",
      reviewStatus: "pending",
      suggestedStatus: "draft",
      duplicateCheck: {
        status: "not-run",
        matchedIds: [],
      },
      promotedRecordType: null,
      promotedRecordId: null,
      promotedAt: null,
      missingFields,
    };

    if (missingFields.length > 0) {
      extractionIssues.push({
        canonicalUrl,
        missingFields,
      });
    }

    candidates.push(candidate);
    if (candidates.length >= maxCandidates) break;
  }

  return { candidates, extractionIssues };
}

function findSourceResult(report, sourceId) {
  return report.results?.find((result) => result.sourceId === sourceId) ?? null;
}

function excludedSources(report, selectedSourceId) {
  return (report.results ?? [])
    .filter((result) => result.sourceId !== selectedSourceId)
    .map((result) => ({
      sourceId: result.sourceId,
      status: result.status,
      statusClass: result.statusClass,
      ok: result.ok,
      reason: result.ok ? "not-selected" : "not-eligible-fetch-result",
    }));
}

const options = parseArgs(process.argv.slice(2));
const fetchReport = readJson(options.input);
const sourceResult = findSourceResult(fetchReport, options.sourceId);

if (!sourceResult) fail(`source result not found in input report: ${options.sourceId}`);
if (!sourceResult.ok || sourceResult.status !== 200) {
  fail(`source result is not eligible for candidate generation: ${options.sourceId}`);
}
if (sourceResult.truncatedByLimit === true) {
  fail(`source result is truncated and cannot be used for candidate generation: ${options.sourceId}`);
}

const html = readText(options.htmlInput);
const { candidates, extractionIssues } = extractGithubChangelogCandidates(
  html,
  sourceResult,
  options.date,
  options.maxCandidates
);
const duplicateUrls = candidates
  .map((candidate) => candidate.canonicalUrl)
  .filter((url, index, urls) => urls.indexOf(url) !== index);

const report = {
  reportType: "candidate-generation-foundation",
  reportVersion: "1.0",
  generatedAt: options.date,
  executionStatus: candidates.length > 0 ? "completed" : "completed-with-no-candidates",
  generator: {
    script: "scripts/candidate-generation.mjs",
    version: "1.0",
  },
  input: {
    fetchReportFile: options.input,
    htmlInputFile: options.htmlInput,
    sourceId: options.sourceId,
    sourceStatus: sourceResult.status,
    sourceFinalUrl: sourceResult.finalUrl,
  },
  mode: "report-only-candidate-generation",
  writes: {
    canonicalData: false,
    updateCandidates: false,
  },
  options: {
    maxCandidates: options.maxCandidates,
  },
  summary: {
    candidates: candidates.length,
    duplicateCanonicalUrls: [...new Set(duplicateUrls)].length,
    candidatesWithMissingFields: candidates.filter((candidate) => candidate.missingFields.length > 0)
      .length,
    extractionIssues: extractionIssues.length,
  },
  excludedSources: excludedSources(fetchReport, options.sourceId),
  candidates,
  extractionIssues,
};

writeJson(options.output, report);

console.log(
  `Candidate generation wrote ${options.output}: ${report.summary.candidates} candidates / ${report.summary.candidatesWithMissingFields} with missing fields.`
);
