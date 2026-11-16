"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui";
import type { GameRecord, GameResult, GameWithDeck } from "@/lib/deck/games";
import { formatDate } from "@/lib/format";
import { showDeckToast } from "./DeckRowActions";

const RESULT: Record<GameResult, { label: string; tone: "ok" | "danger" | "muted" }> = {
  win: { label: "Win", tone: "ok" },
  loss: { label: "Loss", tone: "danger" },
  draw: { label: "Draw", tone: "muted" },
};
const pct = (n: number | null) => (n == null ? "—" : `${Math.round(n * 100)}%`);

/** The deck's record in one panel: games, wins and win rate, against an even share of the pod. */
export function RecordPanel({ record }: { record: GameRecord }) {
  return (
    <section className="space-y-2 rounded-2xl border border-line bg-panel p-4">
      <div className="grid grid-cols-3">
        <div>
          <p className="text-xs text-muted">Games</p>
          <p className="font-[family-name:var(--font-sora)] text-2xl font-bold tabular-nums">{record.played}</p>
        </div>
        <div className="border-l border-line pl-3">
          <p className="text-xs text-muted">Wins</p>
          <p className="font-[family-name:var(--font-sora)] text-2xl font-bold tabular-nums">{record.wins}</p>
        </div>
        <div className="border-l border-line pl-3">
          <p className="text-xs text-muted">Win rate</p>
          <p className="grad-text font-[family-name:var(--font-sora)] text-2xl font-bold tabular-nums">{pct(record.winRate)}</p>
        </div>
      </div>
      {record.fairShare != null && (
        <p className="text-[13px] text-muted">
          An even share of these pods would be {pct(record.fairShare)}.
          {record.draws ? ` ${record.draws} ${record.draws === 1 ? "draw" : "draws"}.` : ""}
        </p>
      )}
    </section>
  );
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** "Log a game": the result, the day, the pod size, and optionally the turns and a note. */
export function LogGameForm({ deckId }: { deckId: number }) {
  const router = useRouter();
  const [result, setResult] = useState<GameResult>();
  const [busy, setBusy] = useState(false);
  const field = "h-12 w-full rounded-xl border border-line bg-panel px-3 text-base text-foreground md:h-11 md:text-sm";

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!result) return;
    const form = new FormData(e.currentTarget);
    const turns = Number(form.get("turns"));
    setBusy(true);
    const res = await fetch(`/api/decks/${deckId}/games`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        result,
        playedAt: String(form.get("playedAt") || today()),
        players: Number(form.get("players")) || 4,
        turns: turns > 0 ? turns : null,
        notes: String(form.get("notes") ?? ""),
      }),
    }).catch(() => undefined);
    setBusy(false);
    if (!res?.ok) return showDeckToast({ message: "That didn’t save. Try again.", error: true });
    showDeckToast({ message: `Logged a ${RESULT[result].label.toLowerCase()}` });
    setResult(undefined);
    (e.target as HTMLFormElement).reset();
    router.refresh();
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-3 rounded-2xl border border-line bg-panel p-4">
      <h2 className="text-lg font-semibold">Log a game</h2>
      <fieldset className="flex gap-2">
        <legend className="sr-only">Result</legend>
        {(["win", "loss", "draw"] as const).map((r) => (
          <button
            key={r}
            type="button"
            aria-pressed={result === r}
            onClick={() => setResult(r)}
            className={`inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border text-sm font-semibold ${result === r ? "border-accent bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] text-foreground" : "border-line text-muted"}`}
          >
            {RESULT[r].label}
          </button>
        ))}
      </fieldset>
      <div className="grid grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2">
        <label className="block space-y-1 text-sm text-muted">
          <span>Day</span>
          <input name="playedAt" type="date" defaultValue={today()} max={today()} className={field} />
        </label>
        <label className="block space-y-1 text-sm text-muted">
          <span>Players</span>
          <select name="players" defaultValue="4" className={field}>
            {[2, 3, 4, 5, 6].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <label className="block space-y-1 text-sm text-muted">
          <span>Turns</span>
          <input name="turns" type="number" inputMode="numeric" min={1} max={60} placeholder="—" className={field} />
        </label>
      </div>
      <label className="block space-y-1 text-sm text-muted">
        <span>Note</span>
        <input name="notes" maxLength={500} placeholder="Won with Craterhoof, the Rhystic Study player…" className={field} />
      </label>
      <button type="submit" disabled={!result || busy} className="h-12 w-full rounded-xl bg-accent px-4 text-base font-semibold text-accent-fg disabled:opacity-50">
        {busy ? "Saving…" : result ? `Log a ${RESULT[result].label.toLowerCase()}` : "Pick win, loss or draw"}
      </button>
    </form>
  );
}

/** Games, newest first. `showDeck` names the deck on each (the all-decks log). */
export function GameList({ games, showDeck }: { games: GameWithDeck[]; showDeck?: boolean }) {
  const router = useRouter();
  const [gone, setGone] = useState<Set<number>>(new Set());

  async function remove(g: GameWithDeck) {
    const res = await fetch(`/api/games/${g.id}`, { method: "DELETE" }).catch(() => undefined);
    if (!res?.ok) return showDeckToast({ message: "That didn’t save. Try again.", error: true });
    setGone((s) => new Set(s).add(g.id));
    showDeckToast({
      message: `Removed the ${formatDate(g.playedAt)} game`,
      undo: async () => {
        const r = await fetch(`/api/decks/${g.deckId}/games`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ restore: g }) }).catch(() => undefined);
        if (r?.ok) {
          setGone((s) => new Set([...s].filter((x) => x !== g.id)));
          router.refresh();
        }
        return r ?? false;
      },
    });
    router.refresh();
  }

  const shown = games.filter((g) => !gone.has(g.id));
  if (!shown.length) return null;
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel">
      {shown.map((g) => (
        <li key={g.id} className="flex min-h-14 items-center gap-3 py-2 pr-1 pl-3">
          <Badge tone={RESULT[g.result].tone} className="w-12 justify-center">
            {RESULT[g.result].label}
          </Badge>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px]">
              {showDeck ? (
                <Link href={`/decks/${g.deckId}/games`} className="font-medium hover:underline">
                  {g.deckName}
                </Link>
              ) : (
                formatDate(g.playedAt)
              )}
            </span>
            <span className="block truncate text-xs text-muted">
              {[showDeck ? formatDate(g.playedAt) : null, `${g.players} players`, g.turns ? `${g.turns} turns` : null, g.notes || null].filter(Boolean).join(" · ")}
            </span>
          </span>
          <button type="button" onClick={() => void remove(g)} className="inline-flex min-h-11 shrink-0 items-center rounded-xl px-3 text-sm text-muted hover:text-foreground" aria-label={`Remove the ${formatDate(g.playedAt)} game`}>
            Remove
          </button>
        </li>
      ))}
    </ul>
  );
}
