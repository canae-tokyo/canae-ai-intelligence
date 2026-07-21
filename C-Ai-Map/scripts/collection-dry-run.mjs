import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const priorityOrder = new Map([
  ["P0", 0],
  ["P1", 1],
  ["P2", 2],
]);

const defaultOptions = {
  date: "2026-07-21",
  output: "reports/collection-dry-run-report.json",
  priorities: ["P0", "P1", "P2"],
  cadences: ["daily", "weekly", "monthly"],
};

function parseList(value) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseArgs(argv) {
  const options = { ...defaultOptions };

  for (const arg of argv) {
    if (arg.startsWith("--date=")) options.date = arg.slice("--date=".length);
    if (arg.startsWith("--output=")) options.output = arg.slice("--output=".length);
    if (arg.startsWith("--priority=")) options.priorities = parseList(arg.slice("--priority=".length));
    if (arg.startsWith("--cadence=")) options.cadences = parseList(arg.slice("--cadence=".length));
  }

  return options;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(root, "data", file), "utf8"));
}

function writeJson(file, data) {
  const fullPath = path.join(root, file);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, `${JSON.stringify(data, null, 2)}\n`);
}

function isSelected(source, options) {
  return (
    source.enabled === true &&
    options.priorities.includes(source.priority) &&
    options.cadences.includes(source.cadence)
  );
}

function sortSources(left, right) {
  const priorityDiff =
    (priorityOrder.get(left.priority) ?? 99) - (priorityOrder.get(right.priority) ?? 99);
  if (priorityDiff !== 0) return priorityDiff;

  const companyDiff = left.company.localeCompare(right.company, "en");
  if (companyDiff !== 0) return companyDiff;

  return left.name.localeCompare(right.name, "en");
}

const options = parseArgs(process.argv.slice(2));
const sources = readJson("collection-sources.json");
const enabledSources = sources.filter((source) => source.enabled === true);
const selectedSources = sources.filter((source) => isSelected(source, options)).sort(sortSources);
const selectedIds = new Set(selectedSources.map((source) => source.id));
const skippedSources = sources
  .filter((source) => !selectedIds.has(source.id))
  .sort(sortSources)
  .map((source) => ({
    sourceId: source.id,
    name: source.name,
    company: source.company,
    priority: source.priority,
    cadence: source.cadence,
    enabled: source.enabled,
    reason:
      source.enabled !== true
        ? "disabled"
        : "filtered-out-by-priority-or-cadence",
  }));

const report = {
  reportType: "collection-helper-dry-run",
  reportVersion: "1.0",
  generatedAt: options.date,
  mode: "dry-run",
  externalNetwork: false,
  writes: {
    canonicalData: false,
    updateCandidates: false,
  },
  filters: {
    priorities: options.priorities,
    cadences: options.cadences,
  },
  summary: {
    totalSources: sources.length,
    enabledSources: enabledSources.length,
    selectedSources: selectedSources.length,
    skippedSources: skippedSources.length,
  },
  executionPlan: selectedSources.map((source, index) => ({
    order: index + 1,
    sourceId: source.id,
    name: source.name,
    company: source.company,
    sourceType: source.sourceType,
    url: source.url,
    category: source.category,
    priority: source.priority,
    cadence: source.cadence,
    collectionMethod: source.collectionMethod,
    action: "plan-only",
    reason: "enabled source selected by priority and cadence filters",
  })),
  skippedSources,
};

writeJson(options.output, report);

console.log(
  `Collection dry-run wrote ${options.output}: ${report.summary.selectedSources} selected / ${report.summary.skippedSources} skipped.`
);
