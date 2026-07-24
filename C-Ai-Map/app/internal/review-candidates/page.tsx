import type { Metadata } from "next";
import { Suspense } from "react";
import Header from "@/components/Header";
import PromotionPanel from "@/components/PromotionPanel";
import ReviewCandidatesClient from "@/components/ReviewCandidatesClient";
import { computeReviewActionStoreHash } from "@/lib/reviewActionStoreHash";
import {
  getUpdateCandidateStatusCounts,
  getUpdateCandidatesByStatus,
  updateCandidates,
} from "@/lib/data";

export const metadata: Metadata = {
  title: "Review Candidates | CANAE AI Intelligence",
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

export default async function ReviewCandidatesPage() {
  const expectedStoreHash = await computeReviewActionStoreHash(updateCandidates);

  return (
    <div>
      <Header title="候補レビュー" />
      <main className="min-w-0 space-y-6 px-4 py-6 md:px-8">
        <PromotionPanel />
        <Suspense
          fallback={
            <div className="rounded-lg border border-base-border bg-base-card p-4 text-sm text-ink-muted">
              Loading review candidates...
            </div>
          }
        >
          <ReviewCandidatesClient
            candidates={getUpdateCandidatesByStatus()}
            statusCounts={getUpdateCandidateStatusCounts()}
            expectedStoreHash={expectedStoreHash}
          />
        </Suspense>
      </main>
    </div>
  );
}
