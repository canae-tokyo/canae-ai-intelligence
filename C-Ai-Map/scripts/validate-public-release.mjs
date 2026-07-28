import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const outDir = path.join(rootDir, "out");
const dataDir = path.join(rootDir, "data");

const PRODUCTION_URL = "https://canae-ai-intelligence.canae-tokyo.workers.dev";

const PUBLIC_PAGES = [
  { url: "/", file: "index.html" },
  { url: "/news", file: "news.html" },
  { url: "/genre/model", file: path.join("genre", "model.html") },
  { url: "/genre/coding", file: path.join("genre", "coding.html") },
  { url: "/genre/image", file: path.join("genre", "image.html") },
  { url: "/genre/video", file: path.join("genre", "video.html") },
  { url: "/genre/audio", file: path.join("genre", "audio.html") },
  { url: "/genre/agent", file: path.join("genre", "agent.html") },
];

const INTERIM_VALUES = [
  "s365963w",
  "young-frost-5d7d",
  "b204fefa1ddd1f78ad153aa9dc99e1c63e5da188f69ae27dd6780c42924e0179",
  "canae-ai-intelligence.canae-ai-intelligence.workers.dev",
];

const readJson = (file) => JSON.parse(fs.readFileSync(path.join(dataDir, file), "utf8"));

function listFilesRecursive(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    return entry.isDirectory() ? listFilesRecursive(fullPath) : [fullPath];
  });
}

function readAll(paths) {
  return paths.map((filePath) => fs.readFileSync(filePath, "utf8")).join("\n");
}

// --- Pre-build data checks ---

const tools = readJson("tools.json");
const news = readJson("news.json");
const benchmarks = readJson("benchmarks.json");
const canaeEvaluations = readJson("canae-evaluations.json");
const updateCandidates = readJson("update-candidates.json");

for (const tool of tools) {
  if ((tool.dataStatus ?? "verified") !== "verified") continue;
  assert.ok(
    tool.dataStatus === undefined || tool.dataStatus === "verified",
    `public tool must be verified: ${tool.id}`
  );
}

const publicNews = news.filter((item) => item.status === "verified");
assert.ok(publicNews.length > 0, "at least one verified news item is expected for public release");
for (const item of news) {
  assert.ok(
    item.status === "verified" || item.status === "draft" || item.status === "archived",
    `unexpected news status: ${item.id}`
  );
}

const publicBenchmarks = benchmarks.filter((b) => b.dataStatus === "verified");
for (const benchmark of publicBenchmarks) {
  assert.equal(benchmark.dataStatus, "verified", `public benchmark must be verified: ${benchmark.id}`);
}

const publicEvaluations = canaeEvaluations.filter((e) => e.reviewStatus === "approved");
for (const evaluation of publicEvaluations) {
  assert.equal(evaluation.reviewStatus, "approved", `public CANAE evaluation must be approved: ${evaluation.id}`);
}

assert.ok(
  updateCandidates.every((c) => c.reviewStatus !== "verified"),
  "update-candidates.json must never carry a verified reviewStatus (candidates are never a publish target themselves)"
);

assert.deepEqual(
  new Set(news.map((n) => n.id)).size,
  news.length,
  "news id must be unique"
);
assert.deepEqual(
  new Set(news.map((n) => n.sourceUrl)).size,
  news.length,
  "news sourceUrl must be unique"
);
assert.deepEqual(new Set(tools.map((t) => t.id)).size, tools.length, "tool id must be unique");

const newsPageSource = fs.readFileSync(path.join(rootDir, "app", "news", "page.tsx"), "utf8");
assert.ok(
  newsPageSource.includes("verifiedNews") && !/\bactiveNews\b/.test(newsPageSource),
  "app/news/page.tsx must render verifiedNews only, not activeNews or allNews"
);

// --- Post-build checks ---

if (!fs.existsSync(outDir)) {
  throw new Error("out/ directory not found. Run `npm run build` before `npm run validate:public-release`.");
}

for (const page of PUBLIC_PAGES) {
  const filePath = path.join(outDir, page.file);
  assert.ok(fs.existsSync(filePath), `${page.url} must exist in build output (${page.file})`);

  const html = fs.readFileSync(filePath, "utf8");

  assert.ok(
    !/<meta name="robots" content="[^"]*noindex/.test(html),
    `${page.url} must not carry a noindex robots meta tag`
  );
  assert.ok(
    !/<meta name="googlebot" content="[^"]*noindex/.test(html),
    `${page.url} must not carry a noindex googlebot meta tag`
  );

  const canonicalMatch = html.match(/<link rel="canonical" href="([^"]+)"/);
  assert.ok(canonicalMatch, `${page.url} must have a canonical link tag`);
  assert.ok(
    canonicalMatch[1].startsWith(PRODUCTION_URL),
    `${page.url} canonical must point to the production URL, got: ${canonicalMatch[1]}`
  );

  const titleMatch = html.match(/<title>([^<]*)<\/title>/);
  assert.ok(titleMatch && titleMatch[1].trim().length > 0, `${page.url} must have a non-empty title`);

  const descriptionMatch = html.match(/<meta name="description" content="([^"]*)"/);
  assert.ok(
    descriptionMatch && descriptionMatch[1].trim().length > 0,
    `${page.url} must have a non-empty description`
  );

  assert.ok(!html.includes("社内向け") && !html.includes("社内限定"), `${page.url} must not carry internal-only wording`);
}

const publicHtmlAndChunks = listFilesRecursive(outDir).filter(
  (file) =>
    !file.includes(`${path.sep}internal${path.sep}`) &&
    (file.endsWith(".html") || file.endsWith(".js") || file.endsWith(".txt"))
);
const publicSource = readAll(publicHtmlAndChunks);

for (const interimValue of INTERIM_VALUES) {
  assert.ok(!publicSource.includes(interimValue), `interim Cloudflare value "${interimValue}" must not appear in public build output`);
}
assert.ok(
  !publicSource.includes("GITHUB_PROMOTION_TOKEN") && !/gh[pousr]_[A-Za-z0-9_]{20,}/.test(publicSource),
  "GitHub token / secret name must never appear in public build output"
);
assert.ok(
  !/cf-access-jwt-assertion|cf_authorization=/i.test(publicSource),
  "Access JWT header/cookie names must not appear in public build output"
);

const internalHtmlPath = path.join(outDir, "internal", "review-candidates.html");
assert.ok(fs.existsSync(internalHtmlPath), "out/internal/review-candidates.html must exist after build");
const internalHtml = fs.readFileSync(internalHtmlPath, "utf8");
assert.ok(
  /<meta name="robots" content="[^"]*noindex/.test(internalHtml),
  "internal review-candidates page must keep a noindex robots meta tag"
);
assert.ok(
  /<meta name="googlebot" content="[^"]*noindex/.test(internalHtml),
  "internal review-candidates page must keep a noindex googlebot meta tag"
);

const robotsTxtPath = path.join(outDir, "robots.txt");
assert.ok(fs.existsSync(robotsTxtPath), "out/robots.txt must exist after build");
const robotsTxt = fs.readFileSync(robotsTxtPath, "utf8");
assert.ok(/Allow:\s*\//.test(robotsTxt), "robots.txt must allow crawling of public routes");
assert.ok(/Disallow:\s*\/internal\//.test(robotsTxt), "robots.txt must disallow /internal/");
assert.ok(
  robotsTxt.includes(`${PRODUCTION_URL}/sitemap.xml`),
  "robots.txt must reference the production sitemap URL"
);

const sitemapPath = path.join(outDir, "sitemap.xml");
assert.ok(fs.existsSync(sitemapPath), "out/sitemap.xml must exist after build");
const sitemapXml = fs.readFileSync(sitemapPath, "utf8");
const sitemapLocs = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

assert.deepEqual(
  new Set(sitemapLocs),
  new Set(PUBLIC_PAGES.map((page) => (page.url === "/" ? PRODUCTION_URL : `${PRODUCTION_URL}${page.url}`))),
  "sitemap.xml must contain exactly the 8 public pages, nothing more or less"
);
for (const loc of sitemapLocs) {
  assert.ok(!loc.includes("/internal"), `sitemap must not include internal URLs: ${loc}`);
  assert.ok(!loc.includes("localhost"), `sitemap must not include localhost URLs: ${loc}`);
  for (const interimValue of INTERIM_VALUES) {
    assert.ok(!loc.includes(interimValue), `sitemap must not include interim environment values: ${loc}`);
  }
}

{
  const indexHtml = fs.readFileSync(path.join(outDir, "index.html"), "utf8");
  assert.ok(
    /<meta name="google-site-verification" content="[^"]+"/.test(indexHtml),
    "Google Search Console verification meta tag must be present on the public homepage"
  );
}

console.log("Public release validation passed.");
