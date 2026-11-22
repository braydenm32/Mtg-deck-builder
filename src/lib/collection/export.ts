import Papa from "papaparse";
import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import type { CollectionExportFormat } from "./export-formats";

/**
 * Collection exports. "tutor" is this app's own CSV: every field a stack has, so importing it again
 * (here or in a fresh copy of the app) gives back the same stacks, guesses included. "moxfield" and
 * "manabox" use those apps' collection CSV layouts, so the collection can move to them.
 */
export { COLLECTION_EXPORT_FORMATS, COLLECTION_EXPORT_LABELS, type CollectionExportFormat } from "./export-formats";

export type ExportStack = {
  quantity: number;
  name: string;
  setCode: string;
  setName: string;
  collectorNumber: string;
  rarity: string;
  scryfallId: string;
  tcgplayerId: number | null;
  lang: string;
  finish: string;
  condition: string;
  location: string;
  altered: boolean;
  signed: boolean;
  misprint: boolean;
  proxy: boolean;
  purchasePrice: number | null;
  printingConfidence: string;
  addedAt: string;
  /** Market price of one copy in its finish (US$), null when Scryfall has none. */
  priceUsd: number | null;
};

/** Every stack you own, with its printing, in name order. One query. */
export async function exportStacks(db: Db): Promise<ExportStack[]> {
  const res = await db.all<Record<string, unknown>>(sql`
    SELECT ci.quantity, p.name, p.set_code, p.set_name, p.collector_number, p.rarity, p.id AS scryfall_id, p.tcgplayer_id,
      ci.lang, ci.finish, ci.condition, ci.location, ci.altered, ci.signed, ci.misprint, ci.proxy, ci.purchase_price,
      ci.printing_confidence, ci.added_at,
      CASE WHEN ci.finish = 'foil' THEN COALESCE(p.price_usd_foil, p.price_usd)
        WHEN ci.finish = 'etched' THEN COALESCE(p.price_usd_etched, p.price_usd_foil, p.price_usd)
        ELSE COALESCE(p.price_usd, p.price_usd_foil) END AS price_usd
    FROM collection_items ci JOIN printings p ON p.id = ci.printing_id
    ORDER BY p.name, p.set_code, p.collector_number, ci.id`);
  return res.map((r) => ({
    quantity: Number(r.quantity),
    name: String(r.name),
    setCode: String(r.set_code),
    setName: String(r.set_name),
    collectorNumber: String(r.collector_number),
    rarity: String(r.rarity),
    scryfallId: String(r.scryfall_id),
    tcgplayerId: r.tcgplayer_id == null ? null : Number(r.tcgplayer_id),
    lang: String(r.lang),
    finish: String(r.finish),
    condition: String(r.condition ?? ""),
    location: String(r.location ?? ""),
    altered: Boolean(Number(r.altered)),
    signed: Boolean(Number(r.signed)),
    misprint: Boolean(Number(r.misprint)),
    proxy: Boolean(Number(r.proxy)),
    purchasePrice: r.purchase_price == null ? null : Number(r.purchase_price),
    printingConfidence: String(r.printing_confidence),
    addedAt: String(r.added_at),
    priceUsd: r.price_usd == null ? null : Number(r.price_usd),
  }));
}

const LANG_NAMES: Record<string, string> = {
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  ja: "Japanese",
  ko: "Korean",
  ru: "Russian",
  zhs: "Chinese Simplified",
  zht: "Chinese Traditional",
  he: "Hebrew",
  la: "Latin",
  grc: "Ancient Greek",
  ar: "Arabic",
  sa: "Sanskrit",
  ph: "Phyrexian",
};

const MOXFIELD_CONDITION: Record<string, string> = { M: "Mint", NM: "Near Mint", LP: "Lightly Played", MP: "Moderately Played", HP: "Heavily Played", DMG: "Damaged" };
const MANABOX_CONDITION: Record<string, string> = {
  M: "mint",
  NM: "near_mint",
  LP: "lightly_played",
  MP: "moderately_played",
  HP: "heavily_played",
  DMG: "damaged",
};

const yes = (b: boolean) => (b ? "true" : "false");
const money = (n: number | null) => (n == null ? "" : n.toFixed(2));

/** The rows of a CSV in the given format, header first. */
export function collectionCsvRows(stacks: ExportStack[], format: CollectionExportFormat): Record<string, string | number>[] {
  if (format === "moxfield") {
    return stacks.map((s) => ({
      Count: s.quantity,
      "Tradelist Count": 0,
      Name: s.name,
      Edition: s.setCode.toLowerCase(),
      Condition: MOXFIELD_CONDITION[s.condition] ?? (s.condition || "Near Mint"),
      Language: LANG_NAMES[s.lang] ?? s.lang,
      Foil: s.finish === "nonfoil" ? "" : s.finish,
      Tags: s.location,
      "Last Modified": s.addedAt,
      "Collector Number": s.collectorNumber,
      Alter: yes(s.altered),
      Proxy: yes(s.proxy),
      "Purchase Price": money(s.purchasePrice),
    }));
  }
  if (format === "manabox") {
    return stacks.map((s) => ({
      "Binder Name": s.location,
      Name: s.name,
      "Set code": s.setCode.toUpperCase(),
      "Set name": s.setName,
      "Collector number": s.collectorNumber,
      Foil: s.finish === "nonfoil" ? "normal" : s.finish,
      Rarity: s.rarity,
      Quantity: s.quantity,
      "ManaBox ID": "",
      "Scryfall ID": s.scryfallId,
      "Purchase price": money(s.purchasePrice),
      Misprint: yes(s.misprint),
      Altered: yes(s.altered),
      Condition: MANABOX_CONDITION[s.condition] ?? (s.condition ? s.condition.toLowerCase() : "near_mint"),
      Language: s.lang,
      "Purchase price currency": s.purchasePrice == null ? "" : "USD",
    }));
  }
  return stacks.map((s) => ({
    Quantity: s.quantity,
    Name: s.name,
    "Set Code": s.setCode.toUpperCase(),
    "Set Name": s.setName,
    "Collector Number": s.collectorNumber,
    Language: s.lang,
    Finish: s.finish,
    Condition: s.condition,
    Location: s.location,
    Proxy: yes(s.proxy),
    Altered: yes(s.altered),
    Signed: yes(s.signed),
    Misprint: yes(s.misprint),
    "Purchase Price": money(s.purchasePrice),
    "Price (USD)": money(s.priceUsd),
    "Scryfall ID": s.scryfallId,
    "TCGplayer ID": s.tcgplayerId ?? "",
    "Printing Confidence": s.printingConfidence,
    "Date Added": s.addedAt,
  }));
}

/** The collection as CSV text. An empty collection still gets its header row. */
export async function exportCollectionCsv(db: Db, format: CollectionExportFormat): Promise<string> {
  const rows = collectionCsvRows(await exportStacks(db), format);
  if (rows.length) return Papa.unparse(rows);
  // Papa can't take headers from zero rows: make them from a blank stack.
  const blank = collectionCsvRows([BLANK], format)[0];
  return Papa.unparse({ fields: Object.keys(blank), data: [] });
}

const BLANK: ExportStack = {
  quantity: 0,
  name: "",
  setCode: "",
  setName: "",
  collectorNumber: "",
  rarity: "",
  scryfallId: "",
  tcgplayerId: null,
  lang: "en",
  finish: "nonfoil",
  condition: "",
  location: "",
  altered: false,
  signed: false,
  misprint: false,
  proxy: false,
  purchasePrice: null,
  printingConfidence: "exact",
  addedAt: "",
  priceUsd: null,
};

/** "mtg-deck-tutor-collection-2026-11-16.csv" */
export function exportFileName(kind: string, ext: string, now = new Date()): string {
  return `mtg-deck-tutor-${kind}-${now.toISOString().slice(0, 10)}.${ext}`;
}
