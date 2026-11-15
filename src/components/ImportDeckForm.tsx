"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { parseDecklist } from "@/lib/deck/decklist";
import { ColorPips } from "./ui";
import { CheckIcon, Chip, fmt, plural, PRIMARY, SECONDARY } from "./decks/bits";

type Candidate = { oracleId: string; name: string; colorIdentity: string };
type Done = { id: number; cards: number; unmatched: string[] };

/** The pasted list survives a reload or a trip to another page in this tab, until it's imported. */
const DRAFT_KEY = "commandery:decklist-draft";

const sum = (lines: { quantity: number }[]) => lines.reduce((n, l) => n + l.quantity, 0);

/**
 * Import a decklist: paste, check the preview, import, and see what happened. The preview reads the
 * text the same way the import does (parseDecklist); matching names to cards happens on import.
 */
export function ImportDeckForm() {
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>();
  const [commander, setCommander] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<Done>();

  useEffect(() => {
    try {
      const draft = sessionStorage.getItem(DRAFT_KEY);
      if (draft) setText(draft);
    } catch {
      // Storage can be off (private mode); the form still works, it just won't remember.
    }
  }, []);

  function changeText(value: string) {
    setText(value);
    // A different list means a different set of possible commanders.
    setCandidates(undefined);
    setCommander(undefined);
    try {
      if (value) sessionStorage.setItem(DRAFT_KEY, value);
      else sessionStorage.removeItem(DRAFT_KEY);
    } catch {}
  }

  const parsed = useMemo(() => (text.trim() ? parseDecklist(text) : undefined), [text]);
  const preview = parsed && {
    commanders: parsed.lines.filter((l) => l.board === "commander").map((l) => l.name),
    main: sum(parsed.lines.filter((l) => l.board === "main")),
    aside: sum(parsed.lines.filter((l) => l.board !== "main" && l.board !== "commander")),
    skipped: parsed.skipped,
  };
  const total = preview ? preview.main + preview.commanders.length : 0;
  const empty = !!preview && preview.main + preview.aside + preview.commanders.length === 0;

  async function submit() {
    setBusy(true);
    setError(undefined);
    const res = await fetch("/api/decks/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, name: name.trim() || undefined, commanderOracleId: commander }),
    }).catch(() => undefined);
    setBusy(false);
    if (!res) return setError("Couldn’t reach the app. Your list is still here. Try again.");
    const body = await res.json().catch(() => ({}));
    if (body.reason === "no-commander") {
      setCandidates(body.candidates);
      if (!body.candidates?.length) setError("We couldn’t find a commander in that list. Add a “Commander” section, or a line for a legendary creature.");
      return;
    }
    if (!res.ok) return setError(body.error ?? "Couldn’t import that list. Your list is still here.");
    try {
      sessionStorage.removeItem(DRAFT_KEY);
    } catch {}
    setDone({ id: body.id, cards: body.cards ?? 0, unmatched: body.unmatched ?? [] });
  }

  function startOver() {
    setDone(undefined);
    changeText("");
    setName("");
  }

  /* ---------------- 3 · the result ---------------- */
  if (done) {
    return (
      <section aria-labelledby="import-result" className="space-y-4 rounded-2xl border border-line bg-panel p-4 sm:p-5">
        <div className="flex items-start gap-3" role="status">
          <Chip tone="ok">
            <CheckIcon />
          </Chip>
          <div className="min-w-0 space-y-1">
            <h2 id="import-result" className="text-lg font-semibold">
              Imported
            </h2>
            <p className="text-sm text-muted tabular-nums">
              {fmt(done.cards)} {plural(done.cards, "card", "cards")} in the deck, besides the commander. It’s saved as an idea, so it holds none of your copies until
              you start building it.
            </p>
          </div>
        </div>
        {done.unmatched.length > 0 && (
          <div className="space-y-2 rounded-xl border border-line p-3">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Chip tone="warn">{fmt(done.unmatched.length)}</Chip>
              {plural(done.unmatched.length, "name wasn’t found, so it was left out", "names weren’t found, so they were left out")}
            </p>
            <ul className="space-y-1 pl-1 text-sm text-muted">
              {done.unmatched.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
            <p className="text-xs text-muted">Check the spelling, or add {done.unmatched.length === 1 ? "it" : "them"} on the deck’s Cards tab.</p>
          </div>
        )}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link href={`/decks/${done.id}`} className={`${PRIMARY} min-h-12 rounded-xl px-5 text-base`}>
            Open the deck
          </Link>
          <button type="button" className={`${SECONDARY} min-h-12 rounded-xl px-5`} onClick={startOver}>
            Import another list
          </button>
        </div>
      </section>
    );
  }

  /* ---------------- 1 · paste, 2 · preview ---------------- */
  return (
    <div className="space-y-4">
      <label className="block space-y-1">
        <span className="text-sm font-medium">Decklist</span>
        <textarea
          className="h-56 w-full rounded-xl border border-line bg-panel p-3 font-mono text-base sm:text-sm"
          placeholder={"Commander\n1 Korvold, Fae-Cursed King\n\nDeck\n1 Sol Ring\n1 Viscera Seer\n…"}
          value={text}
          onChange={(e) => changeText(e.target.value)}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">
          Deck name <span className="font-normal text-muted">(optional)</span>
        </span>
        <input className="h-12 w-full rounded-xl border border-line bg-panel px-3 text-base sm:h-11 sm:text-sm" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Korvold Food" />
      </label>

      {preview && (
        <section aria-labelledby="import-preview" aria-live="polite" className="space-y-2 rounded-2xl border border-line bg-panel p-4">
          <h2 id="import-preview" className="text-sm font-semibold text-muted">
            Preview
          </h2>
          {empty ? (
            <p className="text-sm">No card lines found yet. Each line should look like “1 Sol Ring”.</p>
          ) : (
            <>
              <p className="text-sm">
                {preview.commanders.length > 0 ? (
                  <>
                    <span className="text-muted">{plural(preview.commanders.length, "Commander", "Commanders")}:</span> {preview.commanders.join(" + ")}
                  </>
                ) : (
                  <span className="text-muted">No commander marked. You’ll pick one from the list’s legendary cards when you import.</span>
                )}
              </p>
              <p className="text-sm tabular-nums">
                {fmt(preview.main)} {plural(preview.main, "card", "cards")} in the deck
                {preview.aside > 0 && <span className="text-muted"> · {fmt(preview.aside)} more go to the maybeboard (sideboard, companion or maybe)</span>}
              </p>
              {preview.commanders.length > 0 && total !== 100 && (
                <p className="text-sm text-muted tabular-nums">
                  That’s {fmt(total)} with the {plural(preview.commanders.length, "commander", "commanders")}; a Commander deck has 100. You can still import it and fix it on the
                  deck.
                </p>
              )}
              {preview.skipped.length > 0 && (
                <details className="text-sm">
                  <summary className="inline-flex min-h-11 cursor-pointer items-center text-warn">
                    {fmt(preview.skipped.length)} {plural(preview.skipped.length, "line", "lines")} couldn’t be read and will be skipped
                  </summary>
                  <ul className="space-y-1 pb-1 font-mono text-xs text-muted">
                    {preview.skipped.map((s) => (
                      <li key={s.lineNumber}>
                        Line {s.lineNumber}: {s.raw}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <p className="text-xs text-muted">Card names are matched when you import. Every card is locked, so rebuilding keeps your list.</p>
            </>
          )}
        </section>
      )}

      {candidates && candidates.length > 0 && (
        <fieldset className="space-y-2 rounded-2xl border border-accent/50 bg-panel p-4">
          <legend className="px-1 text-sm font-medium">The list doesn’t say which card is the commander. Pick one:</legend>
          {candidates.map((c) => (
            <label key={c.oracleId} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-line px-3 text-sm has-[:checked]:border-accent">
              <input type="radio" name="commander" className="h-5 w-5 shrink-0 accent-[var(--accent)]" checked={commander === c.oracleId} onChange={() => setCommander(c.oracleId)} />
              <span className="min-w-0 flex-1">{c.name}</span>
              <ColorPips identity={c.colorIdentity} />
            </label>
          ))}
        </fieldset>
      )}

      <button
        type="button"
        className={`${PRIMARY} min-h-12 w-full rounded-xl text-base sm:w-auto sm:px-6`}
        disabled={!text.trim() || empty || busy || (!!candidates?.length && !commander)}
        onClick={submit}
      >
        {busy ? "Importing…" : candidates?.length ? "Import with this commander" : "Import deck"}
      </button>
      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
