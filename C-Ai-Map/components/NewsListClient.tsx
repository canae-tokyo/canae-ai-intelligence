"use client";

import { useMemo, useState } from "react";
import type { NewsItem } from "@/lib/types";
import { genres } from "@/lib/data";
import NewsCard from "./NewsCard";

const IMPORTANCE_OPTIONS: { value: NewsItem["importance"] | "all"; label: string }[] = [
  { value: "all", label: "すべて" },
  { value: "high", label: "影響度：高" },
  { value: "medium", label: "影響度：中" },
  { value: "low", label: "影響度：低" },
];

export default function NewsListClient({ news }: { news: NewsItem[] }) {
  const [category, setCategory] = useState<string>("all");
  const [importance, setImportance] = useState<NewsItem["importance"] | "all">("all");
  const [keyword, setKeyword] = useState("");

  const filtered = useMemo(() => {
    return news
      .filter((n) => category === "all" || n.category === category)
      .filter((n) => importance === "all" || n.importance === importance)
      .filter(
        (n) =>
          keyword.trim() === "" ||
          n.title.includes(keyword) ||
          n.company.toLowerCase().includes(keyword.toLowerCase())
      )
      .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
  }, [news, category, importance, keyword]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-md border border-base-border bg-base-card px-3 py-1.5 text-sm text-ink focus:border-accent/50 focus:outline-none"
        >
          <option value="all">すべてのジャンル</option>
          {genres.map((g) => (
            <option key={g.id} value={g.id}>
              {g.label}
            </option>
          ))}
        </select>
        <div className="flex flex-wrap gap-1.5">
          {IMPORTANCE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setImportance(opt.value)}
              className={`rounded-full border px-3 py-1 text-xs ${
                importance === opt.value
                  ? "border-accent/50 bg-accent/10 text-accent"
                  : "border-base-border text-ink-muted"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="タイトル・企業名で検索"
          className="ml-auto w-full max-w-xs rounded-md border border-base-border bg-base-card px-3 py-1.5 text-sm text-ink placeholder:text-ink-muted focus:border-accent/50 focus:outline-none"
        />
      </div>

      <p className="text-xs text-ink-muted">{filtered.length}件のニュース</p>

      {filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed border-base-border p-6 text-center text-sm text-ink-muted">
          条件に一致するニュースがありません
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((n) => (
            <NewsCard key={n.id} item={n} showCategory />
          ))}
        </div>
      )}
    </div>
  );
}
