"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { genres } from "@/lib/data";

const NAV = [
  { href: "/", label: "ダッシュボード" },
  ...genres.map((g) => ({ href: `/genre/${g.id}`, label: g.label })),
  { href: "/news", label: "ニュース一覧" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex md:w-60 md:flex-col md:border-r md:border-base-border md:bg-base-card/40 md:px-4 md:py-6">
      <div className="mb-8 px-2">
        <p className="text-xs uppercase tracking-widest text-accent">CANAE</p>
        <h1 className="mt-1 text-lg font-semibold leading-tight text-ink">
          AI Intelligence
          <br />
          Map
        </h1>
      </div>
      <nav className="flex flex-1 flex-col gap-1">
        {NAV.map((item) => {
          const active =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-md px-3 py-2 text-sm transition-colors ${
                active
                  ? "bg-accent/10 text-accent font-medium"
                  : "text-ink-muted hover:bg-base-hover hover:text-ink"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <p className="px-3 pt-4 text-[11px] text-ink-muted">社内限定・非公開運用</p>
    </aside>
  );
}
