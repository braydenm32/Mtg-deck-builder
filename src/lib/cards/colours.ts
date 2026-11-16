/** Names for colour identities (shared by server pages and the colour picker). */

/** Guild, shard and wedge names for the common pairs and triples, so "BR" also reads "Rakdos". */
const NAMES: Record<string, string> = {
  WU: "Azorius", UB: "Dimir", BR: "Rakdos", RG: "Gruul", WG: "Selesnya",
  WB: "Orzhov", UR: "Izzet", BG: "Golgari", WR: "Boros", UG: "Simic",
  WUG: "Bant", WUB: "Esper", UBR: "Grixis", BRG: "Jund", WRG: "Naya",
  WBG: "Abzan", WUR: "Jeskai", UBG: "Sultai", WBR: "Mardu", URG: "Temur",
  W: "Mono-white", U: "Mono-blue", B: "Mono-black", R: "Mono-red", G: "Mono-green",
  WUBRG: "Five-colour", "": "Colourless",
};

export function colourName(identity: string | undefined): string {
  if (identity === undefined) return "Any colours";
  const named = NAMES[identity];
  return named ? (identity ? `${named} (${identity})` : named) : identity;
}
