import { countsAsSpending, type CategoryId } from "./categories.ts";
import type { Tx } from "./model.ts";
import type { PaySpan } from "./periods.ts";

/* Totals for a month or a pay period, and the searches they suggest. */

export type MonthSummary = {
  key: string;
  /** Money spent. Savings, investments and transfers are not in this total. */
  spent: number;
  count: number;
  /** Money moved to savings, investments or your own accounts. Shown apart, never as spending. */
  moved: number;
  byCategory: { id: CategoryId; amount: number }[];
  byMerchant: { name: string; amount: number; count: number }[];
};

function summarizeRows(rows: Tx[], key: string): MonthSummary {
  const cat = new Map<CategoryId, number>();
  const merch = new Map<string, { name: string; amount: number; count: number }>();
  let spent = 0;
  let count = 0;
  let moved = 0;
  for (const tx of rows) {
    if (!countsAsSpending(tx.category)) {
      moved += tx.amountPence;
      continue;
    }
    spent += tx.amountPence;
    count += 1;
    cat.set(tx.category, (cat.get(tx.category) ?? 0) + tx.amountPence);
    const slug = tx.merchant.trim().toLowerCase();
    const prev = merch.get(slug);
    if (prev) {
      prev.amount += tx.amountPence;
      prev.count += 1;
    } else {
      merch.set(slug, { name: tx.merchant, amount: tx.amountPence, count: 1 });
    }
  }
  return {
    key,
    spent,
    count,
    moved,
    byCategory: [...cat.entries()]
      .map(([id, amount]) => ({ id, amount }))
      .sort((a, b) => b.amount - a.amount),
    byMerchant: [...merch.values()].sort((a, b) => b.amount - a.amount).slice(0, 5),
  };
}

export function summarize(txs: Tx[], key: string): MonthSummary {
  return summarizeRows(
    txs.filter((t) => t.spentOn.slice(0, 7) === key),
    key,
  );
}

export function summarizeSpan(txs: Tx[], span: PaySpan): MonthSummary {
  return summarizeRows(
    txs.filter((t) => t.spentOn >= span.start && t.spentOn <= span.end),
    span.start,
  );
}

export type Habit = { name: string; amount: number; count: number };

export function frequentShops(
  txs: { merchant: string; amountPence: number; isSample: boolean }[],
): { shops: Habit[]; usingSamples: boolean } {
  const real = txs.filter((tx) => !tx.isSample && tx.merchant.trim());
  const usingSamples = real.length === 0;
  const source = usingSamples ? txs.filter((tx) => tx.merchant.trim()) : real;
  const map = new Map<string, Habit>();
  for (const tx of source) {
    const name = tx.merchant.trim();
    const key = name.toLowerCase();
    const prev = map.get(key);
    if (prev) {
      prev.amount += tx.amountPence;
      prev.count += 1;
    } else {
      map.set(key, { name, amount: tx.amountPence, count: 1 });
    }
  }
  const shops = [...map.values()].sort((a, b) => b.count - a.count || b.amount - a.amount).slice(0, 5);
  return { shops, usingSamples: usingSamples && shops.length > 0 };
}

const SPEND_SEARCH: Record<CategoryId, string | null> = {
  groceries: "supermarket groceries",
  household: "household",
  fashion: "clothes",
  entertainment: "cinema days out",
  dining: "restaurant takeaway",
  transport: "train tickets",
  health: "pharmacy",
  bills: null,
  subscriptions: "streaming",
  personal: "toiletries",
  travel: "holiday flights",
  gifts: "gifts",
  sent: null,
  housing: null,
  kids: "kids toys clothes",
  pets: "pet food",
  education: "courses books",
  charity: null,
  fees: null,
  cash: null,
  other: null,
  savings: null,
  investments: null,
  transfers: null,
};

export function spendQueries(
  txs: { category: CategoryId; amountPence: number; isSample: boolean }[],
  limit = 3,
): string[] {
  const real = txs.filter((tx) => !tx.isSample && tx.amountPence > 0);
  const source = real.length > 0 ? real : txs.filter((tx) => tx.amountPence > 0);
  const totals = new Map<CategoryId, number>();
  for (const tx of source) totals.set(tx.category, (totals.get(tx.category) ?? 0) + tx.amountPence);
  const queries = [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => SPEND_SEARCH[id])
    .filter((query): query is string => Boolean(query));
  return [...new Set(queries)].slice(0, limit);
}

export function projectedSpend(spent: number, day: number, days: number): number | null {
  if (day <= 0) return null;
  return Math.round((spent / day) * days);
}
