import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { collectionItems } from "@/db/schema";
import { storeScryfallCards } from "@/lib/cards/store";
import { makeBackup, parseBackup, restoreBackup } from "@/lib/backup";
import { alertMet, createAlert, deleteAlert, listAlerts, noticeFor, quoteFor } from "@/lib/prices/alerts";
import { refreshPrices } from "@/lib/prices/daily";
import { addSubscription, listSubscriptions, makeVapidKeys, notifyPhones, removeSubscription, validEndpoint, vapidJwt, vapidKeys, verifyVapidJwt } from "@/lib/push";
import type { CollectionIdentifier, ScryfallCard } from "@/lib/scryfall/client";
import { tempDb } from "./helpers";

const make = (n: number, oracle: number, prices: ScryfallCard["prices"], extra: Partial<ScryfallCard> = {}) =>
  ({
    object: "card",
    id: `00000000-0000-4000-8000-00000000000${n}`,
    oracle_id: `11111111-0000-4000-8000-00000000000${oracle}`,
    name: `Alert Test ${oracle}`,
    lang: "en",
    released_at: `2024-01-0${n}`,
    layout: "normal",
    mana_cost: "{1}",
    cmc: 1,
    type_line: "Artifact",
    oracle_text: "",
    colors: [],
    color_identity: [],
    keywords: [],
    legalities: { commander: "legal" },
    set: "tst",
    set_name: "Test",
    set_type: "expansion",
    collector_number: String(n),
    rarity: "rare",
    finishes: ["nonfoil", "foil"],
    prices,
    image_uris: { small: "s.jpg", normal: "n.jpg" },
    ...extra,
  }) as unknown as ScryfallCard;

let db: Db;
let cleanup: () => void;
// Card 1: two printings, the cheaper is #2. Card 3: one you own.
const a1 = make(1, 1, { usd: "12.00" });
const a2 = make(2, 1, { usd: "9.00", usd_foil: "30.00" });
const b = make(3, 3, { usd: "40.00" });

beforeEach(async () => {
  ({ db, cleanup } = await tempDb());
  await storeScryfallCards(db, [a1, a2, b]);
  await db.insert(collectionItems).values({ lang: "en", source: "text", addedAt: "2026-11-01T00:00:00Z", printingId: b.id, oracleId: b.oracle_id!, quantity: 1, finish: "nonfoil" });
});
afterEach(() => cleanup());

describe("price alerts", () => {
  it("knows when a price has crossed the line", () => {
    expect(alertMet("below", 5, 4.99)).toBe(true);
    expect(alertMet("below", 5, 5)).toBe(true);
    expect(alertMet("below", 5, 5.01)).toBe(false);
    expect(alertMet("above", 5, 6)).toBe(true);
    expect(alertMet("above", 5, null)).toBe(false);
  });

  it("watches the printing you own, or else the cheapest one", async () => {
    expect(await quoteFor(db, a1.oracle_id!, "nonfoil")).toMatchObject({ printingId: a2.id, usd: 9, owned: false, label: "TST #2" });
    expect(await quoteFor(db, a1.oracle_id!, "foil")).toMatchObject({ printingId: a2.id, usd: 30, label: "TST #2 · Foil" });
    expect(await quoteFor(db, b.oracle_id!, "nonfoil")).toMatchObject({ printingId: b.id, usd: 40, owned: true });
  });

  it("won't set an alert that would go off straight away", async () => {
    expect(await createAlert(db, { oracleId: a1.oracle_id!, finish: "nonfoil", direction: "below", usd: 10 })).toEqual({ error: "It’s already at or below that price." });
  });

  it("goes off once, in the daily check, for printings you don't own too", async () => {
    const buy = await createAlert(db, { oracleId: a1.oracle_id!, finish: "nonfoil", direction: "below", usd: 7.5 });
    const sell = await createAlert(db, { oracleId: b.oracle_id!, finish: "nonfoil", direction: "above", usd: 50 });
    if ("error" in buy || "error" in sell) throw new Error("not saved");

    const asked: string[] = [];
    const today = new Map([make(2, 1, { usd: "7.00", usd_foil: "30.00" }), make(3, 3, { usd: "45.00" })].map((c) => [c.id, c]));
    const fetcher = async (ids: CollectionIdentifier[]) => {
      for (const i of ids) asked.push((i as { id: string }).id);
      return { data: ids.map((i) => today.get((i as { id: string }).id)!).filter(Boolean), notFound: [] };
    };
    await refreshPrices(db, { fetcher });
    // The printing you own and the one the alert watches; not the other printing of card 1.
    expect(asked.sort()).toEqual([a2.id, b.id].sort());

    const list = await listAlerts(db);
    expect(list.map((x) => [x.name, x.firedAt != null, x.firedUsd])).toEqual([
      ["Alert Test 1", true, 7],
      ["Alert Test 3", false, null],
    ]);
    const notice = await noticeFor(db, (usd) => `$${usd.toFixed(2)}`);
    expect(notice).toEqual({ title: "Price alert", body: "Alert Test 1 is down to $7.00", url: "/collection/alerts" });

    expect(await deleteAlert(db, buy.id)).toBe(true);
    expect((await listAlerts(db, { fired: true })).length).toBe(0);
  });
});

describe("price alerts in a backup", () => {
  it("are kept and restored", async () => {
    await createAlert(db, { oracleId: a1.oracle_id!, finish: "nonfoil", direction: "below", usd: 5 });
    const parsed = parseBackup(JSON.stringify(await makeBackup(db)));
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.backup.priceAlerts).toHaveLength(1);
    await createAlert(db, { oracleId: b.oracle_id!, finish: "nonfoil", direction: "above", usd: 99 });
    expect((await restoreBackup(db, parsed.backup, { online: false })).ok).toBe(true);
    expect((await listAlerts(db)).map((x) => [x.name, x.usd])).toEqual([["Alert Test 1", 5]]);
  });
});

describe("phone notifications", () => {
  it("signs a VAPID token the public key checks", () => {
    const keys = makeVapidKeys();
    expect(Buffer.from(keys.publicKey, "base64url")).toHaveLength(65);
    const jwt = vapidJwt("https://fcm.googleapis.com/fcm/send/abc", keys, Date.UTC(2026, 10, 16));
    const body = JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString());
    expect(body).toMatchObject({ aud: "https://fcm.googleapis.com", exp: Date.UTC(2026, 10, 16) / 1000 + 12 * 3600 });
    expect(verifyVapidJwt(jwt, keys.publicKey)).toBe(true);
    expect(verifyVapidJwt(jwt, makeVapidKeys().publicKey)).toBe(false);
  });

  it("only posts to real push services", () => {
    expect(validEndpoint("https://web.push.apple.com/abc")).toBe(true);
    expect(validEndpoint("http://web.push.apple.com/abc")).toBe(false);
    expect(validEndpoint("https://localhost/abc")).toBe(false);
    expect(validEndpoint("https://192.168.1.4/abc")).toBe(false);
  });

  it("makes its keys once, keeps phones, and forgets the ones that unsubscribed", async () => {
    expect(await vapidKeys(db)).toBeUndefined();
    const k = await vapidKeys(db, { create: true });
    expect((await vapidKeys(db))?.publicKey).toBe(k?.publicKey);

    await addSubscription(db, { endpoint: "https://push.example.com/1", keys: { p256dh: "x", auth: "y" } });
    await addSubscription(db, { endpoint: "https://push.example.com/2" });
    await addSubscription(db, { endpoint: "https://push.example.com/1", keys: { p256dh: "z", auth: "y" } });
    expect((await listSubscriptions(db)).map((s) => s.endpoint)).toEqual(["https://push.example.com/2", "https://push.example.com/1"]);

    const sent: { url: string; auth: string }[] = [];
    const fetcher = (async (url: string, init: RequestInit) => {
      sent.push({ url, auth: String((init.headers as Record<string, string>).Authorization) });
      return new Response(null, { status: url.endsWith("/2") ? 410 : 201 });
    }) as unknown as typeof fetch;
    expect(await notifyPhones(db, fetcher)).toBe(1);
    expect(sent[0].auth).toMatch(new RegExp(`^vapid t=[\\w-]+\\.[\\w-]+\\.[\\w-]+, k=${k!.publicKey}$`));
    expect((await listSubscriptions(db)).map((s) => s.endpoint)).toEqual(["https://push.example.com/1"]);
    await removeSubscription(db, "https://push.example.com/1");
    expect(await listSubscriptions(db)).toEqual([]);
  });
});
