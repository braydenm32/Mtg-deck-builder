/**
 * Commander deck legality: deck size, singleton, colour identity, banned and not-legal cards,
 * commander eligibility, two-commander pairings, and companions.
 *
 * Banned status comes from Scryfall's `legalities.commander` (refreshed with every card sync), so
 * nothing here hard-codes the banned list. Rules: https://mtgcommander.net and Comprehensive Rules 903.
 */
import { identityWithin, colorString } from "@/lib/cards/normalize";
import { frontType, isBasicLand, isLand, manaSymbols } from "./text";
import type { DeckCardInput, DeckEntry } from "./types";

export type IssueCode =
  | "no-commander"
  | "too-many-commanders"
  | "not-a-commander"
  | "invalid-pair"
  | "deck-size"
  | "duplicate"
  | "color-identity"
  | "banned"
  | "not-legal"
  | "companion-invalid"
  | "companion-restriction"
  | "companion-unchecked";

export type Issue = {
  code: IssueCode;
  severity: "error" | "warning";
  message: string;
  /** Card names involved, for highlighting in the deck view. */
  cards: string[];
};

export type ValidationResult = {
  /** No errors (warnings are allowed). */
  legal: boolean;
  issues: Issue[];
  /** Commander(s) + main deck. Companion, maybeboard and sideboard don't count. */
  deckSize: number;
  /** The commanders' combined colour identity, WUBRG order. */
  colorIdentity: string;
  commanders: string[];
};

export const DECK_SIZE = 100;

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, twenty: 20,
};

/**
 * How many copies of this card a deck may hold: 1 normally, Infinity for basic lands and
 * "A deck can have any number of cards named ...", N for "A deck can have up to N cards named ...".
 */
export function copyLimit(card: Pick<DeckCardInput, "typeLine" | "cardFaces" | "oracleText">): number {
  if (isBasicLand(card)) return Infinity;
  const text = card.oracleText;
  if (/A deck can have any number of cards named/i.test(text)) return Infinity;
  const m = text.match(/A deck can have up to (\w+) cards named/i);
  if (m) return NUMBER_WORDS[m[1].toLowerCase()] ?? (Number.parseInt(m[1], 10) || 1);
  return 1;
}

type Pairing =
  | { kind: "partner" }
  | { kind: "partner-with"; name: string }
  | { kind: "partner-variant"; group: string }
  | { kind: "friends-forever" }
  | { kind: "chooses-background" }
  | { kind: "background" }
  | { kind: "doctors-companion" }
  | { kind: "doctor" }
  | { kind: "none" };

function rawText(card: DeckCardInput): string {
  return card.cardFaces?.length ? card.cardFaces.map((f) => f.oracleText ?? "").join("\n") : card.oracleText;
}

/** What lets this card share the command zone with another commander. */
export function pairing(card: DeckCardInput): Pairing {
  const text = rawText(card);
  const line = (re: RegExp) => text.split("\n").map((l) => l.trim()).map((l) => l.match(re)).find(Boolean);
  const pw = line(/^Partner with ([^(]+?)\s*(?:\(|$)/);
  if (pw) return { kind: "partner-with", name: pw[1].trim() };
  const variant = line(/^Partner\s*[—–-]\s*([^(]+?)\s*(?:\(|$)/);
  if (variant) return { kind: "partner-variant", group: variant[1].trim().toLowerCase() };
  if (line(/^Partner\s*(?:\(|$)/)) return { kind: "partner" };
  if (line(/^Friends forever\s*(?:\(|$)/i)) return { kind: "friends-forever" };
  if (line(/^Choose a Background\s*(?:\(|$)/i)) return { kind: "chooses-background" };
  if (line(/^Doctor's companion\s*(?:\(|$)/i)) return { kind: "doctors-companion" };
  const type = frontType(card);
  if (/\bLegendary\b/.test(type) && /\bBackground\b/.test(type)) return { kind: "background" };
  if (/\bLegendary\b/.test(type) && /\bCreature\b/.test(type) && /\bTime Lord Doctor\b|—.*\bDoctor\b/.test(type)) return { kind: "doctor" };
  return { kind: "none" };
}

/** Can these two be commanders together? Returns a reason when they can't. */
export function pairProblem(a: DeckCardInput, b: DeckCardInput): string | undefined {
  const pa = pairing(a);
  const pb = pairing(b);
  const ok = (x: Pairing, y: Pairing, xs: DeckCardInput, ys: DeckCardInput): boolean => {
    if (x.kind === "partner" && y.kind === "partner") return true;
    if (x.kind === "partner-with" && y.kind === "partner-with") return x.name === ys.name && y.name === xs.name;
    if (x.kind === "partner-variant" && y.kind === "partner-variant") return x.group === y.group;
    if (x.kind === "friends-forever" && y.kind === "friends-forever") return true;
    if (x.kind === "chooses-background" && y.kind === "background") return true;
    if (x.kind === "doctors-companion" && y.kind === "doctor") return true;
    return false;
  };
  if (ok(pa, pb, a, b) || ok(pb, pa, b, a)) return undefined;
  if (pa.kind === "partner-with" || pb.kind === "partner-with") {
    const pw = (pa.kind === "partner-with" ? pa : pb) as { name: string };
    return `${pa.kind === "partner-with" ? a.name : b.name} can only partner with ${pw.name}.`;
  }
  return `${a.name} and ${b.name} can't be commanders together: two commanders need Partner, Friends forever, a Background, or a Doctor and Doctor's companion.`;
}

/** Is this card allowed in the command zone (on its own or as the second half of a pair)? */
function canCommand(card: DeckCardInput, other?: DeckCardInput): boolean {
  if (card.canBeCommander) return true;
  // A Background is only a commander alongside a creature that says "Choose a Background".
  if (pairing(card).kind === "background") return !!other && pairing(other).kind === "chooses-background";
  return false;
}

type CompanionCheck = (main: DeckEntry[], commanders: DeckEntry[]) => string[] | "impossible" | undefined;

const isPermanent = (c: DeckCardInput) => /\b(?:Artifact|Creature|Enchantment|Land|Planeswalker|Battle)\b/.test(frontType(c));
const nonland = (c: DeckCardInput) => !isLand(c);

/**
 * Companion deck-building conditions. Each returns the names of cards that break it.
 * "Starting deck" includes the commanders (Commander rules count the command zone as part of the deck).
 */
const COMPANIONS: Record<string, CompanionCheck> = {
  "Lurrus of the Dream-Den": (deck) => deck.filter((e) => isPermanent(e.card) && e.card.cmc > 2).map((e) => e.card.name),
  "Keruga, the Macrosage": (deck) => deck.filter((e) => nonland(e.card) && e.card.cmc < 3).map((e) => e.card.name),
  "Gyruda, Doom of Depths": (deck) => deck.filter((e) => nonland(e.card) && e.card.cmc % 2 !== 0).map((e) => e.card.name),
  "Obosh, the Preypiercer": (deck) => deck.filter((e) => nonland(e.card) && e.card.cmc % 2 !== 1).map((e) => e.card.name),
  "Jegantha, the Wellspring": (deck) =>
    deck
      .filter((e) => {
        const counts = new Map<string, number>();
        for (const s of manaSymbols(e.card.manaCost)) if (!/^\d+$/.test(s)) counts.set(s, (counts.get(s) ?? 0) + 1);
        return [...counts.values()].some((n) => n > 1);
      })
      .map((e) => e.card.name),
  "Kaheera, the Orphanguard": (deck) =>
    deck
      .filter((e) => /\bCreature\b/.test(frontType(e.card)) && !/\b(?:Cat|Elemental|Nightmare|Dinosaur|Beast)\b/.test(frontType(e.card).split("—")[1] ?? ""))
      .map((e) => e.card.name),
  "Umori, the Collector": (deck) => {
    const types = ["Artifact", "Creature", "Enchantment", "Instant", "Sorcery", "Planeswalker", "Battle", "Kindred"];
    const spells = deck.filter((e) => nonland(e.card));
    const shared = types.filter((t) => spells.every((e) => new RegExp(`\\b${t}\\b`).test(frontType(e.card))));
    return shared.length ? [] : spells.map((e) => e.card.name);
  },
  // "At least twenty cards more than the minimum deck size": 120 cards, but Commander decks are exactly 100.
  "Yorion, Sky Nomad": () => "impossible",
};

/** Companions banned from the companion slot only (still playable in the deck). */
const COMPANION_BANNED = new Set(["Lutri, the Spellchaser"]);

export function validateDeck(entries: readonly DeckEntry[]): ValidationResult {
  const issues: Issue[] = [];
  const add = (code: IssueCode, message: string, cards: string[] = [], severity: Issue["severity"] = "error") =>
    issues.push({ code, severity, message, cards });

  const commanders = entries.filter((e) => e.board === "commander");
  const main = entries.filter((e) => (e.board ?? "main") === "main");
  const companions = entries.filter((e) => e.board === "companion");
  const deck = [...commanders, ...main];

  // Commanders.
  const commanderCards = commanders.flatMap((e) => Array.from({ length: Math.max(1, e.quantity) }, () => e.card));
  if (commanderCards.length === 0) add("no-commander", "Choose a commander.");
  if (commanderCards.length > 2) add("too-many-commanders", "A deck can have at most two commanders.", commanderCards.map((c) => c.name));
  if (commanderCards.length >= 1 && commanderCards.length <= 2) {
    const [a, b] = commanderCards;
    for (const [c, other] of [[a, b], [b, a]] as const) {
      if (c && !canCommand(c, other)) {
        add("not-a-commander", pairing(c).kind === "background"
          ? `${c.name} is a Background: it needs a commander with "Choose a Background".`
          : `${c.name} can't be a commander (it needs to be a legendary creature or say it can be your commander).`, [c.name]);
      }
    }
    if (a && b) {
      if (a.name === b.name) add("invalid-pair", `You can't have two copies of ${a.name} as commanders.`, [a.name]);
      else {
        const problem = pairProblem(a, b);
        if (problem) add("invalid-pair", problem, [a.name, b.name]);
      }
    }
  }
  const identity = colorString(commanderCards.flatMap((c) => c.colorIdentity.split("")));

  // Size.
  const deckSize = deck.reduce((n, e) => n + e.quantity, 0);
  if (deckSize !== DECK_SIZE) {
    const diff = deckSize - DECK_SIZE;
    add("deck-size", diff < 0
      ? `The deck has ${deckSize} card${deckSize === 1 ? "" : "s"}. It needs exactly ${DECK_SIZE}, including the commander${commanderCards.length > 1 ? "s" : ""}: add ${-diff}.`
      : `The deck has ${deckSize} card${deckSize === 1 ? "" : "s"}. It needs exactly ${DECK_SIZE}, including the commander${commanderCards.length > 1 ? "s" : ""}: cut ${diff}.`);
  }

  // Singleton.
  const byName = new Map<string, { card: DeckCardInput; quantity: number }>();
  for (const e of deck) {
    const cur = byName.get(e.card.name);
    byName.set(e.card.name, { card: e.card, quantity: (cur?.quantity ?? 0) + e.quantity });
  }
  for (const { card, quantity } of byName.values()) {
    const limit = copyLimit(card);
    if (quantity > limit) {
      add("duplicate", limit === 1
        ? `${card.name}: ${quantity} copies. Commander decks allow one copy of each card except basic lands.`
        : `${card.name}: ${quantity} copies. Its own text allows up to ${limit}.`, [card.name]);
    }
  }

  // Colour identity and legality.
  if (commanderCards.length > 0) {
    const outside = [...byName.values()].filter(({ card }) => !identityWithin(card.colorIdentity, identity)).map(({ card }) => card.name);
    if (outside.length) {
      add("color-identity", `${outside.length === 1 ? "1 card is" : `${outside.length} cards are`} outside your commander's colour identity (${identity || "colourless"}).`, outside);
    }
  }
  const banned = [...byName.values()].filter(({ card }) => card.legalCommander === "banned").map(({ card }) => card.name);
  if (banned.length) add("banned", `Banned in Commander: ${banned.join(", ")}.`, banned);
  const notLegal = [...byName.values()].filter(({ card }) => card.legalCommander === "not_legal").map(({ card }) => card.name);
  if (notLegal.length) add("not-legal", `Not legal in Commander (digital-only, Un-set or similar): ${notLegal.join(", ")}.`, notLegal);

  // Companion.
  if (companions.length > 1) add("companion-invalid", "Only one companion is allowed.", companions.map((e) => e.card.name));
  for (const e of companions.slice(0, 1)) {
    const c = e.card;
    if (!/^Companion\s*[—–-]/m.test(rawText(c))) {
      add("companion-invalid", `${c.name} isn't a companion.`, [c.name]);
      continue;
    }
    if (COMPANION_BANNED.has(c.name) || c.legalCommander === "banned") {
      add("companion-invalid", `${c.name} is banned as a companion in Commander.`, [c.name]);
      continue;
    }
    if (commanderCards.length && !identityWithin(c.colorIdentity, identity)) {
      add("companion-invalid", `${c.name} is outside your commander's colour identity.`, [c.name]);
    }
    const check = COMPANIONS[c.name];
    if (!check) {
      add("companion-unchecked", `I can't check ${c.name}'s deck-building condition yet; check it by hand.`, [c.name], "warning");
      continue;
    }
    const result = check(deck, commanders);
    if (result === "impossible") add("companion-restriction", `${c.name}'s condition can't be met in a 100-card Commander deck.`, [c.name]);
    else if (result && result.length) {
      const names = [...new Set(result)];
      add("companion-restriction", `${names.length} card${names.length === 1 ? " breaks" : "s break"} ${c.name}'s companion condition.`, names);
    }
  }

  return {
    legal: !issues.some((i) => i.severity === "error"),
    issues,
    deckSize,
    colorIdentity: identity,
    commanders: commanderCards.map((c) => c.name),
  };
}
