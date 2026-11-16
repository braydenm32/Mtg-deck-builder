/** Top-level navigation. One list drives the header (and later the sidebar/menu config). */
export type NavItem = { href: string; label: string };

export const NAV: NavItem[] = [
  { href: "/", label: "Home" },
  { href: "/decks", label: "Decks" },
  { href: "/collection", label: "Collection" },
  { href: "/scan", label: "Scan" },
  { href: "/collection/add", label: "Add cards" },
  { href: "/import", label: "Import" },
  { href: "/settings", label: "Settings" },
];

/*
 * ---------------------------------------------------------------------------------------------
 * The menu for the new look (docs/design/4-information-architecture.md).
 *
 * This is the one config the whole menu comes from: the sidebar, the phone's bottom bar, the
 * top-bar tabs, the More sheets and ⌘K. `NAV` above is the old header's list and goes away when
 * the new look becomes the default.
 *
 * Every page under src/app needs exactly one entry in PAGES. tests/nav.test.ts fails on a page
 * with no entry (an orphan), an entry with no page (a dead link), or a page ⌘K can't find.
 * ---------------------------------------------------------------------------------------------
 */

export type AreaId = "today" | "collection" | "add" | "decks";
export type IconName = "today" | "collection" | "add" | "decks" | "search" | "settings" | "more" | "back" | "deck" | "look";

export type Area = {
  id: AreaId;
  label: string;
  icon: IconName;
  /** Where the area's button goes. */
  href: string;
  /** Where it goes on a phone, when that differs (Add cards opens the camera on a phone). */
  phoneHref?: string;
  /** The raised button in the middle of the phone's bottom bar, and the gradient button in the sidebar. */
  action?: boolean;
};

/** In bottom-bar order. The sidebar lists the same areas, with the action area as its button at the bottom. */
export const AREAS: Area[] = [
  { id: "today", label: "Today", icon: "today", href: "/" },
  { id: "collection", label: "Collection", icon: "collection", href: "/collection" },
  { id: "add", label: "Add cards", icon: "add", href: "/collection/add", phoneHref: "/scan", action: true },
  { id: "decks", label: "Decks", icon: "decks", href: "/decks" },
];

export type Place =
  /** The area's only page, so there's no tab bar. */
  | "landing"
  /** A tab in the top bar. */
  | "tab"
  /** In the area's More sheet: still in the menu, just out of the way. */
  | "more"
  /** Reached from another page (`parent`); Back goes there. Not in the menu. */
  | "child";

export type MenuPage = {
  /** The Next.js route, with dynamic segments as in the folder names: "/decks/[id]/cards". */
  route: string;
  /** Tab label, and the top-bar title unless `title` is set. */
  label: string;
  /** Top-bar title when it differs from the tab label ("Collection" for the "Cards" tab). */
  title?: string;
  area: AreaId;
  place: Place;
  /** For a child page: the route Back goes to. */
  parent?: string;
  /** "deck": a tab inside one deck. Its tabs and Back ("Decks") belong to that deck, not to the area. */
  scope?: "deck";
  /** Extra words ⌘K matches on. */
  keywords?: string[];
};

export const PAGES: MenuPage[] = [
  // Today
  { route: "/", label: "Today", area: "today", place: "landing", keywords: ["home", "dashboard", "needs"] },

  // Add cards: every way cards come in
  { route: "/scan", label: "Scan", title: "Add cards", area: "add", place: "tab", keywords: ["camera", "photo", "scanner"] },
  {
    route: "/collection/add",
    label: "Type a name",
    title: "Add cards",
    area: "add",
    place: "tab",
    keywords: ["add", "manual", "new card"],
  },
  {
    route: "/import",
    label: "Import a file",
    title: "Add cards",
    area: "add",
    place: "tab",
    keywords: ["csv", "upload", "mythic tools", "moxfield", "manabox", "archidekt", "deckbox", "tcgplayer"],
  },
  { route: "/import/[id]", label: "Import review", area: "add", place: "child", parent: "/import" },

  // Collection
  {
    route: "/collection",
    label: "Cards",
    title: "Collection",
    area: "collection",
    place: "tab",
    keywords: ["owned", "binder", "box", "search"],
  },
  {
    route: "/collection/places",
    label: "Boxes and binders",
    area: "collection",
    place: "tab",
    keywords: ["box", "binder", "location", "places", "storage", "rename", "merge"],
  },
  {
    route: "/collection/wants",
    label: "Want list",
    area: "collection",
    place: "tab",
    keywords: ["want", "wishlist", "buy", "shopping", "missing", "need", "order"],
  },
  {
    route: "/collection/value",
    label: "Stats",
    title: "Value and stats",
    area: "collection",
    place: "tab",
    keywords: ["price", "worth", "value", "history", "movers", "chart", "went up", "went down", "stats", "colours", "rarity", "sets", "curve"],
  },
  { route: "/collection/[oracleId]", label: "Card", area: "collection", place: "child", parent: "/collection" },
  {
    route: "/settings",
    label: "Settings",
    area: "collection",
    place: "more",
    keywords: ["prices", "currency", "aud", "usd", "hide prices", "preferences", "theme", "light", "dark", "kitchen table", "colours"],
  },

  // Decks: plan and build
  { route: "/decks", label: "My decks", title: "Decks", area: "decks", place: "tab" },
  { route: "/decks/new", label: "New deck", area: "decks", place: "child", parent: "/decks", keywords: ["build", "create", "commander"] },
  // A deck's read-only link, seen without the menu (src/components/shell/AppShell.tsx).
  { route: "/s/[token]", label: "Shared deck", area: "decks", place: "child", parent: "/decks" },
  {
    route: "/decks/shared",
    label: "Shared cards",
    area: "decks",
    place: "tab",
    keywords: ["allocate", "which deck", "conflict", "both decks"],
  },
  {
    route: "/decks/commanders",
    label: "Find a commander",
    area: "decks",
    place: "tab",
    keywords: ["theme", "suggest", "commander finder"],
  },
  {
    route: "/decks/import",
    label: "Import a decklist",
    area: "decks",
    place: "more",
    keywords: ["paste", "decklist", "moxfield", "archidekt", "mtgo", "arena"],
  },
  {
    route: "/decks/games",
    label: "Game log",
    area: "decks",
    place: "more",
    keywords: ["games", "win rate", "wins", "record", "played"],
  },
  {
    route: "/decks/compare",
    label: "Compare two decks",
    area: "decks",
    place: "more",
    keywords: ["compare", "side by side", "difference", "versus", "vs", "overlap"],
  },
  {
    route: "/decks/packages",
    label: "Card packages",
    area: "decks",
    place: "more",
    keywords: ["package", "suite", "bundle", "group of cards", "removal suite", "land pack", "combo"],
  },
  { route: "/decks/packages/[id]", label: "Package", area: "decks", place: "child", parent: "/decks/packages" },
  {
    route: "/decks/precons",
    label: "Import a precon",
    area: "decks",
    place: "more",
    keywords: ["precon", "preconstructed", "commander deck", "upgrade", "mtgjson"],
  },

  // Inside one deck
  { route: "/decks/[id]", label: "Overview", title: "Deck", area: "decks", place: "tab", scope: "deck" },
  { route: "/decks/[id]/cards", label: "Cards", title: "Deck", area: "decks", place: "tab", scope: "deck" },
  { route: "/decks/[id]/missing", label: "Missing", title: "Deck", area: "decks", place: "tab", scope: "deck" },
  { route: "/decks/[id]/suggestions", label: "Upgrades", title: "Deck", area: "decks", place: "tab", scope: "deck" },
  {
    route: "/decks/[id]/playtest",
    label: "Playtest",
    title: "Deck",
    area: "decks",
    place: "more",
    scope: "deck",
    keywords: ["goldfish", "sample hand"],
  },
  {
    route: "/decks/[id]/games",
    label: "Games",
    title: "Deck",
    area: "decks",
    place: "more",
    scope: "deck",
    keywords: ["game log", "win rate", "record", "wins", "played"],
  },
  {
    route: "/decks/[id]/history",
    label: "History",
    title: "Deck",
    area: "decks",
    place: "more",
    scope: "deck",
    keywords: ["versions", "changes", "undo", "restore", "rebuild"],
  },
];

/** Icon buttons in an area's top bar that lead to a page homed elsewhere (Settings lives under Collection's More). */
export const SHORTCUTS: { area: AreaId; label: string; href: string; icon: IconName }[] = [
  { area: "today", label: "Settings", href: "/settings", icon: "settings" },
];

/** One-tap actions ⌘K offers besides pages. */
export const ACTIONS: { label: string; href: string; keywords?: string[] }[] = [
  { label: "New deck", href: "/decks/new", keywords: ["build", "create"] },
  { label: "Scan cards", href: "/scan", keywords: ["camera", "add"] },
  { label: "Export or back up your collection", href: "/settings#data", keywords: ["export", "backup", "csv", "download", "restore"] },
  { label: "Go back to the old look", href: "?look=old", keywords: ["theme", "classic", "previous"] },
];

/* ---------------------------------------------- matching ---------------------------------------------- */

const DYNAMIC = /^\[(?:\.\.\.)?[^\]]+\]$/;

function segments(path: string): string[] {
  return path.split(/[?#]/)[0].split("/").filter(Boolean);
}

/** Matches a pathname against a route pattern; returns the dynamic params, or null. */
export function matchRoute(route: string, pathname: string): Record<string, string> | null {
  const r = segments(route);
  const p = segments(pathname);
  if (r.length !== p.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < r.length; i++) {
    if (DYNAMIC.test(r[i])) params[r[i].slice(1, -1)] = decodeURIComponent(p[i]);
    else if (r[i] !== p[i]) return null;
  }
  return params;
}

/** Fewer dynamic segments win, as in Next.js: /decks/new beats /decks/[id]. */
const specificity = (route: string) => segments(route).filter((s) => DYNAMIC.test(s)).length;
const BY_SPECIFICITY = [...PAGES].sort((a, b) => specificity(a.route) - specificity(b.route));

export function findPage(pathname: string): { page: MenuPage; params: Record<string, string> } | null {
  for (const page of BY_SPECIFICITY) {
    const params = matchRoute(page.route, pathname);
    if (params) return { page, params };
  }
  return null;
}

/** Fills a route's dynamic segments: hrefFor("/decks/[id]/cards", { id: "3" }) is "/decks/3/cards". */
export function hrefFor(route: string, params: Record<string, string>): string {
  const out = segments(route).map((s) => (DYNAMIC.test(s) ? encodeURIComponent(params[s.slice(1, -1)] ?? "") : s));
  return "/" + out.join("/");
}

export type Tab = { label: string; href: string; route: string; active: boolean };
export type TopBarModel = {
  area: Area;
  shortcuts: typeof SHORTCUTS;
  title: string;
  /** Back link for child pages and pages inside a deck. */
  back: { label: string; href: string; route: string } | null;
  tabs: Tab[];
  more: Tab[];
  /** Title of the More sheet, themed to the area. */
  moreTitle: string;
};

export const areaById = (id: AreaId): Area => AREAS.find((a) => a.id === id)!;

/** Everything the top bar shows for a pathname. Unknown paths fall back to Today with no tabs. */
export function topBar(pathname: string): TopBarModel {
  const found = findPage(pathname);
  if (!found) return { area: AREAS[0], shortcuts: [], title: "MTG Deck Tutor", back: null, tabs: [], more: [], moreTitle: "" };
  const { page, params } = found;
  const area = areaById(page.area);
  // A child page shows its parent's tabs, with the parent highlighted.
  const anchor = page.place === "child" && page.parent ? (PAGES.find((p) => p.route === page.parent) ?? page) : page;
  const siblings = PAGES.filter((p) => p.area === page.area && (p.scope ?? null) === (anchor.scope ?? null));
  const toTab = (p: MenuPage): Tab => ({
    label: p.label,
    href: hrefFor(p.route, params),
    route: p.route,
    active: p.route === anchor.route,
  });
  const tabs = siblings.filter((p) => p.place === "tab").map(toTab);
  const more = siblings.filter((p) => p.place === "more").map(toTab);
  let back: TopBarModel["back"] = null;
  if (page.scope === "deck") back = { label: "Decks", href: "/decks", route: "/decks" };
  else if (page.place === "child" && page.parent) {
    const parent = PAGES.find((p) => p.route === page.parent);
    // Back names the area when the parent is where the area opens ("← Collection"), else the parent's own tab ("← Import a file").
    const opensArea = parent && (area.href === parent.route || area.phoneHref === parent.route);
    if (parent) back = { label: opensArea ? (parent.title ?? parent.label) : parent.label, href: hrefFor(parent.route, params), route: parent.route };
  }
  return {
    area,
    shortcuts: page.place === "landing" || page.place === "tab" ? SHORTCUTS.filter((x) => x.area === page.area && x.href !== pathname) : [],
    title: page.title ?? page.label,
    back,
    // A single tab is just the title again, so it isn't shown.
    tabs: tabs.length + more.length > 1 ? tabs : [],
    more,
    moreTitle: page.scope === "deck" ? "More in this deck" : `More in ${area.label}`,
  };
}

/**
 * Back should land where you were (CALM 4): the parent page with its search and filters. The shell
 * remembers the last address of each page as you leave it (see AppShell), and Back uses it when it's
 * the same page (same deck, same card) as the plain parent link.
 */
export const LAST_URL_KEY = (route: string) => `commandery:last:${route}`;

export function backHref(back: { href: string }, remembered: string | null): string {
  if (!remembered) return back.href;
  return remembered.split("?")[0] === back.href ? remembered : back.href;
}

/** The area a pathname belongs to, for highlighting the sidebar and bottom bar. */
export function areaOf(pathname: string): AreaId {
  return findPage(pathname)?.page.area ?? "today";
}

export type PaletteEntry = { label: string; hint: string; href: string; keywords: string[]; kind: "page" | "action" };

/** The pages and actions ⌘K can find without asking the server. */
export function paletteEntries(): PaletteEntry[] {
  const pages = PAGES.filter((p) => p.place !== "child" && p.scope !== "deck").map((p) => {
    const area = areaById(p.area);
    return {
      label: p.label,
      hint: p.place === "landing" ? "" : area.label,
      href: p.route,
      keywords: [p.title ?? "", area.label, ...(p.keywords ?? [])].filter(Boolean),
      kind: "page" as const,
    };
  });
  const actions = ACTIONS.map((a) => ({
    label: a.label,
    hint: "Action",
    href: a.href,
    keywords: a.keywords ?? [],
    kind: "action" as const,
  }));
  return [...pages, ...actions];
}

/** Simple ranking for ⌘K: label starts with the query, then a word in the label, then a keyword. 0 = no match. */
export function paletteScore(e: { label: string; keywords: string[] }, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 1;
  const label = e.label.toLowerCase();
  if (label.startsWith(q)) return 4;
  if (label.split(/\s+/).some((w) => w.startsWith(q))) return 3;
  if (label.includes(q)) return 2;
  if (e.keywords.some((k) => k.toLowerCase().includes(q))) return 1.5;
  return 0;
}
