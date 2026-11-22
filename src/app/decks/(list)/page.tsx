import Image from "next/image";
import Link from "next/link";
import { getDb } from "@/db/client";
import { Badge, ColorPips, money, Progress } from "@/components/ui";
import { Chip, fmt, joinAnd, plural, PRIMARY, SECONDARY, someNames } from "@/components/decks/bits";
import { sharedCards } from "@/lib/deck/allocate";
import { arrangeDecks, folderCounts } from "@/lib/deck/folders";
import { listDecks, STATUS_LABEL, type DeckStatus } from "@/lib/deck/store";
import { themeLabel } from "@/lib/deck/themes";
import { getPriceView } from "@/lib/settings";
import type { PriceView } from "@/lib/money";

export const dynamic = "force-dynamic";

/*
 * My decks. Decks you're building come first, then ideas, then finished decks; retired decks stay
 * at the bottom, quiet. Every number comes from listDecks() and sharedCards().
 */

/** The order decks are shown in, and how the quiet line counts each. */
const GROUPS: { status: DeckStatus; count: (n: number) => string }[] = [
  { status: "building", count: (n) => `${fmt(n)} building` },
  { status: "idea", count: (n) => `${fmt(n)} ${plural(n, "idea", "ideas")}` },
  { status: "built", count: (n) => `${fmt(n)} built` },
  { status: "retired", count: (n) => `${fmt(n)} retired` },
];

const STATUS_TONE = { idea: "muted", building: "muted", built: "ok", retired: "muted" } as const;

type DeckSummary = Awaited<ReturnType<typeof listDecks>>[number];

export default async function DecksPage({ searchParams }: { searchParams: Promise<{ folder?: string }> }) {
  const db = await getDb();
  const [all, shared, pv, sp] = await Promise.all([listDecks(db), sharedCards(db), getPriceView(), searchParams]);
  // A folder (?folder=) shows only its decks; pinned decks lead either way.
  const folders = folderCounts(all);
  const folder = folders.some((f) => f.name === sp.folder) ? sp.folder : undefined;
  const decks = arrangeDecks(all, folder);
  const groups = GROUPS.map((g) => ({ ...g, decks: decks.filter((d) => d.status === g.status) })).filter((g) => g.decks.length > 0);
  // listDecks() orders by last change, so each status keeps the deck you touched last first.
  // Pinned decks first, whatever their status.
  const byStatus = groups.filter((g) => g.status !== "retired").flatMap((g) => g.decks);
  const active = [...byStatus.filter((d) => d.pinned), ...byStatus.filter((d) => !d.pinned)];
  const retired = decks.filter((d) => d.status === "retired");

  const toDecide = shared.filter((s) => !s.settled);
  const decideDecks = [...new Set(toDecide.flatMap((s) => s.decks.map((d) => d.deckName)))];

  return (
    <div className="space-y-6">
      {decks.length === 0 ? (
        <section className="mx-auto max-w-md space-y-4 rounded-2xl border border-line bg-panel p-6 text-center">
          <h2 className="text-xl font-semibold">No decks yet</h2>
          <p className="text-sm text-muted">Pick a commander you own and a theme, and the builder fills the 99 from your cards first.</p>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Link href="/decks/new" className={`${PRIMARY} min-h-12 rounded-xl px-5`}>
              New deck
            </Link>
            <Link href="/decks/commanders" className={`${SECONDARY} min-h-12 rounded-xl px-5`}>
              Find a commander by theme
            </Link>
          </div>
        </section>
      ) : (
        <>
          {/* One quiet line, and the screen's one main button. */}
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted tabular-nums">{groups.map((g) => g.count(g.decks.length)).join(" · ")}</p>
            <Link href="/decks/new" className={PRIMARY}>
              New deck
            </Link>
          </div>

          {folders.length > 0 && <FolderChips folders={folders} current={folder} total={all.length} />}

          {toDecide.length > 0 && (
            <div className="flex min-h-16 items-center gap-3 rounded-xl border border-line bg-panel p-3">
              <Chip tone="accent">{fmt(toDecide.length)}</Chip>
              <div className="min-w-0 flex-1">
                <p className="font-medium leading-snug">shared {plural(toDecide.length, "card", "cards")} to decide</p>
                <p className="truncate text-sm text-muted">
                  {someNames(
                    toDecide.map((s) => s.name),
                    toDecide.length,
                  )}{" "}
                  · wanted by {joinAnd(decideDecks)}
                </p>
              </div>
              <Link href="/decks/shared" className={SECONDARY}>
                Decide
              </Link>
            </div>
          )}

          {/* Building, then ideas, then built: each tile carries its status chip, so no group headings. */}
          {active.length > 0 && <DeckGrid decks={active} pv={pv} label="Your decks" />}

          {/* Retired decks stay, quietly, below the rest. */}
          {retired.length > 0 && (
            <section aria-labelledby="retired" className="space-y-3">
              <h2 id="retired" className="text-base font-semibold text-muted">
                Retired
              </h2>
              <DeckGrid decks={retired} pv={pv} label="Retired decks" />
            </section>
          )}
        </>
      )}
    </div>
  );
}

/** One chip per folder (and All), as links so the address keeps the choice. */
function FolderChips({ folders, current, total }: { folders: { name: string; count: number }[]; current?: string; total: number }) {
  const chip = (on: boolean) =>
    `inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm ${on ? "border-accent bg-panel font-medium" : "border-line hover:bg-background"}`;
  return (
    <nav aria-label="Folders" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
      <Link href="/decks" className={chip(!current)} aria-current={!current ? "page" : undefined}>
        All <span className="text-muted tabular-nums">{fmt(total)}</span>
      </Link>
      {folders.map((f) => (
        <Link
          key={f.name}
          href={`/decks?folder=${encodeURIComponent(f.name)}`}
          className={chip(current === f.name)}
          aria-current={current === f.name ? "page" : undefined}
        >
          {f.name} <span className="text-muted tabular-nums">{fmt(f.count)}</span>
        </Link>
      ))}
    </nav>
  );
}

function DeckGrid({ decks, pv, label }: { decks: DeckSummary[]; pv: PriceView; label: string }) {
  return (
    <ul aria-label={label} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {decks.map((d) => (
        <li key={d.id} className="min-w-0">
          <DeckTile deck={d} pv={pv} />
        </li>
      ))}
    </ul>
  );
}

/** A deck at a glance: commander art, status, how far along it is, and what's left to get. */
function DeckTile({ deck: d, pv }: { deck: DeckSummary; pv: PriceView }) {
  const cmd = d.commanders[0];
  const retired = d.status === "retired";
  const empty = d.progress.total <= d.commanders.length;
  const cost = d.toAcquire > 0 && d.costToFinish > 0 ? money(d.costToFinish, pv) : null;
  const theme = d.theme ? themeLabel(d.theme) : null;
  return (
    <Link
      href={`/decks/${d.id}`}
      className={`flex h-full min-w-0 gap-3 rounded-xl border border-line bg-panel p-3 hover:border-accent ${retired ? "opacity-70 hover:opacity-100" : ""}`}
    >
      <span className={`relative aspect-[488/680] shrink-0 self-start overflow-hidden rounded-[4.5%] bg-skeleton ${retired ? "w-11" : "w-14"}`}>
        {cmd?.imageSmall && <Image src={cmd.imageSmall} alt="" fill sizes="56px" className={`object-cover ${retired ? "grayscale" : ""}`} />}
      </span>
      <span className="min-w-0 flex-1 space-y-1.5">
        <span className="flex items-center gap-2">
          {d.pinned && <PinIcon />}
          <span className="min-w-0 flex-1 truncate font-medium">{d.name}</span>
          <Badge tone={STATUS_TONE[d.status]}>{STATUS_LABEL[d.status]}</Badge>
        </span>
        <span className="flex min-w-0 items-center gap-2 text-xs text-muted">
          <span className="min-w-0 truncate">
            {d.commanders.map((c) => c.name).join(" + ")}
            {theme ? ` · ${theme}` : ""}
          </span>
          {d.colorIdentity && <ColorPips identity={d.colorIdentity} />}
        </span>
        {retired ? null : empty ? (
          <span className="block text-xs text-muted">Nothing picked yet</span>
        ) : (
          <>
            <Progress value={d.progress.placed} max={d.progress.of} label={`${d.name}: ${d.progress.placed} of ${d.progress.of} in hand`} />
            <span className="flex flex-wrap justify-between gap-x-3 text-xs text-muted tabular-nums">
              <span>
                {d.progress.placed} of {d.progress.of} in hand
              </span>
              {d.toAcquire > 0 && (
                <span>
                  {fmt(d.toAcquire)} to get{cost ? `, about ${cost}` : ""}
                </span>
              )}
            </span>
          </>
        )}
      </span>
    </Link>
  );
}

/** The mark on a pinned deck's tile. */
function PinIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 text-accent" fill="currentColor" role="img" aria-label="Pinned">
      <path d="M10.3 1.3a1 1 0 0 1 1.4 0l3 3a1 1 0 0 1-.3 1.6l-2.6 1.2-2 2 .5 2.6a1 1 0 0 1-1.7.9L6.3 10.3 2.7 14 2 13.3l3.7-3.6L3.4 7.4a1 1 0 0 1 .9-1.7l2.6.5 2-2 1.2-2.6.2-.3Z" />
    </svg>
  );
}
