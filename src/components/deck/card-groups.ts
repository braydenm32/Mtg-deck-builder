import type { DeckRow, LoadedDeck } from "@/app/decks/[id]/data";
import { ROLE_LABELS, type Role } from "@/lib/deck/roles";
import { frontType } from "@/lib/deck/text";

/**
 * How the deck's Cards tab groups the 99: by role, type, location or your own tags (a card with two
 * tags shows under both). No server code, so the device
 * groups a deck the same way when it draws the tab (src/components/offline/DeviceTabs.tsx).
 */

export const GROUPS = [
  { key: "role", label: "Role" },
  { key: "type", label: "Type" },
  { key: "location", label: "Location" },
  { key: "tag", label: "Tags" },
] as const;
export type Group = (typeof GROUPS)[number]["key"];

const ROLE_ORDER = ["ramp", "draw", "removal", "wipe", "tutor", "counter", "protection", "recursion", "theme", "other", "land"];
const TYPE_ORDER = ["Creature", "Planeswalker", "Battle", "Instant", "Sorcery", "Artifact", "Enchantment", "Land", "Other"];

export const groupOf = (param: string | undefined): Group => (GROUPS.some((g) => g.key === param) ? (param as Group) : "role");

const NO_TAG = "No tag";

export function groupKey(c: DeckRow, g: Group): string {
  if (g === "tag") return c.tags?.[0] ?? NO_TAG;
  if (g === "location") return c.state === "placed" ? (c.basic ? "Basic lands" : c.location || "No location") : "Not in your hands yet";
  if (g === "type") {
    const t = frontType(c);
    return TYPE_ORDER.find((x) => t.includes(x)) ?? "Other";
  }
  return c.role;
}

export function groupLabel(k: string, g: Group) {
  if (g !== "role") return k;
  if (k === "theme") return "Theme";
  if (k === "other") return "Other";
  return k === "land" ? "Lands" : (ROLE_LABELS[k as Role] ?? k);
}

/** The 99 in groups, in the tab's order, each sorted by mana value then name. */
export function cardGroups(v: Pick<LoadedDeck, "cards">, group: Group): [string, DeckRow[]][] {
  const groups = new Map<string, DeckRow[]>();
  for (const c of v.cards.filter((c) => c.board === "main")) {
    const keys = group === "tag" && c.tags?.length ? c.tags : [groupKey(c, group)];
    for (const k of keys) groups.set(k, [...(groups.get(k) ?? []), c]);
  }
  const order = group === "role" ? ROLE_ORDER : group === "type" ? TYPE_ORDER : [...[...groups.keys()].filter((k) => k !== NO_TAG).sort(), NO_TAG];
  const keys = [...groups.keys()].sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99) || a.localeCompare(b));
  return keys.map((k) => [k, groups.get(k)!.sort((a, b) => a.cmc - b.cmc || a.name.localeCompare(b.name))]);
}
