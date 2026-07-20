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

const STATUS_OPTIONS: { value: NewsItem["status"] | "all"; label: string }[] = [
  { value: "all", label: "すべての状態" },
  { value: "verified", label: "Verified" },
  { value: "draft", label: "Draft" },
  { value: "archived", label: "Archived" },
];

export default function NewsListClient({ news }: { news: NewsItem[] }) {
  const [category, setCategory] = useState<string>("all");
  const [importance, setImportance] = useState<NewsItem["importance"] | "all">("all");
  const [status, setStatus] = useState<NewsItem["status"] | "all">("all");
  const [keyword, setKeyword] = useState("");

  const filtered = useMemo(() => {
    return news
      .filter((n) => category === "all" || n.category === category)
      .filter((n) => importance === "all" || n.importance === importance)
      .filter((n) => status === "all" || n.status === status)
      .filter(
        (n) =>
          keyword.trim() === "" ||
          n.title.includes(keyword) ||
          n.company.toLowerCase().includes(keyword.toLowerCase())
      )
      .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
  }, [news, category, importance, status, keyword]);

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:flex sm:flex-wrap sm:items-center">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="min-h-11 w-full rounded-md border border-base-border bg-base-card px-3 text-base text-ink focus:border-accent/50 focus:outline-none sm:w-auto sm:text-sm"
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
              className={`min-h-11 rounded-full border px-3 text-sm md:min-h-0 md:py-1 md:text-xs ${
                importance === opt.value
                  ? "border-accent/50 bg-accent/10 text-accent"
                  : "border-base-border text-ink-muted"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as NewsItem["status"] | "all")}
          className="min-h-11 w-full rounded-md border border-base-border bg-base-card px-3 text-base text-ink focus:border-accent/50 focus:outline-none sm:w-auto sm:text-sm"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="タイトル・企業名で検索"
          className="min-h-11 w-full rounded-md border border-base-border bg-base-card px-3 text-base text-ink placeholder:text-ink-muted focus:border-accent/50 focus:outline-none sm:ml-auto sm:max-w-xs sm:text-sm"
        />
      </div>

      <p className="text-xs text-ink-muted">{filtered.length}件のニュース</p>

      {filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed border-base-border p-6 text-center text-sm text-ink-muted">
          条件に一致するニュースがありません
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((n) => (
            <NewsCard key={n.id} item={n} showCategory />
          ))}
        </div>
      )}
    </div>
  );
}
