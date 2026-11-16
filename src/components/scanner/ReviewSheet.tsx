"use client";

/* eslint-disable @next/next/no-img-element -- Scryfall images are already sized JPGs on a CDN, and previews are object URLs */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Button, Skeleton } from "@/components/ui";
import { printingsFor, searchNames } from "./api";
import { Segmented } from "./Segmented";
import { FINISH_LABEL, languageUnknown, reviewHint } from "./text";
import { type Finish, LANGUAGES, type Printing, printingLabel, type ReviewItem, type ScanSettings } from "./types";

/** Printings shown as tiles (as many as a scan returns); a longer list from a name search adds "All printings" underneath. */
const TILES = 24;

/**
 * The confirm / correct step for a scan we're unsure about, inside the Add cards sheet (bottom sheet
 * on a phone, dialog on a laptop). The likely answer is one tap: the best guess is already picked.
 * Closing the sheet keeps the scan waiting; only Skip drops it.
 */
export function ReviewSheet({
  item,
  settings,
  onAdd,
  onSkip,
  queued,
}: {
  item: ReviewItem;
  settings: ScanSettings;
  onAdd: (p: Printing, finish: Finish, lang: string) => Promise<void>;
  onSkip: () => void;
  /** How many more scans are waiting behind this one. */
  queued: number;
}) {
  const { scan } = item;
  const initialName = scan.best?.printing.name ?? scan.name?.name ?? "";
  const [name, setName] = useState(initialName);
  const [query, setQuery] = useState("");
  const [editingName, setEditingName] = useState(!initialName);
  const [suggestions, setSuggestions] = useState<{ name: string; imageSmall: string | null }[]>([]);
  const [printings, setPrintings] = useState<Printing[] | null>(scan.candidates.length ? scan.candidates.map((c) => c.printing) : null);
  const [selectedId, setSelectedId] = useState(scan.best?.printing.scryfallId);
  const [finish, setFinish] = useState<Finish>(settings.finish);
  // The physical card's language. Unknown when the card was identified but its title isn't English: the user picks.
  const langUnknown = languageUnknown(scan);
  const [lang, setLang] = useState<string>(scan.lang ?? (langUnknown ? "" : "en"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const addRef = useRef<HTMLButtonElement>(null);
  const ids = useId();

  // The next card in the queue reuses the open sheet: put focus on its main button.
  useEffect(() => {
    if (initialName) requestAnimationFrame(() => addRef.current?.focus({ preventScroll: true }));
  }, [initialName]);

  // When the name changes, load that card's printings.
  useEffect(() => {
    if (!name || name === initialName) return;
    let live = true;
    setPrintings(null);
    printingsFor(name).then((list) => {
      if (!live) return;
      setPrintings(list);
      setSelectedId(list[0]?.scryfallId);
    });
    return () => {
      live = false;
    };
  }, [name, initialName]);

  useEffect(() => {
    if (!editingName || query.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    const t = setTimeout(() => searchNames(query).then(setSuggestions), 150);
    return () => clearTimeout(t);
  }, [query, editingName]);

  const printing = useMemo(() => printings?.find((p) => p.scryfallId === selectedId), [printings, selectedId]);
  const finishMissing = printing && !printing.finishes.includes(finish);
  // The printing's own finishes, plus the chosen one if it isn't made in it (so the warning below has something to point at).
  const finishes = (["nonfoil", "foil", "etched"] as Finish[]).filter((f) => printing?.finishes.includes(f) || f === finish);
  // Tiles for the first few printings; the chosen one always has a tile.
  const tiles = useMemo(() => {
    if (!printings) return [];
    const first = printings.slice(0, TILES);
    return printing && !first.includes(printing) ? [printing, ...first.slice(0, TILES - 1)] : first;
  }, [printings, printing]);

  async function add() {
    if (!printing || !lang) return;
    setBusy(true);
    setError(undefined);
    try {
      await onAdd(printing, finish, lang);
    } catch (e) {
      setError(`Not saved: ${e instanceof Error ? e.message : String(e)}. Try again.`);
      setBusy(false);
    }
  }

  const photo = item.preview;
  const cardImage = printing?.imageNormal ?? printing?.imageSmall;
  const label = "block text-sm font-medium text-muted";

  return (
    <div className="space-y-4">
      <p className="-mt-1 text-sm text-muted">
        {reviewHint(item)}
        {queued > 0 && <span className="font-medium text-warn"> {queued} more to check after this one.</span>}
      </p>

      <div className="flex gap-3">
        {/* Your photo beside the printing you're choosing, so they can be compared at a glance. */}
        <div className="flex shrink-0 gap-2">
          {photo && (
            <figure className="w-20">
              <img src={photo} alt="Your photo" className="aspect-[63/88] w-full rounded-md bg-skeleton object-cover" />
              <figcaption className="mt-1 text-center text-xs text-muted">Your photo</figcaption>
            </figure>
          )}
          {(!photo || !editingName) && (
            <figure className="w-20">
              {cardImage ? (
                <img src={cardImage} alt={printing ? `${printing.name}, ${printingLabel(printing)}` : ""} className="aspect-[63/88] w-full rounded-md bg-skeleton object-cover" />
              ) : printings === null && name ? (
                <Skeleton className="aspect-[63/88] w-full" />
              ) : (
                <div className="aspect-[63/88] w-full rounded-md border border-dashed border-line" />
              )}
              {photo && <figcaption className="mt-1 text-center text-xs text-muted">{printing ? printingLabel(printing) : "Match"}</figcaption>}
            </figure>
          )}
        </div>

        <div className="min-w-0 flex-1">
          {editingName ? (
            <div className="space-y-2">
              <label htmlFor={`${ids}-name`} className={label}>
                Card name
              </label>
              <input
                id={`${ids}-name`}
                autoFocus
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                enterKeyHint="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={scan.read.nameText ? `Read as “${scan.read.nameText.split("\n")[0].slice(0, 30)}”` : "e.g. Sol Ring"}
                className="h-12 w-full min-w-0 rounded-lg border border-line bg-background px-3 text-base text-foreground placeholder:text-muted"
              />
              {initialName && (
                <button type="button" className="-ml-2 inline-flex min-h-11 items-center px-2 text-sm text-muted hover:text-foreground" onClick={() => setEditingName(false)}>
                  Keep {name}
                </button>
              )}
            </div>
          ) : (
            <div>
              <p className="text-lg leading-snug font-semibold break-words">{name}</p>
              {printing && (
                <p className="text-sm text-muted">
                  {printing.setName} · {printingLabel(printing)}
                  {printing.lang !== "en" ? ` · ${printing.lang.toUpperCase()}` : ""}
                </p>
              )}
              <button type="button" className="-ml-2 inline-flex min-h-11 items-center px-2 text-sm font-medium text-accent" onClick={() => setEditingName(true)}>
                Wrong card? Search
              </button>
            </div>
          )}
        </div>
      </div>

      {editingName && suggestions.length > 0 && (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-background" aria-label="Matching cards">
          {suggestions.map((s) => (
            <li key={s.name}>
              <button
                type="button"
                className="flex min-h-12 w-full items-center gap-3 px-3 text-left text-sm hover:bg-panel"
                onClick={() => {
                  setName(s.name);
                  setEditingName(false);
                  setQuery("");
                }}
              >
                {s.imageSmall ? <img src={s.imageSmall} alt="" className="h-10 w-7 shrink-0 rounded-[3px] object-cover" /> : <span className="h-10 w-7 shrink-0" />}
                <span className="min-w-0 flex-1 truncate">{s.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {name && !editingName && (
        <div className="space-y-2">
          <p className={label} id={`${ids}-printing`}>
            Printing{printings && printings.length > 1 ? ` (${printings.length})` : ""}
          </p>
          {printings === null ? (
            <div className="flex gap-2" aria-busy="true">
              <Skeleton className="h-[150px] w-[84px] shrink-0" />
              <Skeleton className="h-[150px] w-[84px] shrink-0" />
              <Skeleton className="h-[150px] w-[84px] shrink-0" />
            </div>
          ) : printings.length === 0 ? (
            <p className="text-sm text-muted">The card data has no printings of {name}. Search for another name.</p>
          ) : (
            <>
              <div
                role="radiogroup"
                aria-labelledby={`${ids}-printing`}
                className="-mx-4 flex snap-x scroll-px-4 gap-2 overflow-x-auto px-4 pt-1 pb-2 min-[900px]:-mx-5 min-[900px]:scroll-px-5 min-[900px]:px-5"
              >
                {tiles.map((p) => {
                  const on = p.scryfallId === selectedId;
                  return (
                    <button
                      key={p.scryfallId}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      aria-label={`${p.setName}, ${printingLabel(p)}${p.lang !== "en" ? `, ${p.lang.toUpperCase()}` : ""}`}
                      onClick={() => setSelectedId(p.scryfallId)}
                      className={`w-[84px] shrink-0 snap-start rounded-lg p-1 text-left ${on ? "bg-background ring-2 ring-accent" : "ring-1 ring-line hover:ring-muted"}`}
                    >
                      {p.imageSmall ? (
                        <img src={p.imageSmall} alt="" loading="lazy" className="aspect-[63/88] w-full rounded-[4px] bg-skeleton object-cover" />
                      ) : (
                        <span className="block aspect-[63/88] w-full rounded-[4px] bg-skeleton" />
                      )}
                      <span className={`mt-1 block truncate text-xs ${on ? "font-semibold" : "font-medium"}`}>{printingLabel(p)}</span>
                      <span className="block truncate text-xs text-muted">{p.lang !== "en" ? p.lang.toUpperCase() : p.setName}</span>
                    </button>
                  );
                })}
              </div>
              {printings.length > tiles.length && (
                <select
                  value={selectedId}
                  onChange={(e) => setSelectedId(e.target.value)}
                  className="h-12 w-full min-w-0 rounded-lg border border-line bg-background px-3 text-base text-foreground"
                  aria-label={`All ${printings.length} printings`}
                >
                  {printings.map((p) => (
                    <option key={p.scryfallId} value={p.scryfallId}>
                      {p.setName} · {printingLabel(p)}
                      {p.lang !== "en" ? ` · ${p.lang.toUpperCase()}` : ""}
                    </option>
                  ))}
                </select>
              )}
            </>
          )}
        </div>
      )}

      {printing && !editingName && (
        <div className="space-y-1">
          <p className={label} id={`${ids}-finish`}>
            Finish
          </p>
          {finishes.length > 1 ? (
            <Segmented
              name={`${ids}-finish`}
              labelledBy={`${ids}-finish`}
              value={finish}
              onChange={(f) => setFinish(f as Finish)}
              options={finishes.map((f) => ({ value: f, label: FINISH_LABEL[f] }))}
            />
          ) : (
            <p className="text-sm">{FINISH_LABEL[finish]} only</p>
          )}
          {finishMissing && (
            <p className="rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn">
              This printing isn&apos;t made in {FINISH_LABEL[finish].toLowerCase()}. Pick its finish, or it will be saved as a guess.
            </p>
          )}
        </div>
      )}

      {printing && !editingName && (
        <div className="space-y-1">
          <label htmlFor={`${ids}-lang`} className={label}>
            Language
          </label>
          <select
            id={`${ids}-lang`}
            value={lang}
            onChange={(e) => setLang(e.target.value)}
            className={`h-12 w-full min-w-0 rounded-lg border bg-background px-3 text-base text-foreground ${lang ? "border-line" : "border-warn"}`}
          >
            {!lang && <option value="">Choose the card&apos;s language</option>}
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {error && (
        <p className="rounded-lg bg-danger-bg p-3 text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      <div className="grid grid-cols-[1fr_2fr] gap-2">
        <Button variant="secondary" className="min-h-12 text-base" onClick={onSkip} disabled={busy}>
          {item.replaces ? "Cancel" : "Skip"}
        </Button>
        <Button ref={addRef} className="min-h-12 text-base" onClick={add} disabled={!printing || !lang || busy || editingName} data-autofocus={editingName ? undefined : true}>
          {busy ? "Saving…" : item.replaces ? "Save" : printing ? `Add ${printingLabel(printing)}` : "Add"}
        </Button>
      </div>
      {!item.replaces && <p className="-mt-2 text-center text-xs text-muted">Skip leaves it out. Close keeps it here to check later.</p>}
    </div>
  );
}
