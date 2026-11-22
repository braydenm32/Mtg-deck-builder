"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Place } from "@/lib/collection/locations";
import { convert, currencySymbol, DEFAULT_PRICE_VIEW, toUsd, type PriceView } from "@/lib/money";
import { cancelCollectionWrite, sendOrQueue, useCollectionOutbox } from "@/lib/offline/collection-outbox";
import { MoveSheet } from "./MoveSheet";
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
  /** Your own labels; "trade" puts the stack on the for-trade list. */
  tags?: string[];
};

const FINISH: Record<string, string> = { nonfoil: "Non-foil", foil: "Foil", etched: "Etched" };

/**
 * Edit quantities of owned stacks. Removing a stack can be undone.
 *
 * The stepper stops at 1, Remove lives behind "⋯" (a sheet, away from the stepper), and every
 * change says it saved. Copies can move to another box or binder (`places` are the ones you
 * already have), and a stack with no home gets a button for it.
 */
export function StackEditor({
  stacks,
  prices = DEFAULT_PRICE_VIEW,
  places = [],
}: {
  stacks: Stack[];
  prices?: PriceView;
  places?: Place[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<number>();
  const [removed, setRemoved] = useState<Stack>();
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState<string>();
  const [menu, setMenu] = useState<Stack>();
  const [moving, setMoving] = useState<Stack>();
  const [paying, setPaying] = useState<Stack>();
  const [paid, setPaid] = useState("");
  const [tagging, setTagging] = useState<Stack>();
  const [tagText, setTagText] = useState("");
  const [selling, setSelling] = useState<Stack>();
  const [sellCount, setSellCount] = useState(1);
  const [sellPrice, setSellPrice] = useState("");
  const [sellNote, setSellNote] = useState("");

  const label = (s: Stack) => `${s.setCode.toUpperCase()} #${s.collectorNumber}`;
  // Changes made with no connection wait on this device (src/lib/offline/collection-outbox.ts).
  const waiting = useCollectionOutbox().queue.filter((w) => stacks.some((s) => w.url === `/api/collection/items/${s.id}` || w.url.startsWith(`/api/collection/items/${s.id}/`)));
  const WAIT_NOTE = "Saved on this device. It goes through when you’re back online.";
  /** A stack as the waiting changes leave it: the last copy count asked for shows, so + and − carry on from it. */
  const shown = (s: Stack): Stack => {
    const last = waiting.filter((w) => w.url === `/api/collection/items/${s.id}` && typeof (w.body as { quantity?: unknown })?.quantity === "number").pop();
    return last ? { ...s, quantity: (last.body as { quantity: number }).quantity } : s;
  };

  async function setQty(s: Stack, quantity: number) {
    setBusy(s.id);
    setError(undefined);
    setSaved(undefined);
    setMenu(undefined);
    const r = await sendOrQueue({
      label: quantity === 0 ? `Remove ${label(s)}` : `${quantity} of ${label(s)}`,
      url: `/api/collection/items/${s.id}`,
      method: "PATCH",
      body: { quantity },
    });
    setBusy(undefined);
    if (r.queued) return setSaved(WAIT_NOTE);
    if (!r.ok) return setError("Couldn't save that change.");
    if (quantity === 0) setRemoved(s);
    else setSaved(`Saved: ${quantity} of ${s.setCode.toUpperCase()} #${s.collectorNumber}.`);
    router.refresh();
  }

  async function move(s: Stack, location: string, count: number) {
    setError(undefined);
    setSaved(undefined);
    const r = await sendOrQueue({
      label: `Move ${count === 1 ? "1 copy" : `${count} copies`} of ${label(s)} to ${location || "no box"}`,
      url: `/api/collection/items/${s.id}`,
      method: "PATCH",
      body: { location, moveQuantity: count < s.quantity ? count : undefined },
    });
    setMoving(undefined);
    if (r.queued) return setSaved(WAIT_NOTE);
    if (!r.ok) return setError("Couldn't move them. Try again.");
    setSaved(`Moved ${count === 1 ? (s.quantity === 1 ? "it" : "1 copy") : `${count} copies`} to ${location}.`);
    router.refresh();
  }

  /** Save what each copy cost, typed in your currency and kept in US dollars. Empty forgets it. */
  async function savePaid(s: Stack) {
    const n = Number.parseFloat(paid.replace(/[^0-9.]/g, ""));
    const usd = paid.trim() === "" ? null : Number.isFinite(n) && n >= 0 ? toUsd(n, prices) : undefined;
    if (usd === undefined) return setError("That isn't a price. Type a number, like 4.50.");
    setBusy(s.id);
    setError(undefined);
    const r = await sendOrQueue({
      label: usd == null ? `Forget what you paid for ${label(s)}` : `Paid ${money(usd, prices)} each for ${label(s)}`,
      url: `/api/collection/items/${s.id}`,
      method: "PATCH",
      body: { purchasePrice: usd },
    });
    setBusy(undefined);
    setPaying(undefined);
    if (r.queued) return setSaved(WAIT_NOTE);
    if (!r.ok) return setError("Couldn't save that. Try again.");
    setSaved(usd == null ? "Forgot what you paid." : `Saved: paid ${money(usd, prices)} each.`);
    router.refresh();
  }

  /** Save a stack's tags, typed as a comma-separated list. */
  async function saveTags(s: Stack, tags: string[]) {
    setBusy(s.id);
    setError(undefined);
    const r = await sendOrQueue({ label: `Tags on ${label(s)}`, url: `/api/collection/items/${s.id}`, method: "PATCH", body: { tags } });
    setBusy(undefined);
    setTagging(undefined);
    if (r.queued) return setSaved(WAIT_NOTE);
    if (!r.ok) return setError("Couldn't save the tags. Try again.");
    const wasTrade = (s.tags ?? []).some((t) => t.toLowerCase() === "trade");
    const isTrade = tags.some((t) => t.toLowerCase() === "trade");
    setSaved(
      isTrade !== wasTrade && tags.filter((t) => t.toLowerCase() !== "trade").join() === (s.tags ?? []).filter((t) => t.toLowerCase() !== "trade").join()
        ? isTrade
          ? "On your for-trade list."
          : "Off your for-trade list."
        : tags.length
          ? `Tagged ${tags.join(", ")}.`
          : "Tags cleared.",
    );
    router.refresh();
  }

  /** Sell copies: they leave the collection, and the sale goes in the activity log with its price. */
  async function sell(s: Stack) {
    const n = Number.parseFloat(sellPrice.replace(/[^0-9.]/g, ""));
    const usd = sellPrice.trim() === "" ? null : Number.isFinite(n) && n >= 0 ? toUsd(n, prices) : undefined;
    if (usd === undefined) return setError("That isn't a price. Type a number, like 4.50, or leave it empty.");
    setBusy(s.id);
    setError(undefined);
    const r = await sendOrQueue({
      label: `Sell ${sellCount} of ${label(s)}`,
      url: `/api/collection/items/${s.id}/sell`,
      method: "POST",
      body: { count: sellCount, priceUsd: usd, note: sellNote },
    });
    setBusy(undefined);
    setSelling(undefined);
    if (r.queued) return setSaved(WAIT_NOTE);
    if (!r.ok) return setError("Couldn't record the sale. Try again.");
    setSaved(`Sold ${sellCount === 1 ? "1 copy" : `${sellCount} copies`}${usd != null ? ` at ${money(usd, prices)} each` : ""}. It's in the activity log.`);
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
      {waiting.length > 0 && (
        <section className="space-y-1 rounded-xl border border-line bg-panel p-3" aria-label="Waiting to send">
          <p className="text-sm font-semibold">Waiting to send</p>
          <ul className="text-sm">
            {waiting.map((w) => (
              <li key={w.key} className="flex min-h-11 items-center justify-between gap-2">
                <span className="min-w-0 truncate text-muted">{w.label}</span>
                <button type="button" className="inline-flex min-h-11 shrink-0 items-center px-2 text-sm font-medium text-accent" onClick={() => cancelCollectionWrite(w.key)}>
                  Cancel
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {stacks.length > 0 && (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel">
          {stacks.map(shown).map((s) => (
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
                  {!prices.hide && s.purchasePrice != null && ` · paid ${money(s.purchasePrice, prices)}`}
                </div>
                {(s.tags?.length ?? 0) > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {s.tags!.map((t) => (
                      <span key={t} className="rounded-md bg-(--panel-2) px-1.5 py-0.5 text-xs font-medium">
                        {t.toLowerCase() === "trade" ? "For trade" : t}
                      </span>
                    ))}
                  </div>
                )}
                {s.printingConfidence === "guessed" && (
                  <div className="mt-1 text-[13px] text-warn">
                    Printing guessed{s.matchNote ? `: ${s.matchNote}` : " from the name"}. Its value uses the cheapest printing.
                  </div>
                )}
                {s.printingConfidence !== "guessed" && s.matchNote && <div className="mt-1 text-[13px] text-warn">{s.matchNote}</div>}
                {!s.location && (
                  <button
                    type="button"
                    className="mt-2 inline-flex min-h-11 items-center rounded-xl border border-line px-3 text-sm font-medium hover:bg-(--panel-2) disabled:opacity-40"
                    disabled={busy === s.id}
                    onClick={() => setMoving(s)}
                  >
                    Give {s.quantity === 1 ? "it" : "them"} a home
                  </button>
                )}
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
            <button
              type="button"
              className="sheet-link"
              autoFocus
              onClick={() => {
                setMenu(undefined);
                setMoving(menu);
              }}
            >
              {menu.location ? "Move to another box or binder" : "Give it a home"}
            </button>
            {!prices.hide && (
              <button
                type="button"
                className="sheet-link"
                onClick={() => {
                  setMenu(undefined);
                  setPaid(menu.purchasePrice == null ? "" : String(Math.round(convert(menu.purchasePrice, prices) * 100) / 100));
                  setPaying(menu);
                }}
              >
                {menu.purchasePrice == null ? "Add what you paid" : "Change what you paid"}
              </button>
            )}
            <button
              type="button"
              className="sheet-link"
              onClick={() => {
                setMenu(undefined);
                setTagText((menu.tags ?? []).filter((t) => t.toLowerCase() !== "trade").join(", "));
                setTagging(menu);
              }}
            >
              {(menu.tags?.length ?? 0) > 0 ? "Change tags" : "Add tags"}
            </button>
            <button
              type="button"
              className="sheet-link"
              onClick={() => {
                const has = (menu.tags ?? []).some((t) => t.toLowerCase() === "trade");
                void saveTags(menu, has ? (menu.tags ?? []).filter((t) => t.toLowerCase() !== "trade") : [...(menu.tags ?? []), "trade"]);
                setMenu(undefined);
              }}
            >
              {(menu.tags ?? []).some((t) => t.toLowerCase() === "trade") ? "Take off the for-trade list" : "Put on the for-trade list"}
            </button>
            <button
              type="button"
              className="sheet-link"
              onClick={() => {
                setMenu(undefined);
                setSellCount(1);
                setSellPrice(menu.unitPrice == null || prices.hide ? "" : String(Math.round(convert(menu.unitPrice, prices) * 100) / 100));
                setSellNote("");
                setSelling(menu);
              }}
            >
              {menu.quantity === 1 ? "I sold it" : "I sold some"}
            </button>
            <button type="button" className="sheet-link text-danger" onClick={() => setQty(menu, 0)}>
              Remove {menu.quantity === 1 ? "this copy" : `these ${menu.quantity} copies`} from your collection
            </button>
            <button type="button" className="sheet-close" onClick={() => setMenu(undefined)}>
              Cancel
            </button>
          </div>
        </>
      )}
      {tagging && (
        <>
          <div className="sheet-scrim" onClick={() => setTagging(undefined)} />
          <div className="sheet" role="dialog" aria-modal="true" aria-label="Tags" onKeyDown={(e) => e.key === "Escape" && setTagging(undefined)}>
            <div className="sheet-title">Tags</div>
            <form
              className="space-y-3 px-3 pb-2"
              onSubmit={(e) => {
                e.preventDefault();
                const trade = (tagging.tags ?? []).filter((t) => t.toLowerCase() === "trade");
                void saveTags(tagging, [...tagText.split(",").map((t) => t.trim()).filter(Boolean), ...trade]);
              }}
            >
              <p className="text-sm text-muted">Your own labels for these copies, like &ldquo;cube&rdquo; or &ldquo;lent to Sam&rdquo;. Separate them with commas. Search finds them with tag:cube.</p>
              <input
                autoFocus
                className="h-12 w-full rounded-md border border-line bg-panel px-3 text-base md:h-11 md:text-sm"
                value={tagText}
                onChange={(e) => setTagText(e.target.value)}
                placeholder="cube, lent to Sam"
                aria-label="Tags, separated by commas"
              />
              <button type="submit" className="inline-flex min-h-11 items-center rounded-xl bg-accent px-4 text-sm font-semibold text-accent-fg disabled:opacity-50" disabled={busy === tagging.id}>
                {busy === tagging.id ? "Saving…" : "Save"}
              </button>
            </form>
            <button type="button" className="sheet-close" onClick={() => setTagging(undefined)}>
              Cancel
            </button>
          </div>
        </>
      )}
      {selling && (
        <>
          <div className="sheet-scrim" onClick={() => setSelling(undefined)} />
          <div className="sheet" role="dialog" aria-modal="true" aria-label="Sold" onKeyDown={(e) => e.key === "Escape" && setSelling(undefined)}>
            <div className="sheet-title">
              Sold: {selling.setName} #{selling.collectorNumber}
            </div>
            <form
              className="space-y-3 px-3 pb-2"
              onSubmit={(e) => {
                e.preventDefault();
                void sell(selling);
              }}
            >
              <p className="text-sm text-muted">They leave your collection, and the sale goes in the activity log, where your sales add up.</p>
              {selling.quantity > 1 && (
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Copies</span>
                  <button type="button" className="h-11 w-11 rounded-xl border border-line text-lg disabled:opacity-40" disabled={sellCount <= 1} onClick={() => setSellCount((n) => n - 1)} aria-label="One fewer">
                    −
                  </button>
                  <span className="w-8 text-center font-semibold tabular-nums">{sellCount}</span>
                  <button type="button" className="h-11 w-11 rounded-xl border border-line text-lg disabled:opacity-40" disabled={sellCount >= selling.quantity} onClick={() => setSellCount((n) => n + 1)} aria-label="One more">
                    +
                  </button>
                </div>
              )}
              {!prices.hide && (
                <label className="flex items-center gap-2">
                  <span className="text-sm font-medium">{currencySymbol(prices)}</span>
                  <input
                    inputMode="decimal"
                    className="h-12 w-32 rounded-md border border-line bg-panel px-3 text-base md:h-11 md:text-sm"
                    value={sellPrice}
                    onChange={(e) => setSellPrice(e.target.value)}
                    placeholder="0.00"
                    aria-label="Price each copy sold for"
                  />
                  <span className="text-sm text-muted">each</span>
                </label>
              )}
              <input
                className="h-12 w-full rounded-md border border-line bg-panel px-3 text-base md:h-11 md:text-sm"
                value={sellNote}
                onChange={(e) => setSellNote(e.target.value)}
                maxLength={200}
                placeholder="Who to, or where (optional)"
                aria-label="Note"
              />
              <button type="submit" className="inline-flex min-h-11 items-center rounded-xl bg-accent px-4 text-sm font-semibold text-accent-fg disabled:opacity-50" disabled={busy === selling.id}>
                {busy === selling.id ? "Saving…" : `Record the sale`}
              </button>
            </form>
            <button type="button" className="sheet-close" onClick={() => setSelling(undefined)}>
              Cancel
            </button>
          </div>
        </>
      )}
      {paying && (
        <>
          <div className="sheet-scrim" onClick={() => setPaying(undefined)} />
          <div className="sheet" role="dialog" aria-modal="true" aria-label="What you paid" onKeyDown={(e) => e.key === "Escape" && setPaying(undefined)}>
            <div className="sheet-title">What you paid</div>
            <form
              className="space-y-3 px-3 pb-2"
              onSubmit={(e) => {
                e.preventDefault();
                void savePaid(paying);
              }}
            >
              <p className="text-sm text-muted">
                For each copy of {paying.setName} #{paying.collectorNumber}. The Value page sets it against what they&rsquo;re worth now. Leave it empty to forget it.
              </p>
              <label className="flex items-center gap-2">
                <span className="text-sm font-medium">{currencySymbol(prices)}</span>
                <input
                  autoFocus
                  inputMode="decimal"
                  className="h-12 w-32 rounded-md border border-line bg-panel px-3 text-base md:h-11 md:text-sm"
                  value={paid}
                  onChange={(e) => setPaid(e.target.value)}
                  placeholder="0.00"
                  aria-label="Price paid for each copy"
                />
                <span className="text-sm text-muted">each</span>
              </label>
              <button
                type="submit"
                className="inline-flex min-h-11 items-center rounded-xl bg-accent px-4 text-sm font-semibold text-accent-fg disabled:opacity-50"
                disabled={busy === paying.id}
              >
                {busy === paying.id ? "Saving…" : "Save"}
              </button>
            </form>
            <button type="button" className="sheet-close" onClick={() => setPaying(undefined)}>
              Cancel
            </button>
          </div>
        </>
      )}
      {moving && (
        <MoveSheet
          title={moving.location ? "Move to another box or binder" : `Give ${moving.quantity === 1 ? "it" : "them"} a home`}
          sub={`${moving.quantity}× ${moving.setName} #${moving.collectorNumber}, ${moving.location ? `now in ${moving.location}` : "with no box or binder yet"}.`}
          places={places}
          current={moving.location}
          max={moving.quantity}
          onPick={(to, count) => move(moving, to, count)}
          onClose={() => setMoving(undefined)}
        />
      )}
    </div>
  );
}
