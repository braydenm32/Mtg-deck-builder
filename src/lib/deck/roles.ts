/**
 * What job a card does in a Commander deck, read from its oracle text.
 *
 * These are heuristics, tuned against Scryfall Tagger's function tags (otag:ramp, otag:removal, ...)
 * on the most-played Commander cards; see scripts/eval-roles.mts. They aim to answer the deck-building
 * question "how many ramp / draw / removal pieces does this list have?", so they lean towards what a
 * player would count: a one-shot "draw a card" stapled to a removal spell is a cantrip, not card draw,
 * and a land that taps for mana is a land, not ramp.
 *
 * An empty result means a plain threat, theme or utility card.
 */
import { frontRulesText, frontType, isLand, isMdfcLand, rulesText } from "./text";
import type { DeckCardInput } from "./types";

export type Role = "land" | "ramp" | "draw" | "removal" | "wipe" | "tutor" | "counter" | "protection" | "recursion";

export const ROLES: readonly Role[] = ["land", "ramp", "draw", "removal", "wipe", "tutor", "counter", "protection", "recursion"];

/** Labels for UI. Plural nouns, as a deck checklist reads them ("10 Ramp", "8 Removal"). */
export const ROLE_LABELS: Record<Role, string> = {
  land: "Lands",
  ramp: "Ramp",
  draw: "Card draw",
  removal: "Removal",
  wipe: "Board wipes",
  tutor: "Tutors",
  counter: "Counterspells",
  protection: "Protection",
  recursion: "Recursion",
};

type Card = Pick<DeckCardInput, "name" | "typeLine" | "oracleText" | "cardFaces" | "keywords" | "layout">;

const NUM = "(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|x|that many|\\d+)";
/** Things a land search can be looking for. A search for only these is ramp or fixing, not a tutor. */
const LAND_WORDS = /^(?:(?:up to )?(?:a|an|one|two|three|x|\d+) )?(?:(?:basic|snow|nonbasic|legendary|tapped|untapped) )*(?:land|plains|island|swamp|mountain|forest|gate|desert|cave|town|sphere)(?:(?:,| or|, or|\/| and) (?:basic )?(?:land|plains|island|swamp|mountain|forest|gate|desert|cave|town|sphere))*\s*$/;

/** Split rules text into sentences (and modal bullets), which is the scope most patterns need. */
function sentences(text: string): string[] {
  return text
    .split(/(?<=[.:])\s+|\n|•/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** The noun phrase after "target", up to the end of the clause: "nonland permanent you don't control". */
function targetPhrases(sentence: string, verb: RegExp): string[] {
  const out: string[] = [];
  const re = new RegExp(`${verb.source} (?:(?:up to )?(?:one|two|three|four|x|any number of|\\d+) )?(?:other |another )?targets? ([^.;]*)`, "g");
  for (const m of sentence.matchAll(re)) out.push(m[1]);
  return out;
}

/** Does a target phrase point at something an opponent would own (not your own stuff, not a graveyard card)? */
function hitsOpponentPermanent(phrase: string): boolean {
  const p = phrase.split(/,? then |\. |;/)[0];
  if (/\bcards?\b/.test(p)) return false; // "target creature card from a graveyard"
  if (/\b(player|opponent)'?s? (graveyard|library|hand)/.test(p)) return false;
  if (/^(?:spell|ability|activated|triggered|player|opponent)\b/.test(p)) return false;
  if (/\byou (?:own and )?(?:control|own)\b/.test(p) && !/\byou don't (?:control|own)\b/.test(p)) return false;
  if (/^(?:nonbasic |basic )?lands?\b/.test(p) && !/\bnonland\b/.test(p)) return false; // land destruction is its own thing
  if (/^tokens?\b/.test(p)) return true;
  return /\b(?:creature|permanent|artifact|enchantment|planeswalker|battle)s?\b|\b(?:attacking|blocking|tapped|nonland|noncreature)\b/.test(p);
}

function isRamp(card: Card, text: string, land: boolean): boolean {
  if (land) return false;
  // Mana abilities and rituals: "{T}: Add {G}", "Add {B}{B}{B}", "add one mana of any color", "Add X mana".
  if (/\badd (?:\{[^}]+\}|one mana|two mana|three mana|x mana|mana|an amount of|that much mana|\w+ mana of)/.test(text)) return true;
  // Land onto the battlefield from the library or hand.
  for (const s of sentences(text)) {
    if (/\bsearch (?:your library|your library and\/or graveyard) for\b/.test(s) && /\bonto the battlefield\b/.test(s)) {
      const m = s.match(/for ((?:up to )?[^.]*?) cards?\b/);
      if (m && (LAND_WORDS.test(m[1]) || /\bland\b/.test(m[1]))) return true;
    }
    if (/\bput (?:a|up to \w+|any number of|\w+) (?:basic )?land cards? from (?:your hand|among them|your graveyard|the top)[^.]*onto the battlefield/.test(s)) return true;
    if (/\bput (?:it|that card|them|those cards) onto the battlefield/.test(s) && /\bif it's a land card\b|\bif (?:it|that card) is a land card\b/.test(text)) return true;
  }
  if (/\bplay (?:an|two|any number of) additional lands?\b/.test(text)) return true;
  // Mana doublers and land auras: "its controller adds an additional {G}", "adds one mana of any type".
  if (/\badds? (?:an additional|one additional|one mana|two additional|\{)/.test(text)) return true;
  // Lands back from the graveyard (Splendid Reclamation, Aftermath Analyst).
  if (/\breturn all land cards from your graveyard to the battlefield\b/.test(text)) return true;
  // Treasure for you ("create" — "creates" is somebody else's Treasure).
  if (/\bcreate\b[^.]*\b(?:treasure|gold) tokens?\b/.test(text)) return true;
  return false;
}

/** Card advantage. Returns how strong the evidence is so cantrips can be told apart. */
function drawEvidence(fullText: string): { found: boolean; onlyCantrip: boolean } {
  const hits: string[] = [];
  // Drop trigger conditions about drawing ("Whenever an opponent draws a card, ...", "If an opponent would draw ...")
  // and draws that go to someone else ("Its controller may draw up to two cards").
  const text = fullText
    .replace(/\b(whenever|when|if|each time)\b[^,.]*?\bdraws?\b[^,.]*,/g, "$1 …,")
    .replace(/\b(?:its|that spell's|that creature's|that permanent's) controller (?:may )?draws? [^.]*\./g, "");
  for (const s of sentences(text)) {
    for (const m of s.matchAll(new RegExp(`\\bdraws? (?:up to )?(?:${NUM} )?(?:additional )?cards?\\b(?! equal to the number of cards in)`, "g"))) {
      const after = s.slice((m.index ?? 0) + m[0].length);
      // Loot: "Draw two cards, then discard two cards" filters, it doesn't add cards.
      const drawn = m[0].match(new RegExp(`draws? (?:up to )?(${NUM}) `))?.[1];
      const discard = after.match(new RegExp(`^,? then discard (${NUM}) cards?`))?.[1];
      if (discard && drawn && discard === drawn) continue;
      hits.push(s);
    }
    if (/\bdraws? cards? equal to\b|\bdraw that many cards\b/.test(s)) hits.push(s);
  }
  if (/\binvestigate\b|\bcreate\b[^.]*\bclue tokens?\b/.test(text)) hits.push("clue");
  // Impulse draw: "Exile the top two cards of your library. Until the end of your next turn, you may play those cards."
  if (/\bexile the top (?:card|\w+ cards) of (?:your|their) library\b[^]{0,160}?\byou may (?:play|cast) (?:it|them|that card|those cards|cards exiled|the exiled)/.test(text)) hits.push("impulse");
  // Necropotence: "Exile the top card of your library face down. Put that card into your hand ..."
  if (/\btop card of your library face down\.[^.]*put that card into your hand\b/.test(text)) hits.push("necro");
  if (hits.length === 0) return { found: false, onlyCantrip: false };
  const onlyCantrip =
    hits.length === 1 &&
    /\bdraw a card\b/.test(hits[0]) &&
    !/\b(whenever|at the beginning of (?:your|each)|for each)\b/.test(hits[0]) &&
    !/:/.test(hits[0]);
  return { found: true, onlyCantrip };
}

function isRemoval(card: Card, text: string): boolean {
  // Pacifism-style auras: "Enchanted creature loses all abilities and is a ...", "can't attack or block".
  if (/^enchant (?:creature|permanent|artifact|nonland permanent|creature or planeswalker)\b/.test(text) && /\benchanted (?:creature|permanent|artifact)\b[^.]*\b(?:loses all abilities|can't attack or block|can't attack, block|its activated abilities can't be activated|is a (?:colorless )?(?:\d\/\d|land|treasure|frog|ox|pig|food))/.test(text)) return true;
  // Flicker ("Exile another target permanent. Return that card to the battlefield ...") is not removal,
  // but an O-Ring's "When this leaves the battlefield, return the exiled card" is.
  const flicker = /(?<!leaves the battlefield, )\breturn (?:it|that card|that permanent|those cards|them|the exiled cards?) to the battlefield\b/.test(text);
  for (const s of sentences(text)) {
    for (const p of targetPhrases(s, /\bdestroy/)) if (hitsOpponentPermanent(p)) return true;
    if (!flicker) for (const p of targetPhrases(s, /\bexile/)) if (hitsOpponentPermanent(p)) return true;
    // Damage to creatures/planeswalkers or "any target" (not burn that only hits players).
    if (/\bdeals? (?:\d+|x|that much|damage equal to[^.]*?|twice x|\w+) damage (?:divided as you choose )?(?:to |among )(?:any target|(?:up to \w+ |one or two |any number of )?(?:other )?targets?\b(?! player| opponent)(?! (?:player|opponent) or planeswalker))/.test(s)) {
      if (!/\btarget (?:player|opponent) or planeswalker\b/.test(s) || /\bany target\b|\bcreature\b/.test(s)) return true;
    }
    if (/\bdeals? [^.]*damage to (?:any target|target (?:creature|planeswalker|attacking|blocking|permanent|nonland))/.test(s)) return true;
    if (/\bdeals? damage equal to [^.]* to (?:any target|target (?:creature|planeswalker|attacking|blocking|permanent))/.test(s)) return true;
    if (/\bput (?:a|two|three|x|\w+) -1\/-1 counters? on (?:up to one )?target creature(?! you control)/.test(s)) return true;
    // -N/-N on one creature.
    if (/\btarget creature(?! you control)[^.]*\bgets? -(?:\d+|x)\/-(?:\d+|x)/.test(s)) return true;
    // Edicts.
    if (/\b(?:target player|target opponent|each opponent|that player|each player|each other player) sacrifices (?:a|an|one|two|\w+) (?:\w+ )?(?:creature|nonland permanent|permanent|artifact|enchantment|planeswalker|attacking creature)\b(?!s)/.test(s)) return true;
    // Bounce one permanent.
    for (const p of targetPhrases(s, /\breturn/)) {
      if (/\bto (?:its|their) owner'?s'? hands?\b/.test(p) && hitsOpponentPermanent(p)) return true;
    }
    // Tuck: "shuffles it into their library", "put target ... on the bottom of its owner's library".
    if (/\btarget (?:nonland )?(?:permanent|creature|artifact|enchantment|planeswalker)\b(?! you control)[^.]*\b(?:shuffles? it into|on (?:the )?(?:top|bottom) of) (?:their|its owner's|its owners') library/.test(s)) return true;
    for (const p of targetPhrases(s, /\bput/)) {
      if (/\bon (?:the )?(?:top|bottom) of (?:its|their) owner'?s'? library/.test(p) && hitsOpponentPermanent(p)) return true;
    }
    // Fight.
    if (/\bfights? (?:up to one )?(?:another )?target creature(?! you control)/.test(s)) return true;
    if (/\btarget creature you control fights\b/.test(s)) return true;
    // Permanent steal.
    if (/\bgain control of target (?:creature|permanent|artifact|enchantment|planeswalker|nonland permanent)\b/.test(s) && !/\buntil end of turn\b/.test(s)) return true;
  }
  return false;
}

function isWipe(card: Card, text: string): boolean {
  // Overload turns "target" into "each" (Cyclonic Rift, Vandalblast).
  if ((card.keywords ?? []).some((k) => k.toLowerCase() === "overload") && isRemoval(card, text)) return true;
  for (const s of sentences(text)) {
    const m = s.match(/\b(?:destroy|exile) (?:all|each) ([^.;]*)/);
    if (m) {
      const what = m[1];
      if (!/\b(?:cards?|graveyards?)\b/.test(what.split(/ with | that | from /)[0]) && /\b(?:creatures?|permanents?|artifacts?|enchantments?|planeswalkers?|nonland|other)\b/.test(what) && !/^(?:creatures?|permanents?|artifacts?) you control\b/.test(what)) return true;
    }
    if (/\b(?:all|each) (?:other )?(?:creatures?|non-?\w+ creatures?)(?: your opponents control| you don't control)? gets? -(?:\d+|x)\/-(?:\d+|x)/.test(s)) return true;
    if (/\bcreatures (?:your opponents control|you don't control) get -(?:\d+|x)\/-(?:\d+|x)/.test(s)) return true;
    if (/\bdeals? (?:\d+|x|\w+ )?(?:damage(?: equal to [^.]*?)?) to each (?:other )?creature\b(?! you control)/.test(s)) return true;
    if (/\bdeals? (?:\d+|x|\w+) damage to each (?:other )?creature\b(?! you control)/.test(s)) return true;
    if (/\beach (?:other )?player sacrifices (?:two|three|four|five|six|seven|x|\d+|\w+teen) creatures\b/.test(s)) return true;
    if (/\breturn all (?:other )?(?:nonland |attacking |tapped |nontoken )*(?:permanents|creatures|artifacts|enchantments)\b[^.]*\bto (?:their|its) owners?'?s?'? hands?/.test(s)) return true;
    if (/\bsacrifices? all (?:other )?(?:creatures|permanents|nonland permanents)\b/.test(s)) return true;
  }
  return false;
}

function isTutor(card: Card, text: string): boolean {
  if ((card.keywords ?? []).some((k) => k.toLowerCase() === "transmute")) return true;
  for (const s of sentences(text)) {
    const m = s.match(/\bsearch (?:your library|your library and\/or graveyard|your graveyard, hand, and\/or library) for ((?:up to )?[^.]*?)(?: cards?\b|\.|$)/);
    if (!m) continue;
    const what = m[1];
    if (LAND_WORDS.test(what)) continue;
    if (/\bcards? named\b|^a card named\b/.test(what)) continue;
    return true;
  }
  // Demonic Consultation: "Choose a card name ... Put that card into your hand".
  if (/\bchoose a card name\b[^]*\bput that card into your hand\b/.test(text)) return true;
  return false;
}

function isCounter(text: string): boolean {
  return (
    /\bcounter (?:up to \w+ )?target\b/.test(text) ||
    /\bcounter (?:that|the chosen|each) spell\b/.test(text) ||
    /\bexile (?:any number of |up to \w+ )?target (?:[\w-]+ )*spells?\b/.test(text) ||
    /\breturn (?:up to \w+ )?target (?:[\w-]+ |, )*spells?\b[^.]* to (?:its|their) owner'?s'? hands?/.test(text) ||
    /\bput target (?:[\w-]+ )*spell [^.]*on (?:the )?(?:top|bottom|second from the top) of its owner's library/.test(text)
  );
}

function isProtection(text: string): boolean {
  const KW = "(?:hexproof|shroud|indestructible|protection from|ward|phase out)";
  if (new RegExp(`\\b(?:permanents|creatures|artifacts|other creatures|other permanents|commanders?|nonland permanents|creature tokens|legendary creatures|planeswalkers)(?: you control| your team controls)(?: and [\\w ]+ you control)?(?: with [^.]*?)? (?:gain|have|get|gains)\\b[^.]*\\b${KW}`).test(text)) return true;
  if (new RegExp(`\\btarget (?:[\\w-]+ )*(?:creature|permanent|artifact|enchantment|planeswalker)s? you control (?:gets? [^.]*? and )?gains?\\b[^.]*\\b${KW}`).test(text)) return true;
  if (new RegExp(`\\btarget (?:[\\w-]+ )*(?:creature|permanent)s? you control\\b[^.]*\\.\\s*(?:it|that creature|that permanent) gains?\\b[^.]*\\b${KW}`).test(text)) return true;
  if (new RegExp(`\\b(?:equipped|enchanted) (?:creature|permanent) (?:has|gets|gains)\\b[^.]*\\b${KW}`).test(text)) return true;
  if (/\b(?:all )?(?:permanents|creatures|other permanents|nonland permanents) you control phase out\b/.test(text)) return true;
  if (/\byou have (?:hexproof|shroud)\b/.test(text)) return true;
  if (/\bchoose new targets for target (?:spell|ability|spell or ability|instant or sorcery spell)\b/.test(text)) return true;
  return false;
}

function isRecursion(text: string): boolean {
  const SELF = /\breturn (?:this card|this creature|this artifact|this enchantment|this permanent)\b/;
  for (const s of sentences(text)) {
    if (/\breturn from your graveyard to\b/.test(s)) return true;
    if (/\breturn\b[^.]*\bcards?\b[^.]*\bfrom (?:your|a|any|an opponent's|target player's) graveyards? to (?:your hand|the battlefield)/.test(s) && !SELF.test(s)) return true;
    if (/\breturn (?:up to \w+ )?(?:another )?target [^.]*?cards? (?:from your graveyard |in your graveyard )?to (?:your hand|the battlefield)/.test(s) && /graveyard/.test(s)) return true;
    if (/\bput (?:up to \w+ )?target [^.]*?cards? from (?:a|your|an opponent's|any) graveyard onto the battlefield/.test(s)) return true;
    if (/\breturn enchanted creature card to the battlefield\b/.test(s)) return true;
    if (/\bcreature cards? from (?:their|your|all|each player's) graveyards?\b[^.]*\bonto the battlefield/.test(s)) return true;
    if (/\bcards? in your graveyard (?:has|have) (?:escape|flashback|retrace|jump-start|unearth)\b/.test(s)) return true;
    if (/\byou may (?:cast|play) [^.]*?(?:spells?|cards?|permanents?|lands?)\b[^.]* from your graveyard\b/.test(s) && !/\bthis card\b/.test(s.split("from your graveyard")[0])) return true;
  }
  // Meren / Victimize / Emry: a target card in your graveyard, then "return it" or "you may cast that card".
  if (/\btarget [^.]*?cards? in your graveyard\b[^]{0,200}?\b(?:return (?:it|them|the chosen cards|those cards)|you may cast (?:that card|it))\b/.test(text)) return true;
  if (/\breturn to your hand (?:up to \w+ )?target [^.]*?cards? in your graveyard\b/.test(text)) return true;
  // Graveyard to the top of the library (Academy Ruins, Mystic Sanctuary, Noxious Revival).
  if (/\bput (?:up to \w+ )?target [^.]*?cards? from (?:a|your) graveyard on top of (?:your|its owner's) library\b/.test(text)) return true;
  return false;
}

/** Roles a card fills, in ROLES order. Empty for theme/threat cards. */
export function cardRoles(card: DeckCardInput): Role[] {
  const land = isLand(card);
  // An MDFC's land face shouldn't make the spell "ramp"; judge those by the spell face. Split and
  // transforming cards use every face.
  const text = isMdfcLand(card) ? frontRulesText(card) : rulesText(card);
  const roles = new Set<Role>();
  if (land) roles.add("land");
  if (isRamp(card, text, land)) roles.add("ramp");
  if (isRemoval(card, text)) roles.add("removal");
  if (isWipe(card, text)) roles.add("wipe");
  if (isTutor(card, text)) roles.add("tutor");
  if (isCounter(text)) roles.add("counter");
  if (isProtection(text)) roles.add("protection");
  if (isRecursion(text)) roles.add("recursion");

  const draw = drawEvidence(text);
  if (draw.found) {
    const instantOrSorcery = /\b(?:Instant|Sorcery)\b/.test(frontType(card));
    const hasOtherJob = [...roles].some((r) => r !== "land");
    if (!(draw.onlyCantrip && instantOrSorcery && hasOtherJob)) roles.add("draw");
  }
  return ROLES.filter((r) => roles.has(r));
}

/** Count roles across a list (each copy counts). */
export function roleCounts(entries: readonly { card: DeckCardInput; quantity: number }[]): Record<Role, number> {
  const out = Object.fromEntries(ROLES.map((r) => [r, 0])) as Record<Role, number>;
  for (const e of entries) for (const r of cardRoles(e.card)) out[r] += e.quantity;
  return out;
}

/**
 * A typical role template for a 100-card Commander deck (lands include the commander's colours' needs).
 * These are the common community targets (the "8x8" / Command Zone template); a deck can and will deviate.
 */
export const ROLE_TARGETS: Partial<Record<Role, { min: number; target: number }>> = {
  land: { min: 33, target: 36 },
  ramp: { min: 8, target: 10 },
  draw: { min: 8, target: 10 },
  removal: { min: 6, target: 8 },
  wipe: { min: 2, target: 3 },
};
