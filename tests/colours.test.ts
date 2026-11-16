import { describe, expect, it } from "vitest";
import { colorsParam, parseColors } from "@/lib/cards/normalize";

describe("parseColors", () => {
  it("reads a colour choice in any order and case", () => {
    expect(parseColors("rb")).toBe("BR");
    expect(parseColors("gw")).toBe("WG");
    expect(parseColors("WUBRG")).toBe("WUBRG");
    expect(parseColors("C")).toBe("");
    expect(parseColors("")).toBeUndefined();
    expect(parseColors(null)).toBeUndefined();
    expect(parseColors("xyz")).toBeUndefined();
    expect(colorsParam("")).toBe("C");
    expect(colorsParam("BR")).toBe("BR");
  });
});
