"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DEFAULT_PRICE_VIEW, type PriceView } from "@/lib/money";
import { money } from "./ui";

export type Stack = {
  id: number;
  printingId: string;
  quantity: number;
  finish: string;
  condition: string;
  lang: string;
  location: string;
  altered: boolean;
  signed: boolean;
  misprint: boolean;
  proxy: boolean;
  purchasePrice: number | null;
  setCode: string;
  setName: string;
  collectorNumber: string;
  unitPrice: number | null;
  source: string;
  printingConfidence: string;
  matchNote: string;
};

/** Edit quantities of owned stacks. Removing a stack can be undone. */
export function StackEditor({ stacks, prices = DEFAULT_PRICE_VIEW }: { stacks: Stack[]; prices?: PriceView }) {
  const router = useRouter();
  const [busy, setBusy] = useState<number>();
  const [removed, setRemoved] = useState<Stack>();
  const [error, setError] = useState<string>();

  async function setQty(s: Stack, quantity: number) {
    setBusy(s.id);
    setError(undefined);
    const res = await fetch(`/api/collection/items/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity }),
    });
    setBusy(undefined);
    if (!res.ok) return setError("Couldn't save that change.");
    if (quantity === 0) setRemoved(s);
    router.refresh();
  }

  async function undo() {
    if (!removed) return;
    const s = removed;
    const res = await fetch("/api/collection/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: s.source,
        cards: [
          {
            scryfallId: s.printingId,
            quantity: s.quantity,
            finish: s.finish,
            lang: s.lang,
            condition: s.condition || undefined,
            location: s.location || undefined,
            altered: s.altered,
            signed: s.signed,
            misprint: s.misprint,
            proxy: s.proxy,
            purchasePrice: s.purchasePrice ?? undefined,
            printingConfidence: s.printingConfidence,
          },
        ],
      }),
    });
    if (!res.ok) return setError("Couldn't undo.");
    setRemoved(undefined);
    router.refresh();
  }

  return (
    <div className="space-y-2">
      {removed && (
        <div className="flex items-center justify-between rounded-md bg-warn-bg p-3 text-sm text-warn">
          <span>
            Removed {removed.quantity}× {removed.setName} #{removed.collectorNumber}.
          </span>
          <button className="font-semibold underline" onClick={undo}>
            Undo
          </button>
        </div>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
      <ul className="divide-y divide-line rounded-lg border border-line bg-panel">
        {stacks.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
            <div className="min-w-0 flex-1 basis-48">
              <div className="font-medium">
                {s.setName} <span className="text-muted">({s.setCode.toUpperCase()}) #{s.collectorNumber}</span>
              </div>
              <div className="text-xs text-muted">
                {[
                  s.finish !== "nonfoil" && s.finish,
                  s.condition,
                  s.lang !== "en" && s.lang.toUpperCase(),
                  s.location,
                  s.proxy && "proxy",
                  s.altered && "altered",
                  s.signed && "signed",
                  s.misprint && "misprint",
                ]
                  .filter(Boolean)
                  .join(" · ") || "nonfoil"}
                {!prices.hide && ` · ${money(s.unitPrice, prices)} each`}
                {s.printingConfidence === "guessed" && (
                  <span className="ml-1 rounded bg-warn-bg px-1 text-warn" title="The import only gave the card name (or a finish this printing isn't made in), so this printing is a guess. Its value uses the cheapest printing.">
                    printing guessed
                  </span>
                )}
                {s.matchNote && <span className="mt-0.5 block text-warn">{s.matchNote}</span>}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                aria-label="One fewer"
                className="h-11 w-11 rounded-md border border-line disabled:opacity-50"
                disabled={busy === s.id}
                onClick={() => setQty(s, s.quantity - 1)}
              >
                −
              </button>
              <span className="w-8 text-center tabular-nums">{s.quantity}</span>
              <button
                aria-label="One more"
                className="h-11 w-11 rounded-md border border-line disabled:opacity-50"
                disabled={busy === s.id}
                onClick={() => setQty(s, s.quantity + 1)}
              >
                +
              </button>
              <button
                className="ml-1 min-h-11 px-2 text-xs text-danger underline disabled:opacity-50"
                disabled={busy === s.id}
                onClick={() => setQty(s, 0)}
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
