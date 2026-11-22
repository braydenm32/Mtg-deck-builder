import { sql, type SQL } from "drizzle-orm";
import { normName } from "@/lib/cards/normalize";

/**
 * Scryfall-style search over your collection: `t:creature id:bg mv<=3 -is:foil o:"draw a card"`.
 *
 * Supported: t/type, o/oracle, n/name, c/color, id/identity, mv/cmc, r/rarity, s/set/e, usd, loc, tag,
 * and is:commander / foil / proxy / gamechanger / legendary / nohome / guessed / banned. A leading
 * "-" negates a term; quotes keep spaces. Every term must match (there's no "or" yet). Words without
 * a key match the name, type or rules text, as the plain search does.
 *
 * The SQL uses the collection query's aliases: c (cards), p (printings), ci (collection_items).
 */

export type ParsedSearch = {
  /** One condition per term, all to be ANDed. */
  parts: SQL[];
  /** Terms it didn't understand, shown back so you know they were ignored. */
  unknown: string[];
};

type Op = ":" | "=" | "!=" | "<" | "<=" | ">" | ">=";

const TOKEN = /(-)?(?:([a-zA-Z]+)(!=|<=|>=|:|=|<|>))?(?:"([^"]*)"?|(\S+))/g;

/** Does this look like search syntax (a key:value or a negated term) rather than a plain search? */
export function hasSyntax(q: string): boolean {
  return /(^|\s)-?[a-zA-Z]+(!=|<=|>=|:|=|<|>)\S/.test(q) || /(^|\s)-\S/.test(q);
}

const COLOR_WORDS: Record<string, string> = {
  white: "W", blue: "U", black: "B", red: "R", green: "G", colorless: "", colourless: "",
  azorius: "WU", dimir: "UB", rakdos: "BR", gruul: "RG", selesnya: "WG", orzhov: "WB", izzet: "UR", golgari: "BG", boros: "WR", simic: "UG",
  bant: "WUG", esper: "WUB", grixis: "UBR", jund: "BRG", naya: "WRG",
  abzan: "WBG", jeskai: "WUR", sultai: "UBG", mardu: "WBR", temur: "URG",
};

/** Colour letters in WUBRG order, "" for colourless, "m" for multicoloured, or undefined if not colours. */
function colours(v: string): string | undefined {
  const s = v.toLowerCase();
  if (s in COLOR_WORDS) return COLOR_WORDS[s];
  if (s === "m" || s === "multicolor" || s === "multicolour") return "m";
  if (s === "c") return "";
  if (!/^[wubrg]+$/.test(s)) return undefined;
  return "WUBRG".split("").filter((l) => s.toUpperCase().includes(l)).join("");
}

function colourCondition(col: SQL, op: Op, letters: string, defaultOp: "includes" | "within"): SQL | undefined {
  if (letters === "m") return op === ":" || op === "=" ? sql`length(${col}) >= 2` : undefined;
  if (letters === "") return op === ":" || op === "=" || op === "<=" ? sql`${col} = ''` : op === "!=" ? sql`${col} != ''` : undefined;
  const has = letters.split("").map((l) => sql`instr(${col}, ${l}) > 0`);
  const fits = "WUBRG".split("").filter((l) => !letters.includes(l)).map((l) => sql`instr(${col}, ${l}) = 0`);
  const all = (xs: SQL[]) => (xs.length ? sql`(${sql.join(xs, sql` AND `)})` : sql`1 = 1`);
  const mode = op === ":" ? (defaultOp === "includes" ? ">=" : "<=") : op;
  switch (mode) {
    case ">=":
      return all(has);
    case "<=":
      return all(fits);
    case "=":
      return sql`${col} = ${letters}`;
    case "!=":
      return sql`${col} != ${letters}`;
    case ">":
      return sql`(${all(has)} AND ${col} != ${letters})`;
    case "<":
      return sql`(${all(fits)} AND ${col} != ${letters})`;
  }
}

const SQL_OP: Record<Op, string> = { ":": "=", "=": "=", "!=": "!=", "<": "<", "<=": "<=", ">": ">", ">=": ">=" };

function compare(col: SQL, op: Op, v: string): SQL | undefined {
  const n = Number(v.replace(/^\$/, ""));
  if (!Number.isFinite(n)) return undefined;
  return sql`${col} ${sql.raw(SQL_OP[op])} ${n}`;
}

const RARITY_ORDER = ["common", "uncommon", "rare", "mythic"];
const RARITY_SHORT: Record<string, string> = { c: "common", u: "uncommon", r: "rare", m: "mythic", s: "special", b: "bonus" };

function rarity(op: Op, v: string): SQL | undefined {
  const r = RARITY_SHORT[v.toLowerCase()] ?? v.toLowerCase();
  const i = RARITY_ORDER.indexOf(r);
  if (op === ":" || op === "=") return sql`p.rarity = ${r}`;
  if (op === "!=") return sql`p.rarity != ${r}`;
  if (i < 0) return undefined;
  const pick = RARITY_ORDER.filter((_, j) => (op === ">" ? j > i : op === ">=" ? j >= i : op === "<" ? j < i : j <= i));
  return pick.length ? sql`p.rarity IN (${sql.join(pick.map((x) => sql`${x}`), sql`, `)})` : sql`0 = 1`;
}

const IS: Record<string, SQL> = {
  commander: sql`c.can_be_commander = 1`,
  foil: sql`ci.finish != 'nonfoil'`,
  etched: sql`ci.finish = 'etched'`,
  proxy: sql`ci.proxy = 1`,
  gamechanger: sql`c.game_changer = 1`,
  gc: sql`c.game_changer = 1`,
  legendary: sql`lower(c.type_line) LIKE '%legendary%'`,
  nohome: sql`(ci.location = '' AND NOT ci.proxy)`,
  guessed: sql`ci.printing_confidence = 'guessed'`,
  banned: sql`c.legal_commander = 'banned'`,
  trade: sql`EXISTS (SELECT 1 FROM json_each(COALESCE(ci.tags, '[]')) WHERE lower(json_each.value) = 'trade')`,
};

const like = (v: string) => `%${v}%`;

/** A word without a key: the name, type line or rules text (as the plain search). */
function word(v: string): SQL {
  const n = normName(v);
  return n
    ? sql`(c.norm_name LIKE ${like(n)} OR c.oracle_text LIKE ${like(v)} OR c.type_line LIKE ${like(v)})`
    : sql`(c.oracle_text LIKE ${like(v)} OR c.type_line LIKE ${like(v)})`;
}

/** `price` is one copy's price in US$ (the collection query's STACK_PRICE), for `usd>10`. */
export function parseSearch(q: string, price: SQL): ParsedSearch {
  const parts: SQL[] = [];
  const unknown: string[] = [];
  for (const m of q.matchAll(TOKEN)) {
    const [raw, neg, rawKey, rawOp, quoted, bare] = m;
    const value = (quoted ?? bare ?? "").trim();
    if (!value && !rawKey) continue;
    const key = rawKey?.toLowerCase();
    const op = (rawOp ?? ":") as Op;
    let cond: SQL | undefined;
    if (!key) cond = word(value);
    else if (key === "t" || key === "type") cond = op === ":" || op === "=" ? sql`lower(c.type_line) LIKE ${like(value.toLowerCase())}` : undefined;
    else if (key === "o" || key === "oracle") cond = op === ":" || op === "=" ? sql`c.oracle_text LIKE ${like(value)}` : undefined;
    else if (key === "n" || key === "name") cond = op === ":" || op === "=" ? sql`c.norm_name LIKE ${like(normName(value))}` : undefined;
    else if (key === "c" || key === "color" || key === "colour") {
      const l = colours(value);
      cond = l === undefined ? undefined : colourCondition(sql`c.colors`, op, l, "includes");
    } else if (key === "id" || key === "identity" || key === "ci") {
      const l = colours(value);
      cond = l === undefined ? undefined : colourCondition(sql`c.color_identity`, op, l, "within");
    } else if (key === "mv" || key === "cmc" || key === "manavalue") cond = compare(sql`c.cmc`, op, value);
    else if (key === "r" || key === "rarity") cond = rarity(op, value);
    else if (key === "s" || key === "set" || key === "e" || key === "edition") cond = op === ":" || op === "=" ? sql`p.set_code = ${value.toLowerCase()}` : undefined;
    else if (key === "usd" || key === "price") cond = compare(sql`(${price})`, op, value);
    else if (key === "loc" || key === "box" || key === "binder") cond = op === ":" || op === "=" ? sql`ci.location LIKE ${like(value)}` : undefined;
    // Your own tags on a stack (a JSON list): tag:cube, tag:"lent to sam". Case doesn't matter.
    else if (key === "tag" || key === "tags")
      cond = op === ":" || op === "=" ? sql`EXISTS (SELECT 1 FROM json_each(COALESCE(ci.tags, '[]')) WHERE lower(json_each.value) = ${value.toLowerCase()})` : undefined;
    else if (key === "is" || key === "not") {
      const c = IS[value.toLowerCase()];
      cond = c && (op === ":" || op === "=") ? (key === "not" ? sql`NOT ${c}` : c) : undefined;
    }
    if (!cond) {
      unknown.push(raw.trim());
      continue;
    }
    // A missing value (no price) counts as not matching, so -usd>10 keeps unpriced cards.
    parts.push(neg ? sql`NOT COALESCE(${cond}, 0)` : cond);
  }
  return { parts, unknown };
}
