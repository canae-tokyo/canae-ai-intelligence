import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const readJson = (file) =>
  JSON.parse(fs.readFileSync(path.join(root, "data", file), "utf8"));

const tools = readJson("tools.json");
const benchmarks = readJson("benchmarks.json");
const canaeEvaluations = readJson("canae-evaluations.json");

const errors = [];
const toolIds = new Set(tools.map((tool) => tool.id));
const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const benchmarkStatuses = new Set(["draft", "verified", "archived"]);
const dataQualities = new Set(["sample", "partial", "verified"]);
const scoreUnits = new Set(["percent", "score", "rank", "points"]);
const benchmarkSourceTypes = new Set(["official", "third-party", "legacy"]);
const grades = new Set(["S", "A", "B", "C"]);
const reviewStatuses = new Set(["draft", "review", "approved", "archived"]);

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function assertUnique(items, getKey, label) {
  const seen = new Set();
  for (const item of items) {
    const key = getKey(item);
    assert(!seen.has(key), `${label} duplicate: ${key}`);
    seen.add(key);
  }
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

assertUnique(benchmarks, (item) => item.id, "benchmark id");
assertUnique(
  benchmarks,
  (item) => `${item.toolId}:${item.benchmarkName}:${item.benchmarkVersion}`,
  "benchmark tool/name/version"
);
assertUnique(canaeEvaluations, (item) => item.id, "canae evaluation id");
assertUnique(
  canaeEvaluations,
  (item) => `${item.toolId}:${item.evaluationVersion}:${item.useCase}`,
  "canae evaluation tool/version/useCase"
);

for (const benchmark of benchmarks) {
  assertRequiredString(benchmark.id, `benchmark id`);
  assertRequiredString(benchmark.toolId, `benchmark toolId ${benchmark.id}`);
  assertRequiredString(benchmark.benchmarkName, `benchmark benchmarkName ${benchmark.id}`);
  assertRequiredString(benchmark.benchmarkVersion, `benchmark benchmarkVersion ${benchmark.id}`);
  assertRequiredString(benchmark.scope, `benchmark scope ${benchmark.id}`);
  assertRequiredString(benchmark.sourceUrl, `benchmark sourceUrl ${benchmark.id}`);
  assertRequiredString(benchmark.verifiedAt, `benchmark verifiedAt ${benchmark.id}`);
  assertRequiredString(benchmark.comparability, `benchmark comparability ${benchmark.id}`);
  assert(toolIds.has(benchmark.toolId), `benchmark toolId not found: ${benchmark.id} -> ${benchmark.toolId}`);
  assert(isoDate.test(benchmark.verifiedAt), `benchmark verifiedAt must be YYYY-MM-DD: ${benchmark.id}`);
  assertUrl(benchmark.sourceUrl, `benchmark sourceUrl ${benchmark.id}`);
  assert(benchmarkStatuses.has(benchmark.dataStatus), `benchmark dataStatus is invalid: ${benchmark.id}`);
  if (benchmark.dataQuality) {
    assert(dataQualities.has(benchmark.dataQuality), `benchmark dataQuality is invalid: ${benchmark.id}`);
  }
  if (benchmark.score != null) {
    assert(typeof benchmark.score === "number", `benchmark score must be number or null: ${benchmark.id}`);
    assert(scoreUnits.has(benchmark.scoreUnit), `benchmark scoreUnit is required when score exists: ${benchmark.id}`);
  }
  if (benchmark.rank != null) {
    assert(Number.isInteger(benchmark.rank) && benchmark.rank > 0, `benchmark rank must be a positive integer or null: ${benchmark.id}`);
  }
  assert(benchmarkSourceTypes.has(benchmark.sourceType), `benchmark sourceType is invalid: ${benchmark.id}`);
  assert(
    benchmark.comparability && benchmark.comparability.length >= 20,
    `benchmark comparability note is required: ${benchmark.id}`
  );
  assert(
    !/canae/i.test(benchmark.benchmarkName),
    `CANAE evaluation must not be registered as a public benchmark: ${benchmark.id}`
  );
}

for (const evaluation of canaeEvaluations) {
  assertRequiredString(evaluation.id, `canae evaluation id`);
  assertRequiredString(evaluation.toolId, `canae evaluation toolId ${evaluation.id}`);
  assertRequiredString(evaluation.evaluationVersion, `canae evaluation evaluationVersion ${evaluation.id}`);
  assertRequiredString(evaluation.useCase, `canae evaluation useCase ${evaluation.id}`);
  assertRequiredString(evaluation.evidence, `canae evaluation evidence ${evaluation.id}`);
  assertRequiredString(evaluation.evaluatedAt, `canae evaluation evaluatedAt ${evaluation.id}`);
  assertRequiredString(evaluation.evaluatedBy, `canae evaluation evaluatedBy ${evaluation.id}`);
  assert(toolIds.has(evaluation.toolId), `canae evaluation toolId not found: ${evaluation.id} -> ${evaluation.toolId}`);
  assert(isoDate.test(evaluation.evaluatedAt), `canae evaluation evaluatedAt must be YYYY-MM-DD: ${evaluation.id}`);
  assert(grades.has(evaluation.overallGrade), `canae evaluation overallGrade is invalid: ${evaluation.id}`);
  assert(reviewStatuses.has(evaluation.reviewStatus), `canae evaluation reviewStatus is invalid: ${evaluation.id}`);
  assert(
    evaluation.evaluatedBy === "CANAE",
    `canae evaluation evaluatedBy must remain CANAE: ${evaluation.id}`
  );
  for (const [key, value] of Object.entries(evaluation.scores)) {
    assert(
      Number.isInteger(value) && value >= 1 && value <= 5,
      `canae evaluation score must be an integer from 1 to 5: ${evaluation.id}.${key}`
    );
  }
}

if (errors.length > 0) {
  console.error("Data validation failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `Data validation passed: ${benchmarks.length} benchmarks, ${canaeEvaluations.length} CANAE evaluations.`
);
