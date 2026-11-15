/**
 * The deck suggestion engine. Pure: give it a commander, a theme and a pool of candidate cards
 * (with what you own and what EDHREC says), and it returns a 99-card list.
 *
 * Rules, in order:
 * 1. Cards you lock are always kept.
 * 2. Owned cards first. Fill the role targets (ramp, card draw, removal, wipes) from your
 *    collection, then the rest of the nonland slots with your best-scoring cards, then lands.
 * 3. Only when your collection can't fill a slot or a role does it suggest a card to buy or proxy.
 * 4. Separately, it lists upgrades (strong cards you don't own) and contested cards (cards you
 *    own that this deck wants but another deck is using).
 */

export type Role = "land" | "ramp" | "draw" | "removal" | "wipe" | "tutor" | "counter" | "protection" | "recursion";

export type Candidate = {
  oracleId: string;
  name: string;
  typeLine: string;
  oracleText: string;
  manaCost: string | null;
  cmc: number;
  colorIdentity: string;
  edhrecRank: number | null;
  priceUsd: number | null;
  gameChanger?: boolean;
  /** Copies owned and not used by another deck. */
  available: number;
  /** Copies owned in total. */
  owned: number;
  /** Decks already using this card (names), for contested cards. */
  usedIn?: string[];
  edhrec?: { synergy: number; inclusion: number };
  roles: Role[];
  /** 0..1 fit with the deck's theme. */
  theme: number;
  /** "A deck can have any number of cards named ..." */
  anyNumber?: boolean;
};

export type Targets = { lands: number; ramp: number; draw: number; removal: number; wipe: number };

export const DEFAULT_TARGETS: Targets = { lands: 36, ramp: 10, draw: 10, removal: 8, wipe: 3 };
const ROLE_ORDER: (keyof Omit<Targets, "lands">)[] = ["ramp", "draw", "removal", "wipe"];

export type BuildInput = {
  commander: { name: string; colorIdentity: string };
  themeLabel?: string;
  pool: Candidate[];
  /** Oracle IDs the user locked in (kept as they are). */
  locked?: { oracleId: string; quantity: number; acquire: "buy" | "proxy" | null }[];
  targets?: Partial<Targets>;
  /** Total cards besides the commander(s). 99 normally, 98 with a partner. */
  size?: number;
  /** Suggest unowned cards for gaps (default true). With false the deck may come out short. */
  suggestUnowned?: boolean;
  /** Ignore unowned suggestions priced above this (USD). */
  maxPrice?: number;
};

export type BuiltCard = {
  oracleId: string;
  name: string;
  quantity: number;
  role: Role | "theme" | "other";
  acquire: "buy" | "proxy" | null;
  score: number;
  reason: string;
  locked?: boolean;
};

export type BuildResult = {
  cards: BuiltCard[];
  /** Strong unowned cards that would beat your weakest picks. */
  upgrades: (BuiltCard & { priceUsd: number | null; replaces?: string })[];
  /** Owned cards this deck wants that are in other decks. */
  contested: (BuiltCard & { usedIn: string[] })[];
  counts: { total: number; owned: number; toAcquire: number; lands: number; roles: Record<string, number> };
  warnings: string[];
};

const BASICS: Record<string, string> = { W: "Plains", U: "Island", B: "Swamp", R: "Mountain", G: "Forest" };
const BASIC_NAMES = new Set([...Object.values(BASICS), "Wastes"]);

const isLand = (c: Pick<Candidate, "typeLine">) => /\bLand\b/.test(c.typeLine.split(" // ")[0]);
export const isBasicLand = (name: string) => BASIC_NAMES.has(name) || /^Snow-Covered /.test(name);

/** Score a candidate: EDHREC synergy and play rate, theme fit, overall popularity, minus a high-curve penalty. */
export function scoreCandidate(c: Candidate, hasEdhrec: boolean): number {
  let s = 0;
  if (c.edhrec) s += 2.5 * Math.max(-0.5, Math.min(1, c.edhrec.synergy)) + 2 * c.edhrec.inclusion;
  s += (hasEdhrec ? 1.5 : 2.5) * c.theme;
  if (c.edhrecRank) s += Math.max(0, 1 - Math.log10(c.edhrecRank) / 4.5);
  if (c.cmc >= 7) s -= 0.3 * (c.cmc - 6);
  return Math.round(s * 1000) / 1000;
}

function reasonFor(c: Candidate, role: BuiltCard["role"], commander: string, themeLabel?: string): string {
  const parts: string[] = [];
  if (c.edhrec && c.edhrec.inclusion >= 0.01) {
    parts.push(`In ${Math.round(c.edhrec.inclusion * 100)}% of ${commander.split(",")[0]} decks`);
    if (c.edhrec.synergy >= 0.1) parts.push(`synergy +${Math.round(c.edhrec.synergy * 100)}%`);
  }
  if (themeLabel && c.theme >= 0.8) parts.push(`${themeLabel} card`);
  else if (themeLabel && c.theme > 0) parts.push(`fits ${themeLabel}`);
  if (role !== "other" && role !== "theme") parts.push(ROLE_LABEL[role]);
  if (!parts.length && c.edhrecRank) parts.push(`Popular in Commander (EDHREC #${c.edhrecRank.toLocaleString("en-US")})`);
  return parts.join(" · ");
}

export const ROLE_LABEL: Record<Role, string> = {
  land: "Land",
  ramp: "Ramp",
  draw: "Card draw",
  removal: "Removal",
  wipe: "Board wipe",
  tutor: "Tutor",
  counter: "Counterspell",
  protection: "Protection",
  recursion: "Recursion",
};

function primaryRole(c: Candidate): BuiltCard["role"] {
  if (isLand(c)) return "land";
  for (const r of ["ramp", "draw", "removal", "wipe", "tutor", "counter", "protection", "recursion"] as Role[]) {
    if (c.roles.includes(r)) return r;
  }
  return c.theme >= 0.4 ? "theme" : "other";
}

/** Count coloured mana symbols per colour in the chosen spells, for splitting basics. */
function pipCounts(cards: Candidate[], identity: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const col of identity) counts[col] = 0;
  for (const c of cards) {
    for (const m of (c.manaCost ?? "").matchAll(/\{([^}]+)\}/g)) {
      for (const col of identity) if (m[1].includes(col)) counts[col] += 1;
    }
  }
  return counts;
}

/** Does a land make mana of the deck's colours (or any colour)? */
function landFits(c: Candidate, identity: string): boolean {
  const t = c.oracleText;
  if (/any colou?r|any type|of the chosen colou?r/i.test(t)) return true;
  if (!identity) return /\{C\}/.test(t);
  return [...identity].some((col) => new RegExp(`\\{${col}\\}`).test(t)) || /search your library for a .*land/i.test(t);
}

export function buildDeck(input: BuildInput): BuildResult {
  const targets: Targets = { ...DEFAULT_TARGETS, ...input.targets };
  const size = input.size ?? 99;
  const suggestUnowned = input.suggestUnowned ?? true;
  const identity = input.commander.colorIdentity;
  const hasEdhrec = input.pool.some((c) => c.edhrec);
  const warnings: string[] = [];

  const scored = input.pool
    .filter((c) => !isBasicLand(c.name))
    .map((c) => ({ c, score: scoreCandidate(c, hasEdhrec) }))
    .sort((a, b) => b.score - a.score || a.c.name.localeCompare(b.c.name));
  const byId = new Map(input.pool.map((c) => [c.oracleId, c]));

  const chosen = new Map<string, BuiltCard>();
  const roleCount: Record<string, number> = {};
  let nonlandCount = 0;
  let landCount = 0;

  const add = (c: Candidate, score: number, acquire: BuiltCard["acquire"], quantity = 1, locked = false) => {
    if (chosen.has(c.oracleId)) return;
    const role = primaryRole(c);
    chosen.set(c.oracleId, { oracleId: c.oracleId, name: c.name, quantity, role, acquire, score, reason: reasonFor(c, role, input.commander.name, input.themeLabel), locked });
    for (const r of c.roles) roleCount[r] = (roleCount[r] ?? 0) + 1;
    if (isLand(c)) landCount += quantity;
    else nonlandCount += quantity;
  };

  // 1. Locked cards.
  for (const l of input.locked ?? []) {
    const c = byId.get(l.oracleId);
    if (c) add(c, scoreCandidate(c, hasEdhrec), l.acquire, l.quantity, true);
  }

  const nonlandSlots = size - targets.lands;
  const ownedNonland = scored.filter((x) => x.c.available > 0 && !isLand(x.c));
  const unownedNonland = scored.filter(
    (x) => x.c.available === 0 && x.c.owned === 0 && !isLand(x.c) && (input.maxPrice === undefined || (x.c.priceUsd ?? 0) <= input.maxPrice),
  );

  // 2. Role targets from owned cards, then (if still short) suggestions to acquire.
  for (const role of ROLE_ORDER) {
    for (const pass of [ownedNonland, suggestUnowned ? unownedNonland : []]) {
      for (const x of pass) {
        if ((roleCount[role] ?? 0) >= targets[role] || nonlandCount >= nonlandSlots) break;
        if (!x.c.roles.includes(role) || chosen.has(x.c.oracleId)) continue;
        // Unowned cards only fill a real gap: don't suggest a weak card just to hit a number.
        if (pass === unownedNonland && x.score < 0.5) continue;
        add(x.c, x.score, pass === ownedNonland ? null : "buy");
      }
    }
    if ((roleCount[role] ?? 0) < targets[role]) {
      warnings.push(`Only ${roleCount[role] ?? 0} ${ROLE_LABEL[role].toLowerCase()} cards (aim for ${targets[role]}).`);
    }
  }

  // 3. The rest of the spells: best owned cards first.
  for (const x of ownedNonland) {
    if (nonlandCount >= nonlandSlots) break;
    add(x.c, x.score, null);
  }
  if (nonlandCount < nonlandSlots && suggestUnowned) {
    for (const x of unownedNonland) {
      if (nonlandCount >= nonlandSlots) break;
      add(x.c, x.score, "buy");
    }
  }

  // 4. Lands: owned nonbasics that make our colours (or are strong utility lands), then basics.
  const ownedLands = scored.filter((x) => x.c.available > 0 && isLand(x.c) && (landFits(x.c, identity) || (x.c.edhrec?.inclusion ?? 0) >= 0.15));
  const maxNonbasic = identity.length <= 1 ? Math.min(12, targets.lands) : targets.lands - 6;
  for (const x of ownedLands) {
    if (landCount >= maxNonbasic || landCount + nonlandCount >= size) break;
    add(x.c, x.score, null);
  }
  const basicsNeeded = size - nonlandCount - landCount;
  const cards = [...chosen.values()];
  if (basicsNeeded > 0) {
    const spells = cards.map((b) => byId.get(b.oracleId)!).filter((c) => c && !isLand(c));
    const pips = pipCounts(spells, identity);
    const colours = identity ? [...identity] : [];
    const totalPips = colours.reduce((n, col) => n + pips[col], 0);
    if (!colours.length) {
      cards.push({ oracleId: "basic:C", name: "Wastes", quantity: basicsNeeded, role: "land", acquire: null, score: 0, reason: "Basic land" });
    } else {
      // Largest-remainder split by pip share (every colour gets at least one).
      const shares = colours.map((col) => ({ col, raw: totalPips ? (pips[col] / totalPips) * basicsNeeded : basicsNeeded / colours.length }));
      const alloc = shares.map((s) => ({ ...s, n: Math.max(1, Math.floor(s.raw)) }));
      let left = basicsNeeded - alloc.reduce((n, a) => n + a.n, 0);
      for (const a of [...alloc].sort((x, y) => y.raw - Math.floor(y.raw) - (x.raw - Math.floor(x.raw)))) {
        if (left <= 0) break;
        a.n += 1;
        left -= 1;
      }
      while (left < 0) {
        const biggest = alloc.reduce((m, a) => (a.n > m.n ? a : m));
        biggest.n -= 1;
        left += 1;
      }
      for (const a of alloc) {
        if (a.n > 0) cards.push({ oracleId: `basic:${a.col}`, name: BASICS[a.col], quantity: a.n, role: "land", acquire: null, score: 0, reason: "Basic land" });
      }
    }
    landCount += basicsNeeded;
  }

  if (nonlandCount < nonlandSlots) {
    warnings.push(`Your collection only had ${nonlandCount} usable spells for this deck, so it has extra lands. Add more cards or allow suggestions.`);
  }

  // Upgrades: unowned cards that beat the weakest owned non-locked picks.
  const ownedPicks = cards.filter((b) => !b.acquire && !b.locked && b.role !== "land").sort((a, b) => a.score - b.score);
  const upgrades: BuildResult["upgrades"] = [];
  let i = 0;
  for (const x of unownedNonland) {
    if (upgrades.length >= 25) break;
    if (chosen.has(x.c.oracleId)) continue;
    const weakest = ownedPicks[i];
    if (weakest && x.score <= weakest.score + 0.25) break;
    const role = primaryRole(x.c);
    upgrades.push({
      oracleId: x.c.oracleId,
      name: x.c.name,
      quantity: 1,
      role,
      acquire: "buy",
      score: x.score,
      reason: reasonFor(x.c, role, input.commander.name, input.themeLabel),
      priceUsd: x.c.priceUsd,
      replaces: weakest?.name,
    });
    i += 1;
  }

  // Contested: owned but all copies used elsewhere, and good enough to have made this deck.
  const cutoff = ownedPicks[0]?.score ?? 0;
  const contested = scored
    .filter((x) => x.c.owned > 0 && x.c.available === 0 && !chosen.has(x.c.oracleId) && x.score > cutoff)
    .slice(0, 25)
    .map((x) => {
      const role = primaryRole(x.c);
      return {
        oracleId: x.c.oracleId,
        name: x.c.name,
        quantity: 1,
        role,
        acquire: null,
        score: x.score,
        reason: reasonFor(x.c, role, input.commander.name, input.themeLabel),
        usedIn: x.c.usedIn ?? [],
      };
    });

  const total = cards.reduce((n, b) => n + b.quantity, 0);
  const toAcquire = cards.filter((b) => b.acquire).reduce((n, b) => n + b.quantity, 0);
  return {
    cards,
    upgrades,
    contested,
    counts: { total, owned: total - toAcquire, toAcquire, lands: landCount, roles: roleCount },
    warnings,
  };
}
