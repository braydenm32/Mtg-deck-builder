import { cache } from "react";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { roleCounts, ROLE_TARGETS } from "@/lib/deck/roles";
import { getDeck } from "@/lib/deck/store";
import { isLand, isMdfcLand } from "@/lib/deck/text";

/** One getDeck per request, shared by the layout and the tab. */
export const loadDeck = cache(async (idParam: string) => {
  const id = Number.parseInt(idParam, 10);
  const v = Number.isFinite(id) ? await getDeck(await getDb(), id) : undefined;
  if (!v) notFound();
  return v;
});

export type LoadedDeck = Awaited<ReturnType<typeof loadDeck>>;
export type DeckRow = LoadedDeck["cards"][number];

/** The health line: lands, curve, the main roles against their targets, and Game Changers. */
export function deckHealth(v: LoadedDeck) {
  const main = v.cards.filter((c) => c.board === "main");
  const entries = main.map((c) => ({ card: c, quantity: c.quantity }));
  const lands = main.filter((c) => isLand(c)).reduce((n, c) => n + c.quantity, 0);
  const mdfc = main.filter((c) => isMdfcLand(c)).reduce((n, c) => n + c.quantity, 0);
  const spells = main.filter((c) => !isLand(c));
  const spellCount = spells.reduce((n, c) => n + c.quantity, 0);
  const avgMv = spellCount ? spells.reduce((n, c) => n + c.cmc * c.quantity, 0) / spellCount : 0;
  const roles = roleCounts(entries);
  const gameChangers = [...v.commanders.filter((c) => c.gameChanger).map((c) => c.name), ...main.filter((c) => c.gameChanger).map((c) => c.name)];
  const checks = (["land", "ramp", "draw", "removal", "wipe"] as const).map((r) => {
    const t = ROLE_TARGETS[r]!;
    const n = r === "land" ? lands : roles[r];
    return { role: r, count: n, target: t.target, low: n < t.min };
  });
  return { lands, mdfc, avgMv: Math.round(avgMv * 100) / 100, roles, checks, gameChangers };
}
