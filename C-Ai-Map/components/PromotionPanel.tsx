"use client";

import { useEffect, useState } from "react";

const PROMOTION_CANDIDATES_API_PATH = "/internal/api/promotion-candidates";
const PROMOTION_PLAN_API_PATH = "/internal/api/promotion-plan";
const PROMOTION_PR_API_PATH = "/internal/api/promotion-pr";

interface PromotionCandidate {
  candidateId: string;
  candidateType: string;
  title: string;
  targetFile: string | null;
  reviewDecision: string;
  reviewStatus: string;
  canPromote: boolean;
  reason?: string;
  missingFields?: string[];
}

interface PromotionPlanChange {
  candidateId: string;
  candidateType: string;
  targetFile: string;
  operation: string;
  summary: string;
}

const NOT_PROMOTABLE_REASON_LABELS: Record<string, string> = {
  "unsupported-candidate-type": "未対応の候補タイプです",
  "incomplete-proposed-record": "昇格用の構造化データが未整備です",
};

const KNOWN_ERROR_MESSAGES: Record<string, string> = {
  "storage-not-configured": "保存先が未設定です。管理者に確認してください。",
  "github-promotion-not-configured": "GitHub連携が未設定です。管理者に確認してください。",
  "promotion-pr-already-exists": "この候補はすでに昇格PRが作成済みです。",
  "promotion-plan-not-found": "Promotion planが見つかりません。もう一度planを生成してください。",
};

const STATUS_FALLBACK_MESSAGES: Record<number, string> = {
  400: "入力内容に問題があります。",
  404: "対象が見つからない、またはアクセス権限がありません。",
  409: "候補データが更新されています。一覧を再読み込みしてください。",
  500: "処理に失敗しました。時間をおいて再度確認してください。",
  501: "機能が未設定です。管理者に確認してください。",
};

function resolveErrorMessage(status: number, errorCode?: string): string {
  if (errorCode && KNOWN_ERROR_MESSAGES[errorCode]) {
    return KNOWN_ERROR_MESSAGES[errorCode];
  }
  return STATUS_FALLBACK_MESSAGES[status] ?? "処理に失敗しました。時間をおいて再度確認してください。";
}

type LoadState = "idle" | "loading" | "loaded" | "error";
type PlanState = "idle" | "submitting" | "done" | "error";
type PrState = "idle" | "submitting" | "done" | "error";

export default function PromotionPanel() {
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [storeHash, setStoreHash] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<PromotionCandidate[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [planState, setPlanState] = useState<PlanState>("idle");
  const [planError, setPlanError] = useState<string | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [planChanges, setPlanChanges] = useState<PromotionPlanChange[]>([]);

  const [prState, setPrState] = useState<PrState>("idle");
  const [prError, setPrError] = useState<string | null>(null);
  const [prUrl, setPrUrl] = useState<string | null>(null);

  async function loadCandidates() {
    setLoadState("loading");
    setLoadError(null);

    try {
      const response = await fetch(PROMOTION_CANDIDATES_API_PATH);
      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.ok) {
        setLoadError(resolveErrorMessage(response.status, result?.error));
        setLoadState("error");
        return;
      }

      setStoreHash(result.storeHash);
      setCandidates(result.candidates ?? []);
      setSelectedIds(new Set());
      setLoadState("loaded");
    } catch {
      setLoadError(STATUS_FALLBACK_MESSAGES[500]);
      setLoadState("error");
    }
  }

  useEffect(() => {
    loadCandidates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleSelected(candidateId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(candidateId)) {
        next.delete(candidateId);
      } else {
        next.add(candidateId);
      }
      return next;
    });
  }

  async function generatePlan() {
    if (!storeHash || selectedIds.size === 0 || planState === "submitting") return;

    setPlanState("submitting");
    setPlanError(null);
    setPrState("idle");
    setPrError(null);
    setPrUrl(null);

    try {
      const response = await fetch(PROMOTION_PLAN_API_PATH, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          candidateIds: [...selectedIds],
          expectedStoreHash: storeHash,
        }),
      });
      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.ok) {
        setPlanError(resolveErrorMessage(response.status, result?.error));
        setPlanState("error");
        return;
      }

      setPlanId(result.promotionPlanId);
      setPlanChanges(result.changes ?? []);
      setPlanState("done");
    } catch {
      setPlanError(STATUS_FALLBACK_MESSAGES[500]);
      setPlanState("error");
    }
  }

  async function createPullRequest() {
    if (!storeHash || !planId || prState === "submitting") return;

    setPrState("submitting");
    setPrError(null);

    try {
      const response = await fetch(PROMOTION_PR_API_PATH, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          promotionPlanId: planId,
          expectedStoreHash: storeHash,
          confirm: true,
        }),
      });
      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.ok) {
        setPrError(resolveErrorMessage(response.status, result?.error));
        setPrState("error");
        return;
      }

      setPrUrl(result.pullRequestUrl);
      setPrState("done");
    } catch {
      setPrError(STATUS_FALLBACK_MESSAGES[500]);
      setPrState("error");
    }
  }

  const promotableCandidates = candidates.filter((candidate) => candidate.canPromote);
  const blockedCandidates = candidates.filter((candidate) => !candidate.canPromote);

  return (
    <section className="rounded-lg border border-base-border bg-base-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-accent">Verified Promotion</p>
          <h2 className="mt-1 text-lg font-semibold text-ink">承認済み候補を昇格PRにする</h2>
        </div>
        <button
          type="button"
          onClick={loadCandidates}
          disabled={loadState === "loading"}
          className="min-h-9 rounded-md border border-base-border px-3 text-xs text-ink-muted hover:border-accent/40 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loadState === "loading" ? "更新中..." : "一覧を再読み込み"}
        </button>
      </div>

      <p className="mt-2 text-xs text-ink-muted">
        このボタンはmainへ直接反映しません。GitHub PRを作成するだけで、mergeは人間が判断します。
      </p>

      {loadState === "error" && (
        <p className="mt-3 text-sm text-important-red">{loadError}</p>
      )}

      {loadState === "loaded" && candidates.length === 0 && (
        <p className="mt-3 text-sm text-ink-muted">昇格対象の承認済み候補はありません。</p>
      )}

      {loadState === "loaded" && candidates.length > 0 && (
        <div className="mt-3 space-y-2">
          {promotableCandidates.map((candidate) => (
            <label
              key={candidate.candidateId}
              className="flex items-start gap-2 rounded-md border border-base-border/80 p-2 text-sm"
            >
              <input
                type="checkbox"
                checked={selectedIds.has(candidate.candidateId)}
                onChange={() => toggleSelected(candidate.candidateId)}
                className="mt-1"
              />
              <span className="min-w-0">
                <span className="block text-ink">{candidate.title}</span>
                <span className="block text-xs text-ink-muted">
                  {candidate.candidateType} → {candidate.targetFile}
                </span>
              </span>
            </label>
          ))}

          {blockedCandidates.map((candidate) => (
            <div
              key={candidate.candidateId}
              className="rounded-md border border-base-border/60 p-2 text-sm text-ink-muted"
            >
              <span className="block text-ink-muted">{candidate.title}</span>
              <span className="block text-xs">
                昇格不可：
                {NOT_PROMOTABLE_REASON_LABELS[candidate.reason ?? ""] ?? candidate.reason ?? "不明な理由"}
                {candidate.missingFields && candidate.missingFields.length > 0
                  ? `（不足フィールド: ${candidate.missingFields.join(", ")}）`
                  : ""}
              </span>
            </div>
          ))}
        </div>
      )}

      {promotableCandidates.length > 0 && (
        <div className="mt-4 border-t border-base-border/70 pt-4">
          <button
            type="button"
            onClick={generatePlan}
            disabled={selectedIds.size === 0 || planState === "submitting"}
            className="min-h-10 rounded-md border border-base-border px-4 text-sm font-medium text-ink hover:border-accent/50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {planState === "submitting" ? "生成中..." : "Promotion planを生成"}
          </button>

          {planState === "error" && <p className="mt-2 text-sm text-important-red">{planError}</p>}

          {planState === "done" && (
            <div className="mt-3 space-y-2">
              <p className="text-sm text-ink">差分案（{planChanges.length}件）</p>
              <ul className="space-y-1 text-xs text-ink-muted">
                {planChanges.map((change) => (
                  <li key={change.candidateId}>
                    {change.summary}（{change.targetFile}）
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={createPullRequest}
                disabled={prState === "submitting"}
                className="min-h-10 rounded-md border border-base-border px-4 text-sm font-medium text-ink hover:border-accent/50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {prState === "submitting" ? "作成中..." : "GitHub PRを作成"}
              </button>

              {prState === "error" && <p className="mt-2 text-sm text-important-red">{prError}</p>}

              {prState === "done" && prUrl && (
                <p className="mt-2 text-sm text-new-green">
                  PRを作成しました：{" "}
                  <a href={prUrl} target="_blank" rel="noreferrer" className="underline">
                    {prUrl}
                  </a>
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
