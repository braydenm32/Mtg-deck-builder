import type { DeckView } from "./store";

type View = NonNullable<DeckView>;

/**
 * Plain decklists. "text" is the "1 Card Name" format Moxfield, Archidekt, MTGO and most apps
 * import, with the commander(s) in their own section. "missing" lists only cards you still need
 * (a shopping or proxy list). "pull" groups the cards you own by where they're stored.
 */
export function exportDeck(v: View, format: "text" | "missing" | "pull" = "text"): string {
  const main = v.cards.filter((c) => c.board === "main");
  if (format === "missing") {
    return main
      .filter((c) => c.state !== "placed")
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => `${c.quantity} ${c.name}${c.acquire === "proxy" ? " (proxy)" : ""}`)
      .join("\n");
  }
  if (format === "pull") {
    const byLoc = new Map<string, string[]>();
    for (const c of main) {
      if (c.state !== "placed" || c.basic) continue;
      const loc = c.location || "No location";
      const list = byLoc.get(loc) ?? [];
      list.push(`${c.quantity} ${c.name}${c.placedPrinting ? ` [${c.placedPrinting}${c.placedFinish && c.placedFinish !== "nonfoil" ? ` ${c.placedFinish}` : ""}]` : ""}`);
      byLoc.set(loc, list);
    }
    return [...byLoc.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([loc, list]) => `${loc}\n${list.sort().join("\n")}`)
      .join("\n\n");
  }
  const lines = ["Commander", ...v.commanders.map((c) => `1 ${c.name}`), "", "Deck"];
  for (const c of [...main].sort((a, b) => a.name.localeCompare(b.name))) lines.push(`${c.quantity} ${c.name}`);
  const maybe = v.cards.filter((c) => c.board === "maybe");
  if (maybe.length) lines.push("", "Maybeboard", ...maybe.map((c) => `${c.quantity} ${c.name}`));
  return lines.join("\n");
}
