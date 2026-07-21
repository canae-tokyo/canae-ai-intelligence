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
  assert(toolIds.has(benchmark.toolId), `benchmark toolId not found: ${benchmark.id} -> ${benchmark.toolId}`);
  assert(isoDate.test(benchmark.verifiedAt), `benchmark verifiedAt must be YYYY-MM-DD: ${benchmark.id}`);
  assertUrl(benchmark.sourceUrl, `benchmark sourceUrl ${benchmark.id}`);
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
  assert(toolIds.has(evaluation.toolId), `canae evaluation toolId not found: ${evaluation.id} -> ${evaluation.toolId}`);
  assert(isoDate.test(evaluation.evaluatedAt), `canae evaluation evaluatedAt must be YYYY-MM-DD: ${evaluation.id}`);
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
