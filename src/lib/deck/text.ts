import type { DeckCardInput } from "./types";

/** Front-face type line: "Sorcery // Land" -> "Sorcery". */
export function frontType(card: Pick<DeckCardInput, "typeLine" | "cardFaces">): string {
  return card.cardFaces?.[0]?.typeLine ?? card.typeLine.split(" // ")[0] ?? "";
}

/** Every face's type line, for "is any face a land" questions. */
export function faceTypes(card: Pick<DeckCardInput, "typeLine" | "cardFaces">): string[] {
  if (card.cardFaces?.length) return card.cardFaces.map((f) => f.typeLine ?? "");
  return card.typeLine.split(" // ");
}

/** A land you play as a land: the front face is a land (Dryad Arbor, basics, utility lands). */
export function isLand(card: Pick<DeckCardInput, "typeLine" | "cardFaces">): boolean {
  return /\bLand\b/.test(frontType(card));
}

/**
 * A modal double-faced spell whose back is a land (Shatterskull Smashing, Agadeem's Awakening).
 * Most players count these as roughly half a land; stats report them separately.
 */
export function isMdfcLand(card: Pick<DeckCardInput, "typeLine" | "cardFaces" | "layout">): boolean {
  if (isLand(card)) return false;
  const types = faceTypes(card);
  return types.length > 1 && types.slice(1).some((t) => /\bLand\b/.test(t)) && (card.layout ?? "modal_dfc") === "modal_dfc";
}

export function isBasicLand(card: Pick<DeckCardInput, "typeLine" | "cardFaces">): boolean {
  return /\bBasic\b/.test(frontType(card)) && /\bLand\b/.test(frontType(card));
}

/** Names the oracle text may use for the card itself: full name, each face, and the short name before a comma. */
function selfNames(card: Pick<DeckCardInput, "name" | "cardFaces">): string[] {
  const names = new Set<string>([card.name]);
  for (const f of card.cardFaces ?? []) names.add(f.name);
  for (const n of [...names]) {
    const short = n.split(",")[0];
    if (short.length >= 4 && short !== n) names.add(short);
    // "Grist, the Hunger Tide" -> "Grist"; "Toothy, Imaginary Friend" -> "Toothy"
  }
  return [...names].sort((a, b) => b.length - a.length);
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Oracle text prepared for pattern matching: all faces joined, lowercased, reminder text removed,
 * and the card's own name replaced by "this card" so "Sacrifice Sakura-Tribe Elder:" and
 * "Sacrifice this creature:" read the same.
 */
export function rulesText(card: Pick<DeckCardInput, "name" | "oracleText" | "cardFaces">, opts: { keepReminder?: boolean } = {}): string {
  let text = card.cardFaces?.length
    ? card.cardFaces.map((f) => f.oracleText ?? "").join("\n")
    : card.oracleText;
  for (const n of selfNames(card)) text = text.replace(new RegExp(`\\b${escape(n)}\\b`, "g"), "this card");
  if (!opts.keepReminder) text = text.replace(/\([^()]*\)/g, "");
  return text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[ \t]+/g, " ")
    .trim();
}

/** Front-face oracle text only (an MDFC's land back shouldn't make the spell a ramp card). */
export function frontRulesText(card: Pick<DeckCardInput, "name" | "oracleText" | "cardFaces">): string {
  const front = card.cardFaces?.[0];
  if (!front) return rulesText(card);
  return rulesText({ name: card.name, oracleText: front.oracleText ?? "", cardFaces: [{ ...front }] });
}

/** Mana symbols in a cost: "{2}{W}{U/P}" -> ["2", "W", "U/P"]. */
export function manaSymbols(cost: string | null | undefined): string[] {
  if (!cost) return [];
  return [...cost.matchAll(/\{([^}]+)\}/g)].map((m) => m[1].toUpperCase());
}

/** Coloured pips in a cost, per colour. Hybrid {W/U} counts half to each; Phyrexian {B/P} counts as one B. */
export function pipCounts(cost: string | null | undefined): Record<"W" | "U" | "B" | "R" | "G", number> {
  const out = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  for (const sym of manaSymbols(cost)) {
    const parts = sym.split("/").filter((p) => "WUBRG".includes(p) && p.length === 1) as ("W" | "U" | "B" | "R" | "G")[];
    if (parts.length === 0) continue;
    const isTwoBrid = sym.split("/").some((p) => p === "2");
    if (isTwoBrid || parts.length === 1) {
      out[parts[0]] += 1;
    } else {
      for (const p of parts) out[p] += 1 / parts.length;
    }
  }
  return out;
}
