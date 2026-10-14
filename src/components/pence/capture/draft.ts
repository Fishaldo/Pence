import { poundsToPence, todayISO, type CategoryId, type LineItem, type SpendSource } from "@/lib/core/model";
import type { DraftItem } from "../items-editor";

/*
 * A spend being checked before it is saved, as the form holds it.
 */

export type Draft = {
  merchant: string;
  /** The name as it came in, before the person or Pence tidied it. */
  description: string;
  amount: string;
  category: CategoryId;
  spentOn: string;
  source: SpendSource;
  hasReceipt: boolean;
  note: string;
  items: DraftItem[];
  imageDataUrl: string | null;
  rawAlert: string;
  alertId: string | null;
  unsure: boolean;
};

export function moneyField(pence: number | null): string {
  if (pence == null) return "";
  return (pence / 100).toFixed(2);
}

export function toDraftItems(items: LineItem[]): DraftItem[] {
  return items.map((item) => ({
    name: item.name,
    amount: item.amountPence > 0 ? (item.amountPence / 100).toFixed(2) : "",
  }));
}

export function fromDraftItems(items: DraftItem[]): LineItem[] {
  const out: LineItem[] = [];
  for (const item of items) {
    const name = item.name.trim();
    if (!name) continue;
    out.push({ name: name.slice(0, 80), amountPence: poundsToPence(item.amount) ?? 0 });
    if (out.length >= 40) break;
  }
  return out;
}

export function blankDraft(partial: Partial<Draft>): Draft {
  return {
    merchant: "",
    description: "",
    amount: "",
    category: "other",
    spentOn: todayISO(),
    source: "manual",
    hasReceipt: false,
    note: "",
    items: [],
    imageDataUrl: null,
    rawAlert: "",
    alertId: null,
    unsure: false,
    ...partial,
  };
}
