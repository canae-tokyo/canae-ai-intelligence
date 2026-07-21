import type { Tool } from "@/lib/types";
import { getCanaeEvaluationForTool, getPrimaryBenchmarkForTool, tools as allTools } from "@/lib/data";

const ROW = "flex justify-between gap-3 border-b border-base-border/60 py-2 text-sm";

export default function ToolDetailPanel({
  tool,
  onClose,
}: {
  tool: Tool | null;
  onClose: () => void;
}) {
  if (!tool) {
    return (
      <div className="flex min-h-32 items-center justify-center rounded-lg border border-dashed border-base-border p-6 text-center text-sm text-ink-muted lg:h-full">
        相関図のノードをクリックすると
        <br />
        詳細情報が下に表示されます
      </div>
    );
  }

  const competitors = allTools
    .filter((t) => t.category === tool.category && t.id !== tool.id)
    .sort((a, b) => b.scores.overall - a.scores.overall)
    .slice(0, 3);
  const benchmark = getPrimaryBenchmarkForTool(tool);
  const canaeEvaluation = getCanaeEvaluationForTool(tool);

  return (
    <div className="rounded-lg border border-base-border bg-base-card p-4">
      <div className="mb-3 flex items-start justify-between">
        <div className="min-w-0">
          <h3 className="break-words text-base font-semibold text-ink">{tool.name}</h3>
          <p className="break-words text-xs text-accent">{tool.company}</p>
        </div>
        <button
          onClick={onClose}
          className="min-h-11 shrink-0 rounded px-3 text-sm text-ink-muted hover:bg-base-hover hover:text-ink md:min-h-0 md:py-1 md:text-xs"
        >
          閉じる
        </button>
      </div>
      <p className="mb-4 text-sm leading-relaxed text-ink-muted">{tool.description}</p>

      <div className="mb-4">
        <div className={ROW}>
          <span className="text-ink-muted">運営企業</span>
          <span className="max-w-[58%] break-words text-right text-ink">{tool.company}</span>
        </div>
        <div className={ROW}>
          <span className="text-ink-muted">主な用途</span>
          <span className="max-w-[58%] break-words text-right text-ink">{tool.tags.join(" / ")}</span>
        </div>
        <div className={ROW}>
          <span className="text-ink-muted">料金</span>
          <span className="max-w-[58%] break-words text-right text-ink">{tool.price}</span>
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
          <span className="text-ink-muted">データ品質</span>
          <span className="text-ink">
            {tool.dataQuality === "partial" ? "一部実データ" : tool.dataQuality === "verified" ? "実データ" : "サンプル"}
          </span>
        </div>
        <div className={ROW}>
          <span className="text-ink-muted">公開Bmk順位</span>
          <span className="max-w-[58%] break-words text-right text-ink">
            {benchmark.rank ? `${benchmark.rank}位` : "—"}
            {benchmark.source === "tools-fallback" ? "（fallback / 未検証サンプル値を含む）" : ""}
          </span>
        </div>
        <div className={ROW}>
          <span className="text-ink-muted">公開Bmk出典</span>
          <span className="max-w-[58%] break-words text-right text-ink">
            {benchmark.benchmarkName}
            {benchmark.checkedAt ? ` / ${benchmark.checkedAt}` : ""}
          </span>
        </div>
        <div className="flex justify-between gap-3 py-1.5 text-sm">
          <span className="text-ink-muted">CANAE実務評価</span>
          <span className="font-semibold text-accent">{canaeEvaluation.overallGrade}</span>
        </div>
        <div className="flex justify-between gap-3 py-1.5 text-sm">
          <span className="text-ink-muted">CANAE評価ソース</span>
          <span className="max-w-[58%] break-words text-right text-ink-muted">
            {canaeEvaluation.source === "canae-evaluations" ? "分離評価データ" : "tools.json fallback"}
          </span>
        </div>
      </div>

      {competitors.length > 0 && (
        <div>
          <p className="mb-2 text-xs uppercase tracking-wide text-ink-muted">競合ツール</p>
          <ul className="space-y-1">
            {competitors.map((c) => (
              <li key={c.id} className="flex justify-between gap-3 text-sm">
                <span className="break-words text-ink">{c.name}</span>
                <span className="max-w-[48%] break-words text-right text-ink-muted">{c.company}</span>
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
