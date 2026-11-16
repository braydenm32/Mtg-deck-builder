/**
 * The app's lock: one password (APP_PASSWORD) for one person, so a hosted copy isn't open to anyone
 * who finds the address. Unlocking sets a signed cookie that lasts a year on that device.
 *
 * Web Crypto only, so the same code runs in middleware (edge) and in route handlers (Node).
 * Changing APP_PASSWORD (or AUTH_SECRET) signs every device out.
 */

export const SESSION_COOKIE = "tutor_session";
export const SESSION_DAYS = 365;

/** A password is set, so the app is locked. */
export function passwordConfigured(): boolean {
  return !!process.env.APP_PASSWORD;
}

/**
 * Must the app be locked? Always when a password is set, and always on Vercel: a hosted copy
 * without a password stays closed (and says how to set one) rather than showing your collection.
 */
export function lockRequired(): boolean {
  return passwordConfigured() || !!process.env.VERCEL;
}

const enc = new TextEncoder();

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

let keyFor: { secret: string; key: Promise<CryptoKey> } | undefined;

function signingKey(): Promise<CryptoKey> {
  const secret = `mtg-deck-tutor:${process.env.APP_PASSWORD ?? ""}:${process.env.AUTH_SECRET ?? ""}`;
  if (keyFor?.secret !== secret) {
    const key = crypto.subtle
      .digest("SHA-256", enc.encode(secret))
      .then((raw) => crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]));
    keyFor = { secret, key };
  }
  return keyFor.key;
}

async function sign(payload: string): Promise<string> {
  return hex(await crypto.subtle.sign("HMAC", await signingKey(), enc.encode(payload)));
}

/** Compare two strings in time that doesn't depend on where they differ. */
export function safeEqual(a: string, b: string): boolean {
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export function checkPassword(given: string): boolean {
  const want = process.env.APP_PASSWORD;
  return !!want && safeEqual(given, want);
}

/** A cookie value: "<expiry ms>.<signature>". */
export async function newSession(now = Date.now()): Promise<string> {
  const exp = String(now + SESSION_DAYS * 86_400_000);
  return `${exp}.${await sign(`v1.${exp}`)}`;
}

export async function validSession(value: string | undefined, now = Date.now()): Promise<boolean> {
  if (!value || !passwordConfigured()) return false;
  const dot = value.indexOf(".");
  if (dot < 1) return false;
  const exp = value.slice(0, dot);
  if (!/^\d+$/.test(exp) || Number(exp) < now) return false;
  return safeEqual(value.slice(dot + 1), await sign(`v1.${exp}`));
}

/** Only same-site paths after unlocking ("/decks?x=1"), never another site ("//evil.example"). */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  return next;
}

/**
 * This request's own address as the visitor sees it (behind a proxy, from the forwarded headers),
 * for redirects. `req.url` can name the server's internal host instead.
 */
export function publicUrl(req: Request, path: string): URL {
  const url = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const fwd = req.headers.get("x-forwarded-proto");
  const proto = fwd === "http" || fwd === "https" ? `${fwd}:` : url.protocol;
  return new URL(path, host ? `${proto}//${host}` : url);
}
