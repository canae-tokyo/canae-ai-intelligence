const LABELS: Record<string, string> = {
  high: "影響度：高",
  medium: "影響度：中",
  low: "影響度：低",
};

const STYLES: Record<string, string> = {
  high: "bg-signal-important/15 text-signal-important border-signal-important/40",
  medium: "bg-signal-update/15 text-signal-update border-signal-update/40",
  low: "bg-base-hover text-ink-muted border-base-border",
};

export default function ImportanceBadge({ level }: { level: "high" | "medium" | "low" }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${STYLES[level]}`}
    >
      {LABELS[level]}
    </span>
  );
}
