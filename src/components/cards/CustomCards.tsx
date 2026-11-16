"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { showDeckToast } from "@/components/deck/DeckRowActions";
import { Sheet } from "@/components/deck/Sheet";
import { CustomCardFace } from "./CustomCardFace";

type Card = { oracleId: string; name: string; manaCost: string | null; typeLine: string; oracleText: string; colorIdentity: string; decks: number };
type Draft = { name: string; manaCost: string; typeLine: string; oracleText: string };

const EMPTY: Draft = { name: "", manaCost: "", typeLine: "", oracleText: "" };
const field = "h-12 w-full rounded-xl border border-line bg-panel px-3 text-base md:h-11 md:text-sm";

/**
 * Make, change and delete your own cards. Once made, a card is found by the deck's "Add a card"
 * search like any other, goes in as a proxy, and prints on the proxy sheet as text.
 */
export function CustomCards({ cards }: { cards: Card[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<{ id?: string; draft: Draft }>();
  const [deleting, setDeleting] = useState<Card>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function save() {
    if (!editing) return;
    setBusy(true);
    setError(undefined);
    const res = await fetch(editing.id ? `/api/cards/custom/${editing.id}` : "/api/cards/custom", {
      method: editing.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editing.draft),
    }).catch(() => undefined);
    setBusy(false);
    if (!res) return setError("That didn’t save. Making a card needs a connection.");
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return setError(body.error ?? "That didn’t save. Try again.");
    showDeckToast({ message: editing.id ? `Saved ${editing.draft.name}` : `Made ${editing.draft.name}. Add it to a deck from the deck's search.` });
    setEditing(undefined);
    router.refresh();
  }

  async function remove(c: Card) {
    setBusy(true);
    const res = await fetch(`/api/cards/custom/${c.oracleId}`, { method: "DELETE" }).catch(() => undefined);
    setBusy(false);
    setDeleting(undefined);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => ({}))) as { error?: string } | undefined;
      return showDeckToast({ message: body?.error ?? "That didn’t delete. Try again.", error: true });
    }
    showDeckToast({ message: `Deleted ${c.name}` });
    router.refresh();
  }

  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setEditing((x) => x && { ...x, draft: { ...x.draft, [k]: e.target.value } });

  return (
    <div className="space-y-3">
      <button type="button" className="h-12 rounded-xl bg-accent px-5 text-base font-semibold text-accent-fg" onClick={() => setEditing({ draft: EMPTY })}>
        Make a card
      </button>

      {cards.length === 0 ? (
        <p className="px-1 text-sm text-muted">No cards of your own yet. Make one to try a card before it&rsquo;s out, or a house card your group plays with.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {cards.map((c) => (
            <li key={c.oracleId} className="space-y-1">
              <div className="text-[15px]">
                <CustomCardFace name={c.name} manaCost={c.manaCost} typeLine={c.typeLine} oracleText={c.oracleText} />
              </div>
              <p className="px-1 text-xs text-muted">{c.decks === 0 ? "In no decks" : c.decks === 1 ? "In 1 deck" : `In ${c.decks} decks`}</p>
              <div className="flex gap-1">
                <button
                  type="button"
                  className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-line text-sm font-medium hover:bg-background"
                  onClick={() => setEditing({ id: c.oracleId, draft: { name: c.name, manaCost: c.manaCost ?? "", typeLine: c.typeLine, oracleText: c.oracleText } })}
                >
                  Change
                </button>
                <button type="button" className="inline-flex min-h-11 items-center justify-center rounded-lg px-3 text-sm text-muted hover:text-danger" onClick={() => setDeleting(c)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <Sheet title={editing.id ? "Change your card" : "Make a card"} sub="Write the cost with braces, like {2}{G}{G}. Its colour identity comes from the cost and any symbols in the text." onClose={() => setEditing(undefined)}>
          <form
            className="space-y-3 px-3 pb-2"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <label className="block space-y-1 text-sm text-muted">
              <span>Name</span>
              <input className={field} value={editing.draft.name} onChange={set("name")} required maxLength={120} autoFocus />
            </label>
            <div className="grid grid-cols-[1fr_2fr] gap-2">
              <label className="block space-y-1 text-sm text-muted">
                <span>Mana cost</span>
                <input className={`${field} font-mono`} value={editing.draft.manaCost} onChange={set("manaCost")} placeholder="{2}{G}" maxLength={60} autoCapitalize="characters" />
              </label>
              <label className="block space-y-1 text-sm text-muted">
                <span>Type line</span>
                <input className={field} value={editing.draft.typeLine} onChange={set("typeLine")} required maxLength={120} placeholder="Creature — Elf Druid" />
              </label>
            </div>
            <label className="block space-y-1 text-sm text-muted">
              <span>Rules text</span>
              <textarea className="min-h-28 w-full rounded-xl border border-line bg-panel p-3 text-base md:text-sm" value={editing.draft.oracleText} onChange={set("oracleText")} maxLength={1500} />
            </label>
            {error && <p className="text-sm text-danger">{error}</p>}
            <button type="submit" disabled={busy} className="h-12 w-full rounded-xl bg-accent px-4 text-base font-semibold text-accent-fg disabled:opacity-50">
              {editing.id ? "Save" : "Make it"}
            </button>
          </form>
        </Sheet>
      )}

      {deleting && (
        <Sheet title={`Delete ${deleting.name}?`} sub={deleting.decks ? `It comes out of ${deleting.decks === 1 ? "the deck" : `the ${deleting.decks} decks`} it's in too.` : "It's in no decks."} onClose={() => setDeleting(undefined)}>
          <button type="button" disabled={busy} className="sheet-link text-left text-danger disabled:opacity-50" onClick={() => void remove(deleting)}>
            Delete it
          </button>
        </Sheet>
      )}
      <p className="px-1 text-[13px] text-muted">
        To put one in a deck, search for it in the deck&rsquo;s &ldquo;Add a card&rdquo;. It goes in as a proxy, and prints as text on the deck&rsquo;s proxy sheet (in the deck&rsquo;s More menu).
      </p>
    </div>
  );
}
