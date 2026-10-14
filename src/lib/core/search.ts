import { categoryLabel, countsAsSpending, type CategoryId } from "./categories.ts";

/*
 * Searching your own spends: "uber", "nappies", "tesco groceries". Every word
 * must be found somewhere in the payment (the shop, the kind, the category,
 * the items or the note), in any order, ignoring case and accents.
 */

export type Searchable = {
  shopName: string | null;
  category: CategoryId;
  kind?: string | null;
  note?: string | null;
  items?: string[];
};

function fold(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’‘`´]/g, "'");
}

function squash(text: string): string {
  return text.replace(/[^a-z0-9£]+/g, "");
}

/** The words of a search, cleaned. Empty means "everything". */
export function searchWords(query: string): string[] {
  return fold(query)
    .split(/[^a-z0-9£.&'-]+/)
    .map((word) => word.replace(/^[.'-]+|[.'-]+$/g, ""))
    .filter(Boolean)
    .slice(0, 8);
}

export function matchesSearch(payment: Searchable, words: string[]): boolean {
  if (words.length === 0) return true;
  const fields = [payment.shopName ?? "", payment.kind ?? "", categoryLabel(payment.category), payment.note ?? "", ...(payment.items ?? [])].map(fold);
  const hay = fields.join(" ");
  // "myperfectcv" still finds "My Perfect CV", and "pay pal" finds "PayPal": spaces and dots are ignored for longer words.
  const flat = fields.map(squash).join("|");
  return words.every((word) => hay.includes(word) || (word.length >= 4 && flat.includes(squash(word))));
}

export type SearchTotals = { spent: number; moved: number; count: number; movedCount: number };

/** Totals for what a search found: spending, and money moved (saved, invested, transferred) kept apart. */
export function searchTotals(payments: { amount: number; category: CategoryId }[]): SearchTotals {
  const totals: SearchTotals = { spent: 0, moved: 0, count: 0, movedCount: 0 };
  for (const p of payments) {
    if (countsAsSpending(p.category)) {
      totals.spent += p.amount;
      totals.count += 1;
    } else {
      totals.moved += p.amount;
      totals.movedCount += 1;
    }
  }
  return totals;
}

/** The periods Activity offers, newest first. `days: 0` is all time. */
export const SEARCH_PERIODS = [
  { id: "1w", label: "1 week", days: 7 },
  { id: "1m", label: "1 month", days: 31 },
  { id: "3m", label: "3 months", days: 92 },
  { id: "6m", label: "6 months", days: 183 },
  { id: "1y", label: "1 year", days: 366 },
  { id: "all", label: "All time", days: 0 },
] as const;

export type SearchPeriodId = (typeof SEARCH_PERIODS)[number]["id"];

export function isSearchPeriod(value: string): value is SearchPeriodId {
  return SEARCH_PERIODS.some((p) => p.id === value);
}
