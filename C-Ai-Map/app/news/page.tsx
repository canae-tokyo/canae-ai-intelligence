import Header from "@/components/Header";
import NewsListClient from "@/components/NewsListClient";
import { news } from "@/lib/data";

export default function NewsPage() {
  return (
    <div>
      <Header title="ニュース一覧" />
      <main className="px-4 py-6 md:px-8">
        <NewsListClient news={news} />
      </main>
    </div>
  );
}
