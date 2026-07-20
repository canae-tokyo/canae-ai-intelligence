import type { Tool } from "@/lib/types";
import { tools as allTools } from "@/lib/data";

const ROW = "flex justify-between gap-3 py-1.5 text-sm border-b border-base-border/60";

export default function ToolDetailPanel({
  tool,
  onClose,
}: {
  tool: Tool | null;
  onClose: () => void;
}) {
  if (!tool) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-base-border p-6 text-center text-sm text-ink-muted">
        相関図のノードをクリックすると
        <br />
        詳細情報がここに表示されます
      </div>
    );
  }

  const competitors = allTools
    .filter((t) => t.category === tool.category && t.id !== tool.id)
    .sort((a, b) => b.scores.overall - a.scores.overall)
    .slice(0, 3);

  return (
    <div className="rounded-lg border border-base-border bg-base-card p-4">
      <div className="mb-3 flex items-start justify-between">
        <div>
          <h3 className="text-base font-semibold text-ink">{tool.name}</h3>
          <p className="text-xs text-accent">{tool.company}</p>
        </div>
        <button
          onClick={onClose}
          className="rounded px-2 py-1 text-xs text-ink-muted hover:bg-base-hover hover:text-ink"
        >
          閉じる
        </button>
      </div>
      <p className="mb-4 text-sm leading-relaxed text-ink-muted">{tool.description}</p>

      <div className="mb-4">
        <div className={ROW}>
          <span className="text-ink-muted">運営企業</span>
          <span className="text-ink">{tool.company}</span>
        </div>
        <div className={ROW}>
          <span className="text-ink-muted">主な用途</span>
          <span className="text-ink">{tool.tags.join(" / ")}</span>
        </div>
        <div className={ROW}>
          <span className="text-ink-muted">料金</span>
          <span className="text-ink">{tool.price}</span>
        </div>
        <div className={ROW}>
          <span className="text-ink-muted">API有無</span>
          <span className="text-ink">{tool.apiAvailable ? "あり" : "なし"}</span>
        </div>
        <div className={ROW}>
          <span className="text-ink-muted">商用利用</span>
          <span className="text-ink">{tool.commercialUse}</span>
        </div>
        <div className={ROW}>
          <span className="text-ink-muted">最新更新</span>
          <span className="text-ink">{tool.lastUpdated}</span>
        </div>
        <div className={ROW}>
          <span className="text-ink-muted">公開Bmk順位</span>
          <span className="text-ink">{tool.benchmarkRank ? `${tool.benchmarkRank}位` : "—"}</span>
        </div>
        <div className="flex justify-between gap-3 py-1.5 text-sm">
          <span className="text-ink-muted">CANAE実務評価</span>
          <span className="font-semibold text-accent">{tool.internalGrade}</span>
        </div>
      </div>

      {competitors.length > 0 && (
        <div>
          <p className="mb-2 text-xs uppercase tracking-wide text-ink-muted">競合ツール</p>
          <ul className="space-y-1">
            {competitors.map((c) => (
              <li key={c.id} className="flex justify-between text-sm">
                <span className="text-ink">{c.name}</span>
                <span className="text-ink-muted">{c.company}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <a
        href={tool.officialUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-4 inline-block text-xs text-accent hover:underline"
      >
        公式サイトを見る ↗
      </a>
    </div>
  );
}
