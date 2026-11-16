import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { cards, collectionItems } from "@/db/schema";
import { storeScryfallCards } from "@/lib/cards/store";
import { finishAnalysis } from "@/lib/deck/analysis";
import { compareWithAverage, parseAverageDeck, typeGroup } from "@/lib/deck/average";
import { manaBase, splitBasics, swapBasicFor, undoBasicSwap } from "@/lib/deck/manabase";
import { rule0Summary } from "@/lib/deck/rule0";
import { addDeckCard, createDeck, getDeck } from "@/lib/deck/store";
import type { ScryfallCard } from "@/lib/scryfall/client";
import { tempDb } from "./helpers";

const AVERAGE = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "edhrec-average-korvold.json"), "utf8"));

let n = 0;
function fake(name: string, type: string, o: { text?: string; ci?: string; cost?: string; cmc?: number } = {}): ScryfallCard {
  n += 1;
  const hex = n.toString(16).padStart(12, "0");
  return {
    object: "card",
    id: `30000000-0000-4000-8000-${hex}`,
    oracle_id: `31111111-0000-4000-8000-${hex}`,
    name,
    lang: "en",
    released_at: "2024-01-01",
    layout: "normal",
    mana_cost: o.cost ?? "",
    cmc: o.cmc ?? 0,
    type_line: type,
    oracle_text: o.text ?? "",
    colors: [...(o.ci ?? "")],
    color_identity: [...(o.ci ?? "")],
    keywords: [],
    legalities: { commander: "legal" },
    games: ["paper"],
    set: "tst",
    set_name: "Test Set",
    set_type: "expansion",
    collector_number: String(n),
    rarity: "rare",
    finishes: ["nonfoil"],
    prices: { usd: "1.00" },
    image_uris: { small: "s.jpg", normal: "n.jpg" },
  } as unknown as ScryfallCard;
}

const KORVOLD = fake("Korvold, Fae-Cursed King", "Legendary Creature — Dragon Noble", { ci: "BRG", cost: "{2}{B}{R}{G}", cmc: 5 });
const SOL = fake("Sol Ring", "Artifact", { text: "{T}: Add {C}{C}.", cost: "{1}", cmc: 1 });
const BOLT = fake("Lightning Bolt", "Instant", { text: "Lightning Bolt deals 3 damage to any target.", ci: "R", cost: "{R}", cmc: 1 });
const SIGNET = fake("Arcane Signet", "Artifact", { text: "{T}: Add one mana of any color in your commander's color identity.", cost: "{2}", cmc: 2 });
const SWAMP = fake("Swamp", "Basic Land — Swamp", { text: "({T}: Add {B}.)" });
const FOREST = fake("Forest", "Basic Land — Forest", { text: "({T}: Add {G}.)" });
const TOMB = fake("Overgrown Tomb", "Land — Swamp Forest", { text: "({T}: Add {B} or {G}.)", ci: "BG" });

let db: Db;
let cleanup: () => void;
let deckId: number;
beforeEach(async () => {
  ({ db, cleanup } = await tempDb());
  await storeScryfallCards(db, [KORVOLD, SOL, BOLT, SIGNET, SWAMP, FOREST, TOMB]);
  const base = { lang: "en", source: "text", addedAt: "2026-11-01T00:00:00Z", location: "Box" };
  await db.insert(collectionItems).values([SIGNET, TOMB, KORVOLD].map((c) => ({ ...base, printingId: c.id, oracleId: c.oracle_id! })));
  const d = await createDeck(db, { commanderOracleId: KORVOLD.oracle_id!, name: "Korvold", status: "building" });
  deckId = d.id;
  for (const c of [SOL, BOLT, SWAMP, SWAMP, SWAMP, FOREST]) await addDeckCard(db, deckId, c.oracle_id!);
});
afterEach(() => cleanup());

describe("EDHREC average deck", () => {
  it("reads the average deck's cards by type", () => {
    const avg = parseAverageDeck(AVERAGE)!;
    expect(avg.cards.reduce((k, c) => k + c.quantity, 0)).toBe(99);
    expect(avg.cards.find((c) => c.name === "Sol Ring")).toMatchObject({ type: "Artifact", quantity: 1 });
    expect(avg.similar).toContain("Prossh, Skyraider of Kher");
    expect(parseAverageDeck({})).toBeUndefined();
    expect(typeGroup("Artifact Creature — Golem")).toBe("Creature");
    expect(typeGroup("Artifact Land")).toBe("Land");
  });

  it("compares a deck with it: shared, missing (free copies first), and yours alone", async () => {
    process.env.EDHREC_ENABLED = "true";
    const asked: string[] = [];
    const r = await compareWithAverage(db, deckId, async (_db, p) => (asked.push(p), AVERAGE));
    expect(asked).toEqual(["average-decks/korvold-fae-cursed-king"]);
    if (!r?.ok) throw new Error("expected a comparison");
    expect(r.shared).toBe(1); // Sol Ring
    expect(r.missing[0]).toMatchObject({ name: "Arcane Signet", oracleId: SIGNET.oracle_id, free: 1 });
    expect(r.missing.find((m) => m.name === "Blood Crypt")).toMatchObject({ oracleId: null, owned: 0 });
    expect(r.extra).toEqual(["Lightning Bolt"]);
    expect(r.types.find((t) => t.type === "Instant")).toEqual({ type: "Instant", yours: 1, average: 10 });
    expect(r.basics.yours).toBe(4);
  });

  it("says so when EDHREC is off or has no average deck", async () => {
    process.env.EDHREC_ENABLED = "false";
    expect(await compareWithAverage(db, deckId, async () => AVERAGE)).toEqual({ ok: false, reason: "edhrec-off" });
    process.env.EDHREC_ENABLED = "true";
    expect(await compareWithAverage(db, deckId, async () => undefined)).toEqual({ ok: false, reason: "not-found" });
  });
});

describe("mana base helper", () => {
  it("splits basics by pip share, at least one for a colour you cast", () => {
    expect(splitBasics(10, [3, 1])).toEqual([8, 2]);
    expect(splitBasics(4, [1, 2, 1])).toEqual([1, 2, 1]);
    expect(splitBasics(5, [1, 0])).toEqual([5, 0]);
    expect(splitBasics(0, [1, 1])).toEqual([0, 0]);
  });

  it("suggests free lands that make two colours, swapping out the basic most over its share", async () => {
    const m = (await manaBase(db, deckId))!;
    expect(m.identity).toBe("BRG");
    expect(m.colours.find((c) => c.color === "B")).toMatchObject({ basics: 3, suggested: 1 });
    expect(m.options).toEqual([expect.objectContaining({ name: "Overgrown Tomb", makes: "BG", free: 1, cut: expect.objectContaining({ name: "Swamp" }) })]);

    const swap = (await swapBasicFor(db, deckId, m.options[0].cut!.rowId, TOMB.oracle_id!))!;
    let v = (await getDeck(db, deckId))!;
    expect(v.cards.find((c) => c.name === "Swamp")?.quantity).toBe(2);
    expect(v.cards.find((c) => c.name === "Overgrown Tomb")?.board).toBe("main");

    await undoBasicSwap(db, deckId, swap);
    v = (await getDeck(db, deckId))!;
    expect(v.cards.find((c) => c.name === "Swamp")?.quantity).toBe(3);
    expect(v.cards.some((c) => c.name === "Overgrown Tomb")).toBe(false);
  });
});

describe("Rule 0 card", () => {
  it("sums up the deck for the pod, as lines and as text", async () => {
    const v = (await getDeck(db, deckId))!;
    const a = finishAnalysis(v, { source: "builtin", combos: [], near: [] });
    const r = rule0Summary(v, a, 3);
    expect(r.lines[0]).toEqual({ label: "Commander", value: "Korvold, Fae-Cursed King" });
    expect(r.lines.find((l) => l.label === "Game Changers")?.value).toBe("None");
    expect(r.text.split("\n")[0]).toBe("Rule 0: Korvold");
    expect(r.text).toContain("Bracket: 2 (Core)");
    // Your own "Wincon" tag shows what the deck wins with.
    const [row] = await db.select().from(cards).where(eq(cards.oracleId, BOLT.oracle_id!));
    const tagged = { ...v, cards: v.cards.map((c) => (c.oracleId === row.oracleId ? { ...c, tags: ["Wincon"] } : c)) };
    expect(rule0Summary(tagged, a, 3).lines.find((l) => l.label === "Wins with")?.value).toBe("Lightning Bolt");
  });
});
