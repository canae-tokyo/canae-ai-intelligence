import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "CANAE AI Intelligence Map",
  description: "CANAE社内向け AI情報管理ダッシュボード（社内限定）",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className="dark">
      <body className="min-h-screen bg-base-bg text-ink antialiased">
        <div className="flex min-h-screen">
          <Sidebar />
          <div className="flex-1">{children}</div>
        </div>
      </body>
    </html>
  );
}
