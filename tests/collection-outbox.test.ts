import { describe, expect, it } from "vitest";
import { collectionOutcome } from "@/lib/offline/collection-outbox";

describe("collection changes kept on the device", () => {
  it("waits when the app can't be reached, and drops what's done or can never work", () => {
    const patch = { method: "PATCH" as const };
    const add = { method: "POST" as const };
    expect(collectionOutcome(patch, "network")).toBe("wait");
    expect(collectionOutcome(patch, 503)).toBe("wait");
    expect(collectionOutcome(patch, 401)).toBe("locked");
    expect(collectionOutcome(patch, 200, true)).toBe("locked");
    expect(collectionOutcome(patch, 200)).toBe("done");
    // A change to a stack that's gone since has nothing left to do.
    expect(collectionOutcome(patch, 404)).toBe("done");
    expect(collectionOutcome(add, 404)).toBe("failed");
    expect(collectionOutcome(add, 400)).toBe("failed");
  });
});
