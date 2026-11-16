import { and, eq, inArray, ne, notInArray, or, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { cards, collectionItems, deckCards, decks, printings } from "@/db/schema";
import { cardsByName } from "@/lib/cards/lookup";
import { colorString, identityWithin, normName } from "@/lib/cards/normalize";
import { NON_DECK_LAYOUTS } from "@/lib/cards/rows";
import { commanderData, edhrecEnabled, type EdhrecCard } from "@/lib/edhrec/client";
import { buildDeck, isBasicLand, type BuildResult, type Candidate, type Role, type Targets } from "./build";
import type { Bracket } from "./bracket";
import { parseDecklist } from "./decklist";
import { cardRoles } from "./roles";
import { recommendedLands } from "./stats";
import { themeLabel, themeScore } from "./themes";

export type Deck = typeof decks.$inferSelect;
export type DeckCard = typeof deckCards.$inferSelect;
export type DeckStatus = Deck["status"];
export const DECK_STATUSES: DeckStatus[] = ["idea", "building", "built", "retired"];
/** Decks in these states hold on to the copies placed in them. */
export const CLAIMING: DeckStatus[] = ["building", "built"];
export const STATUS_LABEL: Record<DeckStatus, string> = { idea: "Idea", building: "Building", built: "Built", retired: "Retired" };

export type BuildSettings = {
  targets?: Partial<Targets>;
  suggestUnowned?: boolean;
  maxPrice?: number;
  /** The Commander bracket this deck aims for. Brayden's pods play Bracket 3, so that's the default. */
  targetBracket?: Bracket;
};

export const DEFAULT_TARGET_BRACKET: Bracket = 3;
export const targetBracketOf = (settings: unknown): Bracket => (settings as BuildSettings | null)?.targetBracket ?? DEFAULT_TARGET_BRACKET;

type CardRow = typeof cards.$inferSelect;
type Stack = typeof collectionItems.$inferSelect;

const BASIC_BY_COLOUR: Record<string, string> = { W: "Plains", U: "Island", B: "Swamp", R: "Mountain", G: "Forest", C: "Wastes" };
const now = () => new Date().toISOString();
const chunks = <T,>(list: T[], size: number): T[][] => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));

/** Roles for a card, from the shared role tagger (a cards row is a DeckCardInput). */
function rolesOf(c: CardRow): Role[] {
  return cardRoles(c);
}

/**
 * Owned copies per card. Proxies count as owned (Brayden plays them), so `owned` includes them and
 * `real` is the non-proxy share, kept for display. Placement prefers real copies.
 */
export async function ownership(db: Db, oracleIds?: string[]) {
  const rows = await db
    .select()
    .from(collectionItems)
    .where(oracleIds ? inArray(collectionItems.oracleId, oracleIds.length ? oracleIds : ["-"]) : undefined);
  const m = new Map<string, { owned: number; real: number; stacks: Stack[] }>();
  for (const r of rows) {
    const o = m.get(r.oracleId) ?? { owned: 0, real: 0, stacks: [] };
    o.owned += r.quantity;
    if (!r.proxy) o.real += r.quantity;
    o.stacks.push(r);
    m.set(r.oracleId, o);
  }
  return m;
}

/** Every copy placed in a claiming deck (the 99 and the commanders), one row per deck card. */
async function placementRows(db: Db) {
  return db
    .select({
      deckId: deckCards.deckId,
      deckName: decks.name,
      oracleId: deckCards.oracleId,
      quantity: deckCards.quantity,
      itemId: deckCards.collectionItemId,
    })
    .from(deckCards)
    .innerJoin(decks, eq(decks.id, deckCards.deckId))
    .where(and(inArray(decks.status, CLAIMING), inArray(deckCards.board, ["main", "commander"]), sql`${deckCards.collectionItemId} IS NOT NULL`));
}

type PlacementRow = Awaited<ReturnType<typeof placementRows>>[number];

/** Placements per card (with which decks) and per collection stack, leaving out one deck if asked. */
function tallyPlacements(rows: readonly PlacementRow[], excludeDeckId?: number) {
  const byCard = new Map<string, { copies: number; decks: { id: number; name: string }[] }>();
  const byStack = new Map<number, number>();
  for (const r of rows) {
    if (excludeDeckId && r.deckId === excludeDeckId) continue;
    const c = byCard.get(r.oracleId) ?? { copies: 0, decks: [] };
    c.copies += r.quantity;
    if (!c.decks.some((d) => d.id === r.deckId)) c.decks.push({ id: r.deckId, name: r.deckName });
    byCard.set(r.oracleId, c);
    byStack.set(r.itemId!, (byStack.get(r.itemId!) ?? 0) + r.quantity);
  }
  return { byCard, byStack };
}

/** Copies placed in claiming decks (the 99 and the commanders): per card (with which decks) and per collection stack. */
export async function placements(db: Db, opts: { excludeDeckId?: number } = {}) {
  return tallyPlacements(await placementRows(db), opts.excludeDeckId);
}

async function commandersOf(db: Db, deck: Pick<Deck, "commanderOracleId" | "partnerOracleId">) {
  const ids = [deck.commanderOracleId, deck.partnerOracleId].filter((x): x is string => !!x);
  const rows = await db.select().from(cards).where(inArray(cards.oracleId, ids));
  return ids.map((id) => rows.find((r) => r.oracleId === id)).filter((x): x is CardRow => !!x);
}

/** EDHREC data for a deck: the theme page if there is one, else the general commander page. */
export async function deckEdhrec(db: Db, commander: string, partner?: string, theme?: string | null) {
  if (!edhrecEnabled()) return undefined;
  try {
    if (theme) {
      const themed = await commanderData(db, commander, { partner, theme });
      if (themed?.cards.length) return themed;
    }
    return await commanderData(db, commander, { partner });
  } catch {
    return undefined;
  }
}

export type PoolOptions = {
  excludeDeckId?: number;
  theme?: string | null;
  edhrec?: EdhrecCard[];
  /** Always include these cards (e.g. the deck's locked cards), whatever their legality or fit. */
  include?: string[];
};

/**
 * Every card the builder may consider for a commander's colour identity: everything you own that's
 * legal, plus unowned cards that EDHREC lists, that fit the theme, or that are Commander staples.
 */
export async function candidatePool(db: Db, identity: string, excludeIds: string[], opts: PoolOptions = {}): Promise<Candidate[]> {
  const include = new Set(opts.include ?? []);
  const rows = await db
    .select()
    .from(cards)
    .where(
      or(
        and(eq(cards.legalCommander, "legal"), eq(cards.paper, true)),
        include.size ? inArray(cards.oracleId, [...include]) : undefined,
      ),
    );
  const own = await ownership(db);
  const { byCard } = await placements(db, { excludeDeckId: opts.excludeDeckId });
  const edhrec = new Map<string, EdhrecCard>();
  for (const e of opts.edhrec ?? []) edhrec.set(normName(e.name), e);

  const pool: Candidate[] = [];
  for (const c of rows) {
    const forced = include.has(c.oracleId);
    if (excludeIds.includes(c.oracleId) || (!forced && !identityWithin(c.colorIdentity, identity))) continue;
    if (!forced && /^(Token|Card|Emblem)\b/.test(c.typeLine)) continue;
    const o = own.get(c.oracleId);
    const e = edhrec.get(c.normName) ?? edhrec.get(c.normFrontName);
    const theme = themeScore({ name: c.name, typeLine: c.typeLine, oracleText: c.oracleText, keywords: c.keywords }, opts.theme);
    const staple = c.edhrecRank !== null && c.edhrecRank <= 1500;
    if (!forced && !o && !e && theme < 0.5 && !staple) continue;
    const placed = byCard.get(c.oracleId);
    pool.push({
      oracleId: c.oracleId,
      name: c.name,
      typeLine: c.typeLine,
      oracleText: c.oracleText,
      manaCost: c.manaCost,
      cmc: c.cmc,
      colorIdentity: c.colorIdentity,
      edhrecRank: c.edhrecRank,
      priceUsd: c.priceUsd,
      gameChanger: c.gameChanger,
      owned: o?.owned ?? 0,
      available: Math.max(0, (o?.owned ?? 0) - (placed?.copies ?? 0)),
      usedIn: placed?.decks.map((d) => d.name),
      edhrec: e ? { synergy: e.synergy, inclusion: e.inclusion } : undefined,
      roles: rolesOf(c),
      theme,
      anyNumber: /a deck can have any number of cards named/i.test(c.oracleText),
    });
  }
  return pool;
}

export type CreateDeckInput = {
  commanderOracleId: string;
  partnerOracleId?: string | null;
  theme?: string | null;
  name?: string;
  status?: DeckStatus;
  settings?: BuildSettings;
};

export async function createDeck(db: Db, input: CreateDeckInput): Promise<Deck> {
  const cmdrs = await commandersOf(db, { commanderOracleId: input.commanderOracleId, partnerOracleId: input.partnerOracleId ?? null });
  if (!cmdrs.length) throw new Error("Commander not found");
  const identity = colorString(cmdrs.flatMap((c) => [...c.colorIdentity]));
  const label = input.theme ? themeLabel(input.theme) : "";
  const name = input.name?.trim() || `${cmdrs[0].name.split(",")[0].split(" // ")[0]}${label ? ` ${label}` : ""}`;
  const [deck] = await db
    .insert(decks)
    .values({
      name,
      commanderOracleId: input.commanderOracleId,
      partnerOracleId: input.partnerOracleId ?? null,
      theme: input.theme ?? null,
      colorIdentity: identity,
      // New decks start as ideas: they hold no copies until you set them to Building.
      status: input.status ?? "idea",
      settings: input.settings ?? {},
      createdAt: now(),
      updatedAt: now(),
    })
    .returning();
  return deck;
}

/**
 * (Re)build a deck's main board. Locked cards and cards you added by hand stay; everything the
 * builder chose before is replaced. Owned cards are then placed on specific collection stacks.
 */
export async function rebuildDeck(db: Db, deckId: number, override: BuildSettings = {}): Promise<BuildResult> {
  const [deck] = await db.select().from(decks).where(eq(decks.id, deckId));
  if (!deck) throw new Error("Deck not found");
  const settings: BuildSettings = { ...(deck.settings as BuildSettings), ...override };
  const cmdrs = await commandersOf(db, deck);
  if (!cmdrs.length) throw new Error("Commander not found");
  const edh = await deckEdhrec(db, cmdrs[0].name, cmdrs[1]?.name, deck.theme);
  const existing = await db.select().from(deckCards).where(eq(deckCards.deckId, deckId));
  const pool = await candidatePool(db, deck.colorIdentity, cmdrs.map((c) => c.oracleId), {
    excludeDeckId: deckId,
    theme: deck.theme,
    edhrec: edh?.cards,
    include: existing.filter((c) => c.board === "main" && c.locked).map((c) => c.oracleId),
  });
  const locked = existing.filter((c) => c.board === "main" && c.locked);
  const build = (lands?: number) =>
    buildDeck({
      commander: { name: cmdrs.map((c) => c.name).join(" + "), colorIdentity: deck.colorIdentity, gameChangers: cmdrs.filter((c) => c.gameChanger).length },
      themeLabel: deck.theme ? themeLabel(deck.theme) : undefined,
      pool,
      locked: locked.map((l) => ({ oracleId: l.oracleId, quantity: l.quantity, acquire: (l.acquire as "buy" | "proxy" | null) ?? null })),
      targets: { ...settings.targets, ...(lands ? { lands } : {}) },
      size: 100 - cmdrs.length,
      suggestUnowned: settings.suggestUnowned,
      maxPrice: settings.maxPrice,
      targetBracket: targetBracketOf(settings),
    });
  let result = build();
  // Unless you set a land count, size the mana base to the curve we actually built (Karsten's formula).
  if (settings.targets?.lands === undefined) {
    const lands = landsFor(result, pool);
    if (Math.abs(lands - result.counts.lands) > 1) result = build(lands);
  }

  const basicIds = await basicOracleIds(db);
  const synergyOf = new Map(pool.map((c) => [c.oracleId, c.edhrec?.synergy ?? null]));
  const lockedIds = new Set(locked.map((l) => l.oracleId));
  const fresh = result.cards
    .filter((c) => !lockedIds.has(c.oracleId))
    .map((c) => {
      const oracleId = c.oracleId.startsWith("basic:") ? (basicIds.get(c.oracleId.slice(6)) ?? c.oracleId) : c.oracleId;
      return {
        deckId,
        oracleId,
        quantity: c.quantity,
        board: "main",
        role: c.role,
        acquire: c.acquire,
        locked: false,
        addedBy: "builder",
        score: c.score,
        synergy: synergyOf.get(c.oracleId) ?? null,
        reason: c.reason,
      };
    });
  const wanted = result.contested.map((c) => ({
    deckId,
    oracleId: c.oracleId,
    quantity: 1,
    board: "wanted",
    role: c.role,
    acquire: null,
    locked: false,
    addedBy: "builder",
    score: c.score,
    synergy: synergyOf.get(c.oracleId) ?? null,
    reason: c.reason,
  }));

  const upgrades = result.upgrades.map((c) => ({
    deckId,
    oracleId: c.oracleId,
    quantity: 1,
    board: "upgrade",
    role: c.role,
    acquire: "buy",
    locked: false,
    addedBy: "builder",
    score: c.score,
    synergy: synergyOf.get(c.oracleId) ?? null,
    reason: c.replaces ? `${c.reason}${c.reason ? " · " : ""}Would replace ${c.replaces}` : c.reason,
  }));

  // One batch (a single round trip, all or nothing) rather than a transaction of one trip per statement.
  const rows = [...fresh, ...wanted, ...upgrades];
  await db.batch([
    // Keep locked main cards and the maybeboard; replace the rest.
    db
      .delete(deckCards)
      .where(and(eq(deckCards.deckId, deckId), sql`NOT (${deckCards.board} = 'main' AND ${deckCards.locked} = 1)`, notInArray(deckCards.board, ["maybe", "commander"]))),
    ...chunks(rows, 100).map((part) => db.insert(deckCards).values(part)),
    db.update(decks).set({ updatedAt: now(), settings }).where(eq(decks.id, deckId)),
  ]);
  await placeCopies(db, deckId);
  return result;
}

/** Recommended lands for a built list: Karsten's formula on its average mana value and cheap ramp/draw. */
function landsFor(result: BuildResult, pool: Candidate[]): number {
  const byId = new Map(pool.map((c) => [c.oracleId, c]));
  let n = 0;
  let mv = 0;
  let cheap = 0;
  for (const b of result.cards) {
    const c = byId.get(b.oracleId);
    if (!c || b.role === "land") continue;
    n += b.quantity;
    mv += c.cmc * b.quantity;
    if (c.cmc <= 2 && (c.roles.includes("ramp") || c.roles.includes("draw"))) cheap += b.quantity;
  }
  return Math.min(40, Math.max(33, recommendedLands(n ? mv / n : 3, cheap)));
}

async function basicOracleIds(db: Db): Promise<Map<string, string>> {
  const names = Object.values(BASIC_BY_COLOUR);
  // By normalised name, which is indexed (cards.name isn't, so this read every card on each rebuild).
  const rows = await db
    .select({ oracleId: cards.oracleId, name: cards.name })
    .from(cards)
    .where(and(inArray(cards.normName, names.map(normName)), inArray(cards.name, names), notInArray(cards.layout, NON_DECK_LAYOUTS)));
  const m = new Map<string, string>();
  for (const [col, name] of Object.entries(BASIC_BY_COLOUR)) {
    const r = rows.find((x) => x.name === name);
    if (r) m.set(col, r.oracleId);
  }
  return m;
}

/**
 * Point each owned card in the deck at a collection stack with a free copy, so the same copy is never
 * counted in two decks. Proxies count as owned, but real copies are preferred, then nonfoil, then the
 * stack with most spare copies. Cards whose copies are all used elsewhere are left open. Basics are assumed owned.
 * The commander(s) are placed first: a deck holds its commander's copy like any card in the 99.
 */
export async function placeCopies(db: Db, deckId: number) {
  const [deck] = await db.select().from(decks).where(eq(decks.id, deckId));
  if (!deck) return;
  await syncCommanderRows(db, deck);
  const rows = (
    await db
      .select({ dc: deckCards, name: cards.name })
      .from(deckCards)
      .leftJoin(cards, eq(cards.oracleId, deckCards.oracleId))
      .where(and(eq(deckCards.deckId, deckId), inArray(deckCards.board, ["commander", "main"])))
  ).sort((a, b) => Number(b.dc.board === "commander") - Number(a.dc.board === "commander"));
  if (!CLAIMING.includes(deck.status)) {
    // Ideas and retired decks hold no copies.
    const held = rows.filter((r) => r.dc.collectionItemId !== null).map((r) => r.dc.id);
    if (held.length) await db.update(deckCards).set({ collectionItemId: null }).where(inArray(deckCards.id, held));
    return;
  }
  const own = await ownership(
    db,
    rows.map((r) => r.dc.oracleId),
  );
  const { byStack } = await placements(db, { excludeDeckId: deckId });
  const updates: { id: number; itemId: number | null; acquire: string | null }[] = [];
  for (const { dc, name } of rows) {
    if (name && isBasicLand(name)) {
      if (dc.collectionItemId !== null) updates.push({ id: dc.id, itemId: null, acquire: dc.acquire });
      continue;
    }
    const stacks = (own.get(dc.oracleId)?.stacks ?? [])
      .map((s) => ({ s, free: s.quantity - (byStack.get(s.id) ?? 0) }))
      .filter((x) => x.free >= Math.min(dc.quantity, x.s.quantity) && x.free > 0)
      .sort(
        (a, b) =>
          Number(a.s.proxy) - Number(b.s.proxy) ||
          Number(a.s.finish !== "nonfoil") - Number(b.s.finish !== "nonfoil") ||
          b.free - a.free,
      );
    const pick = stacks[0];
    const itemId = pick ? pick.s.id : null;
    if (pick) byStack.set(pick.s.id, (byStack.get(pick.s.id) ?? 0) + dc.quantity);
    // A card the builder suggested buying that you now own: it's no longer a "buy".
    const acquire = itemId !== null ? null : dc.acquire;
    if (itemId !== dc.collectionItemId || acquire !== dc.acquire) updates.push({ id: dc.id, itemId, acquire });
  }
  const [first, ...rest] = updates.map((u) => db.update(deckCards).set({ collectionItemId: u.itemId, acquire: u.acquire }).where(eq(deckCards.id, u.id)));
  if (first) await db.batch([first, ...rest]);
}

/**
 * Each commander has a deck_cards row on the "commander" board, so its physical copy can be claimed
 * like the rest of the deck. Adds missing rows and drops ones for a commander the deck no longer has.
 * Returns true when it changed anything.
 */
async function syncCommanderRows(db: Db, deck: Pick<Deck, "id" | "commanderOracleId" | "partnerOracleId">): Promise<boolean> {
  const want = [deck.commanderOracleId, deck.partnerOracleId].filter((x): x is string => !!x);
  const have = await db.select().from(deckCards).where(and(eq(deckCards.deckId, deck.id), eq(deckCards.board, "commander")));
  const stale = have.filter((r) => !want.includes(r.oracleId)).map((r) => r.id);
  const missing = want.filter((id) => !have.some((r) => r.oracleId === id));
  if (stale.length) await db.delete(deckCards).where(inArray(deckCards.id, stale));
  if (missing.length) {
    await db.insert(deckCards).values(missing.map((oracleId) => ({ deckId: deck.id, oracleId, board: "commander", role: "other", locked: true, addedBy: "user", reason: "Commander" })));
  }
  return stale.length > 0 || missing.length > 0;
}

export async function setDeckStatus(db: Db, deckId: number, status: DeckStatus) {
  await db.update(decks).set({ status, updatedAt: now() }).where(eq(decks.id, deckId));
  await placeCopies(db, deckId);
}

export async function updateDeck(
  db: Db,
  deckId: number,
  patch: Partial<Pick<Deck, "name" | "notes" | "theme">> & { status?: DeckStatus; settings?: BuildSettings },
) {
  const { status, settings, ...rest } = patch;
  const set: Partial<typeof decks.$inferInsert> = { ...rest };
  if (settings) {
    const [d] = await db.select({ settings: decks.settings }).from(decks).where(eq(decks.id, deckId));
    set.settings = { ...((d?.settings as BuildSettings) ?? {}), ...settings };
  }
  if (Object.keys(set).length) await db.update(decks).set({ ...set, updatedAt: now() }).where(eq(decks.id, deckId));
  if (status) await setDeckStatus(db, deckId, status);
}

export async function deleteDeck(db: Db, deckId: number) {
  await db.transaction(async (tx) => {
    await tx.delete(deckCards).where(eq(deckCards.deckId, deckId));
    await tx.delete(decks).where(eq(decks.id, deckId));
  });
}

/** Add a card by hand. Hand-added cards are locked so rebuilding keeps them. */
export async function addDeckCard(db: Db, deckId: number, oracleId: string, opts: { board?: "main" | "maybe"; acquire?: "buy" | "proxy" | null } = {}) {
  const [card] = await db.select().from(cards).where(eq(cards.oracleId, oracleId));
  if (!card) throw new Error("Card not found");
  const board = opts.board ?? "main";
  const [existing] = await db
    .select()
    .from(deckCards)
    .where(and(eq(deckCards.deckId, deckId), eq(deckCards.oracleId, oracleId), inArray(deckCards.board, ["main", "maybe", "wanted", "upgrade"])));
  const anyNumber = isBasicLand(card.name) || /a deck can have any number of cards named/i.test(card.oracleText);
  if (existing && existing.board === board && anyNumber) {
    await db.update(deckCards).set({ quantity: existing.quantity + 1, locked: true }).where(eq(deckCards.id, existing.id));
  } else if (existing) {
    await db.update(deckCards).set({ board, locked: true, addedBy: "user", acquire: opts.acquire ?? existing.acquire }).where(eq(deckCards.id, existing.id));
  } else {
    await db.insert(deckCards).values({
      deckId,
      oracleId,
      quantity: 1,
      board,
      role: primaryRoleOf(card),
      acquire: opts.acquire ?? null,
      locked: true,
      addedBy: "user",
      reason: "Added by you",
    });
  }
  await db.update(decks).set({ updatedAt: now() }).where(eq(decks.id, deckId));
  await placeCopies(db, deckId);
}

function primaryRoleOf(card: CardRow): string {
  if (/\bLand\b/.test(card.typeLine.split(" // ")[0])) return "land";
  return rolesOf(card)[0] ?? "other";
}

export async function updateDeckCard(
  db: Db,
  deckId: number,
  cardId: number,
  patch: { locked?: boolean; board?: "main" | "maybe"; acquire?: "buy" | "proxy" | null; quantity?: number },
) {
  const set: Partial<DeckCard> = {};
  if (patch.locked !== undefined) set.locked = patch.locked;
  if (patch.board) set.board = patch.board;
  if (patch.acquire !== undefined) set.acquire = patch.acquire;
  if (patch.quantity !== undefined) set.quantity = Math.max(1, patch.quantity);
  // A commander's row only tracks its copy; it can't be moved, unlocked or resized.
  await db.update(deckCards).set(set).where(and(eq(deckCards.id, cardId), eq(deckCards.deckId, deckId), ne(deckCards.board, "commander")));
  await placeCopies(db, deckId);
}

export async function removeDeckCard(db: Db, deckId: number, cardId: number) {
  const [row] = await db.select().from(deckCards).where(and(eq(deckCards.id, cardId), eq(deckCards.deckId, deckId), ne(deckCards.board, "commander")));
  if (!row) return undefined;
  await db.delete(deckCards).where(eq(deckCards.id, cardId));
  return row;
}

/** Put a removed row back exactly (for undo). */
export async function restoreDeckCard(db: Db, row: DeckCard) {
  await db.insert(deckCards).values(row).onConflictDoNothing();
  await placeCopies(db, row.deckId);
}

export type SlotState = "placed" | "free" | "shared" | "other-deck" | "not-owned" | "no-data";
export const SLOT_LABEL: Record<SlotState, string> = {
  placed: "In this deck",
  free: "Free copy: place it",
  shared: "Shared: more decks want it than you own",
  "other-deck": "In another deck",
  "not-owned": "Not owned",
  "no-data": "No card data",
};

export type DeckView = NonNullable<Awaited<ReturnType<typeof getDeck>>>;

/** The rows behind the deck page: each card with its card data and the stack its copy comes from. */
function deckRowsQuery(db: Db) {
  return db
    .select({ dc: deckCards, card: cards, location: collectionItems.location, finish: collectionItems.finish, proxy: collectionItems.proxy, setCode: printings.setCode, collectorNumber: printings.collectorNumber })
    .from(deckCards)
    .leftJoin(cards, eq(cards.oracleId, deckCards.oracleId))
    .leftJoin(collectionItems, eq(collectionItems.id, deckCards.collectionItemId))
    .leftJoin(printings, eq(printings.id, collectionItems.printingId));
}

type DeckRowData = Awaited<ReturnType<ReturnType<typeof deckRowsQuery>["where"]>>[number];

/**
 * Everything the deck page needs, for one deck or many, in two rounds of queries however many decks
 * there are (on a hosted database each query is a network round trip; loading decks one by one made
 * Today and Decks wait on dozens of them in a row).
 */
async function deckViews(db: Db, deckIds?: number[], repaired = false) {
  const scope = deckIds ? (deckIds.length ? deckIds : [-1]) : undefined;
  const [deckList, rows, placed] = await Promise.all([
    db
      .select()
      .from(decks)
      .where(scope ? inArray(decks.id, scope) : undefined)
      .orderBy(sql`${decks.updatedAt} DESC`),
    deckRowsQuery(db).where(scope ? inArray(deckCards.deckId, scope) : undefined),
    placementRows(db),
  ]);
  // Decks made before commanders held a copy get their commander rows (and placement) on first view.
  const stale = deckList.filter((deck) => {
    const cmdIds = [deck.commanderOracleId, deck.partnerOracleId].filter(Boolean);
    const cmdRows = rows.filter((r) => r.dc.deckId === deck.id && r.dc.board === "commander");
    return cmdRows.length !== cmdIds.length || cmdRows.some((r) => !cmdIds.includes(r.dc.oracleId));
  });
  if (stale.length && !repaired) {
    for (const d of stale) await placeCopies(db, d.id);
    return deckViews(db, deckIds, true);
  }
  const ids = [...new Set(rows.map((r) => r.dc.oracleId))];
  const commanderIds = [...new Set(deckList.flatMap((d) => [d.commanderOracleId, d.partnerOracleId]).filter((x): x is string => !!x))];
  const [commanderRows, own, demand] = await Promise.all([
    commanderIds.length ? db.select().from(cards).where(inArray(cards.oracleId, commanderIds)) : Promise.resolve([] as CardRow[]),
    ownership(db, ids),
    wantCounts(db, ids),
  ]);
  const rowsByDeck = new Map<number, DeckRowData[]>();
  for (const r of rows) rowsByDeck.set(r.dc.deckId, [...(rowsByDeck.get(r.dc.deckId) ?? []), r]);
  return deckList.map((deck) => {
    const commanders = [deck.commanderOracleId, deck.partnerOracleId]
      .filter((x): x is string => !!x)
      .map((id) => commanderRows.find((r) => r.oracleId === id))
      .filter((x): x is CardRow => !!x);
    return deckView(deck, commanders, rowsByDeck.get(deck.id) ?? [], own, tallyPlacements(placed, deck.id), demand);
  });
}

/** One deck's view from its rows. Pure, so a deck reads the same alone (getDeck) or in a list (listDecks). */
function deckView(
  deck: Deck,
  commanders: CardRow[],
  rows: DeckRowData[],
  own: Awaited<ReturnType<typeof ownership>>,
  elsewhere: ReturnType<typeof tallyPlacements>,
  demand: Map<string, number>,
) {
  const claiming = CLAIMING.includes(deck.status);
  const list = rows.map(({ dc, card, location, finish, proxy, setCode, collectorNumber }) => {
    const o = own.get(dc.oracleId);
    const usedElsewhere = elsewhere.byCard.get(dc.oracleId);
    const basic = card ? isBasicLand(card.name) : dc.oracleId.startsWith("basic:");
    const free = Math.max(0, (o?.owned ?? 0) - (usedElsewhere?.copies ?? 0) - (dc.collectionItemId ? dc.quantity : 0));
    let state: SlotState;
    if (!card && !basic) state = "no-data";
    else if (basic || dc.collectionItemId !== null) state = "placed";
    else if (!o?.owned) state = "not-owned";
    else if (free > 0) state = (demand.get(dc.oracleId) ?? 0) > o.owned ? "shared" : "free";
    else state = "other-deck";
    return {
      id: dc.id,
      oracleId: dc.oracleId,
      name: card?.name ?? BASIC_BY_COLOUR[dc.oracleId.slice(6)] ?? "Unknown card",
      quantity: dc.quantity,
      board: dc.board as "main" | "maybe" | "wanted" | "upgrade" | "commander",
      role: dc.role,
      acquire: dc.acquire as "buy" | "proxy" | null,
      locked: dc.locked,
      addedBy: dc.addedBy,
      score: dc.score,
      synergy: dc.synergy,
      reason: dc.reason,
      typeLine: card?.typeLine ?? "Basic Land",
      manaCost: card?.manaCost ?? null,
      cmc: card?.cmc ?? 0,
      oracleText: card?.oracleText ?? "",
      colorIdentity: card?.colorIdentity ?? "",
      gameChanger: card?.gameChanger ?? false,
      imageSmall: card?.imageSmall ?? null,
      imageNormal: card?.imageNormal ?? null,
      priceUsd: card?.priceUsd ?? null,
      keywords: card?.keywords ?? [],
      layout: card?.layout ?? "normal",
      cardFaces: card?.cardFaces ?? null,
      basic,
      state,
      owned: o?.owned ?? 0,
      ownedReal: o?.real ?? 0,
      inDecks: usedElsewhere?.decks ?? [],
      free,
      location: location ?? null,
      placedFinish: finish ?? null,
      placedProxy: proxy ?? false,
      placedPrinting: setCode ? `${setCode.toUpperCase()} #${collectorNumber}` : null,
      placedSet: setCode ?? null,
      placedNumber: collectorNumber ?? null,
    };
  });
  const main = list.filter((c) => c.board === "main");
  const commanderSlots = list.filter((c) => c.board === "commander");
  // An idea holds no copies, so its progress counts the cards you own with a copy free for it.
  const inHand = (c: (typeof main)[number]) => c.state === "placed" || (!claiming && (c.state === "free" || c.state === "shared"));
  const placed = [...commanderSlots, ...main].filter(inHand).reduce((n, c) => n + c.quantity, 0);
  const total = commanders.length + main.reduce((n, c) => n + c.quantity, 0);
  const costToFinish = [...commanderSlots, ...main].filter((c) => c.state === "not-owned").reduce((n, c) => n + (c.priceUsd ?? 0) * c.quantity, 0);
  return {
    deck,
    commanders,
    claiming,
    /** Where each commander's copy comes from (same fields as a card row). */
    commanderSlots,
    cards: list.filter((c) => c.board !== "commander"),
    progress: { placed, total, of: 100 },
    costToFinish: Math.round(costToFinish * 100) / 100,
  };
}

/** Everything the deck page needs. */
export async function getDeck(db: Db, deckId: number) {
  const [v] = await deckViews(db, [deckId]);
  return v;
}

/** How many claiming decks want each card (as commander, in the 99, or wanted). */
async function wantCounts(db: Db, oracleIds: string[]) {
  if (!oracleIds.length) return new Map<string, number>();
  const rows = await db
    .select({ oracleId: deckCards.oracleId, n: sql<number>`COUNT(DISTINCT ${deckCards.deckId})` })
    .from(deckCards)
    .innerJoin(decks, eq(decks.id, deckCards.deckId))
    .where(and(inArray(decks.status, CLAIMING), inArray(deckCards.board, ["commander", "main", "wanted"]), inArray(deckCards.oracleId, oracleIds)))
    .groupBy(deckCards.oracleId);
  return new Map(rows.map((r) => [r.oracleId, Number(r.n)]));
}

/** Every deck with its progress, newest change first. */
export async function listDecks(db: Db) {
  return (await deckViews(db)).map((v) => ({
    ...v.deck,
    commanders: v.commanders.map((c) => ({ oracleId: c.oracleId, name: c.name, imageSmall: c.imageSmall, imageNormal: c.imageNormal })),
    progress: v.progress,
    toAcquire: [...v.commanderSlots, ...v.cards.filter((c) => c.board === "main")].filter((c) => c.state === "not-owned").length,
    costToFinish: v.costToFinish,
  }));
}

export type ImportDeckResult =
  | { ok: true; deck: Deck; unmatched: string[]; cards: number }
  | { ok: false; reason: "no-commander"; candidates: { oracleId: string; name: string; colorIdentity: string }[]; unmatched: string[] }
  | { ok: false; reason: "empty" };

/**
 * Turn a pasted decklist (Moxfield, Archidekt, MTGO, Arena or plain text) into a deck. Every card
 * is locked so a rebuild keeps the list as you made it; owned cards are placed on your copies. When
 * the list doesn't mark a commander and none is given, returns the legendary cards to pick from.
 */
export async function importDecklist(
  db: Db,
  text: string,
  opts: { commanderOracleId?: string; name?: string; theme?: string | null; status?: DeckStatus } = {},
): Promise<ImportDeckResult> {
  const parsed = parseDecklist(text);
  if (!parsed.lines.length) return { ok: false, reason: "empty" };
  const resolved: { line: (typeof parsed.lines)[number]; card: CardRow }[] = [];
  const unmatched: string[] = [];
  for (const line of parsed.lines) {
    const [card] = await cardsByName(db, line.name);
    if (card) resolved.push({ line, card });
    else unmatched.push(line.name);
  }
  let commanders = resolved.filter((r) => r.line.board === "commander").map((r) => r.card);
  if (opts.commanderOracleId) {
    const chosen = resolved.find((r) => r.card.oracleId === opts.commanderOracleId)?.card;
    const [byId] = chosen ? [chosen] : await db.select().from(cards).where(eq(cards.oracleId, opts.commanderOracleId));
    if (byId) commanders = [byId];
  }
  if (!commanders.length) {
    const seen = new Set<string>();
    const candidates = resolved
      .map((r) => r.card)
      .filter((c) => c.canBeCommander && !seen.has(c.oracleId) && seen.add(c.oracleId))
      .map((c) => ({ oracleId: c.oracleId, name: c.name, colorIdentity: c.colorIdentity }));
    return { ok: false, reason: "no-commander", candidates, unmatched };
  }
  const deck = await createDeck(db, {
    commanderOracleId: commanders[0].oracleId,
    partnerOracleId: commanders[1]?.oracleId ?? null,
    theme: opts.theme ?? null,
    name: opts.name,
    status: opts.status ?? "idea",
  });
  const commanderIds = new Set(commanders.map((c) => c.oracleId));
  const rows = new Map<string, typeof deckCards.$inferInsert>();
  for (const { line, card } of resolved) {
    if (commanderIds.has(card.oracleId) || line.board === "commander") continue;
    const board = line.board === "main" ? "main" : "maybe";
    const key = `${board}:${card.oracleId}`;
    const existing = rows.get(key);
    if (existing) {
      existing.quantity = (existing.quantity ?? 1) + line.quantity;
      continue;
    }
    rows.set(key, {
      deckId: deck.id,
      oracleId: card.oracleId,
      quantity: line.quantity,
      board,
      role: primaryRoleOf(card),
      // Basics stay unlocked: rebuilding re-splits them by colour around the rest of the list.
      locked: !isBasicLand(card.name),
      addedBy: "import",
      reason: line.board === "companion" ? "Companion (imported)" : line.board === "side" ? "Sideboard (imported)" : "Imported",
    });
  }
  const values = [...rows.values()];
  for (let i = 0; i < values.length; i += 100) await db.insert(deckCards).values(values.slice(i, i + 100));
  await placeCopies(db, deck.id);
  return { ok: true, deck, unmatched, cards: values.filter((v) => v.board === "main").reduce((n, v) => n + (v.quantity ?? 1), 0) };
}
