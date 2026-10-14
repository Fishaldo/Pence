import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { isCategory, parseAlert, poundsToPence, validDate, type CategoryId, type LineItem } from "@/lib/core/model";
import type { StatementRow } from "@/lib/core/statement";
import type { MoneyIn } from "@/lib/core/payday";
import { CATEGORY_LIST, askModel, parseModelJson } from "./ai";
import { applyRule, loadRules } from "./rules";

/*
 * Reading a photo or PDF: a receipt, or a bank or card screenshot of payments.
 */

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
  /** Money coming in, kept only so Pence can ask whether one of them is pay. */
  moneyIn: MoneyIn[];
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

function outgoingRows(
  parsed: Record<string, unknown>,
  today: string,
): { spends: StatementRow[]; skippedIn: number; moneyIn: MoneyIn[] } {
  const raw = Array.isArray(parsed.transactions)
    ? parsed.transactions
    : Array.isArray(parsed.spends)
      ? parsed.spends
      : [];
  const spends: StatementRow[] = [];
  const moneyIn: MoneyIn[] = [];
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
      const inPence = absMoney(rec.amount);
      if (inPence && inPence > 0 && moneyIn.length < 20) {
        moneyIn.push({ merchant, amountPence: inPence, date: statementDay(rec.date, today) ?? today });
      }
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
  return { spends, skippedIn, moneyIn };
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
      moneyIn: [],
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
      const { spends, skippedIn, moneyIn } = outgoingRows(parsed, today);
      const statement = kindRaw === "statement" || (kindRaw !== "receipt" && spends.length > 1);
      if (statement) {
        if (spends.length === 0) {
          return {
            ...empty,
            kind: "none",
            skippedIn,
            moneyIn,
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
          moneyIn,
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
        moneyIn: [],
      };
    } catch {
      throw new Error("Couldn’t read that photo. Type the shop and the total.");
    }
  });
