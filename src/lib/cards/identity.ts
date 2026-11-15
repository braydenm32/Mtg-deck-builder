/**
 * What any card source (CSV row, typed list, phone scanner) knows about a physical card.
 * Every field is optional except that we need *something* to identify it:
 * a Scryfall ID, a set + collector number, a TCGplayer product ID, or a name.
 */
export type Finish = "nonfoil" | "foil" | "etched";

export type CardIdentity = {
  scryfallId?: string;
  name?: string;
  setCode?: string;
  collectorNumber?: string;
  lang?: string;
  tcgplayerId?: number;
};

/** A card to add to the collection, before it has been matched to a printing. */
export type CardEntry = {
  identity: CardIdentity;
  quantity: number;
  finish: Finish;
  condition?: string;
  location?: string;
  altered?: boolean;
  signed?: boolean;
  misprint?: boolean;
  proxy?: boolean;
  purchasePrice?: number;
};

export const FINISHES: readonly Finish[] = ["nonfoil", "foil", "etched"];

/** Common condition spellings -> short codes used across the app. */
const CONDITIONS: Record<string, string> = {
  m: "M",
  mint: "M",
  nm: "NM",
  "near mint": "NM",
  "near_mint": "NM",
  "nearmint": "NM",
  lp: "LP",
  "lightly played": "LP",
  "lightly_played": "LP",
  sp: "LP",
  "slightly played": "LP",
  ex: "LP",
  excellent: "LP",
  good: "MP",
  "good (lightly played)": "LP",
  mp: "MP",
  "moderately played": "MP",
  "moderately_played": "MP",
  pl: "MP",
  played: "MP",
  hp: "HP",
  "heavily played": "HP",
  "heavily_played": "HP",
  d: "DMG",
  dmg: "DMG",
  damaged: "DMG",
  poor: "DMG",
};

export function normCondition(raw: string | undefined | null): string {
  const c = raw?.trim().toLowerCase();
  if (!c) return "";
  return CONDITIONS[c] ?? CONDITIONS[c.replace(/\s+(foil|non-?foil)$/, "")] ?? raw!.trim();
}

const LANGS: Record<string, string> = {
  english: "en",
  spanish: "es",
  french: "fr",
  german: "de",
  italian: "it",
  portuguese: "pt",
  japanese: "ja",
  korean: "ko",
  russian: "ru",
  "simplified chinese": "zhs",
  "chinese simplified": "zhs",
  "traditional chinese": "zht",
  "chinese traditional": "zht",
  zh: "zhs",
  "zh-cn": "zhs",
  "zh-hans": "zhs",
  "zh-tw": "zht",
  "zh-hant": "zht",
  cs: "zhs",
  ct: "zht",
  jp: "ja",
  kr: "ko",
  sp: "es",
  hebrew: "he",
  latin: "la",
  "ancient greek": "grc",
  arabic: "ar",
  sanskrit: "sa",
  phyrexian: "ph",
};

/** Normalise a language to a Scryfall code ("English" -> "en", "JP" -> "ja"). Defaults to "en". */
export function normLang(raw: string | undefined | null): string {
  const l = raw?.trim().toLowerCase();
  if (!l) return "en";
  return LANGS[l] ?? l;
}

const TRUE_VALUES = new Set(["true", "yes", "y", "1", "x", "foil", "etched"]);
export function truthy(raw: string | undefined | null): boolean {
  return !!raw && TRUE_VALUES.has(raw.trim().toLowerCase());
}

/** Read a finish from any of the shapes exports use: "foil", "etched", "nonfoil", "Normal", "true"/"false". */
export function normFinish(raw: string | undefined | null): Finish {
  const f = raw?.trim().toLowerCase().replace(/[\s_-]/g, "");
  if (!f) return "nonfoil";
  if (f.includes("etched")) return "etched";
  if (f === "nonfoil" || f === "normal" || f === "regular" || f === "false" || f === "no" || f === "0") return "nonfoil";
  if (f.includes("foil") || f === "true" || f === "yes" || f === "1" || f === "x") return "foil";
  return "nonfoil";
}

export function parsePrice(raw: string | undefined | null): number | undefined {
  if (!raw) return undefined;
  const n = Number.parseFloat(raw.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

export function parseQuantity(raw: string | undefined | null): number {
  if (!raw) return 1;
  const n = Number.parseInt(raw.replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
