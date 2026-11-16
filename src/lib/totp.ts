/**
 * Two-step sign-in: the six-digit codes an authenticator app (iPhone Passwords, Google
 * Authenticator, 1Password...) shows, by the standard (RFC 6238: HMAC-SHA1, 30 seconds, 6 digits).
 *
 * The secret lives in the environment (TOTP_SECRET), beside APP_PASSWORD, so it's never in the
 * database, and turning it on or off signs every device out (lib/auth.ts signs sessions with it).
 * Settings › Two-step sign-in makes a secret and checks a code before you add it.
 *
 * Web Crypto only, so it runs anywhere the lock does.
 */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_S = 30;

export const totpSecret = () => (process.env.TOTP_SECRET ?? "").replace(/[\s=-]/g, "").toUpperCase() || null;
export const totpConfigured = () => !!totpSecret();

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Uint8Array<ArrayBuffer> {
  const clean = text.replace(/[\s=-]/g, "").toUpperCase();
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (const ch of clean) {
    const i = ALPHABET.indexOf(ch);
    if (i < 0) throw new Error("Not base32");
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  const buf = new Uint8Array(new ArrayBuffer(out.length));
  buf.set(out);
  return buf;
}

/** A new secret: 20 random bytes, as authenticator apps expect, in base32. */
export function newTotpSecret(): string {
  return base32Encode(crypto.getRandomValues(new Uint8Array(20)));
}

/** The code for one 30-second step. */
export async function totpCode(secret: string, step: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", base32Decode(secret), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const counter = new ArrayBuffer(8);
  const view = new DataView(counter);
  view.setUint32(0, Math.floor(step / 2 ** 32));
  view.setUint32(4, step >>> 0);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, counter));
  const off = mac[mac.length - 1] & 15;
  const n = ((mac[off] & 127) << 24) | (mac[off + 1] << 16) | (mac[off + 2] << 8) | mac[off + 3];
  return String(n % 1_000_000).padStart(6, "0");
}

/**
 * The step a code belongs to, allowing for a phone clock half a minute either way, or null when it
 * isn't right. The caller refuses a step it has already let in, so a code works once.
 */
export async function totpStep(secret: string, code: string, now = Date.now()): Promise<number | null> {
  const given = code.replace(/\D/g, "");
  if (given.length !== 6) return null;
  const step = Math.floor(now / 1000 / STEP_S);
  for (const s of [step, step - 1, step + 1]) {
    const want = await totpCode(secret, s);
    let diff = 0;
    for (let i = 0; i < 6; i++) diff |= want.charCodeAt(i) ^ given.charCodeAt(i);
    if (diff === 0) return s;
  }
  return null;
}

/** The link an authenticator app opens to add the account (iPhone and most apps understand it). */
export function otpauthUrl(secret: string, label = "MTG Deck Tutor"): string {
  return `otpauth://totp/${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent("MTG Deck Tutor")}&algorithm=SHA1&digits=6&period=${STEP_S}`;
}
