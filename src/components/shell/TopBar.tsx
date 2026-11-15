"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { topBar } from "@/lib/nav";
import { Icon } from "./icons";
import { useShell } from "./ShellContext";

/**
 * The top bar: the page's title, Back on child pages, and the area's tabs (with More).
 *
 * The shell renders one with the menu's labels. A page that knows a better title (a deck's name)
 * renders its own with `inPage`, and CSS hides the shell's (see `.topbar-default` in globals.css).
 * `counts` puts a number on a tab, keyed by route: { "/decks/[id]/missing": 24 }.
 */
export function TopBar({
  title,
  counts,
  actions,
  inPage = false,
}: {
  title?: string;
  counts?: Record<string, number>;
  actions?: React.ReactNode;
  inPage?: boolean;
}) {
  const path = usePathname();
  const m = topBar(path);
  const { openSearch } = useShell();
  const [moreOpen, setMoreOpen] = useState(false);
  const activeMore = m.more.find((t) => t.active);

  // Close the More sheet when the page changes.
  useEffect(() => setMoreOpen(false), [path]);

  return (
    <header className={`topbar ${inPage ? "topbar-page" : "topbar-default"}`}>
      <div className="topbar-row">
        {m.back && (
          <Link href={m.back.href} className="topbar-back">
            <Icon name="back" />
            <span>{m.back.label}</span>
          </Link>
        )}
        <h1 className="topbar-title">{title ?? m.title}</h1>
        <div className="topbar-actions">
          {actions}
          {m.shortcuts.map((x) => (
            <Link key={x.href} href={x.href} className="topbar-icon" aria-label={x.label} title={x.label}>
              <Icon name={x.icon} />
            </Link>
          ))}
          <button type="button" className="topbar-icon topbar-search" onClick={openSearch} aria-label="Search cards, decks and pages">
            <Icon name="search" />
          </button>
        </div>
      </div>
      {(m.tabs.length > 0 || m.more.length > 0) && (
        <nav className="topbar-tabs" aria-label={`${m.area.label} sections`}>
          {m.tabs.map((t) => (
            <Link key={t.route} href={t.href} aria-current={t.active ? "page" : undefined} className="topbar-tab">
              {t.label}
              {counts?.[t.route] ? <span className="topbar-count">{counts[t.route]}</span> : null}
            </Link>
          ))}
          {m.more.length > 0 && (
            <button
              type="button"
              className="topbar-tab"
              aria-current={activeMore ? "page" : undefined}
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen(true)}
            >
              {activeMore ? activeMore.label : "More"}
              <Icon name="more" className="topbar-more-icon" />
            </button>
          )}
        </nav>
      )}
      {/* In a portal: the top bar's backdrop blur would otherwise trap the fixed sheet inside it. */}
      {moreOpen &&
        createPortal(
          <>
            <div className="sheet-scrim" onClick={() => setMoreOpen(false)} />
            <div
              className="sheet"
              role="dialog"
              aria-modal="true"
              aria-label={m.moreTitle}
              onKeyDown={(e) => e.key === "Escape" && setMoreOpen(false)}
            >
              <div className="sheet-title">{m.moreTitle}</div>
              {m.more.map((t) => (
                <Link
                  key={t.route}
                  href={t.href}
                  className="sheet-link"
                  aria-current={t.active ? "page" : undefined}
                  autoFocus={t === m.more[0]}
                >
                  {t.label}
                </Link>
              ))}
              <button type="button" className="sheet-close" onClick={() => setMoreOpen(false)}>
                Close
              </button>
            </div>
          </>,
          document.body,
        )}
    </header>
  );
}
