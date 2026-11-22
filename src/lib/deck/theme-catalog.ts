import { CREATURE_TYPES, EDHREC_THEMES, RULES_WORDS } from "./theme-list";

/**
 * Every theme you can pick or type on Find a commander: EDHREC's whole theme list plus a typal
 * theme for every creature type (EDHREC slugs are plurals: "dragons", "elves", "slivers").
 * Pure data and string work, so the theme search on the phone uses it too.
 */
export type ThemeEntry = {
  slug: string;
  label: string;
  /** Decks on EDHREC with this theme (0 for a creature type EDHREC doesn't list). */
  decks: number;
  /** The creature type, for a typal theme. */
  type?: string;
  /** A keyword or subtype the theme is named after ("Flying", "Auras"): cards with it fit. */
  word?: string;
};

/** Plurals that don't just add "s". Types not listed (and not ending s/x/ch/sh/y) add "s". */
const IRREGULAR: Record<string, string> = {
  Elf: "elves",
  Dwarf: "dwarves",
  Wolf: "wolves",
  Werewolf: "werewolves",
  Fungus: "fungi",
  Mouse: "mice",
  Pegasus: "pegasi",
  Octopus: "octopi",
  Homunculus: "homunculi",
  Cyberman: "cybermen",
  Hero: "heroes",
  Ox: "oxen",
};
/** Types whose plural is the same word. */
const SAME = new Set(["Myr", "Kor", "Kithkin", "Merfolk", "Treefolk", "Moonfolk", "Samurai", "Astartes", "Kavu", "Eldrazi", "Fish", "Sheep", "Djinn", "Borg"]);

/** EDHREC-style slug for a creature type's theme: "Dragon" -> "dragons", "Time Lord" -> "time-lords". */
export function typalSlug(type: string): string {
  let p: string;
  if (IRREGULAR[type]) p = IRREGULAR[type];
  else if (SAME.has(type)) p = type;
  else if (/(?:s|x|z|ch|sh)$/i.test(type)) p = `${type}es`;
  else if (/[^aeiou]y$/i.test(type)) p = `${type.slice(0, -1)}ies`;
  else p = `${type}s`;
  return slugify(p);
}

/** "Time Lords" from "time-lords"; EDHREC's own label when it has one. */
export function typalLabel(type: string): string {
  const slug = typalSlug(type);
  const words = type.split(" ");
  const last = slug.split("-").pop() ?? "";
  return [...words.slice(0, -1), last[0].toUpperCase() + last.slice(1)].join(" ");
}

/** Lower-case, accents and apostrophes gone, "+1/+1" as EDHREC spells it, words joined by "-". */
export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\+1\/\+1/g, "plus-1-plus-1")
    .replace(/-1\/-1/g, "minus-1-minus-1")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const TYPE_BY_SLUG = new Map<string, string>();
for (const t of CREATURE_TYPES) {
  TYPE_BY_SLUG.set(typalSlug(t), t);
}

const WORDS = new Map(RULES_WORDS.map((w) => [w.toLowerCase(), w]));
/** Themes named after a word cards carry, where the name alone doesn't say it. */
const WORD_OF: Record<string, string> = {
  legends: "Legendary",
  planeswalkers: "Planeswalker",
  battles: "Battle",
  snow: "Snow",
  historic: "historic",
  monarch: "monarch",
  devotion: "devotion",
  energy: "energy",
  dungeon: "dungeon",
  "the-ring": "the Ring",
  guildgates: "Gate",
};

/** The keyword or subtype a theme is named after: "Flying", "Auras" -> "Aura", "Clues" -> "Clue". */
function wordFor(slug: string, label: string): string | undefined {
  if (WORD_OF[slug]) return WORD_OF[slug];
  // "Experience Counters", "-1/-1 Counters": cards that use that counter.
  if (/-counters$/.test(slug) && slug !== "plus-1-plus-1-counters") return `${label.replace(/ counters$/i, "")} counter`;
  const l = label.toLowerCase().replace(/ matters?$/, "");
  const tries = [l, l.replace(/ies$/, "y"), l.replace(/es$/, ""), l.replace(/s$/, "")];
  for (const t of tries) if (WORDS.has(t)) return WORDS.get(t);
  return undefined;
}

export const THEME_CATALOG: ThemeEntry[] = (() => {
  const out: ThemeEntry[] = [];
  const seen = new Set<string>();
  for (const [slug, label, decks] of EDHREC_THEMES) {
    const type = TYPE_BY_SLUG.get(slug);
    out.push({ slug, label, decks, type, word: type ? undefined : wordFor(slug, label) });
    seen.add(slug);
  }
  for (const type of CREATURE_TYPES) {
    const slug = typalSlug(type);
    if (seen.has(slug)) continue;
    seen.add(slug);
    out.push({ slug, label: typalLabel(type), decks: 0, type });
  }
  return out;
})();

const BY_SLUG = new Map(THEME_CATALOG.map((t) => [t.slug, t]));

export function catalogTheme(slug: string): ThemeEntry | undefined {
  return BY_SLUG.get(slug);
}

/** The creature type a theme slug is about, from the catalog or the plural of any creature type. */
export function catalogType(slug: string): string | undefined {
  return BY_SLUG.get(slug)?.type ?? TYPE_BY_SLUG.get(slug);
}

/** What people add to a typal search that isn't part of the type: "angel tribal", "dragons deck". */
const FILLER = /\b(?:tribal|typal|tribe|deck|theme|matters?)\b/g;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9+/ -]/g, "").trim();

/** The creature type someone typed, singular or plural: "angel", "Angels", "time lord". */
function typeTyped(text: string): string | undefined {
  const t = norm(text).replace(FILLER, "").trim();
  if (!t) return undefined;
  const slug = slugify(t);
  return TYPE_BY_SLUG.get(slug) ?? CREATURE_TYPES.find((c) => slugify(c) === slug);
}

/**
 * The theme for what someone typed: a theme's name or slug, a creature type in any form (so
 * "angel", "angels" and "angel tribal" all mean Angels), or failing that the text as a slug.
 */
export function resolveTheme(text: string): string | undefined {
  const t = norm(text);
  if (!t) return undefined;
  const exact = THEME_CATALOG.find((e) => e.label.toLowerCase() === t || e.slug === slugify(t));
  if (exact) return exact.slug;
  const type = typeTyped(t);
  if (type) return typalSlug(type);
  const bare = t.replace(FILLER, "").replace(/\s+/g, " ").trim();
  const loose = bare && THEME_CATALOG.find((e) => e.label.toLowerCase() === bare || e.slug === slugify(bare));
  if (loose) return loose.slug;
  // A slip of the keys ("silvers" for Slivers) still finds the theme when only one is that close.
  const near = bare.length >= 4 ? THEME_CATALOG.filter((e) => typos(bare, e.label.toLowerCase()) <= 1 || (e.type && typos(bare, e.type.toLowerCase()) <= 1)) : [];
  if (near.length === 1) return near[0].slug;
  const slug = slugify(bare || t);
  return slug || undefined;
}

/** Edits between two words (a swapped pair of letters counts as one), stopping early past 2. */
function typos(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/**
 * Themes matching a search, best first: exact, then names starting with it, then a word starting
 * with it, then anywhere; EDHREC's most played first within each. A creature type typed in the
 * singular ("angel") finds its typal theme.
 */
export function searchThemes(query: string, limit = 8): ThemeEntry[] {
  const q = norm(query).replace(FILLER, "").replace(/\s+/g, " ").trim();
  if (!q) return [];
  const type = typeTyped(q);
  const typeSlug = type ? typalSlug(type) : undefined;
  const scored: { e: ThemeEntry; rank: number }[] = [];
  for (const e of THEME_CATALOG) {
    const label = e.label.toLowerCase();
    const typeName = e.type?.toLowerCase();
    let rank = -1;
    if (e.slug === typeSlug || label === q || typeName === q) rank = 0;
    else if (label.startsWith(q) || typeName?.startsWith(q)) rank = 1;
    else if (label.split(/[\s/-]+/).some((w) => w.startsWith(q))) rank = 2;
    else if (q.length >= 4 && (label.includes(q) || e.slug.includes(slugify(q)))) rank = 3;
    else if (q.length >= 4 && (typos(q, label) <= (q.length >= 6 ? 2 : 1) || (typeName && typos(q, typeName) <= (q.length >= 6 ? 2 : 1)))) rank = 4;
    if (rank >= 0) scored.push({ e, rank });
  }
  return scored
    .sort((a, b) => a.rank - b.rank || b.e.decks - a.e.decks || a.e.label.localeCompare(b.e.label))
    .slice(0, limit)
    .map((s) => s.e);
}

/** EDHREC's most played themes that aren't creature types. */
export function popularThemes(n: number): ThemeEntry[] {
  return THEME_CATALOG.filter((t) => !t.type && t.decks > 0).slice(0, n);
}

/** EDHREC's most played creature types. */
export function popularTypes(n: number): ThemeEntry[] {
  return THEME_CATALOG.filter((t) => t.type && t.decks > 0).slice(0, n);
}
