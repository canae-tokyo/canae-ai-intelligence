"use client";

import Link from "next/link";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import type {
  UpdateCandidate,
  UpdateCandidateReviewDecision,
  UpdateCandidateReviewStatus,
} from "@/lib/types";

const REVIEW_ACTION_API_PATH = "/internal/api/review-candidates";

const DECISIONS: UpdateCandidateReviewDecision[] = ["approved", "rejected", "on-hold"];

const DECISION_LABELS: Record<UpdateCandidateReviewDecision, string> = {
  approved: "承認",
  rejected: "却下",
  "on-hold": "保留",
};

const REVIEW_ACTION_ERROR_MESSAGES: Record<number, string> = {
  400: "入力内容に問題があります。",
  404: "候補が見つからない、またはアクセス権限がありません。",
  409: "候補データが更新されています。画面を再読み込みしてください。",
  500: "保存に失敗しました。時間をおいて再度確認してください。",
  501: "保存先が未設定です。管理者に確認してください。",
};

const DEFAULT_REVIEW_ACTION_ERROR_MESSAGE = "保存に失敗しました。時間をおいて再度確認してください。";

const REVIEWED_BY_MAX_LENGTH = 80;
const NOTES_MAX_LENGTH = 500;

function sanitizeSingleLine(value: string): string {
  return value.replace(/[\r\n\t]/g, " ");
}

type ReviewActionState =
  | { phase: "idle" }
  | { phase: "submitting"; decision: UpdateCandidateReviewDecision }
  | { phase: "success"; decision: UpdateCandidateReviewDecision }
  | { phase: "error"; decision: UpdateCandidateReviewDecision; message: string };

const REVIEW_STATUSES: Array<{ value: "all" | UpdateCandidateReviewStatus; label: string }> = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "reviewing", label: "Reviewing" },
  { value: "accepted", label: "Accepted" },
  { value: "rejected", label: "Rejected" },
];

const STATUS_LABELS: Record<UpdateCandidateReviewStatus, string> = {
  pending: "Pending",
  reviewing: "Reviewing",
  accepted: "Accepted",
  rejected: "Rejected",
};

const STATUS_CLASSES: Record<UpdateCandidateReviewStatus, string> = {
  pending: "border-update-blue/40 bg-update-blue/10 text-update-blue",
  reviewing: "border-accent/40 bg-accent/10 text-accent",
  accepted: "border-new-green/40 bg-new-green/10 text-new-green",
  rejected: "border-important-red/40 bg-important-red/10 text-important-red",
};

function normalizeStatus(status: string | null): UpdateCandidateReviewStatus | undefined {
  return REVIEW_STATUSES.some((item) => item.value === status && item.value !== "all")
    ? (status as UpdateCandidateReviewStatus)
    : undefined;
}

function getStatusHref(status: "all" | UpdateCandidateReviewStatus): string {
  return status === "all"
    ? "/internal/review-candidates"
    : `/internal/review-candidates?status=${status}`;
}

function getCandidateHref(candidate: UpdateCandidate, status?: UpdateCandidateReviewStatus): string {
  const params = new URLSearchParams({ candidate: candidate.id });

  if (status) {
    params.set("status", status);
  }

  return `/internal/review-candidates?${params.toString()}`;
}

function formatEmpty(value?: string | null): string {
  return value && value.trim().length > 0 ? value : "未設定";
}

function renderDiffSummary(diffSummary: UpdateCandidate["diffSummary"]) {
  if (Array.isArray(diffSummary)) {
    return diffSummary.length > 0 ? diffSummary.join("\n") : "差分情報なし";
  }

  return formatEmpty(diffSummary);
}

function StatusBadge({ status }: { status: UpdateCandidateReviewStatus }) {
  return (
    <span
      className={`inline-flex min-h-7 items-center rounded-md border px-2 text-xs font-medium ${STATUS_CLASSES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="grid gap-1 border-t border-base-border/70 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4">
      <dt className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd className="text-sm text-ink">{formatEmpty(value)}</dd>
    </div>
  );
}

function CandidateList({
  candidates,
  selectedId,
  status,
}: {
  candidates: UpdateCandidate[];
  selectedId?: string;
  status?: UpdateCandidateReviewStatus;
}) {
  if (candidates.length === 0) {
    return (
      <div className="rounded-lg border border-base-border bg-base-card p-4 text-sm text-ink-muted">
        該当候補はありません。
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {candidates.map((candidate) => {
        const active = candidate.id === selectedId;

        return (
          <Link
            key={candidate.id}
            href={getCandidateHref(candidate, status)}
            className={`block rounded-lg border p-3 transition-colors ${
              active
                ? "border-accent/50 bg-accent/10"
                : "border-base-border bg-base-card hover:border-accent/30"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="min-w-0 text-sm font-semibold leading-snug text-ink">
                {candidate.title}
              </h2>
              <StatusBadge status={candidate.reviewStatus} />
            </div>
            <div className="mt-2 grid gap-1 text-xs text-ink-muted">
              <span>{candidate.sourceId}</span>
              <span>Published: {formatEmpty(candidate.sourcePublishedAt)}</span>
              <span>Registered: {formatEmpty(candidate.registeredAt)}</span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function ReviewActionPanel({
  candidate,
  expectedStoreHash,
}: {
  candidate: UpdateCandidate;
  expectedStoreHash: string;
}) {
  const [reviewStatus, setReviewStatus] = useState<UpdateCandidateReviewStatus>(
    candidate.reviewStatus
  );
  const [reviewedBy, setReviewedBy] = useState("");
  const [notes, setNotes] = useState("");
  const [state, setState] = useState<ReviewActionState>({ phase: "idle" });

  const isSubmitting = state.phase === "submitting";
  const isReviewing = reviewStatus === "reviewing";
  const isTerminal = reviewStatus === "accepted" || reviewStatus === "rejected";
  const reviewedByValid =
    reviewedBy.trim().length > 0 && reviewedBy.trim().length <= REVIEWED_BY_MAX_LENGTH;
  const notesValid = notes.trim().length > 0 && notes.trim().length <= NOTES_MAX_LENGTH;
  const inputsValid = reviewedByValid && notesValid;

  async function submitDecision(decision: UpdateCandidateReviewDecision) {
    if (isSubmitting || isTerminal || !inputsValid) {
      return;
    }

    if (decision === "on-hold" && isReviewing) {
      return;
    }

    setState({ phase: "submitting", decision });

    try {
      const response = await fetch(REVIEW_ACTION_API_PATH, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          candidateId: candidate.id,
          decision,
          reviewedBy: reviewedBy.trim(),
          notes: notes.trim(),
          expectedStoreHash,
          resolveHold: isReviewing,
          apply: true,
        }),
      });

      const result: { ok?: boolean; reviewStatus?: UpdateCandidateReviewStatus } | null =
        await response.json().catch(() => null);

      if (response.ok && result?.ok && result.reviewStatus) {
        setReviewStatus(result.reviewStatus);
        setState({ phase: "success", decision });
        return;
      }

      setState({
        phase: "error",
        decision,
        message: REVIEW_ACTION_ERROR_MESSAGES[response.status] ?? DEFAULT_REVIEW_ACTION_ERROR_MESSAGE,
      });
    } catch {
      setState({ phase: "error", decision, message: DEFAULT_REVIEW_ACTION_ERROR_MESSAGE });
    }
  }

  return (
    <section className="mt-4 rounded-lg border border-base-border/80 p-4">
      <h3 className="text-sm font-semibold text-ink">Review Action</h3>

      {isTerminal ? (
        <p className="mt-3 text-sm text-ink-muted">
          このレビューは確定済みです（{STATUS_LABELS[reviewStatus]}）。
        </p>
      ) : (
        <>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-xs text-ink-muted">
              レビュー担当者名
              <input
                type="text"
                value={reviewedBy}
                maxLength={REVIEWED_BY_MAX_LENGTH}
                disabled={isSubmitting}
                onChange={(event) => setReviewedBy(sanitizeSingleLine(event.target.value))}
                placeholder="例: CANAE/Sato"
                className="min-h-9 rounded-md border border-base-border bg-base-bg px-2 text-sm text-ink"
              />
            </label>
            <label className="grid gap-1 text-xs text-ink-muted">
              理由・確認メモ
              <input
                type="text"
                value={notes}
                maxLength={NOTES_MAX_LENGTH}
                disabled={isSubmitting}
                onChange={(event) => setNotes(sanitizeSingleLine(event.target.value))}
                placeholder="例: 公式情報と内容を確認"
                className="min-h-9 rounded-md border border-base-border bg-base-bg px-2 text-sm text-ink"
              />
            </label>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {DECISIONS.map((decision) => (
              <button
                key={decision}
                type="button"
                disabled={
                  isSubmitting || !inputsValid || (decision === "on-hold" && isReviewing)
                }
                onClick={() => submitDecision(decision)}
                className="min-h-10 rounded-md border border-base-border px-4 text-sm font-medium text-ink transition-colors hover:border-accent/50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isSubmitting && state.decision === decision
                  ? "送信中..."
                  : DECISION_LABELS[decision]}
              </button>
            ))}
          </div>

          {!inputsValid && (
            <p className="mt-2 text-xs text-ink-muted">
              担当者名と理由・確認メモを入力すると操作できます（担当者名は{REVIEWED_BY_MAX_LENGTH}
              文字、理由は{NOTES_MAX_LENGTH}文字まで、1行で入力してください）。
            </p>
          )}

          {isReviewing && (
            <p className="mt-2 text-xs text-ink-muted">
              保留中の候補です。承認または却下で保留を解除できます。
            </p>
          )}
        </>
      )}

      {state.phase === "success" && (
        <p className="mt-3 text-sm text-new-green">
          保存成功：{DECISION_LABELS[state.decision]}として記録しました。
        </p>
      )}
      {state.phase === "error" && (
        <p className="mt-3 text-sm text-important-red">{state.message}</p>
      )}
    </section>
  );
}

function CandidateDetail({
  candidate,
  expectedStoreHash,
}: {
  candidate?: UpdateCandidate;
  expectedStoreHash: string;
}) {
  if (!candidate) {
    return (
      <section className="rounded-lg border border-base-border bg-base-card p-5 text-sm text-ink-muted">
        表示できる候補はありません。
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-base-border bg-base-card p-5">
      <div className="flex flex-col gap-3 border-b border-base-border pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-accent">{candidate.candidateType}</p>
          <h2 className="mt-1 text-lg font-semibold leading-snug text-ink">{candidate.title}</h2>
        </div>
        <StatusBadge status={candidate.reviewStatus} />
      </div>

      <dl className="mt-2">
        <DetailRow label="Candidate ID" value={candidate.id} />
        <DetailRow label="Source ID" value={candidate.sourceId} />
        <DetailRow label="Suggested" value={candidate.suggestedStatus} />
        <DetailRow label="Published" value={candidate.sourcePublishedAt} />
        <DetailRow label="Detected" value={candidate.detectedAt} />
        <DetailRow label="Registered" value={candidate.registeredAt} />
        <DetailRow label="Review Decision" value={candidate.reviewDecision} />
        <DetailRow label="Reviewed At" value={candidate.reviewedAt} />
        <DetailRow label="Reviewed By" value={candidate.reviewedBy} />
        <DetailRow label="Review Notes" value={candidate.reviewNotes} />
        <DetailRow label="Promoted Type" value={candidate.promotedRecordType} />
        <DetailRow label="Promoted ID" value={candidate.promotedRecordId} />
        <DetailRow label="Promoted At" value={candidate.promotedAt} />
      </dl>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-base-border/80 p-4">
          <h3 className="text-sm font-semibold text-ink">Source</h3>
          <div className="mt-3 grid gap-2 text-sm">
            <a
              href={candidate.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="text-accent hover:underline"
            >
              {candidate.sourceUrl}
            </a>
            <p className="text-xs text-ink-muted">Canonical: {candidate.canonicalUrl}</p>
          </div>
        </section>

        <section className="rounded-lg border border-base-border/80 p-4">
          <h3 className="text-sm font-semibold text-ink">Duplicate Check</h3>
          <div className="mt-3 grid gap-2 text-sm text-ink-muted">
            <p>Status: {candidate.duplicateCheck.status}</p>
            <p>
              Matched IDs:{" "}
              {candidate.duplicateCheck.matchedIds.length > 0
                ? candidate.duplicateCheck.matchedIds.join(", ")
                : "なし"}
            </p>
          </div>
        </section>
      </div>

      <section className="mt-4 rounded-lg border border-base-border/80 p-4">
        <h3 className="text-sm font-semibold text-ink">Diff Summary</h3>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink-muted">
          {renderDiffSummary(candidate.diffSummary)}
        </p>
      </section>

      <section className="mt-4 rounded-lg border border-base-border/80 p-4">
        <h3 className="text-sm font-semibold text-ink">Review History</h3>
        {candidate.changeLog.length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">履歴なし</p>
        ) : (
          <ol className="mt-3 space-y-3">
            {candidate.changeLog.map((entry, index) => (
              <li key={`${entry.date}-${entry.type}-${index}`} className="text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-ink">{entry.date}</span>
                  <span className="rounded-md border border-base-border px-2 py-0.5 text-xs text-ink-muted">
                    {entry.type}
                  </span>
                  {entry.actor && <span className="text-xs text-accent">{entry.actor}</span>}
                </div>
                <p className="mt-1 text-ink-muted">{entry.summary}</p>
              </li>
            ))}
          </ol>
        )}
      </section>

      {candidate.notes && (
        <section className="mt-4 rounded-lg border border-base-border/80 p-4">
          <h3 className="text-sm font-semibold text-ink">Notes</h3>
          <p className="mt-3 text-sm leading-relaxed text-ink-muted">{candidate.notes}</p>
        </section>
      )}

      <ReviewActionPanel
        key={candidate.id}
        candidate={candidate}
        expectedStoreHash={expectedStoreHash}
      />
    </section>
  );
}

export default function ReviewCandidatesClient({
  candidates,
  statusCounts,
  expectedStoreHash,
}: {
  candidates: UpdateCandidate[];
  statusCounts: Record<UpdateCandidateReviewStatus, number>;
  expectedStoreHash: string;
}) {
  const searchParams = useSearchParams();
  const status = normalizeStatus(searchParams.get("status"));
  const filteredCandidates = candidates.filter((candidate) =>
    status ? candidate.reviewStatus === status : true
  );
  const selectedCandidate =
    filteredCandidates.find((candidate) => candidate.id === searchParams.get("candidate")) ??
    filteredCandidates[0];

  return (
    <>
      <section className="rounded-lg border border-base-border bg-base-card p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-accent">Internal Review</p>
            <h1 className="mt-1 text-xl font-semibold text-ink">Update Candidates</h1>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm sm:flex sm:flex-wrap">
            <span className="rounded-md border border-base-border px-3 py-2 text-ink-muted">
              Total: <span className="text-ink">{candidates.length}</span>
            </span>
            {Object.entries(statusCounts).map(([key, value]) => (
              <span
                key={key}
                className="rounded-md border border-base-border px-3 py-2 text-ink-muted"
              >
                {STATUS_LABELS[key as UpdateCandidateReviewStatus]}:{" "}
                <span className="text-ink">{value}</span>
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="flex flex-wrap gap-2">
        {REVIEW_STATUSES.map((item) => {
          const active = item.value === "all" ? !status : status === item.value;

          return (
            <Link
              key={item.value}
              href={getStatusHref(item.value)}
              className={`flex min-h-11 items-center rounded-md border px-3 text-sm ${
                active
                  ? "border-accent/50 bg-accent/10 text-accent"
                  : "border-base-border text-ink-muted hover:border-accent/30 hover:text-ink"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </section>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[24rem_minmax(0,1fr)]">
        <aside className="min-w-0">
          <CandidateList
            candidates={filteredCandidates}
            selectedId={selectedCandidate?.id}
            status={status}
          />
        </aside>
        <div className="min-w-0">
          <CandidateDetail candidate={selectedCandidate} expectedStoreHash={expectedStoreHash} />
        </div>
      </div>
    </>
  );
}
