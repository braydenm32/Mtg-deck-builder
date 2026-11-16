import type { Finish, Printing, ScanResult } from "./types";

export class ApiError extends Error {}

async function errorText(res: Response): Promise<string> {
  try {
    const j = await res.json();
    return j.error ?? res.statusText;
  } catch {
    return res.statusText;
  }
}

/** Send a flattened card (kind "card") or a whole photo (kind "photo") to be recognised. */
export async function scanImage(image: Blob, kind: "card" | "photo"): Promise<ScanResult> {
  const res = await fetch(`/api/scan${kind === "photo" ? "?kind=photo" : ""}`, {
    method: "POST",
    headers: { "Content-Type": image.type || "image/jpeg" },
    body: image,
  });
  if (!res.ok) throw new ApiError(await errorText(res));
  return res.json();
}

export interface AddOptions {
  printing: Printing;
  finish: Finish;
  condition: string;
  location: string;
  confidence: "exact" | "guessed";
  /** The physical card's language; defaults to the printing's. */
  lang?: string;
  quantity?: number;
}

/** Adds one copy; returns the stack id and its new total. */
export async function addToCollection(o: AddOptions): Promise<{ itemId: number; quantity: number }> {
  const res = await fetch("/api/collection/items", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source: "scanner",
      cards: [
        {
          scryfallId: o.printing.scryfallId,
          quantity: o.quantity ?? 1,
          finish: o.finish,
          lang: o.lang ?? o.printing.lang,
          condition: o.condition,
          location: o.location || undefined,
          printingConfidence: o.confidence,
        },
      ],
    }),
  });
  if (!res.ok) throw new ApiError(await errorText(res));
  const body = await res.json();
  if (!body.added?.length) throw new ApiError(body.unmatched?.[0]?.reason ?? "Couldn't add that card");
  return { itemId: body.added[0].itemId, quantity: body.added[0].quantity };
}

/** Takes back one copy added by a scan (removes the stack when it reaches 0). */
export async function undoAdd(itemId: number, quantity = 1): Promise<void> {
  const res = await fetch("/api/scan/undo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itemId, quantity }),
  });
  if (!res.ok) throw new ApiError(await errorText(res));
}

/** All printings of a card name from the local database, mapped to the scanner's shape. */
export async function printingsFor(name: string): Promise<Printing[]> {
  const res = await fetch(`/api/cards/lookup?name=${encodeURIComponent(name)}`);
  if (!res.ok) return [];
  const rows: {
    id: string;
    oracleId: string;
    name: string;
    setCode: string;
    setName: string;
    collectorNumber: string;
    lang: string;
    rarity: string;
    finishes: string[];
    releasedAt: string | null;
    imageNormal: string | null;
    imageSmall: string | null;
    variantRank: number;
    priceUsd?: number | null;
    priceUsdFoil?: number | null;
    priceUsdEtched?: number | null;
  }[] = (await res.json()).printings;
  return rows.map((p) => ({
    scryfallId: p.id,
    oracleId: p.oracleId,
    name: p.name,
    set: p.setCode,
    setName: p.setName,
    collectorNumber: p.collectorNumber,
    lang: p.lang,
    rarity: p.rarity,
    finishes: p.finishes,
    releasedAt: p.releasedAt ?? undefined,
    imageNormal: p.imageNormal ?? undefined,
    imageSmall: p.imageSmall ?? undefined,
    variantRank: p.variantRank,
    prices: { nonfoil: p.priceUsd, foil: p.priceUsdFoil, etched: p.priceUsdEtched },
  }));
}

export async function searchNames(q: string): Promise<{ name: string; imageSmall: string | null }[]> {
  const res = await fetch(`/api/cards/search?q=${encodeURIComponent(q)}`);
  if (!res.ok) return [];
  return (await res.json()).cards;
}

/** Send a scanned card to a deck (it's in the collection already) or the want list (instead of the collection). */
export async function sendInto(body: { kind: "deck"; deckId: number; oracleId: string } | { kind: "wants"; oracleId: string }) {
  const res = await fetch("/api/scan/into", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new ApiError(await errorText(res));
  return (await res.json()) as { cardId?: number | null; deck?: string; previous?: number; quantity?: number };
}

export async function undoInto(body: { kind: "deck"; deckId: number; cardId: number } | { kind: "wants"; oracleId: string; previous: number }) {
  const res = await fetch("/api/scan/into", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new ApiError(await errorText(res));
}
