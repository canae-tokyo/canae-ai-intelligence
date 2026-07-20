"use client";

import { useMemo, useState } from "react";
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
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              axis === a.key
                ? "border-accent/50 bg-accent/10 text-accent"
                : "border-base-border text-ink-muted hover:text-ink"
            }`}
          >
            {a.label}
          </button>
        ))}
        <span className="ml-auto text-xs text-ink-muted">評価方法：{activeAxis.method}</span>
      </div>
      <div className="overflow-x-auto">
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
              const benchmarkSource = t.benchmarkSource ?? "サンプル値（未検証）";
              const benchmarkCheckedAt = t.benchmarkCheckedAt ?? t.lastUpdated;
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
                    {t.benchmarkRank ? `${t.benchmarkRank}位` : "—"}
                  </td>
                  <td className="px-4 py-2 text-ink-muted">
                    {benchmarkSource}
                    <span className="ml-1 text-[11px]">({benchmarkCheckedAt})</span>
                  </td>
                  <td className={`px-4 py-2 font-semibold ${GRADE_STYLE[t.internalGrade]}`}>
                    {t.internalGrade}
                  </td>
                  <td className="px-4 py-2 text-ink-muted">{t.price}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="border-t border-base-border px-4 py-2 text-[11px] text-ink-muted">
        「公開Bmk順位」は公開ベンチマークの順位、「自社評価」はCANAE実務評価（S/A/B/C）です。サンプル値（未検証）は実データへ置換するまで参考値として扱います。
      </p>
    </div>
  );
}
