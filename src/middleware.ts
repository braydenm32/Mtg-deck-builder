import { NextResponse, type NextRequest } from "next/server";
import { lockRequired, passwordConfigured, SESSION_COOKIE, validSession } from "@/lib/auth";

const PARAMS = { look: ["new", "old"], theme: ["commandery", "kitchen", "auto"] } as const;

/**
 * Reachable without unlocking: the unlock page, and what a phone needs to install the app (the
 * service worker is plain code with no data in it, and must stay reachable for its update checks),
 * and a deck's read-only link (/s/<token>, src/lib/deck/share.ts), which shows only that deck's list.
 */
function isPublic(path: string): boolean {
  return path === "/unlock" || path.startsWith("/s/") || path === "/manifest.webmanifest" || path === "/robots.txt" || path === "/sw.js" || path.startsWith("/icons/");
}

const isPage = (path: string) => !path.startsWith("/api/") && !/\.[^/]+$/.test(path);

const NO_PASSWORD =
  "MTG Deck Tutor is locked because no password is set. In Vercel, open this project's Settings › Environment Variables, add APP_PASSWORD, then redeploy.";
const NO_DATABASE =
  "MTG Deck Tutor needs a database to keep your cards in. In Vercel, open this project's Storage tab, create a Turso database (Tokyo) and connect it to this project, then redeploy.";

/** On Vercel there's no disk, so without a hosted database nothing could be saved. */
const missingDatabase = () => !!process.env.VERCEL && !process.env.DATABASE_URL && !process.env.TURSO_DATABASE_URL;

function notSetUp(api: boolean, msg: string) {
  if (api) return NextResponse.json({ error: msg }, { status: 503 });
  return new NextResponse(
    `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>MTG Deck Tutor</title><body style="font:16px/1.5 system-ui;background:#0f0c1b;color:#ece9f6;padding:24px;max-width:36rem;margin:auto"><h1 style="font-size:20px">Almost there</h1><p>${msg}</p></body>`,
    { status: 503, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

/**
 * 1. The lock (src/lib/auth.ts): without a valid session cookie, pages go to /unlock and API calls
 *    get 401.
 * 2. `?look=new|old` and `?theme=commandery|kitchen|auto` remember the choice on this device (cookies
 *    "look" and "theme", read by src/lib/look.ts and src/lib/theme.ts), then drop the parameter.
 */
export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const page = isPage(path);

  if (lockRequired() && !isPublic(path)) {
    if (!passwordConfigured()) return notSetUp(!page, NO_PASSWORD);
    if (!(await validSession(req.cookies.get(SESSION_COOKIE)?.value))) {
      if (!page) return NextResponse.json({ error: "Locked. Open the app and enter your password." }, { status: 401 });
      const url = req.nextUrl.clone();
      url.pathname = "/unlock";
      url.search = "";
      if (path !== "/" || req.nextUrl.search) url.searchParams.set("next", path + req.nextUrl.search);
      return NextResponse.redirect(url);
    }
  }

  if (missingDatabase() && !isPublic(path)) return notSetUp(!page, NO_DATABASE);

  if (!page) return NextResponse.next();
  const set = Object.entries(PARAMS).flatMap(([name, allowed]) => {
    const v = req.nextUrl.searchParams.get(name);
    return v && (allowed as readonly string[]).includes(v) ? [[name, v] as const] : [];
  });
  if (!set.length) return NextResponse.next();
  const url = req.nextUrl.clone();
  for (const [name] of set) url.searchParams.delete(name);
  const res = NextResponse.redirect(url);
  for (const [name, v] of set) res.cookies.set(name, v, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  return res;
}

// Everything except Next's own static files (hashed JS/CSS, optimised images).
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
