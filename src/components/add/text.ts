/** Small wording helpers for the Add cards pages. Presentation only: no counting happens here. */

/** "1 copy", "3 copies". */
export function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString("en-AU")} ${n === 1 ? one : many}`;
}

/**
 * A shorter search to offer when a name finds nothing, usually a typo near the end:
 * "Arcane Signett" → "Arcane", "Signett" → "Signe". Undefined when there's nothing shorter worth trying.
 */
export function shorterQuery(query: string): string | undefined {
  const q = query.trim().replace(/\s+/g, " ");
  if (q.length < 3) return undefined;
  const words = q.split(" ");
  if (words.length > 1) {
    const rest = words.slice(0, -1).join(" ").replace(/[\s,;:'’-]+$/, "");
    return rest.length >= 2 ? rest : undefined;
  }
  const keep = Math.max(2, Math.ceil(q.length * 0.6));
  return keep < q.length ? q.slice(0, keep) : undefined;
}

const SPREADSHEET = /\.(xlsx|xlsm|xls|numbers|ods)$/i;
const NOT_A_LIST = /\.(pdf|json|zip|jpe?g|png|heic|webp|docx?)$/i;

/** Why a chosen file can't be read as a card list, before sending it anywhere. Undefined when it's worth trying. */
export function unsupportedFile(name: string): string | undefined {
  if (SPREADSHEET.test(name)) return `“${name}” is a spreadsheet file. Save or export it as CSV, then choose the .csv file.`;
  if (NOT_A_LIST.test(name)) return `“${name}” isn't a CSV or text file. Export your collection as CSV, or paste the list instead.`;
  return undefined;
}

/** Capitalise the first letter: "your pasted cards" → "Your pasted cards". */
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "your Mythic Tools cards", or a readable stand-in for the catch-all sources. */
export function cardsFrom(label: string): string {
  if (label === "Other CSV") return "your cards from other CSV files";
  if (label === "Card list") return "your pasted cards";
  return `your ${label} cards`;
}

/** What an import did, in words, from the batch's stored mode. */
export function importModeLabel(mode: string, label: string): string {
  if (mode === "update" || mode === "replace-source") return `Updated ${cardsFrom(label)}`;
  if (mode === "replace") return "Replaced your collection";
  return "Added to your collection";
}
