import genresRaw from "@/data/genres.json";
import toolsRaw from "@/data/tools.json";
import newsRaw from "@/data/news.json";
import companiesRaw from "@/data/companies.json";
import benchmarksRaw from "@/data/benchmarks.json";
import canaeEvaluationsRaw from "@/data/canae-evaluations.json";
import type {
  BenchmarkRecord,
  BenchmarkSummary,
  CanaeEvaluationRecord,
  CanaeEvaluationSummary,
  Genre,
  Tool,
  NewsItem,
  CompanyNode,
  GenreId,
} from "./types";

export const genres = genresRaw as Genre[];
export const allTools = toolsRaw as Tool[];
export const tools = allTools.filter((t) => (t.dataStatus ?? "verified") === "verified");
export const allNews = newsRaw as NewsItem[];
export const news = allNews;
export const companies = companiesRaw as CompanyNode[];
export const allBenchmarks = benchmarksRaw as BenchmarkRecord[];
export const allCanaeEvaluations = canaeEvaluationsRaw as CanaeEvaluationRecord[];

export const verifiedNews = allNews.filter((n) => n.status === "verified");
export const activeNews = allNews.filter((n) => n.status !== "archived");
export const verifiedBenchmarks = allBenchmarks.filter((b) => b.dataStatus === "verified");
export const approvedCanaeEvaluations = allCanaeEvaluations.filter(
  (evaluation) => evaluation.reviewStatus === "approved"
);

export function getGenre(id: string): Genre | undefined {
  return genres.find((g) => g.id === id);
}

export function getToolsByGenre(id: GenreId): Tool[] {
  return tools.filter((t) => t.category === id);
}

export function getNewsByGenre(id: GenreId): NewsItem[] {
  return verifiedNews
    .filter((n) => n.category === id)
    .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
}

export function getCompaniesByGenre(id: GenreId): CompanyNode[] {
  const visibleToolIds = new Set(tools.map((tool) => tool.id));

  return companies
    .filter((c) => c.category === id)
    .map((company) => ({
      ...company,
      children: company.children
        ?.map((model) => ({
          ...model,
          children: model.children?.filter(
            (product) => !product.toolId || visibleToolIds.has(product.toolId)
          ),
        }))
        .filter((model) => (model.children?.length ?? 0) > 0),
    }))
    .filter((company) => (company.children?.length ?? 0) > 0);
}

export function getRecentNews(days: number = 7): NewsItem[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return verifiedNews
    .filter((n) => new Date(n.publishedAt) >= cutoff)
    .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
}

export function getTopNewsToday(): NewsItem[] {
  const sorted = [...verifiedNews].sort((a, b) =>
    a.publishedAt < b.publishedAt ? 1 : -1
  );
  const latestDate = sorted[0]?.publishedAt;
  return sorted.filter((n) => n.publishedAt === latestDate);
}

export function getLastUpdated(): string {
  const dates = [...tools.map((t) => t.lastUpdated), ...activeNews.map((n) => n.publishedAt)];
  return dates.sort().reverse()[0] ?? "";
}

export function getToolById(id: string): Tool | undefined {
  return tools.find((t) => t.id === id);
}

export function getBenchmarksByToolId(toolId: string): BenchmarkRecord[] {
  return verifiedBenchmarks
    .filter((benchmark) => benchmark.toolId === toolId)
    .sort((a, b) => (a.verifiedAt < b.verifiedAt ? 1 : -1));
}

export function getCanaeEvaluationByToolId(toolId: string): CanaeEvaluationRecord | undefined {
  return approvedCanaeEvaluations
    .filter((evaluation) => evaluation.toolId === toolId)
    .sort((a, b) => (a.evaluatedAt < b.evaluatedAt ? 1 : -1))[0];
}

export function getPrimaryBenchmarkForTool(tool: Tool): BenchmarkSummary {
  const benchmark = getBenchmarksByToolId(tool.id)[0];

  if (benchmark) {
    return {
      source: "benchmarks",
      benchmarkName: benchmark.benchmarkName,
      score: benchmark.score,
      scoreUnit: benchmark.scoreUnit,
      rank: benchmark.rank,
      sourceUrl: benchmark.sourceUrl,
      sourceType: benchmark.sourceType,
      checkedAt: benchmark.verifiedAt,
      comparability: benchmark.comparability,
      notes: benchmark.notes,
    };
  }

  if (tool.benchmarkSource || tool.benchmarkRank || tool.benchmarkCheckedAt) {
    return {
      source: "tools-fallback",
      benchmarkName: tool.benchmarkSource ?? "サンプル値（未検証）",
      rank: tool.benchmarkRank,
      checkedAt: tool.benchmarkCheckedAt ?? tool.lastUpdated,
      notes: "tools.json legacy benchmark fields are used as fallback until benchmarks.json has a verified record.",
    };
  }

  return {
    source: "unset",
    benchmarkName: "未設定",
    rank: null,
  };
}

export function getCanaeEvaluationForTool(tool: Tool): CanaeEvaluationSummary {
  const evaluation = getCanaeEvaluationByToolId(tool.id);

  if (evaluation) {
    return {
      source: "canae-evaluations",
      overallGrade: evaluation.overallGrade,
      evaluatedAt: evaluation.evaluatedAt,
      evaluatedBy: evaluation.evaluatedBy,
      reviewStatus: evaluation.reviewStatus,
      useCase: evaluation.useCase,
      evidence: evaluation.evidence,
      notes: evaluation.notes,
    };
  }

  return {
    source: "tools-fallback",
    overallGrade: tool.internalGrade,
    evaluatedAt: tool.lastUpdated,
    notes: "tools.json internalGrade is used as fallback until canae-evaluations.json has an approved record.",
  };
}
