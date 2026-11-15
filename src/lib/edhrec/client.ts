import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { edhrecCache } from "@/db/schema";
import { USER_AGENT } from "@/lib/scryfall/client";

/**
 * EDHREC's public JSON pages (json.edhrec.com). There is no official API and EDHREC's terms
 * restrict automated access; Brayden confirmed on 2026-11-16 that permission is fine for this
 * personal app. We still keep use polite and easy to switch off:
 * - only fetched when you open or build a deck, never crawled
 * - cached in SQLite for 7 days (404s too)
 * - at most one request per second
 * - EDHREC_ENABLED=false turns it off; everything falls back to Scryfall data
 */
const BASE = "https://json.edhrec.com/pages";
const TTL_MS = 7 * 24 * 3600 * 1000;
const GAP_MS = 1000;

export function edhrecEnabled(): boolean {
  return (process.env.EDHREC_ENABLED ?? "true").toLowerCase() !== "false";
}

/** EDHREC URL slug for a card name: "Korvold, Fae-Cursed King" -> "korvold-fae-cursed-king". Uses the front face. */
export function edhrecSlug(name: string): string {
  const front = name.split(" // ")[0];
  return front
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’"!,.:?()]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9+]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** EDHREC orders partner pairs alphabetically by slug. */
export function commanderSlug(name: string, partner?: string): string {
  const slugs = [edhrecSlug(name), ...(partner ? [edhrecSlug(partner)] : [])].sort();
  return slugs.join("-");
}

let nextSlot = 0;
async function politeFetch(url: string): Promise<Response> {
  const wait = nextSlot - Date.now();
  nextSlot = Math.max(Date.now(), nextSlot) + GAP_MS;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  return fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
}

/** Fetch a page path (e.g. "commanders/korvold-fae-cursed-king") through the cache. Returns undefined on 404/disabled/error. */
export async function edhrecPage(db: Db, path: string, opts: { fetchImpl?: typeof politeFetch } = {}): Promise<unknown | undefined> {
  const [cached] = await db.select().from(edhrecCache).where(eq(edhrecCache.key, path));
  const fresh = cached && Date.now() - Date.parse(cached.fetchedAt) < TTL_MS;
  if (fresh) return cached.status === 200 ? JSON.parse(cached.json) : undefined;
  if (!edhrecEnabled()) return cached?.status === 200 ? JSON.parse(cached.json) : undefined;

  try {
    const res = await (opts.fetchImpl ?? politeFetch)(`${BASE}/${path}.json`);
    // EDHREC answers unknown pages with 403 from its CDN or 404.
    if (res.status === 404 || res.status === 403) {
      await save(db, path, "null", res.status);
      return undefined;
    }
    if (!res.ok) throw new Error(`EDHREC ${res.status}`);
    const text = await res.text();
    const json = JSON.parse(text);
    // A redirect page ({ redirect: "/commanders/..." }) means another slug; follow once.
    if (json && typeof json === "object" && "redirect" in json && typeof json.redirect === "string") {
      const target = json.redirect.replace(/^\/+/, "").replace(/\.json$/, "");
      if (target && target !== path) return edhrecPage(db, target, opts);
    }
    await save(db, path, text, 200);
    return json;
  } catch {
    // Network trouble: use a stale copy if we have one.
    return cached?.status === 200 ? JSON.parse(cached.json) : undefined;
  }
}

async function save(db: Db, key: string, json: string, status: number) {
  const fetchedAt = new Date().toISOString();
  await db
    .insert(edhrecCache)
    .values({ key, json, fetchedAt, status })
    .onConflictDoUpdate({ target: edhrecCache.key, set: { json, fetchedAt, status } });
}

export type EdhrecCard = {
  scryfallId?: string;
  name: string;
  /** -1..1: how much more often this card is played with the commander than in decks of its colours. */
  synergy: number;
  /** 0..1: share of the commander's (or theme's) decks that play it. */
  inclusion: number;
  numDecks: number;
  /** EDHREC list it came from: "topcards", "creatures", "lands", "highsynergycards"... */
  list: string;
};

export type EdhrecTheme = { slug: string; label: string; count: number };

export type EdhrecCommanderPage = {
  numDecks: number;
  themes: EdhrecTheme[];
  cards: EdhrecCard[];
};

type RawCardview = { id?: string; name: string; synergy?: number; num_decks?: number; potential_decks?: number; inclusion?: number };
type RawPage = {
  panels?: { taglinks?: { slug: string; value: string; count: number }[] };
  container?: { json_dict?: { card?: { num_decks?: number }; cardlists?: { tag?: string; header?: string; cardviews: RawCardview[] }[] } };
};

export function parseCommanderPage(raw: unknown): EdhrecCommanderPage | undefined {
  const page = raw as RawPage | undefined;
  const dict = page?.container?.json_dict;
  if (!dict?.cardlists) return undefined;
  const byName = new Map<string, EdhrecCard>();
  for (const list of dict.cardlists) {
    for (const cv of list.cardviews ?? []) {
      if (!cv?.name || byName.has(cv.name)) continue;
      const potential = cv.potential_decks ?? 0;
      byName.set(cv.name, {
        scryfallId: cv.id,
        name: cv.name,
        synergy: cv.synergy ?? 0,
        inclusion: potential > 0 ? (cv.num_decks ?? 0) / potential : (cv.inclusion ?? 0) / 100,
        numDecks: cv.num_decks ?? 0,
        list: list.tag ?? list.header ?? "",
      });
    }
  }
  return {
    numDecks: dict.card?.num_decks ?? 0,
    themes: (page?.panels?.taglinks ?? []).map((t) => ({ slug: t.slug, label: t.value, count: t.count })),
    cards: [...byName.values()],
  };
}

export type EdhrecTagPage = {
  commanders: { scryfallId?: string; name: string; numDecks: number }[];
  cards: EdhrecCard[];
};

export function parseTagPage(raw: unknown): EdhrecTagPage | undefined {
  const page = raw as RawPage | undefined;
  const lists = page?.container?.json_dict?.cardlists;
  if (!lists) return undefined;
  const commanders: EdhrecTagPage["commanders"] = [];
  const seen = new Set<string>();
  const cardLists: typeof lists = [];
  for (const l of lists) {
    if (/commanders$/.test(l.tag ?? "")) {
      for (const cv of l.cardviews) {
        if (seen.has(cv.name)) continue;
        seen.add(cv.name);
        commanders.push({ scryfallId: cv.id, name: cv.name, numDecks: cv.num_decks ?? 0 });
      }
    } else cardLists.push(l);
  }
  const cards = parseCommanderPage({ container: { json_dict: { cardlists: cardLists } } })?.cards ?? [];
  return { commanders, cards };
}

/** Commander page, optionally narrowed to a theme. */
export async function commanderData(db: Db, commander: string, opts: { partner?: string; theme?: string | null } = {}) {
  const slug = commanderSlug(commander, opts.partner);
  const path = opts.theme ? `commanders/${slug}/${opts.theme}` : `commanders/${slug}`;
  return parseCommanderPage(await edhrecPage(db, path));
}

export async function themeData(db: Db, theme: string) {
  return parseTagPage(await edhrecPage(db, `tags/${theme}`));
}
