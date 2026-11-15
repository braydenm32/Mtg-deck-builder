/** Refresh the small Scryfall fixture used by tests: npx tsx scripts/make-fixtures.ts */
import fs from "node:fs";
import { fetchCollection, scryfallFetch, type ScryfallCard } from "@/lib/scryfall/client";

const { data, notFound } = await fetchCollection([
  { name: "Sol Ring", set: "c21" },
  { name: "Atraxa, Praetors' Voice" },
  { name: "Fable of the Mirror-Breaker" },
  { name: "Fire" },
  { name: "Sakura-Tribe Elder" },
  { name: "Korvold, Fae-Cursed King" },
  { name: "Lightning Bolt", set: "m10" },
  { name: "Jötun Grunt" },
  { name: "Grist, the Hunger Tide" },
  { name: "Viscera Seer" },
]);
if (notFound.length) console.warn("not found", notFound);
const jp = await scryfallFetch<ScryfallCard>("/cards/war/1/ja"); // non-English printing, not in default_cards
fs.mkdirSync("tests/fixtures", { recursive: true });
fs.writeFileSync("tests/fixtures/scryfall-cards.json", JSON.stringify(data, null, 1));
fs.writeFileSync("tests/fixtures/scryfall-ja.json", JSON.stringify(jp, null, 1));
console.log(data.map((c) => `${c.name} ${c.set} ${c.collector_number} ${c.id}`).join("\n"), "\n", jp.name, jp.lang, jp.id);
