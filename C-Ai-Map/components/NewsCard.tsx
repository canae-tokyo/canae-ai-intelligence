import ImportanceBadge from "./ImportanceBadge";
import type { NewsItem } from "@/lib/types";
import { genres } from "@/lib/data";

const SOURCE_LABEL: Record<string, string> = {
  official: "公式発表",
  media: "メディア",
  sns: "SNS",
};

const STATUS_LABEL: Record<NewsItem["status"], string> = {
  draft: "Draft",
  verified: "Verified",
  archived: "Archived",
};

const STATUS_STYLE: Record<NewsItem["status"], string> = {
  draft: "border-signal-update/30 text-signal-update",
  verified: "border-signal-new/30 text-signal-new",
  archived: "border-base-border text-ink-muted",
};

export default function NewsCard({ item, showCategory = false }: { item: NewsItem; showCategory?: boolean }) {
  const genreLabel = genres.find((g) => g.id === item.category)?.label;

  return (
    <article className="rounded-lg border border-base-border bg-base-card p-4 transition-colors hover:border-accent/30">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <ImportanceBadge level={item.importance} />
        {showCategory && genreLabel && (
          <span className="rounded-full border border-base-border px-2.5 py-0.5 text-xs text-ink-muted">
            {genreLabel}
          </span>
        )}
        <span className={`rounded-full border px-2.5 py-0.5 text-xs ${STATUS_STYLE[item.status]}`}>
          {STATUS_LABEL[item.status]}
        </span>
        <span className="ml-auto text-xs text-ink-muted">{item.publishedAt}</span>
      </div>
      <h3 className="mb-1 text-sm font-semibold text-ink">{item.title}</h3>
      <p className="mb-2 text-xs text-accent">{item.company}</p>
      <p className="mb-2 text-sm leading-relaxed text-ink-muted">{item.summary}</p>
      <p className="mb-2 text-xs leading-relaxed text-ink">
        <span className="text-ink-muted">影響：</span>
        {item.impact}
      </p>
      <div className="flex items-center justify-between text-xs text-ink-muted">
        <span>出典：{SOURCE_LABEL[item.sourceType]} / 確認日：{item.sourceCheckedAt}</span>
        <a
          href={item.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="text-accent hover:underline"
        >
          原文を見る
        </a>
      </div>
    </article>
  );
}
