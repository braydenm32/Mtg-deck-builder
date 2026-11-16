"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, useState, useTransition } from "react";
import { SearchTips } from "@/components/collection/SearchTips";
import { Icon } from "@/components/shell/icons";
import { RARITIES, TYPES, type CollectionFilters as F } from "@/lib/collection/query";

const COLOURS = [
  { k: "W", label: "White", bg: "#f8f6d8" },
  { k: "U", label: "Blue", bg: "#c1d7e9" },
  { k: "B", label: "Black", bg: "#bab1ab" },
  { k: "R", label: "Red", bg: "#e49977" },
  { k: "G", label: "Green", bg: "#a3c095" },
  { k: "C", label: "Colourless", bg: "#d6d3dc" },
] as const;

/** The place filter's "needs a home" choice: it becomes ?nohome=1 rather than a place name. */
const NOHOME = "__nohome__";

const MODE_LABEL = { within: "Fits", exact: "Exactly", includes: "Has" } as const;
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/** The query string for a form, without empty fields or defaults, so links stay short and readable. */
function queryOf(form: HTMLFormElement): string {
  const data = new FormData(form);
  const out = new URLSearchParams();
  for (const [k, raw] of data) {
    const v = String(raw).trim();
    if (!v) continue;
    if (k === "sort" && v === "name") continue;
    if (k === "ciMode" && (v === "within" || !String(data.get("ci") ?? ""))) continue;
    if (k === "loc" && v === NOHOME) {
      out.set("nohome", "1");
      continue;
    }
    out.set(k, v);
  }
  const s = out.toString();
  return s ? `/collection?${s}` : "/collection";
}

/**
 * Search, sort and filters for the Collection page in the new look. It's one GET form, so every view
 * is a URL and Back returns to it; with JavaScript the form navigates without a full reload and
 * drops empty fields from the address. Filters open in a sheet; the active ones show as chips.
 * `children` (the results) dim while the next view loads.
 */
export function CollectionSearch({
  f,
  params,
  sets,
  places = [],
  hidePrices,
  summary,
  children,
}: {
  f: F;
  /** The page's search params as strings, for the "remove this filter" links. */
  params: Record<string, string>;
  sets: { code: string; name: string }[];
  /** Your boxes and binders, for the place filter. */
  places?: string[];
  hidePrices: boolean;
  /** The collection line: counts, then the value (null when prices are off), and where "≈" explains itself. */
  summary: { counts: string[]; value: string | null; valueNote: string | null };
  children: React.ReactNode;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const filtersButton = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [ci, setCi] = useState(f.ci ?? "");
  const [pending, startTransition] = useTransition();

  // A new view (Back, a chip, a page link) brings new filters: the colour toggles follow them.
  useEffect(() => setCi(f.ci ?? ""), [f.ci]);

  // Opening the sheet moves focus into it (Escape, handled on the sheet, closes it).
  useEffect(() => {
    if (open) sheetRef.current?.querySelector<HTMLElement>("button, select, input:not([type=hidden])")?.focus();
  }, [open]);

  /** Closing the sheet without "Show cards" cancels: the fields go back to the filters in the URL. */
  function close() {
    setOpen(false);
    setCi(f.ci ?? "");
    for (const s of sheetRef.current?.querySelectorAll("select") ?? []) {
      const i = [...s.options].findIndex((o) => o.defaultSelected);
      s.selectedIndex = Math.max(0, i);
    }
    for (const c of sheetRef.current?.querySelectorAll<HTMLInputElement>("input[type=checkbox]") ?? []) c.checked = c.defaultChecked;
    filtersButton.current?.focus();
  }

  function go(e?: React.FormEvent<HTMLFormElement>) {
    e?.preventDefault();
    const form = formRef.current;
    if (!form) return;
    setOpen(false);
    // On a phone, put the keyboard away so the answer is in view.
    if (document.activeElement instanceof HTMLInputElement) document.activeElement.blur();
    const url = queryOf(form);
    startTransition(() => router.push(url, { scroll: false }));
  }

  function toggleColour(k: string) {
    setCi((cur) => {
      if (k === "C") return cur === "C" ? "" : "C";
      const set = new Set(cur.replace("C", "").split("").filter(Boolean));
      if (set.has(k)) set.delete(k);
      else set.add(k);
      return "WUBRG".split("").filter((x) => set.has(x)).join("");
    });
  }

  const without = (...keys: string[]) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v && k !== "page" && !keys.includes(k)) q.set(k, v);
    const s = q.toString();
    return s ? `/collection?${s}` : "/collection";
  };
  const viewHref = (() => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v && k !== "view") q.set(k, v);
    if (f.view !== "grid") q.set("view", "grid");
    const s = q.toString();
    return s ? `/collection?${s}` : "/collection";
  })();
  const chips: { label: string; href: string }[] = [];
  if (f.ci) chips.push({ label: f.ci === "C" ? "Colourless" : `${MODE_LABEL[f.ciMode ?? "within"]} ${f.ci}`, href: without("ci", "ciMode") });
  if (f.type) chips.push({ label: cap(f.type), href: without("type") });
  if (f.rarity) chips.push({ label: cap(f.rarity), href: without("rarity") });
  if (f.set) chips.push({ label: sets.find((s) => s.code === f.set)?.name ?? f.set.toUpperCase(), href: without("set") });
  if (f.commander) chips.push({ label: "Commanders", href: without("commander") });
  if (f.loc) chips.push({ label: `In ${f.loc}`, href: without("loc") });
  if (f.nohome) chips.push({ label: "Needs a home", href: without("nohome") });

  const field = "h-12 w-full rounded-xl border border-line bg-panel px-3 text-base text-foreground md:h-11 md:text-sm";

  return (
    <div className="space-y-3">
      <form ref={formRef} action="/collection" method="get" onSubmit={go} role="search" className="space-y-3">
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <button type="submit" aria-label="Search" className="absolute inset-y-0 left-0 grid w-11 place-items-center text-muted hover:text-foreground">
              <Icon name="search" />
            </button>
            <label htmlFor="collection-q" className="sr-only">
              Search your cards by name, type or rules text
            </label>
            <input
              id="collection-q"
              name="q"
              type="search"
              enterKeyHint="search"
              autoComplete="off"
              defaultValue={f.q}
              key={f.q ?? ""}
              placeholder="Search your cards"
              className="h-12 w-full rounded-xl border border-line bg-panel pl-11 pr-3 text-base text-foreground placeholder:text-muted"
            />
          </div>
          <button
            ref={filtersButton}
            type="button"
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={open}
            className="inline-flex h-12 shrink-0 items-center gap-2 rounded-xl border border-line bg-panel px-3 text-sm text-muted hover:text-foreground"
          >
            <Icon name="settings" />
            <span className="sr-only md:not-sr-only">Filters</span>
            {chips.length > 0 && (
              <span className="min-w-5 rounded-full bg-(--panel-2) px-1.5 text-center text-xs font-semibold leading-5 text-foreground tabular-nums">{chips.length}</span>
            )}
          </button>
        </div>

        <div className="flex items-center justify-between gap-3">
          {/* Each part stays whole, so a narrow phone wraps between parts, never inside a number. */}
          <p className="min-w-0 text-sm text-muted tabular-nums">
            {summary.counts.map((part, i) => (
              <Fragment key={part}>
                <span className="whitespace-nowrap">
                  {part}
                  {(i < summary.counts.length - 1 || summary.value) && " ·"}
                </span>{" "}
              </Fragment>
            ))}
            {summary.value &&
              (summary.valueNote ? (
                <a href={summary.valueNote} className="whitespace-nowrap underline decoration-dotted underline-offset-4">
                  {summary.value}
                </a>
              ) : (
                <span className="whitespace-nowrap">{summary.value}</span>
              ))}
          </p>
          <div className="flex shrink-0 items-center">
          <Link
            href={viewHref}
            scroll={false}
            aria-label={f.view === "grid" ? "Show as a list" : "Show as pictures"}
            title={f.view === "grid" ? "Show as a list" : "Show as pictures"}
            className="grid h-11 w-11 place-items-center rounded-xl text-muted hover:bg-panel hover:text-foreground"
          >
            {f.view === "grid" ? (
              <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />
              </svg>
            ) : (
              <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
                <rect x="4" y="4" width="6.5" height="7" rx="1" />
                <rect x="13.5" y="4" width="6.5" height="7" rx="1" />
                <rect x="4" y="13" width="6.5" height="7" rx="1" />
                <rect x="13.5" y="13" width="6.5" height="7" rx="1" />
              </svg>
            )}
          </Link>
          <label className="relative flex shrink-0 items-center text-muted">
            <span className="sr-only">Sort by</span>
            <svg aria-hidden viewBox="0 0 24 24" className="pointer-events-none absolute left-2.5 h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 4v16M3.5 7.5 7 4l3.5 3.5M17 20V4M13.5 16.5 17 20l3.5-3.5" />
            </svg>
            <select
              name="sort"
              defaultValue={f.sort}
              key={f.sort}
              onChange={(e) => {
                const dir = e.currentTarget.form?.elements.namedItem("dir");
                if (dir instanceof HTMLInputElement) dir.value = "";
                go();
              }}
              className="h-11 appearance-none rounded-xl bg-transparent pl-8 pr-2 text-base font-medium text-(--accent-text) hover:bg-panel md:text-sm"
            >
              <option value="name">Name</option>
              <option value="cmc">Mana value</option>
              {(!hidePrices || f.sort === "price") && <option value="price">Value</option>}
              <option value="edhrec">Popularity</option>
              <option value="quantity">Copies</option>
              <option value="added">Newest</option>
            </select>
          </label>
          </div>
        </div>
        {f.dir && <input type="hidden" name="dir" defaultValue={f.dir} />}
        {f.view && <input type="hidden" name="view" defaultValue={f.view} />}

        {/* The filters are always in the form, so a search keeps them; the sheet only shows them. */}
        <div className={open ? "" : "hidden"}>
          <div className="sheet-scrim" onClick={close} />
          <div
            ref={sheetRef}
            className="sheet max-h-[85dvh] overflow-y-auto"
            role="dialog"
            aria-modal="true"
            aria-labelledby="collection-filters-title"
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                close();
              }
            }}
          >
            <h2 id="collection-filters-title" className="px-3 pb-1 pt-4 text-lg font-semibold">
              Filter your cards
            </h2>
            <div className="space-y-4 p-3">
              <fieldset>
                <legend className="mb-2 text-sm text-muted">Colour identity</legend>
                <input type="hidden" name="ci" value={ci} readOnly />
                <div className="flex flex-wrap gap-2">
                  {COLOURS.map((c) => {
                    const on = c.k === "C" ? ci === "C" : ci.includes(c.k);
                    return (
                      <button
                        key={c.k}
                        type="button"
                        aria-pressed={on}
                        aria-label={c.label}
                        title={c.label}
                        onClick={() => toggleColour(c.k)}
                        className={`grid h-11 w-11 place-items-center rounded-full border-2 text-sm font-bold text-black/80 ${on ? "border-foreground" : "border-transparent opacity-45"}`}
                        style={{ background: c.bg }}
                      >
                        {c.k}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
              <label className="block space-y-1 text-sm text-muted">
                <span>Match</span>
                <select name="ciMode" defaultValue={f.ciMode} key={f.ciMode} disabled={!ci || ci === "C"} className={`${field} disabled:opacity-50`}>
                  <option value="within">Fits a deck of these colours</option>
                  <option value="exact">Exactly these colours</option>
                  <option value="includes">Has these colours</option>
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1 text-sm text-muted">
                  <span>Type</span>
                  <select name="type" defaultValue={f.type ?? ""} key={f.type ?? ""} className={field}>
                    <option value="">Any</option>
                    {TYPES.map((t) => (
                      <option key={t} value={t}>
                        {cap(t)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1 text-sm text-muted">
                  <span>Rarity</span>
                  <select name="rarity" defaultValue={f.rarity ?? ""} key={f.rarity ?? ""} className={field}>
                    <option value="">Any</option>
                    {RARITIES.map((r) => (
                      <option key={r} value={r}>
                        {cap(r)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="block space-y-1 text-sm text-muted">
                <span>Set</span>
                <select name="set" defaultValue={f.set ?? ""} key={f.set ?? ""} className={field}>
                  <option value="">Any set</option>
                  {sets.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1 text-sm text-muted">
                <span>Box or binder</span>
                <select name="loc" defaultValue={f.nohome ? NOHOME : (f.loc ?? "")} key={`${f.loc ?? ""}${f.nohome ? NOHOME : ""}`} className={field}>
                  <option value="">Anywhere</option>
                  <option value={NOHOME}>Needs a home</option>
                  {f.loc && !places.includes(f.loc) && <option value={f.loc}>{f.loc}</option>}
                  {places.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex min-h-11 items-center gap-3 text-base md:text-sm">
                <input type="checkbox" name="commander" value="1" defaultChecked={f.commander} key={String(f.commander)} className="h-5 w-5 accent-(--accent)" />
                Only cards that can be your commander
              </label>
              <SearchTips />
            </div>
            <div className="flex items-center gap-2 p-3 pt-1">
              <button type="submit" className="h-12 flex-1 rounded-xl bg-accent px-4 text-base font-semibold text-accent-fg">
                Show cards
              </button>
              <Link href="/collection" onClick={() => setOpen(false)} className="inline-flex h-12 items-center rounded-xl px-4 text-base text-muted hover:text-foreground">
                Clear all
              </Link>
            </div>
          </div>
        </div>
      </form>

      {chips.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Filters on">
          {chips.map((c) => (
            <li key={c.label}>
              <Link href={c.href} scroll={false} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line px-3 text-sm hover:border-muted">
                {c.label}
                <span aria-hidden className="text-muted">
                  ✕
                </span>
                <span className="sr-only">(remove this filter)</span>
              </Link>
            </li>
          ))}
          {chips.length > 1 && (
            <li>
              <Link
                href={without("ci", "ciMode", "type", "rarity", "set", "commander", "loc", "nohome")}
                scroll={false}
                className="inline-flex min-h-11 items-center px-2 text-sm text-muted hover:text-foreground"
              >
                Clear filters
              </Link>
            </li>
          )}
        </ul>
      )}

      <div aria-busy={pending} className={`transition-opacity ${pending ? "opacity-60" : ""}`}>
        {children}
      </div>
    </div>
  );
}
