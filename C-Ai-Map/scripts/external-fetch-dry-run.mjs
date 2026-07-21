import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const defaultOptions = {
  date: null,
  output: "reports/external-fetch-report.local.json",
  sourceIds: ["source-openai-news", "source-github-changelog"],
  timeoutMs: 10000,
  maxBytes: 250000,
};
const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const allowedContentTypes = new Set([
  "text/html",
  "application/xml",
  "text/xml",
  "application/rss+xml",
  "application/atom+xml",
]);

function todayIsoDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function fail(message) {
  console.error(`External fetch dry-run failed: ${message}`);
  process.exit(1);
}

function parseList(value) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parsePositiveInteger(value, label) {
  if (!/^\d+$/.test(value)) fail(`${label} must be a positive integer`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) fail(`${label} must be a positive integer`);
  return parsed;
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

function parseArgs(argv) {
  const options = { ...defaultOptions };

  for (const arg of argv) {
    if (arg.startsWith("--date=")) {
      options.date = arg.slice("--date=".length);
    } else if (arg.startsWith("--output=")) {
      options.output = arg.slice("--output=".length);
    } else if (arg.startsWith("--source-id=")) {
      options.sourceIds = parseList(arg.slice("--source-id=".length));
    } else if (arg.startsWith("--timeout-ms=")) {
      options.timeoutMs = parsePositiveInteger(arg.slice("--timeout-ms=".length), "--timeout-ms");
    } else if (arg.startsWith("--max-bytes=")) {
      options.maxBytes = parsePositiveInteger(arg.slice("--max-bytes=".length), "--max-bytes");
    } else {
      fail(`unknown argument: ${arg}`);
    }
  }

  options.date = options.date ?? todayIsoDate();
  validateOptions(options);

  return options;
}

function validateOutputPath(output) {
  const resolved = path.resolve(root, output);
  const allowedRoot = path.resolve(root, "reports");

  if (path.isAbsolute(output)) fail("--output must be relative to the project root");
  if (resolved !== allowedRoot && !resolved.startsWith(`${allowedRoot}${path.sep}`)) {
    fail("--output must stay under reports/");
  }
}

function validateOptions(options) {
  if (!isRealIsoDate(options.date)) fail("--date must be a real YYYY-MM-DD date");
  if (options.sourceIds.length === 0) fail("--source-id list must not be empty");
  const duplicateSourceIds = options.sourceIds.filter(
    (sourceId, index) => options.sourceIds.indexOf(sourceId) !== index
  );
  if (duplicateSourceIds.length > 0) {
    fail(`--source-id list must not contain duplicates: ${[...new Set(duplicateSourceIds)].join(", ")}`);
  }
  validateOutputPath(options.output);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(root, "data", file), "utf8"));
}

function writeJson(file, data) {
  const fullPath = path.join(root, file);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, `${JSON.stringify(data, null, 2)}\n`);
}

function selectSources(sources, sourceIds) {
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const selected = [];

  for (const sourceId of sourceIds) {
    const source = sourceById.get(sourceId);
    if (!source) fail(`sourceId not found: ${sourceId}`);
    if (source.enabled !== true) fail(`source is disabled: ${sourceId}`);
    selected.push(source);
  }

  return selected;
}

function classifyStatus(status) {
  if (status >= 200 && status < 300) return "ok";
  if (status === 404) return "not-found";
  if (status === 429) return "rate-limited";
  if (status >= 300 && status < 400) return "redirect";
  if (status >= 400 && status < 500) return "client-error";
  if (status >= 500) return "server-error";
  return "unknown";
}

function hostFromUrl(value) {
  if (!value) return null;
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

function isHttpsUrl(value) {
  if (!value) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeContentType(value) {
  return value?.split(";")[0]?.trim().toLowerCase() ?? null;
}

function isAllowedContentType(value) {
  const normalized = normalizeContentType(value);
  return normalized !== null && allowedContentTypes.has(normalized);
}

function redirectSafetyFor(requestedUrl, finalUrl) {
  const requestedHost = hostFromUrl(requestedUrl);
  const finalHost = hostFromUrl(finalUrl);
  const finalHttps = isHttpsUrl(finalUrl);
  const crossDomainRedirect = requestedHost !== null && finalHost !== null && requestedHost !== finalHost;

  if (!finalHttps) return "non-https-final-url";
  if (crossDomainRedirect) return "cross-domain-manual-review";
  return "same-domain";
}

async function readBodyWithLimit(response, maxBytes) {
  const reader = response.body?.getReader();
  if (!reader) return { sizeBytes: 0, truncatedByLimit: false };

  let sizeBytes = 0;
  let truncatedByLimit = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      sizeBytes += value.byteLength;
      if (sizeBytes > maxBytes) {
        truncatedByLimit = true;
        await reader.cancel();
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }

  return { sizeBytes, truncatedByLimit };
}

async function fetchSource(source, options) {
  const controller = new AbortController();
  const startedAt = Date.now();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const response = await fetch(source.url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "CANAE-AI-Intelligence/1.1.2 external-fetch-foundation",
        accept: "text/html, application/rss+xml, application/xml;q=0.9, */*;q=0.8",
      },
    });
    const body = await readBodyWithLimit(response, options.maxBytes);
    const requestedHost = hostFromUrl(source.url);
    const finalHost = hostFromUrl(response.url);
    const contentType = response.headers.get("content-type");
    const contentTypeAllowed = isAllowedContentType(contentType);
    const redirectSafety = redirectSafetyFor(source.url, response.url);
    const crossDomainRedirect =
      requestedHost !== null && finalHost !== null && requestedHost !== finalHost;
    const finalHttps = isHttpsUrl(response.url);
    const httpOk = response.ok;
    const policyOk = finalHttps && !crossDomainRedirect && contentTypeAllowed;

    return {
      sourceId: source.id,
      name: source.name,
      company: source.company,
      sourceType: source.sourceType,
      requestedUrl: source.url,
      requestedHost,
      finalUrl: response.url,
      finalHost,
      redirected: response.url !== source.url,
      crossDomainRedirect,
      redirectSafety,
      finalHttps,
      status: response.status,
      statusText: response.statusText,
      statusClass: classifyStatus(response.status),
      httpOk,
      ok: httpOk && policyOk,
      contentType,
      contentTypeAllowed,
      contentLengthHeader: response.headers.get("content-length"),
      sizeBytes: body.sizeBytes,
      truncatedByLimit: body.truncatedByLimit,
      durationMs: Date.now() - startedAt,
      error: null,
    };
  } catch (error) {
    return {
      sourceId: source.id,
      name: source.name,
      company: source.company,
      sourceType: source.sourceType,
      requestedUrl: source.url,
      requestedHost: hostFromUrl(source.url),
      finalUrl: null,
      finalHost: null,
      redirected: false,
      crossDomainRedirect: false,
      redirectSafety: "not-evaluated",
      finalHttps: false,
      status: null,
      statusText: null,
      statusClass: error.name === "AbortError" ? "timeout" : "fetch-error",
      httpOk: false,
      ok: false,
      contentType: null,
      contentTypeAllowed: false,
      contentLengthHeader: null,
      sizeBytes: 0,
      truncatedByLimit: false,
      durationMs: Date.now() - startedAt,
      error: {
        name: error.name,
        message: error.message,
      },
    };
  } finally {
    clearTimeout(timeout);
  }
}

function determineExecutionStatus(results) {
  if (results.some((result) => result.statusClass === "timeout" || result.statusClass === "fetch-error")) {
    return "completed-with-fetch-errors";
  }
  if (results.some((result) => result.status !== null && !result.httpOk)) {
    return "completed-with-http-errors";
  }
  if (
    results.some(
      (result) =>
        result.redirectSafety !== "same-domain" ||
        result.contentTypeAllowed !== true ||
        result.truncatedByLimit
    )
  ) {
    return "completed-with-policy-warnings";
  }
  return "completed";
}

const options = parseArgs(process.argv.slice(2));
const sources = readJson("collection-sources.json");
const selectedSources = selectSources(sources, options.sourceIds);
const fetchResults = [];

for (const source of selectedSources) {
  fetchResults.push(await fetchSource(source, options));
}

const report = {
  reportType: "external-fetch-foundation",
  reportVersion: "1.0",
  generatedAt: options.date,
  executionStatus: determineExecutionStatus(fetchResults),
  exitPolicy: "report-generation-success",
  generator: {
    script: "scripts/external-fetch-dry-run.mjs",
    version: "1.0",
  },
  input: {
    sourceFile: "data/collection-sources.json",
    requestedSourceIds: options.sourceIds,
    selectedSourceCount: selectedSources.length,
  },
  mode: "read-only-fetch",
  externalNetwork: true,
  writes: {
    canonicalData: false,
    updateCandidates: false,
  },
  options: {
    timeoutMs: options.timeoutMs,
    maxBytes: options.maxBytes,
  },
  summary: {
    selectedSources: selectedSources.length,
    ok: fetchResults.filter((result) => result.ok).length,
    failed: fetchResults.filter((result) => !result.ok).length,
    redirected: fetchResults.filter((result) => result.redirected).length,
    rateLimited: fetchResults.filter((result) => result.status === 429).length,
    notFound: fetchResults.filter((result) => result.status === 404).length,
    timedOut: fetchResults.filter((result) => result.statusClass === "timeout").length,
  },
  results: fetchResults,
};

writeJson(options.output, report);

console.log(
  `External fetch dry-run wrote ${options.output}: ${report.summary.ok} ok / ${report.summary.failed} failed.`
);
