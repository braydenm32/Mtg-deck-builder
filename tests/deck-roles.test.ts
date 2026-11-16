import { describe, expect, it } from "vitest";
import { cardRoles, roleCounts, type Role } from "@/lib/deck/roles";
import { isBasicLand, isLand, isMdfcLand, pipCounts, rulesText } from "@/lib/deck/text";
import { card, entries } from "./deck-fixtures";

const cases: Record<Role | "none", string[]> = {
  land: ["Forest", "Command Tower", "Strip Mine", "Dryad Arbor", "Bojuka Bog", "Gaea's Cradle", "Evolving Wilds"],
  ramp: [
    "Sol Ring", "Arcane Signet", "Llanowar Elves", "Birds of Paradise", "Sakura-Tribe Elder", "Cultivate", "Farseek",
    "Nature's Lore", "Three Visits", "Rampant Growth", "Wood Elves", "Dark Ritual", "Exploration", "Burgeoning",
    "Smothering Tithe", "Talisman of Dominance", "Grim Monolith", "Mana Vault", "Fellwar Stone", "Dockside Extortionist",
  ],
  draw: [
    "Rhystic Study", "Mystic Remora", "Phyrexian Arena", "Harmonize", "Night's Whisper", "Sign in Blood", "Brainstorm",
    "Skullclamp", "Guardian Project", "Beast Whisperer", "Esper Sentinel", "Consecrated Sphinx", "Tireless Tracker",
    "The One Ring", "Necropotence", "Sylvan Library", "Howling Mine", "Light Up the Stage", "Toothy, Imaginary Friend",
    "Korvold, Fae-Cursed King", "Treasure Cruise",
  ],
  removal: [
    "Swords to Plowshares", "Path to Exile", "Beast Within", "Chaos Warp", "Generous Gift", "Lightning Bolt", "Fire // Ice",
    "Anguished Unmaking", "Assassin's Trophy", "Vindicate", "Nature's Claim", "Feed the Swarm", "Infernal Grasp",
    "Go for the Throat", "Pongify", "Rapid Hybridization", "Reality Shift", "Dismember", "Ravenous Chupacabra",
    "Vraska, Golgari Queen", "Cyclonic Rift", "Chain Lightning", "Diabolic Edict", "Grist, the Hunger Tide",
    "Shatterskull Smashing",
  ],
  wipe: [
    "Wrath of God", "Damnation", "Toxic Deluge", "Blasphemous Act", "Austere Command", "Farewell", "Evacuation",
    "Vanquish the Horde", "Pernicious Deed", "Massacre Wurm", "Merciless Eviction", "Aetherize", "Cyclonic Rift", "Living Death",
  ],
  tutor: [
    "Demonic Tutor", "Vampiric Tutor", "Enlightened Tutor", "Mystical Tutor", "Worldly Tutor", "Diabolic Intent", "Gamble",
    "Survival of the Fittest", "Natural Order", "Finale of Devastation", "Green Sun's Zenith", "Dimir Machinations",
    "Imperial Seal", "Demonic Consultation",
  ],
  counter: [
    "Counterspell", "Arcane Denial", "Swan Song", "Force of Will", "Negate", "Stifle", "Mana Drain",
    "An Offer You Can't Refuse", "Fierce Guardianship",
  ],
  protection: [
    "Heroic Intervention", "Teferi's Protection", "Lightning Greaves", "Swiftfoot Boots", "Boros Charm", "Flawless Maneuver",
    "Deflecting Swat", "Tamiyo's Safekeeping", "Mother of Runes",
  ],
  recursion: [
    "Eternal Witness", "Regrowth", "Reanimate", "Animate Dead", "Living Death", "Sevinne's Reclamation", "Underworld Breach",
    "Meren of Clan Nel Toth", "Sun Titan", "Lurrus of the Dream-Den", "Agadeem's Awakening", "Bala Ged Recovery",
  ],
  none: [
    "Grizzly Bears", "Viscera Seer", "Blood Artist", "Zulaport Cutthroat", "Doubling Season", "Hardened Scales",
    "Craterhoof Behemoth", "Atraxa, Praetors' Voice", "Thassa's Oracle", "Time Warp", "Armageddon", "Isochron Scepter",
    "Dramatic Reversal", "Relentless Rats", "Zealous Conscripts", "Kiki-Jiki, Mirror Breaker", "Yorion, Sky Nomad",
  ],
};

describe("cardRoles", () => {
  for (const [role, names] of Object.entries(cases)) {
    describe(role, () => {
      it.each(names)("%s", (name) => {
        const roles = cardRoles(card(name));
        if (role === "none") expect(roles).toEqual([]);
        else expect(roles).toContain(role);
      });
    });
  }

  it("lands that tap for mana are lands, not ramp", () => {
    for (const n of ["Forest", "Command Tower", "Ancient Tomb", "Gaea's Cradle"]) expect(cardRoles(card(n))).toEqual(["land"]);
  });

  it("a one-shot cantrip on a spell with another job is not card draw", () => {
    expect(cardRoles(card("Fire // Ice"))).toEqual(["removal"]);
    expect(cardRoles(card("Arcane Denial"))).toEqual(["counter"]);
  });

  it("loots and self-recursion don't count", () => {
    expect(cardRoles(card("Faithless Looting"))).not.toContain("draw");
    expect(cardRoles(card("Gravecrawler"))).not.toContain("recursion");
    expect(cardRoles(card("Bloodghast"))).not.toContain("recursion");
  });

  it("triggers on opponents' draws and opponents' Treasure aren't draw or ramp", () => {
    expect(cardRoles(card("Smothering Tithe"))).toEqual(["ramp"]);
    expect(cardRoles(card("An Offer You Can't Refuse"))).toEqual(["counter"]);
  });

  it("an MDFC is judged by its spell face, not its land back", () => {
    expect(cardRoles(card("Shatterskull Smashing"))).toEqual(["removal"]);
    expect(cardRoles(card("Agadeem's Awakening"))).toEqual(["recursion"]);
  });

  it("land searches are ramp, not tutors; card searches are tutors", () => {
    expect(cardRoles(card("Cultivate"))).toEqual(["ramp"]);
    expect(cardRoles(card("Demonic Tutor"))).toEqual(["tutor"]);
    expect(cardRoles(card("Natural Order"))).toContain("tutor");
  });

  it("flicker and removal on your own stuff aren't removal", () => {
    expect(cardRoles(card("Ephemerate"))).not.toContain("removal");
    expect(cardRoles(card("Zealous Conscripts"))).not.toContain("removal");
  });

  it("counts roles across a list", () => {
    const counts = roleCounts(entries({ Forest: 10, "Sol Ring": 1, Cultivate: 1, "Swords to Plowshares": 1, "Cyclonic Rift": 1 }));
    expect(counts).toMatchObject({ land: 10, ramp: 2, removal: 2, wipe: 1, draw: 0 });
  });
});

describe("text helpers", () => {
  it("land kinds", () => {
    expect(isLand(card("Dryad Arbor"))).toBe(true);
    expect(isLand(card("Shatterskull Smashing"))).toBe(false);
    expect(isMdfcLand(card("Shatterskull Smashing"))).toBe(true);
    expect(isMdfcLand(card("Fable of the Mirror-Breaker"))).toBe(false);
    expect(isBasicLand(card("Snow-Covered Island"))).toBe(true);
    expect(isBasicLand(card("Wastes"))).toBe(true);
    expect(isBasicLand(card("Command Tower"))).toBe(false);
  });

  it("rules text drops reminder text and the card's own name", () => {
    expect(rulesText(card("Blasphemous Act"))).toContain("this card deals 13 damage to each creature");
    expect(rulesText(card("Swiftfoot Boots"))).not.toContain("can't be the target");
    expect(rulesText(card("Korvold, Fae-Cursed King"))).toContain("whenever this card enters or attacks");
  });

  it("pip counts", () => {
    expect(pipCounts("{2}{W}{W}")).toEqual({ W: 2, U: 0, B: 0, R: 0, G: 0 });
    expect(pipCounts("{G/U}{G/U}")).toEqual({ W: 0, U: 1, B: 0, R: 0, G: 1 });
    expect(pipCounts("{B/P}")).toEqual({ W: 0, U: 0, B: 1, R: 0, G: 0 });
    expect(pipCounts("{X}{R}")).toMatchObject({ R: 1 });
    expect(pipCounts(null)).toEqual({ W: 0, U: 0, B: 0, R: 0, G: 0 });
  });

describe("roles you set", () => {
  it("replace the automatic roles, and a land stays a land", () => {
    expect(cardRoles(card("Sol Ring"))).toContain("ramp");
    expect(cardRoles({ ...card("Sol Ring"), roleOverride: ["draw"] })).toEqual(["draw"]);
    expect(cardRoles({ ...card("Sol Ring"), roleOverride: [] })).toEqual([]);
    expect(cardRoles({ ...card("Sol Ring"), roleOverride: null })).toContain("ramp");
    expect(cardRoles({ ...card("Command Tower"), roleOverride: ["ramp"] })).toEqual(["land", "ramp"]);
  });
});
});
