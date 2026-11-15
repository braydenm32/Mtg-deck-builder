"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ImportPreview } from "@/lib/collection/import";
import { Button, Panel } from "./ui";

type Mode = "add" | "update";

export function ImportForm() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [filename, setFilename] = useState<string>();
  const [preview, setPreview] = useState<ImportPreview>();
  const [mode, setMode] = useState<Mode>("add");
  const [busy, setBusy] = useState<"preview" | "import">();
  const [error, setError] = useState<string>();

  async function runPreview(nextText: string) {
    setError(undefined);
    setPreview(undefined);
    if (!nextText.trim()) return;
    setBusy("preview");
    try {
      const res = await fetch("/api/import/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: nextText }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? `Preview failed (${res.status})`);
      const p: ImportPreview = await res.json();
      setPreview(p);
      setMode(p.suggestedMode);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(undefined);
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    const t = await file.text();
    setFilename(file.name);
    setText(t);
    await runPreview(t);
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
      if (!res.ok) throw new Error((await res.json()).error ?? `Import failed (${res.status})`);
      const summary = await res.json();
      router.push(`/import/${summary.batchId}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(undefined);
    }
  }

  return (
    <div className="space-y-4">
      <Panel className="space-y-3">
        <label className="block text-sm font-medium" htmlFor="file">
          Choose a CSV export
        </label>
        <input
          id="file"
          type="file"
          accept=".csv,.txt,text/csv,text/plain"
          onChange={(e) => onFile(e.target.files?.[0])}
          className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-accent file:px-3 file:py-2 file:text-accent-fg"
        />
        <p className="text-xs text-muted">
          Mythic Tools, ManaBox, Moxfield, Archidekt, Deckbox, TCGplayer and Delver Lens exports are recognised
          automatically. Other CSVs work if they have a name or Scryfall ID column.
        </p>
        <details className="text-sm" open={!!text && !filename}>
          <summary className="cursor-pointer text-muted">…or paste a card list or CSV</summary>
          <textarea
            className="mt-2 h-40 w-full rounded-md border border-line bg-background p-2 font-mono text-xs"
            placeholder={"4 Sol Ring (C21) 263\n1 Atraxa, Praetors' Voice\nLightning Bolt *F*"}
            value={filename ? "" : text}
            onChange={(e) => {
              setFilename(undefined);
              setText(e.target.value);
              setPreview(undefined);
            }}
          />
          <Button variant="secondary" disabled={!text.trim() || !!busy} onClick={() => runPreview(text)}>
            Check this list
          </Button>
        </details>
      </Panel>

      {busy === "preview" && <p className="text-sm text-muted">Reading the file…</p>}
      {error && <p className="rounded-md bg-danger-bg p-3 text-sm text-danger">{error}</p>}

      {preview && (
        <Panel className="space-y-4">
          <div>
            <h2 className="font-semibold">
              {preview.sourceLabel}
              {filename && <span className="font-normal text-muted"> · {filename}</span>}
            </h2>
            <p className="text-sm text-muted">
              {preview.rows.toLocaleString()} rows, {preview.copies.toLocaleString()} copies
              {preview.skipped > 0 && `, ${preview.skipped} rows skipped`}
            </p>
          </div>
          {preview.errors.length > 0 && (
            <ul className="list-disc rounded-md bg-warn-bg p-3 pl-6 text-sm text-warn">
              {preview.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          {preview.sample.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-muted">
                  <tr>
                    <th className="py-1 pr-3">Qty</th>
                    <th className="py-1 pr-3">Name</th>
                    <th className="py-1 pr-3">Set</th>
                    <th className="py-1 pr-3">#</th>
                    <th className="py-1 pr-3">Finish</th>
                    <th className="py-1">Lang</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.sample.map((r) => (
                    <tr key={r.rowNumber} className="border-t border-line">
                      <td className="py-1 pr-3 tabular-nums">{r.quantity}</td>
                      <td className="py-1 pr-3">{r.name ?? "—"}</td>
                      <td className="py-1 pr-3 uppercase">{r.set ?? "—"}</td>
                      <td className="py-1 pr-3">{r.number ?? "—"}</td>
                      <td className="py-1 pr-3">{r.finish}</td>
                      <td className="py-1">{r.lang ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.rows > preview.sample.length && (
                <p className="mt-1 text-xs text-muted">…and {preview.rows - preview.sample.length} more</p>
              )}
            </div>
          )}

          {preview.containers.length > 0 && (
            <p className="rounded-md border border-line p-3 text-sm">
              {preview.containers
                .map((c) => `${c.copies.toLocaleString()} copies in your ${c.type ? `${c.type} ` : ""}"${c.name}"`)
                .join(", ")}
              . These are added as cards you own, with the {preview.containers.length > 1 ? "container names" : "name"} as their
              location. If this file is a want or trade list rather than cards you have, don&apos;t import it.
            </p>
          )}

          <fieldset className="space-y-2 text-sm">
            <legend className="mb-1 font-medium">How should these be added?</legend>
            {preview.existingFromSource > 0 && (
              <label className="flex gap-2">
                <input type="radio" name="mode" checked={mode === "update"} onChange={() => setMode("update")} />
                <span>
                  Update from {preview.sourceLabel} <span className="text-xs text-muted">(recommended)</span>
                  <span className="block text-xs text-muted">
                    You imported from {preview.sourceLabel} before. This makes those cards match the file.
                    {preview.diff &&
                      ` ${preview.diff.added} new, ${preview.diff.changed} changed, ${preview.diff.removed} gone, ${preview.diff.unchanged} unchanged (stacks). Copies: ${preview.diff.copiesBefore.toLocaleString()} → ${preview.diff.copiesAfter.toLocaleString()}.`}{" "}
                    Scanned and hand-added cards stay. You can undo it afterwards.
                  </span>
                </span>
              </label>
            )}
            <label className="flex gap-2">
              <input type="radio" name="mode" checked={mode === "add"} onChange={() => setMode("add")} />
              <span>
                Add to my collection
                {preview.existingFromSource > 0 && (
                  <span className="block text-xs text-warn">
                    You already have {preview.existingFromSource.toLocaleString()} copies from {preview.sourceLabel}. Adding
                    this file on top will count shared cards twice.
                  </span>
                )}
              </span>
            </label>
          </fieldset>

          <Button onClick={runImport} disabled={!!busy || preview.rows === 0}>
            {busy === "import"
              ? "Importing…"
              : mode === "update"
                ? `Update from ${preview.sourceLabel}`
                : `Import ${preview.copies.toLocaleString()} copies`}
          </Button>
          {busy === "import" && (
            <p className="text-xs text-muted">Matching cards to Scryfall. Large collections take a little while.</p>
          )}
        </Panel>
      )}
    </div>
  );
}
