"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "./ui";

type Status = "idea" | "building" | "built" | "retired";
const STATUSES: { value: Status; label: string; help: string }[] = [
  { value: "idea", label: "Idea", help: "Just a list. Holds none of your copies." },
  { value: "building", label: "Building", help: "Holds the copies placed in it. Rebuilds freely." },
  { value: "built", label: "Built", help: "Sleeved up. Holds its copies; shared-card moves won't rebuild it." },
  { value: "retired", label: "Retired", help: "Taken apart. Keeps the list, releases the copies." },
];

export function DeckActions({
  deckId,
  name,
  status,
  suggestUnowned,
  maxPrice,
}: {
  deckId: number;
  name: string;
  status: Status;
  suggestUnowned: boolean;
  maxPrice?: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [note, setNote] = useState<string>();
  const [newName, setNewName] = useState(name);
  const [buy, setBuy] = useState(suggestUnowned);
  const [price, setPrice] = useState(maxPrice ? String(maxPrice) : "");
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function call(label: string, url: string, init: RequestInit) {
    setBusy(label);
    setError(undefined);
    setNote(undefined);
    const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
    setBusy(undefined);
    if (!res.ok) {
      setError("That didn't work. Try again.");
      return undefined;
    }
    return res.status === 204 ? {} : res.json();
  }

  async function rebuild() {
    const body: Record<string, unknown> = { suggestUnowned: buy };
    const p = Number.parseFloat(price);
    if (Number.isFinite(p) && p > 0) body.maxPrice = p;
    const r = await call("rebuild", `/api/decks/${deckId}/rebuild`, { method: "POST", body: JSON.stringify(body) });
    if (r) {
      setNote(r.warnings?.length ? r.warnings.join(" ") : "Rebuilt. Locked and hand-added cards were kept.");
      router.refresh();
    }
  }

  async function patch(body: Record<string, unknown>) {
    if (await call("patch", `/api/decks/${deckId}`, { method: "PATCH", body: JSON.stringify(body) })) router.refresh();
  }

  async function remove() {
    if (await call("delete", `/api/decks/${deckId}`, { method: "DELETE" })) {
      router.push("/decks");
      router.refresh();
    }
  }

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h2 className="font-semibold">Rebuild</h2>
        <p className="text-sm text-muted">Picks the best cards again from what you own. Locked cards and cards you added stay.</p>
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input type="checkbox" className="h-5 w-5" checked={buy} onChange={(e) => setBuy(e.target.checked)} />
          Suggest cards to buy or proxy when my collection is short
        </label>
        {buy && (
          <label className="flex min-h-11 items-center gap-3 text-sm">
            Skip suggestions over $
            <input
              inputMode="decimal"
              className="h-11 w-24 rounded-md border border-line bg-panel px-3"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="any"
              aria-label="Maximum price for suggested cards"
            />
          </label>
        )}
        <Button onClick={rebuild} disabled={!!busy} className="min-h-11">
          {busy === "rebuild" ? "Rebuilding…" : "Rebuild deck"}
        </Button>
        {note && <p className="text-sm text-muted" role="status">{note}</p>}
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Status</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {STATUSES.map((s) => (
            <label key={s.value} className={`flex min-h-11 cursor-pointer gap-3 rounded-md border p-3 text-sm ${s.value === status ? "border-accent" : "border-line"}`}>
              <input type="radio" name="status" className="mt-0.5 h-5 w-5" checked={s.value === status} onChange={() => patch({ status: s.value })} disabled={!!busy} />
              <span>
                <span className="font-medium">{s.label}</span>
                <span className="block text-muted">{s.help}</span>
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Name</h2>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (newName.trim() && newName !== name) patch({ name: newName.trim() });
          }}
        >
          <input className="h-11 min-w-0 flex-1 rounded-md border border-line bg-panel px-3" value={newName} onChange={(e) => setNewName(e.target.value)} aria-label="Deck name" />
          <Button variant="secondary" className="min-h-11" disabled={!!busy || newName === name}>
            Save
          </Button>
        </form>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Delete</h2>
        <p className="text-sm text-muted">To keep the list but free its cards, set it to Retired instead.</p>
        {confirmDelete ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" className="min-h-11" onClick={remove} disabled={!!busy}>
              Delete for good
            </Button>
            <Button variant="secondary" className="min-h-11" onClick={() => setConfirmDelete(false)}>
              Keep it
            </Button>
          </div>
        ) : (
          <Button variant="secondary" className="min-h-11" onClick={() => setConfirmDelete(true)}>
            Delete deck…
          </Button>
        )}
      </section>
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
    </div>
  );
}
