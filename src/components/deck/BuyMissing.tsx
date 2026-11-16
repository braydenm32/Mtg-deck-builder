"use client";

import { useState } from "react";
import { buyListText, storesFor, type BuyLine } from "@/lib/deck/buy";
import { showDeckToast } from "./DeckRowActions";
import { Sheet } from "./Sheet";

/**
 * "Buy these" on the Missing tab: send the cards you don't own to a store in one go. The list
 * leaves out cards marked as proxies. Stores that can't take the list in a link get it copied, so
 * it's ready to paste.
 */
export function BuyMissing({ lines, currency }: { lines: BuyLine[]; currency: string }) {
  const [open, setOpen] = useState(false);
  const count = lines.reduce((n, l) => n + l.quantity, 0);
  if (!count) return null;
  const text = buyListText(lines);

  async function copy(then?: string) {
    const ok = await navigator.clipboard?.writeText(text).then(
      () => true,
      () => false,
    );
    showDeckToast(ok ? { message: then ? `List copied. Paste it on ${then}.` : "List copied" } : { message: "Couldn’t copy. Select the list and copy it instead.", error: true });
  }

  return (
    <>
      <button type="button" className="inline-flex min-h-11 items-center text-sm font-medium text-accent" onClick={() => setOpen(true)}>
        Buy these
      </button>
      {open && (
        <Sheet title={`Buy ${count} ${count === 1 ? "card" : "cards"}`} sub="Cards you’ve marked as proxies are left out." onClose={() => setOpen(false)}>
          <ul className="pb-1">
            {storesFor(currency).map((s) => (
              <li key={s.id}>
                <a
                  className="sheet-link justify-between"
                  href={s.url(lines)}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => {
                    if (!s.prefilled) void copy(s.name);
                  }}
                >
                  <span className="min-w-0">
                    <span className="block">{s.name}</span>
                    <span className="block text-[13px] text-muted">{s.help}</span>
                  </span>
                  <span className="text-[13px] text-muted">{s.where}</span>
                </a>
              </li>
            ))}
            <li>
              <button type="button" className="sheet-link" onClick={() => void copy()}>
                Copy the list
              </button>
            </li>
          </ul>
          <pre className="mx-3 mb-2 max-h-40 overflow-auto rounded-xl border border-line bg-background p-3 text-[13px] leading-relaxed text-muted select-all">{text}</pre>
        </Sheet>
      )}
    </>
  );
}
