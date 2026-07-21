import genresRaw from "@/data/genres.json";
import toolsRaw from "@/data/tools.json";
import newsRaw from "@/data/news.json";
import companiesRaw from "@/data/companies.json";
import type { Genre, Tool, NewsItem, CompanyNode, GenreId } from "./types";

export const genres = genresRaw as Genre[];
export const allTools = toolsRaw as Tool[];
export const tools = allTools.filter((t) => (t.dataStatus ?? "verified") === "verified");
export const allNews = newsRaw as NewsItem[];
export const news = allNews;
export const companies = companiesRaw as CompanyNode[];

export const verifiedNews = allNews.filter((n) => n.status === "verified");
export const activeNews = allNews.filter((n) => n.status !== "archived");

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
