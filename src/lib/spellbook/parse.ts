/**
 * Commander Spellbook responses → the app's `Combo` type. Pure, so it's tested against a saved
 * response (tests/fixtures/spellbook-find-my-combos.json).
 *
 * Spellbook calls one combo a "variant". Each one lists the cards it uses, any non-card "templates"
 * ("Sacrifice outlet", "Extra Turn Spell"), and the "features" it produces. A feature's status says
 * how much it matters: "S" (standalone, e.g. "Win the game", "Infinite damage") is a real payoff;
 * "H" and "C" are helpers and contextual effects. The app treats a combo as relevant when it
 * produces at least one standalone feature, as Spellbook's own bracket estimator does.
 *
 * Bracket tags: R Ruthless, S Spicy, P Powerful, O Oddball, C Core, E Exhibition, B Banned.
 */
import type { Combo, SpellbookBracketTag } from "@/lib/deck/combos";

export type SpellbookVariant = {
  id: string;
  uses: { card: { name: string; oracleId?: string | null; typeLine?: string }; quantity?: number; mustBeCommander?: boolean }[];
  requires?: { template: { name: string; scryfallQuery?: string | null }; quantity?: number }[];
  produces?: { feature: { name: string; status?: string }; quantity?: number }[];
  bracketTag?: string;
  popularity?: number | null;
  manaNeeded?: string;
  manaValueNeeded?: number;
  easyPrerequisites?: string;
  notablePrerequisites?: string;
  description?: string;
};

export type FindMyCombosResults = {
  identity?: string;
  included?: SpellbookVariant[];
  almostIncluded?: SpellbookVariant[];
  [list: string]: unknown;
};

export type FindMyCombosPage = { next?: string | null; results?: FindMyCombosResults };

export type SpellbookCombos = {
  /** Deck colour identity as Spellbook saw it, e.g. "UBR". */
  identity: string;
  /** Combos with every piece in the deck. */
  included: Combo[];
  /** Combos one card short, inside the deck's colour identity. */
  almostIncluded: Combo[];
};

const TAGS = new Set(["R", "S", "P", "O", "C", "E", "B"]);
const MAX_RESULT_FEATURES = 3;

/** One Spellbook variant as a Combo. */
export function variantToCombo(v: SpellbookVariant): Combo {
  const produces = v.produces ?? [];
  const standalone = produces.filter((p) => p.feature.status === "S").map((p) => p.feature.name);
  const shown = (standalone.length ? standalone : produces.map((p) => p.feature.name)).slice(0, MAX_RESULT_FEATURES);
  const templates = (v.requires ?? []).map((r) => r.template.name);
  const note = [v.notablePrerequisites, v.easyPrerequisites]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join(" ");
  return {
    cards: v.uses.map((u) => u.card.name),
    result: shown.join(", ") || "Combo",
    ...(note ? { note } : {}),
    ...(templates.length ? { templates } : {}),
    relevant: standalone.length > 0,
    id: v.id,
    url: `https://commanderspellbook.com/combo/${encodeURIComponent(v.id)}/`,
    ...(v.bracketTag && TAGS.has(v.bracketTag) ? { bracketTag: v.bracketTag as SpellbookBracketTag } : {}),
    ...(v.popularity != null ? { popularity: v.popularity } : {}),
    ...(v.manaNeeded ? { manaNeeded: v.manaNeeded } : {}),
    ...(typeof v.manaValueNeeded === "number" && v.manaValueNeeded > 0 ? { manaValueNeeded: v.manaValueNeeded } : {}),
  };
}

/** Merge the pages of a find-my-combos answer into included and almost-included combos. */
export function parseFindMyCombos(pages: readonly FindMyCombosPage[]): SpellbookCombos {
  const seen = new Set<string>();
  const out: SpellbookCombos = { identity: "", included: [], almostIncluded: [] };
  for (const page of pages) {
    const r = page.results;
    if (!r) continue;
    if (r.identity) out.identity = r.identity;
    for (const [list, into] of [
      [r.included, out.included],
      [r.almostIncluded, out.almostIncluded],
    ] as const) {
      for (const v of list ?? []) {
        if (!v?.id || !Array.isArray(v.uses) || seen.has(v.id)) continue;
        seen.add(v.id);
        into.push(variantToCombo(v));
      }
    }
  }
  return out;
}

/**
 * Spellbook names double-faced cards in full ("Fable of the Mirror-Breaker // Reflection of Kiki-Jiki"),
 * like Scryfall, but a deck may hold a front-face-only name. Rename combo pieces to the deck's spelling.
 */
export function renameToDeck(combos: readonly Combo[], deckNames: Iterable<string>): Combo[] {
  const byKey = new Map<string, string>();
  for (const n of deckNames) {
    byKey.set(n.toLowerCase(), n);
    byKey.set(n.split(" // ")[0].toLowerCase(), n);
  }
  const fix = (n: string) => byKey.get(n.toLowerCase()) ?? byKey.get(n.split(" // ")[0].toLowerCase()) ?? n;
  return combos.map((c) => ({ ...c, cards: c.cards.map(fix) }));
}
