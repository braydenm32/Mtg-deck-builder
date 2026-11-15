import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { DEFAULT_PRICE_VIEW, formatMoney, toUsd } from "@/lib/money";
import { getSettings, priceView, saveSettings } from "@/lib/settings";
import { tempDb } from "./helpers";

describe("formatMoney", () => {
  it("shows US dollars by default, A$ when chosen, and nothing when prices are hidden", () => {
    expect(formatMoney(12.5)).toBe("US$12.50");
    expect(formatMoney(1234)).toBe("US$1,234.00");
    expect(formatMoney(null)).toBe("—");
    const aud = { ...DEFAULT_PRICE_VIEW, currency: "AUD" as const, audPerUsd: 1.5 };
    expect(formatMoney(10, aud)).toBe("A$15.00");
    expect(toUsd(15, aud)).toBe(10);
    expect(formatMoney(10, { ...aud, hide: true })).toBeNull();
    expect(formatMoney(null, { ...aud, hide: true })).toBeNull();
  });
});

describe("settings", () => {
  let db: Db;
  let cleanup: () => void;
  beforeEach(async () => ({ db, cleanup } = await tempDb()));
  afterEach(() => cleanup());

  it("defaults to visible US dollar prices and saves changes", async () => {
    expect(await getSettings(db)).toEqual({ hidePrices: false, currency: "USD" });
    await saveSettings(db, { currency: "AUD" });
    await saveSettings(db, { hidePrices: true });
    expect(await getSettings(db)).toEqual({ hidePrices: true, currency: "AUD" });
    const pv = await priceView(db);
    expect(pv.hide).toBe(true);
    expect(pv.currency).toBe("AUD");
    expect(pv.audPerUsd).toBeGreaterThan(1);
  });
});
