import { sql, type SQL } from "drizzle-orm";
import type { Db } from "@/db/client";
import { normName } from "@/lib/cards/normalize";

/**
 * Collection browsing. Filters come straight from URL search params so every view is linkable
 * and Back returns to the same view.
 */
export type CollectionFilters = {
  q?: string;
  /** Colour identity letters, e.g. "BG". With `ciMode` "within", shows cards playable in a deck of these colours. */
  ci?: string;
  ciMode?: "within" | "exact" | "includes";
  type?: string;
  rarity?: string;
  set?: string;
  commander?: boolean;
  sort?: "name" | "cmc" | "price" | "edhrec" | "added" | "quantity";
  dir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
};

export const TYPES = ["creature", "instant", "sorcery", "artifact", "enchantment", "planeswalker", "land", "battle"] as const;
export const RARITIES = ["common", "uncommon", "rare", "mythic", "special", "bonus"] as const;
const SORTS = ["name", "cmc", "price", "edhrec", "added", "quantity"] as const;

export function parseFilters(params: Record<string, string | string[] | undefined>): CollectionFilters {
  const one = (k: string) => {
    const v = params[k];
    return (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
  };
  const sort = one("sort");
  const ciMode = one("ciMode");
  const page = Number.parseInt(one("page") ?? "1", 10);
  return {
    q: one("q"),
    ci: one("ci")?.toUpperCase().replace(/[^WUBRGC]/g, ""),
    ciMode: ciMode === "exact" || ciMode === "includes" ? ciMode : "within",
    type: one("type")?.toLowerCase(),
    rarity: one("rarity")?.toLowerCase(),
    set: one("set")?.toLowerCase(),
    commander: one("commander") === "1",
    sort: (SORTS as readonly string[]).includes(sort ?? "") ? (sort as CollectionFilters["sort"]) : "name",
    dir: one("dir") === "desc" ? "desc" : one("dir") === "asc" ? "asc" : undefined,
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

/**
 * USD price of one owned copy: Scryfall's market price for that printing in its finish.
 * When the printing was only guessed from a name, use the card's cheapest printing instead,
 * so a guess can't inflate the collection's value.
 */
const STACK_PRICE = sql`CASE
  WHEN ci.printing_confidence = 'guessed' THEN c.price_usd
  WHEN ci.finish = 'foil' THEN COALESCE(p.price_usd_foil, p.price_usd)
  WHEN ci.finish = 'etched' THEN COALESCE(p.price_usd_etched, p.price_usd_foil, p.price_usd)
  ELSE COALESCE(p.price_usd, p.price_usd_foil) END`;

function where(f: CollectionFilters): SQL {
  const parts: SQL[] = [sql`1 = 1`];
  if (f.q) {
    const n = normName(f.q);
    if (n) parts.push(sql`(c.norm_name LIKE ${"%" + n + "%"} OR c.oracle_text LIKE ${"%" + f.q + "%"} OR c.type_line LIKE ${"%" + f.q + "%"})`);
  }
  if (f.ci !== undefined && f.ci !== "") {
    const letters = f.ci.replace("C", "");
    const all = ["W", "U", "B", "R", "G"];
    if (f.ciMode === "exact") parts.push(sql`c.color_identity = ${letters}`);
    else if (f.ciMode === "includes") for (const l of letters) parts.push(sql`instr(c.color_identity, ${l}) > 0`);
    else for (const l of all.filter((x) => !letters.includes(x))) parts.push(sql`instr(c.color_identity, ${l}) = 0`);
  }
  if (f.type && (TYPES as readonly string[]).includes(f.type)) parts.push(sql`lower(c.type_line) LIKE ${"%" + f.type + "%"}`);
  if (f.rarity) parts.push(sql`p.rarity = ${f.rarity}`);
  if (f.set) parts.push(sql`p.set_code = ${f.set}`);
  if (f.commander) parts.push(sql`c.can_be_commander = 1`);
  return sql.join(parts, sql` AND `);
}

function orderBy(f: CollectionFilters): SQL {
  const desc = f.dir === "desc";
  const d = (defaultDesc: boolean) => sql.raw((f.dir ? desc : defaultDesc) ? "DESC" : "ASC");
  switch (f.sort) {
    case "cmc":
      return sql`c.cmc ${d(false)}, c.name`;
    case "price":
      return sql`value IS NULL, value ${d(true)}, c.name`;
    case "edhrec":
      return sql`c.edhrec_rank IS NULL, c.edhrec_rank ${d(false)}, c.name`;
    case "added":
      return sql`added_at ${d(true)}, c.name`;
    case "quantity":
      return sql`quantity ${d(true)}, c.name`;
    default:
      return sql`c.name ${d(false)}`;
  }
}

export type CollectionCard = {
  oracleId: string;
  name: string;
  typeLine: string;
  manaCost: string | null;
  cmc: number;
  colorIdentity: string;
  edhrecRank: number | null;
  canBeCommander: boolean;
  legalCommander: string;
  quantity: number;
  stacks: number;
  foils: number;
  proxies: number;
  /** Copies whose exact printing we guessed from the name. */
  guessed: number;
  image: string | null;
  imageSmall: string | null;
  value: number | null;
  addedAt: string;
};

export async function queryCollection(db: Db, f: CollectionFilters) {
  const pageSize = f.pageSize ?? 60;
  const page = f.page ?? 1;
  const w = where(f);
  const rows = await db.all<Record<string, unknown>>(sql`
    SELECT c.oracle_id, c.name, c.type_line, c.mana_cost, c.cmc, c.color_identity, c.edhrec_rank,
           c.can_be_commander, c.legal_commander,
           SUM(ci.quantity) AS quantity,
           COUNT(*) AS stacks,
           SUM(CASE WHEN ci.finish != 'nonfoil' THEN ci.quantity ELSE 0 END) AS foils,
           SUM(CASE WHEN ci.proxy THEN ci.quantity ELSE 0 END) AS proxies,
           SUM(CASE WHEN ci.printing_confidence = 'guessed' THEN ci.quantity ELSE 0 END) AS guessed,
           MIN(p.image_normal) AS image,
           MIN(p.image_small) AS image_small,
           SUM(CASE WHEN ci.proxy THEN 0 ELSE ci.quantity * (${STACK_PRICE}) END) AS value,
           MAX(ci.added_at) AS added_at
    FROM collection_items ci
    JOIN cards c ON c.oracle_id = ci.oracle_id
    JOIN printings p ON p.id = ci.printing_id
    WHERE ${w}
    GROUP BY c.oracle_id
    ORDER BY ${orderBy(f)}
    LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`);
  const [totals] = await db.all<{ unique_cards: number; copies: number; value: number | null }>(sql`
    SELECT COUNT(DISTINCT c.oracle_id) AS unique_cards, COALESCE(SUM(ci.quantity), 0) AS copies,
           SUM(CASE WHEN ci.proxy THEN 0 ELSE ci.quantity * (${STACK_PRICE}) END) AS value
    FROM collection_items ci
    JOIN cards c ON c.oracle_id = ci.oracle_id
    JOIN printings p ON p.id = ci.printing_id
    WHERE ${w}`);
  const cards: CollectionCard[] = rows.map((r) => ({
    oracleId: String(r.oracle_id),
    name: String(r.name),
    typeLine: String(r.type_line),
    manaCost: (r.mana_cost as string) ?? null,
    cmc: Number(r.cmc),
    colorIdentity: String(r.color_identity),
    edhrecRank: r.edhrec_rank == null ? null : Number(r.edhrec_rank),
    canBeCommander: Boolean(r.can_be_commander),
    legalCommander: String(r.legal_commander),
    quantity: Number(r.quantity),
    stacks: Number(r.stacks),
    foils: Number(r.foils),
    proxies: Number(r.proxies),
    guessed: Number(r.guessed),
    image: (r.image as string) ?? null,
    imageSmall: (r.image_small as string) ?? null,
    value: r.value == null ? null : Number(r.value),
    addedAt: String(r.added_at),
  }));
  const unique = Number(totals?.unique_cards ?? 0);
  return {
    cards,
    page,
    pageSize,
    pages: Math.max(1, Math.ceil(unique / pageSize)),
    totals: { unique, copies: Number(totals?.copies ?? 0), value: totals?.value == null ? null : Number(totals.value) },
  };
}

/** Sets that appear in the collection, for the set filter. */
export async function collectionSets(db: Db) {
  return db.all<{ code: string; name: string; copies: number }>(sql`
    SELECT p.set_code AS code, p.set_name AS name, SUM(ci.quantity) AS copies
    FROM collection_items ci JOIN printings p ON p.id = ci.printing_id
    GROUP BY p.set_code ORDER BY p.set_name`);
}

/** Everything owned of one card: the card, and each stack with its printing. */
export async function ownedCard(db: Db, oracleId: string) {
  const [card] = await db.all<Record<string, unknown>>(sql`SELECT * FROM cards WHERE oracle_id = ${oracleId}`);
  if (!card) return undefined;
  const stacks = await db.all<Record<string, unknown>>(sql`
    SELECT ci.*, p.set_code, p.set_name, p.collector_number, p.rarity, p.image_normal, p.image_small, p.finishes,
           (${STACK_PRICE}) AS unit_price
    FROM collection_items ci JOIN printings p ON p.id = ci.printing_id JOIN cards c ON c.oracle_id = ci.oracle_id
    WHERE ci.oracle_id = ${oracleId}
    ORDER BY p.released_at DESC, ci.finish, ci.location`);
  return { card, stacks };
}
