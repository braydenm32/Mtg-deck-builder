"use client";

import { useState } from "react";
import { Sheet } from "./Sheet";

const FORMATS = [
  ["text", "Plain list"],
  ["moxfield", "Moxfield"],
  ["archidekt", "Archidekt"],
  ["arena", "Arena"],
  ["mtgo", "MTGO"],
  ["missing", "Cards I still need"],
  ["pull", "Pull list"],
] as const;

/** Export, in the deck's top bar on every tab: a sheet of the same text lists the old Overview offered. */
export function DeckExport({ deckId, name }: { deckId: number; name: string }) {
  const [open, setOpen] = useState(false);
  const base = `/api/decks/${deckId}/export`;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Export"
        className="inline-flex h-11 min-w-11 items-center justify-center gap-2 rounded-xl px-2.5 text-sm font-medium text-muted hover:bg-panel hover:text-foreground"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14" />
        </svg>
        <span className="hidden min-[900px]:inline">Export</span>
      </button>
      {open && (
        <Sheet title={`Export ${name}`} sub="Text lists for other apps. Moxfield and Archidekt lists include the printing you own." onClose={() => setOpen(false)}>
          {FORMATS.map(([f, label]) => (
            <a key={f} className="sheet-link" href={`${base}?format=${f}&download=1`} onClick={() => setOpen(false)}>
              {label}
            </a>
          ))}
        </Sheet>
      )}
    </>
  );
}
