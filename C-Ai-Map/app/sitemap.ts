import type { MetadataRoute } from "next";
import { genres, tools, verifiedNews, getLastUpdated } from "@/lib/data";

const productionUrl = "https://canae-ai-intelligence.canae-tokyo.workers.dev";

function getGenreLastUpdated(genreId: string): string {
  const dates = [
    ...tools.filter((t) => t.category === genreId).map((t) => t.lastUpdated),
    ...verifiedNews.filter((n) => n.category === genreId).map((n) => n.publishedAt),
  ];

  return dates.sort().reverse()[0] ?? getLastUpdated();
}

export default function sitemap(): MetadataRoute.Sitemap {
  const lastUpdated = getLastUpdated();

  return [
    {
      url: productionUrl,
      lastModified: lastUpdated,
      changeFrequency: "daily",
    },
    {
      url: `${productionUrl}/news`,
      lastModified: lastUpdated,
      changeFrequency: "daily",
    },
    ...genres.map((genre) => ({
      url: `${productionUrl}/genre/${genre.id}`,
      lastModified: getGenreLastUpdated(genre.id),
      changeFrequency: "weekly" as const,
    })),
  ];
}
