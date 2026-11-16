import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { cards, printings } from "@/db/schema";
import { checkPassword, lockRequired, newSession, safeEqual, safeNext, validSession } from "@/lib/auth";
import { catalogCounts } from "@/lib/cards/name-cache";
import { cardDataState, needsRefresh } from "@/lib/cards/refresh";
import { searchCardNames } from "@/lib/cards/lookup";
import { syncCards } from "@/lib/cards/sync";
import { FIXTURE, seededDb, tempDb } from "./helpers";

// Pretend the database is hosted (Turso), so the sync takes its batch path instead of one long transaction.
vi.mock("@/db/client", async (orig) => ({ ...(await orig<typeof import("@/db/client")>()), isRemote: () => true }));

describe("card data on a hosted database", () => {
  let db: Db;
  let cleanup: () => void;
  beforeAll(async () => ({ db, cleanup } = await tempDb()));
  afterAll(() => cleanup());

  it("syncs in batches and gives the same data", async () => {
    const batch = vi.spyOn(db, "batch");
    const tx = vi.spyOn(db, "transaction");
    await syncCards(db, { files: { oracle_cards: FIXTURE, default_cards: FIXTURE } });
    expect(batch).toHaveBeenCalled();
    expect(tx).not.toHaveBeenCalled();
    expect((await db.select().from(cards)).length).toBe(10);
    expect((await db.select().from(printings)).length).toBe(10);
    // Running again is harmless (upserts), as an interrupted sync would be.
    await syncCards(db, { files: { oracle_cards: FIXTURE, default_cards: FIXTURE } });
    expect((await db.select().from(cards)).length).toBe(10);
  });

  it("counts the catalogue once, after the sync", async () => {
    const counts = await catalogCounts(db);
    expect(counts.printings).toBe(10);
    await db.run(sql`DELETE FROM printings`);
    // Stored, not recounted on every visit.
    expect((await catalogCounts(db)).printings).toBe(10);
  });
});

describe("refresh state", () => {
  it("wants a download with no data, or data over a week old", () => {
    const now = Date.parse("2026-11-16T00:00:00Z");
    expect(needsRefresh({}, now)).toBe(true);
    expect(needsRefresh({ lastSync: "2026-11-14T00:00:00Z" }, now)).toBe(false);
    expect(needsRefresh({ lastSync: "2026-11-01T00:00:00Z" }, now)).toBe(true);
    expect(needsRefresh({ lastSync: "2026-11-01T00:00:00Z", runningSince: "2026-11-15T23:59:00Z" }, now)).toBe(false);
  });

  it("reports a fresh database as never synced", async () => {
    const { db, cleanup } = await tempDb();
    expect(await cardDataState(db)).toEqual({ lastSync: undefined, runningSince: undefined, error: undefined });
    cleanup();
  });
});

describe("name search from memory", () => {
  let db: Db;
  let cleanup: () => void;
  beforeAll(async () => ({ db, cleanup } = await seededDb()));
  afterAll(() => cleanup());

  it("finds names by prefix first, then anywhere in the name", async () => {
    const all = (await searchCardNames(db, "a")).map((c) => c.name);
    const starts = all.filter((n) => n.toLowerCase().startsWith("a"));
    expect(all.slice(0, starts.length)).toEqual(starts);
    expect((await searchCardNames(db, "ring")).map((c) => c.name)).toContain("Sol Ring");
  });

  it("respects colour identity and commander filters", async () => {
    expect((await searchCardNames(db, "atraxa", 20, { identity: "WUBG" })).length).toBe(1);
    expect((await searchCardNames(db, "atraxa", 20, { identity: "WUB" })).length).toBe(0);
    expect((await searchCardNames(db, "sol ring", 20, { commander: true })).length).toBe(0);
  });
});

describe("the password lock", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is off locally without a password, and always on on Vercel", () => {
    vi.stubEnv("APP_PASSWORD", "");
    vi.stubEnv("VERCEL", "");
    expect(lockRequired()).toBe(false);
    vi.stubEnv("VERCEL", "1");
    expect(lockRequired()).toBe(true);
  });

  it("accepts only the password and its own signed, unexpired sessions", async () => {
    vi.stubEnv("APP_PASSWORD", "correct horse");
    expect(checkPassword("correct horse")).toBe(true);
    expect(checkPassword("correct hors")).toBe(false);
    const s = await newSession();
    expect(await validSession(s)).toBe(true);
    expect(await validSession(s.replace(/.$/, (c) => (c === "0" ? "1" : "0")))).toBe(false);
    expect(await validSession(`${Date.now() + 1e9}.deadbeef`)).toBe(false);
    expect(await validSession(await newSession(Date.now() - 400 * 86_400_000))).toBe(false);
    // A new password signs every device out.
    vi.stubEnv("APP_PASSWORD", "new password");
    expect(await validSession(s)).toBe(false);
  });

  it("only returns to paths on this site", () => {
    expect(safeNext("/decks/3?tab=cards")).toBe("/decks/3?tab=cards");
    expect(safeNext("//evil.example")).toBe("/");
    expect(safeNext("https://evil.example")).toBe("/");
    expect(safeNext("/\\evil.example")).toBe("/");
    expect(safeNext(undefined)).toBe("/");
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});
