"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { COLLECTION_EXPORT_FORMATS, COLLECTION_EXPORT_LABELS } from "@/lib/collection/export-formats";

type Counts = { stacks: number; copies: number; decks: number; deckCards: number; imports: number };
type Check = { file: Blob; name: string; backup: Counts; current: Counts; exportedAt: string };

const n = (v: number, one: string, many: string) => `${v.toLocaleString("en-AU")} ${v === 1 ? one : many}`;
const summary = (c: Counts) => `${n(c.copies, "card", "cards")} and ${n(c.decks, "deck", "decks")}`;

/** Backups download gzipped (.json.gz). A plain .json one is gzipped here, so it fits under the host's upload limit. */
async function gzipped(file: File): Promise<Blob> {
  const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
  if ((head[0] === 0x1f && head[1] === 0x8b) || typeof CompressionStream === "undefined") return file;
  return new Response(file.stream().pipeThrough(new CompressionStream("gzip"))).blob();
}

/**
 * Settings › Your data: export the collection for another app, download a backup of everything,
 * or restore one. Restoring replaces what's here, so it shows both sides first and offers a backup
 * of the current data before anything changes.
 */
export function YourData() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [check, setCheck] = useState<Check>();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>();
  const [savedFirst, setSavedFirst] = useState(false);

  async function choose(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setStatus("Checking the backup…");
    setCheck(undefined);
    setSavedFirst(false);
    try {
      const body = await gzipped(file);
      const res = await fetch("/api/backup/restore", { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body });
      const json = await res.json();
      if (!json.ok) {
        setStatus(json.error ?? "That file couldn’t be read.");
        return;
      }
      setCheck({ file: body, name: file.name, backup: json.backup, current: json.current, exportedAt: json.exportedAt });
      setStatus(undefined);
    } catch {
      setStatus("That didn’t work. Check your connection and try again.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function restore() {
    if (!check) return;
    setBusy(true);
    setStatus("Restoring…");
    try {
      const res = await fetch("/api/backup/restore?confirm=1", {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: check.file,
      });
      const json = await res.json();
      if (!json.ok) {
        setStatus(json.error ?? "That didn’t restore. Nothing was changed.");
        return;
      }
      setCheck(undefined);
      setStatus(`Restored ${summary(json.counts)} from the backup.`);
      router.refresh();
    } catch {
      setStatus("That didn’t restore. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const row = "flex min-h-14 items-center justify-between gap-4 px-4 py-3 hover:bg-(--panel-2)";
  return (
    <section id="data" aria-labelledby="data-h" className="scroll-mt-20 space-y-3">
      <div className="overflow-hidden rounded-2xl border border-line bg-panel">
        <h2 id="data-h" className="px-4 pt-4 text-[13px] font-medium text-muted">
          Your data
        </h2>
        <p className="px-4 pb-1 pt-1 text-[13px] text-muted">This app is the only copy of your collection and decks, so keep a backup somewhere safe.</p>
        <a href="/api/backup" download className={row}>
          <span className="min-w-0">
            <span className="block font-medium">Download a backup</span>
            <span className="block text-[13px] text-muted">Your collection, decks, import history and settings, in one file.</span>
          </span>
          <span aria-hidden className="text-muted">↓</span>
        </a>
        <div className="border-t border-line">
          <p className="px-4 pt-3 text-[13px] font-medium text-muted" aria-hidden>
            Export your collection
          </p>
          {COLLECTION_EXPORT_FORMATS.map((f) => (
            <a key={f} href={`/api/collection/export?format=${f}`} download className={row}>
              <span className="min-w-0">
                <span className="block">{COLLECTION_EXPORT_LABELS[f].label}</span>
                <span className="block text-[13px] text-muted">{COLLECTION_EXPORT_LABELS[f].help}</span>
              </span>
              <span aria-hidden className="text-muted">↓</span>
            </a>
          ))}
        </div>
        <div className="border-t border-line">
          <label className={`${row} cursor-pointer ${busy ? "pointer-events-none opacity-60" : ""}`}>
            <span className="min-w-0">
              <span className="block">Restore from a backup</span>
              <span className="block text-[13px] text-muted">Choose a backup file. You&rsquo;ll see what it holds before anything changes.</span>
            </span>
            <span aria-hidden className="text-muted">↑</span>
            <input ref={input} type="file" accept=".gz,.json,application/gzip,application/json" className="sr-only" disabled={busy} onChange={(e) => choose(e.target.files?.[0])} />
          </label>
        </div>
      </div>

      {check && (
        <div role="dialog" aria-labelledby="restore-h" className="space-y-3 rounded-2xl border border-(--warn) bg-panel p-4">
          <h3 id="restore-h" className="font-semibold">
            Replace everything with this backup?
          </h3>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-muted">Now</dt>
            <dd>{summary(check.current)}</dd>
            <dt className="text-muted">Backup</dt>
            <dd>
              {summary(check.backup)}, saved {new Date(check.exportedAt).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })}
            </dd>
          </dl>
          <p className="text-sm text-muted">Your collection, decks, import history and settings become the backup&rsquo;s. Card data and prices stay as they are.</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <a
              href="/api/backup"
              download
              onClick={() => setSavedFirst(true)}
              className="inline-flex min-h-12 items-center justify-center rounded-xl border border-line px-4 text-sm"
            >
              {savedFirst ? "Saved a copy of what’s here ✓" : "First, save a copy of what’s here"}
            </a>
            <button
              type="button"
              onClick={restore}
              disabled={busy}
              className="inline-flex min-h-12 items-center justify-center rounded-xl bg-(--danger) px-4 text-sm font-semibold text-white disabled:opacity-60"
            >
              Replace with the backup
            </button>
            <button type="button" onClick={() => setCheck(undefined)} className="inline-flex min-h-12 items-center justify-center rounded-xl px-4 text-sm text-muted hover:text-foreground">
              Cancel
            </button>
          </div>
        </div>
      )}
      <p className="min-h-5 px-1 text-[13px] text-muted" role="status">
        {status}
      </p>
    </section>
  );
}
