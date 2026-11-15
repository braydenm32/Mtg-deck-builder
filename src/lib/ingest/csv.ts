import Papa from "papaparse";
import {
  normFinish,
  normLang,
  parsePrice,
  parseQuantity,
  truthy,
  type CardEntry,
  type Finish,
} from "@/lib/cards/identity";

/**
 * Collection CSV import. We read the header row, work out which app made the file,
 * and map each row to a CardEntry. Unknown layouts still work if the columns have
 * recognisable names ("Name", "Quantity", "Set", ...).
 */

export type CsvSource =
  | "mythic-tools"
  | "manabox"
  | "moxfield"
  | "archidekt"
  | "deckbox"
  | "tcgplayer-app"
  | "tcgplayer-inventory"
  | "delver-lens"
  | "dragon-shield"
  | "generic";

export const SOURCE_LABELS: Record<CsvSource, string> = {
  "mythic-tools": "Mythic Tools",
  manabox: "ManaBox",
  moxfield: "Moxfield",
  archidekt: "Archidekt",
  deckbox: "Deckbox",
  "tcgplayer-app": "TCGplayer app",
  "tcgplayer-inventory": "TCGplayer seller inventory",
  "delver-lens": "Delver Lens",
  "dragon-shield": "Dragon Shield",
  generic: "Other CSV",
};

const key = (h: string) => h.trim().toLowerCase().replace(/\s+/g, " ");

/** Which app made this file? Checked most-specific first. */
export function detectSource(headers: string[]): CsvSource {
  const h = new Set(headers.map(key));
  const has = (...names: string[]) => names.every((n) => h.has(n));
  const any = (...names: string[]) => names.some((n) => h.has(n));

  if (has("manabox id")) return "manabox";
  if (any("container type", "container name") || (has("scryfall id", "finish") && any("english name", "card name") && has("set code"))) {
    return "mythic-tools";
  }
  if (has("tcgplayer id", "product name")) return "tcgplayer-inventory";
  if (any("simple name") || (has("product id") && has("printing"))) return "tcgplayer-app";
  if (any("quantityx", "collector's number", "edition code") && !has("tradelist count") && !has("edition name")) {
    return "delver-lens";
  }
  if (has("tradelist count") && any("card number", "edition code", "my price")) return "deckbox";
  if (has("tradelist count") || (has("count", "edition") && any("alter", "proxy", "last modified"))) return "moxfield";
  if (any("edition name") || (has("finish") && any("edition code", "scryfall id") && any("date added", "multiverse id"))) {
    return "archidekt";
  }
  if (any("folder name", "card number") && any("printing", "set code")) return "dragon-shield";
  return "generic";
}

/** Header aliases per field, in priority order. */
const FIELDS = {
  quantity: ["quantity", "count", "qty", "quantityx", "total quantity", "amount", "number of copies"],
  // English name first: Mythic Tools' "Card Name" can be in the printed language.
  name: ["english name", "simple name", "name", "card name", "card", "product name", "cardname"],
  scryfallId: ["scryfall id", "scryfall_id", "scryfallid", "scryfall uuid"],
  setCode: ["set code", "edition code", "setcode", "set_code", "set id"],
  /** Columns that hold a set code in some apps and a set name in others. */
  setAmbiguous: ["edition", "set"],
  setName: ["set name", "edition name", "expansion"],
  collectorNumber: ["collector number", "collector's number", "card number", "collector_number", "number", "cn", "nr"],
  lang: ["language", "lang"],
  finish: ["finish", "foil", "printing", "foil/etched", "is_foil", "foiling"],
  condition: ["condition"],
  location: ["container name", "binder name", "folder name", "location", "binder", "deck"],
  altered: ["altered", "alter", "altered art", "is_altered"],
  signed: ["signed", "is_signed"],
  misprint: ["misprint"],
  proxy: ["proxy"],
  purchasePrice: ["purchase price", "purchase price (usd)", "my price", "price bought", "purchase_price", "acquired price"],
  tcgplayerId: ["tcgplayer id", "tcgplayer product id", "product id", "tcgplayer_id"],
} as const;

type Field = keyof typeof FIELDS;

/** For each field, the actual header (original spelling) that supplies it. */
export type ColumnMap = Partial<Record<Field, string>>;

export function mapColumns(headers: string[], source: CsvSource): ColumnMap {
  const byKey = new Map(headers.map((h) => [key(h), h]));
  const map: ColumnMap = {};
  for (const field of Object.keys(FIELDS) as Field[]) {
    for (const alias of FIELDS[field]) {
      const h = byKey.get(alias);
      if (h) {
        map[field] = h;
        break;
      }
    }
  }
  // App quirks.
  if (source === "tcgplayer-app" && byKey.has("set")) {
    map.setName = byKey.get("set"); // "Set" is the set's name; "Set Code" is the code
    delete map.setAmbiguous;
  }
  if (source === "deckbox" && byKey.has("edition")) {
    map.setName = byKey.get("edition"); // Deckbox "Edition" is the full set name
    delete map.setAmbiguous;
  }
  if (source === "tcgplayer-inventory") {
    map.collectorNumber = byKey.get("number") ?? map.collectorNumber;
    map.quantity = byKey.get("total quantity") ?? map.quantity;
    map.name = byKey.get("product name") ?? map.name;
    map.tcgplayerId = byKey.get("tcgplayer id") ?? map.tcgplayerId;
  }
  if (source === "mythic-tools" && map.location && byKey.has("container type")) {
    // keep Container Name as the location ("bulk", "Trade binder")
  }
  return map;
}

/** TCGplayer finish/printing values look like "Foil", "Normal", "Etched Foil". Others use true/false or "foil". */
function finishOf(raw: string | undefined, foilColumnIsBoolean: boolean): Finish {
  if (!raw) return "nonfoil";
  if (foilColumnIsBoolean) return truthy(raw) ? (/etched/i.test(raw) ? "etched" : "foil") : "nonfoil";
  return normFinish(raw);
}

const isCode = (v: string) => /^[a-z0-9]{2,6}$/i.test(v.trim());

/** TCGplayer and others put variants in the name: "Sol Ring (Borderless)", "Lightning Bolt - Foil". */
function cleanName(name: string): string {
  return name
    .replace(/\s*\((?:borderless|showcase|extended art|etched|foil|retro frame|surge foil|display commander|prerelease|promo)[^)]*\)\s*$/i, "")
    .replace(/\s+-\s+(?:foil|etched)$/i, "")
    .trim();
}

export type ParsedRow = { rowNumber: number; entry: CardEntry; raw: Record<string, string> };

export type ParsedCsv = {
  source: CsvSource;
  headers: string[];
  columns: ColumnMap;
  rows: ParsedRow[];
  /** Rows skipped before matching (blank, zero quantity, no identity). */
  skipped: { rowNumber: number; reason: string; raw: Record<string, string> }[];
  errors: string[];
};

/** Excel adds "sep=," lines; some apps write a BOM. */
function cleanText(text: string): string {
  return text.replace(/^﻿/, "").replace(/^sep=.\r?\n/i, "");
}

export function parseCollectionCsv(text: string, forceSource?: CsvSource): ParsedCsv {
  const parsed = Papa.parse<Record<string, string>>(cleanText(text), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });
  const headers = parsed.meta.fields ?? [];
  const source = forceSource ?? detectSource(headers);
  const columns = mapColumns(headers, source);
  const errors = parsed.errors.slice(0, 5).map((e) => `Row ${(e.row ?? 0) + 2}: ${e.message}`);
  if (!columns.name && !columns.scryfallId && !(columns.collectorNumber && (columns.setCode || columns.setAmbiguous))) {
    errors.unshift(
      `Couldn't find a card name, Scryfall ID, or set and collector number column. Headers found: ${headers.join(", ") || "(none)"}`,
    );
  }
  const foilIsBoolean = !!columns.finish && /^(foil|is_foil)$/i.test(columns.finish.trim()) && source !== "moxfield";

  const rows: ParsedRow[] = [];
  const skipped: ParsedCsv["skipped"] = [];
  parsed.data.forEach((raw, i) => {
    const rowNumber = i + 2; // 1-based, after the header row
    const get = (f: Field) => {
      const h = columns[f];
      const v = h ? raw[h] : undefined;
      return v?.trim() ? v.trim() : undefined;
    };
    const quantity = columns.quantity ? parseQuantity(get("quantity")) : 1;
    if (quantity <= 0) {
      skipped.push({ rowNumber, reason: "Quantity is 0", raw });
      return;
    }
    let setCode = get("setCode");
    let setName = get("setName");
    const ambiguous = get("setAmbiguous");
    if (ambiguous) {
      if (!setCode && isCode(ambiguous)) setCode = ambiguous;
      else if (!setName && !isCode(ambiguous)) setName = ambiguous;
    }
    const name = get("name");
    const tcg = get("tcgplayerId");
    const entry: CardEntry = {
      identity: {
        scryfallId: get("scryfallId"),
        name: name ? cleanName(name) : undefined,
        setCode,
        setName,
        collectorNumber: get("collectorNumber"),
        lang: columns.lang ? normLang(get("lang")) : undefined,
        tcgplayerId: tcg && /^\d+$/.test(tcg) ? Number(tcg) : undefined,
      },
      quantity,
      finish: finishOf(get("finish"), foilIsBoolean),
      condition: get("condition"),
      location: get("location"),
      altered: truthy(get("altered")),
      signed: truthy(get("signed")),
      misprint: truthy(get("misprint")),
      proxy: truthy(get("proxy")),
      purchasePrice: parsePrice(get("purchasePrice")),
    };
    const id = entry.identity;
    if (!id.scryfallId && !id.name && !(id.setCode && id.collectorNumber) && !id.tcgplayerId) {
      skipped.push({ rowNumber, reason: "No card name, Scryfall ID, or set and number", raw });
      return;
    }
    rows.push({ rowNumber, entry, raw });
  });
  return { source, headers, columns, rows, skipped, errors };
}
