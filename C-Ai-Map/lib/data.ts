import genresRaw from "@/data/genres.json";
import toolsRaw from "@/data/tools.json";
import newsRaw from "@/data/news.json";
import companiesRaw from "@/data/companies.json";
import type { Genre, Tool, NewsItem, CompanyNode, GenreId } from "./types";

export const genres = genresRaw as Genre[];
export const tools = toolsRaw as Tool[];
export const news = newsRaw as NewsItem[];
export const companies = companiesRaw as CompanyNode[];

export function getGenre(id: string): Genre | undefined {
  return genres.find((g) => g.id === id);
}

export function getToolsByGenre(id: GenreId): Tool[] {
  return tools.filter((t) => t.category === id);
}

export function getNewsByGenre(id: GenreId): NewsItem[] {
  return news
    .filter((n) => n.category === id)
    .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
}

export function getCompaniesByGenre(id: GenreId): CompanyNode[] {
  return companies.filter((c) => c.category === id);
}

export function getRecentNews(days: number = 7): NewsItem[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return news
    .filter((n) => new Date(n.publishedAt) >= cutoff)
    .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
}

export function getTopNewsToday(): NewsItem[] {
  const sorted = [...news].sort((a, b) =>
    a.publishedAt < b.publishedAt ? 1 : -1
  );
  const latestDate = sorted[0]?.publishedAt;
  return sorted.filter((n) => n.publishedAt === latestDate);
}

export function getLastUpdated(): string {
  const dates = [...tools.map((t) => t.lastUpdated), ...news.map((n) => n.publishedAt)];
  return dates.sort().reverse()[0] ?? "";
}

export function getToolById(id: string): Tool | undefined {
  return tools.find((t) => t.id === id);
}
