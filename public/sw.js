/*
 * MTG Deck Tutor's service worker: keeps the app, card images and the pages you open on this device,
 * so the app opens straight away and pages you've seen still open offline. See docs/speed.md.
 *
 * - The app's own code, fonts and icons (/_next/static, hashed): from the device once fetched.
 * - Card images (cards.scryfall.io): from the device once fetched (Scryfall allows this; it sends CORS).
 * - Pages (a full page load, e.g. opening the app): the copy saved on this device is shown at once and
 *   the page is fetched again behind it; when the new copy differs, the open page refreshes itself
 *   (src/components/shell/OfflineSupport.tsx). With no saved copy, the network; offline, a note.
 * - Tapping a link inside the app fetches only that page's data, straight from the network. Offline
 *   that fails, the app falls back to a full page load, and the saved copy answers it.
 * - Anything else (API calls, saves) always goes to the network. Signing out clears saved pages.
 * - After deck edits reach the server, the page marks that deck's saved pages (and Today and Decks)
 *   out of date: they're fetched first from the network next time, and saved again by the warm-up.
 * - With each deck's pages, the warm-up keeps the device's copy of the deck (/api/decks/:id/snapshot,
 *   in DATA), which the deck's tabs are drawn from while edits wait to send (src/lib/offline/kept.ts).
 *
 * Bump VERSION to start every cache afresh.
 */
const VERSION = "v1";
const STATIC = `tutor-static-${VERSION}`;
const IMAGES = `tutor-images-${VERSION}`;
const PAGES = `tutor-pages-${VERSION}`;
/** Written by the page (the card list and card details, src/lib/offline/) and by warm(); never cleared here. */
const DATA = "tutor-data-v1";
/** Oldest entries go first past these counts. */
const LIMIT = { [STATIC]: 600, [IMAGES]: 2500, [PAGES]: 150 };
/** Saved pages are fetched again in the background (see "warm") when older than this. */
const WARM_AFTER_MS = 30 * 60 * 1000;
const SAVED_AT = "x-tutor-saved-at";
/** On a DATA entry: when its request started (Date.now()), so edits sent after that aren't in it. */
const STARTED_AT = "x-tutor-started-at";
const HASH = "x-tutor-hash";
/** On a saved page that's out of date (its deck was edited since): network first, and warm it again. */
const STALE = "x-tutor-stale";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([STATIC, IMAGES, PAGES, DATA]);
      for (const name of await caches.keys()) if (name.startsWith("tutor-") && !keep.has(name)) await caches.delete(name);
      await self.clients.claim();
    })(),
  );
});

/** Pages worth saving: not the API, not the unlock page, not a file, not a one-off ?theme= switch. */
function isPage(url) {
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/_next/") || url.pathname === "/unlock") return false;
  if (/\.[^/]+$/.test(url.pathname)) return false;
  return !url.searchParams.has("theme");
}

const pageKey = (url) => url.origin + url.pathname + url.search;

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET") {
    if (url.origin === self.location.origin && url.pathname === "/api/auth/signout") event.waitUntil(caches.delete(PAGES));
    return;
  }
  if (url.origin === "https://cards.scryfall.io") {
    event.respondWith(cacheFirst(IMAGES, new Request(req.url, { mode: "cors", credentials: "omit" }), req));
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(STATIC, req, req));
    return;
  }
  if (url.pathname.startsWith("/icons/") || url.pathname === "/manifest.webmanifest") {
    event.respondWith(staleWhileRevalidate(STATIC, req));
    return;
  }
  if (req.mode === "navigate" && isPage(url)) event.respondWith(page(event, req, url));
  // Everything else goes to the network untouched.
});

async function cacheFirst(name, req, original) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok) await put(cache, name, req, res.clone());
    return res;
  } catch (e) {
    // An image we can't fetch with CORS: let the browser try it the ordinary way.
    if (original !== req) return fetch(original);
    throw e;
  }
}

async function staleWhileRevalidate(name, req) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  const fresh = fetch(req)
    .then(async (res) => {
      if (res.ok) await put(cache, name, req, res.clone());
      return res;
    })
    .catch(() => undefined);
  return hit ?? (await fresh) ?? Response.error();
}

/** Store, then drop the oldest entries past the cache's limit. A full device just stops saving. */
async function put(cache, name, key, res) {
  try {
    await cache.put(key, res);
    const keys = await cache.keys();
    const over = keys.length - (LIMIT[name] ?? Infinity);
    for (let i = 0; i < over; i++) await cache.delete(keys[i]);
  } catch {
    // Quota exceeded or storage unavailable.
  }
}

/** What the open pages need to know: which page was shown from a saved copy, and whether a newer one came. */
const served = new Map();

async function page(event, req, url) {
  const cache = await caches.open(PAGES);
  const key = pageKey(url);
  const saved = await cache.match(key);
  const network = fetch(req);
  if (saved && !saved.headers.get(STALE)) {
    // Recently shown from a saved copy (a reload, or the app restarting itself after an update):
    // this time wait for the network, so the newest page wins.
    const recent = served.get(key);
    if (!(recent && Date.now() - recent.at < 10_000)) {
      served.set(key, { at: Date.now(), savedAt: saved.headers.get(SAVED_AT), updated: false });
      event.waitUntil(
        network
          .then((res) => save(cache, key, res.clone(), saved))
          .then((changed) => changed && notify(key, "page-updated"))
          .catch(() => notify(key, "page-unreachable")),
      );
      return saved;
    }
  }
  try {
    const res = await network;
    event.waitUntil(save(cache, key, res.clone(), saved).catch(() => {}));
    return res;
  } catch {
    if (!saved) return offlinePage();
    served.set(key, { at: Date.now(), savedAt: saved.headers.get(SAVED_AT), updated: false, unreachable: true });
    return saved;
  }
}

/** Keep a page if it's a real one (not a redirect to /unlock or an error). True when it differs from `before`. */
async function save(cache, key, res, before) {
  const type = res.headers.get("content-type") ?? "";
  if (!res.ok || res.status !== 200 || res.redirected || res.type !== "basic" || !type.includes("text/html")) return false;
  const body = await res.text();
  // Only pages drawn in the app's shell are kept: it refreshes a saved copy and says when it's offline.
  // A shared deck's page (/s/…) has no shell, and no offline copy.
  if (!body.includes('class="app-shell"')) return false;
  // A saved page is only any use offline with the code it runs on, so keep that first (a page
  // saved in the background, or after an update, may name files this device has never loaded).
  if (!(await keepAssets(body))) return false;
  const hash = await digest(body);
  // Only what the browser needs: the body is stored decoded, so no content-encoding or length.
  const headers = new Headers({ "content-type": type, [SAVED_AT]: new Date().toISOString(), [HASH]: hash });
  await put(cache, PAGES, key, new Response(body, { status: 200, headers }));
  return !before || before.headers.get(HASH) !== hash;
}

/** Fetch the scripts, styles and fonts a page names that aren't on the device yet. False if any can't be had. */
async function keepAssets(html) {
  const cache = await caches.open(STATIC);
  const paths = new Set();
  for (const m of html.matchAll(/(?:\/_next\/)?static\/(?:chunks|css|media)\/[^"'\s\\]+?\.(?:js|css|woff2)/g)) {
    paths.add(m[0].startsWith("/_next/") ? m[0] : `/_next/${m[0]}`);
  }
  for (const path of paths) {
    const req = new Request(self.location.origin + path);
    if (await cache.match(req)) continue;
    try {
      const res = await fetch(req);
      if (!res.ok) return false;
      await put(cache, STATIC, req, res);
    } catch {
      return false;
    }
  }
  return true;
}

async function digest(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Tell open pages that the saved copy they show has a newer version, or that the app can't be reached. */
async function notify(key, type) {
  const s = served.get(key);
  if (s && type === "page-updated") s.updated = true;
  if (s && type === "page-unreachable") s.unreachable = true;
  for (const client of await self.clients.matchAll({ type: "window" })) client.postMessage({ type, url: key });
}

function offlinePage() {
  const heading = self.navigator.onLine === false ? "You’re offline" : "Can’t reach MTG Deck Tutor right now";
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>MTG Deck Tutor</title>
<body style="margin:0;min-height:100vh;font:16px/1.5 system-ui,sans-serif;background:#0f0c1b;color:#f4f1fb;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box">
<main style="max-width:26rem"><h1 style="font-size:20px;margin:0 0 8px">${heading}</h1>
<p style="color:#a49cba;margin:0 0 16px">This page isn’t saved on this device yet. Pages you’ve opened before still work.</p>
<p style="display:flex;gap:8px;flex-wrap:wrap;margin:0"><a href="/" style="color:#f0abfc">Today</a> · <a href="/decks" style="color:#f0abfc">Decks</a> · <a href="/collection" style="color:#f0abfc">Collection</a></p>
<p style="margin:16px 0 0"><button onclick="location.reload()" style="font:inherit;color:#fff;background:linear-gradient(135deg,#7c3aed,#db2777);border:0;border-radius:12px;padding:10px 18px">Try again</button></p></main></body></html>`;
  return new Response(html, { status: 503, headers: { "content-type": "text/html; charset=utf-8" } });
}

self.addEventListener("message", (event) => {
  const msg = event.data ?? {};
  if (msg.type === "hello" && typeof msg.url === "string") {
    // An open page asks how it was served.
    const s = served.get(msg.url);
    event.source?.postMessage({ type: "page-state", url: msg.url, fromCache: !!s, savedAt: s?.savedAt ?? null, updated: !!s?.updated, unreachable: !!s?.unreachable });
  } else if (msg.type === "clear-pages") {
    event.waitUntil(caches.delete(PAGES));
  } else if (msg.type === "warm") {
    event.waitUntil(warm(msg.pages ?? []).catch(() => {}));
  } else if (msg.type === "stale" && Array.isArray(msg.paths)) {
    event.waitUntil(markStale(msg.paths).catch(() => {}));
  }
});

/** Mark saved pages and data out of date: "/decks/7" is that page, "/decks/7/*" every page under it. */
async function markStale(paths) {
  const hit = (path) => paths.some((p) => (p.endsWith("/*") ? path.startsWith(p.slice(0, -1)) : path === p));
  for (const name of [PAGES, DATA]) {
    const cache = await caches.open(name);
    for (const req of await cache.keys()) {
      if (!hit(new URL(req.url).pathname)) continue;
      const res = await cache.match(req);
      if (!res || res.headers.get(STALE)) continue;
      const headers = new Headers(res.headers);
      headers.set(STALE, "1");
      await cache.put(req, new Response(await res.blob(), { status: 200, headers }));
    }
  }
}

/** Keep the device's copy of a deck (JSON) if it's older than WARM_AFTER_MS or out of date. */
async function warmData(path) {
  const cache = await caches.open(DATA);
  const key = self.location.origin + path;
  const saved = await cache.match(key);
  const at = saved ? Date.parse(saved.headers.get(SAVED_AT) ?? "") : 0;
  if (saved && !saved.headers.get(STALE) && Date.now() - at < WARM_AFTER_MS) return;
  const startedAt = Date.now();
  const res = await fetch(key, { credentials: "same-origin", headers: { "x-tutor-warm": "1" } });
  if (!res.ok || res.redirected || !(res.headers.get("content-type") ?? "").includes("json")) return;
  const headers = new Headers({ "content-type": "application/json", [SAVED_AT]: new Date().toISOString(), [STARTED_AT]: String(startedAt) });
  await cache.put(key, new Response(await res.text(), { status: 200, headers }));
}

let warming = false;

/**
 * Save the main pages and every deck's tabs while online, so they open offline even if you haven't
 * visited them lately. One page at a time, and only pages saved more than WARM_AFTER_MS ago.
 */
async function warm(extra) {
  if (warming) return;
  warming = true;
  try {
    const cache = await caches.open(PAGES);
    const origin = self.location.origin;
    const base = ["/", "/decks", "/collection", ...extra.filter((p) => typeof p === "string" && p.startsWith("/"))];
    const fetchOne = async (path) => {
      const key = origin + path;
      const saved = await cache.match(key);
      const at = saved ? Date.parse(saved.headers.get(SAVED_AT) ?? "") : 0;
      if (saved && !saved.headers.get(STALE) && Date.now() - at < WARM_AFTER_MS) return saved;
      const res = await fetch(key, { credentials: "same-origin", headers: { "x-tutor-warm": "1" } });
      await save(cache, key, res.clone(), saved);
      return cache.match(key);
    };
    for (const p of [...new Set(base)]) await fetchOne(p);
    // Every deck linked from the Decks page, with its tabs.
    const decks = await cache.match(origin + "/decks");
    const ids = decks ? [...new Set([...(await decks.text()).matchAll(/href="\/decks\/(\d+)"/g)].map((m) => m[1]))] : [];
    for (const id of ids) {
      for (const tab of ["", "/cards", "/missing", "/suggestions", "/playtest"]) await fetchOne(`/decks/${id}${tab}`);
      await warmData(`/api/decks/${id}/snapshot`).catch(() => {});
    }
  } finally {
    warming = false;
  }
}

/*
 * Notifications (src/lib/push.ts). A push carries no message: it wakes this worker, which asks the
 * app what happened and shows it. Signed out, or offline, it shows a plain note instead.
 */
self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let notice = { title: "MTG Deck Tutor", body: "A price alert went off. Open the app to see it.", url: "/collection/alerts" };
      try {
        const res = await fetch("/api/push/notice", { credentials: "same-origin", cache: "no-store" });
        if (res.ok) notice = await res.json();
      } catch {
        // Keep the plain note.
      }
      await self.registration.showNotification(notice.title, { body: notice.body, icon: "/icons/tutor-192.png", badge: "/icons/tutor-192.png", tag: "price-alert", data: { url: notice.url } });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const here = open.find((c) => c.url.startsWith(self.location.origin));
      if (here) {
        await here.focus();
        if ("navigate" in here) await here.navigate(url).catch(() => {});
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
