/**
 * Measure src/lib/deck/roles.ts against Scryfall Tagger function tags on the most-played Commander cards.
 *   NODE_USE_ENV_PROXY=1 npx tsx scripts/eval-roles.mts [topN=1000] [--misses]
 * Tagger tags are community-made and broader than a deck checklist (e.g. otag:removal includes
 * counterspells and land destruction), so treat this as a guide for tuning, not ground truth.
 */
import { toCardRow } from "@/lib/cards/rows";
import { scryfallFetch, type ScryfallCard } from "@/lib/scryfall/client";
import { cardRoles, type Role } from "@/lib/deck/roles";
import type { DeckCardInput } from "@/lib/deck/types";

const topN = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 1000);
const showMisses = process.argv.includes("--misses");

type Page = { data: ScryfallCard[]; has_more: boolean; next_page?: string };

async function search(q: string, stopAfterRank: number): Promise<ScryfallCard[]> {
  const out: ScryfallCard[] = [];
  let url: string | undefined = `/cards/search?order=edhrec&q=${encodeURIComponent(q)}`;
  while (url) {
    const page: Page = await scryfallFetch<Page>(url);
    out.push(...page.data);
    const last = page.data.at(-1)?.edhrec_rank ?? Infinity;
    if (!page.has_more || last > stopAfterRank) break;
    url = page.next_page?.replace("https://api.scryfall.com", "");
  }
  return out;
}

const toInput = (c: ScryfallCard): DeckCardInput => {
  const r = toCardRow(c, new Date().toISOString())!;
  return { ...r, manaCost: r.manaCost ?? null, cmc: r.cmc ?? 0, typeLine: r.typeLine ?? "", oracleText: r.oracleText ?? "", colorIdentity: r.colorIdentity ?? "" } as DeckCardInput;
};

const top: ScryfallCard[] = [];
{
  let url: string | undefined = `/cards/search?order=edhrec&q=${encodeURIComponent("f:commander -t:basic")}`;
  while (url && top.length < topN) {
    const page: Page = await scryfallFetch<Page>(url);
    top.push(...page.data);
    url = page.has_more ? page.next_page?.replace("https://api.scryfall.com", "") : undefined;
  }
  top.length = Math.min(top.length, topN);
}
const maxRank = Math.max(...top.map((c) => c.edhrec_rank ?? 0));
const names = new Set(top.map((c) => c.name));
const ours = new Map(top.map((c) => [c.name, cardRoles(toInput(c))]));

const TAGS: [Role, string][] = [
  ["ramp", "otag:ramp"],
  ["draw", "otag:draw"],
  ["removal", "otag:removal -otag:counterspell -otag:sweeper"],
  ["wipe", "otag:sweeper"],
  ["tutor", "otag:tutor -otag:tutor-land"],
  ["counter", "otag:counterspell"],
  ["protection", "otag:gives-protection or otag:phasing or otag:gives-hexproof or otag:gives-indestructible or otag:gives-shroud"],
  ["recursion", "otag:recursion -otag:self-recursion"],
];

console.log(`top ${top.length} Commander cards by EDHREC rank (rank <= ${maxRank})\n`);
console.log("role        tagged  ours  both  precision  recall");
for (const [role, q] of TAGS) {
  const tagged = new Set((await search(`(${q}) f:commander`, maxRank)).map((c) => c.name).filter((n) => names.has(n)));
  const mine = new Set([...ours].filter(([, r]) => r.includes(role)).map(([n]) => n));
  const both = [...mine].filter((n) => tagged.has(n));
  const p = mine.size ? both.length / mine.size : 1;
  const r = tagged.size ? both.length / tagged.size : 1;
  console.log(`${role.padEnd(11)} ${String(tagged.size).padStart(6)} ${String(mine.size).padStart(5)} ${String(both.length).padStart(5)}  ${(p * 100).toFixed(0).padStart(8)}%  ${(r * 100).toFixed(0).padStart(5)}%`);
  if (showMisses) {
    console.log("   only ours:   ", [...mine].filter((n) => !tagged.has(n)).join("; "));
    console.log("   only tagger: ", [...tagged].filter((n) => !mine.has(n)).join("; "));
  }
}
