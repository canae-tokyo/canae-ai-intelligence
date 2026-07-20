"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { genres, getLastUpdated } from "@/lib/data";

const NAV = [
  { href: "/", label: "ダッシュボード" },
  ...genres.map((g) => ({ href: `/genre/${g.id}`, label: g.label })),
  { href: "/news", label: "ニュース" },
];

export default function Header({ title }: { title: string }) {
  const pathname = usePathname();
  const lastUpdated = getLastUpdated();

  return (
    <header className="sticky top-0 z-10 border-b border-base-border bg-base-bg/95 backdrop-blur">
      <div className="flex items-center justify-between px-4 py-3 md:px-8">
        <h2 className="text-base font-semibold text-ink md:text-lg">{title}</h2>
        <p className="text-xs text-ink-muted">
          最終更新：<span className="text-ink">{lastUpdated}</span>
        </p>
      </div>
      <nav className="flex gap-1 overflow-x-auto px-4 pb-2 md:hidden">
        {NAV.map((item) => {
          const active =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs ${
                active
                  ? "border-accent/40 bg-accent/10 text-accent"
                  : "border-base-border text-ink-muted"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
