import Image from "next/image";
import Link from "next/link";
import { getDb } from "@/db/client";
import { DeckToast } from "@/components/deck/DeckRowActions";
import { GiveAllAHome } from "@/components/GiveAllAHome";
import { Badge, money, Progress } from "@/components/ui";
import { openMissCounts, recentBatches, sourceLabel } from "@/lib/collection/import";
import { knownLocations, type Place } from "@/lib/collection/locations";
import { cardsNeedingAHome, type NeedsAHome } from "@/lib/collection/needs-home";
import { collectionTotals } from "@/lib/collection/query";
import { dashboardStats } from "@/lib/collection/stats";
import { sharedCards } from "@/lib/deck/allocate";
import { listDecks, STATUS_LABEL } from "@/lib/deck/store";
import { formatDateTime } from "@/lib/format";
import { getPriceView } from "@/lib/settings";

export const dynamic = "force-dynamic";

/*
 * Today: "what needs me?" in one glance, then onward (docs/design/1-usage-audit.md §4).
 * Every number comes from a library function; this page only decides what to show and in what order.
 */

const DAY = 86_400_000;
/** The card data counts as stale after this many days (3-numbers-audit.md, Part A, "Card data from"). */
const STALE_DAYS = 14;
/** The last import stays on Today this long (3-numbers-audit.md, Part B, "1. Today"). */
const IMPORT_DAYS = 7;
/** Decks shown on Today; the rest are a tap away on Decks. */
const DECKS_SHOWN = 3;
/** Decks with cards still to get, shown under Needs you, closest to done first. */
const DECK_NEEDS = 2;

type Tone = "warn" | "accent" | "ok" | "plain";

const fmt = (n: number) => n.toLocaleString("en-AU");
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** "A, B and C". */
function joinAnd(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** "A, B and 4 more", naming the first two of `total`. */
function someNames(names: string[], total: number): string {
  const shown = names.slice(0, 2);
  const more = total - shown.length;
  return more > 0 ? `${shown.join(", ")} and ${more} more` : joinAnd(shown);
}

export default async function Today() {
  const db = await getDb();
  const stats = await dashboardStats(db);
  const noCardData = stats.cards === 0;

  // IN-APP 3: until there's a collection, Today shows only the first step. Anyone with a single
  // copy (proxies included) gets the full page.
  if (stats.ownedCopies === 0) {
    const decks = await listDecks(db);
    return (
      <>
        <h1 className="old-look-only mb-6 text-2xl font-semibold">Today</h1>
        <FirstRun noCardData={noCardData} deckCount={decks.length} />
      </>
    );
  }

  const [decks, shared, homeless, collection, batches, pv] = await Promise.all([
    listDecks(db),
    sharedCards(db),
    cardsNeedingAHome(db),
    collectionTotals(db),
    recentBatches(db, 1),
    getPriceView(),
  ]);
  const now = Date.now();

  /* ---------- Needs you, in the order you'd do them: cards in, then plan, then build ---------- */

  const lastImport = batches[0];
  const importFresh = lastImport && !lastImport.undoneAt && now - Date.parse(lastImport.createdAt) <= IMPORT_DAYS * DAY;
  const importLabel = lastImport ? (lastImport.filename ?? sourceLabel(lastImport.source)) : "";
  // Rows still open: ones you've added another way or marked "not mine" don't need you.
  const importOpen = importFresh ? ((await openMissCounts(db, [lastImport.id])).get(lastImport.id) ?? 0) : 0;

  const toDecide = shared.filter((s) => !s.settled);
  const decideDecks = [...new Set(toDecide.flatMap((s) => s.decks.map((d) => d.deckName)))];

  const active = decks.filter((d) => d.status !== "retired");
  const toGet = decks
    .filter((d) => d.status === "building" && d.toAcquire > 0 && d.progress.placed < d.progress.of)
    .sort((a, b) => b.progress.placed / b.progress.of - a.progress.placed / a.progress.of)
    .slice(0, DECK_NEEDS);

  const staleDays = stats.lastSync ? Math.floor((now - Date.parse(stats.lastSync)) / DAY) : 0;

  const needs: React.ReactNode[] = [];
  if (noCardData) {
    needs.push(
      <NeedRow key="data" chip="!" tone="warn" title="The card data isn’t downloaded yet" detail={<SyncHint />} />,
    );
  }
  if (importFresh && importOpen > 0) {
    needs.push(
      <NeedRow
        key="import"
        chip={fmt(importOpen)}
        tone="warn"
        title={`${plural(importOpen, "row", "rows")} from your last import need you`}
        detail={`${importLabel} · ${fmt(lastImport.matchedCount)} of ${fmt(lastImport.rowCount)} matched`}
        action={{ label: "Review", href: `/import/${lastImport.id}` }}
      />,
    );
  }
  if (homeless.copies > 0) needs.push(<HomeRow key="home" homeless={homeless} places={await knownLocations(db)} />);
  if (toDecide.length > 0) {
    needs.push(
      <NeedRow
        key="shared"
        chip={fmt(toDecide.length)}
        tone="accent"
        title={`shared ${plural(toDecide.length, "card", "cards")} to decide`}
        detail={`${someNames(toDecide.map((s) => s.name), toDecide.length)} · wanted by ${joinAnd(decideDecks)}`}
        action={{ label: "Decide", href: "/decks/shared" }}
      />,
    );
  }
  for (const d of toGet) {
    const cost = money(d.costToFinish, pv);
    needs.push(
      <NeedRow
        key={`deck-${d.id}`}
        chip={fmt(d.toAcquire)}
        tone="plain"
        title={`${plural(d.toAcquire, "card", "cards")} to get for ${d.name}`}
        detail={cost ? `About ${cost} to finish, at the cheapest printings` : "Buy or proxy them from the deck’s Missing list"}
        action={{ label: "See list", href: `/decks/${d.id}/missing` }}
      />,
    );
  }
  if (!noCardData && staleDays > STALE_DAYS) {
    needs.push(
      <NeedRow
        key="stale"
        chip="!"
        tone="warn"
        title={`Card data is ${staleDays} days old`}
        detail={<SyncHint stale />}
      />,
    );
  }
  if (importFresh && importOpen === 0) {
    needs.push(
      <NeedRow
        key="imported"
        chip={<CheckIcon />}
        tone="ok"
        title={`Last import matched ${fmt(lastImport.matchedCount)} of ${fmt(lastImport.rowCount)}`}
        detail={`${importLabel} · ${formatDateTime(lastImport.createdAt)}`}
        href={`/import/${lastImport.id}`}
      />,
    );
  }

  /* ---------- the collection, as one quiet line (R1 · R2 · R3) ---------- */
  // Same function and wording as the Collection page, so the two lines always agree.
  const price = money(collection.value, pv);
  const value = price && collection.estimated + collection.unpriced > 0 ? `≈ ${price}` : price;
  const shownDecks = active.slice(0, DECKS_SHOWN);

  return (
    <>
      <h1 className="old-look-only mb-6 text-2xl font-semibold">Today</h1>
      <DeckToast />
      <div className="space-y-8 lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start lg:gap-8 lg:space-y-0">
        <section aria-labelledby="needs-you" className="space-y-3">
          <h2 id="needs-you" className="flex min-h-11 items-center text-lg font-semibold">
            Needs you
          </h2>
          {needs.length > 0 ? (
            <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-panel">{needs}</ul>
          ) : (
            <p className="flex min-h-14 items-center gap-3 rounded-xl border border-line bg-panel px-4 text-sm text-muted">
              <Chip tone="ok">
                <CheckIcon />
              </Chip>
              Nothing needs you right now.
            </p>
          )}
        </section>

        <div className="space-y-4">
          <section aria-labelledby="your-decks" className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 id="your-decks" className="text-lg font-semibold">
                Your decks
              </h2>
              <Link
                href="/decks/new"
                className="inline-flex min-h-11 items-center rounded-lg bg-accent px-4 text-sm font-semibold text-accent-fg hover:opacity-90"
              >
                New deck
              </Link>
            </div>
            {shownDecks.length === 0 ? (
              <p className="rounded-xl border border-line bg-panel p-4 text-sm text-muted">
                No decks yet. Pick a commander you own and a theme, and the builder fills the 99 from your cards first.
              </p>
            ) : (
              <ul className="space-y-2">
                {shownDecks.map((d) => (
                  <li key={d.id}>
                    <DeckTile deck={d} />
                  </li>
                ))}
              </ul>
            )}
            {decks.length > shownDecks.length && (
              <Link href="/decks" className="inline-flex min-h-11 items-center gap-1 text-sm text-muted hover:text-foreground">
                All {fmt(decks.length)} decks
                <ChevronIcon />
              </Link>
            )}
          </section>

          <Link
            href="/collection"
            className="flex min-h-11 items-center gap-1 text-sm text-muted tabular-nums hover:text-foreground"
            aria-label={`Collection: ${fmt(collection.copies)} cards, ${fmt(collection.unique)} unique${value ? `, worth ${value}` : ""}`}
          >
            <span>
              {fmt(collection.copies)} {plural(collection.copies, "card", "cards")}
              {collection.proxies ? ` · ${fmt(collection.proxies)} ${plural(collection.proxies, "proxy", "proxies")}` : ""} · {fmt(collection.unique)} unique
              {value ? ` · ${value}` : ""}
            </span>
            <ChevronIcon />
          </Link>
        </div>
      </div>
    </>
  );
}

/* ================================ pieces ================================ */

const CHIP_TONES: Record<Tone, string> = {
  warn: "bg-warn-bg text-warn",
  accent: "bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] text-accent",
  ok: "bg-ok-bg text-ok",
  plain: "border border-line text-foreground",
};

/** A status chip: the count (or a mark) that says at a glance what kind of thing needs you. */
function Chip({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex h-8 min-w-11 shrink-0 items-center justify-center rounded-lg px-2 text-sm font-semibold tabular-nums ${CHIP_TONES[tone]}`}
    >
      {children}
    </span>
  );
}

const SECONDARY =
  "inline-flex min-h-11 shrink-0 items-center rounded-lg border border-line px-3.5 text-sm font-medium hover:bg-background";

/** One thing that needs you: a chip, a short line, and one tap. */
function NeedRow({
  chip,
  tone,
  title,
  detail,
  action,
  href,
}: {
  chip: React.ReactNode;
  tone: Tone;
  title: string;
  detail: React.ReactNode;
  /** A button on the right. */
  action?: { label: string; href: string };
  /** Or the whole row is the link (for things that are done and just for reference). */
  href?: string;
}) {
  const body = (
    <>
      <Chip tone={tone}>{chip}</Chip>
      <div className="min-w-0 flex-1">
        <p className="font-medium leading-snug">{title}</p>
        <p className={`text-sm text-muted ${action || href ? "truncate" : ""}`}>{detail}</p>
      </div>
    </>
  );
  if (href) {
    return (
      <li>
        <Link href={href} className="flex min-h-16 items-center gap-3 p-3 hover:bg-background">
          {body}
          <ChevronIcon />
        </Link>
      </li>
    );
  }
  return (
    <li className="flex min-h-16 items-center gap-3 p-3">
      {body}
      {action && (
        <Link href={action.href} className={SECONDARY}>
          {action.label}
        </Link>
      )}
    </li>
  );
}

/**
 * Cards with no box or binder. The one tap opens the list of which cards they are, each linking to
 * its card page (where each stack can move on its own), and a button that puts them all in one place.
 */
function HomeRow({ homeless, places }: { homeless: NeedsAHome; places: Place[] }) {
  return (
    <li>
      <details className="group">
        <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 p-3 [&::-webkit-details-marker]:hidden">
          <Chip tone="warn">{fmt(homeless.copies)}</Chip>
          <div className="min-w-0 flex-1">
            <p className="font-medium leading-snug">{plural(homeless.copies, "card needs", "cards need")} a home</p>
            <p className="truncate text-sm text-muted">
              {someNames(
                homeless.cards.map((c) => c.name),
                homeless.cardCount,
              )}
            </p>
          </div>
          <span className={SECONDARY} aria-hidden="true">
            <span className="group-open:hidden">See them</span>
            <span className="hidden group-open:inline">Hide</span>
          </span>
        </summary>
        <div className="space-y-1 px-3 pb-3">
          <p className="text-sm text-muted">Added without a box, binder or list.</p>
          <ul className="grid gap-1 sm:grid-cols-2">
            {homeless.cards.map((c) => (
              <li key={c.oracleId}>
                <Link href={`/collection/${c.oracleId}`} className="flex min-h-11 items-center gap-3 rounded-lg px-1 hover:bg-background">
                  <span className="relative aspect-[488/680] w-7 shrink-0 overflow-hidden rounded-[4.5%] bg-skeleton">
                    {c.imageSmall && <Image src={c.imageSmall} alt="" fill sizes="28px" className="object-cover" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">{c.name}</span>
                  {c.copies > 1 && <span className="text-sm text-muted tabular-nums">×{c.copies}</span>}
                </Link>
              </li>
            ))}
          </ul>
          {homeless.cardCount > homeless.cards.length && (
            <p className="text-sm text-muted">and {fmt(homeless.cardCount - homeless.cards.length)} more</p>
          )}
          <GiveAllAHome copies={homeless.copies} places={places} />
        </div>
      </details>
    </li>
  );
}

function SyncHint({ stale = false }: { stale?: boolean }) {
  return (
    <>
      {stale ? "To refresh prices and new cards, run " : "Run "}
      <code className="whitespace-nowrap font-mono text-[0.85em]">npm run sync:cards</code>
      {stale ? "" : " on the computer that runs MTG Deck Tutor (about 30 seconds)"}
    </>
  );
}

type DeckSummary = Awaited<ReturnType<typeof listDecks>>[number];

const STATUS_TONE = { idea: "muted", building: "muted", built: "ok", retired: "muted" } as const;

function DeckTile({ deck: d }: { deck: DeckSummary }) {
  const cmd = d.commanders[0];
  return (
    <Link href={`/decks/${d.id}`} className="flex min-w-0 items-center gap-3 rounded-xl border border-line bg-panel p-3 hover:border-accent">
      <span className="relative aspect-[488/680] w-11 shrink-0 overflow-hidden rounded-[4.5%] bg-skeleton">
        {cmd?.imageSmall && <Image src={cmd.imageSmall} alt="" fill sizes="44px" className="object-cover" />}
      </span>
      <span className="min-w-0 flex-1 space-y-1.5">
        <span className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate font-medium">{d.name}</span>
          <Badge tone={STATUS_TONE[d.status]}>{STATUS_LABEL[d.status]}</Badge>
        </span>
        {/* As on My decks: an idea with only its commander has nothing to measure yet. */}
        {d.progress.total <= d.commanders.length ? (
          <span className="block text-xs text-muted">Nothing picked yet</span>
        ) : (
          <>
            <Progress value={d.progress.placed} max={d.progress.of} label={`${d.name}: ${d.progress.placed} of ${d.progress.of} in hand`} />
            <span className="block text-xs text-muted tabular-nums">
              {d.progress.placed} of {d.progress.of} in hand
            </span>
          </>
        )}
      </span>
    </Link>
  );
}

/* ================================ first run ================================ */

/**
 * IN-APP 3: a new user sees only the first step. Every choice leads somewhere that works, and the
 * menu stays, so nobody is stuck here.
 */
function FirstRun({ noCardData, deckCount }: { noCardData: boolean; deckCount: number }) {
  return (
    <section aria-labelledby="first-step" className="max-w-2xl space-y-5">
      {noCardData && (
        <div className="flex items-start gap-3 rounded-xl border border-line bg-panel p-4">
          <Chip tone="warn">1</Chip>
          <div className="min-w-0 space-y-1">
            <p className="font-medium">First, download the card data</p>
            <p className="text-sm text-muted">
              MTG Deck Tutor matches your cards against Scryfall’s card list, which isn’t on this computer yet. In the app’s folder, run{" "}
              <code className="whitespace-nowrap font-mono text-[0.85em] text-foreground">npm run sync:cards</code>. It takes about 30 seconds. Then reload this page.
            </p>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-sm font-medium text-accent">{noCardData ? "Then" : "First step"}</p>
        <h2 id="first-step" className="text-2xl font-semibold">
          Add the cards you own
        </h2>
        <p className="text-muted">
          MTG Deck Tutor builds Commander decks from your own cards, so it starts with your collection. Once your cards are in, this page shows what needs you.
        </p>
      </div>

      <ul className="grid gap-3 sm:grid-cols-3">
        <li>
          <Link href="/import" className="flex h-full flex-col gap-3 rounded-xl border border-line bg-panel p-4 hover:border-accent">
            <span className="space-y-1">
              <span className="block font-semibold">Import a file</span>
              <span className="block text-sm text-muted">
                A CSV from Mythic Tools, ManaBox, Moxfield, Archidekt, Deckbox, TCGplayer, Delver Lens or Dragon Shield. Importing again later updates your cards
                instead of adding them twice.
              </span>
            </span>
            <span className="mt-auto inline-flex min-h-11 items-center justify-center rounded-lg bg-accent px-4 text-sm font-semibold text-accent-fg">
              Import a file
            </span>
          </Link>
        </li>
        <li>
          <Link href="/collection/add" className="flex h-full flex-col gap-3 rounded-xl border border-line bg-panel p-4 hover:border-accent">
            <span className="space-y-1">
              <span className="block font-semibold">Type a name</span>
              <span className="block text-sm text-muted">Search for a card, pick the printing you have, and add it. Good for a handful of cards.</span>
            </span>
            <span className="mt-auto inline-flex min-h-11 items-center justify-center rounded-lg border border-line px-4 text-sm font-medium">Type a name</span>
          </Link>
        </li>
        <li>
          <Link href="/scan" className="flex h-full flex-col gap-3 rounded-xl border border-line bg-panel p-4 hover:border-accent">
            <span className="space-y-1">
              <span className="block font-semibold">Scan with your phone</span>
              <span className="block text-sm text-muted">Hold each card under the camera and it’s added once it’s read. Best for a stack of new cards.</span>
            </span>
            <span className="mt-auto inline-flex min-h-11 items-center justify-center rounded-lg border border-line px-4 text-sm font-medium">Scan cards</span>
          </Link>
        </li>
      </ul>

      {deckCount > 0 ? (
        <Link href="/decks" className="inline-flex min-h-11 items-center gap-1 text-sm text-muted hover:text-foreground">
          Your {plural(deckCount, "deck is", `${fmt(deckCount)} decks are`)} on the Decks page
          <ChevronIcon />
        </Link>
      ) : (
        <Link href="/decks/commanders" className="inline-flex min-h-11 items-center gap-1 text-sm text-muted hover:text-foreground">
          Not ready yet? Look for a commander first
          <ChevronIcon />
        </Link>
      )}
    </section>
  );
}

/* ================================ icons ================================ */

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="Done">
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-muted">
      <path d="m9.5 5.5 6.5 6.5-6.5 6.5" />
    </svg>
  );
}

