/**
 * Minimal Scryfall API client that follows https://scryfall.com/docs/api/rate-limits:
 * - User-Agent and Accept headers on every request
 * - 10 req/s on most endpoints, 2 req/s on /cards/search, /cards/named, /cards/random, /cards/collection
 * - back off 30s+ on HTTP 429
 * Bulk downloads from *.scryfall.io are not rate limited and don't go through the queue.
 */

export const API_BASE = "https://api.scryfall.com";
export const USER_AGENT = "mtg-deck-builder/0.1 (personal Commander deck builder)";

const SLOW_PATHS = ["/cards/search", "/cards/named", "/cards/random", "/cards/collection"];

type Lane = { gapMs: number; next: number; chain: Promise<void> };
const lanes: Record<"fast" | "slow", Lane> = {
  fast: { gapMs: 100, next: 0, chain: Promise.resolve() },
  slow: { gapMs: 500, next: 0, chain: Promise.resolve() },
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Wait for a slot in the lane; calls are serialised so the gap holds across concurrent callers. */
function acquire(lane: Lane): Promise<void> {
  const slot = lane.chain.then(async () => {
    const wait = lane.next - Date.now();
    if (wait > 0) await sleep(wait);
    lane.next = Date.now() + lane.gapMs;
  });
  lane.chain = slot.catch(() => undefined);
  return slot;
}

export class ScryfallError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export async function scryfallFetch<T>(pathAndQuery: string, init: RequestInit = {}, attempt = 0): Promise<T> {
  const path = pathAndQuery.split("?")[0];
  const lane = SLOW_PATHS.some((p) => path.startsWith(p)) ? lanes.slow : lanes.fast;
  await acquire(lane);
  const res = await fetch(`${API_BASE}${pathAndQuery}`, {
    ...init,
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  if (res.status === 429 && attempt < 2) {
    lane.next = Date.now() + 31_000;
    return scryfallFetch<T>(pathAndQuery, init, attempt + 1);
  }
  const body = await res.json().catch(() => undefined);
  if (!res.ok) {
    const details = body as { details?: string } | undefined;
    throw new ScryfallError(details?.details ?? `Scryfall ${res.status} for ${path}`, res.status, body);
  }
  return body as T;
}

/** Scryfall card object (only the fields we use). */
export type ScryfallCard = {
  object: "card";
  id: string;
  oracle_id?: string;
  name: string;
  lang: string;
  layout: string;
  set: string;
  set_name: string;
  collector_number: string;
  rarity: string;
  released_at?: string;
  mana_cost?: string;
  cmc?: number;
  type_line?: string;
  oracle_text?: string;
  power?: string;
  toughness?: string;
  colors?: string[];
  color_identity: string[];
  keywords?: string[];
  legalities: Record<string, string>;
  edhrec_rank?: number;
  game_changer?: boolean;
  finishes?: string[];
  tcgplayer_id?: number;
  printed_name?: string;
  image_uris?: { small?: string; normal?: string };
  card_faces?: {
    name: string;
    mana_cost?: string;
    type_line?: string;
    oracle_text?: string;
    oracle_id?: string;
    power?: string;
    toughness?: string;
    image_uris?: { small?: string; normal?: string };
  }[];
  prices?: { usd?: string | null; usd_foil?: string | null; usd_etched?: string | null };
  /** Related cards: tokens it makes, meld pairs, combo pieces. */
  all_parts?: { object?: string; id: string; component: string; name: string; type_line?: string }[];
  digital?: boolean;
  set_type?: string;
  promo?: boolean;
  promo_types?: string[];
  frame_effects?: string[];
  border_color?: string;
  full_art?: boolean;
  oversized?: boolean;
  textless?: boolean;
};

export type CollectionIdentifier =
  | { id: string }
  | { oracle_id: string }
  | { name: string; set?: string }
  | { set: string; collector_number: string };

/** POST /cards/collection: up to 75 identifiers per call. Returns found cards and the identifiers it couldn't find. */
export async function fetchCollection(identifiers: CollectionIdentifier[]): Promise<{
  data: ScryfallCard[];
  notFound: CollectionIdentifier[];
}> {
  const data: ScryfallCard[] = [];
  const notFound: CollectionIdentifier[] = [];
  for (let i = 0; i < identifiers.length; i += 75) {
    const chunk = identifiers.slice(i, i + 75);
    const res = await scryfallFetch<{ data: ScryfallCard[]; not_found: CollectionIdentifier[] }>("/cards/collection", {
      method: "POST",
      body: JSON.stringify({ identifiers: chunk }),
    });
    data.push(...res.data);
    notFound.push(...res.not_found);
  }
  return { data, notFound };
}

export type BulkDataItem = {
  type: string;
  /** Current format: gzipped JSON Lines. */
  jsonl_download_uri?: string;
  /** Older format: one JSON array (kept in case Scryfall still serves it for some files). */
  download_uri?: string;
  updated_at: string;
  size?: number;
  compressed_size?: number;
  content_encoding?: string;
};

export async function listBulkData(): Promise<BulkDataItem[]> {
  const res = await scryfallFetch<{ data: BulkDataItem[] }>("/bulk-data");
  return res.data;
}
