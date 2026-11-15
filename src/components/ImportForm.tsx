"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import type { ImportPreview, ImportSummary } from "@/lib/collection/import";
import { rememberOutcome } from "./add/ImportOutcome";
import { cardsFrom, plural, unsupportedFile } from "./add/text";
import { Badge, Button, Panel, Skeleton } from "./ui";

type Mode = "add" | "update";

const FINISH: Record<string, string> = { foil: "foil", etched: "etched" };

/**
 * Import a file: choose (or drop, or paste) an export, check the preview, pick Update or Add when
 * the app was imported before, then import. `aside` (recent imports) shows beside the picker and
 * gives way to the file's first rows once there's a preview.
 */
export function ImportForm({ aside }: { aside?: React.ReactNode }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const ids = useId();
  const [text, setText] = useState("");
  const [pasted, setPasted] = useState("");
  const [filename, setFilename] = useState<string>();
  const [preview, setPreview] = useState<ImportPreview>();
  const [mode, setMode] = useState<Mode>("add");
  const [busy, setBusy] = useState<"read" | "import">();
  const [error, setError] = useState<string>();
  const [dragging, setDragging] = useState(false);

  async function runPreview(nextText: string) {
    setError(undefined);
    setPreview(undefined);
    if (!nextText.trim()) return setError("That file is empty.");
    setBusy("read");
    try {
      const res = await fetch("/api/import/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: nextText }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `Couldn't read it (error ${res.status}).`);
      const p: ImportPreview = await res.json();
      setPreview(p);
      setMode(p.suggestedMode);
    } catch (e) {
      setError(e instanceof TypeError ? "Couldn't reach the app. Check your connection and try again." : (e as Error).message);
    } finally {
      setBusy(undefined);
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setPreview(undefined);
    const bad = unsupportedFile(file.name);
    if (bad) {
      setFilename(undefined);
      return setError(bad);
    }
    setFilename(file.name);
    setBusy("read");
    try {
      const t = await file.text();
      setText(t);
      await runPreview(t);
    } catch {
      setBusy(undefined);
      setError(`Couldn't open “${file.name}”. Try choosing it again.`);
    }
  }

  async function runImport() {
    setBusy("import");
    setError(undefined);
    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, filename, mode }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `Import failed (error ${res.status}). Nothing was changed.`);
      const summary: ImportSummary = await res.json();
      rememberOutcome(summary.batchId, summary);
      router.push(`/import/${summary.batchId}`);
    } catch (e) {
      setError(e instanceof TypeError ? "Couldn't reach the app, so nothing was imported. Try again." : (e as Error).message);
      setBusy(undefined);
    }
  }

  function startOver() {
    setPreview(undefined);
    setFilename(undefined);
    setText("");
    setError(undefined);
    if (fileInput.current) fileInput.current.value = "";
  }

  const chooseFile = () => fileInput.current?.click();

  /* The hidden file input is shared by "Choose a file" and "Change". */
  const input = (
    <input
      ref={fileInput}
      id={`${ids}-file`}
      type="file"
      accept=".csv,.txt,text/csv,text/plain"
      className="sr-only"
      tabIndex={-1}
      onChange={(e) => onFile(e.target.files?.[0])}
    />
  );

  const errorBox = error && (
    <div className="flex flex-wrap items-center gap-3 rounded-xl bg-danger-bg p-3 text-sm text-danger" role="alert">
      <span className="min-w-0 flex-1">{error}</span>
    </div>
  );

  /* ------------------------------------------------ preview ------------------------------------------------ */
  if (preview || busy === "read") {
    return (
      <div className="grid gap-6 min-[900px]:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] min-[900px]:items-start">
        {input}
        <div className="min-w-0 space-y-4">
          {busy === "read" ? (
            <div className="space-y-4" aria-busy="true">
              <span className="sr-only">Reading the file…</span>
              <Skeleton className="h-20 w-full rounded-xl" />
              <Skeleton className="h-36 w-full rounded-xl" />
              <Skeleton className="h-12 w-full rounded-xl" />
            </div>
          ) : (
            preview && (
              <Preview
                preview={preview}
                filename={filename}
                mode={mode}
                setMode={setMode}
                busy={busy}
                error={errorBox}
                onImport={runImport}
                onChange={chooseFile}
                onStartOver={startOver}
              />
            )
          )}
        </div>
        {preview && preview.sample.length > 0 && <FirstRows preview={preview} />}
      </div>
    );
  }

  /* ------------------------------------------------ picker ------------------------------------------------ */
  return (
    <div className="grid gap-6 min-[900px]:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] min-[900px]:items-start">
      <div className="min-w-0 space-y-4">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            onFile(e.dataTransfer.files?.[0]);
          }}
          className={`space-y-4 rounded-2xl border-2 border-dashed p-5 text-center transition-colors sm:p-8 ${dragging ? "border-accent bg-panel" : "border-line bg-panel/60"}`}
        >
          {input}
          <FileIcon className="mx-auto h-10 w-10 text-accent" />
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Choose your collection export</h2>
            <p className="mx-auto max-w-md text-sm text-muted">
              A CSV from Mythic Tools, ManaBox, Moxfield, Archidekt, Deckbox, TCGplayer, Delver Lens or Dragon Shield is recognised
              automatically. Other CSVs work if they have a card name or Scryfall ID column.
            </p>
          </div>
          <Button className="min-h-12 w-full text-base sm:w-auto sm:min-w-56" onClick={chooseFile}>
            Choose a file
          </Button>
          <p className="hidden text-xs text-muted min-[900px]:block">or drop it here</p>
        </div>

        {errorBox}

        <details className="group rounded-xl border border-line bg-panel" open={!!pasted && !filename}>
          <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 text-sm font-medium [&::-webkit-details-marker]:hidden">
            <span aria-hidden="true" className="text-muted transition-transform group-open:rotate-90">
              ›
            </span>
            Or paste a card list
          </summary>
          <div className="space-y-3 px-4 pb-4">
            <label htmlFor={`${ids}-paste`} className="block text-sm text-muted">
              One card per line, like “4 Sol Ring (C21) 263”. A pasted CSV works too.
            </label>
            <textarea
              id={`${ids}-paste`}
              className="h-40 w-full rounded-lg border border-line bg-background p-3 font-mono text-base sm:text-sm"
              placeholder={"4 Sol Ring (C21) 263\n1 Atraxa, Praetors' Voice\nLightning Bolt *F*"}
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
            />
            <Button
              variant="secondary"
              className="min-h-11"
              disabled={!pasted.trim()}
              onClick={() => {
                setFilename(undefined);
                setText(pasted);
                runPreview(pasted);
              }}
            >
              Check this list
            </Button>
          </div>
        </details>
      </div>
      {aside}
    </div>
  );
}

/* ------------------------------------------------ pieces ------------------------------------------------ */

function Preview({
  preview: p,
  filename,
  mode,
  setMode,
  busy,
  error,
  onImport,
  onChange,
  onStartOver,
}: {
  preview: ImportPreview;
  filename?: string;
  mode: Mode;
  setMode: (m: Mode) => void;
  busy?: "read" | "import";
  error: React.ReactNode;
  onImport: () => void;
  onChange: () => void;
  onStartOver: () => void;
}) {
  const ids = useId();
  const canUpdate = p.existingFromSource > 0;
  const empty = p.rows === 0;
  const d = p.diff;
  const noChange = d && d.added + d.changed + d.removed === 0;

  return (
    <>
      {/* The file, in one quiet row. */}
      <Panel className="flex items-center gap-3 rounded-xl">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-background text-accent">
          <FileIcon className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{filename ?? "Pasted list"}</p>
          <p className="text-sm text-muted">
            {p.sourceLabel} · {plural(p.rows, "row", "rows")} · {plural(p.copies, "copy", "copies")}
            {p.skipped > 0 && ` · ${p.skipped} skipped`}
          </p>
        </div>
        <button
          type="button"
          onClick={filename ? onChange : onStartOver}
          className="inline-flex min-h-11 shrink-0 items-center rounded-lg px-3 text-sm font-medium text-accent hover:bg-background"
        >
          {filename ? "Change" : "Edit"}
        </button>
      </Panel>

      {p.errors.length > 0 && (
        <div className="space-y-1 rounded-xl bg-warn-bg p-3 text-sm text-warn">
          <p className="font-medium">Some lines couldn&apos;t be read and will be left out:</p>
          <ul className="list-disc space-y-0.5 pl-5">
            {p.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {empty ? (
        <div className="space-y-3 rounded-xl border border-dashed border-line p-4 text-sm">
          <p className="font-medium">No cards found in this file.</p>
          <p className="text-muted">It needs a column with card names or Scryfall IDs. Check it&apos;s your collection export, not a deck or a price list.</p>
          <Button className="min-h-12 w-full text-base sm:w-auto" onClick={onChange}>
            Choose another file
          </Button>
        </div>
      ) : (
        <>
          {p.containers.length > 0 && (
            <p className="rounded-xl border border-line p-3 text-sm text-muted">
              This file is your{" "}
              {p.containers.map((c, i) => (
                <span key={`${c.type}|${c.name}`}>
                  {i > 0 && (i === p.containers.length - 1 ? " and " : ", ")}
                  {c.type ? `${c.type} ` : ""}
                  <span className="text-foreground">“{c.name}”</span> ({plural(c.copies, "copy", "copies")})
                </span>
              ))}
              . They&apos;re added as cards you own, with {p.containers.length > 1 ? "those names" : "that name"} as where they live. If it&apos;s a
              want or trade list, don&apos;t import it.
            </p>
          )}

          {canUpdate ? (
            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-semibold">You&apos;ve imported from {p.sourceLabel} before</legend>
              <ModeCard
                name={`${ids}-mode`}
                checked={mode === "update"}
                onSelect={() => setMode("update")}
                title="Update what you have"
                badge={<Badge tone="ok">Recommended</Badge>}
              >
                <span className="block">Makes {cardsFrom(p.sourceLabel)} match this file. Scanned and hand-added cards stay.</span>
                {d && (
                  <span className="mt-1 block text-foreground tabular-nums">
                    {noChange ? (
                      "Nothing has changed since last time."
                    ) : (
                      <>
                        {d.added} new · {d.changed} changed ·{" "}
                        {/* "Gone" stacks are removed from your collection, so they stand out. */}
                        <span className={d.removed > 0 ? "text-warn" : ""}>{d.removed} gone</span> · {d.unchanged} the same
                      </>
                    )}
                    <span className="block text-muted">
                      Copies: {d.copiesBefore.toLocaleString("en-AU")} → {d.copiesAfter.toLocaleString("en-AU")}
                    </span>
                  </span>
                )}
              </ModeCard>
              <ModeCard name={`${ids}-mode`} checked={mode === "add"} onSelect={() => setMode("add")} title="Add on top">
                <span className="block">Adds all {plural(p.copies, "copy", "copies")} to what you have.</span>
                <span className="mt-1 block text-warn">
                  You already have {plural(p.existingFromSource, "copy", "copies")} from {p.sourceLabel}, so cards in both would count twice.
                </span>
              </ModeCard>
            </fieldset>
          ) : (
            <p className="text-sm text-muted">These {plural(p.copies, "copy", "copies")} are added to your collection.</p>
          )}

          {error}

          <div className="space-y-2">
            <Button className="min-h-12 w-full text-base" onClick={onImport} disabled={!!busy}>
              {busy === "import" ? "Importing…" : mode === "update" ? "Update from this file" : `Import ${plural(p.copies, "copy", "copies")}`}
            </Button>
            <p className="text-center text-xs text-muted" aria-live="polite">
              {busy === "import" ? "Matching cards to Scryfall. Big collections take a little while." : "You can undo this afterwards."}
            </p>
          </div>
        </>
      )}
    </>
  );
}

function ModeCard({
  name,
  checked,
  onSelect,
  title,
  badge,
  children,
}: {
  name: string;
  checked: boolean;
  onSelect: () => void;
  title: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label
      className={`flex cursor-pointer gap-3 rounded-xl border p-4 transition-colors has-focus-visible:outline-2 has-focus-visible:outline-accent ${
        checked ? "border-accent bg-panel" : "border-line bg-panel/60 hover:bg-panel"
      }`}
    >
      <input type="radio" name={name} checked={checked} onChange={onSelect} className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--accent)]" />
      <span className="min-w-0 flex-1 text-sm text-muted">
        <span className="mb-1 flex flex-wrap items-center gap-2 text-base font-semibold text-foreground">
          {title} {badge}
        </span>
        {children}
      </span>
    </label>
  );
}

function FirstRows({ preview: p }: { preview: ImportPreview }) {
  return (
    <section aria-labelledby="first-rows" className="min-w-0 space-y-2">
      <h2 id="first-rows" className="text-sm font-semibold text-muted">
        First rows
      </h2>
      <ul className="divide-y divide-line rounded-xl border border-line bg-panel">
        {p.sample.map((r) => (
          <li key={r.rowNumber} className="flex items-baseline gap-3 px-3 py-2.5 text-sm">
            <span className="w-8 shrink-0 text-right text-muted tabular-nums">{r.quantity}×</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate">{r.name ?? "No name"}</span>
              <span className="block truncate text-xs text-muted">
                {[
                  // A set code reads best in capitals ("EOC"); a set given by its full name stays as written.
                  r.set && `${r.set.length <= 6 ? r.set.toUpperCase() : r.set}${r.number ? ` #${r.number}` : ""}`,
                  FINISH[r.finish],
                  r.lang && r.lang !== "en" && r.lang.toUpperCase(),
                ]
                  .filter(Boolean)
                  .join(" · ") || "No set given"}
              </span>
            </span>
          </li>
        ))}
      </ul>
      {p.rows > p.sample.length && <p className="text-xs text-muted">…and {plural(p.rows - p.sample.length, "more row", "more rows")}</p>}
    </section>
  );
}

function FileIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="M14 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8z" />
      <path d="M14 3.5V8h4.5M9 13h6M9 16.5h4" />
    </svg>
  );
}
