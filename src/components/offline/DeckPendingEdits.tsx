"use client";

import { usePathname } from "next/navigation";
import { describeEdit } from "@/lib/offline/deck-edits";
import { dismissFailed, undoDeckEdit, useOutbox } from "@/lib/offline/outbox";
import { useOnline } from "@/lib/offline/use-online";

/**
 * The deck's edits that are saved on this device but not sent yet (offline, the app can't be
 * reached, or it's locked), each with Undo, and any the server turned down. Hidden while edits go
 * straight through, as they do online. `counted`: the tab below is drawn on the device with the
 * edits in it (src/components/offline/DeviceDeck.tsx), so its numbers already include them.
 */
export function DeckPendingEdits({ deckId, counted = false }: { deckId: number; counted?: boolean }) {
  const { queue, state, failed } = useOutbox();
  const path = usePathname();
  const online = useOnline();

  const mine = queue.filter((e) => e.deckId === deckId);
  const refused = failed.filter((e) => e.deckId === deckId);
  const waiting = mine.length > 0 && (!online || state === "waiting" || state === "locked");
  if (!waiting && !refused.length) return null;

  const why =
    state === "locked" ? (
      <>
        The app is locked on this device.{" "}
        <a className="font-medium text-foreground underline" href={`/unlock?next=${encodeURIComponent(path)}`}>
          Unlock it
        </a>{" "}
        to send them.
      </>
    ) : !online ? (
      "You’re offline. They’re saved on this device and sent when you’re back online."
    ) : (
      "MTG Deck Tutor isn’t answering. They’re saved on this device and sent when it does."
    );

  return (
    <section className="space-y-3 rounded-2xl border border-line bg-panel p-4" aria-label="Changes waiting to send">
      {waiting && (
        <>
          <div className="space-y-1">
            <h2 className="text-[15px] font-semibold">
              {mine.length === 1 ? "1 change" : `${mine.length} changes`} waiting to send
            </h2>
            <p className="text-sm text-muted">
              {why} {counted ? "The deck’s numbers below include them." : "The deck’s numbers catch up once they’re sent."}
            </p>
          </div>
          <ul className="divide-y divide-line rounded-xl border border-line">
            {mine.map((e) => (
              <li key={e.key} className="flex min-h-11 items-center justify-between gap-3 pl-3 pr-1">
                <span className="min-w-0 truncate text-sm">{describeEdit(e)}</span>
                <button type="button" className="inline-flex min-h-11 shrink-0 items-center px-3 text-sm font-semibold text-accent" onClick={() => undoDeckEdit(e.key)}>
                  Undo
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {refused.length > 0 && (
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 text-sm text-danger" role="alert">
            {refused.length === 1 ? "This change didn’t save" : "These changes didn’t save"}: {refused.map(describeEdit).join("; ")}. The deck may have changed on another device.
          </p>
          <button type="button" className="inline-flex min-h-11 shrink-0 items-center px-3 text-sm text-muted" onClick={dismissFailed}>
            Dismiss
          </button>
        </div>
      )}
    </section>
  );
}
