import { describe, expect, it } from "vitest";
import { FoilWatcher, foilEvidence } from "@/scanner/foil";
import { tilt } from "./foil-sim";

// Simulated footage (see foil-sim.ts). Thresholds were also checked on real phone videos of
// 3 foil and 2 non-foil cards: 2 foils were called foil, the rest asked, none were wrong.
describe("foil check from a moving card", () => {
  it("never calls a non-foil card foil, however the glare and exposure move", () => {
    const verdicts = Array.from({ length: 24 }, (_, i) => foilEvidence(tilt(i + 100, false)).verdict);
    expect(verdicts.filter((v) => v === "foil")).toHaveLength(0);
    expect(verdicts.filter((v) => v === "nonfoil").length).toBeGreaterThanOrEqual(14);
  });

  it("never calls a foil card non-foil, and sees a strong sheen", () => {
    const faint = Array.from({ length: 16 }, (_, i) => foilEvidence(tilt(i + 1, true)).verdict);
    expect(faint.filter((v) => v === "nonfoil")).toHaveLength(0);
    const strong = Array.from({ length: 16 }, (_, i) => foilEvidence(tilt(i + 1, true, 10, { sheen: 90 })).verdict);
    expect(strong.filter((v) => v === "nonfoil")).toHaveLength(0);
    expect(strong.filter((v) => v === "foil").length).toBeGreaterThanOrEqual(6);
  });

  it("is unsure when nothing moved (a still card proves nothing)", () => {
    expect(foilEvidence(tilt(5, false, 8, { still: true })).verdict).toBe("unsure");
    expect(foilEvidence(tilt(6, true, 8, { still: true })).verdict).toBe("unsure");
  });

  it("is unsure with too few views, and won't call non-foil on a handful", () => {
    expect(foilEvidence(tilt(7, true, 3)).verdict).toBe("unsure");
    expect(foilEvidence([]).verdict).toBe("unsure");
    for (let seed = 20; seed < 26; seed++) expect(foilEvidence(tilt(seed, false, 5)).verdict).toBe("unsure");
  });

  it("is never wrong on the few views of a quick tower drop", () => {
    for (let seed = 1; seed <= 10; seed++) {
      expect(foilEvidence(tilt(seed, true, 6)).verdict).not.toBe("nonfoil");
      expect(foilEvidence(tilt(seed + 50, false, 6)).verdict).not.toBe("foil");
    }
  });

  it("ignores a view of some other card (a half-seen card mid-fall)", () => {
    const run = tilt(9, false, 8);
    run.splice(3, 1, tilt(999, false, 2)[0]);
    run.splice(5, 1, tilt(4242, true, 3)[1]);
    expect(foilEvidence(run).verdict).not.toBe("foil");
  });

  it("the watcher keeps the moments that moved and judges the same way", () => {
    const w = new FoilWatcher();
    for (const f of tilt(12, false, 12, { still: true })) w.add(f);
    for (const f of tilt(12, false, 10)) w.add(f);
    expect(w.count).toBeLessThanOrEqual(16);
    expect(w.added).toBe(22);
    expect(w.evidence().verdict).not.toBe("foil");
    w.reset();
    expect(w.count).toBe(0);
  });
});
