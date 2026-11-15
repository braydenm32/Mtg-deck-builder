/**
 * Draw odds for Commander. Exact hypergeometric maths, no simulation.
 *
 * Turn counting: in a multiplayer game nobody skips their first draw (Comprehensive Rules 103.8: only the
 * first player in a two-player game skips it), so by your turn T you have seen 7 + T cards. Pass `multiplayer: false`
 * for a 1v1 game, where the player on the play sees 7 + T - 1.
 */

/** n choose k as a float. Exact enough for decks (n <= 100 keeps values well inside double range). */
export function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  k = Math.min(k, n - k);
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

/** P(exactly k successes) drawing n cards from N, of which K are successes. */
export function hypergeometric(N: number, K: number, n: number, k: number): number {
  if (n > N) n = N;
  const total = choose(N, n);
  return total === 0 ? 0 : (choose(K, k) * choose(N - K, n - k)) / total;
}

/** P(at least k successes). */
export function atLeast(N: number, K: number, n: number, k: number): number {
  if (k <= 0) return 1;
  let p = 0;
  for (let i = k; i <= Math.min(K, n); i++) p += hypergeometric(N, K, n, i);
  return Math.min(1, p);
}

/** Cards you've seen by the start of your turn `turn` (after drawing). */
export function cardsSeen(turn: number, opts: { multiplayer?: boolean; onThePlay?: boolean; handSize?: number } = {}): number {
  const hand = opts.handSize ?? 7;
  const skipsFirstDraw = opts.multiplayer === false && (opts.onThePlay ?? true);
  return hand + Math.max(0, turn - (skipsFirstDraw ? 1 : 0));
}

/** Library size for a Commander deck: 100 minus the commanders in the command zone. */
export const commanderLibrary = (commanders = 1) => 100 - commanders;

/** Distribution of land counts in an opening hand: index = number of lands. */
export function openingHandLands(library: number, lands: number, handSize = 7): number[] {
  return Array.from({ length: handSize + 1 }, (_, k) => hypergeometric(library, lands, handSize, k));
}

/** P(at least `needed` of `copies` cards by your turn `turn`). */
export function chanceByTurn(opts: {
  library: number;
  copies: number;
  turn: number;
  needed?: number;
  multiplayer?: boolean;
  onThePlay?: boolean;
}): number {
  const seen = Math.min(opts.library, cardsSeen(opts.turn, opts));
  return atLeast(opts.library, opts.copies, seen, opts.needed ?? 1);
}
