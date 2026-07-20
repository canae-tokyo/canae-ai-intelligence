"use client";

import { useMemo, useState } from "react";
import type { Genre, Tool, NewsItem, CompanyNode } from "@/lib/types";
import RankingTable from "./RankingTable";
import CorrelationDiagram from "./CorrelationDiagram";
import ToolDetailPanel from "./ToolDetailPanel";
import ToolCard from "./ToolCard";
import NewsCard from "./NewsCard";

export default function GenreView({
  genre,
  tools,
  news,
  companies,
}: {
  genre: Genre;
  tools: Tool[];
  news: NewsItem[];
  companies: CompanyNode[];
}) {
  const [keyword, setKeyword] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [selectedToolId, setSelectedToolId] = useState<string | null>(null);

  const allTags = useMemo(
    () => Array.from(new Set(tools.flatMap((t) => t.tags))).sort(),
    [tools]
  );

  const filteredTools = useMemo(() => {
    return tools.filter((t) => {
      const matchesKeyword =
        keyword.trim() === "" ||
        t.name.toLowerCase().includes(keyword.toLowerCase()) ||
        t.company.toLowerCase().includes(keyword.toLowerCase()) ||
        t.description.includes(keyword);
      const matchesTag = !activeTag || t.tags.includes(activeTag);
      return matchesKeyword && matchesTag;
    });
  }, [tools, keyword, activeTag]);

  const selectedTool = tools.find((t) => t.id === selectedToolId) ?? null;

  return (
    <div className="min-w-0 space-y-8">
      <div>
        <h1 className="break-words text-xl font-semibold text-ink">{genre.label}</h1>
        <p className="mt-1 break-words text-base leading-relaxed text-ink-muted md:text-sm">{genre.description}</p>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-muted">
          相関図
        </h2>
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <CorrelationDiagram data={companies} onSelectTool={setSelectedToolId} />
          <ToolDetailPanel tool={selectedTool} onClose={() => setSelectedToolId(null)} />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-muted">
          ランキング
        </h2>
        <RankingTable tools={tools} />
      </section>

      <section>
        <div className="mb-3 grid gap-3 sm:flex sm:flex-wrap sm:items-center">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
            主要ツール一覧
          </h2>
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="ツール名・企業名で検索"
            className="min-h-11 w-full rounded-md border border-base-border bg-base-card px-3 text-base text-ink placeholder:text-ink-muted focus:border-accent/50 focus:outline-none sm:ml-auto sm:max-w-xs sm:text-sm"
          />
        </div>
        <div className="mb-4 flex flex-wrap gap-1.5">
          <button
            onClick={() => setActiveTag(null)}
            className={`min-h-11 rounded-full border px-3 text-sm md:min-h-0 md:py-1 md:text-xs ${
              !activeTag
                ? "border-accent/50 bg-accent/10 text-accent"
                : "border-base-border text-ink-muted"
            }`}
          >
            すべて
          </button>
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => setActiveTag(tag === activeTag ? null : tag)}
              className={`min-h-11 rounded-full border px-3 text-sm md:min-h-0 md:py-1 md:text-xs ${
                activeTag === tag
                  ? "border-accent/50 bg-accent/10 text-accent"
                  : "border-base-border text-ink-muted"
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
        {filteredTools.length === 0 ? (
          <p className="rounded-lg border border-dashed border-base-border p-6 text-center text-sm text-ink-muted">
            条件に一致するツールがありません
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filteredTools.map((t) => (
              <ToolCard key={t.id} tool={t} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-muted">
          最新ニュース・更新履歴
        </h2>
        {news.length === 0 ? (
          <p className="rounded-lg border border-dashed border-base-border p-6 text-center text-sm text-ink-muted">
            このジャンルのニュースはまだありません
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {news.map((n) => (
              <NewsCard key={n.id} item={n} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
