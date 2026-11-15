import { describe, expect, it } from "vitest";
import { colorString, frontFace, identityWithin, normCollectorNumber, normName } from "@/lib/cards/normalize";
import { normCondition, normFinish, normLang } from "@/lib/cards/identity";

describe("normName", () => {
  it.each([
    ["Jötun Grunt", "jotun grunt"],
    ["Fire // Ice", "fire ice"],
    ["Fire/Ice", "fire ice"],
    ["Atraxa, Praetors’ Voice", "atraxa praetors voice"],
    ["  Sol   Ring ", "sol ring"],
    ["Lim-Dûl's Vault", "lim duls vault"],
  ])("%s -> %s", (input, out) => expect(normName(input)).toBe(out));
});

describe("helpers", () => {
  it("front face", () => expect(frontFace("Fable of the Mirror-Breaker // Reflection of Kiki-Jiki")).toBe("Fable of the Mirror-Breaker"));
  it("colour order", () => expect(colorString(["G", "B", "W"])).toBe("WBG"));
  it("identity subset", () => {
    expect(identityWithin("BG", "WUBG")).toBe(true);
    expect(identityWithin("", "R")).toBe(true);
    expect(identityWithin("R", "BG")).toBe(false);
  });
  it("collector numbers", () => {
    expect(normCollectorNumber("007")).toBe("7");
    expect(normCollectorNumber("012A")).toBe("12a");
    expect(normCollectorNumber("0")).toBe("0");
  });
  it("conditions", () => {
    expect(normCondition("Near Mint")).toBe("NM");
    expect(normCondition("near_mint")).toBe("NM");
    expect(normCondition("Lightly Played Foil")).toBe("LP");
    expect(normCondition("")).toBe("");
  });
  it("languages", () => {
    expect(normLang("English")).toBe("en");
    expect(normLang("JP")).toBe("ja");
    expect(normLang(undefined)).toBe("en");
    expect(normLang("zhs")).toBe("zhs");
  });
  it("finishes", () => {
    expect(normFinish("foil")).toBe("foil");
    expect(normFinish("Etched")).toBe("etched");
    expect(normFinish("")).toBe("nonfoil");
    expect(normFinish("Normal")).toBe("nonfoil");
    expect(normFinish("true")).toBe("foil");
    expect(normFinish("false")).toBe("nonfoil");
  });
});
