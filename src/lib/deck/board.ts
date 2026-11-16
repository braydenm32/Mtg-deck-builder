import { rng, shuffle } from "./goldfish";

/**
 * The playtest board: play a deck out by hand, alone, on a phone. Zones (library, hand,
 * battlefield, graveyard, exile, command zone), turns, tapping, counters, tokens, life and the
 * commander tax. Pure, so it's tested here and the page only draws it (components/deck/PlayBoard).
 */

export type Zone = "library" | "hand" | "battlefield" | "graveyard" | "exile" | "command";
export const ZONES: Zone[] = ["library", "hand", "battlefield", "graveyard", "exile", "command"];

export type BoardCard = {
  /** Unique on this board (two copies of a basic land are two cards). */
  uid: string;
  name: string;
  image: string | null;
  land: boolean;
  commander?: boolean;
  token?: boolean;
  tapped?: boolean;
  /** +1/+1 counters, or any counter you count (negative for −1/−1). */
  counters?: number;
};

export type BoardDeckCard = { name: string; image: string | null; land: boolean; quantity: number };

export type Board = {
  /** Which deck and list it was dealt from, so a changed deck starts a new board. */
  key: string;
  turn: number;
  life: number;
  mulligans: number;
  /** Times each commander has gone from the command zone to the battlefield (the tax is 2 each). */
  cast: Record<string, number>;
  zones: Record<Zone, BoardCard[]>;
  /** Shuffles so far: each one draws its randomness from the deal's seed and this count. */
  shuffles: number;
  seed: number;
  /** Tokens made so far (for their ids). */
  made: number;
  /** The last few things that happened, newest first. */
  log: string[];
};

export const START_LIFE = 40;
const LOG_MAX = 8;

const empty = (): Record<Zone, BoardCard[]> => ({ library: [], hand: [], battlefield: [], graveyard: [], exile: [], command: [] });

/** A list's key: the cards and how many, so any change to the deck deals afresh. */
export function deckKey(deckId: number, cards: readonly BoardDeckCard[], commanders: readonly { name: string }[]): string {
  const sig = [...commanders.map((c) => `C:${c.name}`), ...cards.map((c) => `${c.quantity}:${c.name}`)].sort().join("|");
  let h = 0;
  for (let i = 0; i < sig.length; i++) h = (Math.imul(h, 31) + sig.charCodeAt(i)) | 0;
  return `${deckId}:${(h >>> 0).toString(36)}`;
}

function shuffled(cards: BoardCard[], seed: number, n: number): BoardCard[] {
  return shuffle(cards, rng((seed * 7919 + n * 104729) >>> 0 || 1));
}

/** Deal a new game: commanders in the command zone, the rest shuffled, seven in hand. */
export function deal(key: string, cards: readonly BoardDeckCard[], commanders: readonly { name: string; image: string | null }[], seed: number): Board {
  const library: BoardCard[] = [];
  let n = 0;
  for (const c of cards) for (let i = 0; i < c.quantity; i++) library.push({ uid: `c${n++}`, name: c.name, image: c.image, land: c.land });
  const zones = empty();
  zones.command = commanders.map((c, i) => ({ uid: `k${i}`, name: c.name, image: c.image, land: false, commander: true }));
  zones.library = shuffled(library, seed, 0);
  zones.hand = zones.library.splice(0, 7);
  return { key, turn: 1, life: START_LIFE, mulligans: 0, cast: {}, zones, shuffles: 1, seed, made: 0, log: [] };
}

export type BoardAction =
  | { type: "draw"; count?: number }
  | { type: "next-turn" }
  | { type: "mulligan" }
  | { type: "shuffle" }
  | { type: "move"; uid: string; to: Zone; bottom?: boolean }
  | { type: "tap"; uid: string }
  | { type: "untap-all" }
  | { type: "counter"; uid: string; by: number }
  | { type: "token"; name: string; image: string | null }
  | { type: "copy"; uid: string }
  | { type: "life"; by: number }
  | { type: "note"; text: string };

const note = (b: Board, text: string): Board => ({ ...b, log: [text, ...b.log].slice(0, LOG_MAX) });

export function findCard(b: Board, uid: string): { zone: Zone; card: BoardCard; index: number } | undefined {
  for (const zone of ZONES) {
    const index = b.zones[zone].findIndex((c) => c.uid === uid);
    if (index >= 0) return { zone, card: b.zones[zone][index], index };
  }
  return undefined;
}

const ZONE_WORD: Record<Zone, string> = { library: "the library", hand: "your hand", battlefield: "the battlefield", graveyard: "the graveyard", exile: "exile", command: "the command zone" };

/** The commander tax for a commander (2 for each time it's been cast from the command zone). */
export const commanderTax = (b: Board, name: string) => 2 * (b.cast[name] ?? 0);

export function boardReducer(b: Board, a: BoardAction): Board {
  switch (a.type) {
    case "draw": {
      const count = Math.max(1, a.count ?? 1);
      const drawn = b.zones.library.slice(0, count);
      if (!drawn.length) return note(b, "The library is empty.");
      return note({ ...b, zones: { ...b.zones, library: b.zones.library.slice(drawn.length), hand: [...b.zones.hand, ...drawn] } }, drawn.length === 1 ? "Drew a card." : `Drew ${drawn.length} cards.`);
    }
    case "next-turn": {
      const untapped = b.zones.battlefield.map((c) => (c.tapped ? { ...c, tapped: false } : c));
      const next = { ...b, turn: b.turn + 1, zones: { ...b.zones, battlefield: untapped } };
      const drawn = boardReducer(next, { type: "draw" });
      return { ...drawn, log: [`Turn ${next.turn}: untapped and drew.`, ...b.log].slice(0, LOG_MAX) };
    }
    case "mulligan": {
      // Commander's first mulligan is free (CR 103.5c); then the London mulligan: put that many on the bottom.
      const library = shuffled([...b.zones.library, ...b.zones.hand], b.seed, b.shuffles);
      const mulligans = b.mulligans + 1;
      const bottom = mulligans - 1;
      const msg = bottom > 0 ? `Mulligan ${mulligans}: put ${bottom} ${bottom === 1 ? "card" : "cards"} from your hand on the bottom.` : "Mulligan: the first one is free.";
      return note({ ...b, mulligans, shuffles: b.shuffles + 1, zones: { ...b.zones, hand: library.slice(0, 7), library: library.slice(7) } }, msg);
    }
    case "shuffle":
      return note({ ...b, shuffles: b.shuffles + 1, zones: { ...b.zones, library: shuffled(b.zones.library, b.seed, b.shuffles) } }, "Shuffled the library.");
    case "move": {
      const found = findCard(b, a.uid);
      if (!found || (found.zone === a.to && a.to !== "library")) return b;
      const zones = { ...b.zones, [found.zone]: b.zones[found.zone].filter((c) => c.uid !== a.uid) };
      // A token that leaves the battlefield is gone; a commander can always go back to the command zone.
      if (found.card.token && a.to !== "battlefield") return note({ ...b, zones }, `${found.card.name} left the battlefield.`);
      const card: BoardCard = { ...found.card, tapped: false, counters: a.to === "battlefield" ? found.card.counters : undefined };
      zones[a.to] = a.to === "library" && !a.bottom ? [card, ...zones[a.to]] : [...zones[a.to], card];
      let cast = b.cast;
      if (found.zone === "command" && a.to === "battlefield") cast = { ...cast, [card.name]: (cast[card.name] ?? 0) + 1 };
      const where = a.to === "library" ? (a.bottom ? "the bottom of the library" : "the top of the library") : ZONE_WORD[a.to];
      return note({ ...b, cast, zones }, `${card.name} to ${where}.`);
    }
    case "tap":
      return { ...b, zones: { ...b.zones, battlefield: b.zones.battlefield.map((c) => (c.uid === a.uid ? { ...c, tapped: !c.tapped } : c)) } };
    case "untap-all":
      return note({ ...b, zones: { ...b.zones, battlefield: b.zones.battlefield.map((c) => (c.tapped ? { ...c, tapped: false } : c)) } }, "Untapped everything.");
    case "counter":
      return {
        ...b,
        zones: { ...b.zones, battlefield: b.zones.battlefield.map((c) => (c.uid === a.uid ? { ...c, counters: (c.counters ?? 0) + a.by || undefined } : c)) },
      };
    case "token": {
      const uid = `t${b.made}`;
      return note({ ...b, made: b.made + 1, zones: { ...b.zones, battlefield: [...b.zones.battlefield, { uid, name: a.name, image: a.image, land: false, token: true }] } }, `Made a ${a.name} token.`);
    }
    case "copy": {
      const found = findCard(b, a.uid);
      if (!found || found.zone !== "battlefield") return b;
      return boardReducer(b, { type: "token", name: found.card.name, image: found.card.image });
    }
    case "life":
      return { ...b, life: b.life + a.by };
    case "note":
      return note(b, a.text);
  }
}
