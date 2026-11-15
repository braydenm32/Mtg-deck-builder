import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { estimateBracket } from "@/lib/deck/bracket";
import { deckCombos, deckKey, findMyCombos } from "@/lib/spellbook/client";
import { parseFindMyCombos, renameToDeck, variantToCombo, type FindMyCombosPage } from "@/lib/spellbook/parse";
import { deck } from "./deck-fixtures";
import { tempDb } from "./helpers";

const PAGE = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "spellbook-find-my-combos.json"), "utf8")) as FindMyCombosPage;
const B = ["Island", "Swamp", "Mountain"];
const niv = () => deck(["Niv-Mizzet, Parun"], ["Curiosity", "Sol Ring", "Thassa's Oracle", "Demonic Consultation", "Isochron Scepter", "Dramatic Reversal"], { basics: B });

function fakeFetch(pages: FindMyCombosPage[] = [PAGE]) {
  const calls: { url: string; body: unknown }[] = [];
  const impl = async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) });
    return new Response(JSON.stringify(pages[calls.length - 1] ?? pages.at(-1)), { status: 200, headers: { "content-type": "application/json" } });
  };
  return { impl, calls };
}

describe("parse", () => {
  const parsed = parseFindMyCombos([PAGE]);

  it("reads included and almost-included combos", () => {
    expect(parsed.identity).toBe("UBR");
    expect(parsed.included.map((c) => c.cards)).toEqual([
      ["Demonic Consultation", "Thassa's Oracle"],
      ["Dramatic Reversal", "Isochron Scepter"],
      ["Curiosity", "Niv-Mizzet, Parun"],
      ["Narset's Reversal", "Isochron Scepter"],
    ]);
    expect(parsed.almostIncluded).toHaveLength(6);
  });

  it("keeps the payoff, the link, the bracket tag and non-card pieces", () => {
    const thoracle = parsed.included[0];
    expect(thoracle).toMatchObject({ id: "742-1295", bracketTag: "R", relevant: true, url: "https://commanderspellbook.com/combo/742-1295/" });
    expect(thoracle.result).toBe("Win the game");
    expect(parsed.included[1].note).toMatch(/Nonland permanents you control can tap/);
    expect(parsed.included[3].templates).toEqual(["Extra Turn Spell"]);
  });

  it("marks helper-only combos as not relevant", () => {
    const c = variantToCombo({ id: "x", uses: [{ card: { name: "A" } }, { card: { name: "B" } }], produces: [{ feature: { name: "Infinite storm count", status: "H" } }] });
    expect(c).toMatchObject({ relevant: false, result: "Infinite storm count" });
  });

  it("merges pages without duplicates", () => {
    expect(parseFindMyCombos([PAGE, PAGE]).included).toHaveLength(4);
  });

  it("renames double-faced pieces to the deck's spelling", () => {
    const [c] = renameToDeck([{ cards: ["Fable of the Mirror-Breaker // Reflection of Kiki-Jiki", "Sol Ring"], result: "x" }], ["Fable of the Mirror-Breaker", "Sol Ring"]);
    expect(c.cards).toEqual(["Fable of the Mirror-Breaker", "Sol Ring"]);
  });
});

describe("client", () => {
  let t: Awaited<ReturnType<typeof tempDb>>;
  beforeEach(async () => {
    t = await tempDb();
  });
  afterEach(() => {
    t.cleanup();
    delete process.env.SPELLBOOK_ENABLED;
  });

  it("sends commanders and the 99, and caches by deck list", async () => {
    const f = fakeFetch();
    const first = await deckCombos(t.db, niv(), { fetchImpl: f.impl });
    expect(first.source).toBe("spellbook");
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0].url).toMatch(/^https:\/\/backend\.commanderspellbook\.com\/find-my-combos\?limit=/);
    const body = f.calls[0].body as { commanders: { card: string }[]; main: { card: string }[] };
    expect(body.commanders).toEqual([{ card: "Niv-Mizzet, Parun" }]);
    expect(body.main.map((m) => m.card)).toContain("Curiosity");
    // Basics appear once each.
    expect(body.main.filter((m) => m.card === "Island")).toHaveLength(1);

    const again = await deckCombos(t.db, niv(), { fetchImpl: f.impl });
    expect(f.calls).toHaveLength(1);
    expect(again.combos).toEqual(first.combos);
  });

  it("keeps only combos the deck really has, and near combos missing one card", async () => {
    const r = await deckCombos(t.db, niv(), { fetchImpl: fakeFetch().impl });
    // Narset's Reversal isn't in the deck, so that combo is dropped from "in the deck".
    expect(r.combos.map((c) => c.id)).toEqual(["742-1295", "4821-5261", "1089-2353"]);
    expect(r.near.map((n) => n.missing)).toContain("Tainted Pact");
    const pops = r.near.map((n) => n.combo.popularity ?? 0);
    expect([...pops].sort((a, b) => b - a)).toEqual(pops);
  });

  it("feeds the bracket estimate", async () => {
    const entries = niv();
    const { combos } = await deckCombos(t.db, entries, { fetchImpl: fakeFetch().impl });
    const b = estimateBracket(entries, { combos });
    expect(b.bracket).toBe(4);
    // Thassa's Oracle + Consultation is Ruthless: early, Bracket 4.
    expect(b.reasons.find((r) => r.code === "combo-early")!.cards.sort()).toEqual(["Demonic Consultation", "Thassa's Oracle"]);
    // Scepter + Reversal is early by our timing, but Spellbook rates it Spicy (Bracket 3).
    expect(b.combos.find((c) => c.id === "4821-5261")).toMatchObject({ early: true, floor: 3 });
    expect(b.reasons.find((r) => r.code === "combo-late")!.message).toMatch(/Isochron Scepter \(Commander Spellbook rates it Bracket 3\)/);
    // Niv-Mizzet (6) + Curiosity is a late combo.
    expect(b.combos.find((c) => c.id === "1089-2353")).toMatchObject({ early: false, earliestTurn: 6, floor: 3 });
  });

  it("retries once after a hiccup", async () => {
    let tries = 0;
    const flaky = async (url: string, init: RequestInit) => (tries++ === 0 ? new Response("busy", { status: 429 }) : fakeFetch().impl(url, init));
    const r = await deckCombos(t.db, niv(), { fetchImpl: flaky, retryDelayMs: 1 });
    expect(r.source).toBe("spellbook");
    expect(tries).toBe(2);
  });

  it("follows pagination", async () => {
    const first = { ...PAGE, next: "https://backend.commanderspellbook.com/find-my-combos?limit=1000&offset=1000" };
    const f = fakeFetch([first, PAGE]);
    await findMyCombos(t.db, { commanders: [], main: ["Sol Ring"] }, { fetchImpl: f.impl });
    expect(f.calls.map((c) => c.url)).toHaveLength(2);
    expect(f.calls[1].url).toMatch(/offset=1000/);
  });

  it("falls back to the built-in list when Spellbook is down or switched off", async () => {
    let tries = 0;
    const down = async () => (tries++, new Response("nope", { status: 503 }));
    const r = await deckCombos(t.db, niv(), { fetchImpl: down, retryDelayMs: 1 });
    expect(tries).toBe(2);
    expect(r.source).toBe("builtin");
    expect(r.combos.map((c) => c.cards.join(" + "))).toContain("Thassa's Oracle + Demonic Consultation");

    process.env.SPELLBOOK_ENABLED = "false";
    const f = fakeFetch();
    expect((await deckCombos(t.db, niv(), { fetchImpl: f.impl })).source).toBe("builtin");
    expect(f.calls).toHaveLength(0);
  });

  it("uses a stale answer when offline", async () => {
    const d = { commanders: ["Niv-Mizzet, Parun"], main: ["Curiosity"] };
    await findMyCombos(t.db, d, { fetchImpl: fakeFetch().impl });
    await t.db.$client.execute({ sql: "update edhrec_cache set fetched_at = ? where key = ?", args: ["2020-01-01T00:00:00.000Z", deckKey(d)] });
    const r = await findMyCombos(t.db, d, { retryDelayMs: 1, fetchImpl: async () => { throw new Error("offline"); } });
    expect(r?.included).toHaveLength(4);
  });

  it("deck keys ignore order and duplicates", () => {
    expect(deckKey({ commanders: ["A"], main: ["B", "C", "B"] })).toBe(deckKey({ commanders: ["A"], main: ["C", "B"] }));
    expect(deckKey({ commanders: ["A"], main: ["B"] })).not.toBe(deckKey({ commanders: ["B"], main: ["A"] }));
  });
});
