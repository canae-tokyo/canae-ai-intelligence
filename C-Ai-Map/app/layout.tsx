import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

const productionUrl = "https://canae-ai-intelligence.canae-tokyo.workers.dev";

export const metadata: Metadata = {
  metadataBase: new URL(productionUrl),
  title: {
    default: "CANAE AI Intelligence",
    template: "%s | CANAE AI Intelligence",
  },
  description:
    "AIツール、企業、モデル、ニュース、公開ベンチマーク、CANAE実務評価を構造化・可視化するAI情報基盤。",
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "ja_JP",
    url: productionUrl,
    siteName: "CANAE AI Intelligence",
    title: "CANAE AI Intelligence",
    description: "AI業界を構造化・可視化するAI情報基盤。",
  },
  twitter: {
    card: "summary_large_image",
    title: "CANAE AI Intelligence",
    description: "AI業界を構造化・可視化するAI情報基盤。",
  },
  verification: {
    google: "TcBPdEpbqVnIrv0V_CaXaz07BWc1D1R7go_G38uDdHY",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className="dark">
      <body className="min-h-screen overflow-x-hidden bg-base-bg text-ink antialiased">
        <div className="min-h-screen md:flex">
          <Sidebar />
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </body>
    </html>
  );
}
