import type { Metadata } from "next";
import Header from "@/components/Header";
import NewsListClient from "@/components/NewsListClient";
import { verifiedNews } from "@/lib/data";

export const metadata: Metadata = {
  title: "AIニュース",
  description: "公式一次情報を中心に検証したAI業界ニュースを掲載。",
  alternates: {
    canonical: "/news",
  },
};

export default function NewsPage() {
  return (
    <div>
      <Header title="ニュース一覧" />
      <main className="px-4 py-6 md:px-8">
        <NewsListClient news={verifiedNews} />
      </main>
    </div>
  );
}
