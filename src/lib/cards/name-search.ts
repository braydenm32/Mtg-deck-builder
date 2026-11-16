import { normName } from "./normalize";

/** One card in the list the device keeps (GET /api/cards/names): [oracleId, name, typeLine, colorIdentity, 1 if it can be your commander]. */
export type CardListRow = [string, string, string, string, 0 | 1];

/**
 * Name autocomplete over a list sorted most popular first: names starting with the query, then names
 * containing it, up to `limit`. Pure, so the server (src/lib/cards/lookup.ts) and the device's copy of
 * the card list (src/lib/offline/card-index.ts) answer a search the same way.
 */
export function matchNames<T extends { normName: string }>(rows: readonly T[], query: string, limit: number, fits: (row: T) => boolean = () => true): T[] {
  const q = normName(query);
  if (!q) return [];
  const prefix: T[] = [];
  const contains: T[] = [];
  for (const c of rows) {
    if (prefix.length >= limit) break;
    const at = c.normName.indexOf(q);
    if (at < 0 || !fits(c)) continue;
    if (at === 0) prefix.push(c);
    else if (contains.length < limit) contains.push(c);
  }
  return prefix.concat(contains).slice(0, limit);
}

/** Does a colour identity fit inside `identity` (WUBRG letters; "" is colourless)? Undefined: any. */
export function fitsIdentity(identity: string | undefined): (colorIdentity: string) => boolean {
  if (identity === undefined) return () => true;
  const outside = "WUBRG".split("").filter((c) => !identity.includes(c));
  return (ci) => outside.every((x) => !ci.includes(x));
}
