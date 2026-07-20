import Header from "@/components/Header";
import NewsCard from "@/components/NewsCard";
import ImportanceBadge from "@/components/ImportanceBadge";
import Link from "next/link";
import {
  genres,
  getTopNewsToday,
  getRecentNews,
  tools,
} from "@/lib/data";

export default function DashboardPage() {
  const topNews = getTopNewsToday();
  const recentNews = getRecentNews(7).slice(0, 8);
  const topRankedTools = [...tools]
    .sort((a, b) => b.scores.overall - a.scores.overall)
    .slice(0, 5);

  const topToolsByGenre = genres.map((g) => {
    const genreTools = tools
      .filter((t) => t.category === g.id)
      .sort((a, b) => b.scores.overall - a.scores.overall);
    return { genre: g, top: genreTools[0], second: genreTools[1] };
  });

  return (
    <div>
      <Header title="ダッシュボード" />
      <main className="min-w-0 space-y-10 px-4 py-6 md:px-8">
        <section>
          <div className="mb-4 rounded-lg border border-base-border bg-base-card p-4">
            <p className="text-xs uppercase tracking-wide text-accent">Powered by Web Assist</p>
            <h1 className="mt-1 break-words text-xl font-semibold text-ink">CANAE AI Intelligence</h1>
            <p className="mt-2 text-base leading-relaxed text-ink-muted md:text-sm">
              AI業界を構造化・可視化し、公開ベンチマークとCANAE実務評価を分離して管理する社内知識基盤です。
            </p>
          </div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-muted">
            本日の重要ニュース
          </h2>
          {topNews.length === 0 ? (
            <p className="text-sm text-ink-muted">本日登録されたニュースはありません。</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {topNews.map((n) => (
                <NewsCard key={n.id} item={n} showCategory />
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
              直近7日間の主要更新
            </h2>
            <Link href="/news" className="text-xs text-accent hover:underline">
              すべて見る →
            </Link>
          </div>
          <div className="divide-y divide-base-border rounded-lg border border-base-border bg-base-card">
            {recentNews.length === 0 ? (
              <p className="p-4 text-sm text-ink-muted">直近7日間の更新はありません。</p>
            ) : (
              recentNews.map((n) => (
                <div key={n.id} className="grid gap-2 p-3 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
                  <ImportanceBadge level={n.importance} />
                  <span className="text-base text-ink sm:text-sm">{n.title}</span>
                  <span className="text-sm text-accent sm:text-xs">{n.company}</span>
                  <span className="text-xs text-ink-muted sm:ml-auto">{n.publishedAt}</span>
                </div>
              ))
            )}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-muted">
            ジャンル別注目ツール
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {topToolsByGenre.map(({ genre, top, second }) => (
              <Link
                key={genre.id}
                href={`/genre/${genre.id}`}
                className="rounded-lg border border-base-border bg-base-card p-4 transition-colors hover:border-accent/30"
              >
                <p className="mb-2 text-xs uppercase tracking-wide text-accent">
                  {genre.label}
                </p>
                {top && (
                  <p className="break-words text-base font-semibold text-ink sm:text-sm">
                    {top.name}
                    <span className="ml-1 text-xs font-normal text-ink-muted">
                      （{top.company}）
                    </span>
                  </p>
                )}
                {second && (
                  <p className="mt-1 text-xs text-ink-muted">次点：{second.name}</p>
                )}
              </Link>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-muted">
            ランキング変動（総合評価トップ5）
          </h2>
          <div className="hidden overflow-x-auto rounded-lg border border-base-border bg-base-card md:block">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs text-ink-muted">
                  <th className="px-4 py-2 font-medium">順位</th>
                  <th className="px-4 py-2 font-medium">ツール</th>
                  <th className="px-4 py-2 font-medium">ジャンル</th>
                  <th className="px-4 py-2 font-medium">総合評価</th>
                  <th className="px-4 py-2 font-medium">CANAE評価</th>
                </tr>
              </thead>
              <tbody>
                {topRankedTools.map((t, i) => (
                  <tr key={t.id} className="border-t border-base-border">
                    <td className="px-4 py-2 text-ink-muted">{i + 1}</td>
                    <td className="px-4 py-2 font-medium text-ink">{t.name}</td>
                    <td className="px-4 py-2 text-ink-muted">
                      {genres.find((g) => g.id === t.category)?.label}
                    </td>
                    <td className="px-4 py-2 text-ink">{t.scores.overall}</td>
                    <td className="px-4 py-2 text-accent">{t.internalGrade}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-3 md:hidden">
            {topRankedTools.map((t, i) => (
              <article key={t.id} className="rounded-lg border border-base-border bg-base-card p-4">
                <div className="flex items-start gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-accent/40 text-sm font-semibold text-accent">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="break-words text-base font-semibold text-ink">{t.name}</h3>
                    <p className="break-words text-sm text-ink-muted">
                      {genres.find((g) => g.id === t.category)?.label}
                    </p>
                  </div>
                  <span className="shrink-0 font-semibold text-accent">{t.internalGrade}</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 border-t border-base-border/60 pt-3 text-sm">
                  <span className="text-ink-muted">総合評価</span>
                  <span className="text-right text-ink">{t.scores.overall}</span>
                  <span className="text-ink-muted">運営企業</span>
                  <span className="break-words text-right text-ink-muted">{t.company}</span>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-muted">
            AI業界全体相関図
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {genres.map((g) => (
              <Link
                key={g.id}
                href={`/genre/${g.id}`}
                className="rounded-lg border border-base-border bg-base-card p-4 text-sm text-ink-muted transition-colors hover:border-accent/30 hover:text-ink"
              >
                {g.label} の相関図を見る →
              </Link>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-muted">
            全体を一枚図にすると密度が高すぎるため、モックアップ段階ではジャンル別の相関図に分割しています。
          </p>
        </section>
      </main>
    </div>
  );
}
