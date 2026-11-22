"use client";

import { useEffect, useState } from "react";
import { planBudget, type BudgetCard } from "@/lib/deck/budget";
import { currencySymbol, formatMoney, toUsd, type PriceView } from "@/lib/money";

const KEY = "budget-upgrades";

/**
 * "Spend A$50 on this deck": the upgrades to buy, best first, that fit the budget you type. The
 * budget is remembered on this device. Shown on the Upgrades tab under the cards to buy.
 */
export function BudgetUpgrades({ cards, pv }: { cards: BudgetCard[]; pv: PriceView }) {
  const [budget, setBudget] = useState("");
  useEffect(() => {
    try {
      setBudget(localStorage.getItem(KEY) ?? "");
    } catch {
      // Private mode: start empty.
    }
  }, []);
  const [copied, setCopied] = useState(false);
  const amount = Number.parseFloat(budget);
  const plan = Number.isFinite(amount) && amount > 0 ? planBudget(cards, toUsd(amount, pv)) : null;

  function change(v: string) {
    setBudget(v);
    try {
      localStorage.setItem(KEY, v);
    } catch {
      // Private mode: the budget just isn't remembered.
    }
  }

  async function copy() {
    if (!plan) return;
    const ok = await navigator.clipboard?.writeText(plan.picks.map((c) => `1 ${c.name}`).join("\n")).then(
      () => true,
      () => false,
    );
    setCopied(!!ok);
    setTimeout(() => setCopied(false), 2000);
  }

  if (pv.hide || !cards.some((c) => c.priceUsd != null)) return null;
  return (
    <section className="space-y-3 rounded-2xl border border-line bg-panel p-4" aria-labelledby="budget-h">
      <div>
        <h2 id="budget-h" className="text-lg font-semibold">
          On a budget
        </h2>
        <p className="text-sm text-muted">The strongest upgrades to buy that fit what you want to spend.</p>
      </div>
      <label className="flex items-center gap-3 text-sm">
        <span className="text-muted">Spend up to</span>
        <span className="relative">
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted">{currencySymbol(pv)}</span>
          <input
            inputMode="decimal"
            value={budget}
            onChange={(e) => change(e.target.value)}
            placeholder="50"
            aria-label="Budget"
            className="h-12 w-32 rounded-xl border border-line bg-panel pr-3 pl-11 text-base tabular-nums md:h-11 md:text-sm"
          />
        </span>
      </label>
      {plan &&
        (plan.picks.length ? (
          <>
            <ol className="divide-y divide-line">
              {plan.picks.map((c) => (
                <li key={c.oracleId} className="flex min-h-10 items-center justify-between gap-3 py-1.5 text-[15px]">
                  <span className="min-w-0 truncate">{c.name}</span>
                  <span className="shrink-0 text-sm text-muted tabular-nums">{formatMoney(c.priceUsd, pv)}</span>
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm">
                {plan.picks.length} {plan.picks.length === 1 ? "card" : "cards"} for <span className="font-semibold tabular-nums">{formatMoney(plan.spent, pv)}</span>
              </p>
              <button type="button" onClick={() => void copy()} className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm font-medium">
                {copied ? "Copied" : "Copy the list"}
              </button>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted">Nothing to buy fits that budget yet.</p>
        ))}
    </section>
  );
}
