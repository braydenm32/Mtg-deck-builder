"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  changeCommanderDamage,
  changeLife,
  changePoison,
  COMMANDER_LETHAL,
  gameNote,
  type LifeGame,
  newGame,
  nextTurn,
  outReason,
  suggestedResult,
} from "@/lib/deck/life";
import { showDeckToast } from "./DeckRowActions";
import { Sheet } from "./Sheet";

/**
 * The life counter for a game with this deck: a tile per player (life, with taps for ±1 and ±5),
 * commander damage and poison behind each tile's "Damage" button, and a turn count. The game is kept
 * in this browser, so a reload or a locked phone doesn't lose it. "Log this game" saves it to the
 * deck's game log with the players, turns and a note of how you ended.
 */

const KEY = (deckId: number) => `life-counter.${deckId}`;

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const STEP = "inline-flex min-h-14 min-w-14 items-center justify-center rounded-xl border border-line text-xl font-semibold hover:bg-background disabled:opacity-40";
const SMALL = "inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-line px-2 text-sm font-medium hover:bg-background";

export function LifeCounter({ deckId, commander }: { deckId: number; commander: string }) {
  const router = useRouter();
  const [game, setGame] = useState<LifeGame>();
  const [loaded, setLoaded] = useState(false);
  const [count, setCount] = useState(4);
  const [damageFor, setDamageFor] = useState<number>();
  const [ending, setEnding] = useState(false);
  const [busy, setBusy] = useState(false);

  // A game in progress comes back after a reload (read after the first render, so it matches the server's).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(KEY(deckId));
      if (raw) setGame(JSON.parse(raw) as LifeGame);
    } catch {
      // No storage: the game just won't survive a reload.
    }
    setLoaded(true);
  }, [deckId]);
  useEffect(() => {
    if (!loaded) return;
    try {
      if (game) window.localStorage.setItem(KEY(deckId), JSON.stringify(game));
      else window.localStorage.removeItem(KEY(deckId));
    } catch {
      // Ignore: see above.
    }
  }, [deckId, game, loaded]);

  // Keep the screen on while a game is being counted, where the browser allows it.
  useEffect(() => {
    if (!game) return;
    let lock: { release: () => Promise<void> } | undefined;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request("screen").then(
      (l) => (lock = l),
      () => undefined,
    );
    return () => void lock?.release().catch(() => undefined);
  }, [game]);

  async function log(result: "win" | "loss" | "draw") {
    if (!game) return;
    setBusy(true);
    const res = await fetch(`/api/decks/${deckId}/games`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ result, playedAt: today(), players: game.players.length, turns: game.turn, notes: gameNote(game).slice(0, 500) }),
    }).catch(() => undefined);
    setBusy(false);
    if (!res?.ok) return showDeckToast({ message: "That didn’t save. Try again.", error: true });
    setEnding(false);
    setGame(undefined);
    showDeckToast({ message: `Logged a ${result} on turn ${game.turn}` });
    router.push(`/decks/${deckId}/games`);
    router.refresh();
  }

  if (!loaded) return <div className="h-64 rounded-2xl border border-line bg-panel" aria-busy />;

  if (!game) {
    return (
      <section className="mx-auto max-w-md space-y-4 rounded-2xl border border-line bg-panel p-5" aria-labelledby="life-h">
        <h2 id="life-h" className="text-xl font-semibold">
          New game
        </h2>
        <p className="text-sm text-muted">Everyone starts on 40. You&rsquo;re the first player, playing {commander}. When it&rsquo;s over, log it to this deck&rsquo;s games in one tap.</p>
        <fieldset className="space-y-1">
          <legend className="text-sm font-medium">Players</legend>
          <div className="flex gap-2">
            {[2, 3, 4, 5, 6].map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={count === n}
                onClick={() => setCount(n)}
                className={`inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border text-sm font-semibold ${count === n ? "border-accent bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] text-foreground" : "border-line text-muted"}`}
              >
                {n}
              </button>
            ))}
          </div>
        </fieldset>
        <button type="button" className="h-12 w-full rounded-xl bg-accent px-4 text-base font-semibold text-accent-fg" onClick={() => setGame(newGame(count))}>
          Start the game
        </button>
      </section>
    );
  }

  const suggested = suggestedResult(game);
  const target = damageFor === undefined ? undefined : game.players[damageFor];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-panel p-2 pl-4">
        <span className="font-semibold tabular-nums">Turn {game.turn}</span>
        <span className="flex gap-2">
          <button type="button" className={SMALL} onClick={() => setGame(nextTurn(game, -1))} aria-label="Back a turn" disabled={game.turn <= 1}>
            −
          </button>
          <button type="button" className={`${SMALL} px-3`} onClick={() => setGame(nextTurn(game))}>
            Next turn
          </button>
        </span>
      </div>

      <ul className={`grid gap-3 ${game.players.length > 2 ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-2"} lg:grid-cols-3`}>
        {game.players.map((p, i) => {
          const out = outReason(p);
          const cmd = p.commander.reduce((n, d) => n + d, 0);
          return (
            <li key={i} className={`space-y-2 rounded-2xl border bg-panel p-3 ${i === 0 ? "border-accent" : "border-line"} ${out ? "opacity-60" : ""}`}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-semibold">{p.name}</span>
                {out && <span className="shrink-0 rounded-md bg-danger-bg px-1.5 py-0.5 text-[11px] font-semibold text-danger">Out</span>}
              </div>
              <p className={`text-center font-[family-name:var(--font-sora)] text-5xl font-bold tabular-nums ${i === 0 ? "grad-text" : ""}`} aria-live="polite" aria-label={`${p.name}: ${p.life} life`}>
                {p.life}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className={STEP} onClick={() => setGame(changeLife(game, i, -1))} aria-label={`${p.name} loses 1 life`}>
                  −
                </button>
                <button type="button" className={STEP} onClick={() => setGame(changeLife(game, i, 1))} aria-label={`${p.name} gains 1 life`}>
                  +
                </button>
                <button type="button" className={SMALL} onClick={() => setGame(changeLife(game, i, -5))} aria-label={`${p.name} loses 5 life`}>
                  −5
                </button>
                <button type="button" className={SMALL} onClick={() => setGame(changeLife(game, i, 5))} aria-label={`${p.name} gains 5 life`}>
                  +5
                </button>
              </div>
              <button
                type="button"
                className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border border-line px-3 text-sm font-medium hover:bg-background"
                onClick={() => setDamageFor(i)}
              >
                <span>Damage</span>
                <span className="text-xs text-muted tabular-nums">
                  {cmd > 0 ? `${cmd} cmdr` : ""}
                  {cmd > 0 && p.poison > 0 ? " · " : ""}
                  {p.poison > 0 ? `${p.poison} poison` : ""}
                  {cmd === 0 && p.poison === 0 ? "None" : ""}
                </span>
              </button>
              {out && <p className="text-center text-xs text-muted">{out}</p>}
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" className="h-12 flex-1 rounded-xl bg-accent px-4 text-base font-semibold text-accent-fg sm:flex-none" onClick={() => setEnding(true)}>
          Log this game
        </button>
        <button
          type="button"
          className="inline-flex min-h-11 items-center px-3 text-sm text-muted hover:text-foreground"
          onClick={() => {
            setGame(undefined);
            showDeckToast({ message: "Game cleared without logging it" });
          }}
        >
          Clear without logging
        </button>
      </div>

      {target && damageFor !== undefined && (
        <Sheet title={`Damage to ${target.name}`} sub={`From each commander (out at ${COMMANDER_LETHAL} from one), and poison. Commander damage comes off life too.`} onClose={() => setDamageFor(undefined)}>
          <ul className="divide-y divide-line px-3">
            {game.players.map((from, j) =>
              j === damageFor ? null : (
                <li key={j} className="flex min-h-14 items-center gap-3">
                  <span className="min-w-0 flex-1 truncate text-sm">{j === 0 ? "Your commander" : `${from.name}’s commander`}</span>
                  <button type="button" className={SMALL} onClick={() => setGame(changeCommanderDamage(game, damageFor, j, -1))} aria-label={`1 less damage from ${from.name}`}>
                    −
                  </button>
                  <span className={`w-8 text-center font-semibold tabular-nums ${(target.commander[j] ?? 0) >= COMMANDER_LETHAL ? "text-danger" : ""}`}>{target.commander[j] ?? 0}</span>
                  <button type="button" className={SMALL} onClick={() => setGame(changeCommanderDamage(game, damageFor, j, 1))} aria-label={`1 more damage from ${from.name}`}>
                    +
                  </button>
                </li>
              ),
            )}
            <li className="flex min-h-14 items-center gap-3">
              <span className="min-w-0 flex-1 text-sm">Poison</span>
              <button type="button" className={SMALL} onClick={() => setGame(changePoison(game, damageFor, -1))} aria-label="1 less poison">
                −
              </button>
              <span className="w-8 text-center font-semibold tabular-nums">{target.poison}</span>
              <button type="button" className={SMALL} onClick={() => setGame(changePoison(game, damageFor, 1))} aria-label="1 more poison">
                +
              </button>
            </li>
          </ul>
        </Sheet>
      )}

      {ending && (
        <Sheet title="Log this game" sub={`${game.players.length} players, turn ${game.turn}. ${gameNote(game).replace(" (Life counter)", "")}`} onClose={() => setEnding(false)}>
          <div className="grid grid-cols-3 gap-2 px-3 pb-2">
            {(["win", "loss", "draw"] as const).map((r) => (
              <button
                key={r}
                type="button"
                disabled={busy}
                onClick={() => void log(r)}
                className={`inline-flex min-h-12 items-center justify-center rounded-xl border text-sm font-semibold disabled:opacity-50 ${suggested === r ? "border-accent bg-[color-mix(in_srgb,var(--accent)_16%,transparent)]" : "border-line"}`}
              >
                {r === "win" ? "I won" : r === "loss" ? "I lost" : "Draw"}
              </button>
            ))}
          </div>
        </Sheet>
      )}
    </div>
  );
}
