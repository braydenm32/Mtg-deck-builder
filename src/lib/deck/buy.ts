/**
 * Where to buy a deck's missing cards. TCGplayer takes the list in its Mass Entry link; the other
 * stores have a page you paste the list into, so the sheet copies it first. Client-safe.
 */
export type BuyLine = { name: string; quantity: number };

export type Store = { id: string; name: string; where: "US" | "AU"; url: (lines: BuyLine[]) => string; prefilled: boolean; help: string };

/** "1 Sol Ring" per line, front face only (stores search by the card's main name). */
export function buyListText(lines: BuyLine[]): string {
  return lines.map((l) => `${l.quantity} ${l.name.split(" // ")[0]}`).join("\n");
}

export const STORES: Store[] = [
  {
    id: "tcgplayer",
    name: "TCGplayer",
    where: "US",
    prefilled: true,
    help: "Opens Mass Entry with the list filled in.",
    url: (lines) => `https://www.tcgplayer.com/massentry?productline=Magic&c=${encodeURIComponent(buyListText(lines).split("\n").join("||"))}`,
  },
  { id: "cardkingdom", name: "Card Kingdom", where: "US", prefilled: false, help: "Paste the list into the Deck Builder.", url: () => "https://www.cardkingdom.com/builder" },
  { id: "gamesportal", name: "Games Portal", where: "AU", prefilled: false, help: "Paste the list into Multi-Card Search.", url: () => "https://gamesportal.com.au/pages/multi-card-search" },
];

/** Stores in the order that suits the price currency: Australian stores first for AUD. */
export function storesFor(currency: string): Store[] {
  const au = currency === "AUD";
  return [...STORES].sort((a, b) => Number(b.where === (au ? "AU" : "US")) - Number(a.where === (au ? "AU" : "US")));
}

/** Stores you can look one card up at, with a search link each (no prices: these stores have no free price feed). */
export type CardSearch = { id: string; name: string; where: "US" | "AU" | "EU"; url: (name: string) => string };

const q = (name: string) => encodeURIComponent(name.split(" // ")[0]);

export const CARD_SEARCH: CardSearch[] = [
  { id: "tcgplayer", name: "TCGplayer", where: "US", url: (n) => `https://www.tcgplayer.com/search/magic/product?q=${q(n)}` },
  { id: "cardkingdom", name: "Card Kingdom", where: "US", url: (n) => `https://www.cardkingdom.com/catalog/search?filter%5Bname%5D=${q(n)}` },
  { id: "mtgmate", name: "MTG Mate", where: "AU", url: (n) => `https://www.mtgmate.com.au/cards/search?q=${q(n)}` },
  { id: "gamesportal", name: "Games Portal", where: "AU", url: (n) => `https://gamesportal.com.au/search?q=${q(n)}` },
  { id: "cardmarket", name: "Cardmarket", where: "EU", url: (n) => `https://www.cardmarket.com/en/Magic/Products/Search?searchString=${q(n)}` },
];

/** Card search links in the order that suits the price currency: Australian stores first for AUD. */
export function cardSearchFor(currency: string): CardSearch[] {
  const home = currency === "AUD" ? "AU" : "US";
  return [...CARD_SEARCH].sort((a, b) => Number(b.where === home) - Number(a.where === home));
}
