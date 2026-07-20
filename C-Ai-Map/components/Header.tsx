"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { genres, getLastUpdated } from "@/lib/data";

const NAV = [
  { href: "/", label: "ダッシュボード" },
  ...genres.map((g) => ({ href: `/genre/${g.id}`, label: g.label })),
  { href: "/news", label: "ニュース" },
];

export default function Header({ title }: { title: string }) {
  const pathname = usePathname();
  const lastUpdated = getLastUpdated();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-10 border-b border-base-border bg-base-bg/95 backdrop-blur">
      <div className="flex items-center justify-between gap-3 px-4 py-3 md:px-8">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-label={menuOpen ? "メニューを閉じる" : "メニューを開く"}
              aria-expanded={menuOpen}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-md border border-base-border text-ink md:hidden"
            >
              <span className="text-lg leading-none">{menuOpen ? "×" : "☰"}</span>
            </button>
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wide text-accent md:hidden">
                CANAE AI Intelligence
              </p>
              <h2 className="truncate text-base font-semibold text-ink md:text-lg">{title}</h2>
            </div>
          </div>
          <p className="hidden text-[11px] text-ink-muted md:block">Powered by Web Assist</p>
        </div>
        <p className="shrink-0 text-right text-xs leading-snug text-ink-muted">
          最終更新：<span className="text-ink">{lastUpdated}</span>
        </p>
      </div>
      <nav
        className={`border-t border-base-border px-4 py-3 md:hidden ${
          menuOpen ? "block" : "hidden"
        }`}
      >
        <div className="grid gap-2">
          {NAV.map((item) => {
            const active =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className={`flex min-h-11 items-center rounded-md border px-3 text-sm ${
                  active
                    ? "border-accent/40 bg-accent/10 text-accent"
                    : "border-base-border text-ink-muted"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
        <p className="mt-3 text-[11px] text-ink-muted">Powered by Web Assist</p>
      </nav>
    </header>
  );
}
