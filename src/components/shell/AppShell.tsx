"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AREAS, areaOf, findPage, LAST_URL_KEY } from "@/lib/nav";
import { CommandPalette } from "./CommandPalette";
import { Icon, Mark } from "./icons";
import { OutboxRunner } from "../offline/OutboxRunner";
import { OfflineSupport } from "./OfflineSupport";
import { ShellContext } from "./ShellContext";
import { TopBar } from "./TopBar";

/**
 * The new look's frame: a sidebar of areas on a laptop, a bottom bar on a phone, the top bar with
 * the area's tabs, and ⌘K. Everything comes from the menu config in src/lib/nav.ts.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  // A shared deck (/s/<token>) is seen by people without the password: no menu, search or offline copy.
  if (path.startsWith("/s/")) return <SharedFrame>{children}</SharedFrame>;
  return <FullShell path={path}>{children}</FullShell>;
}

function SharedFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto min-h-dvh max-w-3xl px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-10">
      <p className="mb-5 flex items-center gap-2 text-sm font-semibold">
        <Mark size={24} />
        <span>MTG Deck Tutor</span>
      </p>
      <main>{children}</main>
      <footer className="mt-10 text-xs text-muted">
        Card data and images from{" "}
        <a className="underline" href="https://scryfall.com">
          Scryfall
        </a>
        . Unofficial Fan Content permitted under the Wizards of the Coast Fan Content Policy. Not approved or endorsed by Wizards.
      </footer>
    </div>
  );
}

function FullShell({ path, children }: { path: string; children: React.ReactNode }) {
  const area = areaOf(path);
  const [searchOpen, setSearchOpen] = useState(false);
  const [keyHint, setKeyHint] = useState("⌘K");
  const [navigating, setNavigating] = useState(false);
  const openSearch = useCallback(() => setSearchOpen(true), []);

  useEffect(() => {
    if (!/Mac|iPhone|iPad/.test(navigator.userAgent)) setKeyHint("Ctrl K");
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => setSearchOpen(false), [path]);

  // Remember each page's address (with its search and filters) as you leave it, so Back can return to it.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (!a || (a as HTMLAnchorElement).origin !== window.location.origin) return;
      const here = findPage(window.location.pathname);
      if (!here) return;
      try {
        sessionStorage.setItem(LAST_URL_KEY(here.page.route), window.location.pathname + window.location.search);
      } catch {
        // Private mode or storage blocked: Back falls back to the plain parent link.
      }
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // A tapped link shows progress straight away, until the address changes. The hosted app can take a
  // few seconds to answer, and a link that only changes the search (a theme chip, a filter) never
  // shows its page's loading skeleton, so without this a click looked like it did nothing.
  useEffect(() => {
    let poll: ReturnType<typeof setInterval> | undefined;
    let giveUp: ReturnType<typeof setTimeout> | undefined;
    const stop = () => {
      clearInterval(poll);
      clearTimeout(giveUp);
      setNavigating(false);
    };
    function onClick(e: MouseEvent) {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.origin !== window.location.origin || a.hasAttribute("download") || (a.target && a.target !== "_self")) return;
      // The same page, or only its #fragment: nothing to wait for.
      if (a.pathname === window.location.pathname && a.search === window.location.search) return;
      const from = window.location.href;
      stop();
      setNavigating(true);
      poll = setInterval(() => window.location.href !== from && stop(), 100);
      giveUp = setTimeout(stop, 60_000);
    }
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", stop);
    return () => {
      stop();
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", stop);
    };
  }, []);

  return (
    <ShellContext.Provider value={{ openSearch }}>
      <div className="app-shell">
        <div className="shell-progress" hidden={!navigating} aria-hidden="true" />
        <aside className="shell-side" aria-label="Main">
          <Link href="/" className="shell-brand">
            <Mark size={30} />
            <span>MTG Deck Tutor</span>
          </Link>
          <button type="button" className="shell-search" onClick={openSearch}>
            <Icon name="search" />
            <span>Search</span>
            <kbd>{keyHint}</kbd>
          </button>
          <nav>
            <ul className="shell-nav">
              {AREAS.filter((a) => !a.action).map((a) => (
                <li key={a.id}>
                  <Link href={a.href} aria-current={area === a.id ? "page" : undefined} className="shell-nav-item">
                    <Icon name={a.icon} />
                    <span>{a.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="shell-grow" />
          {AREAS.filter((a) => a.action).map((a) => (
            <Link key={a.id} href={a.href} aria-current={area === a.id ? "page" : undefined} className="shell-add">
              <Icon name={a.icon} />
              <span>{a.label}</span>
            </Link>
          ))}
          <p className="shell-side-foot">
            Card data from Scryfall.{" "}
            <a href="?look=old" className="underline">
              Old look
            </a>
          </p>
        </aside>

        <div className="shell-main">
          <TopBar />
          <main className="shell-content" aria-busy={navigating || undefined}>
            <OfflineSupport />
            <OutboxRunner />
            {children}
          </main>
          <footer className="shell-foot">
            Card data and images from{" "}
            <a className="underline" href="https://scryfall.com">
              Scryfall
            </a>
            . Unofficial Fan Content permitted under the Wizards of the Coast Fan Content Policy. Not approved or endorsed by Wizards.
          </footer>
        </div>

        <nav className="shell-bar" aria-label="Main">
          {AREAS.map((a) => (
            <Link
              key={a.id}
              href={a.phoneHref ?? a.href}
              aria-current={area === a.id ? "page" : undefined}
              className={`shell-bar-item${a.action ? " is-action" : ""}`}
            >
              <span className="shell-bar-icon">
                <Icon name={a.icon} />
              </span>
              <span>{a.action ? "Add" : a.label}</span>
            </Link>
          ))}
        </nav>

        {searchOpen && <CommandPalette onClose={() => setSearchOpen(false)} />}
      </div>
    </ShellContext.Provider>
  );
}
