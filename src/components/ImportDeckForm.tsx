"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, ColorPips } from "./ui";

type Candidate = { oracleId: string; name: string; colorIdentity: string };

export function ImportDeckForm() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>();
  const [commander, setCommander] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<{ id: number; unmatched: string[] }>();

  async function submit() {
    setBusy(true);
    setError(undefined);
    const res = await fetch("/api/decks/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, name: name.trim() || undefined, commanderOracleId: commander }),
    });
    setBusy(false);
    const body = await res.json().catch(() => ({}));
    if (body.reason === "no-commander") {
      setCandidates(body.candidates);
      if (!body.candidates?.length) setError("We couldn’t find a commander in that list. Add a “Commander” section or a legendary creature.");
      return;
    }
    if (!res.ok) return setError(body.error ?? "Couldn’t import that list.");
    if (body.unmatched?.length) return setDone({ id: body.id, unmatched: body.unmatched });
    router.push(`/decks/${body.id}`);
  }

  if (done) {
    return (
      <div className="space-y-3 text-sm">
        <p>Imported. We couldn’t find these cards, so they were left out:</p>
        <ul className="list-disc pl-5 text-muted">
          {done.unmatched.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
        <Button className="min-h-11" onClick={() => router.push(`/decks/${done.id}`)}>
          Open the deck
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <textarea
        className="h-64 w-full rounded-md border border-line bg-panel p-3 font-mono text-sm"
        placeholder={"Commander\n1 Korvold, Fae-Cursed King\n\nDeck\n1 Sol Ring\n1 Viscera Seer\n…"}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setCandidates(undefined);
          setCommander(undefined);
        }}
        aria-label="Decklist"
      />
      <input className="h-11 w-full rounded-md border border-line bg-panel px-3" placeholder="Deck name (optional)" value={name} onChange={(e) => setName(e.target.value)} aria-label="Deck name" />
      {candidates && candidates.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">The list doesn’t say which card is the commander. Pick one:</legend>
          {candidates.map((c) => (
            <label key={c.oracleId} className="flex min-h-11 items-center gap-3 rounded-md border border-line px-3 text-sm">
              <input type="radio" name="commander" className="h-5 w-5" checked={commander === c.oracleId} onChange={() => setCommander(c.oracleId)} />
              <span className="min-w-0 flex-1">{c.name}</span>
              <ColorPips identity={c.colorIdentity} />
            </label>
          ))}
        </fieldset>
      )}
      <Button className="min-h-11 w-full sm:w-auto" disabled={!text.trim() || busy || (!!candidates?.length && !commander)} onClick={submit}>
        {busy ? "Importing…" : "Import deck"}
      </Button>
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
    </div>
  );
}
