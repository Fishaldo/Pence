/* The categories a payment is filed under, and which of them count as spending. */

/**
 * Every category a payment can be filed under. `spending: false` marks money that
 * moves but is not spent (savings, investments, transfers between your own accounts):
 * it is kept and shown, but never counted in "spent so far".
 */
export const CATEGORIES = [
  { id: "groceries", label: "Groceries", spending: true },
  { id: "household", label: "Household", spending: true },
  { id: "housing", label: "Rent and housing", spending: true },
  { id: "bills", label: "Bills", spending: true },
  { id: "fashion", label: "Fashion", spending: true },
  { id: "entertainment", label: "Entertainment", spending: true },
  { id: "dining", label: "Dining", spending: true },
  { id: "transport", label: "Transport", spending: true },
  { id: "health", label: "Health", spending: true },
  { id: "subscriptions", label: "Subscriptions", spending: true },
  { id: "personal", label: "Personal care", spending: true },
  { id: "travel", label: "Travel", spending: true },
  { id: "gifts", label: "Gifts", spending: true },
  // Money sent to people: family at home or abroad, a partner, a friend. Spent, but not shopping.
  { id: "sent", label: "Money sent", spending: true },
  { id: "kids", label: "Kids", spending: true },
  { id: "pets", label: "Pets", spending: true },
  { id: "education", label: "Education", spending: true },
  { id: "charity", label: "Charity", spending: true },
  { id: "fees", label: "Bank fees", spending: true },
  { id: "cash", label: "Cash", spending: true },
  { id: "other", label: "Other", spending: true },
  { id: "savings", label: "Savings", spending: false },
  { id: "investments", label: "Investments", spending: false },
  { id: "transfers", label: "Transfers", spending: false },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];

const CATEGORY_SET = new Set<string>(CATEGORIES.map((c) => c.id));

export function isCategory(value: string): value is CategoryId {
  return CATEGORY_SET.has(value);
}

export function categoryLabel(id: CategoryId): string {
  return CATEGORIES.find((c) => c.id === id)?.label ?? "Other";
}

const NOT_SPENDING = new Set<string>(CATEGORIES.filter((c) => !c.spending).map((c) => c.id));

/** False for savings, investments and transfers: money moved, not spent. */
export function countsAsSpending(id: CategoryId): boolean {
  return !NOT_SPENDING.has(id);
}
