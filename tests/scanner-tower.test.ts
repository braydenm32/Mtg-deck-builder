import { describe, expect, it } from "vitest";
import type { Quad } from "@/scanner/geometry";
import { TowerTracker, type TowerAction } from "@/scanner/tower";

const quad = (x: number, y: number, w = 100, h = 140): Quad => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];
const A = "f0f0f0f0f0f0f0f0";
const A_NOISY = "f0f0f0f0f0f0f0f1";
const B = "0f0f0f0f0f0f0f0f";
const HALF = "ff00ff00ff00ff00";

const at = (q: Quad | null, hash: string | null) => ({ quad: q, hash });
const still = (hash: string, n: number) => Array.from({ length: n }, () => at(quad(200, 100), hash));

function run(t: TowerTracker, frames: ReturnType<typeof at>[]): TowerAction[] {
  return frames.map((f) => t.update(f));
}

describe("tower mode: when to read the top card", () => {
  it("reads a card once it has landed and lain still, then leaves it alone", () => {
    const t = new TowerTracker();
    const acts = run(t, [at(null, null), at(quad(150, 20, 160, 220), HALF), at(quad(180, 60, 130, 180), A), ...still(A, 4), ...still(A_NOISY, 10)]);
    expect(acts.filter((a) => a === "capture")).toHaveLength(1);
    expect(acts.at(-1)).toBe("settled");
    expect(t.count).toBe(1);
  });

  it("reads the next card that lands on top", () => {
    const t = new TowerTracker();
    run(t, still(A, 5));
    const acts = run(t, [at(quad(150, 20, 160, 220), HALF), at(null, null), ...still(B, 5)]);
    expect(acts.filter((a) => a === "capture")).toHaveLength(1);
    expect(t.count).toBe(2);
  });

  it("reads an identical copy landing on its twin, because it was seen falling", () => {
    const t = new TowerTracker();
    run(t, still(A, 5));
    // The second Forest: big and close on the ramp, then gone for a moment mid-drop, then the same picture again.
    const acts = run(t, [at(quad(120, 10, 170, 240), A), at(null, null), at(null, null), ...still(A, 5)]);
    expect(acts.filter((a) => a === "capture")).toHaveLength(1);
    expect(t.count).toBe(2);
  });

  it("doesn't read the same card twice for one missed frame or a little jitter", () => {
    const t = new TowerTracker();
    run(t, still(A, 5));
    const acts = run(t, [at(null, null), at(quad(203, 102), A_NOISY), at(quad(198, 99), A), ...still(A, 6)]);
    expect(acts).not.toContain("capture");
    expect(t.count).toBe(1);
  });

  it("waits for a moving card to stop", () => {
    const t = new TowerTracker();
    const acts = run(t, [at(quad(100, 0), A), at(quad(130, 40), A), at(quad(160, 80), A), at(quad(200, 100), A)]);
    expect(acts).not.toContain("capture");
    expect(run(t, still(A, 3))).toContain("capture");
  });

  it("an empty tower is just empty", () => {
    const t = new TowerTracker();
    expect(run(t, [at(null, null), at(null, null)])).toEqual(["empty", "empty"]);
  });
});
