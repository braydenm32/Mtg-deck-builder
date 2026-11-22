import { normName } from "@/lib/cards/normalize";

/**
 * EDHREC's salt scores (json.edhrec.com/pages/top/salt): players rate how much they dislike playing
 * against a card, 0 to 4, and EDHREC lists the 100 saltiest. A deck's cards on that list are what a
 * pod is most likely to want to hear about before the game.
 */

export type SaltyCard = { name: string; salt: number };

/** The saltiest-cards page, by normalised name (full name and front face). */
export function parseSaltList(raw: unknown): Map<string, SaltyCard> {
  const page = raw as { container?: { json_dict?: { cardlists?: { cardviews?: { name?: unknown; salt?: unknown }[] }[] } } } | undefined;
  const out = new Map<string, SaltyCard>();
  for (const list of page?.container?.json_dict?.cardlists ?? []) {
    for (const cv of list.cardviews ?? []) {
      if (typeof cv?.name !== "string" || typeof cv.salt !== "number") continue;
      const card = { name: cv.name, salt: cv.salt };
      out.set(normName(cv.name), card);
      out.set(normName(cv.name.split(" // ")[0]), card);
    }
  }
  return out;
}

/** The named cards that are on the saltiest list, saltiest first. */
export function saltyCards(names: string[], list: Map<string, SaltyCard>): SaltyCard[] {
  const seen = new Set<string>();
  const out: SaltyCard[] = [];
  for (const n of names) {
    const hit = list.get(normName(n)) ?? list.get(normName(n.split(" // ")[0]));
    if (!hit || seen.has(hit.name)) continue;
    seen.add(hit.name);
    out.push({ name: n, salt: hit.salt });
  }
  return out.sort((a, b) => b.salt - a.salt || a.name.localeCompare(b.name));
}

/** "2.4", the way EDHREC shows it. */
export const saltLabel = (salt: number) => salt.toFixed(1);

export const SALT_PATH = "top/salt";
