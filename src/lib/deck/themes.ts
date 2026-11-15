/**
 * Deck themes. Slugs match EDHREC's theme slugs so the same theme can pull EDHREC data,
 * and each theme also has rules-text patterns so it works without EDHREC (or for cards
 * EDHREC doesn't list).
 */
export type ThemeCard = { name: string; typeLine: string; oracleText: string; keywords?: string[] };

type ThemeDef = {
  slug: string;
  label: string;
  /** Strong signals (a payoff or enabler of the theme). */
  strong: RegExp[];
  /** Weaker signals (fits the theme). */
  weak?: RegExp[];
  /** Type line signals. */
  types?: RegExp[];
};

const T = (s: string) => new RegExp(s, "i");

export const THEMES: ThemeDef[] = [
  {
    slug: "aristocrats",
    label: "Aristocrats",
    strong: [T("whenever [^.]*\\bcreatures? [^.]*\\bdies?\\b"), T("sacrifice (?:a|another) creature:"), T("each opponent loses \\d+ life")],
    weak: [T("sacrifice (?:a|another|two) creatures?"), T("create .* tokens?"), T("when .* dies")],
  },
  {
    slug: "sacrifice",
    label: "Sacrifice",
    strong: [T("sacrifice (?:a|another) (?:creature|permanent|artifact)[^.]*:"), T("whenever you sacrifice")],
    weak: [T("sacrifice (?:a|another|two)"), T("dies")],
  },
  {
    slug: "tokens",
    label: "Tokens",
    strong: [T("create (?:a|two|three|x|that many|\\w+) .*tokens?"), T("whenever (?:a|one or more) .*tokens? (?:enters|you control)"), T("populate")],
    weak: [T("creatures you control get \\+\\d/\\+\\d"), T("for each creature you control")],
  },
  {
    slug: "treasure",
    label: "Treasure",
    strong: [T("treasure")],
    weak: [T("sacrifice an artifact"), T("whenever you sacrifice")],
  },
  {
    slug: "plus-1-plus-1-counters",
    label: "+1/+1 Counters",
    strong: [T("\\+1/\\+1 counters? on"), T("proliferate")],
    weak: [T("counters?"), T("modular|graft|evolve|adapt|outlast|bolster|mentor")],
  },
  {
    slug: "artifacts",
    label: "Artifacts",
    strong: [T("whenever (?:an|another|one or more) artifacts?"), T("for each artifact you control"), T("artifact spells? (?:you cast )?cost"), T("affinity for artifacts|improvise|metalcraft")],
    weak: [T("artifact")],
    types: [T("\\bArtifact\\b")],
  },
  {
    slug: "enchantress",
    label: "Enchantress",
    strong: [T("whenever you cast an enchantment"), T("whenever (?:an|another) enchantment"), T("for each enchantment you control"), T("constellation")],
    weak: [T("enchantment")],
    types: [T("\\bEnchantment\\b")],
  },
  {
    slug: "spellslinger",
    label: "Spellslinger",
    strong: [T("whenever you cast (?:an|a) (?:instant|sorcery|instant or sorcery|noncreature)"), T("magecraft|prowess"), T("copy target (?:instant|sorcery)")],
    weak: [T("instant or sorcery")],
    types: [T("\\b(?:Instant|Sorcery)\\b")],
  },
  {
    slug: "lifegain",
    label: "Lifegain",
    strong: [T("whenever you gain life"), T("lifelink"), T("you gain \\d+ life")],
    weak: [T("gain life|life total")],
  },
  {
    slug: "reanimator",
    label: "Reanimator",
    strong: [T("return target creature card from (?:your|a) graveyard to the battlefield"), T("put target creature card from a graveyard onto the battlefield"), T("from your graveyard to the battlefield")],
    weak: [T("mill|discard|graveyard")],
  },
  {
    slug: "graveyard",
    label: "Graveyard",
    strong: [T("from your graveyard"), T("flashback|unearth|escape|dredge|delve|embalm|eternalize|disturb")],
    weak: [T("mill|graveyard")],
  },
  {
    slug: "landfall",
    label: "Landfall",
    strong: [T("landfall"), T("whenever a land enters the battlefield under your control"), T("play an additional land")],
    weak: [T("search your library for (?:a|up to \\w+) (?:basic )?lands? cards?"), T("put (?:a|that) land card")],
  },
  {
    slug: "lands-matter",
    label: "Lands Matter",
    strong: [T("landfall"), T("play an additional land"), T("lands? cards? from your graveyard"), T("you may play lands from")],
    weak: [T("land")],
  },
  {
    slug: "voltron",
    label: "Voltron",
    strong: [T("equipped creature"), T("enchanted creature gets"), T("equip \\{"), T("double strike")],
    weak: [T("hexproof|indestructible|protection from|aura|equipment")],
    types: [T("\\b(?:Equipment|Aura)\\b")],
  },
  {
    slug: "blink",
    label: "Blink",
    strong: [T("exile (?:another )?target (?:creature|permanent|nonland permanent) you control.*return (?:it|that card) to the battlefield"), T("exile .* then return (?:it|them|that card) to the battlefield")],
    weak: [T("when .* enters the battlefield|when .* enters,")],
  },
  {
    slug: "mill",
    label: "Mill",
    strong: [T("target (?:player|opponent) mills"), T("each opponent mills"), T("mills? (?:\\d+|x|that many) cards")],
    weak: [T("mill")],
  },
  {
    slug: "wheels",
    label: "Wheels",
    strong: [T("each player discards (?:their|his or her) hand.*draws?"), T("whenever an opponent draws a card")],
    weak: [T("draws? (?:seven|that many) cards")],
  },
  {
    slug: "burn",
    label: "Burn",
    strong: [T("deals? \\d+ damage to each opponent"), T("whenever .* deals noncombat damage"), T("damage to any target")],
    weak: [T("deals? (?:\\d+|x) damage")],
  },
  {
    slug: "card-draw",
    label: "Card Draw",
    strong: [T("whenever you draw (?:a|your second) card"), T("draw (?:two|three|x|\\d+) cards")],
    weak: [T("draw a card")],
  },
  {
    slug: "ramp",
    label: "Ramp",
    strong: [T("search your library for (?:a|up to \\w+) (?:basic )?lands?"), T("add \\{[wubrgc]\\}\\{[wubrgc]\\}"), T("add (?:two|three|x) mana")],
    weak: [T("add \\{"), T("treasure")],
  },
  {
    slug: "control",
    label: "Control",
    strong: [T("counter target spell"), T("destroy all|exile all"), T("return all nonland permanents")],
    weak: [T("counter target|destroy target|exile target")],
  },
  {
    slug: "stax",
    label: "Stax",
    strong: [T("(?:players|opponents) can't"), T("spells? (?:your opponents cast )?cost \\{\\d\\} more"), T("don't untap during")],
    weak: [T("can't")],
  },
  {
    slug: "group-hug",
    label: "Group Hug",
    strong: [T("each player draws"), T("each player may put a land")],
    weak: [T("each player")],
  },
  {
    slug: "extra-combats",
    label: "Extra Combats",
    strong: [T("additional combat phase")],
    weak: [T("untap all creatures")],
  },
  {
    slug: "big-mana",
    label: "Big Mana",
    strong: [T("double the amount of mana|adds? (?:an )?additional"), T("add \\{[wubrgc]\\} for each")],
    weak: [T("add \\{")],
  },
];

/** Creature-type ("typal") themes: EDHREC slugs are plurals like "dragons", "elves", "zombies". */
const TYPE_PLURALS: Record<string, string> = {
  elves: "Elf",
  dwarves: "Dwarf",
  wolves: "Wolf",
  werewolves: "Werewolf",
  fungi: "Fungus",
  "fungus": "Fungus",
  allies: "Ally",
  faeries: "Faerie",
  sphinxes: "Sphinx",
  foxes: "Fox",
  octopi: "Octopus",
  mice: "Mouse",
};

export function typalType(slug: string): string | undefined {
  if (THEMES.some((t) => t.slug === slug)) return undefined;
  if (TYPE_PLURALS[slug]) return TYPE_PLURALS[slug];
  if (/^[a-z]+s$/.test(slug)) {
    const singular = slug.endsWith("ies") ? `${slug.slice(0, -3)}y` : slug.slice(0, -1);
    return singular[0].toUpperCase() + singular.slice(1);
  }
  return undefined;
}

export function themeLabel(slug: string | null | undefined): string {
  if (!slug) return "General";
  const t = THEMES.find((x) => x.slug === slug);
  if (t) return t.label;
  return slug
    .split("-")
    .map((w) => (w === "plus" ? "+" : w[0]?.toUpperCase() + w.slice(1)))
    .join(" ")
    .replace(/\+ 1 \+ 1/, "+1/+1");
}

/**
 * How well a card fits a theme from its rules text: 1 = a strong enabler/payoff,
 * 0.4 = fits, 0 = unrelated. Typal themes check the creature type and type-name mentions.
 */
export function themeScore(card: ThemeCard, slug: string | null | undefined): number {
  if (!slug) return 0;
  const text = `${card.oracleText}\n${(card.keywords ?? []).join(" ")}`;
  const typal = typalType(slug);
  if (typal) {
    const re = new RegExp(`\\b${typal}s?\\b`, "i");
    if (re.test(card.typeLine)) return 1;
    if (re.test(text)) return 0.8;
    if (/changeling/i.test(text)) return 0.7;
    return 0;
  }
  const def = THEMES.find((t) => t.slug === slug);
  if (!def) return 0;
  if (def.strong.some((r) => r.test(text))) return 1;
  if (def.types?.some((r) => r.test(card.typeLine))) return 0.5;
  if (def.weak?.some((r) => r.test(text))) return 0.4;
  return 0;
}
