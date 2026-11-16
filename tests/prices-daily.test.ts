import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { collectionItems, priceHistory, printings, valueHistory } from "@/db/schema";
import { storeScryfallCards } from "@/lib/cards/store";
import { computeMovers, finishPrice, priceState, pricesDue, readMovers, refreshPrices } from "@/lib/prices/daily";
import type { CollectionIdentifier, ScryfallCard } from "@/lib/scryfall/client";
import { tempDb } from "./helpers";

const make = (n: number, prices: ScryfallCard["prices"]) =>
  ({
    object: "card",
    id: `00000000-0000-4000-8000-00000000000${n}`,
    oracle_id: `11111111-0000-4000-8000-00000000000${n}`,
    name: `Price Test ${n}`,
    lang: "en",
    released_at: "2024-01-01",
    layout: "normal",
    mana_cost: "{1}",
    cmc: 1,
    type_line: "Artifact",
    oracle_text: "",
    colors: [],
    color_identity: [],
    keywords: [],
    legalities: { commander: "legal" },
    set: "tst",
    set_name: "Test",
    set_type: "expansion",
    collector_number: String(n),
    rarity: "rare",
    finishes: ["nonfoil", "foil"],
    prices,
    image_uris: { small: "s.jpg", normal: "n.jpg" },
  }) as unknown as ScryfallCard;

/** A fake Scryfall that answers with whatever prices `today` holds. */
function fakeScryfall(today: Map<string, ScryfallCard>) {
  const calls: number[] = [];
  const fetcher = async (ids: CollectionIdentifier[]) => {
    calls.push(ids.length);
    return { data: ids.map((i) => today.get((i as { id: string }).id)!).filter(Boolean), notFound: [] };
  };
  return { fetcher, calls };
}

let db: Db;
let cleanup: () => void;
const a = make(1, { usd: "10.00", usd_foil: "20.00", eur: "8.00" });
const b = make(2, { usd: "1.00", eur: "0.90" });

beforeEach(async () => {
  ({ db, cleanup } = await tempDb());
  await storeScryfallCards(db, [a, b]);
  const base = { lang: "en", source: "text", addedAt: "2026-11-01T00:00:00Z" };
  await db.insert(collectionItems).values([
    { ...base, printingId: a.id, oracleId: a.oracle_id!, quantity: 2, finish: "nonfoil" },
    { ...base, printingId: a.id, oracleId: a.oracle_id!, quantity: 1, finish: "foil" },
    { ...base, printingId: b.id, oracleId: b.oracle_id!, quantity: 4, finish: "nonfoil" },
  ]);
});
afterEach(() => cleanup());

describe("daily prices", () => {
  it("is due until a pass finishes, then not for most of a day", async () => {
    expect(pricesDue(await priceState(db))).toBe(true);
    const today = new Map([a, b].map((c) => [c.id, c]));
    const r = await refreshPrices(db, { fetcher: fakeScryfall(today).fetcher });
    expect(r).toMatchObject({ started: true, done: true, checked: 2, changed: 0 });
    const s = await priceState(db);
    expect(pricesDue(s)).toBe(false);
    expect(pricesDue(s, Date.now() + 21 * 3_600_000)).toBe(true);
    // A first look at unchanged prices writes no history, only the day's total.
    expect(await db.select().from(priceHistory)).toHaveLength(0);
    const [v] = await db.select().from(valueHistory);
    expect(v.usd).toBeCloseTo(2 * 10 + 20 + 4 * 1);
    expect(v.copies).toBe(7);
  });

  it("writes only what changed, keeps the price before, and finds the movers", async () => {
    const today = new Map([a, b].map((c) => [c.id, c]));
    const { fetcher } = fakeScryfall(today);
    await refreshPrices(db, { fetcher, now: () => new Date("2026-11-10T00:00:00Z") });
    today.set(a.id, make(1, { usd: "15.00", usd_foil: "18.00", eur: "12.50" }));
    const r = await refreshPrices(db, { fetcher, now: () => new Date("2026-11-11T00:00:00Z") });
    expect(r).toMatchObject({ done: true, checked: 2, changed: 1 });

    const [p] = await db.select().from(printings).where(eq(printings.id, a.id));
    expect(p).toMatchObject({ priceUsd: 15, priceUsdFoil: 18, priceEur: 12.5 });
    const hist = await db.select().from(priceHistory);
    expect(hist).toEqual([expect.objectContaining({ printingId: a.id, date: "2026-11-11", usd: 15, wasUsd: 10, usdFoil: 18, wasUsdFoil: 20 })]);

    const m = await computeMovers(db, new Date("2026-11-12T00:00:00Z"));
    expect(m.up).toEqual([expect.objectContaining({ printingId: a.id, finish: "nonfoil", copies: 2, was: 10, now: 15, change: 10 })]);
    expect(m.down).toEqual([expect.objectContaining({ printingId: a.id, finish: "foil", copies: 1, change: -2 })]);
    expect(m.total).toBe(8);
    // Stored for pages to read in one row.
    expect((await readMovers(db))?.up[0].change).toBe(10);
    // A week later the change has left the window.
    expect((await computeMovers(db, new Date("2026-11-20T00:00:00Z"))).up).toEqual([]);
  });

  it("records a change the weekly card download already wrote", async () => {
    const today = new Map([a, b].map((c) => [c.id, c]));
    const { fetcher } = fakeScryfall(today);
    await refreshPrices(db, { fetcher });
    // The card download moves the printing first; the daily check still sees the change.
    await db.update(printings).set({ priceUsd: 30 }).where(eq(printings.id, a.id));
    today.set(a.id, make(1, { usd: "30.00", usd_foil: "20.00" }));
    await refreshPrices(db, { fetcher });
    expect(await db.select().from(priceHistory)).toEqual([expect.objectContaining({ usd: 30, wasUsd: 10 })]);
  });

  it("stops at the time budget and carries on from there", async () => {
    const hex = (n: number) => n.toString(16).padStart(12, "0");
    const many = Array.from({ length: 300 }, (_, i) => ({ ...make(3, { usd: "2.00" }), id: `20000000-0000-4000-8000-${hex(i)}`, oracle_id: `21111111-0000-4000-8000-${hex(i)}`, name: `Many ${i}` }));
    await storeScryfallCards(db, many);
    await db.insert(collectionItems).values(many.map((c) => ({ printingId: c.id, oracleId: c.oracle_id!, lang: "en", source: "text", addedAt: "2026-11-01T00:00:00Z" })));
    const today = new Map([a, b, ...many].map((c) => [c.id, c]));
    const { fetcher, calls } = fakeScryfall(today);
    // One round of 300 always runs; with no time left, the pass stops there.
    expect(await refreshPrices(db, { fetcher, budgetMs: -1 })).toMatchObject({ done: false, checked: 300 });
    expect(pricesDue(await priceState(db))).toBe(true);
    expect(await refreshPrices(db, { fetcher, budgetMs: -1 })).toMatchObject({ done: true, checked: 2 });
    expect(calls).toEqual([300, 2]);
    expect(pricesDue(await priceState(db))).toBe(false);
  });

  it("prices a finish the way the collection's totals do", () => {
    expect(finishPrice({ usd: 1, usdFoil: null, usdEtched: null }, "foil")).toBe(1);
    expect(finishPrice({ usd: 1, usdFoil: 3, usdEtched: null }, "etched")).toBe(3);
    expect(finishPrice({ usd: null, usdFoil: 3, usdEtched: null }, "nonfoil")).toBe(3);
  });
});
