"use client";

import { useMemo, useState } from "react";
import { getCanaeEvaluationForTool, getPrimaryBenchmarkForTool } from "@/lib/data";
import type { Tool } from "@/lib/types";

const AXES: { key: keyof Tool["scores"]; label: string; method: string }[] = [
  { key: "overall", label: "総合評価", method: "自社用途を基準" },
  { key: "performance", label: "性能", method: "公開ベンチマーク" },
  { key: "japanese", label: "日本語", method: "自社検証" },
  { key: "usability", label: "操作性", method: "自社評価" },
  { key: "speed", label: "速度", method: "公開値・体感" },
  { key: "automation", label: "自動化", method: "API・MCP・外部連携" },
];

const GRADE_STYLE: Record<string, string> = {
  S: "text-accent",
  A: "text-signal-new",
  B: "text-signal-update",
  C: "text-ink-muted",
};

const mobileRow = "flex justify-between gap-3 border-t border-base-border/60 py-2 text-sm";

export default function RankingTable({ tools }: { tools: Tool[] }) {
  const [axis, setAxis] = useState<(typeof AXES)[number]["key"]>("overall");

  const sorted = useMemo(
    () => [...tools].sort((a, b) => b.scores[axis] - a.scores[axis]),
    [tools, axis]
  );

  const activeAxis = AXES.find((a) => a.key === axis)!;

  return (
    <div className="rounded-lg border border-base-border bg-base-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-base-border p-3">
        {AXES.map((a) => (
          <button
            key={a.key}
            onClick={() => setAxis(a.key)}
            className={`min-h-11 rounded-full border px-3 text-sm transition-colors md:min-h-0 md:py-1 md:text-xs ${
              axis === a.key
                ? "border-accent/50 bg-accent/10 text-accent"
                : "border-base-border text-ink-muted hover:text-ink"
            }`}
          >
            {a.label}
          </button>
        ))}
        <span className="w-full text-xs text-ink-muted md:ml-auto md:w-auto">
          評価方法：{activeAxis.method} / v1.1.0では公式メタ情報を先行投入。スコアは未検証サンプル値を含みます。
        </span>
      </div>
      <div className="hidden md:block md:overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs text-ink-muted">
              <th className="px-4 py-2 font-medium">順位</th>
              <th className="px-4 py-2 font-medium">ツール</th>
              <th className="px-4 py-2 font-medium">運営企業</th>
              <th className="px-4 py-2 font-medium">{activeAxis.label}</th>
              <th className="px-4 py-2 font-medium">公開Bmk順位</th>
              <th className="px-4 py-2 font-medium">公開Bmk出典</th>
              <th className="px-4 py-2 font-medium">自社評価</th>
              <th className="px-4 py-2 font-medium">価格</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((t, i) => {
              const benchmark = getPrimaryBenchmarkForTool(t);
              const evaluation = getCanaeEvaluationForTool(t);
              const benchmarkSource = benchmark.benchmarkName;
              const benchmarkCheckedAt = benchmark.checkedAt ?? t.lastUpdated;
              return (
                <tr
                  key={t.id}
                  className="border-t border-base-border hover:bg-base-hover"
                >
                  <td className="px-4 py-2 text-ink-muted">{i + 1}</td>
                  <td className="px-4 py-2 font-medium text-ink">{t.name}</td>
                  <td className="px-4 py-2 text-ink-muted">{t.company}</td>
                  <td className="px-4 py-2 text-ink">{t.scores[axis]}</td>
                  <td className="px-4 py-2 text-ink-muted">
                    {benchmark.rank ? `${benchmark.rank}位` : "—"}
                  </td>
                  <td className="px-4 py-2 text-ink-muted">
                    {benchmarkSource}
                    {benchmark.source === "tools-fallback" && (
                      <span className="ml-1 text-[11px] text-signal-update">fallback</span>
                    )}
                    <span className="ml-1 text-[11px]">({benchmarkCheckedAt})</span>
                  </td>
                  <td className={`px-4 py-2 font-semibold ${GRADE_STYLE[evaluation.overallGrade]}`}>
                    {evaluation.overallGrade}
                  </td>
                  <td className="px-4 py-2 text-ink-muted">{t.price}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="space-y-3 p-3 md:hidden">
        {sorted.map((t, i) => {
          const benchmark = getPrimaryBenchmarkForTool(t);
          const evaluation = getCanaeEvaluationForTool(t);
          const benchmarkSource = benchmark.benchmarkName;
          const benchmarkCheckedAt = benchmark.checkedAt ?? t.lastUpdated;
          return (
            <article key={t.id} className="rounded-md border border-base-border bg-base-bg/40 p-3">
              <div className="flex items-start gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-accent/40 text-sm font-semibold text-accent">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="break-words text-base font-semibold text-ink">{t.name}</h3>
                  <p className="break-words text-sm text-ink-muted">{t.company}</p>
                </div>
                <span className={`shrink-0 text-base font-semibold ${GRADE_STYLE[evaluation.overallGrade]}`}>
                  {evaluation.overallGrade}
                </span>
              </div>
              <div className="mt-3">
                <div className={mobileRow}>
                  <span className="text-ink-muted">{activeAxis.label}</span>
                  <span className="font-medium text-ink">{t.scores[axis]}</span>
                </div>
                <div className={mobileRow}>
                  <span className="text-ink-muted">公開Bmk順位</span>
                  <span className="text-ink-muted">{benchmark.rank ? `${benchmark.rank}位` : "—"}</span>
                </div>
                <div className={mobileRow}>
                  <span className="text-ink-muted">公開Bmk出典</span>
                  <span className="max-w-[58%] break-words text-right text-ink-muted">
                    {benchmarkSource}
                    {benchmark.source === "tools-fallback" && (
                      <span className="ml-1 text-signal-update">fallback</span>
                    )}
                    <br />
                    <span className="text-[11px]">確認日：{benchmarkCheckedAt}</span>
                  </span>
                </div>
                <div className={mobileRow}>
                  <span className="text-ink-muted">価格</span>
                  <span className="max-w-[58%] break-words text-right text-ink-muted">{t.price}</span>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      <p className="border-t border-base-border px-4 py-2 text-[11px] text-ink-muted">
        「公開Bmk順位」は公開ベンチマークの順位、「自社評価」はCANAE実務評価（S/A/B/C）です。サンプル値（未検証）は実データへ置換するまで参考値として扱います。
      </p>
    </div>
  );
}
