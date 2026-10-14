/*
 * The shared money model. Each part lives in its own file; this one holds the
 * shapes of a payment and a profile and gathers the rest, so code can keep
 * importing everything from "model".
 */
import type { CategoryId } from "./categories.ts";

export * from "./categories.ts";
export * from "./money.ts";
export * from "./periods.ts";
export * from "./alerts.ts";
export * from "./summary.ts";
export * from "./advice.ts";
export * from "./programmes.ts";
export { validDate } from "./dates.ts";

export type SpendSource = "receipt" | "gallery" | "wallet" | "manual" | "bank";

export type LineItem = { name: string; amountPence: number };

export type Tx = {
  id: string;
  merchant: string;
  /** The description as it first came in, such as the statement line. */
  description: string;
  amountPence: number;
  category: CategoryId;
  spentOn: string;
  source: SpendSource;
  hasReceipt: boolean;
  note: string;
  items: LineItem[];
  rawAlert: string;
  isSample: boolean;
  createdAt: string;
  /**
   * What the person said it was with one tap, as an interest id such as
   * "perfume". "-" means they chose not to say. Empty means not asked yet.
   */
  kind?: string;
};

export type Profile = {
  displayName: string;
  monthlyIncomePence: number;
  city: string;
  payday: number | null;
  onboarded: boolean;
  notifyAlerts: boolean;
  lat: number | null;
  lng: number | null;
  /** The location question after the first sign-in has been answered or skipped. */
  locationAsked: boolean;
  /** Day of the week for the weekly check-in, 0 is Sunday. Null means none. */
  weeklyDay: number | null;
};

export type WalletAlert = {
  id: string;
  rawText: string;
  merchant: string;
  /** The payee as read from the alert, before any of the person's fixes. */
  description: string;
  amountPence: number | null;
  category: CategoryId;
  confidence: number;
  createdAt: string;
};
