import { NextResponse } from "next/server";
import { checkPassword, newSession, passwordConfigured, publicUrl, safeNext, SESSION_COOKIE, SESSION_DAYS } from "@/lib/auth";
import { totpSecret, totpStep } from "@/lib/totp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * GET  /unlock  the password page (plain HTML, so it shows even before the app's data is reachable)
 * POST /unlock  checks the password, sets the session cookie and goes back where you were heading
 *
 * It's a route rather than a page: it sits outside the app's menu and shell (src/lib/nav.ts).
 */

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function page(opts: { next: string; error?: string; code?: boolean }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0f0c1b">
<meta name="robots" content="noindex">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" href="/icons/tutor.svg">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Deck Tutor">
<title>Unlock · MTG Deck Tutor</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100dvh; display: grid; place-items: center; padding: 16px;
    background: #0f0c1b; color: #f4f1fb; font: 16px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  main { width: 100%; max-width: 360px; }
  img { display: block; width: 56px; height: 56px; margin-bottom: 20px; }
  h1 { font-size: 24px; line-height: 1.2; margin: 0 0 6px; font-weight: 700; }
  p { margin: 0 0 20px; color: #a49cba; }
  label { display: block; font-size: 14px; font-weight: 500; margin-bottom: 6px; }
  input { width: 100%; min-height: 48px; padding: 10px 14px; border-radius: 12px; border: 1px solid #2a2440;
    background: #18142a; color: inherit; font: inherit; }
  input:focus { outline: 2px solid #f0abfc; outline-offset: 2px; }
  button { margin-top: 14px; width: 100%; min-height: 48px; border: 0; border-radius: 12px; color: #fff; font: inherit;
    font-weight: 600; background: linear-gradient(135deg, #7c3aed, #db2777); cursor: pointer; }
  .second { margin-top: 14px; }
  .error { margin: 12px 0 0; padding: 10px 12px; border-radius: 10px; background: rgba(248, 113, 113, 0.14); color: #f87171; font-size: 14px; }
</style>
</head>
<body>
<main>
  <img src="/icons/tutor.svg" alt="">
  <h1>MTG Deck Tutor</h1>
  <p>Enter your password to open your collection. This device stays unlocked for a year.</p>
  <form method="post" action="/unlock">
    <input type="hidden" name="next" value="${esc(opts.next)}">
    <label for="password">Password</label>
    <input id="password" name="password" type="password" autocomplete="current-password" required autofocus>
    ${opts.code ? `<label for="code" class="second">Code from your authenticator app</label>
    <input id="code" name="code" type="text" inputmode="numeric" pattern="[0-9 ]*" maxlength="7" autocomplete="one-time-code" required>` : ""}
    ${opts.error ? `<p class="error" role="alert">${esc(opts.error)}</p>` : ""}
    <button type="submit">Unlock</button>
  </form>
</main>
</body>
</html>`;
}

const html = (body: string, status = 200) =>
  new NextResponse(body, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });

// Slow down guessing: at most MAX_FAILS wrong passwords per window on each server.
const MAX_FAILS = 10;
const WINDOW_MS = 15 * 60 * 1000;
const g = globalThis as unknown as { __unlockFails?: number[]; __unlockStep?: number };

function recentFails(): number[] {
  const now = Date.now();
  g.__unlockFails = (g.__unlockFails ?? []).filter((t) => now - t < WINDOW_MS);
  return g.__unlockFails;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!passwordConfigured()) return NextResponse.redirect(publicUrl(req, "/"));
  const code = totpSecret() != null;
  const error = url.searchParams.get("e") === "1" ? (code ? "That password or code isn’t right. Try again." : "That password isn’t right. Try again.") : undefined;
  return html(page({ next: safeNext(url.searchParams.get("next")), error, code }));
}

export async function POST(req: Request) {
  const form = await req.formData().catch(() => undefined);
  const next = safeNext(form?.get("next")?.toString());
  if (!passwordConfigured()) return NextResponse.redirect(publicUrl(req, "/"), 303);

  const secret = totpSecret();
  if (recentFails().length >= MAX_FAILS) {
    return html(page({ next, error: "Too many wrong tries. Wait 15 minutes, then try again.", code: secret != null }), 429);
  }
  const passwordOk = checkPassword(form?.get("password")?.toString() ?? "");
  // With two-step sign-in on, the code must be right too, and each code works once (on this server).
  const step = secret ? await totpStep(secret, form?.get("code")?.toString() ?? "") : 0;
  const codeOk = !secret || (step != null && step > (g.__unlockStep ?? -1));
  if (!passwordOk || !codeOk) {
    recentFails().push(Date.now());
    await new Promise((r) => setTimeout(r, 800));
    const back = publicUrl(req, "/unlock");
    back.searchParams.set("e", "1");
    if (next !== "/") back.searchParams.set("next", next);
    return NextResponse.redirect(back, 303);
  }

  if (secret && step != null) g.__unlockStep = step;
  const target = publicUrl(req, next);
  const res = NextResponse.redirect(target, 303);
  res.cookies.set(SESSION_COOKIE, await newSession(), {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: target.protocol === "https:",
    maxAge: SESSION_DAYS * 86_400,
  });
  return res;
}
