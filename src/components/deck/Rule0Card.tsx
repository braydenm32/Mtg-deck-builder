"use client";

import { useState } from "react";
import type { Rule0 } from "@/lib/deck/rule0";
import { Sheet } from "./Sheet";

/**
 * "Rule 0 card": the pre-game talk about the deck on one card, to show across the table or copy into
 * the group chat (src/lib/deck/rule0.ts builds it).
 */
export function Rule0Card({ summary }: { summary: Rule0 }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<string>();
  const canShare = typeof navigator !== "undefined" && "share" in navigator;

  async function copy() {
    try {
      await navigator.clipboard.writeText(summary.text);
      setNote("Copied. Paste it into your group chat.");
    } catch {
      setNote("Couldn’t copy here. Select the text and copy it instead.");
    }
  }

  async function share() {
    try {
      await navigator.share({ title: `Rule 0: ${summary.title}`, text: summary.text });
    } catch {
      // Closing the share sheet throws; nothing to say.
    }
  }

  return (
    <>
      <button type="button" className="inline-flex min-h-11 items-center text-sm font-medium text-accent" onClick={() => (setNote(undefined), setOpen(true))}>
        Rule 0 card
      </button>
      {open && (
        <Sheet title={`Rule 0: ${summary.title}`} sub="What to tell your pod before the game" onClose={() => setOpen(false)}>
          <dl className="mx-3 divide-y divide-line overflow-hidden rounded-xl border border-line text-sm select-text">
            {summary.lines.map((l) => (
              <div key={l.label} className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-3 px-3 py-2">
                <dt className="text-muted">{l.label}</dt>
                <dd className={l.value === "None" ? "text-muted" : ""}>{l.value}</dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-wrap items-center gap-2 px-3 pt-3">
            <button type="button" className="inline-flex min-h-11 items-center rounded-xl bg-accent px-4 text-sm font-semibold text-accent-fg" onClick={() => void copy()}>
              Copy as text
            </button>
            {canShare && (
              <button type="button" className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm font-medium" onClick={() => void share()}>
                Share
              </button>
            )}
          </div>
          {note && (
            <p className="px-3 pt-2 text-[13px] text-muted" role="status">
              {note}
            </p>
          )}
          <p className="px-3 pt-2 text-[13px] text-muted">The bracket is an estimate from the cards. Your pod decides.</p>
        </Sheet>
      )}
    </>
  );
}
