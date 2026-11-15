import { and, eq, inArray, ne, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { cards, collectionItems, deckCards, decks, printings } from "@/db/schema";
import { colorString, identityWithin, normName } from "@/lib/cards/normalize";
import { commanderData, edhrecEnabled, type EdhrecCard } from "@/lib/edhrec/client";
import { buildDeck, isBasicLand, type BuildResult, type Candidate, type Role, type Targets } from "./build";
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

export type BuildSettings = { targets?: Partial<Targets>; suggestUnowned?: boolean; maxPrice?: number };

type CardRow = typeof cards.$inferSelect;
type Stack = typeof collectionItems.$inferSelect;

const BASIC_BY_COLOUR: Record<string, string> = { W: "Plains", U: "Island", B: "Swamp", R: "Mountain", G: "Forest", C: "Wastes" };
const now = () => new Date().toISOString();

/** Roles for a card, from the shared role tagger (a cards row is a DeckCardInput). */
function rolesOf(c: CardRow): Role[] {
  return cardRoles(c);
}

/** Owned copies per card. `real` excludes proxies; only real copies count as free to place. */
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

/** Copies placed in claiming decks: per card (with which decks) and per collection stack. */
export async function placements(db: Db, opts: { excludeDeckId?: number } = {}) {
  const rows = await db
    .select({
      deckId: deckCards.deckId,
      deckName: decks.name,
      oracleId: deckCards.oracleId,
      quantity: deckCards.quantity,
      itemId: deckCards.collectionItemId,
    })
    .from(deckCards)
    .innerJoin(decks, eq(decks.id, deckCards.deckId))
    .where(
      and(
        inArray(decks.status, CLAIMING),
        eq(deckCards.board, "main"),
        sql`${deckCards.collectionItemId} IS NOT NULL`,
        opts.excludeDeckId ? ne(deckCards.deckId, opts.excludeDeckId) : undefined,
      ),
    );
  const byCard = new Map<string, { copies: number; decks: { id: number; name: string }[] }>();
  const byStack = new Map<number, number>();
  for (const r of rows) {
    const c = byCard.get(r.oracleId) ?? { copies: 0, decks: [] };
    c.copies += r.quantity;
    if (!c.decks.some((d) => d.id === r.deckId)) c.decks.push({ id: r.deckId, name: r.deckName });
    byCard.set(r.oracleId, c);
    byStack.set(r.itemId!, (byStack.get(r.itemId!) ?? 0) + r.quantity);
  }
  return { byCard, byStack };
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

export type PoolOptions = { excludeDeckId?: number; theme?: string | null; edhrec?: EdhrecCard[] };

/**
 * Every card the builder may consider for a commander's colour identity: everything you own that's
 * legal, plus unowned cards that EDHREC lists, that fit the theme, or that are Commander staples.
 */
export async function candidatePool(db: Db, identity: string, excludeIds: string[], opts: PoolOptions = {}): Promise<Candidate[]> {
  const rows = await db
    .select()
    .from(cards)
    .where(and(eq(cards.legalCommander, "legal"), eq(cards.paper, true)));
  const own = await ownership(db);
  const { byCard } = await placements(db, { excludeDeckId: opts.excludeDeckId });
  const edhrec = new Map<string, EdhrecCard>();
  for (const e of opts.edhrec ?? []) edhrec.set(normName(e.name), e);

  const pool: Candidate[] = [];
  for (const c of rows) {
    if (excludeIds.includes(c.oracleId) || !identityWithin(c.colorIdentity, identity)) continue;
    if (/^(Token|Card|Emblem)\b/.test(c.typeLine)) continue;
    const o = own.get(c.oracleId);
    const e = edhrec.get(c.normName) ?? edhrec.get(c.normFrontName);
    const theme = themeScore({ name: c.name, typeLine: c.typeLine, oracleText: c.oracleText, keywords: c.keywords }, opts.theme);
    const staple = c.edhrecRank !== null && c.edhrecRank <= 1500;
    if (!o && !e && theme < 0.5 && !staple) continue;
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
      owned: o?.real ?? 0,
      available: Math.max(0, (o?.real ?? 0) - (placed?.copies ?? 0)),
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
      status: input.status ?? "building",
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
  const pool = await candidatePool(db, deck.colorIdentity, cmdrs.map((c) => c.oracleId), {
    excludeDeckId: deckId,
    theme: deck.theme,
    edhrec: edh?.cards,
  });
  const existing = await db.select().from(deckCards).where(eq(deckCards.deckId, deckId));
  const locked = existing.filter((c) => c.board === "main" && c.locked);
  const build = (lands?: number) =>
    buildDeck({
      commander: { name: cmdrs.map((c) => c.name).join(" + "), colorIdentity: deck.colorIdentity },
      themeLabel: deck.theme ? themeLabel(deck.theme) : undefined,
      pool,
      locked: locked.map((l) => ({ oracleId: l.oracleId, quantity: l.quantity, acquire: (l.acquire as "buy" | "proxy" | null) ?? null })),
      targets: { ...settings.targets, ...(lands ? { lands } : {}) },
      size: 100 - cmdrs.length,
      suggestUnowned: settings.suggestUnowned,
      maxPrice: settings.maxPrice,
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

  await db.transaction(async (tx) => {
    // Keep locked main cards and the maybeboard; replace the rest.
    await tx
      .delete(deckCards)
      .where(and(eq(deckCards.deckId, deckId), sql`NOT (${deckCards.board} = 'main' AND ${deckCards.locked} = 1)`, ne(deckCards.board, "maybe")));
    const rows = [...fresh, ...wanted, ...upgrades];
    for (let i = 0; i < rows.length; i += 100) await tx.insert(deckCards).values(rows.slice(i, i + 100));
    await tx.update(decks).set({ updatedAt: now(), settings }).where(eq(decks.id, deckId));
  });
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
  const rows = await db.select({ oracleId: cards.oracleId, name: cards.name }).from(cards).where(inArray(cards.name, names));
  const m = new Map<string, string>();
  for (const [col, name] of Object.entries(BASIC_BY_COLOUR)) {
    const r = rows.find((x) => x.name === name);
    if (r) m.set(col, r.oracleId);
  }
  return m;
}

/**
 * Point each owned card in the deck at a collection stack with a free copy, so the same copy is never
 * counted in two decks. Prefers real (non-proxy) copies, then nonfoil, then the stack with most spare
 * copies. Cards whose copies are all used elsewhere are left open. Basics are assumed owned.
 */
export async function placeCopies(db: Db, deckId: number) {
  const [deck] = await db.select().from(decks).where(eq(decks.id, deckId));
  if (!deck) return;
  const rows = await db
    .select({ dc: deckCards, name: cards.name })
    .from(deckCards)
    .leftJoin(cards, eq(cards.oracleId, deckCards.oracleId))
    .where(and(eq(deckCards.deckId, deckId), eq(deckCards.board, "main")));
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
      .filter((s) => !s.proxy)
      .map((s) => ({ s, free: s.quantity - (byStack.get(s.id) ?? 0) }))
      .filter((x) => x.free >= Math.min(dc.quantity, x.s.quantity) && x.free > 0)
      .sort((a, b) => Number(a.s.finish !== "nonfoil") - Number(b.s.finish !== "nonfoil") || b.free - a.free);
    const pick = stacks[0];
    const itemId = pick ? pick.s.id : null;
    if (pick) byStack.set(pick.s.id, (byStack.get(pick.s.id) ?? 0) + dc.quantity);
    // A card the builder suggested buying that you now own: it's no longer a "buy".
    const acquire = itemId !== null ? null : dc.acquire;
    if (itemId !== dc.collectionItemId || acquire !== dc.acquire) updates.push({ id: dc.id, itemId, acquire });
  }
  if (updates.length) {
    await db.transaction(async (tx) => {
      for (const u of updates) await tx.update(deckCards).set({ collectionItemId: u.itemId, acquire: u.acquire }).where(eq(deckCards.id, u.id));
    });
  }
}

export async function setDeckStatus(db: Db, deckId: number, status: DeckStatus) {
  await db.update(decks).set({ status, updatedAt: now() }).where(eq(decks.id, deckId));
  await placeCopies(db, deckId);
}

export async function updateDeck(db: Db, deckId: number, patch: Partial<Pick<Deck, "name" | "notes" | "theme">> & { status?: DeckStatus }) {
  const { status, ...rest } = patch;
  if (Object.keys(rest).length) await db.update(decks).set({ ...rest, updatedAt: now() }).where(eq(decks.id, deckId));
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
  await db.update(deckCards).set(set).where(and(eq(deckCards.id, cardId), eq(deckCards.deckId, deckId)));
  await placeCopies(db, deckId);
}

export async function removeDeckCard(db: Db, deckId: number, cardId: number) {
  const [row] = await db.select().from(deckCards).where(and(eq(deckCards.id, cardId), eq(deckCards.deckId, deckId)));
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

export type DeckView = Awaited<ReturnType<typeof getDeck>>;

/** Everything the deck page needs. */
export async function getDeck(db: Db, deckId: number) {
  const [deck] = await db.select().from(decks).where(eq(decks.id, deckId));
  if (!deck) return undefined;
  const commanders = await commandersOf(db, deck);
  const rows = await db
    .select({ dc: deckCards, card: cards, location: collectionItems.location, finish: collectionItems.finish, setCode: printings.setCode, collectorNumber: printings.collectorNumber })
    .from(deckCards)
    .leftJoin(cards, eq(cards.oracleId, deckCards.oracleId))
    .leftJoin(collectionItems, eq(collectionItems.id, deckCards.collectionItemId))
    .leftJoin(printings, eq(printings.id, collectionItems.printingId))
    .where(eq(deckCards.deckId, deckId));
  const ids = [...new Set(rows.map((r) => r.dc.oracleId))];
  const own = await ownership(db, ids);
  const elsewhere = await placements(db, { excludeDeckId: deckId });
  const demand = await wantCounts(db, ids);
  const claiming = CLAIMING.includes(deck.status);

  const list = rows.map(({ dc, card, location, finish, setCode, collectorNumber }) => {
    const o = own.get(dc.oracleId);
    const usedElsewhere = elsewhere.byCard.get(dc.oracleId);
    const basic = card ? isBasicLand(card.name) : dc.oracleId.startsWith("basic:");
    const free = Math.max(0, (o?.real ?? 0) - (usedElsewhere?.copies ?? 0) - (dc.collectionItemId ? dc.quantity : 0));
    let state: SlotState;
    if (!card && !basic) state = "no-data";
    else if (basic || dc.collectionItemId !== null) state = "placed";
    else if (!o?.real) state = "not-owned";
    else if (free > 0) state = (demand.get(dc.oracleId) ?? 0) > o.real ? "shared" : "free";
    else state = "other-deck";
    return {
      id: dc.id,
      oracleId: dc.oracleId,
      name: card?.name ?? BASIC_BY_COLOUR[dc.oracleId.slice(6)] ?? "Unknown card",
      quantity: dc.quantity,
      board: dc.board as "main" | "maybe" | "wanted" | "upgrade",
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
      placedPrinting: setCode ? `${setCode.toUpperCase()} #${collectorNumber}` : null,
      placedSet: setCode ?? null,
      placedNumber: collectorNumber ?? null,
    };
  });
  const main = list.filter((c) => c.board === "main");
  const placed = commanders.length + main.filter((c) => c.state === "placed").reduce((n, c) => n + c.quantity, 0);
  const total = commanders.length + main.reduce((n, c) => n + c.quantity, 0);
  const costToFinish = main.filter((c) => c.state === "not-owned").reduce((n, c) => n + (c.priceUsd ?? 0) * c.quantity, 0);
  return {
    deck,
    commanders,
    claiming,
    cards: list,
    progress: { placed, total, of: 100 },
    costToFinish: Math.round(costToFinish * 100) / 100,
  };
}

/** How many claiming decks want each card (main or wanted board). */
async function wantCounts(db: Db, oracleIds: string[]) {
  const rows = await db
    .select({ oracleId: deckCards.oracleId, n: sql<number>`COUNT(DISTINCT ${deckCards.deckId})` })
    .from(deckCards)
    .innerJoin(decks, eq(decks.id, deckCards.deckId))
    .where(and(inArray(decks.status, CLAIMING), inArray(deckCards.board, ["main", "wanted"]), inArray(deckCards.oracleId, oracleIds.length ? oracleIds : ["-"])))
    .groupBy(deckCards.oracleId);
  return new Map(rows.map((r) => [r.oracleId, Number(r.n)]));
}

export async function listDecks(db: Db) {
  const all = await db.select().from(decks).orderBy(sql`${decks.updatedAt} DESC`);
  const out = [];
  for (const d of all) {
    const v = await getDeck(db, d.id);
    if (!v) continue;
    out.push({
      ...d,
      commanders: v.commanders.map((c) => ({ oracleId: c.oracleId, name: c.name, imageSmall: c.imageSmall, imageNormal: c.imageNormal })),
      progress: v.progress,
      toAcquire: v.cards.filter((c) => c.board === "main" && c.state === "not-owned").length,
      costToFinish: v.costToFinish,
    });
  }
  return out;
}
