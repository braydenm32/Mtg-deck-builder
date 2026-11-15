"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { paletteEntries, paletteScore } from "@/lib/nav";
import type { QuickResult } from "@/lib/search";
import { Icon } from "./icons";

type Item = { key: string; group: string; label: string; hint: string; href: string };

const ENTRIES = paletteEntries();

/**
 * ⌘K: pages and actions from the menu config, plus your decks and owned cards from /api/search,
 * plus "Search the collection for …", which runs the Collection page's full search (rules text
 * and type line too). Arrow keys move, Enter opens, Esc closes.
 */
export function CommandPalette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [remote, setRemote] = useState<QuickResult>({ decks: [], cards: [] });
  const [sel, setSel] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<Element | null>(null);

  useEffect(() => {
    returnFocus.current = document.activeElement;
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = prev;
      if (returnFocus.current instanceof HTMLElement) returnFocus.current.focus();
    };
  }, []);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      setRemote({ decks: [], cards: [] });
      return;
    }
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: ctl.signal })
        .then((r) => (r.ok ? r.json() : { decks: [], cards: [] }))
        .then((data: QuickResult) => setRemote(data))
        .catch(() => {});
    }, 120);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q]);

  const items = useMemo<Item[]>(() => {
    const query = q.trim();
    const local = ENTRIES.map((e) => ({ e, s: paletteScore(e, query) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, query ? 6 : ENTRIES.length)
      .map(({ e }) => ({ key: `p:${e.href}:${e.label}`, group: e.kind === "action" ? "Do" : "Go to", label: e.label, hint: e.hint, href: e.href }));
    const decks = remote.decks.map((d) => ({
      key: `d:${d.id}`,
      group: "Your decks",
      label: d.name,
      hint: [d.commander, d.status].filter(Boolean).join(" · "),
      href: `/decks/${d.id}`,
    }));
    const cards = remote.cards.map((c) => ({
      key: `c:${c.oracleId}`,
      group: "Your cards",
      label: c.name,
      hint: `${c.copies} owned${c.proxies ? ` · ${c.proxies} ${c.proxies === 1 ? "proxy" : "proxies"}` : ""}`,
      href: `/collection/${c.oracleId}`,
    }));
    const full = query
      ? [{ key: "s:collection", group: "Search", label: `Search the collection for “${query}”`, hint: "names, rules text, types", href: `/collection?q=${encodeURIComponent(query)}` }]
      : [];
    // Go-to pages first when nothing is typed; when searching, your things come first.
    const pagesFirst = local.filter((i) => i.group === "Go to");
    const actions = local.filter((i) => i.group === "Do");
    return query ? [...decks, ...cards, ...pagesFirst, ...actions, ...full] : [...pagesFirst, ...actions];
  }, [q, remote]);

  useEffect(() => setSel(0), [q, remote]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  function go(href: string) {
    onClose();
    // The look switch needs a full load so the root layout picks the other shell.
    if (href.startsWith("?")) window.location.assign(window.location.pathname + href);
    else router.push(href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => Math.min(items.length - 1, s + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => Math.max(0, s - 1));
    } else if (e.key === "Enter" && items[sel]) {
      e.preventDefault();
      go(items[sel].href);
    }
  }

  let lastGroup = "";
  return (
    <>
      <div className="palette-scrim" onClick={onClose} />
      <div className="palette" role="dialog" aria-modal="true" aria-label="Search" onKeyDown={onKeyDown}>
        <div className="palette-input-row">
          <Icon name="search" />
          <input
            autoFocus
            className="palette-input"
            placeholder="Search cards, decks and pages"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={items[sel] ? `palette-${sel}` : undefined}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="go"
          />
          <button type="button" className="palette-cancel" onClick={onClose}>
            Cancel
          </button>
        </div>
        <div className="palette-list" id="palette-list" role="listbox" ref={listRef}>
          {items.length === 0 && <p className="palette-empty">Nothing found.</p>}
          {items.map((it, i) => {
            const header = it.group !== lastGroup ? <div className="palette-group">{it.group}</div> : null;
            lastGroup = it.group;
            return (
              <div key={it.key}>
                {header}
                <button
                  type="button"
                  id={`palette-${i}`}
                  role="option"
                  aria-selected={i === sel}
                  className="palette-item"
                  onMouseMove={() => setSel(i)}
                  onClick={() => go(it.href)}
                >
                  <span className="palette-label">{it.label}</span>
                  {it.hint && <span className="palette-hint">{it.hint}</span>}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
