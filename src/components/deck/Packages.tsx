"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ColorPips, ManaCost } from "@/components/ui";
import type { PackageAdd, PackageView } from "@/lib/deck/packages";
import { cardIndex, refreshCardIndex, searchCardIndex, type IndexCard } from "@/lib/offline/card-index";
import { showDeckToast } from "./DeckRowActions";

const field = "h-12 w-full rounded-xl border border-line bg-panel px-3 text-base text-foreground md:h-11 md:text-sm";
const primary = "inline-flex h-12 items-center justify-center rounded-xl bg-accent px-4 text-base font-semibold text-accent-fg disabled:opacity-50 md:h-11 md:text-sm";
const secondary = "inline-flex min-h-11 items-center justify-center rounded-xl border border-line px-4 text-sm font-medium disabled:opacity-50";
const FAIL = "That didn’t save. Try again.";

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }).catch(() => undefined);
  return res?.ok ? res : undefined;
}

export type TagOption = { deckId: number; deckName: string; tag: string; oracleIds: string[] };

/** "New package": a name, and optionally the cards you tagged in a deck to start from. */
export function NewPackageForm({ tags }: { tags: TagOption[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [from, setFrom] = useState("");
  const [name, setName] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const t = from ? tags[Number(from)] : undefined;
    setBusy(true);
    const res = await send("/api/packages", "POST", { name, oracleIds: t?.oracleIds ?? [] });
    setBusy(false);
    if (!res) return showDeckToast({ message: FAIL, error: true });
    const p = await res.json();
    router.push(`/decks/packages/${p.id}`);
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-3 rounded-2xl border border-line bg-panel p-4">
      <h2 className="text-lg font-semibold">New package</h2>
      <label className="block space-y-1 text-sm text-muted">
        <span>Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Removal suite, Golgari lands, Thoracle combo…" className={field} />
      </label>
      {tags.length > 0 && (
        <label className="block space-y-1 text-sm text-muted">
          <span>Start from a tag</span>
          <select
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              const t = tags[Number(e.target.value)];
              if (t && !name.trim()) setName(t.tag);
            }}
            className={field}
          >
            <option value="">No, start empty</option>
            {tags.map((t, i) => (
              <option key={`${t.deckId}-${t.tag}`} value={i}>
                {t.tag} in {t.deckName} ({t.oracleIds.length})
              </option>
            ))}
          </select>
        </label>
      )}
      <button type="submit" disabled={!name.trim() || busy} className={`${primary} w-full`}>
        {busy ? "Making it…" : "Make the package"}
      </button>
    </form>
  );
}

/** Search every card and add one to the package (the card list on this device when it's there). */
function AddToPackage({ onAdd }: { onAdd: (c: { oracleId: string; name: string }) => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ oracleId: string; name: string; typeLine: string }[]>([]);
  const [index, setIndex] = useState<IndexCard[] | null>(null);

  function ready() {
    if (index) return;
    void cardIndex().then((cards) => (cards ? setIndex(cards) : refreshCardIndex().then(() => cardIndex().then(setIndex))));
  }

  useEffect(() => {
    if (q.trim().length < 2) return setHits([]);
    if (index) return setHits(searchCardIndex(index, q));
    const t = setTimeout(async () => {
      const res = await fetch(`/api/cards/search?q=${encodeURIComponent(q)}`).catch(() => undefined);
      if (res?.ok) setHits((await res.json()).cards);
    }, 150);
    return () => clearTimeout(t);
  }, [q, index]);

  return (
    <div className="relative">
      <input className={field} placeholder="Add a card to this package…" value={q} onChange={(e) => setQ(e.target.value)} onFocus={ready} aria-label="Add a card" />
      {hits.length > 0 && (
        <ul className="absolute inset-x-0 top-13 z-10 max-h-72 overflow-auto rounded-xl border border-line bg-panel shadow-lg">
          {hits.map((h) => (
            <li key={h.oracleId}>
              <button
                type="button"
                className="flex min-h-11 w-full flex-col items-start px-3 py-1 text-left hover:bg-(--panel-2)"
                onClick={() => {
                  onAdd(h);
                  setQ("");
                  setHits([]);
                }}
              >
                <span className="text-sm">{h.name}</span>
                <span className="text-xs text-muted">{h.typeLine}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const list = (names: string[], max = 4) => (names.length > max ? `${names.slice(0, max).join(", ")} and ${names.length - max} more` : names.join(", "));

/** One package: its cards (add and remove), put it in a deck, rename or delete it. */
export function PackageEditor({ pkg, decks }: { pkg: PackageView; decks: { id: number; name: string; colorIdentity: string }[] }) {
  const router = useRouter();
  const [deckId, setDeckId] = useState("");
  const [busy, setBusy] = useState<string>();
  const [name, setName] = useState(pkg.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const url = `/api/packages/${pkg.id}`;

  async function patch(body: Record<string, unknown>, message?: string) {
    const res = await send(url, "PATCH", body);
    if (!res) return showDeckToast({ message: FAIL, error: true });
    if (message) showDeckToast({ message });
    router.refresh();
  }

  async function addToDeck() {
    const deck = decks.find((d) => d.id === Number(deckId));
    if (!deck) return;
    setBusy("deck");
    const res = await send(`${url}/deck`, "POST", { deckId: deck.id });
    setBusy(undefined);
    if (!res) return showDeckToast({ message: FAIL, error: true });
    const r: PackageAdd = await res.json();
    const skipped = [
      r.already.length ? `${r.already.length} already in it` : "",
      r.offColour.length ? `${r.offColour.length} outside its colours (${list(r.offColour, 3)})` : "",
    ].filter(Boolean);
    const message = r.added.length
      ? `Added ${r.added.length} to ${deck.name}.${skipped.length ? ` Skipped ${skipped.join(" and ")}.` : ""}`
      : `Nothing to add to ${deck.name}: ${skipped.join(" and ") || "the package is empty"}.`;
    showDeckToast({
      message,
      undo: r.added.length ? async () => (await send(`${url}/deck`, "DELETE", { deckId: deck.id, undo: r.undo })) ?? false : undefined,
    });
  }

  async function remove() {
    const res = await send(url, "DELETE");
    if (!res) return showDeckToast({ message: FAIL, error: true });
    router.push("/decks/packages");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-2xl border border-line bg-panel p-4">
        <h2 className="text-lg font-semibold">Put it in a deck</h2>
        <p className="text-sm text-muted">Cards outside the deck&rsquo;s colours and cards already in it are skipped. Added cards are locked, so a rebuild keeps them.</p>
        <div className="flex gap-2">
          <select value={deckId} onChange={(e) => setDeckId(e.target.value)} className={`${field} min-w-0 flex-1`} aria-label="Deck">
            <option value="">Pick a deck</option>
            {decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => void addToDeck()} disabled={!deckId || !pkg.cards.length || !!busy} className={`${primary} shrink-0`}>
            {busy === "deck" ? "Adding…" : "Add"}
          </button>
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-baseline justify-between px-1">
          <h2 className="text-lg font-semibold">
            Cards <span className="text-muted tabular-nums">{pkg.cards.length}</span>
          </h2>
          <ColorPips identity={pkg.colorIdentity} />
        </div>
        <AddToPackage onAdd={(c) => void patch({ add: [c.oracleId] }, `Added ${c.name}`)} />
        {pkg.cards.length ? (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel">
            {pkg.cards.map((c) => (
              <li key={c.oracleId} className="flex min-h-12 items-center gap-3 py-1.5 pr-1 pl-4">
                <Link href={`/collection/${c.oracleId}`} className="min-w-0 flex-1">
                  <span className="block truncate text-[15px]">{c.name}</span>
                  <span className="block truncate text-xs text-muted">{c.typeLine}</span>
                </Link>
                <ManaCost cost={c.manaCost} />
                <button
                  type="button"
                  className="inline-flex min-h-11 shrink-0 items-center rounded-xl px-3 text-sm text-muted hover:text-foreground"
                  aria-label={`Remove ${c.name}`}
                  onClick={() =>
                    void patch({ remove: c.oracleId }).then(() =>
                      showDeckToast({ message: `Removed ${c.name}`, undo: async () => (await send(url, "PATCH", { add: [c.oracleId] }).then((r) => (router.refresh(), r))) ?? false }),
                    )
                  }
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-2xl border border-line bg-panel p-4 text-sm text-muted">No cards yet. Search above to add some.</p>
        )}
      </section>

      <section className="space-y-3 rounded-2xl border border-line bg-panel p-4">
        <h2 className="text-lg font-semibold">Package</h2>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim() && name !== pkg.name) void patch({ name: name.trim() }, `Renamed to ${name.trim()}`);
          }}
        >
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className={`${field} min-w-0 flex-1`} aria-label="Package name" />
          <button type="submit" disabled={!name.trim() || name === pkg.name} className={secondary}>
            Rename
          </button>
        </form>
        {confirmDelete ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void remove()} className={`${secondary} border-danger text-danger`}>
              Delete for good
            </button>
            <button type="button" onClick={() => setConfirmDelete(false)} className={secondary}>
              Keep it
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmDelete(true)} className={secondary}>
            Delete package…
          </button>
        )}
        <p className="text-xs text-muted">Deleting the package leaves the decks you put it in as they are.</p>
      </section>
    </div>
  );
}
