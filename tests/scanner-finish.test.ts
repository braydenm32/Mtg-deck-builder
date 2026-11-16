import { describe, expect, it } from "vitest";
import { chooseFinish, finishReason } from "@/scanner/finish";

const p = (...finishes: string[]) => ({ finishes });

describe("choosing a scanned card's finish", () => {
  it("uses the only finish a printing is made in, whatever the setting", () => {
    expect(chooseFinish(p("foil"), "nonfoil")).toEqual({ finish: "foil", source: "printing", sure: true });
    expect(chooseFinish(p("nonfoil"), "foil")).toEqual({ finish: "nonfoil", source: "printing", sure: true });
    expect(chooseFinish(p("etched"), "auto")).toEqual({ finish: "etched", source: "printing", sure: true });
    expect(finishReason(chooseFinish(p("foil"), "nonfoil"))).toBe("only made in foil");
    expect(finishReason(chooseFinish(p("nonfoil"), "foil"))).toBe("only made in non-foil");
  });

  it("follows the setting when the printing comes in it", () => {
    expect(chooseFinish(p("nonfoil", "foil"), "foil")).toEqual({ finish: "foil", source: "setting", sure: true });
    expect(chooseFinish(p("nonfoil", "foil"), "nonfoil")).toEqual({ finish: "nonfoil", source: "setting", sure: true });
    expect(finishReason(chooseFinish(p("nonfoil", "foil"), "foil"))).toBeUndefined();
  });

  it("asks when the setting isn't made for that printing", () => {
    expect(chooseFinish(p("nonfoil", "foil"), "etched")).toMatchObject({ finish: "nonfoil", sure: false });
  });

  it("on Auto, goes with what the camera saw", () => {
    expect(chooseFinish(p("nonfoil", "foil"), "auto", "foil")).toEqual({ finish: "foil", source: "camera", sure: true });
    expect(chooseFinish(p("nonfoil", "foil"), "auto", "nonfoil")).toEqual({ finish: "nonfoil", source: "camera", sure: true });
    expect(chooseFinish(p("nonfoil", "etched"), "auto", "foil")).toMatchObject({ finish: "etched", source: "camera" });
    expect(chooseFinish(p("nonfoil", "foil"), "auto", "unsure")).toMatchObject({ finish: "nonfoil", sure: false });
    expect(chooseFinish(p("nonfoil", "foil"), "auto")).toMatchObject({ sure: false });
  });

  it("doesn't trust a 'non-foil' look for a printing that has no non-foil", () => {
    expect(chooseFinish(p("foil", "etched"), "auto", "nonfoil")).toMatchObject({ sure: false });
  });
});
