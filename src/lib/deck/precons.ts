import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { meta } from "@/db/schema";
import { addCards } from "@/lib/collection/service";
import type { CardEntry } from "@/lib/cards/identity";
import { USER_AGENT } from "@/lib/scryfall/client";
import type { DeckStatus } from "./status";
import { importDecklist } from "./store";

/**
 * Official Commander precons from MTGJSON (MIT-licensed): the list to pick from, and each deck's
 * exact printings, so a precon you own can go into your collection and become a deck in one step.
 * Upgrading it from your collection is the Upgrades tab's "Swaps from your collection".
 */

const BASE = "https://mtgjson.com/api/v5";
const LIST_KEY = "precons:list";
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type PreconSummary = { fileName: string; name: string; code: string; releaseDate: string };

type MtgjsonCard = { name: string; count: number; isFoil?: boolean; isEtched?: boolean; identifiers?: { scryfallId?: string } };
export type MtgjsonDeck = { name: string; code: string; type: string; releaseDate: string; commander?: MtgjsonCard[]; mainBoard: MtgjsonCard[] };

export type Fetcher = (url: string) => Promise<unknown>;
const getJson: Fetcher = async (url) => {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`MTGJSON ${res.status}`);
  return res.json();
};

/** Every Commander precon, newest first. Kept for a week; an older copy is used when MTGJSON can't be reached. */
export async function listPrecons(db: Db, fetcher: Fetcher = getJson): Promise<PreconSummary[]> {
  const [kept] = await db.select().from(meta).where(eq(meta.key, LIST_KEY));
  const old = kept ? (JSON.parse(kept.value) as { at: string; list: PreconSummary[] }) : undefined;
  if (old && Date.now() - Date.parse(old.at) < TTL_MS) return old.list;
  try {
    const { data } = (await fetcher(`${BASE}/DeckList.json`)) as { data: (PreconSummary & { type: string })[] };
    const list = data
      .filter((d) => d.type === "Commander Deck")
      .map(({ fileName, name, code, releaseDate }) => ({ fileName, name, code, releaseDate }))
      .sort((a, b) => b.releaseDate.localeCompare(a.releaseDate) || a.name.localeCompare(b.name));
    const value = JSON.stringify({ at: new Date().toISOString(), list });
    await db.insert(meta).values({ key: LIST_KEY, value }).onConflictDoUpdate({ target: meta.key, set: { value } });
    return list;
  } catch (e) {
    if (old) return old.list;
    throw e;
  }
}

/** A precon as a decklist the importer reads: its commander(s), then the deck. */
export function preconDecklist(d: Pick<MtgjsonDeck, "commander" | "mainBoard">): string {
  const lines = (cs: MtgjsonCard[] = []) => cs.map((c) => `${c.count} ${c.name}`).join("\n");
  return `Commander\n${lines(d.commander)}\n\nDeck\n${lines(d.mainBoard)}`;
}

/** The precon's cards as collection entries, in their exact printings and finishes. */
export function preconEntries(d: Pick<MtgjsonDeck, "commander" | "mainBoard">, location = ""): CardEntry[] {
  return [...(d.commander ?? []), ...d.mainBoard].map((c) => ({
    identity: { scryfallId: c.identifiers?.scryfallId, name: c.name },
    quantity: c.count,
    finish: c.isEtched ? "etched" : c.isFoil ? "foil" : "nonfoil",
    condition: "NM",
    location,
  }));
}

export type PreconImport = { ok: true; deckId: number; name: string; copies: number; unmatched: string[] } | { ok: false; error: string };

/**
 * Import a precon as a deck. With `owned`, its cards go into your collection first (exact
 * printings, in `location`), and the deck is set to Built so it holds those copies; otherwise it's
 * an Idea that shows what you'd still need.
 */
export async function importPrecon(db: Db, fileName: string, opts: { owned: boolean; location?: string; fetcher?: Fetcher }): Promise<PreconImport> {
  if (!/^[A-Za-z0-9_]+$/.test(fileName)) return { ok: false, error: "That isn’t a precon." };
  let deck: MtgjsonDeck;
  try {
    deck = ((await (opts.fetcher ?? getJson)(`${BASE}/decks/${fileName}.json`)) as { data: MtgjsonDeck }).data;
  } catch {
    return { ok: false, error: "Couldn’t reach MTGJSON for that precon. Check the connection and try again." };
  }
  let copies = 0;
  if (opts.owned) {
    const added = await addCards(db, preconEntries(deck, opts.location?.trim() ?? ""), { source: `precon:${deck.code.toLowerCase()}` });
    const entries = preconEntries(deck);
    copies = added.added.reduce((n, a) => n + (entries[a.index]?.quantity ?? 0), 0);
  }
  const status: DeckStatus = opts.owned ? "built" : "idea";
  const r = await importDecklist(db, preconDecklist(deck), { name: deck.name, status });
  if (!r.ok) return { ok: false, error: "That precon’s list couldn’t be read." };
  return { ok: true, deckId: r.deck.id, name: r.deck.name, copies, unmatched: r.unmatched };
}
