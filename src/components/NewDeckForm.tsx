"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ColorPips, Skeleton } from "./ui";
import { ChevronIcon, PRIMARY, SECONDARY, fmt } from "./decks/bits";
import { ColourPicker } from "./ColourPicker";
import { colourName } from "@/lib/cards/colours";
import { colorsParam } from "@/lib/cards/normalize";

export type CommanderOption = { oracleId: string; name: string; colorIdentity: string; imageSmall?: string | null };
type Theme = { slug: string; label: string; count?: number };

/** Owned commanders listed before "Show all". */
const OWNED_SHOWN = 8;
/** EDHREC themes shown as chips; the rest go in the "Another theme" menu. */
const EDHREC_SHOWN = 10;

/** "tokens+angels" (a mix from Find a commander) reads "Tokens & Angels". */
const prettySlug = (slug: string) =>
  slug
    .split("+")
    .map((part) =>
      part
        .split("-")
        .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
        .join(" "),
    )
    .join(" & ");

/**
 * The New deck flow: 1 · commander, 2 · theme, 3 · build. Each step keeps what you chose when an
 * earlier one changes: picking another commander keeps the theme and options, and the search text
 * stays. The commander and theme also live in the address, so a reload or Back keeps them.
 */
export function NewDeckForm({
  owned,
  initial,
  builtInThemes,
}: {
  owned: CommanderOption[];
  initial?: { commander?: CommanderOption; theme?: string };
  builtInThemes: Theme[];
}) {
  const router = useRouter();
  const [commander, setCommander] = useState<CommanderOption | undefined>(initial?.commander);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ q: string; cards: CommanderOption[] }>({ q: "", cards: [] });
  const [showAllOwned, setShowAllOwned] = useState(false);
  /** The deck's colours, if you've picked them: only commanders with exactly this identity are listed. */
  const [colours, setColours] = useState<string | undefined>();
  /** EDHREC's themes for one commander; loading while `for` isn't the chosen commander. */
  const [edh, setEdh] = useState<{ for: string; themes: Theme[]; failed: boolean }>();
  const [theme, setTheme] = useState(initial?.theme ?? "");
  const [buy, setBuy] = useState(true);
  const [status, setStatus] = useState<"building" | "idea">("idea");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const needle = q.trim();
  useEffect(() => {
    if (commander || needle.length < 2) return;
    let live = true;
    const t = setTimeout(async () => {
      const res = await fetch(`/api/cards/search?commander=1&q=${encodeURIComponent(needle)}`).catch(() => undefined);
      if (live && res?.ok) setHits({ q: needle, cards: (await res.json()).cards });
    }, 150);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [needle, commander]);

  useEffect(() => {
    if (!commander) return;
    let live = true;
    fetch(`/api/decks/themes?commander=${encodeURIComponent(commander.oracleId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((body: { themes: Theme[] }) => live && setEdh({ for: commander.oracleId, themes: body.themes.filter((t) => t.count), failed: false }))
      .catch(() => live && setEdh({ for: commander.oracleId, themes: [], failed: true }));
    return () => {
      live = false;
    };
  }, [commander]);

  // Keep the choices in the address (no reload), so a refresh or Back lands on the same form.
  useEffect(() => {
    const p = new URLSearchParams();
    if (commander) p.set("commander", commander.oracleId);
    if (theme) p.set("theme", theme);
    const qs = p.toString();
    window.history.replaceState(window.history.state, "", qs ? `?${qs}` : window.location.pathname);
  }, [commander, theme]);

  async function build() {
    if (!commander) return;
    setBusy(true);
    setError(undefined);
    const res = await fetch("/api/decks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commanderOracleId: commander.oracleId, theme: theme || null, status, settings: { suggestUnowned: buy } }),
    }).catch(() => undefined);
    if (!res?.ok) {
      setBusy(false);
      return setError("Couldn’t build that deck. Your choices are still here. Try again.");
    }
    const { id } = await res.json();
    router.push(`/decks/${id}`);
  }

  /* ---------- step 1: commander ---------- */
  const lower = needle.toLowerCase();
  const fitsColours = (o: CommanderOption) => colours === undefined || o.colorIdentity === colours;
  const ownedMatches = owned.filter((o) => (!lower || o.name.toLowerCase().includes(lower)) && fitsColours(o));
  const ownedShown = showAllOwned ? ownedMatches : ownedMatches.slice(0, OWNED_SHOWN);
  const ownedIds = new Set(owned.map((o) => o.oracleId));
  const others = needle.length >= 2 && hits.q === needle ? hits.cards.filter((h) => !ownedIds.has(h.oracleId) && fitsColours(h)) : [];

  /* ---------- step 2: theme ---------- */
  const themesLoading = !!commander && edh?.for !== commander.oracleId;
  const edhThemes = commander && edh?.for === commander.oracleId ? edh.themes : [];
  const chips: Theme[] = edhThemes.slice(0, EDHREC_SHOWN);
  const menu: Theme[] = [...edhThemes.slice(EDHREC_SHOWN), ...builtInThemes.filter((b) => !edhThemes.some((t) => t.slug === b.slug))];
  // A theme chosen earlier (or from Find a commander) that this commander's list doesn't have still shows.
  if (theme && !themesLoading && !chips.some((t) => t.slug === theme) && !menu.some((t) => t.slug === theme)) {
    chips.push({ slug: theme, label: prettySlug(theme) });
  }
  const themeName = theme ? ([...chips, ...menu].find((t) => t.slug === theme)?.label ?? prettySlug(theme)) : "No theme";

  return (
    <div className="space-y-6">
      {/* ---------------- 1 · Commander ---------------- */}
      <section aria-labelledby="step-commander" className="space-y-3">
        <StepTitle n={1} id="step-commander" done={!!commander}>
          Commander
        </StepTitle>
        {commander ? (
          <div className="flex items-center gap-3 rounded-xl border border-accent/50 bg-panel p-3">
            <Thumb src={commander.imageSmall} width="w-12" />
            <div className="min-w-0 flex-1 space-y-1">
              <p className="truncate font-medium">{commander.name}</p>
              <p className="flex items-center gap-2 text-sm text-muted">
                {ownedIds.has(commander.oracleId) ? "You own it" : "Not in your collection"}
                <ColorPips identity={commander.colorIdentity} />
              </p>
            </div>
            <button type="button" className={SECONDARY} onClick={() => setCommander(undefined)}>
              Change
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <ColourPicker label="Deck colours" value={colours} onChange={setColours} />
            <input
              type="search"
              className="h-12 w-full rounded-xl border border-line bg-panel px-4 text-base"
              placeholder="Search for a commander…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Search for a commander"
              autoComplete="off"
            />
            {ownedMatches.length > 0 ? (
              <div className="space-y-2">
                <p className="text-sm text-muted">{lower ? "Commanders you own that match" : "Commanders you own"}</p>
                <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-panel">
                  {ownedShown.map((o) => (
                    <li key={o.oracleId}>
                      <CommanderRow option={o} onPick={() => setCommander(o)} />
                    </li>
                  ))}
                </ul>
                {ownedMatches.length > ownedShown.length && (
                  <button type="button" className="inline-flex min-h-11 items-center gap-1 text-sm text-muted hover:text-foreground" onClick={() => setShowAllOwned(true)}>
                    Show all {fmt(ownedMatches.length)}
                    <ChevronIcon className="rotate-90" />
                  </button>
                )}
              </div>
            ) : (
              !lower &&
              (owned.length === 0 ? (
                <p className="text-sm text-muted">You don’t own a card that can lead a deck yet. Search for any commander, or find one by theme.</p>
              ) : (
                colours !== undefined && <p className="text-sm text-muted">You don’t own a commander in {colourName(colours)}. Search for one, or see popular ones below.</p>
              ))
            )}
            {others.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm text-muted">Not in your collection: you’d need to buy or proxy the commander</p>
                <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-panel">
                  {others.map((o) => (
                    <li key={o.oracleId}>
                      <CommanderRow option={o} onPick={() => setCommander(o)} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {lower.length >= 2 && hits.q === needle && ownedMatches.length === 0 && others.length === 0 && (
              <p className="text-sm text-muted">No commander matches “{needle}”.</p>
            )}
            <Link
              href={colours === undefined ? "/decks/commanders" : `/decks/commanders?colors=${colorsParam(colours)}`}
              className="inline-flex min-h-11 items-center gap-1 text-sm text-muted hover:text-foreground"
            >
              {colours === undefined ? "Not sure? Find a commander by theme" : `See popular ${colourName(colours)} commanders, and pick a theme`}
              <ChevronIcon />
            </Link>
          </div>
        )}
      </section>

      {/* ---------------- 2 · Theme ---------------- */}
      <section aria-labelledby="step-theme" className={`space-y-3 ${commander ? "" : "opacity-50"}`}>
        <StepTitle n={2} id="step-theme" done={!!commander}>
          Theme
        </StepTitle>
        {!commander ? (
          <p className="text-sm text-muted">Pick a commander first. Its most popular themes on EDHREC show up here.</p>
        ) : (
          <fieldset className="space-y-3">
            <legend className="sr-only">Theme for {commander.name}</legend>
            {themesLoading ? (
              <div className="space-y-2" aria-busy="true">
                <p className="text-sm text-muted">Looking up {commander.name}’s themes on EDHREC…</p>
                <div className="flex flex-wrap gap-2">
                  {Array.from({ length: 5 }, (_, i) => (
                    <Skeleton key={i} className="h-11 w-28 rounded-full" />
                  ))}
                </div>
              </div>
            ) : (
              <>
                {edhThemes.length === 0 && (
                  <p className="text-sm text-muted">
                    {edh?.failed ? "EDHREC’s themes couldn’t be loaded right now." : `EDHREC has no themes for ${commander.name}, or can’t be reached right now.`} The
                    themes below work from the cards’ rules text.
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <ThemeChip slug="" label="No theme" detail="strongest cards" checked={theme === ""} onPick={setTheme} />
                  {chips.map((t) => (
                    <ThemeChip
                      key={t.slug}
                      slug={t.slug}
                      label={t.label}
                      detail={t.count ? `${fmt(t.count)} decks` : undefined}
                      checked={theme === t.slug}
                      onPick={setTheme}
                    />
                  ))}
                </div>
                {edhThemes.length > 0 && <p className="text-xs text-muted">Counts are EDHREC decks with this commander and theme.</p>}
                {menu.length > 0 && (
                  <label className="block space-y-1">
                    <span className="text-sm text-muted">Another theme</span>
                    <select
                      className="h-12 w-full rounded-xl border border-line bg-panel px-3 text-base"
                      value={menu.some((t) => t.slug === theme) ? theme : ""}
                      onChange={(e) => setTheme(e.target.value)}
                    >
                      <option value="">Choose…</option>
                      {menu.map((t) => (
                        <option key={t.slug} value={t.slug}>
                          {t.label}
                          {t.count ? ` (${fmt(t.count)} decks)` : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </>
            )}
          </fieldset>
        )}
      </section>

      {/* ---------------- 3 · Build ---------------- */}
      <section aria-labelledby="step-build" className={`space-y-3 ${commander ? "" : "opacity-50"}`}>
        <StepTitle n={3} id="step-build" done={false}>
          Build
        </StepTitle>
        <fieldset className="grid gap-2 sm:grid-cols-2" disabled={!commander}>
          <legend className="sr-only">Save it as</legend>
          <StatusOption
            value="idea"
            checked={status === "idea"}
            onPick={setStatus}
            title="Save as an idea"
            detail="Holds none of your copies, so your other decks keep them."
          />
          <StatusOption
            value="building"
            checked={status === "building"}
            onPick={setStatus}
            title="Start building"
            detail="Holds the copies it uses, so no other deck counts them as free."
          />
        </fieldset>
        <label className="flex min-h-11 items-center gap-3 rounded-xl border border-line bg-panel px-3 py-2 text-sm">
          <input type="checkbox" className="h-5 w-5 shrink-0 accent-[var(--accent)]" checked={buy} onChange={(e) => setBuy(e.target.checked)} disabled={!commander} />
          Suggest cards to buy or proxy when my collection is short
        </label>
        {commander && (
          <p className="text-sm text-muted">
            {commander.name} · {themeName} · {status === "idea" ? "saved as an idea" : "building"}
          </p>
        )}
        <button type="button" className={`${PRIMARY} min-h-12 w-full rounded-xl text-base sm:w-auto sm:px-6`} disabled={!commander || busy} onClick={build}>
          {busy ? "Building… this takes a few seconds" : "Build deck"}
        </button>
        {error && (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}

function StepTitle({ n, id, done, children }: { n: number; id: string; done: boolean; children: React.ReactNode }) {
  return (
    <h2 id={id} className="flex items-center gap-2 text-lg font-semibold">
      <span
        aria-hidden
        className={`inline-grid h-7 w-7 place-items-center rounded-full text-sm tabular-nums ${done ? "bg-ok-bg text-ok" : "border border-line text-muted"}`}
      >
        {n}
      </span>
      {children}
    </h2>
  );
}

function Thumb({ src, width }: { src?: string | null; width: string }) {
  return (
    <span className={`relative aspect-[488/680] shrink-0 overflow-hidden rounded-[4.5%] bg-skeleton ${width}`}>
      {src && <Image src={src} alt="" fill sizes="48px" className="object-cover" />}
    </span>
  );
}

function CommanderRow({ option: o, onPick }: { option: CommanderOption; onPick: () => void }) {
  return (
    <button type="button" className="flex min-h-14 w-full items-center gap-3 px-3 py-1.5 text-left hover:bg-background" onClick={onPick}>
      <Thumb src={o.imageSmall} width="w-8" />
      <span className="min-w-0 flex-1 truncate">{o.name}</span>
      <ColorPips identity={o.colorIdentity} />
      <ChevronIcon />
    </button>
  );
}

function ThemeChip({ slug, label, detail, checked, onPick }: { slug: string; label: string; detail?: string; checked: boolean; onPick: (slug: string) => void }) {
  return (
    <label
      className={`inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border px-4 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${
        checked ? "border-accent bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] font-medium" : "border-line hover:bg-background"
      }`}
    >
      <input type="radio" name="theme" value={slug} checked={checked} onChange={() => onPick(slug)} className="sr-only" />
      {label}
      {detail && <span className="text-xs font-normal text-muted tabular-nums">{detail}</span>}
    </label>
  );
}

function StatusOption({
  value,
  checked,
  onPick,
  title,
  detail,
}: {
  value: "idea" | "building";
  checked: boolean;
  onPick: (v: "idea" | "building") => void;
  title: string;
  detail: string;
}) {
  return (
    <label
      className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border bg-panel p-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${
        checked ? "border-accent" : "border-line"
      }`}
    >
      <input type="radio" name="status" value={value} checked={checked} onChange={() => onPick(value)} className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--accent)]" />
      <span className="space-y-0.5">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted">{detail}</span>
      </span>
    </label>
  );
}
