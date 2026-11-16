const WUBRG = ["W", "U", "B", "R", "G"] as const;

/**
 * Normalise a card name for matching: strip accents, lowercase, unify apostrophes,
 * drop punctuation and collapse spaces. "Jötun Grunt" -> "jotun grunt",
 * "Fire // Ice" -> "fire ice", "Ach! Hans, Run!" -> "ach hans run".
 */
export function normName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/'/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Front face of a multi-face name: "Fable of the Mirror-Breaker // Reflection of Kiki-Jiki" -> "Fable of the Mirror-Breaker". */
export function frontFace(name: string): string {
  const i = name.indexOf(" // ");
  return i === -1 ? name : name.slice(0, i);
}

/** Colour letters in WUBRG order, e.g. ["G","B"] -> "BG". */
export function colorString(colors: readonly string[] | undefined | null): string {
  if (!colors) return "";
  const set = new Set(colors.map((c) => c.toUpperCase()));
  return WUBRG.filter((c) => set.has(c)).join("");
}

/**
 * A colour choice from a URL or form ("br", "RB", "wubrg", "C" for colourless) as a canonical WUBRG
 * identity. "" means colourless; undefined means no choice (any colours).
 */
export function parseColors(input: string | null | undefined): string | undefined {
  const s = input?.trim().toUpperCase();
  if (!s) return undefined;
  if (s === "C") return "";
  const letters = [...s].filter((c) => (WUBRG as readonly string[]).includes(c));
  return letters.length ? colorString(letters) : undefined;
}

/** The URL form of a colour choice: "BR", or "C" for colourless. */
export const colorsParam = (identity: string) => identity || "C";

/** Is identity `inner` within `outer`? Both are WUBRG strings. Colourless ("") fits anything. */
export function identityWithin(inner: string, outer: string): boolean {
  for (const c of inner) if (!outer.includes(c)) return false;
  return true;
}

/** Scryfall set codes are lowercase; exports vary. Promo/list codes keep their letters. */
export function normSetCode(code: string | undefined | null): string | undefined {
  const c = code?.trim().toLowerCase();
  return c ? c : undefined;
}

/** Collector numbers: trim, drop leading zeros on the numeric part ("007" -> "7", "012a" -> "12a"), keep suffixes like "★". */
export function normCollectorNumber(num: string | undefined | null): string | undefined {
  const n = num?.trim();
  if (!n) return undefined;
  return n.replace(/^0+(?=\d)/, "").toLowerCase();
}
