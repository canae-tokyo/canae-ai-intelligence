import type { MetadataRoute } from "next";

const productionUrl = "https://canae-ai-intelligence.canae-tokyo.workers.dev";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/internal/", "/internal/api/"],
    },
    sitemap: `${productionUrl}/sitemap.xml`,
    host: productionUrl,
  };
}
