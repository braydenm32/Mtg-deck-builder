import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { meta } from "@/db/schema";

/**
 * Notifications on your phone (web push), with no extra library. The key pair push services check
 * (VAPID) is made by the app the first time you turn notifications on, and kept in the database;
 * VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in the environment win when set (`npm run vapid-keys`; see
 * docs/notifications.md). A push carries no message: it only wakes the app's service worker,
 * which asks the app what happened (/api/alerts?fired=1) and shows that. So nothing about your
 * cards passes through the phone maker's push service, and no message encryption is needed.
 */

const SUBS = "push:subs";
const KEYS = "push:vapid";

export type PushSubscriptionJson = { endpoint: string; keys?: { p256dh?: string; auth?: string } };

export type VapidKeys = { publicKey: string; privateKey: string; subject?: string };

/** A new key pair, as push services and browsers want it: the public key as a raw P-256 point, the private key as its 32 bytes, both base64url. */
export function makeVapidKeys(): VapidKeys {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const pub = publicKey.export({ format: "jwk" });
  const raw = Buffer.concat([Buffer.from([4]), Buffer.from(pub.x!, "base64url"), Buffer.from(pub.y!, "base64url")]);
  return { publicKey: raw.toString("base64url"), privateKey: privateKey.export({ format: "jwk" }).d! };
}

/** The app's key pair: from the environment, or the one kept in the database (made now when `create`). */
export async function vapidKeys(db: Db, opts: { create?: boolean } = {}): Promise<VapidKeys | undefined> {
  const subject = process.env.VAPID_SUBJECT;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY, subject };
  const [row] = await db.select().from(meta).where(eq(meta.key, KEYS));
  if (row) {
    try {
      return { ...(JSON.parse(row.value) as VapidKeys), subject };
    } catch {
      // A damaged pair: make a new one below (phones subscribe again).
    }
  }
  if (!opts.create) return undefined;
  const made = makeVapidKeys();
  await db.insert(meta).values({ key: KEYS, value: JSON.stringify(made) }).onConflictDoNothing();
  // Two servers racing: whichever pair was saved first is the one.
  const [saved] = await db.select().from(meta).where(eq(meta.key, KEYS));
  return { ...(JSON.parse(saved.value) as VapidKeys), subject };
}

const b64url = (b: Buffer | Uint8Array) => Buffer.from(b).toString("base64url");

/** The VAPID token a push service checks: an ES256 JWT for the endpoint's origin, signed with the private key. */
export function vapidJwt(endpoint: string, keys: VapidKeys, now = Date.now()): string {
  const pub = Buffer.from(keys.publicKey, "base64url");
  if (pub.length !== 65 || pub[0] !== 4) throw new Error("VAPID_PUBLIC_KEY isn’t a P-256 public key.");
  const key = createPrivateKey({
    key: { kty: "EC", crv: "P-256", d: keys.privateKey, x: b64url(pub.subarray(1, 33)), y: b64url(pub.subarray(33, 65)) },
    format: "jwk",
  });
  const header = b64url(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const body = b64url(Buffer.from(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: keys.subject || "mailto:owner@localhost" })));
  const sig = sign("sha256", Buffer.from(`${header}.${body}`), { key, dsaEncoding: "ieee-p1363" });
  return `${header}.${body}.${b64url(sig)}`;
}

/** Check a VAPID JWT against a public key (for tests). */
export function verifyVapidJwt(jwt: string, publicKey: string): boolean {
  const [h, b, s] = jwt.split(".");
  const pub = Buffer.from(publicKey, "base64url");
  const key = createPublicKey({ key: { kty: "EC", crv: "P-256", x: b64url(pub.subarray(1, 33)), y: b64url(pub.subarray(33, 65)) }, format: "jwk" });
  return verify("sha256", Buffer.from(`${h}.${b}`), { key, dsaEncoding: "ieee-p1363" }, Buffer.from(s, "base64url"));
}

export async function listSubscriptions(db: Db): Promise<PushSubscriptionJson[]> {
  const [row] = await db.select().from(meta).where(eq(meta.key, SUBS));
  if (!row) return [];
  try {
    return JSON.parse(row.value) as PushSubscriptionJson[];
  } catch {
    return [];
  }
}

async function saveSubscriptions(db: Db, subs: PushSubscriptionJson[]) {
  const value = JSON.stringify(subs);
  await db.insert(meta).values({ key: SUBS, value }).onConflictDoUpdate({ target: meta.key, set: { value } });
}

/** Remember a phone's subscription (a phone that subscribes again replaces its old one). Keeps the ten newest. */
export async function addSubscription(db: Db, sub: PushSubscriptionJson) {
  const subs = (await listSubscriptions(db)).filter((s) => s.endpoint !== sub.endpoint);
  await saveSubscriptions(db, [...subs, { endpoint: sub.endpoint, keys: sub.keys }].slice(-10));
}

export async function removeSubscription(db: Db, endpoint: string) {
  const subs = await listSubscriptions(db);
  const left = subs.filter((s) => s.endpoint !== endpoint);
  if (left.length !== subs.length) await saveSubscriptions(db, left);
}

/** Only real push services: a subscription's endpoint is a URL the server will post to. */
export function validEndpoint(endpoint: string): boolean {
  try {
    const u = new URL(endpoint);
    return u.protocol === "https:" && !/^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[)/.test(u.hostname);
  } catch {
    return false;
  }
}

/**
 * Wake every subscribed phone. Phones that have unsubscribed (the push service answers 404 or
 * 410) are forgotten. Returns how many were reached.
 */
export async function notifyPhones(db: Db, fetcher: typeof fetch = fetch): Promise<number> {
  const subs = await listSubscriptions(db);
  if (!subs.length) return 0;
  const keys = await vapidKeys(db);
  if (!keys) return 0;
  let reached = 0;
  for (const s of subs) {
    if (!validEndpoint(s.endpoint)) continue;
    try {
      const res = await fetcher(s.endpoint, {
        method: "POST",
        headers: { TTL: String(24 * 3600), Urgency: "normal", Authorization: `vapid t=${vapidJwt(s.endpoint, keys)}, k=${keys.publicKey}`, "Content-Length": "0" },
        signal: AbortSignal.timeout(10_000),
      });
      if (res.status === 404 || res.status === 410) await removeSubscription(db, s.endpoint);
      else if (res.ok) reached++;
      else console.error("[push]", res.status, await res.text().catch(() => ""));
    } catch (e) {
      console.error("[push]", e);
    }
  }
  return reached;
}
