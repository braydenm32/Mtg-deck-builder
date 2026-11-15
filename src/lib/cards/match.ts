import { and, eq, inArray, or } from "drizzle-orm";
import type { Db } from "@/db/client";
import { cards, printings } from "@/db/schema";
import { fetchCollection, type CollectionIdentifier } from "@/lib/scryfall/client";
import type { CardIdentity } from "./identity";
import { frontFace, normCollectorNumber, normName, normSetCode } from "./normalize";
import { storeScryfallCards } from "./store";

export type Printing = typeof printings.$inferSelect;

export type MatchResult =
  | { ok: true; printing: Printing; via: "scryfall-id" | "tcgplayer-id" | "set-number" | "name-set" | "name" }
  | { ok: false; reason: string };

export type MatchOptions = {
  /** Ask the Scryfall API about cards missing from the local bulk data (default true). */
  online?: boolean;
};

/**
 * Pick one printing among several. Order of preference: the requested language (else English),
 * made in the requested finish, the most regular printing (no promos, Secret Lair, showcase...), newest.
 */
export function pick(list: Printing[], lang?: string, finish?: string): Printing | undefined {
  if (!list.length) return undefined;
  const wantLang = lang && list.some((p) => p.lang === lang) ? lang : list.some((p) => p.lang === "en") ? "en" : undefined;
  const score = (p: Printing) => [
    wantLang && p.lang !== wantLang ? 1 : 0,
    finish && !p.finishes.includes(finish) ? 1 : 0,
    p.variantRank,
  ];
  return [...list].sort((a, b) => {
    const sa = score(a);
    const sb = score(b);
    for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return sa[i] - sb[i];
    return (b.releasedAt ?? "").localeCompare(a.releasedAt ?? "");
  })[0];
}

const setNameCache = new WeakMap<Db, Promise<Map<string, string>>>();

/** Normalised set name -> set code, e.g. "commander 2021" -> "c21". Built once per database handle. */
async function setNameIndex(db: Db): Promise<Map<string, string>> {
  let p = setNameCache.get(db);
  if (!p) {
    p = db
      .selectDistinct({ name: printings.setName, code: printings.setCode })
      .from(printings)
      .then((rows) => {
        const m = new Map<string, string>();
        for (const r of rows) {
          const n = normName(r.name);
          if (!m.has(n)) m.set(n, r.code);
          // "Magic 2010" vs "Magic 2010 Core Set", "Commander 2021" vs "Commander 2021 Edition"
          const short = n.replace(/\b(core set|edition|expansion)\b/g, "").replace(/\s+/g, " ").trim();
          if (short && !m.has(short)) m.set(short, r.code);
        }
        return m;
      });
    setNameCache.set(db, p);
  }
  return p;
}

/** Forget cached set names (after a bulk sync adds new sets). */
export function clearMatchCaches(db: Db) {
  setNameCache.delete(db);
}

async function setCodeFor(db: Db, id: CardIdentity): Promise<string | undefined> {
  const code = normSetCode(id.setCode);
  if (code) return code;
  if (!id.setName) return undefined;
  const index = await setNameIndex(db);
  const n = normName(id.setName);
  return index.get(n) ?? index.get(n.replace(/\b(core set|edition|expansion)\b/g, "").replace(/\s+/g, " ").trim());
}

async function matchLocal(db: Db, id: CardIdentity, finish?: string): Promise<MatchResult> {
  if (id.scryfallId) {
    const [p] = await db.select().from(printings).where(eq(printings.id, id.scryfallId.trim().toLowerCase()));
    if (p) return { ok: true, printing: p, via: "scryfall-id" };
  }
  if (id.tcgplayerId) {
    const list = await db.select().from(printings).where(eq(printings.tcgplayerId, id.tcgplayerId));
    const p = pick(list, id.lang, finish);
    if (p) return { ok: true, printing: p, via: "tcgplayer-id" };
  }
  const set = await setCodeFor(db, id);
  const num = normCollectorNumber(id.collectorNumber);
  if (set && num) {
    const list = await db
      .select()
      .from(printings)
      .where(and(eq(printings.setCode, set), eq(printings.collectorNumber, num)));
    const p = pick(list, id.lang, finish);
    if (p) return { ok: true, printing: p, via: "set-number" };
  }
  if (id.name) {
    const n = normName(id.name);
    const front = normName(frontFace(id.name));
    const found = await db
      .select({ oracleId: cards.oracleId, legal: cards.legalCommander })
      .from(cards)
      .where(or(eq(cards.normName, n), eq(cards.normFrontName, n), eq(cards.normFrontName, front)));
    if (found.length) {
      // Prefer real cards over tokens/art cards that share a name.
      found.sort((a, b) => Number(b.legal !== "not_legal") - Number(a.legal !== "not_legal"));
      const oracleIds = found.map((f) => f.oracleId);
      if (set) {
        const inSet = await db
          .select()
          .from(printings)
          .where(and(inArray(printings.oracleId, oracleIds), eq(printings.setCode, set)));
        const exactNum = num ? inSet.filter((x) => x.collectorNumber === num) : [];
        const p = pick(exactNum.length ? exactNum : inSet, id.lang, finish);
        if (p) return { ok: true, printing: p, via: "name-set" };
      }
      const all = await db
        .select()
        .from(printings)
        .where(eq(printings.oracleId, oracleIds[0]));
      const p = pick(all, id.lang, finish);
      if (p) return { ok: true, printing: p, via: "name" };
    }
  }
  return { ok: false, reason: describeMiss(id) };
}

function describeMiss(id: CardIdentity): string {
  if (!id.scryfallId && !id.name && !(id.setCode && id.collectorNumber) && !id.tcgplayerId) {
    return "Row has no card name, Scryfall ID, or set and collector number";
  }
  const parts = [id.name && `"${id.name}"`, id.setCode ? `set ${id.setCode.toUpperCase()}` : id.setName && `set "${id.setName}"`, id.collectorNumber && `#${id.collectorNumber}`]
    .filter(Boolean)
    .join(" ");
  return `No card found for ${parts || `Scryfall ID ${id.scryfallId}`}`;
}

function onlineIdentifier(id: CardIdentity): CollectionIdentifier | undefined {
  if (id.scryfallId) return { id: id.scryfallId.trim().toLowerCase() };
  const set = normSetCode(id.setCode);
  const num = normCollectorNumber(id.collectorNumber);
  if (set && num) return { set, collector_number: num };
  if (id.name) return set ? { name: frontFace(id.name), set } : { name: frontFace(id.name) };
  return undefined;
}

/**
 * Resolve card identities to printings. Tries the local database first, then (if `online`)
 * asks Scryfall in batches for whatever is left, stores what it finds, and retries.
 */
export async function matchIdentities(
  db: Db,
  ids: CardIdentity[],
  opts: MatchOptions & { finishes?: (string | undefined)[] } = {},
): Promise<MatchResult[]> {
  const results = await Promise.all(ids.map((id, i) => matchLocal(db, id, opts.finishes?.[i])));
  if (opts.online === false) return results;

  const misses = results.map((r, i) => (r.ok ? -1 : i)).filter((i) => i >= 0);
  const lookups = misses
    .map((i) => ({ i, ident: onlineIdentifier(ids[i]) }))
    .filter((x): x is { i: number; ident: CollectionIdentifier } => !!x.ident);
  if (!lookups.length) return results;

  // De-duplicate so 4 copies of one missing card cost one lookup.
  const unique = new Map<string, CollectionIdentifier>();
  for (const l of lookups) unique.set(JSON.stringify(l.ident), l.ident);
  try {
    const { data } = await fetchCollection([...unique.values()]);
    if (data.length) await storeScryfallCards(db, data);
  } catch (err) {
    for (const l of lookups) {
      const r = results[l.i];
      if (!r.ok) results[l.i] = { ok: false, reason: `${r.reason} (Scryfall lookup failed: ${(err as Error).message})` };
    }
    return results;
  }
  for (const l of lookups) results[l.i] = await matchLocal(db, ids[l.i], opts.finishes?.[l.i]);
  return results;
}
