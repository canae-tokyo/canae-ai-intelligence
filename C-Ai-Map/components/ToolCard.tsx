import type { Tool } from "@/lib/types";
import { getCanaeEvaluationForTool, getPrimaryBenchmarkForTool } from "@/lib/data";

export default function ToolCard({ tool }: { tool: Tool }) {
  const benchmark = getPrimaryBenchmarkForTool(tool);
  const evaluation = getCanaeEvaluationForTool(tool);
  const benchmarkSource = benchmark.benchmarkName;
  const benchmarkCheckedAt = benchmark.checkedAt ?? tool.lastUpdated;
  const qualityLabel =
    tool.dataQuality === "partial" ? "一部実データ" : tool.dataQuality === "verified" ? "実データ" : "サンプル";

  return (
    <div className="rounded-lg border border-base-border bg-base-card p-4 transition-colors hover:border-accent/30">
      <div className="mb-1 flex items-start justify-between gap-2">
        <h3 className="break-words text-base font-semibold text-ink sm:text-sm">{tool.name}</h3>
        <span className="shrink-0 rounded border border-base-border px-1.5 py-0.5 text-[11px] text-ink-muted">
          {evaluation.overallGrade}評価
        </span>
        <span className="shrink-0 rounded border border-signal-update/30 px-1.5 py-0.5 text-[11px] text-signal-update">
          {qualityLabel}
        </span>
      </div>
      <p className="mb-2 break-words text-sm text-accent sm:text-xs">{tool.company}</p>
      <p className="mb-3 text-base leading-relaxed text-ink-muted sm:text-sm">{tool.description}</p>
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
      <div className="grid gap-1 text-sm text-ink-muted sm:flex sm:items-center sm:justify-between sm:text-xs">
        <span>{tool.price}</span>
        <span>{tool.apiAvailable ? "API：あり" : "API：なし"}</span>
      </div>
      <p className="mt-2 text-[11px] text-ink-muted">
        公開Bmk：{benchmarkSource} / 確認日：{benchmarkCheckedAt}
        {benchmark.source === "tools-fallback" ? " / fallback" : ""}
      </p>
      {tool.dataQuality === "partial" && (
        <p className="mt-1 text-[11px] text-signal-update">
          公式メタ情報確認済み。ランキングスコアは未検証サンプル値を含みます。
        </p>
      )}
      <p className="mt-2 break-words text-[11px] text-ink-muted">
        公式：{tool.sourceUrl ?? tool.officialUrl}
      </p>
    </div>
  );
}
