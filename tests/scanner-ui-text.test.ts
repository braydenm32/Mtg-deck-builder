import { describe, expect, it } from "vitest";
import { cameraHelp, entryLabel, reviewHint, reviewQuestion, settingsSummary, type CameraProblem } from "@/components/scanner/text";
import type { Printing, ReviewItem, ScanResult, SessionEntry } from "@/components/scanner/types";

const printing: Printing = {
  scryfallId: "x",
  name: "Roaming Throne",
  set: "lci",
  setName: "The Lost Caverns of Ixalan",
  collectorNumber: "258",
  lang: "en",
  finishes: ["nonfoil", "foil"],
};

const scan = (over: Partial<ScanResult>): ScanResult => ({
  status: "uncertain",
  candidates: [],
  read: { nameText: "", nameConfidence: 0, collectorText: "", collector: {}, nameMatches: [], upsideDown: false },
  timingsMs: {},
  ...over,
});
const item = (s: ScanResult, replaces?: SessionEntry): Pick<ReviewItem, "scan" | "replaces"> => ({ scan: s, replaces });

describe("scan page wording", () => {
  it("summarises the sticky settings", () => {
    expect(settingsSummary({ condition: "NM", location: "" })).toBe("NM · no place set");
    expect(settingsSummary({ condition: "LP", location: "  Binder 2 " })).toBe("LP · Binder 2");
  });

  it("names a saved card with its printing, and the finish only when it isn't non-foil", () => {
    expect(entryLabel(printing, "nonfoil")).toBe("Roaming Throne · LCI #258");
    expect(entryLabel(printing, "foil")).toBe("Roaming Throne · LCI #258 · foil");
  });

  it("asks the question that fits what the scanner wasn't sure of", () => {
    const name = { name: "Roaming Throne", matchedFace: "Roaming Throne", score: 0.97 };
    expect(reviewQuestion(item(scan({ status: "not-found" })))).toBe("Couldn't read this card");
    expect(reviewQuestion(item(scan({ name: { ...name, score: 0.6 } })))).toBe("Is this the card?");
    expect(reviewQuestion(item(scan({})))).toBe("Is this the card?");
    expect(reviewQuestion(item(scan({ name })))).toBe("Which printing is it?");
    const entry = { key: "k", itemId: 1, printing, finish: "nonfoil", condition: "NM", location: "", confidence: "exact", addedAt: 0 } as const;
    expect(reviewQuestion(item(scan({ name }), entry))).toBe("Fix this card");
    expect(reviewHint(item(scan({ name }), entry))).toMatch(/old one comes out/);
  });

  it("explains every camera problem with a way forward", () => {
    const problems: CameraProblem[] = ["insecure", "unsupported", "denied", "missing", "busy", "stopped", "error"];
    for (const p of problems) {
      const h = cameraHelp(p);
      expect(h.title.length).toBeGreaterThan(5);
      expect(h.body).toMatch(/photos/);
    }
    // Retrying can't fix a page that isn't on https.
    expect(cameraHelp("insecure").retry).toBe(false);
    expect(cameraHelp("denied").retry).toBe(true);
  });
});
