/**
 * A Commander life counter: each player's life (40 to start), poison counters, and the commander
 * damage each has taken from each other player's commander. A player is out at 0 life, 10 poison or
 * 21 damage from one commander. Commander damage is life loss too, so adding it lowers life as well.
 * Pure state changes, so the page can keep a game in the browser and these can be tested.
 */

export type LifePlayer = { name: string; life: number; poison: number; /** Damage taken from each player's commander, by their index. */ commander: number[] };
export type LifeGame = { players: LifePlayer[]; turn: number; startedAt: string };

export const START_LIFE = 40;
export const COMMANDER_LETHAL = 21;
export const POISON_LETHAL = 10;

export function newGame(count: number, names: string[] = [], now = new Date()): LifeGame {
  const n = Math.min(6, Math.max(2, Math.round(count)));
  return {
    players: Array.from({ length: n }, (_, i) => ({ name: names[i]?.trim() || (i === 0 ? "You" : `Player ${i + 1}`), life: START_LIFE, poison: 0, commander: Array(n).fill(0) })),
    turn: 1,
    startedAt: now.toISOString(),
  };
}

const update = (g: LifeGame, i: number, f: (p: LifePlayer) => LifePlayer): LifeGame => ({ ...g, players: g.players.map((p, j) => (j === i ? f(p) : p)) });

export const changeLife = (g: LifeGame, i: number, by: number) => update(g, i, (p) => ({ ...p, life: p.life + by }));

export const changePoison = (g: LifeGame, i: number, by: number) => update(g, i, (p) => ({ ...p, poison: Math.max(0, p.poison + by) }));

/** Damage to player `i` from player `from`'s commander; it comes off their life too. Never below 0. */
export function changeCommanderDamage(g: LifeGame, i: number, from: number, by: number): LifeGame {
  return update(g, i, (p) => {
    const was = p.commander[from] ?? 0;
    const now = Math.max(0, was + by);
    const commander = [...p.commander];
    commander[from] = now;
    return { ...p, commander, life: p.life - (now - was) };
  });
}

export const nextTurn = (g: LifeGame, by = 1): LifeGame => ({ ...g, turn: Math.max(1, g.turn + by) });

/** Why a player is out, or null while they're still in. */
export function outReason(p: LifePlayer): string | null {
  if (p.life <= 0) return "No life left";
  if (p.poison >= POISON_LETHAL) return "10 poison";
  const i = p.commander.findIndex((d) => d >= COMMANDER_LETHAL);
  return i >= 0 ? "21 commander damage" : null;
}

/** "Win" when everyone else is out, "loss" when you are; undefined while it's open. */
export function suggestedResult(g: LifeGame): "win" | "loss" | undefined {
  if (outReason(g.players[0])) return "loss";
  return g.players.slice(1).every((p) => outReason(p)) ? "win" : undefined;
}

/** The note logged with the game: how you ended, and who took you out of it when someone did. */
export function gameNote(g: LifeGame): string {
  const you = g.players[0];
  const parts = [`Ended on ${you.life} life`];
  if (you.poison) parts.push(`${you.poison} poison`);
  const worst = you.commander.reduce((best, d, i) => (i !== 0 && d > (you.commander[best] ?? 0) ? i : best), -1);
  if (worst > 0 && you.commander[worst] > 0) parts.push(`${you.commander[worst]} commander damage from ${g.players[worst].name}`);
  const reason = outReason(you);
  return `${parts.join(", ")}.${reason ? ` Out to ${reason.toLowerCase()}.` : ""} (Life counter)`;
}
