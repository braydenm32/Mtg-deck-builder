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
