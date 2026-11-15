"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AREAS, areaOf } from "@/lib/nav";
import { CommandPalette } from "./CommandPalette";
import { Icon, Mark } from "./icons";
import { ShellContext } from "./ShellContext";
import { TopBar } from "./TopBar";

/**
 * The new look's frame: a sidebar of areas on a laptop, a bottom bar on a phone, the top bar with
 * the area's tabs, and ⌘K. Everything comes from the menu config in src/lib/nav.ts.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const area = areaOf(path);
  const [searchOpen, setSearchOpen] = useState(false);
  const [keyHint, setKeyHint] = useState("⌘K");
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

  return (
    <ShellContext.Provider value={{ openSearch }}>
      <div className="app-shell">
        <aside className="shell-side" aria-label="Main">
          <Link href="/" className="shell-brand">
            <Mark size={30} />
            <span>Commandery</span>
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
          <main className="shell-content">{children}</main>
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
              href={a.href}
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
