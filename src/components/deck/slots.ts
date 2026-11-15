/**
 * Presentation helpers for the deck tabs in the new look. Nothing here defines a number: the slot
 * states, progress and cost come from getDeck() (src/lib/deck/store.ts) and the advice from
 * analyzeDeck(). These only group rows, add up their quantities the way the Missing tab always has,
 * and pick which existing action to put first.
 */
import type { DeckRow } from "@/app/decks/[id]/data";
import type { Advice } from "@/lib/deck/analyze";
import type { DeckStatus, SlotState } from "@/lib/deck/store";

export type OpenState = Exclude<SlotState, "placed">;

/** Open slots, owned first: a free copy, then shared, then in another deck, then to buy or proxy (R8). */
export const OPEN_ORDER: readonly OpenState[] = ["free", "shared", "other-deck", "not-owned", "no-data"];

/** Short labels for the open-slot reasons, as section headings and in the summary line. */
export const OPEN_LABEL: Record<OpenState, string> = {
  free: "Free in your collection",
  shared: "Shared with other decks",
  "other-deck": "In your other decks",
  "not-owned": "To buy or proxy",
  "no-data": "No card data",
};

/** The same reasons as a short count phrase ("6 shared"). */
export const OPEN_SHORT: Record<OpenState, string> = {
  free: "free to place",
  shared: "shared",
  "other-deck": "in other decks",
  "not-owned": "not owned",
  "no-data": "no card data",
};

type Row = Pick<DeckRow, "board" | "state" | "quantity" | "name">;

/** Copies in the main deck by slot state, summed by quantity (as the Missing tab's section counts are). */
export function slotCounts(rows: readonly Row[]): Record<SlotState, number> {
  const out: Record<SlotState, number> = { placed: 0, free: 0, shared: 0, "other-deck": 0, "not-owned": 0, "no-data": 0 };
  for (const c of rows) if (c.board === "main") out[c.state] += c.quantity;
  return out;
}

/** "Sol Ring, Arcane Signet, Swiftfoot Boots and 3 more" */
export function someNames(rows: readonly Pick<Row, "name">[], n = 3): string {
  const names = rows.map((r) => r.name);
  if (names.length <= n) return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : (names[0] ?? "");
  return `${names.slice(0, n).join(", ")} and ${names.length - n} more`;
}

export type StepAction = { label: string; href: string } | { label: string; run: "build" | "rebuild" };

export type NextStep = {
  title: string;
  detail?: string;
  action?: StepAction;
  /** "go": the screen's main (gradient) button. "quiet": a secondary button. "done": nothing left to do. */
  tone: "go" | "quiet" | "done";
};

/**
 * The one next step for a deck, from what getDeck() and analyzeDeck() already say. Filling the 100
 * comes first, owned cards first; then anything the To do list must fix; then playtest.
 */
export function nextStep(
  v: { deck: { id: number; status: DeckStatus }; cards: readonly Row[] },
  opts: { mustFix?: number } = {},
): NextStep {
  const base = `/decks/${v.deck.id}`;
  const main = v.cards.filter((c) => c.board === "main");
  const open = (s: OpenState) => main.filter((c) => c.state === s);
  if (!main.length) {
    return {
      title: "Fill the 99 from your cards",
      detail: "The builder picks from what you own first, and only suggests buying or proxying what's left.",
      action: { label: "Build the deck", run: "rebuild" },
      tone: "go",
    };
  }
  if (v.deck.status === "idea") {
    return {
      title: "Start building",
      detail: "An idea holds none of your copies. Building places the ones you have free.",
      action: { label: "Start building", run: "build" },
      tone: "go",
    };
  }
  if (v.deck.status === "retired") {
    return {
      title: "Retired",
      detail: "The list is kept, and its copies are free for your other decks.",
      action: { label: "Build it again", run: "build" },
      tone: "quiet",
    };
  }
  const free = open("free");
  if (free.length) return { title: "Place your free copies", detail: `${someNames(free)}.`, action: { label: "See them", href: `${base}/missing` }, tone: "go" };
  const shared = open("shared");
  if (shared.length) {
    return {
      title: "Decide where shared cards go",
      detail: `${someNames(shared)}: other decks want ${shared.length === 1 ? "it" : "them"} too.`,
      action: { label: "Decide", href: "/decks/shared" },
      tone: "go",
    };
  }
  const elsewhere = open("other-deck");
  if (elsewhere.length) {
    return {
      title: "Free up cards from your other decks",
      detail: `Every copy of ${someNames(elsewhere)} is in another deck.`,
      action: { label: "See them", href: `${base}/missing` },
      tone: "go",
    };
  }
  if (open("not-owned").length) {
    return {
      title: "Get the cards you don't own",
      detail: "Buy or proxy them, or swap in cards you own.",
      action: { label: "See the list", href: `${base}/missing` },
      tone: "go",
    };
  }
  if (open("no-data").length) return { title: "Check the cards with no card data", action: { label: "See them", href: `${base}/missing` }, tone: "go" };
  if (opts.mustFix) return { title: "Fix what the To do list flags", action: { label: "See To do", href: "#todo" }, tone: "go" };
  return {
    title: "Every card is in your hands",
    detail: v.deck.status === "built" ? undefined : "Set it to Built once it's sleeved up.",
    action: { label: "Playtest", href: `${base}/playtest` },
    tone: "done",
  };
}

/** A To do item's one-tap action: the tab or section where you'd fix it. */
export function adviceAction(kind: Advice["kind"], deckId: number): { label: string; href: string } {
  const base = `/decks/${deckId}`;
  switch (kind) {
    case "legality":
      return { label: "Cards", href: `${base}/cards` };
    case "bracket":
      return { label: "Why", href: "#bracket" };
    case "lands":
    case "colors":
      return { label: "Lands", href: `${base}/cards?group=type` };
    case "roles":
      return { label: "Upgrades", href: `${base}/suggestions` };
    case "curve":
      return { label: "Curve", href: "#curve" };
  }
}

/**
 * Scryfall's art crop for a card image URL (…/normal/front/x/y/id.jpg → …/art_crop/front/x/y/id.jpg).
 * Falls back to the image itself when the URL isn't a Scryfall card image.
 */
export function artCrop(url: string | null | undefined): string | null {
  if (!url) return null;
  return /^https:\/\/cards\.scryfall\.io\/(?:small|normal|large)\/.+\.jpg/.test(url) ? url.replace(/\/(?:small|normal|large)\//, "/art_crop/") : url;
}

/** The deck's colour identity, or its commanders' when the deck row has none saved (older example data). */
export function deckIdentity(deckIdentity: string, commanders: readonly { colorIdentity: string }[]): string {
  if (deckIdentity) return deckIdentity;
  const all = new Set(commanders.flatMap((c) => [...c.colorIdentity]));
  return [..."WUBRG"].filter((c) => all.has(c)).join("");
}
