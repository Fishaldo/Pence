import { getSql } from "@/lib/db";
import { isCategory, type LineItem, type Profile, type SpendSource, type Tx, type WalletAlert } from "@/lib/core/model";

/*
 * Turning database rows into the app's own shapes. Every module in the ledger reads rows through these.
 */

export type SqlClient = Awaited<ReturnType<typeof getSql>>;

export function asBool(value: unknown): boolean {
  return value === true || value === "t" || value === "true" || value === 1;
}

function asString(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (value == null) return "";
  return String(value);
}

export function asInt(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

export function asItems(raw: string): LineItem[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row) => {
        if (!row || typeof row !== "object") return null;
        const rec = row as { name?: unknown; amountPence?: unknown };
        const name = typeof rec.name === "string" ? rec.name.slice(0, 80) : "";
        const amountPence = asInt(rec.amountPence);
        if (!name || amountPence < 0) return null;
        return { name, amountPence };
      })
      .filter((row): row is LineItem => row !== null)
      .slice(0, 40);
  } catch {
    return [];
  }
}

export function mapTx(row: {
  id: string;
  merchant: string;
  description?: string | null;
  amount_pence: number | string;
  category: string;
  spent_on: string;
  source: string;
  has_receipt: unknown;
  note: string;
  items_json: string;
  raw_alert: string;
  is_sample: unknown;
  created_at: unknown;
  kind?: string | null;
}): Tx {
  const source: SpendSource =
    row.source === "receipt" || row.source === "gallery" || row.source === "wallet" || row.source === "manual" || row.source === "bank"
      ? row.source
      : "manual";
  return {
    id: row.id,
    merchant: row.merchant,
    description: row.description || row.merchant,
    amountPence: asInt(row.amount_pence),
    category: isCategory(row.category) ? row.category : "other",
    spentOn: String(row.spent_on).slice(0, 10),
    source,
    hasReceipt: asBool(row.has_receipt),
    note: row.note ?? "",
    items: asItems(row.items_json ?? "[]"),
    rawAlert: row.raw_alert ?? "",
    isSample: asBool(row.is_sample),
    createdAt: asString(row.created_at),
    kind: row.kind ?? "",
  };
}

export function mapProfile(row: {
  display_name: string;
  monthly_income_pence: number | string;
  city: string;
  payday: number | string | null;
  onboarded: unknown;
  notify_alerts: unknown;
  lat?: number | string | null;
  lng?: number | string | null;
  location_asked?: unknown;
  weekly_day?: number | string | null;
}): Profile {
  const payday = row.payday == null ? null : asInt(row.payday);
  const lat = row.lat == null || row.lat === "" ? null : Number(row.lat);
  const lng = row.lng == null || row.lng === "" ? null : Number(row.lng);
  return {
    displayName: row.display_name ?? "",
    monthlyIncomePence: asInt(row.monthly_income_pence),
    city: row.city ?? "",
    payday: payday && payday >= 1 && payday <= 31 ? payday : null,
    onboarded: asBool(row.onboarded),
    notifyAlerts: asBool(row.notify_alerts),
    lat: lat != null && Number.isFinite(lat) ? lat : null,
    lng: lng != null && Number.isFinite(lng) ? lng : null,
    locationAsked: row.location_asked == null ? true : asBool(row.location_asked),
    weeklyDay: row.weekly_day == null || row.weekly_day === "" ? null : asInt(row.weekly_day),
  };
}

export function mapAlert(row: {
  id: string;
  raw_text: string;
  merchant: string;
  description?: string | null;
  amount_pence: number | string | null;
  suggested_category: string;
  confidence: number | string;
  created_at: unknown;
}): WalletAlert {
  return {
    id: row.id,
    rawText: row.raw_text,
    merchant: row.merchant || "Card payment",
    description: row.description || row.merchant || "Card payment",
    amountPence: row.amount_pence == null ? null : asInt(row.amount_pence),
    category: isCategory(row.suggested_category) ? row.suggested_category : "other",
    confidence: Number(row.confidence) || 0,
    createdAt: asString(row.created_at),
  };
}
