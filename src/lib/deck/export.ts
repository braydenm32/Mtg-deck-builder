import { exportDecklist, type ExportFormat, type ExportLine } from "./decklist";
import type { DeckView } from "./store";

type View = NonNullable<DeckView>;

export const EXPORT_FORMATS = ["text", "moxfield", "archidekt", "arena", "mtgo", "missing", "pull"] as const;
export type DeckExportFormat = (typeof EXPORT_FORMATS)[number];

/** Decklist lines, with the set, number and finish of the copy you own where we know it. */
function lines(v: View): ExportLine[] {
  const out: ExportLine[] = v.commanders.map((c) => ({ name: c.name, quantity: 1, board: "commander", layout: c.layout }));
  for (const c of v.cards) {
    if (c.board !== "main" && c.board !== "maybe") continue;
    out.push({
      name: c.name,
      quantity: c.quantity,
      board: c.board,
      layout: c.layout,
      setCode: c.placedSet ?? undefined,
      collectorNumber: c.placedNumber ?? undefined,
      finish: (c.placedFinish as ExportLine["finish"]) ?? undefined,
      category: c.role === "land" ? "Land" : c.role.charAt(0).toUpperCase() + c.role.slice(1),
    });
  }
  return out;
}

/**
 * Plain decklists. "text" is the "1 Card Name" format Moxfield, Archidekt, MTGO and most apps
 * import, with the commander(s) in their own section. "missing" lists only cards you still need
 * (a shopping or proxy list). "pull" groups the cards you own by where they're stored.
 */
export function exportDeck(v: View, format: DeckExportFormat = "text"): string {
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
  return exportDecklist(lines(v), format as ExportFormat);
}
