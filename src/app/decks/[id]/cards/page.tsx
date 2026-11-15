import Link from "next/link";
import { DeckAddCard } from "@/components/DeckAddCard";
import { DeckCardList } from "@/components/DeckCardList";
import { DeckUndoBar } from "@/components/DeckCardControls";
import { ROLE_LABELS, type Role } from "@/lib/deck/roles";
import { frontType } from "@/lib/deck/text";
import { loadDeck, type DeckRow } from "../data";

const GROUPS = [
  { key: "role", label: "Role" },
  { key: "type", label: "Type" },
  { key: "location", label: "Location" },
] as const;
type Group = (typeof GROUPS)[number]["key"];

const ROLE_ORDER = ["ramp", "draw", "removal", "wipe", "tutor", "counter", "protection", "recursion", "theme", "other", "land"];
const TYPE_ORDER = ["Creature", "Planeswalker", "Battle", "Instant", "Sorcery", "Artifact", "Enchantment", "Land", "Other"];

function groupKey(c: DeckRow, g: Group): string {
  if (g === "location") return c.state === "placed" ? (c.basic ? "Basic lands" : c.location || "No location") : "Not in your hands yet";
  if (g === "type") {
    const t = frontType(c);
    return TYPE_ORDER.find((x) => t.includes(x)) ?? "Other";
  }
  return c.role;
}

function groupLabel(k: string, g: Group) {
  if (g !== "role") return k;
  if (k === "theme") return "Theme";
  if (k === "other") return "Other";
  return k === "land" ? "Lands" : (ROLE_LABELS[k as Role] ?? k);
}

export default async function DeckCards({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ group?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const group: Group = GROUPS.some((g) => g.key === sp.group) ? (sp.group as Group) : "role";
  const v = await loadDeck(id);
  const main = v.cards.filter((c) => c.board === "main");
  const maybe = v.cards.filter((c) => c.board === "maybe");
  const groups = new Map<string, DeckRow[]>();
  for (const c of main) {
    const k = groupKey(c, group);
    groups.set(k, [...(groups.get(k) ?? []), c]);
  }
  const order = group === "role" ? ROLE_ORDER : group === "type" ? TYPE_ORDER : [...groups.keys()].sort();
  const keys = [...groups.keys()].sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99) || a.localeCompare(b));
  return (
    <div className="space-y-4">
      <DeckAddCard deckId={v.deck.id} identity={v.deck.colorIdentity} />
      <div className="flex flex-wrap items-center gap-1 text-sm" role="group" aria-label="Group cards by">
        <span className="mr-1 text-muted">Group by</span>
        {GROUPS.map((g) => (
          <Link
            key={g.key}
            href={`?group=${g.key}`}
            aria-current={g.key === group ? "true" : undefined}
            className={`inline-flex min-h-11 items-center rounded-md px-3 ${g.key === group ? "bg-accent text-accent-fg" : "border border-line"}`}
          >
            {g.label}
          </Link>
        ))}
      </div>
      {keys.map((k) => {
        const rows = groups.get(k)!.sort((a, b) => a.cmc - b.cmc || a.name.localeCompare(b.name));
        return (
          <section key={k} className="space-y-1">
            <h2 className="text-sm font-semibold">
              {groupLabel(k, group)} <span className="font-normal text-muted">{rows.reduce((n, c) => n + c.quantity, 0)}</span>
            </h2>
            <DeckCardList deckId={v.deck.id} rows={rows} />
          </section>
        );
      })}
      {maybe.length > 0 && (
        <section className="space-y-1">
          <h2 className="text-sm font-semibold">
            Maybeboard <span className="font-normal text-muted">{maybe.length}</span>
          </h2>
          <DeckCardList deckId={v.deck.id} rows={maybe} />
        </section>
      )}
      <DeckUndoBar deckId={v.deck.id} />
    </div>
  );
}
