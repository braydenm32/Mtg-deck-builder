import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { describe, expect, it } from "vitest";
import { readBulk } from "@/lib/cards/sync";
import { FIXTURE } from "./helpers";

async function names(file: string) {
  const out: string[] = [];
  for await (const c of readBulk(file)) out.push(c.name);
  return out;
}

describe("readBulk", () => {
  const cards = JSON.parse(fs.readFileSync(FIXTURE, "utf8")) as { name: string }[];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bulk-"));
  const jsonl = cards.map((c) => JSON.stringify(c)).join("\n") + "\n";

  it("reads a JSON array", async () => expect(await names(FIXTURE)).toEqual(cards.map((c) => c.name)));

  it("reads gzipped JSON Lines (Scryfall's current format)", async () => {
    const file = path.join(dir, "oracle.jsonl.gz");
    fs.writeFileSync(file, zlib.gzipSync(jsonl));
    expect(await names(file)).toEqual(cards.map((c) => c.name));
  });

  it("reads plain JSON Lines", async () => {
    const file = path.join(dir, "oracle.jsonl");
    fs.writeFileSync(file, jsonl);
    expect(await names(file)).toEqual(cards.map((c) => c.name));
  });
});

describe("syncCards with digital representatives", () => {
  it("keeps oracle cards whose chosen printing is digital, with a paper image", async () => {
    const { tempDb } = await import("./helpers");
    const { syncCards } = await import("@/lib/cards/sync");
    const { cards } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const list = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bulk-digital-"));
    // Oracle file: Sol Ring represented by a digital printing, plus a digital-only card.
    const oracle = list.map((c: { name: string }) =>
      c.name === "Sol Ring" ? { ...c, id: "00000000-0000-0000-0000-000000000001", digital: true, image_uris: { normal: "https://example.test/digital.jpg" } } : c,
    );
    oracle.push({ ...list[0], id: "00000000-0000-0000-0000-000000000002", oracle_id: "00000000-0000-0000-0000-0000000000aa", name: "Arena Only Card", digital: true });
    const oracleFile = path.join(dir, "oracle.json");
    fs.writeFileSync(oracleFile, JSON.stringify(oracle));

    const { db, cleanup } = await tempDb();
    await syncCards(db, { files: { oracle_cards: oracleFile, default_cards: FIXTURE } });
    const [sol] = await db.select().from(cards).where(eq(cards.name, "Sol Ring"));
    expect(sol.paper).toBe(true);
    expect(sol.imageNormal).toMatch(/cards\.scryfall\.io/);
    const [arena] = await db.select().from(cards).where(eq(cards.name, "Arena Only Card"));
    expect(arena.paper).toBe(false);
    cleanup();
  });
});
