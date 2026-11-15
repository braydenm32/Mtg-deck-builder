import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buyOrProxy } from "@/lib/deck/budget";
import { FALLBACK_AUD_PER_USD, formatMoney, formatUsd, fromUsd, getUsdToAud } from "@/lib/prices/currency";
import { tempDb } from "./helpers";

const cards = [
  { name: "Gaea's Cradle", quantity: 1, unitPrice: 650 },
  { name: "Smothering Tithe", quantity: 1, unitPrice: 31 },
  { name: "Cultivate", quantity: 1, unitPrice: 0.5 },
  { name: "Lightning Greaves", quantity: 1, unitPrice: 4 },
  { name: "Esper Sentinel", quantity: 1, unitPrice: 12 },
  { name: "Brand New Card", quantity: 1, unitPrice: null },
];

describe("buyOrProxy", () => {
  it("suggests proxies only for far-too-expensive cards by default", () => {
    const r = buyOrProxy(cards);
    expect(r.proxy.map((c) => [c.name, c.reason])).toEqual([
      ["Gaea's Cradle", "expensive"],
      ["Smothering Tithe", "expensive"],
    ]);
    expect(r.buy.map((c) => c.name)).toEqual(["Esper Sentinel", "Lightning Greaves", "Cultivate"]);
    expect(r.noPrice.map((c) => c.name)).toEqual(["Brand New Card"]);
    expect(r).toMatchObject({ buyTotal: 16.5, proxySaves: 681, fullTotal: 697.5 });
  });

  it("proxies the priciest cards when over budget", () => {
    const r = buyOrProxy(cards, { budget: 5 });
    expect(r.proxy.find((c) => c.name === "Esper Sentinel")?.reason).toBe("budget");
    expect(r.buy.map((c) => c.name)).toEqual(["Lightning Greaves", "Cultivate"]);
    expect(r.buyTotal).toBe(4.5);
  });

  it("can turn the threshold off", () => {
    expect(buyOrProxy(cards, { proxyAbove: null }).proxy).toEqual([]);
    expect(buyOrProxy(cards, { proxyAbove: 10 }).proxy.map((c) => c.name)).toContain("Esper Sentinel");
  });

  it("counts quantity", () => {
    const r = buyOrProxy([{ name: "Relentless Rats", quantity: 30, unitPrice: 0.25 }]);
    expect(r.buyTotal).toBe(7.5);
  });
});

describe("currency", () => {
  let t: Awaited<ReturnType<typeof tempDb>>;
  beforeEach(async () => {
    t = await tempDb();
  });
  afterEach(() => {
    t.cleanup();
    delete process.env.AUD_PER_USD;
  });

  const ecb = (rate: number) => {
    let calls = 0;
    const impl = (async () => {
      calls++;
      return new Response(JSON.stringify({ amount: 1, base: "USD", date: "2026-11-13", rates: { AUD: rate } }), { status: 200 });
    }) as unknown as typeof fetch;
    return { impl, calls: () => calls };
  };

  it("fetches the ECB rate once a day", async () => {
    const f = ecb(1.52);
    expect(await getUsdToAud(t.db, { fetchImpl: f.impl })).toEqual({ rate: 1.52, date: "2026-11-13", source: "ecb" });
    expect(await getUsdToAud(t.db, { fetchImpl: f.impl })).toEqual({ rate: 1.52, date: "2026-11-13", source: "cached" });
    expect(f.calls()).toBe(1);
  });

  it("keeps the last rate when offline, else a labelled fallback", async () => {
    const offline = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    expect(await getUsdToAud(t.db, { fetchImpl: offline })).toEqual({ rate: FALLBACK_AUD_PER_USD, date: null, source: "fallback" });
    await getUsdToAud(t.db, { fetchImpl: ecb(1.6).impl });
    await t.db.$client.execute({ sql: "update meta set value = json_set(value, '$.fetchedAt', '2020-01-01T00:00:00.000Z') where key = 'fx:USD:AUD'", args: [] });
    expect(await getUsdToAud(t.db, { fetchImpl: offline })).toMatchObject({ rate: 1.6, source: "cached" });
  });

  it("can be pinned with AUD_PER_USD", async () => {
    process.env.AUD_PER_USD = "1.5";
    expect(await getUsdToAud(t.db, { fetchImpl: ecb(9).impl })).toEqual({ rate: 1.5, date: null, source: "env" });
  });

  it("converts and formats so USD and AUD can't be confused", () => {
    expect(fromUsd(10, "USD", 1.5)).toBe(10);
    expect(fromUsd(10, "AUD", 1.5)).toBe(15);
    expect(formatMoney(12.345, "USD")).toBe("$12.35");
    expect(formatMoney(12.345, "AUD")).toBe("A$12.35");
    expect(formatUsd(10, "AUD", 1.53)).toBe("A$15.30");
    expect(formatUsd(null, "AUD", 1.53)).toBe("—");
  });
});
