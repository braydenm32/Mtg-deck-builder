import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { TYPES } from "./query";

/** One bar: what it counts, and the collection view that lists those cards. */
export type StatBar = { key: string; label: string; count: number; href: string };

export type CollectionStats = {
  /** Unique cards (basic lands left out) by colour identity. */
  colours: StatBar[];
  /** Unique cards by card type; a card with two types counts in both. */
  types: StatBar[];
  /** Unique nonland cards by mana value, 0 to 7+. */
  curve: StatBar[];
  /** Copies by rarity. */
  rarities: StatBar[];
  /** The sets you own most copies from. */
  sets: StatBar[];
  setCount: number;
  facts: { unique: number; commanders: number; gameChangers: number; foils: number; proxies: number; averageMv: number | null };
};

const COLOUR_NAMES: Record<string, string> = { W: "White", U: "Blue", B: "Black", R: "Red", G: "Green" };
const RARITY_LABELS: Record<string, string> = { mythic: "Mythic", rare: "Rare", uncommon: "Uncommon", common: "Common", special: "Special", bonus: "Bonus" };
const BASICS = /^(Plains|Island|Swamp|Mountain|Forest|Wastes|Snow-Covered .+)$/;
const q = (s: string) => `/collection?${s}`;

/**
 * The collection at a glance: colours, types, curve, rarities and sets, each bar a link to those
 * cards. Two queries over what you own (never the whole card table).
 */
export async function collectionStats(db: Db): Promise<CollectionStats> {
  const [cards, prints] = await Promise.all([
    db.all<{ name: string; color_identity: string; type_line: string; cmc: number; can_be_commander: number; game_changer: number }>(sql`
      SELECT c.name, c.color_identity, c.type_line, c.cmc, c.can_be_commander, c.game_changer
      FROM (SELECT DISTINCT oracle_id FROM collection_items) o CROSS JOIN cards c ON c.oracle_id = o.oracle_id`),
    db.all<{ rarity: string; set_code: string; set_name: string; copies: number; foils: number; proxies: number }>(sql`
      SELECT p.rarity, p.set_code, p.set_name, SUM(ci.quantity) AS copies,
             SUM(CASE WHEN ci.finish != 'nonfoil' THEN ci.quantity ELSE 0 END) AS foils,
             SUM(CASE WHEN ci.proxy THEN ci.quantity ELSE 0 END) AS proxies
      FROM collection_items ci CROSS JOIN printings p ON p.id = ci.printing_id
      GROUP BY p.rarity, p.set_code`),
  ]);

  const real = cards.filter((c) => !BASICS.test(c.name));
  const colourCount = new Map<string, number>();
  const typeCount = new Map<string, number>();
  const curveCount = new Map<number, number>();
  let mvSum = 0;
  let spells = 0;
  for (const c of real) {
    const id = c.color_identity;
    const k = id === "" ? "C" : id.length > 1 ? "M" : id;
    colourCount.set(k, (colourCount.get(k) ?? 0) + 1);
    const t = c.type_line.toLowerCase();
    for (const type of TYPES) if (t.includes(type)) typeCount.set(type, (typeCount.get(type) ?? 0) + 1);
    if (!t.includes("land")) {
      const mv = Math.min(7, Math.floor(Number(c.cmc)));
      curveCount.set(mv, (curveCount.get(mv) ?? 0) + 1);
      mvSum += Number(c.cmc);
      spells++;
    }
  }

  const colours: StatBar[] = [
    ...["W", "U", "B", "R", "G"].map((l) => ({ key: l, label: COLOUR_NAMES[l], count: colourCount.get(l) ?? 0, href: q(`ci=${l}&ciMode=exact`) })),
    { key: "M", label: "Multicolour", count: colourCount.get("M") ?? 0, href: q(`q=${encodeURIComponent("id:m")}`) },
    { key: "C", label: "Colourless", count: colourCount.get("C") ?? 0, href: q("ci=C") },
  ];
  const types = TYPES.map((t) => ({ key: t, label: t[0].toUpperCase() + t.slice(1), count: typeCount.get(t) ?? 0, href: q(`type=${t}`) }))
    .filter((b) => b.count > 0)
    .sort((a, b) => b.count - a.count);
  const curve = Array.from({ length: 8 }, (_, mv) => ({
    key: String(mv),
    label: mv === 7 ? "7+" : String(mv),
    count: curveCount.get(mv) ?? 0,
    href: q(`q=${encodeURIComponent(`${mv === 7 ? "mv>=7" : `mv=${mv}`} -t:land`)}`),
  }));

  const byRarity = new Map<string, number>();
  const bySet = new Map<string, { name: string; copies: number }>();
  let foils = 0;
  let proxies = 0;
  for (const p of prints) {
    const n = Number(p.copies);
    byRarity.set(p.rarity, (byRarity.get(p.rarity) ?? 0) + n);
    const s = bySet.get(p.set_code) ?? { name: p.set_name, copies: 0 };
    s.copies += n;
    bySet.set(p.set_code, s);
    foils += Number(p.foils);
    proxies += Number(p.proxies);
  }
  const rarities = Object.keys(RARITY_LABELS)
    .filter((r) => byRarity.get(r))
    .map((r) => ({ key: r, label: RARITY_LABELS[r], count: byRarity.get(r)!, href: q(`rarity=${r}`) }));
  const sets = [...bySet.entries()]
    .sort((a, b) => b[1].copies - a[1].copies || a[1].name.localeCompare(b[1].name))
    .slice(0, 8)
    .map(([code, s]) => ({ key: code, label: s.name, count: s.copies, href: q(`set=${code}`) }));

  return {
    colours,
    types,
    curve,
    rarities,
    sets,
    setCount: bySet.size,
    facts: {
      unique: real.length,
      commanders: real.filter((c) => Number(c.can_be_commander) === 1).length,
      gameChangers: real.filter((c) => Number(c.game_changer) === 1).length,
      foils,
      proxies,
      averageMv: spells ? Math.round((mvSum / spells) * 100) / 100 : null,
    },
  };
}
