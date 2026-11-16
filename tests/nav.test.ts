import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ACTIONS,
  AREAS,
  PAGES,
  SHORTCUTS,
  areaOf,
  backHref,
  findPage,
  hrefFor,
  matchRoute,
  paletteEntries,
  paletteScore,
  topBar,
} from "@/lib/nav";
import { lookFrom } from "@/lib/look";
import { themeFrom } from "@/lib/theme";

const APP = path.resolve(__dirname, "../src/app");

/** Every page route under src/app, as a Next.js route pattern ("/decks/[id]/cards"). Route groups "(x)" don't count. */
function pageRoutes(dir = APP, prefix = ""): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "api" && prefix === "") continue;
      if (name.startsWith("_") || name.startsWith("@")) continue;
      const seg = name.startsWith("(") && name.endsWith(")") ? "" : `/${name}`;
      out.push(...pageRoutes(full, prefix + seg));
    } else if (/^page\.(tsx|ts|jsx|js|mdx)$/.test(name)) {
      out.push(prefix || "/");
    }
  }
  return out;
}

describe("route map", () => {
  const routes = pageRoutes();
  const mapped = PAGES.map((p) => p.route);

  it("finds the app's pages", () => {
    expect(routes).toContain("/");
    expect(routes).toContain("/decks/[id]/cards");
  });

  it("gives every page a home (no orphaned routes)", () => {
    const orphans = routes.filter((r) => !mapped.includes(r));
    expect(orphans, `Add these to PAGES in src/lib/nav.ts: ${orphans.join(", ")}`).toEqual([]);
  });

  it("points only at pages that exist (no dead links)", () => {
    const dead = mapped.filter((r) => !routes.includes(r));
    expect(dead, `No page.tsx for: ${dead.join(", ")}`).toEqual([]);
  });

  it("lists each page once", () => {
    expect(new Set(mapped).size).toBe(mapped.length);
  });

  it("keeps between 4 and 7 areas, each landing on a real page in that area", () => {
    expect(AREAS.length).toBeGreaterThanOrEqual(4);
    expect(AREAS.length).toBeLessThanOrEqual(7);
    for (const a of AREAS) {
      for (const href of [a.href, a.phoneHref].filter((h): h is string => !!h)) {
        const found = findPage(href);
        expect(found, href).not.toBeNull();
        expect(found!.page.area, href).toBe(a.id);
      }
    }
  });

  it("puts every page in a real area, and every child under a real parent", () => {
    const ids = AREAS.map((a) => a.id);
    for (const p of PAGES) {
      expect(ids, p.route).toContain(p.area);
      if (p.place === "child") {
        expect(p.parent, p.route).toBeTruthy();
        expect(mapped, `${p.route} -> ${p.parent}`).toContain(p.parent);
      }
    }
  });

  it("points shortcuts and actions at real pages", () => {
    for (const x of [...SHORTCUTS.map((s) => s.href), ...ACTIONS.map((a) => a.href).filter((h) => !h.startsWith("?"))]) {
      expect(findPage(x), x).not.toBeNull();
    }
  });
});

describe("matching", () => {
  it("matches dynamic segments", () => {
    expect(matchRoute("/decks/[id]/cards", "/decks/12/cards")).toEqual({ id: "12" });
    expect(matchRoute("/decks/[id]", "/decks/12/cards")).toBeNull();
  });

  it("prefers static routes, as Next.js does", () => {
    expect(findPage("/decks/new")?.page.route).toBe("/decks/new");
    expect(findPage("/decks/shared")?.page.route).toBe("/decks/shared");
    expect(findPage("/decks/7")?.page.route).toBe("/decks/[id]");
    expect(findPage("/collection/add")?.page.route).toBe("/collection/add");
  });

  it("ignores the query string", () => {
    expect(findPage("/collection?q=sol")?.page.route).toBe("/collection");
  });

  it("fills dynamic segments", () => {
    expect(hrefFor("/decks/[id]/missing", { id: "3" })).toBe("/decks/3/missing");
  });

  it("knows each page's area", () => {
    expect(areaOf("/")).toBe("today");
    expect(areaOf("/import/4")).toBe("add");
    expect(areaOf("/scan")).toBe("add");
    expect(areaOf("/collection/abc")).toBe("collection");
    expect(areaOf("/decks/2/playtest")).toBe("decks");
    expect(areaOf("/settings")).toBe("collection");
  });
});

describe("top bar", () => {
  it("shows the area's tabs, with the current one active", () => {
    const m = topBar("/decks/shared");
    expect(m.title).toBe("Shared cards");
    expect(m.tabs.map((t) => t.label)).toEqual(["My decks", "Shared cards", "Find a commander"]);
    expect(m.tabs.find((t) => t.active)?.label).toBe("Shared cards");
    expect(m.more.map((t) => t.label)).toEqual(["Import a decklist", "Game log", "Card packages", "Import a precon"]);
    expect(m.back).toBeNull();
  });

  it("gives a deck its own tabs and a way back to Decks", () => {
    const m = topBar("/decks/5/missing");
    expect(m.tabs.map((t) => t.href)).toEqual(["/decks/5", "/decks/5/cards", "/decks/5/missing", "/decks/5/suggestions"]);
    expect(m.tabs.find((t) => t.active)?.label).toBe("Missing");
    expect(m.more.map((t) => t.href)).toEqual(["/decks/5/playtest", "/decks/5/games", "/decks/5/history"]);
    expect(m.back).toEqual({ label: "Decks", href: "/decks", route: "/decks" });
  });

  it("shows a child page under its parent's tab, with Back", () => {
    const m = topBar("/collection/some-oracle-id");
    expect(m.back).toEqual({ label: "Collection", href: "/collection", route: "/collection" });
    expect(m.tabs.find((t) => t.active)?.label).toBe("Cards");
    const imp = topBar("/import/9");
    expect(imp.back).toEqual({ label: "Import a file", href: "/import", route: "/import" });
    expect(imp.tabs.find((t) => t.active)?.label).toBe("Import a file");
  });

  it("has no tab bar on Today, and the Settings gear", () => {
    const m = topBar("/");
    expect(m.tabs).toEqual([]);
    expect(m.more).toEqual([]);
    expect(m.shortcuts.map((s) => s.href)).toEqual(["/settings"]);
  });

  it("titles each area's landing tab with the area's name", () => {
    expect(topBar("/collection").title).toBe("Collection");
    expect(topBar("/decks").title).toBe("Decks");
  });
});

describe("Back", () => {
  it("returns to the parent as you left it, but only the same parent", () => {
    expect(backHref({ href: "/collection" }, "/collection?q=sol&sort=price")).toBe("/collection?q=sol&sort=price");
    expect(backHref({ href: "/collection" }, null)).toBe("/collection");
    expect(backHref({ href: "/import/3" }, "/import/2?x=1")).toBe("/import/3");
  });
});

describe("⌘K", () => {
  const entries = paletteEntries();

  it("can reach every page that isn't a child page or inside one deck", () => {
    const reachable = new Set(entries.map((e) => e.href));
    for (const p of PAGES.filter((x) => x.place !== "child" && x.scope !== "deck")) expect(reachable, p.route).toContain(p.route);
  });

  it("still finds everything the old header linked to", () => {
    const reachable = new Set(entries.map((e) => e.href));
    for (const href of ["/", "/decks", "/collection", "/scan", "/collection/add", "/import", "/settings"])
      expect(reachable, href).toContain(href);
  });

  it("ranks a label that starts with the query first", () => {
    const ranked = entries
      .map((e) => ({ e, s: paletteScore(e, "imp") }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.e.label);
    expect(ranked[0]).toMatch(/^Import/);
  });

  it("matches keywords", () => {
    const csv = entries.filter((e) => paletteScore(e, "csv") > 0).map((e) => e.href);
    expect(csv).toContain("/import");
    const aud = entries.filter((e) => paletteScore(e, "aud") > 0).map((e) => e.href);
    expect(aud).toContain("/settings");
    const theme = entries.filter((e) => paletteScore(e, "theme") > 0).map((e) => e.href);
    expect(theme).toContain("/settings");
  });
});

describe("look flag", () => {
  it("defaults to the new look, and the cookie wins over the environment", () => {
    expect(lookFrom(undefined, undefined)).toBe("new");
    expect(lookFrom(undefined, "old")).toBe("old");
    expect(lookFrom("old", undefined)).toBe("old");
    expect(lookFrom("old", "new")).toBe("old");
    expect(lookFrom("new", "old")).toBe("new");
    expect(lookFrom("weird", undefined)).toBe("new");
  });
});

describe("theme", () => {
  it("defaults to Commandery and only accepts the three themes", () => {
    expect(themeFrom(undefined)).toBe("commandery");
    expect(themeFrom("kitchen")).toBe("kitchen");
    expect(themeFrom("auto")).toBe("auto");
    expect(themeFrom("neon")).toBe("commandery");
  });
});
