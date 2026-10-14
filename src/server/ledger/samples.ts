import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { poundsToPence, type CategoryId, type SpendSource } from "@/lib/core/model";

/*
 * The sample month, for trying Pence before adding real spends.
 */

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
  { slug: "vodafone", day: 10, merchant: "Vodafone", pounds: "20.00", category: "bills", source: "manual", receipt: false },
  { slug: "greggs", day: 26, merchant: "Greggs", pounds: "6.40", category: "dining", source: "wallet", receipt: false },
];

const SAMPLE_NOW: typeof SAMPLE_PREV = [
  { slug: "now-tesco", day: 1, merchant: "Tesco", pounds: "48.20", category: "groceries", source: "receipt", receipt: true },
  { slug: "now-uber", day: 2, merchant: "Uber", pounds: "16.80", category: "transport", source: "wallet", receipt: false },
  { slug: "now-greggs", day: 3, merchant: "Greggs", pounds: "7.10", category: "dining", source: "wallet", receipt: false },
  { slug: "now-netflix", day: 4, merchant: "Netflix", pounds: "12.99", category: "subscriptions", source: "wallet", receipt: false },
  // No items: Pence asks with one tap whether it was perfume, pharmacy or toiletries.
  { slug: "now-boots", day: 6, merchant: "Boots", pounds: "38.00", category: "health", source: "wallet", receipt: false },
  // Up from £20.00 last month: shows as a price rise on Bills.
  { slug: "now-vodafone", day: 10, merchant: "Vodafone", pounds: "22.90", category: "bills", source: "manual", receipt: false },
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
