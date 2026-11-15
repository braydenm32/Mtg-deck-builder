"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Tabs live in the path (/decks/3/cards) so each tab can be linked and the back button works. */
export function DeckTabs({ base, tabs }: { base: string; tabs: { href: string; label: string; count?: number }[] }) {
  const path = usePathname();
  return (
    <nav aria-label="Deck sections" className="-mx-4 overflow-x-auto border-b border-line px-4">
      <ul className="flex gap-1">
        {tabs.map((t) => {
          const href = `${base}${t.href}`;
          const active = path === href;
          return (
            <li key={t.href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 text-sm ${active ? "border-accent font-medium text-foreground" : "border-transparent text-muted hover:text-foreground"}`}
              >
                {t.label}
                {t.count ? <span className="rounded-full bg-skeleton px-1.5 text-xs">{t.count}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
