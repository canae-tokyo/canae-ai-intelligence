import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "ページが見つかりません",
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-xs uppercase tracking-widest text-accent">404</p>
      <h1 className="text-xl font-semibold text-ink">ページが見つかりません</h1>
      <p className="text-sm text-ink-muted">
        指定されたページは存在しないか、移動した可能性があります。
      </p>
      <Link
        href="/"
        className="rounded-md border border-base-border px-4 py-2 text-sm text-ink hover:border-accent/40 hover:text-accent"
      >
        トップページへ戻る
      </Link>
    </div>
  );
}
