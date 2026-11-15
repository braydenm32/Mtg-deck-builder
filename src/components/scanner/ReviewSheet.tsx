"use client";

/* eslint-disable @next/next/no-img-element -- Scryfall images are already sized JPGs on a CDN */
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Skeleton } from "@/components/ui";
import { printingsFor, searchNames } from "./api";
import { type Finish, LANGUAGES, type Printing, printingLabel, type ReviewItem, type ScanSettings } from "./types";

const FINISH_LABEL: Record<string, string> = { nonfoil: "Non-foil", foil: "Foil", etched: "Etched" };

/**
 * The confirm / correct step for a scan we're unsure about. It sits in the
 * bottom of the screen (one-handed reach) and never blocks the camera.
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
  // Unknown language means the card was found but its title didn't read as
  // English (e.g. an older Japanese card): make the user pick.
  const langUnknown = scan.status !== "not-found" && !!scan.best && !scan.lang;
  const [lang, setLang] = useState<string>(scan.lang ?? (langUnknown ? "" : "en"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const ref = useRef<HTMLElement>(null);

  // Bring the sheet into view on small screens (it appears below the camera).
  useEffect(() => {
    ref.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, []);

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

  const reason =
    scan.status === "not-found"
      ? "Couldn't read this card. Type its name:"
      : langUnknown
        ? "Found it by its number. Which language is it?"
        : !scan.name || scan.name.score < 0.8
          ? "Not sure about the name. Is this right?"
          : "Which printing is it?";

  async function add() {
    if (!printing || !lang) return;
    setBusy(true);
    setError(undefined);
    try {
      await onAdd(printing, finish, lang);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <section ref={ref} aria-label="Check this card" className="rounded-t-2xl border border-line bg-panel p-4 shadow-lg">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium">{item.replaces ? "Fix this card" : reason}</h2>
        {queued > 0 && <span className="text-xs text-muted">{queued} more to check</span>}
      </div>

      <div className="flex gap-3">
        <div className="w-24 shrink-0">
          {printing?.imageNormal || printing?.imageSmall ? (
            <img src={printing.imageNormal ?? printing.imageSmall} alt={printing.name} className="w-full rounded-md" />
          ) : printings === null ? (
            <Skeleton className="aspect-[63/88] w-full" />
          ) : item.preview ? (
            <img src={item.preview} alt="Your photo" className="w-full rounded-md opacity-80" />
          ) : (
            <div className="aspect-[63/88] w-full rounded-md bg-skeleton" />
          )}
          {item.preview && (printing?.imageNormal || printing?.imageSmall) && (
            <img src={item.preview} alt="Your photo" className="mt-1 w-12 rounded opacity-80" title="Your photo" />
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          {editingName ? (
            <div className="relative">
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={scan.read.nameText ? `Read as “${scan.read.nameText.split("\n")[0].slice(0, 30)}”` : "Card name"}
                className="h-11 w-full rounded-md border border-line bg-background px-3 text-base"
                aria-label="Card name"
              />
              {suggestions.length > 0 && (
                <ul className="absolute bottom-full z-10 mb-1 max-h-56 w-full overflow-auto rounded-md border border-line bg-panel shadow">
                  {suggestions.map((s) => (
                    <li key={s.name}>
                      <button
                        className="flex min-h-11 w-full items-center px-3 text-left text-sm hover:bg-background"
                        onClick={() => {
                          setName(s.name);
                          setEditingName(false);
                          setQuery("");
                        }}
                      >
                        {s.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <p className="truncate font-medium">{name}</p>
              <button className="min-h-11 shrink-0 px-2 text-sm text-accent" onClick={() => setEditingName(true)}>
                Wrong card?
              </button>
            </div>
          )}

          {name && (
            <div>
              <p className="mb-1 text-xs text-muted">Printing</p>
              {printings === null ? (
                <Skeleton className="h-11 w-full" />
              ) : printings.length === 0 ? (
                <p className="text-sm text-muted">No printings found.</p>
              ) : (
                <select
                  value={selectedId}
                  onChange={(e) => setSelectedId(e.target.value)}
                  className="h-11 w-full rounded-md border border-line bg-background px-2 text-sm"
                  aria-label="Printing"
                >
                  {printings.map((p) => (
                    <option key={p.scryfallId} value={p.scryfallId}>
                      {p.setName} · {printingLabel(p)}
                      {p.lang !== "en" ? ` · ${p.lang.toUpperCase()}` : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {printing && (
            <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Finish">
              {(["nonfoil", "foil", "etched"] as Finish[])
                .filter((f) => printing.finishes.includes(f) || f === finish)
                .map((f) => (
                  <button
                    key={f}
                    role="radio"
                    aria-checked={finish === f}
                    onClick={() => setFinish(f)}
                    className={`min-h-11 rounded-md border px-3 text-sm ${finish === f ? "border-accent bg-accent text-accent-fg" : "border-line"}`}
                  >
                    {FINISH_LABEL[f]}
                  </button>
                ))}
            </div>
          )}
          {printing && (
            <label className="block">
              <span className="mb-1 block text-xs text-muted">{langUnknown && !lang ? "Language: looks like it isn't English. Which is it?" : "Language"}</span>
              <select
                value={lang}
                onChange={(e) => setLang(e.target.value)}
                className={`h-11 w-full rounded-md border bg-background px-2 text-sm ${langUnknown && !lang ? "border-warn" : "border-line"}`}
                aria-label="Language"
              >
                {!lang && <option value="">Choose…</option>}
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {finishMissing && (
            <p className="rounded-md bg-warn-bg px-2 py-1 text-xs text-warn">
              This printing isn&apos;t made in {FINISH_LABEL[finish].toLowerCase()}. Pick its finish, or it will be saved as a guess.
            </p>
          )}
        </div>
      </div>

      {error && <p className="mt-2 rounded-md bg-danger-bg px-2 py-1 text-sm text-danger">{error}</p>}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="secondary" className="min-h-11" onClick={onSkip} disabled={busy}>
          {item.replaces ? "Cancel" : "Skip"}
        </Button>
        <Button className="min-h-11" onClick={add} disabled={!printing || !lang || busy}>
          {busy ? "Saving…" : item.replaces ? "Save" : "Add"}
        </Button>
      </div>
    </section>
  );
}
