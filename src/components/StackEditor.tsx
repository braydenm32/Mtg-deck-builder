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

const FINISH: Record<string, string> = { nonfoil: "Non-foil", foil: "Foil", etched: "Etched" };

/**
 * Edit quantities of owned stacks. Removing a stack can be undone.
 *
 * `look="new"` is the new look's version: the stepper stops at 1, Remove lives behind "⋯" (a sheet,
 * away from the stepper), and every change says it saved.
 */
export function StackEditor({ stacks, prices = DEFAULT_PRICE_VIEW, look = "old" }: { stacks: Stack[]; prices?: PriceView; look?: "old" | "new" }) {
  const router = useRouter();
  const [busy, setBusy] = useState<number>();
  const [removed, setRemoved] = useState<Stack>();
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState<string>();
  const [menu, setMenu] = useState<Stack>();

  async function setQty(s: Stack, quantity: number) {
    setBusy(s.id);
    setError(undefined);
    setSaved(undefined);
    setMenu(undefined);
    const res = await fetch(`/api/collection/items/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity }),
    });
    setBusy(undefined);
    if (!res.ok) return setError("Couldn't save that change.");
    if (quantity === 0) setRemoved(s);
    else setSaved(`Saved: ${quantity} of ${s.setCode.toUpperCase()} #${s.collectorNumber}.`);
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
    setSaved(`Put back ${s.quantity}× ${s.setCode.toUpperCase()} #${s.collectorNumber}.`);
    router.refresh();
  }

  if (look === "new") {
    return (
      <div className="space-y-2">
        {removed && (
          <div className="flex min-h-12 items-center justify-between gap-3 rounded-xl bg-warn-bg px-3 text-sm text-warn" role="status">
            <span>
              Removed {removed.quantity}× {removed.setCode.toUpperCase()} #{removed.collectorNumber}.
            </span>
            <button className="min-h-11 px-2 font-semibold underline" onClick={undo}>
              Undo
            </button>
          </div>
        )}
        {error && (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        )}
        {stacks.length > 0 && (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel">
            {stacks.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3">
                <div className="min-w-0 flex-1 basis-44">
                  <div className="font-medium">
                    {s.setCode.toUpperCase()} #{s.collectorNumber}
                    <span className="font-normal text-muted"> · {s.setName}</span>
                  </div>
                  <div className="text-[13px] text-muted">
                    {[
                      s.condition,
                      FINISH[s.finish] ?? s.finish,
                      s.lang !== "en" && s.lang.toUpperCase(),
                      s.proxy && "proxy",
                      s.altered && "altered",
                      s.signed && "signed",
                      s.misprint && "misprint",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    {" · "}
                    {s.location ? s.location : <span className="text-warn">needs a home</span>}
                    {!prices.hide && ` · ${money(s.unitPrice, prices)} each`}
                  </div>
                  {s.printingConfidence === "guessed" && (
                    <div className="mt-1 text-[13px] text-warn">
                      Printing guessed{s.matchNote ? `: ${s.matchNote}` : " from the name"}. Its value uses the cheapest printing.
                    </div>
                  )}
                  {s.printingConfidence !== "guessed" && s.matchNote && <div className="mt-1 text-[13px] text-warn">{s.matchNote}</div>}
                </div>
                <div className="ml-auto flex items-center gap-1">
                  <button
                    aria-label={`One fewer of ${s.setCode.toUpperCase()} #${s.collectorNumber}`}
                    className="h-11 w-11 rounded-xl border border-line text-lg disabled:opacity-40"
                    disabled={busy === s.id || s.quantity <= 1}
                    onClick={() => setQty(s, s.quantity - 1)}
                  >
                    −
                  </button>
                  <span className="w-8 text-center font-semibold tabular-nums" aria-label={`${s.quantity} copies`}>
                    {s.quantity}
                  </span>
                  <button
                    aria-label={`One more of ${s.setCode.toUpperCase()} #${s.collectorNumber}`}
                    className="h-11 w-11 rounded-xl border border-line text-lg disabled:opacity-40"
                    disabled={busy === s.id}
                    onClick={() => setQty(s, s.quantity + 1)}
                  >
                    +
                  </button>
                  <button
                    aria-label={`More for ${s.setCode.toUpperCase()} #${s.collectorNumber}`}
                    aria-haspopup="dialog"
                    className="ml-1 grid h-11 w-11 place-items-center rounded-xl text-muted hover:bg-(--panel-2) hover:text-foreground disabled:opacity-40"
                    disabled={busy === s.id}
                    onClick={() => setMenu(s)}
                  >
                    <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                      <circle cx="5.5" cy="12" r="1.6" />
                      <circle cx="12" cy="12" r="1.6" />
                      <circle cx="18.5" cy="12" r="1.6" />
                    </svg>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="text-[13px] text-muted" role="status">
          {saved}
        </p>
        {menu && (
          <>
            <div className="sheet-scrim" onClick={() => setMenu(undefined)} />
            <div className="sheet" role="dialog" aria-modal="true" aria-label={`${menu.setCode.toUpperCase()} #${menu.collectorNumber}`} onKeyDown={(e) => e.key === "Escape" && setMenu(undefined)}>
              <div className="sheet-title">
                {menu.quantity}× {menu.setName} #{menu.collectorNumber}
                {menu.location ? ` · ${menu.location}` : ""}
              </div>
              <button type="button" className="sheet-link text-danger" autoFocus onClick={() => setQty(menu, 0)}>
                Remove {menu.quantity === 1 ? "this copy" : `these ${menu.quantity} copies`} from your collection
              </button>
              <button type="button" className="sheet-close" onClick={() => setMenu(undefined)}>
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    );
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
