import { describe, expect, it, vi } from "vitest";
import { cue } from "@/components/scanner/feedback";
import { priceOf, type Printing } from "@/components/scanner/types";

const p = (prices?: Printing["prices"]): Printing => ({ scryfallId: "x", name: "Sol Ring", set: "c21", setName: "C21", collectorNumber: "1", lang: "en", finishes: ["nonfoil", "foil"], prices });

describe("price on each scan", () => {
  it("uses the price of the finish scanned, falling back to non-foil", () => {
    expect(priceOf(p({ nonfoil: 1.5, foil: 4 }), "foil")).toBe(4);
    expect(priceOf(p({ nonfoil: 1.5, foil: null }), "foil")).toBe(1.5);
    expect(priceOf(p({ nonfoil: 1.5 }), "nonfoil")).toBe(1.5);
    expect(priceOf(p(), "nonfoil")).toBeNull();
  });
});

describe("sound and buzz", () => {
  it("buzzes once for a saved card and in a pattern for one to check, and never throws", () => {
    const vibrate = vi.fn();
    vi.stubGlobal("navigator", { vibrate });
    cue("added");
    cue("check");
    expect(vibrate.mock.calls).toEqual([[40], [[70, 60, 70]]]);
    vi.stubGlobal("navigator", {});
    expect(() => cue("added")).not.toThrow();
    vi.unstubAllGlobals();
  });
});
