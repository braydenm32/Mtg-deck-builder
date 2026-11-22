import type { LoadedDeck } from "@/app/decks/[id]/data";
import type { DeckAnalysis } from "./analysis";
import { saltLabel, type SaltyCard } from "@/lib/edhrec/salt";
import { BRACKETS, type Bracket } from "./bracket";

/**
 * The "Rule 0" talk before a game, as one card: what the deck is, its bracket, and the things a pod
 * asks about (Game Changers, combos, extra turns, land destruction, tutors, proxies). The same lines
 * go to the clipboard as text, so it can be pasted into a group chat.
 */
export type Rule0 = { title: string; lines: { label: string; value: string }[]; text: string };

const none = (xs: string[]) => (xs.length ? xs.join(", ") : "None");

export function rule0Summary(v: Pick<LoadedDeck, "deck" | "commanders" | "cards">, a: Pick<DeckAnalysis, "bracket" | "stats" | "combos">, target: number, salty: SaltyCard[] = []): Rule0 {
  const b = a.bracket;
  const main = v.cards.filter((c) => c.board === "main");
  const plus = b.bracket < 5 && b.reasons.length ? "+" : "";
  const combos = a.combos.map((c) => c.cards.join(" + "));
  const wincons = main.filter((c) => c.tags.some((t) => /win/i.test(t))).map((c) => c.name);
  // Planned proxies and the proxy copies placed in the deck.
  const proxies = main.filter((c) => c.acquire === "proxy" || c.placedProxy).reduce((n, c) => n + c.quantity, 0);
  const tutors = a.stats.roles.tutor ?? 0;

  const lines: Rule0["lines"] = [
    { label: v.commanders.length > 1 ? "Commanders" : "Commander", value: v.commanders.map((c) => c.name).join(" + ") || "None yet" },
    { label: "Bracket", value: `${b.bracket}${plus} (${b.name}), estimated from the cards. Built for ${target} (${BRACKETS[target as Bracket]?.name ?? ""}).` },
    { label: "Game Changers", value: none(a.stats.gameChangers) },
    { label: "Combos", value: none(combos) },
    { label: "Extra turns", value: none(b.extraTurns) },
    { label: "Land destruction", value: none(b.massLandDenial) },
    { label: "Tutors", value: tutors ? String(tutors) : "None" },
  ];
  // EDHREC's 100 saltiest cards (0 to 4) that the deck plays: the ones a pod most wants warning of.
  if (salty.length) lines.push({ label: "Salty cards", value: salty.map((c) => `${c.name} (${saltLabel(c.salt)})`).join(", ") });
  if (wincons.length) lines.push({ label: "Wins with", value: wincons.join(", ") });
  lines.push({ label: "Proxies", value: proxies ? String(proxies) : "None" });

  const title = v.deck.name;
  const text = [`Rule 0: ${title}`, ...lines.map((l) => `${l.label}: ${l.value}`)].join("\n");
  return { title, lines, text };
}
