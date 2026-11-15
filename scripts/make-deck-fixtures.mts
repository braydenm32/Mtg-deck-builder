/**
 * Refresh the deck-logic fixture (real oracle text for role, validation, stats and bracket tests):
 *   NODE_USE_ENV_PROXY=1 npx tsx scripts/make-deck-fixtures.mts
 * Keeps only the fields the deck modules read, so the file stays small and diffs stay readable.
 */
import fs from "node:fs";
import { fetchCollection, type ScryfallCard } from "@/lib/scryfall/client";

export const DECK_FIXTURE_NAMES = [
  // Lands and fixing
  "Plains", "Island", "Swamp", "Mountain", "Forest", "Wastes", "Command Tower", "Exotic Orchard", "Reliquary Tower",
  "Bojuka Bog", "Strip Mine", "Ancient Tomb", "Gaea's Cradle", "Overgrown Tomb", "Evolving Wilds", "Path of Ancestry",
  "Shatterskull Smashing", "Agadeem's Awakening", "Bala Ged Recovery", "Snow-Covered Island", "Dryad Arbor",
  // Ramp
  "Sol Ring", "Arcane Signet", "Mind Stone", "Fellwar Stone", "Talisman of Dominance", "Llanowar Elves", "Birds of Paradise",
  "Sakura-Tribe Elder", "Cultivate", "Kodama's Reach", "Rampant Growth", "Farseek", "Nature's Lore", "Three Visits",
  "Smothering Tithe", "Dark Ritual", "Burgeoning", "Exploration", "Wood Elves", "Mana Vault", "Grim Monolith", "Jeska's Will",
  "Dockside Extortionist", "Mana Crypt", "Jeweled Lotus", "Treasure Cruise",
  // Draw
  "Rhystic Study", "Mystic Remora", "Phyrexian Arena", "Harmonize", "Night's Whisper", "Sign in Blood", "Brainstorm",
  "Ponder", "Faithless Looting", "Skullclamp", "Guardian Project", "Beast Whisperer", "Esper Sentinel", "Consecrated Sphinx",
  "Jeska's Will", "Light Up the Stage", "Tireless Tracker", "The One Ring", "Necropotence", "Sylvan Library", "Howling Mine",
  // Removal
  "Swords to Plowshares", "Path to Exile", "Beast Within", "Chaos Warp", "Generous Gift", "Lightning Bolt", "Fire",
  "Anguished Unmaking", "Assassin's Trophy", "Vindicate", "Nature's Claim", "Feed the Swarm", "Infernal Grasp", "Go for the Throat",
  "Pongify", "Rapid Hybridization", "Reality Shift", "Dismember", "Ravenous Chupacabra", "Vraska, Golgari Queen", "Cyclonic Rift",
  "Chain Lightning", "Diabolic Edict", "Fierce Guardianship",
  // Wipes
  "Wrath of God", "Damnation", "Toxic Deluge", "Blasphemous Act", "Austere Command", "Farewell", "Evacuation", "Vanquish the Horde",
  "Pernicious Deed", "Massacre Wurm", "Merciless Eviction", "Aetherize",
  // Tutors
  "Demonic Tutor", "Vampiric Tutor", "Enlightened Tutor", "Mystical Tutor", "Worldly Tutor", "Diabolic Intent", "Gamble",
  "Survival of the Fittest", "Natural Order", "Finale of Devastation", "Green Sun's Zenith", "Dimir Machinations", "Imperial Seal",
  // Counters
  "Counterspell", "Arcane Denial", "Swan Song", "Force of Will", "Negate", "Stifle", "Mana Drain", "An Offer You Can't Refuse",
  // Protection
  "Heroic Intervention", "Teferi's Protection", "Lightning Greaves", "Swiftfoot Boots", "Boros Charm", "Flawless Maneuver",
  "Deflecting Swat", "Tamiyo's Safekeeping", "Mother of Runes", "Ephemerate",
  // Recursion
  "Eternal Witness", "Regrowth", "Reanimate", "Animate Dead", "Living Death", "Sevinne's Reclamation", "Underworld Breach",
  "Gravecrawler", "Bloodghast", "Meren of Clan Nel Toth", "Sun Titan",
  // Commanders and pairs
  "Atraxa, Praetors' Voice", "Korvold, Fae-Cursed King", "Thrasios, Triton Hero", "Tymna the Weaver", "Pir, Imaginative Rascal",
  "Toothy, Imaginary Friend", "Karlach, Fury of Avernus", "Raised by Giants", "The Fourteenth Doctor", "Clara Oswald",
  "Grist, the Hunger Tide", "Teferi, Temporal Archmage", "Sol Ring", "Kenrith, the Returned King", "Wilson, Refined Grizzly",
  "Lurrus of the Dream-Den", "Yorion, Sky Nomad", "Golos, Tireless Pilgrim", "Kraum, Ludevic's Opus",
  "Rograkh, Son of Rohgahh", "Ich-Tekik, Salvage Splicer",
  // Any-number and banned
  "Relentless Rats", "Shadowborn Apostle", "Seven Dwarves", "Nazgûl", "Persistent Petitioners", "Dragon's Approach",
  "Black Lotus", "Primeval Titan", "Hullbreacher", "Emrakul, the Aeons Torn", "Flash", "Iona, Shield of Emeria",
  "Biorhythm", "Lutri, the Spellchaser",
  // Mass land denial, extra turns, combo pieces
  "Armageddon", "Ravages of War", "Jokulhaups", "Obliterate", "Winter Orb", "Blood Moon", "Back to Basics", "Sunder", "Ruination",
  "Time Warp", "Temporal Manipulation", "Nexus of Fate", "Expropriate", "Time Stretch", "Seedborn Muse",
  "Thassa's Oracle", "Demonic Consultation", "Tainted Pact", "Dramatic Reversal", "Isochron Scepter", "Exquisite Blood",
  "Sanguine Bond", "Kiki-Jiki, Mirror Breaker", "Zealous Conscripts", "Heliod, Sun-Crowned", "Walking Ballista",
  "Niv-Mizzet, Parun", "Curiosity", "Basalt Monolith", "Rings of Brighthearth", "Food Chain", "Squee, the Immortal",
  // Plain creatures and theme cards
  "Viscera Seer", "Grizzly Bears", "Llanowar Visionary", "Blood Artist", "Zulaport Cutthroat", "Doubling Season",
  "Hardened Scales", "Craterhoof Behemoth", "Avenger of Zendikar", "Fable of the Mirror-Breaker", "Jötun Grunt",
];

const unique = [...new Set(DECK_FIXTURE_NAMES)];
const { data, notFound } = await fetchCollection(unique.map((name) => ({ name })));
if (notFound.length) console.warn("not found", notFound);

const keep = (c: ScryfallCard) => ({
  object: c.object,
  id: c.id,
  oracle_id: c.oracle_id,
  name: c.name,
  lang: c.lang,
  layout: c.layout,
  set: c.set,
  set_name: c.set_name,
  collector_number: c.collector_number,
  rarity: c.rarity,
  mana_cost: c.mana_cost,
  cmc: c.cmc,
  type_line: c.type_line,
  oracle_text: c.oracle_text,
  colors: c.colors,
  color_identity: c.color_identity,
  keywords: c.keywords,
  legalities: { commander: c.legalities.commander },
  edhrec_rank: c.edhrec_rank,
  game_changer: c.game_changer,
  produced_mana: (c as { produced_mana?: string[] }).produced_mana,
  card_faces: c.card_faces?.map((f) => ({
    name: f.name,
    mana_cost: f.mana_cost,
    type_line: f.type_line,
    oracle_text: f.oracle_text,
    oracle_id: f.oracle_id,
    colors: (f as { colors?: string[] }).colors,
  })),
  prices: c.prices,
});

data.sort((a, b) => a.name.localeCompare(b.name));
fs.writeFileSync("tests/fixtures/deck-cards.json", JSON.stringify(data.map(keep), null, 1));
console.log(`wrote ${data.length} cards`);
