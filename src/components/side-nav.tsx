"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string; badge?: number };

export function SideNav({ slug, items }: { slug: string; items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:px-3 md:pb-4">
      {items.map((i) => {
        const href = `/${slug}/${i.href}`;
        const active = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={i.href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex shrink-0 items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm ${
              active ? "bg-brand-soft font-medium text-brand" : "text-ink/80 hover:bg-brand-soft/60"
            }`}
          >
            <span>{i.label}</span>
            {!!i.badge && <span className="rounded-full bg-expense px-1.5 text-xs text-white">{i.badge}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
