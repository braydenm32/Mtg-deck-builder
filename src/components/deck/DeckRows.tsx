import Image from "next/image";
import Link from "next/link";
import type { DeckRow } from "@/app/decks/[id]/data";
import type { PriceView } from "@/lib/money";
import { cardRoles } from "@/lib/deck/roles";
import { PendingRow } from "../offline/PendingRow";
import { Badge, ManaCost, money } from "../ui";
import { DeckAddButtons, DeckRowActions } from "./DeckRowActions";

/**
 * A slot's state as one quiet word (R8 in docs/design/3-numbers-audit.md). Only the states you can act
 * on get a coloured chip; a placed card just says where it lives.
 */
export function SlotChip({ c }: { c: DeckRow }) {
  switch (c.state) {
    case "placed":
      if (c.basic) return <span>Basic land</span>;
      return <span className="min-w-0 truncate">{[c.placedProxy ? "Proxy" : null, c.location || "Owned"].filter(Boolean).join(" · ")}</span>;
    case "free":
      return <Badge tone="accent">Free copy</Badge>;
    case "shared":
      return <Badge tone="warn">Shared</Badge>;
    case "other-deck":
      return (
        <Badge tone="warn" className="min-w-0 max-w-full">
          <span className="truncate">In {c.inDecks.map((d) => d.name).join(", ") || "another deck"}</span>
        </Badge>
      );
    case "not-owned":
      return <Badge>{c.acquire === "proxy" ? "Proxy" : "Buy"}</Badge>;
    default:
      return <Badge>No card data</Badge>;
  }
}

/**
 * Deck cards as calm, tappable rows: name and mana cost, then the slot state and why it's here.
 * `prices` shows each card's cheapest price; `thumbs` adds a small card image (the Upgrades tab);
 * `chip={false}` leaves out the state when the section heading already says it; `columns` lays long
 * lists out in two columns on a wide laptop.
 */
export function DeckRows({
  deckId,
  rows,
  prices,
  thumbs = false,
  chip = true,
  columns = false,
}: {
  deckId: number;
  rows: DeckRow[];
  prices?: PriceView;
  thumbs?: boolean;
  chip?: boolean;
  columns?: boolean;
}) {
  const deckTags = [...new Set(rows.flatMap((r) => r.tags ?? []))].sort((a, b) => a.localeCompare(b));
  return (
    <ul
      className={`grid gap-px overflow-hidden rounded-xl border border-line bg-line ${columns ? "min-[1100px]:grid-cols-2 min-[1100px]:[&>li:last-child:nth-child(odd)]:col-span-2" : ""}`}
    >
      {rows.map((c) => {
        const price = prices && c.priceUsd != null ? money(c.priceUsd, prices) : null;
        const suggestion = c.board === "upgrade" || c.board === "wanted";
        const why = c.reason && !c.basic && c.reason !== "Basic land" ? c.reason : null;
        // A deck row opens its sheet when tapped; a suggestion links to the card page when you own it.
        const sheet = !c.basic && !suggestion;
        const link = suggestion && c.owned > 0;
        const text = (
          <>
            {thumbs && (
              <span className="relative aspect-[488/680] w-10 shrink-0 overflow-hidden rounded-[5%] bg-skeleton">
                {c.imageSmall && <Image src={c.imageSmall} alt="" fill sizes="40px" className="object-cover" />}
              </span>
            )}
            <span className={`block min-w-0 flex-1 py-1 ${link ? "relative" : ""}`}>
              <span className="flex min-w-0 items-center gap-2">
                <span className={`min-w-0 text-[15px] font-medium ${thumbs ? "line-clamp-2" : "truncate"}`}>
                  {c.quantity > 1 && <span className="font-normal text-muted">{c.quantity}× </span>}
                  {link ? (
                    // The link covers the row's text, so the whole area is the tap target.
                    <Link className="after:absolute after:-inset-y-2 after:inset-x-0 hover:underline" href={`/collection/${c.oracleId}`}>
                      {c.name}
                    </Link>
                  ) : (
                    c.name
                  )}
                </span>
                {c.gameChanger && <Badge tone="warn">Game Changer</Badge>}
              </span>
              {(chip || price || (why && !thumbs) || (c.tags ?? []).length > 0) && (
                <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted">
                  {chip && <SlotChip c={c} />}
                  {(c.tags ?? []).map((t) => (
                    <Badge key={t} tone="accent" className="shrink-0">
                      {t}
                    </Badge>
                  ))}
                  {price && <span className="shrink-0 tabular-nums">{price}</span>}
                  {why && !thumbs && (
                    <span className="min-w-0 truncate">
                      {chip || price ? "· " : ""}
                      {why}
                    </span>
                  )}
                </span>
              )}
              {/* On Upgrades the reason gets its own lines, so "Would replace …" at its end stays visible. */}
              {why && thumbs && <span className="mt-0.5 line-clamp-2 text-xs text-muted">{why}</span>}
            </span>
            {/* With a thumbnail the cost is on the card, so a phone leaves it out to give the name room. */}
            <span className={`shrink-0 ${thumbs ? "hidden min-[600px]:inline" : ""}`}>
              <ManaCost cost={c.manaCost} />
            </span>
          </>
        );
        // Hidden while an edit on this device hasn't reached the page yet (removed, moved, added).
        return (
          <PendingRow key={c.id} deckId={deckId} row={{ id: c.id, oracleId: c.oracleId, board: c.board }}>
            <li className={`flex min-h-14 min-w-0 items-center gap-3 bg-panel py-1 pr-1 ${sheet ? "" : "pl-3"}`}>
              {sheet ? (
                <DeckRowActions
                  deckId={deckId}
                  row={{
                    id: c.id,
                    oracleId: c.oracleId,
                    name: c.name,
                    locked: c.locked,
                    board: c.board,
                    acquire: c.acquire,
                    state: c.state,
                    owned: c.owned,
                    roles: cardRoles(c),
                    customRoles: c.roleOverride != null,
                    tags: c.tags ?? [],
                    deckTags,
                    // Rows drawn on the device include cards added there (src/lib/offline/deck-model.ts).
                    pendingKey: (c as { pendingKey?: string }).pendingKey,
                  }}
                >
                  {text}
                </DeckRowActions>
              ) : (
                <>
                  {text}
                  {suggestion ? <DeckAddButtons deckId={deckId} oracleId={c.oracleId} name={c.name} /> : <span className="w-1" />}
                </>
              )}
            </li>
          </PendingRow>
        );
      })}
    </ul>
  );
}

/** A titled group of rows: "Creatures 24", with an optional line of help and an action. */
export function RowGroup({ title, count, help, aside, children }: { title: string; count?: number; help?: React.ReactNode; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex min-h-11 min-w-0 flex-wrap items-center justify-between gap-x-3">
        <h2 className="text-[15px] font-semibold">
          {title} {count !== undefined && <span className="font-normal tabular-nums text-muted">{count}</span>}
        </h2>
        {aside}
      </div>
      {help && <p className="text-sm text-muted">{help}</p>}
      {children}
    </section>
  );
}
