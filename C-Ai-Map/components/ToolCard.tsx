import type { Tool } from "@/lib/types";

export default function ToolCard({ tool }: { tool: Tool }) {
  const benchmarkSource = tool.benchmarkSource ?? "公開Bmkサンプル値";
  const benchmarkCheckedAt = tool.benchmarkCheckedAt ?? tool.lastUpdated;

  return (
    <div className="rounded-lg border border-base-border bg-base-card p-4 transition-colors hover:border-accent/30">
      <div className="mb-1 flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink">{tool.name}</h3>
        <span className="shrink-0 rounded border border-base-border px-1.5 py-0.5 text-[11px] text-ink-muted">
          {tool.internalGrade}評価
        </span>
      </div>
      <p className="mb-2 text-xs text-accent">{tool.company}</p>
      <p className="mb-3 text-sm leading-relaxed text-ink-muted">{tool.description}</p>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {tool.tags.map((tag) => (
          <span
            key={tag}
            className="rounded-full bg-base-hover px-2 py-0.5 text-[11px] text-ink-muted"
          >
            {tag}
          </span>
        ))}
      </div>
      <div className="flex items-center justify-between text-xs text-ink-muted">
        <span>{tool.price}</span>
        <span>{tool.apiAvailable ? "API：あり" : "API：なし"}</span>
      </div>
      <p className="mt-2 text-[11px] text-ink-muted">
        公開Bmk：{benchmarkSource} / 確認日：{benchmarkCheckedAt}
      </p>
    </div>
  );
}
