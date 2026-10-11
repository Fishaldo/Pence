import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import {
  isCategory,
  parseAlert,
  poundsToPence,
  validDate,
  type CategoryId,
  type LineItem,
  type Profile,
  type SpendSource,
  type Tx,
  type WalletAlert,
} from "@/lib/spend/model";
import { samePayment } from "@/lib/spend/duplicate";
import { descKey } from "@/lib/spend/payee";
import type { StatementRow } from "@/lib/spend/statement";

type SqlClient = Awaited<ReturnType<typeof getSql>>;

function asBool(value: unknown): boolean {
  return value === true || value === "t" || value === "true" || value === 1;
}

function asString(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (value == null) return "";
  return String(value);
}

function asInt(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function asItems(raw: string): LineItem[] {
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

function mapTx(row: {
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
  };
}

function mapProfile(row: {
  display_name: string;
  monthly_income_pence: number | string;
  city: string;
  payday: number | string | null;
  onboarded: unknown;
  notify_alerts: unknown;
  lat?: number | string | null;
  lng?: number | string | null;
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
  };
}

function mapAlert(row: {
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

type ProfileInput = {
  displayName: string;
  monthlyIncomePence: number;
  city: string;
  payday: number | null;
  notifyAlerts: boolean;
};

function readProfileInput(input: unknown): ProfileInput {
  if (!input || typeof input !== "object") throw new Error("Enter your details to continue.");
  const row = input as Record<string, unknown>;
  const displayName = typeof row.displayName === "string" ? row.displayName.trim().slice(0, 80) : "";
  const city = typeof row.city === "string" ? row.city.trim().slice(0, 80) : "";
  const monthlyIncomePence = asInt(row.monthlyIncomePence);
  let payday: number | null = null;
  if (row.payday != null && row.payday !== "") {
    payday = asInt(row.payday);
    if (payday < 1 || payday > 31) throw new Error("Payday should be a day of the month.");
  }
  if (!displayName) throw new Error("Add your name.");
  if (monthlyIncomePence <= 0) throw new Error("Add your monthly take-home pay.");
  return {
    displayName,
    monthlyIncomePence,
    city,
    payday,
    notifyAlerts: row.notifyAlerts === true,
  };
}

export const getProfile = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<Profile | null> => {
    const sql = await getSql();
    const rows = await sql<{
      display_name: string;
      monthly_income_pence: number;
      city: string;
      payday: number | null;
      onboarded: unknown;
      notify_alerts: unknown;
      lat: number | null;
      lng: number | null;
    }>`select display_name, monthly_income_pence, city, payday, onboarded, notify_alerts, lat, lng
       from profiles where user_id = ${context.userId}`;
    return rows[0] ? mapProfile(rows[0]) : null;
  });

export const saveProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => readProfileInput(input))
  .handler(async ({ context, data }): Promise<Profile> => {
    const sql = await getSql();
    const rows = await sql<{
      display_name: string;
      monthly_income_pence: number;
      city: string;
      payday: number | null;
      onboarded: unknown;
      notify_alerts: unknown;
    }>`insert into profiles (
         user_id, display_name, monthly_income_pence, city, payday, onboarded, notify_alerts
       ) values (
         ${context.userId}, ${data.displayName}, ${data.monthlyIncomePence}, ${data.city},
         ${data.payday}, true, ${data.notifyAlerts}
       )
       on conflict (user_id) do update set
         display_name = excluded.display_name,
         monthly_income_pence = excluded.monthly_income_pence,
         city = excluded.city,
         payday = excluded.payday,
         onboarded = true,
         notify_alerts = excluded.notify_alerts
       returning display_name, monthly_income_pence, city, payday, onboarded, notify_alerts`;
    return mapProfile(rows[0]);
  });

export const savePlace = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("No location.");
    const row = input as Record<string, unknown>;
    const lat = typeof row.lat === "number" ? row.lat : Number(row.lat);
    const lng = typeof row.lng === "number" ? row.lng : Number(row.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      throw new Error("That location doesn’t look right.");
    }
    return { lat, lng };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const rows = await sql<{ lat: number }>`
      update profiles set lat = ${data.lat}, lng = ${data.lng}
      where user_id = ${context.userId}
      returning lat`;
    if (!rows[0]) throw new Error("Finish setup before sharing a location.");
    return { ok: true as const };
  });

export type Place = {
  id: string;
  label: string;
  town: string;
  lat: number | null;
  lng: number | null;
  isPhone: boolean;
};

function mapPlace(row: {
  id: string;
  label: string;
  town: string;
  lat: number | null;
  lng: number | null;
  is_phone: unknown;
}): Place {
  const lat = row.lat == null ? null : Number(row.lat);
  const lng = row.lng == null ? null : Number(row.lng);
  return {
    id: row.id,
    label: row.label,
    town: row.town ?? "",
    lat: lat != null && Number.isFinite(lat) ? lat : null,
    lng: lng != null && Number.isFinite(lng) ? lng : null,
    isPhone: asBool(row.is_phone),
  };
}

async function locate(query: string): Promise<{ lat: number; lng: number } | null> {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`,
    {
      headers: { Accept: "application/json", "User-Agent": "Pence/1.0 (personal spending)" },
      signal: AbortSignal.timeout(12_000),
    },
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as { lat?: string; lon?: string }[];
  const lat = Number(rows[0]?.lat);
  const lng = Number(rows[0]?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

async function townAt(lat: number, lng: number): Promise<string> {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`,
    {
      headers: { Accept: "application/json", "User-Agent": "Pence/1.0 (personal spending)" },
      signal: AbortSignal.timeout(12_000),
    },
  );
  if (!res.ok) return "";
  const body = (await res.json()) as {
    address?: { city?: string; town?: string; village?: string; county?: string };
  };
  const address = body.address;
  return (address?.city || address?.town || address?.village || address?.county || "").slice(0, 80);
}

export const listPlaces = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<Place[]> => {
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      label: string;
      town: string;
      lat: number | null;
      lng: number | null;
      is_phone: unknown;
    }>`select id, label, town, lat, lng, is_phone from places
       where user_id = ${context.userId}
       order by is_phone desc, created_at`;
    return rows.map(mapPlace);
  });

export const savePhonePlace = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("No location.");
    const row = input as Record<string, unknown>;
    const lat = typeof row.lat === "number" ? row.lat : Number(row.lat);
    const lng = typeof row.lng === "number" ? row.lng : Number(row.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      throw new Error("That location doesn’t look right.");
    }
    return { lat, lng };
  })
  .handler(async ({ context, data }): Promise<Place> => {
    const sql = await getSql();
    const town = await townAt(data.lat, data.lng).catch(() => "");
    await sql`delete from places where user_id = ${context.userId} and is_phone = true`;
    await sql`update profiles set lat = ${data.lat}, lng = ${data.lng} where user_id = ${context.userId}`;
    const id = crypto.randomUUID();
    const rows = await sql<{
      id: string;
      label: string;
      town: string;
      lat: number | null;
      lng: number | null;
      is_phone: unknown;
    }>`insert into places (id, user_id, label, town, lat, lng, is_phone)
       values (${id}, ${context.userId}, 'This phone', ${town}, ${data.lat}, ${data.lng}, true)
       returning id, label, town, lat, lng, is_phone`;
    return mapPlace(rows[0]);
  });

export const addPlace = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("Add a place.");
    const row = input as Record<string, unknown>;
    const label = typeof row.label === "string" ? row.label.trim().slice(0, 40) : "";
    const town = typeof row.town === "string" ? row.town.trim().slice(0, 80) : "";
    if (!label) throw new Error("Name the place, such as Partner.");
    if (town.length < 2) throw new Error("Add the town or city, such as Essex.");
    return { label, town };
  })
  .handler(async ({ context, data }): Promise<Place> => {
    const sql = await getSql();
    const count = await sql<{ n: number | string }>`select count(*)::int as n from places where user_id = ${context.userId} and is_phone = false`;
    if (Number(count[0]?.n ?? 0) >= 6) throw new Error("Six other places is the limit. Remove one first.");
    const found = await locate(`${data.town}, United Kingdom`).catch(() => null);
    const id = crypto.randomUUID();
    const rows = await sql<{
      id: string;
      label: string;
      town: string;
      lat: number | null;
      lng: number | null;
      is_phone: unknown;
    }>`insert into places (id, user_id, label, town, lat, lng, is_phone)
       values (${id}, ${context.userId}, ${data.label}, ${data.town}, ${found?.lat ?? null}, ${found?.lng ?? null}, false)
       returning id, label, town, lat, lng, is_phone`;
    return mapPlace(rows[0]);
  });

export const removePlace = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const id = input && typeof input === "object" ? (input as { id?: unknown }).id : null;
    if (typeof id !== "string" || !id) throw new Error("Missing place.");
    return { id };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const rows = await sql<{ is_phone: unknown }>`
      delete from places where id = ${data.id} and user_id = ${context.userId} returning is_phone`;
    if (rows[0] && asBool(rows[0].is_phone)) {
      await sql`update profiles set lat = null, lng = null where user_id = ${context.userId}`;
    }
    return { ok: true as const };
  });

export const listTransactions = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<Tx[]> => {
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      merchant: string;
      description: string;
      amount_pence: number;
      category: string;
      spent_on: string;
      source: string;
      has_receipt: unknown;
      note: string;
      items_json: string;
      raw_alert: string;
      is_sample: unknown;
      created_at: unknown;
    }>`select id, merchant, description, amount_pence, category, spent_on, source, has_receipt, note,
              items_json, raw_alert, is_sample, created_at
       from transactions
       where user_id = ${context.userId}
       order by spent_on desc, created_at desc
       limit 500`;
    return rows.map(mapTx);
  });

export const listAlerts = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<WalletAlert[]> => {
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      raw_text: string;
      merchant: string;
      amount_pence: number | null;
      suggested_category: string;
      confidence: number;
      created_at: unknown;
    }>`select id, raw_text, merchant, description, amount_pence, suggested_category, confidence, created_at
       from wallet_alerts
       where user_id = ${context.userId} and status = 'pending'
       order by created_at desc
       limit 40`;
    return rows.map(mapAlert);
  });

async function askModel(messages: unknown[], maxTokens: number): Promise<string | null> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(45_000),
        body: JSON.stringify({
          model: "grok-4.5",
          temperature: 0,
          reasoning_effort: "low",
          max_tokens: maxTokens,
          messages,
        }),
      });
      if (!res.ok) {
        if (attempt === 0 && res.status >= 500) continue;
        return null;
      }
      const body = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const text = body.choices?.[0]?.message?.content;
      if (text) return text;
    } catch {
      if (attempt === 0) continue;
      return null;
    }
  }
  return null;
}

function parseModelJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("empty");
  return JSON.parse(body.slice(start, end + 1));
}

const CATEGORY_LIST = [
  "groceries",
  "household",
  "fashion",
  "entertainment",
  "dining",
  "transport",
  "health",
  "bills",
  "subscriptions",
  "personal",
  "travel",
  "gifts",
  "other",
].join(", ");

export type ReceiptRead = {
  merchant: string;
  /** The shop name as printed, before any of the person's fixes. */
  description: string;
  amountPence: number | null;
  spentOn: string | null;
  category: CategoryId;
  items: LineItem[];
  confidence: number;
  note: string;
  isSpend: boolean;
  kind: "receipt" | "statement" | "none";
  spends: StatementRow[];
  skippedIn: number;
};

function moneyOf(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return poundsToPence(value.toFixed(2));
  if (typeof value === "string") return poundsToPence(value);
  return null;
}

function receiptDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (validDate(v)) return v;
  const slash = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (!slash) return null;
  const day = slash[1].padStart(2, "0");
  const month = slash[2].padStart(2, "0");
  const year = slash[3].length === 2 ? `20${slash[3]}` : slash[3];
  const iso = `${year}-${month}-${day}`;
  return validDate(iso) ? iso : null;
}

function lineName(name: string, qty: unknown): string {
  const q = typeof qty === "number" || typeof qty === "string" ? String(qty).trim() : "";
  if (!q || q === "1" || q === "1.0" || q === "x1") return name;
  return `${q} × ${name}`.slice(0, 80);
}

function absMoney(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return poundsToPence(Math.abs(value).toFixed(2));
  if (typeof value !== "string") return null;
  return poundsToPence(value.trim().replace(/^[+−-]/, "").replace(/^\((.*)\)$/, "$1"));
}

const STATEMENT_MONTHS: Record<string, string> = {
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  oct: "10",
  nov: "11",
  dec: "12",
};

function statementDay(value: unknown, today: string): string | null {
  if (typeof value !== "string") return null;
  const direct = receiptDate(value.trim());
  if (direct) return direct;
  const named = value.trim().match(/(\d{1,2})\s+([A-Za-z]{3,9})(?:\s+(\d{4}))?/);
  if (!named) return null;
  const month = STATEMENT_MONTHS[named[2].slice(0, 3).toLowerCase()];
  if (!month) return null;
  const day = named[1].padStart(2, "0");
  let year = named[3] ?? today.slice(0, 4);
  let iso = `${year}-${month}-${day}`;
  if (!named[3] && validDate(iso) && iso > today) {
    year = String(Number(year) - 1);
    iso = `${year}-${month}-${day}`;
  }
  return validDate(iso) ? iso : null;
}

function outgoingRows(parsed: Record<string, unknown>, today: string): { spends: StatementRow[]; skippedIn: number } {
  const raw = Array.isArray(parsed.transactions)
    ? parsed.transactions
    : Array.isArray(parsed.spends)
      ? parsed.spends
      : [];
  const spends: StatementRow[] = [];
  let skippedIn = 0;
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const merchant = typeof rec.merchant === "string" ? rec.merchant.trim().replace(/\s+/g, " ").slice(0, 80) : "";
    if (!merchant || /balance|current account|available funds/.test(merchant.toLowerCase())) continue;
    const amountText = typeof rec.amount === "string" ? rec.amount : typeof rec.amount === "number" ? String(rec.amount) : "";
    const direction = String(rec.direction ?? "").toLowerCase();
    const markedIn = /\b(in|credit|income|incoming)\b/.test(direction) && !/\bout|debit/.test(direction);
    const markedOut = /\bout|debit|spend|payment/.test(direction);
    const plus = /^\s*\+/.test(amountText);
    const minus = /^\s*[-−]/.test(amountText);
    if (markedIn || (plus && !minus && !markedOut)) {
      skippedIn += 1;
      continue;
    }
    const amountPence = absMoney(rec.amount);
    if (!amountPence || amountPence <= 0) continue;
    const hinted = parseAlert(merchant).category;
    const category =
      typeof rec.category === "string" && isCategory(rec.category) && rec.category !== "other" ? rec.category : hinted;
    spends.push({
      merchant,
      amountPence,
      spentOn: statementDay(rec.date, today) ?? today,
      category,
    });
    if (spends.length >= 40) break;
  }
  return { spends, skippedIn };
}

type Rule = { merchant: string; category: CategoryId };

/** The person's own fixes, by description. */
async function loadRules(sql: SqlClient, userId: string): Promise<Map<string, Rule>> {
  const rows = await sql<{ desc_key: string; merchant: string; category: string }>`
    select desc_key, merchant, category from payee_rules where user_id = ${userId}`;
  const rules = new Map<string, Rule>();
  for (const row of rows) {
    if (row.desc_key && row.merchant) {
      rules.set(row.desc_key, { merchant: row.merchant, category: isCategory(row.category) ? row.category : "other" });
    }
  }
  return rules;
}

/** Name and file a payment the way the person did last time, if they fixed one like it. */
function applyRule(
  rules: Map<string, Rule>,
  description: string,
  merchant: string,
  category: CategoryId,
): { merchant: string; category: CategoryId; description: string } {
  const rule = rules.get(descKey(description));
  if (!rule) return { merchant, category, description };
  return { merchant: rule.merchant, category: rule.category, description };
}

export const readReceipt = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("Attach a photo first.");
    const image = (input as { imageDataUrl?: unknown }).imageDataUrl;
    if (typeof image !== "string" || !image.startsWith("data:image/")) {
      throw new Error("That file isn’t a photo Pence can read.");
    }
    if (image.length > 2_400_000) throw new Error("That photo is too large. Try another shot, closer in.");
    return { imageDataUrl: image };
  })
  .handler(async ({ data, context }): Promise<ReceiptRead> => {
    const today = new Date().toISOString().slice(0, 10);
    const empty: ReceiptRead = {
      merchant: "",
      description: "",
      amountPence: null,
      spentOn: null,
      category: "other",
      items: [],
      confidence: 0,
      note: "",
      isSpend: false,
      kind: "none",
      spends: [],
      skippedIn: 0,
    };
    if (!process.env.XAI_API_KEY) {
      throw new Error("Reading photos isn’t available right now. Type the shop and the total.");
    }
    const text = await askModel(
      [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Read this photo for a spending app. It may be a till receipt, an invoice, a card payment, or a bank app screenshot that lists transactions. Reply with JSON only, no markdown:
{"kind":"receipt","isSpend":true,"merchant":"","total":"12.40","currency":"GBP","date":"YYYY-MM-DD","time":"","category":"groceries","payment":"","items":[{"name":"Milk","qty":"1","amount":"1.45"}],"transactions":[],"confidence":0.9,"note":""}
Rules:
- kind is "receipt" for one shop or one payment, "statement" for a bank or wallet screen that lists several transactions, or "none" if it shows neither.
- A bank balance, transaction list, or reward account screen is valid. Do not reject it for not being a till receipt.
- For kind "statement", leave merchant and total empty and put every visible transaction in transactions: {"merchant":"BOOTS","amount":"12.00","direction":"out","date":"YYYY-MM-DD","category":"health"}.
- direction is "out" for a minus sign, a debit, or money spent. direction is "in" for a plus sign, green text, a credit, or money received. The account balance is not a transaction.
- Do not invent rows that are not on the screen. If a date is only a day and month, use the year of today (${today}) unless that would put the date in the future, then use the previous year.
- For a receipt, list every product in items. Do not include subtotal, tax, VAT, discount, change, cash, or balance as items. Leave transactions empty.
- amount and total are decimal money strings like 12.40, not whole pence. qty is the quantity, or "1" if it is not printed.
- category is one of: ${CATEGORY_LIST}. Use other if unsure. Rent and lettings are bills. A food shop is groceries. A pharmacy is health.
- date is YYYY-MM-DD, or null if there is none. Today is ${today}. Do not invent today's date for a receipt.
- currency is GBP, NGN, USD, EUR, or OTHER.
- If this is not a receipt and not a list of payments, set kind to "none", isSpend to false, confidence to 0, and note to one short sentence saying what the photo actually shows.`,
            },
            { type: "image_url", image_url: { url: data.imageDataUrl, detail: "high" } },
          ],
        },
      ],
      2800,
    );
    if (!text) throw new Error("Couldn’t read that photo. Type the shop and the total.");
    try {
      const parsed = parseModelJson(text) as Record<string, unknown>;
      const isSpend = parsed.isSpend !== false;
      const merchant = typeof parsed.merchant === "string" ? parsed.merchant.trim().slice(0, 80) : "";
      let amountPence = moneyOf(parsed.total);
      const spentOn = receiptDate(parsed.date);
      const category =
        typeof parsed.category === "string" && isCategory(parsed.category) ? parsed.category : "other";
      const itemsRaw = Array.isArray(parsed.items) ? parsed.items : [];
      const items: LineItem[] = [];
      for (const item of itemsRaw) {
        if (!item || typeof item !== "object") continue;
        const rec = item as { name?: unknown; amount?: unknown; qty?: unknown };
        const rawName = typeof rec.name === "string" ? rec.name.trim().slice(0, 80) : "";
        if (!rawName) continue;
        const lowered = rawName.toLowerCase();
        if (/^(sub\s?total|total|vat|tax|change|cash|balance|discount|amount due)$/.test(lowered)) continue;
        const amount = moneyOf(rec.amount);
        items.push({ name: lineName(rawName, rec.qty), amountPence: amount ?? 0 });
        if (items.length >= 40) break;
      }
      if ((amountPence == null || amountPence <= 0) && items.some((item) => item.amountPence > 0)) {
        amountPence = items.reduce((sum, item) => sum + item.amountPence, 0);
      }
      const currency = typeof parsed.currency === "string" ? parsed.currency.trim().toUpperCase() : "";
      const payment = typeof parsed.payment === "string" ? parsed.payment.trim().slice(0, 40) : "";
      const time = typeof parsed.time === "string" ? parsed.time.trim().slice(0, 8) : "";
      const modelNote = typeof parsed.note === "string" ? parsed.note.trim().slice(0, 180) : "";
      const bits: string[] = [];
      if (currency && currency !== "GBP") bits.push(`Printed in ${currency}, not pounds — check the total.`);
      if (payment) bits.push(payment);
      if (/^\d{1,2}:\d{2}/.test(time)) bits.push(time.slice(0, 5));
      if (modelNote) bits.push(modelNote);
      const note = bits.join(" · ").slice(0, 200);
      const confidence =
        typeof parsed.confidence === "number" ? Math.min(1, Math.max(0, parsed.confidence)) : 0.55;
      const kindRaw = typeof parsed.kind === "string" ? parsed.kind.toLowerCase() : "";
      const { spends, skippedIn } = outgoingRows(parsed, today);
      const statement = kindRaw === "statement" || (kindRaw !== "receipt" && spends.length > 1);
      if (statement) {
        if (spends.length === 0) {
          return {
            ...empty,
            kind: "none",
            skippedIn,
            note:
              skippedIn > 0
                ? "This only shows money coming in. Pence tracks spending."
                : modelNote || "No money going out on this screen.",
          };
        }
        const rules = await loadRules(await getSql(), context.userId);
        return {
          ...empty,
          isSpend: true,
          kind: "statement",
          spends: spends.map((row) => {
            const fixed = applyRule(rules, row.merchant, row.merchant, row.category);
            return { ...row, merchant: fixed.merchant, category: fixed.category, description: row.merchant };
          }),
          skippedIn,
          confidence,
          note: skippedIn > 0 ? "Money coming in was left out." : "",
        };
      }
      if (!isSpend || kindRaw === "none") {
        return {
          ...empty,
          note: modelNote || "This photo doesn’t show a shop, a total, or money spent.",
          isSpend: false,
        };
      }
      const fixed = merchant
        ? applyRule(await loadRules(await getSql(), context.userId), merchant, merchant, category)
        : { merchant, category, description: merchant };
      return {
        merchant: fixed.merchant,
        description: merchant,
        amountPence: amountPence && amountPence > 0 ? amountPence : null,
        spentOn,
        category: fixed.category,
        items,
        confidence,
        note,
        isSpend: true,
        kind: "receipt",
        spends: [],
        skippedIn: 0,
      };
    } catch {
      throw new Error("Couldn’t read that photo. Type the shop and the total.");
    }
  });

async function refineAlert(raw: string, base: ReturnType<typeof parseAlert>) {
  if (base.confidence >= 0.72 && base.amountPence) return base;
  const text = await askModel(
    [
      {
        role: "user",
        content: `This is a UK card, Google Pay, Apple Pay, or bank notification. Reply with JSON only:
{"merchant":"","total":"12.40","category":""}
category is one of: ${CATEGORY_LIST}. Use other if you cannot tell. total is pounds as a string.
Text: ${raw.slice(0, 800)}`,
      },
    ],
    220,
  );
  if (!text) return base;
  try {
    const parsed = parseModelJson(text) as Record<string, unknown>;
    const merchant =
      typeof parsed.merchant === "string" && parsed.merchant.trim()
        ? parsed.merchant.trim().slice(0, 80)
        : base.merchant;
    const amount =
      typeof parsed.total === "string" || typeof parsed.total === "number"
        ? poundsToPence(String(parsed.total))
        : null;
    const category =
      typeof parsed.category === "string" && isCategory(parsed.category) ? parsed.category : base.category;
    return {
      merchant,
      amountPence: amount && amount > 0 ? amount : base.amountPence,
      category,
      confidence: Math.max(base.confidence, category === "other" ? 0.5 : 0.8),
    };
  } catch {
    return base;
  }
}

export const createAlert = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("Paste the payment alert.");
    const raw = (input as { rawText?: unknown }).rawText;
    if (typeof raw !== "string" || raw.trim().length < 3) throw new Error("Paste the payment alert.");
    return { rawText: raw.trim().slice(0, 800) };
  })
  .handler(async ({ context, data }): Promise<WalletAlert> => {
    const base = parseAlert(data.rawText);
    const parsed = await refineAlert(data.rawText, base);
    const sql = await getSql();
    const fixed = applyRule(await loadRules(sql, context.userId), parsed.merchant, parsed.merchant, parsed.category);
    const id = crypto.randomUUID();
    const rows = await sql<{
      id: string;
      raw_text: string;
      merchant: string;
      description: string;
      amount_pence: number | null;
      suggested_category: string;
      confidence: number;
      created_at: unknown;
    }>`insert into wallet_alerts (
         id, user_id, raw_text, merchant, description, amount_pence, suggested_category, confidence, status
       ) values (
         ${id}, ${context.userId}, ${data.rawText}, ${fixed.merchant}, ${parsed.merchant}, ${parsed.amountPence},
         ${fixed.category}, ${fixed.merchant !== parsed.merchant ? Math.max(parsed.confidence, 0.9) : parsed.confidence}, 'pending'
       )
       returning id, raw_text, merchant, description, amount_pence, suggested_category, confidence, created_at`;
    return mapAlert(rows[0]);
  });

type SpendInput = {
  id?: string;
  merchant: string;
  description: string;
  amountPence: number;
  category: CategoryId;
  spentOn: string;
  source: SpendSource;
  hasReceipt: boolean;
  note: string;
  items: LineItem[];
  imageDataUrl: string | null;
  rawAlert: string;
  alertId: string | null;
};

function readSpend(input: unknown, withImage: boolean): SpendInput {
  if (!input || typeof input !== "object") throw new Error("That spend couldn’t be saved.");
  const row = input as Record<string, unknown>;
  const merchant = typeof row.merchant === "string" ? row.merchant.trim().slice(0, 80) : "";
  const amountPence = asInt(row.amountPence);
  const category = typeof row.category === "string" && isCategory(row.category) ? row.category : null;
  const spentOn = typeof row.spentOn === "string" ? row.spentOn : "";
  const sourceRaw = row.source;
  const source: SpendSource =
    sourceRaw === "receipt" || sourceRaw === "gallery" || sourceRaw === "wallet" || sourceRaw === "manual" || sourceRaw === "bank"
      ? sourceRaw
      : "manual";
  if (!merchant) throw new Error("Add the shop or payee.");
  if (amountPence <= 0) throw new Error("Add an amount greater than zero.");
  if (!category) throw new Error("Pick a category.");
  if (!validDate(spentOn)) throw new Error("That date doesn’t look right.");
  const note = typeof row.note === "string" ? row.note.trim().slice(0, 200) : "";
  const rawAlert = typeof row.rawAlert === "string" ? row.rawAlert.slice(0, 800) : "";
  const items = asItems(JSON.stringify(row.items ?? []));
  // Pence keeps what it read from a photo, never the photo itself.
  const hadImage = withImage && typeof row.imageDataUrl === "string" && row.imageDataUrl.startsWith("data:image/");
  const alertId = typeof row.alertId === "string" && row.alertId.length < 80 ? row.alertId : null;
  const id = typeof row.id === "string" ? row.id : undefined;
  const description = typeof row.description === "string" ? row.description.trim().slice(0, 120) : "";
  return {
    id,
    merchant,
    description: description || merchant,
    amountPence,
    category,
    spentOn,
    source,
    hasReceipt: row.hasReceipt === true || hadImage,
    note,
    items,
    imageDataUrl: null,
    rawAlert,
    alertId,
  };
}

async function closeAlert(sql: SqlClient, userId: string, alertId: string | null) {
  if (!alertId) return;
  await sql`update wallet_alerts set status = 'saved'
            where id = ${alertId} and user_id = ${userId}`;
}

export const saveSpend = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => readSpend(input, true))
  .handler(async ({ context, data }): Promise<Tx> => {
    const sql = await getSql();
    const id = crypto.randomUUID();
    const rows = await sql<{
      id: string;
      merchant: string;
      description: string;
      amount_pence: number;
      category: string;
      spent_on: string;
      source: string;
      has_receipt: unknown;
      note: string;
      items_json: string;
      raw_alert: string;
      is_sample: unknown;
      created_at: unknown;
    }>`insert into transactions (
         id, user_id, merchant, description, amount_pence, category, spent_on, source, has_receipt,
         note, items_json, image_data, raw_alert, is_sample
       ) values (
         ${id}, ${context.userId}, ${data.merchant}, ${data.description}, ${data.amountPence}, ${data.category},
         ${data.spentOn}, ${data.source}, ${data.hasReceipt}, ${data.note},
         ${JSON.stringify(data.items)}, ${data.imageDataUrl}, ${data.rawAlert}, false
       )
       returning id, merchant, description, amount_pence, category, spent_on, source, has_receipt,
                 note, items_json, raw_alert, is_sample, created_at`;
    await closeAlert(sql, context.userId, data.alertId);
    return mapTx(rows[0]);
  });

function readBankRows(input: unknown): StatementRow[] {
  if (!input || typeof input !== "object") throw new Error("Nothing to import.");
  const raw = (input as { rows?: unknown }).rows;
  if (!Array.isArray(raw) || raw.length === 0) throw new Error("No spends in that file.");
  const rows: StatementRow[] = [];
  for (const item of raw.slice(0, 200)) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const merchant = typeof row.merchant === "string" ? row.merchant.trim().slice(0, 80) : "";
    const spentOn = typeof row.spentOn === "string" ? row.spentOn : "";
    const amountPence = asInt(row.amountPence);
    const category = typeof row.category === "string" && isCategory(row.category) ? row.category : "other";
    const description = typeof row.description === "string" ? row.description.trim().slice(0, 120) : "";
    if (!merchant || amountPence <= 0 || !validDate(spentOn)) continue;
    rows.push({ merchant, spentOn, amountPence, category, description: description || merchant });
  }
  if (rows.length === 0) throw new Error("No outgoing spends in that file.");
  return rows;
}

export type Clash = {
  index: number;
  existingId: string | null;
  existingMerchant: string;
  existingAmountPence: number;
  existingSpentOn: string;
  existingSource: string;
  existingHasReceipt: boolean;
  inFile: boolean;
};

export const findClashes = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => ({ rows: readBankRows(input) }))
  .handler(async ({ context, data }): Promise<Clash[]> => {
    const sql = await getSql();
    const existing = await sql<{
      id: string;
      merchant: string;
      amount_pence: number | string;
      spent_on: string;
      source: string;
      has_receipt: unknown;
    }>`select id, merchant, amount_pence, spent_on::text as spent_on, source, has_receipt
       from transactions where user_id = ${context.userId}`;
    const saved = existing.map((row) => ({
      id: row.id,
      merchant: row.merchant,
      amountPence: asInt(row.amount_pence),
      spentOn: String(row.spent_on).slice(0, 10),
      source: row.source,
      hasReceipt: asBool(row.has_receipt),
    }));
    const used = new Set<string>();
    const clashes: Clash[] = [];
    data.rows.forEach((row, index) => {
      const hit = saved.find(
        (item) => !used.has(item.id) && samePayment(item, { merchant: row.merchant, amountPence: row.amountPence, spentOn: row.spentOn }),
      );
      if (hit) {
        used.add(hit.id);
        clashes.push({
          index,
          existingId: hit.id,
          existingMerchant: hit.merchant,
          existingAmountPence: hit.amountPence,
          existingSpentOn: hit.spentOn,
          existingSource: hit.source,
          existingHasReceipt: hit.hasReceipt,
          inFile: false,
        });
        return;
      }
      const earlier = data.rows.slice(0, index).find((item) =>
        samePayment(item, { merchant: row.merchant, amountPence: row.amountPence, spentOn: row.spentOn }),
      );
      if (!earlier) return;
      clashes.push({
        index,
        existingId: null,
        existingMerchant: earlier.merchant,
        existingAmountPence: earlier.amountPence,
        existingSpentOn: earlier.spentOn,
        existingSource: "bank",
        existingHasReceipt: false,
        inFile: true,
      });
    });
    return clashes;
  });

export const importBank = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => ({ rows: readBankRows(input) }))
  .handler(async ({ context, data }): Promise<{ added: number; skipped: number }> => {
    const sql = await getSql();
    const rules = await loadRules(sql, context.userId);
    let added = 0;
    for (const row of data.rows) {
      const id = crypto.randomUUID();
      const description = row.description || row.merchant;
      // A line still showing its printed name has not been touched in review, so the person's fix applies.
      const fixed =
        row.merchant === description ? applyRule(rules, description, row.merchant, row.category) : { ...row, description };
      await sql`insert into transactions (
        id, user_id, merchant, description, amount_pence, category, spent_on, source, has_receipt,
        note, items_json, image_data, raw_alert, is_sample
      ) values (
        ${id}, ${context.userId}, ${fixed.merchant}, ${description}, ${row.amountPence}, ${fixed.category},
        ${row.spentOn}, 'bank', false, 'From your bank — no receipt', '[]', null, '', false
      )`;
      added += 1;
    }
    return { added, skipped: 0 };
  });

export type UpdateResult = { tx: Tx; alsoChanged: number };

/**
 * Save an edited payment. With applyToSame, a new name or category also goes to
 * every other payment with the same description, and Pence keeps the fix so
 * future payments like it come in named and filed.
 */
export const updateSpend = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const spend = readSpend(input, false);
    if (!spend.id) throw new Error("Missing spend.");
    const applyToSame = !!input && typeof input === "object" && (input as { applyToSame?: unknown }).applyToSame === true;
    return { ...spend, applyToSame };
  })
  .handler(async ({ context, data }): Promise<UpdateResult> => {
    const sql = await getSql();
    const before = await sql<{ merchant: string; description: string; category: string }>`
      select merchant, description, category from transactions where id = ${data.id} and user_id = ${context.userId}`;
    if (!before[0]) throw new Error("That spend is no longer here.");
    const rows = await sql<{
      id: string;
      merchant: string;
      description: string;
      amount_pence: number;
      category: string;
      spent_on: string;
      source: string;
      has_receipt: unknown;
      note: string;
      items_json: string;
      raw_alert: string;
      is_sample: unknown;
      created_at: unknown;
    }>`update transactions set
         description = case when description = '' then merchant else description end,
         merchant = ${data.merchant},
         amount_pence = ${data.amountPence},
         category = ${data.category},
         spent_on = ${data.spentOn},
         note = ${data.note},
         items_json = ${JSON.stringify(data.items)}
       where id = ${data.id} and user_id = ${context.userId}
       returning id, merchant, description, amount_pence, category, spent_on, source, has_receipt,
                 note, items_json, raw_alert, is_sample, created_at`;
    if (!rows[0]) throw new Error("That spend is no longer here.");

    let alsoChanged = 0;
    const renamed = before[0].merchant !== data.merchant;
    const refiled = before[0].category !== data.category;
    const key = descKey(before[0].description || before[0].merchant);
    if (data.applyToSame && key && (renamed || refiled)) {
      const others = await sql<{ id: string; description: string; merchant: string }>`
        select id, description, merchant from transactions
        where user_id = ${context.userId} and id <> ${data.id}`;
      for (const other of others) {
        if (descKey(other.description || other.merchant) !== key) continue;
        if (renamed && refiled) {
          await sql`update transactions set
                      description = case when description = '' then merchant else description end,
                      merchant = ${data.merchant}, category = ${data.category}
                    where id = ${other.id} and user_id = ${context.userId}`;
        } else if (renamed) {
          await sql`update transactions set
                      description = case when description = '' then merchant else description end,
                      merchant = ${data.merchant}
                    where id = ${other.id} and user_id = ${context.userId}`;
        } else {
          await sql`update transactions set category = ${data.category} where id = ${other.id} and user_id = ${context.userId}`;
        }
        alsoChanged += 1;
      }
      await sql`insert into payee_rules (user_id, desc_key, merchant, category)
                values (${context.userId}, ${key}, ${data.merchant}, ${data.category})
                on conflict (user_id, desc_key) do update set
                  merchant = excluded.merchant, category = excluded.category, created_at = now()`;
    }
    return { tx: mapTx(rows[0]), alsoChanged };
  });

export const deleteSpend = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const id = input && typeof input === "object" ? (input as { id?: unknown }).id : null;
    if (typeof id !== "string" || !id) throw new Error("Missing spend.");
    return { id };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await sql`delete from transactions where id = ${data.id} and user_id = ${context.userId}`;
    return { ok: true as const };
  });

export const dismissAlert = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const id = input && typeof input === "object" ? (input as { id?: unknown }).id : null;
    if (typeof id !== "string" || !id) throw new Error("Missing alert.");
    return { id };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await sql`update wallet_alerts set status = 'dismissed'
              where id = ${data.id} and user_id = ${context.userId}`;
    return { ok: true as const };
  });

const SAMPLE_PREV: {
  slug: string;
  day: number;
  merchant: string;
  pounds: string;
  category: CategoryId;
  source: SpendSource;
  receipt: boolean;
  items?: { name: string; pounds: string }[];
}[] = [
  {
    slug: "tesco-a",
    day: 2,
    merchant: "Tesco Extra",
    pounds: "86.40",
    category: "groceries",
    source: "receipt",
    receipt: true,
    items: [
      { name: "Semi Skimmed Milk 4 Pints", pounds: "1.65" },
      { name: "Hovis Wholemeal Bread", pounds: "1.45" },
      { name: "Persil Bio Liquid 1.4L", pounds: "7.00" },
      { name: "Chicken Breast Fillets 650g", pounds: "4.95" },
    ],
  },
  { slug: "uber-a", day: 3, merchant: "Uber", pounds: "14.20", category: "transport", source: "wallet", receipt: false },
  { slug: "netflix", day: 5, merchant: "Netflix", pounds: "12.99", category: "subscriptions", source: "wallet", receipt: false },
  { slug: "spotify", day: 5, merchant: "Spotify", pounds: "11.99", category: "subscriptions", source: "wallet", receipt: false },
  {
    slug: "primark",
    day: 7,
    merchant: "Primark",
    pounds: "32.00",
    category: "fashion",
    source: "receipt",
    receipt: true,
    items: [
      { name: "Black Joggers", pounds: "14.00" },
      { name: "White T-Shirt", pounds: "6.00" },
      { name: "Hoodie", pounds: "12.00" },
    ],
  },
  {
    slug: "boots",
    day: 8,
    merchant: "Boots",
    pounds: "14.50",
    category: "health",
    source: "receipt",
    receipt: true,
    items: [
      { name: "Paracetamol 16 Tablets", pounds: "0.89" },
      { name: "Colgate Toothpaste 75ml", pounds: "2.50" },
      { name: "Vitamin D 90 Tablets", pounds: "11.11" },
    ],
  },
  { slug: "sains", day: 9, merchant: "Sainsbury's", pounds: "54.20", category: "groceries", source: "receipt", receipt: true },
  { slug: "nando", day: 11, merchant: "Nando's", pounds: "28.50", category: "dining", source: "wallet", receipt: false },
  { slug: "uber-b", day: 12, merchant: "Uber", pounds: "11.60", category: "transport", source: "wallet", receipt: false },
  { slug: "odeon", day: 13, merchant: "Odeon", pounds: "19.00", category: "entertainment", source: "wallet", receipt: false },
  { slug: "aldi", day: 16, merchant: "Aldi", pounds: "41.10", category: "groceries", source: "gallery", receipt: true },
  { slug: "deliveroo", day: 18, merchant: "Deliveroo", pounds: "24.80", category: "dining", source: "wallet", receipt: false },
  { slug: "ikea", day: 20, merchant: "IKEA", pounds: "22.40", category: "household", source: "receipt", receipt: true },
  { slug: "uber-c", day: 22, merchant: "Uber", pounds: "18.40", category: "transport", source: "wallet", receipt: false },
  { slug: "octopus", day: 24, merchant: "Octopus Energy", pounds: "68.00", category: "bills", source: "manual", receipt: false },
  { slug: "greggs", day: 26, merchant: "Greggs", pounds: "6.40", category: "dining", source: "wallet", receipt: false },
];

const SAMPLE_NOW: typeof SAMPLE_PREV = [
  { slug: "now-tesco", day: 1, merchant: "Tesco", pounds: "48.20", category: "groceries", source: "receipt", receipt: true },
  { slug: "now-uber", day: 2, merchant: "Uber", pounds: "16.80", category: "transport", source: "wallet", receipt: false },
  { slug: "now-greggs", day: 3, merchant: "Greggs", pounds: "7.10", category: "dining", source: "wallet", receipt: false },
  { slug: "now-netflix", day: 4, merchant: "Netflix", pounds: "12.99", category: "subscriptions", source: "wallet", receipt: false },
];

function isoOn(key: string, day: number): string {
  const [y, m] = key.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  const d = Math.min(day, last);
  return `${key}-${String(d).padStart(2, "0")}`;
}

export const seedSamples = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const today = new Date();
    const current = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
    const prevDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const previous = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;
    const existing = await sql<{ id: string }>`
      select id from transactions where user_id = ${context.userId} and is_sample = true`;
    const have = new Set(existing.map((row) => row.id));
    const planned: { id: string; spentOn: string; row: (typeof SAMPLE_PREV)[number] }[] = [];
    for (const row of SAMPLE_PREV) {
      planned.push({
        id: `sample_${context.userId}_${row.slug}`.slice(0, 140),
        spentOn: isoOn(previous, row.day),
        row,
      });
    }
    for (const row of SAMPLE_NOW) {
      if (row.day > today.getDate()) continue;
      planned.push({
        id: `sample_${context.userId}_${row.slug}`.slice(0, 140),
        spentOn: isoOn(current, row.day),
        row,
      });
    }
    let added = 0;
    for (const item of planned) {
      if (have.has(item.id)) continue;
      const amount = poundsToPence(item.row.pounds) ?? 0;
      const note = item.row.receipt ? "" : "Sample wallet alert — no paper receipt";
      const items = (item.row.items ?? []).map((line) => ({ name: line.name, amountPence: poundsToPence(line.pounds) ?? 0 }));
      await sql`insert into transactions (
        id, user_id, merchant, description, amount_pence, category, spent_on, source, has_receipt,
        note, items_json, raw_alert, is_sample
      ) values (
        ${item.id}, ${context.userId}, ${item.row.merchant}, ${item.row.merchant}, ${amount}, ${item.row.category},
        ${item.spentOn}, ${item.row.source}, ${item.row.receipt}, ${note}, ${JSON.stringify(items)}, '', true
      )`;
      added += 1;
    }
    return { added };
  });

export const clearSamples = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql<{ id: string }>`
      delete from transactions where user_id = ${context.userId} and is_sample = true returning id`;
    return { removed: rows.length };
  });

export const getAdvice = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("Nothing to review yet.");
    const row = input as Record<string, unknown>;
    const fingerprint = typeof row.fingerprint === "string" ? row.fingerprint.slice(0, 300) : "";
    const brief = typeof row.brief === "string" ? row.brief.slice(0, 2500) : "";
    if (!fingerprint || !brief) throw new Error("Nothing to review yet.");
    return { fingerprint, brief };
  })
  .handler(async ({ context, data }): Promise<{ tips: string[]; source: "cache" | "fresh" | "unavailable" }> => {
    const sql = await getSql();
    const cached = await sql<{ body: string }>`
      select body from advice_cache
      where user_id = ${context.userId} and fingerprint = ${data.fingerprint}`;
    if (cached[0]?.body) {
      try {
        const tips = JSON.parse(cached[0].body) as unknown;
        if (Array.isArray(tips) && tips.every((t) => typeof t === "string")) {
          return { tips: tips.slice(0, 4), source: "cache" };
        }
      } catch {
        /* regenerate */
      }
    }
    const text = await askModel(
      [
        {
          role: "user",
          content: `You are Pence, a UK spending coach. Use only the figures below. Do not invent discount codes, prices, or "this week's" deals. You may name ongoing programmes: Tesco Clubcard Prices, Nectar Prices, Lidl Plus, Aldi Super 6, Too Good To Go, Boots Advantage Card. Reply with JSON only: {"tips":["...","...","..."]}
Each tip is one or two sentences, specific to these numbers, British spelling, no emoji.
${data.brief}`,
        },
      ],
      420,
    );
    if (!text) return { tips: [], source: "unavailable" };
    try {
      const parsed = parseModelJson(text) as { tips?: unknown };
      const tips = Array.isArray(parsed.tips)
        ? parsed.tips.filter((t): t is string => typeof t === "string" && t.trim().length > 0).slice(0, 4)
        : [];
      if (tips.length === 0) return { tips: [], source: "unavailable" };
      await sql`insert into advice_cache (user_id, fingerprint, body)
                values (${context.userId}, ${data.fingerprint}, ${JSON.stringify(tips)})
                on conflict (user_id, fingerprint) do update set body = excluded.body, created_at = now()`;
      return { tips, source: "fresh" };
    } catch {
      return { tips: [], source: "unavailable" };
    }
  });
