import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { STACK_PRICE } from "./query";

/**
 * Two other ways to look at what the collection is worth:
 * - Gain or loss: for copies with a purchase price (from your CSV or set on a stack), what you paid
 *   against what they're worth now.
 * - Condition-adjusted: market prices are for near-mint copies, so played copies are counted at a
 *   share of that, the way shops and TCGplayer's sellers commonly price them. A rough guide only.
 * Proxies are never valued. Both are one query over your own stacks.
 */

/** Share of the near-mint price a copy in each condition usually fetches. Unknown condition counts as near mint. */
export const CONDITION_SHARE: Record<string, number> = { M: 1, NM: 1, LP: 0.85, MP: 0.7, HP: 0.5, DMG: 0.3 };

const SHARE = sql.raw(
  `CASE ci.condition ${Object.entries(CONDITION_SHARE)
    .map(([c, v]) => `WHEN '${c}' THEN ${v}`)
    .join(" ")} ELSE 1 END`,
);

export type StackGain = { oracleId: string; name: string; setCode: string; finish: string; copies: number; paid: number; now: number; change: number; imageSmall: string | null };

export type Gains = {
  /** Copies with both a purchase price and a market price. */
  copies: number;
  paid: number;
  worth: number;
  /** Stacks that gained or lost most, in total across their copies. */
  up: StackGain[];
  down: StackGain[];
};

export type ConditionValue = {
  /** The value with played copies counted at a share of the near-mint price, in US dollars. */
  adjusted: number | null;
  /** Real copies not in near-mint (or unknown) condition, and the difference they make. */
  played: number;
  less: number;
};

export async function collectionGains(db: Db, limit = 5): Promise<Gains> {
  const rows = await db.all<{ oracle_id: string; name: string; set_code: string; finish: string; copies: number; paid: number; now: number; image_small: string | null }>(sql`
    SELECT ci.oracle_id, c.name, p.set_code, ci.finish, ci.quantity AS copies,
           ci.quantity * ci.purchase_price AS paid, ci.quantity * (${STACK_PRICE}) AS now, p.image_small
    FROM collection_items ci
    JOIN cards c ON c.oracle_id = ci.oracle_id
    JOIN printings p ON p.id = ci.printing_id
    WHERE ci.purchase_price IS NOT NULL AND NOT ci.proxy AND (${STACK_PRICE}) IS NOT NULL`);
  const stacks: StackGain[] = rows.map((r) => {
    const paid = Number(r.paid);
    const now = Number(r.now);
    return { oracleId: r.oracle_id, name: r.name, setCode: r.set_code, finish: r.finish, copies: Number(r.copies), paid, now, change: Math.round((now - paid) * 100) / 100, imageSmall: r.image_small };
  });
  const sum = (k: "paid" | "now" | "copies") => stacks.reduce((n, s) => n + s[k], 0);
  return {
    copies: sum("copies"),
    paid: Math.round(sum("paid") * 100) / 100,
    worth: Math.round(sum("now") * 100) / 100,
    up: stacks.filter((s) => s.change >= 0.01).sort((a, b) => b.change - a.change).slice(0, limit),
    down: stacks.filter((s) => s.change <= -0.01).sort((a, b) => a.change - b.change).slice(0, limit),
  };
}

export async function conditionValue(db: Db): Promise<ConditionValue> {
  const [r] = await db.all<{ adjusted: number | null; full: number | null; played: number }>(sql`
    SELECT SUM(ci.quantity * (${STACK_PRICE}) * ${SHARE}) AS adjusted,
           SUM(ci.quantity * (${STACK_PRICE})) AS full,
           COALESCE(SUM(CASE WHEN ${SHARE} < 1 THEN ci.quantity ELSE 0 END), 0) AS played
    FROM collection_items ci
    JOIN cards c ON c.oracle_id = ci.oracle_id
    JOIN printings p ON p.id = ci.printing_id
    WHERE NOT ci.proxy`);
  const adjusted = r?.adjusted == null ? null : Math.round(Number(r.adjusted) * 100) / 100;
  const full = r?.full == null ? 0 : Number(r.full);
  return { adjusted, played: Number(r?.played ?? 0), less: adjusted == null ? 0 : Math.round((full - adjusted) * 100) / 100 };
}
