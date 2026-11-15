import { describe, expect, it } from "vitest";
import { buildDeck, scoreCandidate, type Candidate, type Role } from "@/lib/deck/build";
import { edhrecSlug, commanderSlug, parseCommanderPage, parseTagPage } from "@/lib/edhrec/client";
import { themeScore, typalType, themeLabel } from "@/lib/deck/themes";
import fs from "node:fs";
import path from "node:path";

let n = 0;
function card(over: Partial<Candidate> & { roles?: Role[] } = {}): Candidate {
  n += 1;
  return {
    oracleId: `o${n}`,
    name: `Card ${n}`,
    typeLine: "Creature — Bear",
    oracleText: "",
    manaCost: "{1}{B}",
    cmc: 2,
    colorIdentity: "B",
    edhrecRank: 5000,
    priceUsd: 1,
    available: 1,
    owned: 1,
    roles: [],
    theme: 0,
    ...over,
  };
}

const commander = { name: "Korvold, Fae-Cursed King", colorIdentity: "BRG" };

describe("buildDeck", () => {
  it("doesn't let one role crowd out the theme when you own plenty", () => {
    const pool = [
      // 40 popular mana rocks score higher than the theme cards...
      ...Array.from({ length: 40 }, () => card({ roles: ["ramp"], edhrecRank: 5, theme: 0, edhrec: { synergy: 0, inclusion: 0.5 } })),
      // ...but there are 80 theme cards to choose from.
      ...Array.from({ length: 80 }, () => card({ theme: 0.4, edhrecRank: 8000 })),
    ];
    const r = buildDeck({ commander, pool, suggestUnowned: false });
    expect(r.counts.roles.ramp).toBe(15);
    expect(r.counts.total).toBe(99);
  });

  it("builds exactly 99 from owned cards, with basics split by colour", () => {
    const pool = [
      ...Array.from({ length: 70 }, () => card()),
      ...Array.from({ length: 10 }, () => card({ roles: ["ramp"], manaCost: "{1}{G}", colorIdentity: "G" })),
      ...Array.from({ length: 5 }, () => card({ typeLine: "Land", oracleText: "{T}: Add {B} or {R}.", manaCost: null })),
    ];
    const r = buildDeck({ commander, pool });
    expect(r.counts.total).toBe(99);
    expect(r.counts.toAcquire).toBe(0);
    expect(r.counts.lands).toBe(36);
    const basics = r.cards.filter((c) => c.oracleId.startsWith("basic:"));
    expect(basics.map((b) => b.name).sort()).toEqual(["Forest", "Mountain", "Swamp"]);
    expect(basics.find((b) => b.name === "Swamp")!.quantity).toBeGreaterThan(basics.find((b) => b.name === "Forest")!.quantity);
  });

  it("fills role targets from owned cards before generic picks", () => {
    const strongFiller = Array.from({ length: 80 }, () => card({ edhrecRank: 10, theme: 1 }));
    const removal = Array.from({ length: 8 }, () => card({ roles: ["removal"], edhrecRank: 20000 }));
    const r = buildDeck({ commander, pool: [...strongFiller, ...removal], suggestUnowned: false });
    expect(r.counts.roles.removal).toBe(8);
  });

  it("suggests unowned cards only for gaps, and lists upgrades", () => {
    const owned = Array.from({ length: 40 }, () => card({ edhrecRank: 8000 }));
    const unowned = Array.from({ length: 40 }, () => card({ available: 0, owned: 0, edhrecRank: 50, roles: ["draw"], priceUsd: 3 }));
    const r = buildDeck({ commander, pool: [...owned, ...unowned] });
    expect(r.counts.total).toBe(99);
    expect(r.cards.filter((c) => c.acquire === "buy").length).toBe(63 - 40);
    expect(r.upgrades.length).toBeGreaterThan(0);
    expect(r.upgrades[0].acquire).toBe("buy");
  });

  it("never suggests buying when told not to, and warns instead", () => {
    const r = buildDeck({ commander, pool: Array.from({ length: 20 }, () => card()), suggestUnowned: false });
    expect(r.counts.toAcquire).toBe(0);
    expect(r.counts.total).toBe(99);
    expect(r.warnings.join(" ")).toMatch(/only had 20 usable spells/);
  });

  it("keeps locked cards and reports contested ones", () => {
    const pet = card({ name: "Pet Card", edhrecRank: 99999 });
    const elsewhere = card({ name: "Busy Card", available: 0, owned: 1, usedIn: ["Atraxa"], edhrecRank: 1, theme: 1 });
    const r = buildDeck({
      commander,
      pool: [pet, elsewhere, ...Array.from({ length: 98 }, () => card({ edhrecRank: 3000 }))],
      locked: [{ oracleId: pet.oracleId, quantity: 1, acquire: null }],
    });
    expect(r.cards.find((c) => c.name === "Pet Card")?.locked).toBe(true);
    expect(r.cards.find((c) => c.name === "Busy Card")).toBeUndefined();
    expect(r.contested.map((c) => [c.name, c.usedIn])).toEqual([["Busy Card", ["Atraxa"]]]);
  });

  it("stays inside the target bracket: Game Changer limit, no mass land denial, no extra-turn chains", () => {
    const strong = { edhrecRank: 1, theme: 1, edhrec: { synergy: 0.5, inclusion: 0.6 } };
    const gcs = Array.from({ length: 6 }, () => card({ ...strong, gameChanger: true }));
    const armageddon = card({ ...strong, name: "Armageddon Test", oracleText: "Destroy all lands." });
    const turns = Array.from({ length: 4 }, () => card({ ...strong, oracleText: "Take an extra turn after this one." }));
    const filler = Array.from({ length: 90 }, () => card());
    const pool = [...gcs, armageddon, ...turns, ...filler];
    const names = (r: ReturnType<typeof buildDeck>) => new Set(r.cards.map((c) => c.name));

    const b3 = buildDeck({ commander, pool, targetBracket: 3, suggestUnowned: false });
    expect(gcs.filter((c) => names(b3).has(c.name))).toHaveLength(3);
    expect(names(b3).has("Armageddon Test")).toBe(false);
    expect(turns.filter((c) => names(b3).has(c.name))).toHaveLength(2);
    expect(b3.counts.total).toBe(99);
    expect(b3.warnings.some((w) => w.includes("to stay in Bracket 3"))).toBe(true);

    // A Game Changer commander uses one of the three.
    const gcCommander = buildDeck({ commander: { ...commander, gameChangers: 1 }, pool, targetBracket: 3, suggestUnowned: false });
    expect(gcs.filter((c) => names(gcCommander).has(c.name))).toHaveLength(2);

    const b2 = buildDeck({ commander, pool, targetBracket: 2, suggestUnowned: false });
    expect(gcs.some((c) => names(b2).has(c.name))).toBe(false);

    const b4 = buildDeck({ commander, pool, targetBracket: 4, suggestUnowned: false });
    expect(gcs.every((c) => names(b4).has(c.name))).toBe(true);
    expect(names(b4).has("Armageddon Test")).toBe(true);

    // Locked cards stay even when they break the target.
    const locked = buildDeck({ commander, pool, targetBracket: 2, suggestUnowned: false, locked: [{ oracleId: gcs[0].oracleId, quantity: 1, acquire: null }] });
    expect(names(locked).has(gcs[0].name)).toBe(true);
  });

  it("scores EDHREC synergy above raw popularity", () => {
    const synergy = card({ edhrec: { synergy: 0.5, inclusion: 0.4 }, edhrecRank: 3000 });
    const staple = card({ edhrec: { synergy: 0, inclusion: 0.2 }, edhrecRank: 5 });
    expect(scoreCandidate(synergy, true)).toBeGreaterThan(scoreCandidate(staple, true));
  });
});

describe("themes", () => {
  it("matches rules text", () => {
    const blood = { name: "Blood Artist", typeLine: "Creature — Vampire", oracleText: "Whenever Blood Artist or another creature dies, target player loses 1 life and you gain 1 life." };
    expect(themeScore(blood, "aristocrats")).toBe(1);
    expect(themeScore(blood, "artifacts")).toBe(0);
    expect(themeScore({ name: "x", typeLine: "Artifact", oracleText: "{T}: Add {C}." }, "artifacts")).toBeGreaterThan(0);
  });
  it("handles typal themes", () => {
    expect(typalType("dragons")).toBe("Dragon");
    expect(typalType("elves")).toBe("Elf");
    expect(typalType("aristocrats")).toBeUndefined();
    expect(themeScore({ name: "Shivan Dragon", typeLine: "Creature — Dragon", oracleText: "Flying" }, "dragons")).toBe(1);
    expect(themeLabel("plus-1-plus-1-counters")).toBe("+1/+1 Counters");
  });
});

describe("EDHREC parsing", () => {
  const fx = (f: string) => JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "edhrec", f), "utf8"));
  it("slugs", () => {
    expect(edhrecSlug("Korvold, Fae-Cursed King")).toBe("korvold-fae-cursed-king");
    expect(edhrecSlug("Atraxa, Praetors' Voice")).toBe("atraxa-praetors-voice");
    expect(edhrecSlug("Fable of the Mirror-Breaker // Reflection of Kiki-Jiki")).toBe("fable-of-the-mirror-breaker");
    expect(edhrecSlug("Jötun Grunt")).toBe("jotun-grunt");
    expect(commanderSlug("Thrasios, Triton Hero", "Tymna the Weaver")).toBe("thrasios-triton-hero-tymna-the-weaver");
    expect(commanderSlug("Tymna the Weaver", "Thrasios, Triton Hero")).toBe("thrasios-triton-hero-tymna-the-weaver");
  });
  it("commander page", () => {
    const p = parseCommanderPage(fx("commander-korvold.json"))!;
    expect(p.numDecks).toBeGreaterThan(1000);
    expect(p.themes.map((t) => t.slug)).toContain("aristocrats");
    const devil = p.cards.find((c) => c.name === "Mayhem Devil")!;
    expect(devil.synergy).toBeGreaterThan(0.3);
    expect(devil.inclusion).toBeGreaterThan(0.5);
    expect(devil.scryfallId).toMatch(/^[0-9a-f-]{36}$/);
  });
  it("tag page lists commanders", () => {
    const t = parseTagPage(fx("tag-aristocrats.json"))!;
    expect(t.commanders.map((c) => c.name)).toContain("Teysa Karlov");
    expect(t.cards.length).toBeGreaterThan(0);
  });
});
