import { looksLikePerson, saysTransfer } from "./money-sent.ts";

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

export type ParsedAlert = {
  merchant: string;
  amountPence: number | null;
  category: CategoryId;
  confidence: number;
};

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

const TONE = [
  "var(--color-forest)",
  "var(--color-tone-2)",
  "var(--color-tone-3)",
  "var(--color-tone-6)",
  "var(--color-tone-5)",
  "var(--color-clay)",
] as const;

export function categoryTone(id: CategoryId): string {
  if (id === "other") return "var(--color-clay)";
  if (!countsAsSpending(id)) return "var(--color-saved)";
  const index = CATEGORIES.findIndex((c) => c.id === id);
  return TONE[index % TONE.length] ?? TONE[0];
}

export function poundsToPence(raw: string): number | null {
  let t = raw
    .trim()
    .replace(/[£$€¥₦]/g, "")
    .replace(/\b(gbp|ngn|usd|eur)\b/gi, "")
    .replace(/\s/g, "");
  if (t.includes(",") && t.includes(".")) t = t.replace(/,/g, "");
  else if (/^\d{1,3}(,\d{3})+$/.test(t)) t = t.replace(/,/g, "");
  else if (/^\d+,\d{1,2}$/.test(t)) t = t.replace(",", ".");
  else t = t.replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const [whole, frac = ""] = t.split(".");
  const pence = Number(whole) * 100 + Number((frac + "00").slice(0, 2));
  if (!Number.isFinite(pence) || pence > 100_000_000) return null;
  return pence;
}

export function formatGBP(pence: number): string {
  const neg = pence < 0;
  const abs = Math.abs(Math.round(pence));
  const pounds = Math.floor(abs / 100);
  const rem = abs % 100;
  return `${neg ? "−" : ""}£${pounds.toLocaleString("en-GB")}.${String(rem).padStart(2, "0")}`;
}

export function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  return monthKey(new Date(y, m - 1 + delta, 1));
}

export function daysInMonth(key: string): number {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
}

export function monthShort(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "long" });
}

export function todayISO(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function clampDate(year: number, monthIndex: number, day: number): Date {
  const last = new Date(year, monthIndex + 1, 0).getDate();
  return new Date(year, monthIndex, Math.min(Math.max(day, 1), last));
}

export type PaySpan = { start: string; end: string; label: string; short: string };

export function paySpan(today: Date, payday: number | null, offset = 0): PaySpan {
  if (!payday || payday < 1 || payday > 31) {
    const key = shiftMonth(monthKey(today), offset);
    return {
      start: `${key}-01`,
      end: `${key}-${String(daysInMonth(key)).padStart(2, "0")}`,
      label: monthShort(key),
      short: monthShort(key),
    };
  }
  let month = today.getMonth();
  let year = today.getFullYear();
  const thisMonthPayday = Math.min(payday, new Date(year, month + 1, 0).getDate());
  if (today.getDate() < thisMonthPayday) {
    month -= 1;
    if (month < 0) {
      month = 11;
      year -= 1;
    }
  }
  month += offset;
  while (month < 0) {
    month += 12;
    year -= 1;
  }
  while (month > 11) {
    month -= 12;
    year += 1;
  }
  const start = clampDate(year, month, payday);
  const next = clampDate(month === 11 ? year + 1 : year, (month + 1) % 12, payday);
  const end = new Date(next);
  end.setDate(end.getDate() - 1);
  const startShort = start.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const endShort = end.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return { start: todayISO(start), end: todayISO(end), label: `${startShort} – ${endShort}`, short: startShort };
}

export function nextPayday(span: PaySpan): string {
  const [year, month, day] = span.end.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + 1);
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function spanProgress(span: PaySpan, today = new Date()): { day: number; days: number; complete: boolean } {
  const now = todayISO(today);
  const days = Math.round((Date.parse(`${span.end}T00:00:00Z`) - Date.parse(`${span.start}T00:00:00Z`)) / 86_400_000) + 1;
  if (now > span.end) return { day: days, days, complete: true };
  if (now < span.start) return { day: 0, days, complete: false };
  const day = Math.round((Date.parse(`${now}T00:00:00Z`) - Date.parse(`${span.start}T00:00:00Z`)) / 86_400_000) + 1;
  return { day, days, complete: false };
}

export function dayLabel(iso: string, today = new Date()): string {
  const current = todayISO(today);
  const y = new Date(today);
  y.setDate(today.getDate() - 1);
  const yesterday = todayISO(y);
  if (iso === current) return "Today";
  if (iso === yesterday) return "Yesterday";
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function monthProgress(key: string, today = new Date()) {
  const current = monthKey(today);
  const days = daysInMonth(key);
  if (key < current) return { day: days, days, complete: true };
  if (key > current) return { day: 0, days, complete: false };
  return { day: Math.min(today.getDate(), days), days, complete: false };
}

const KEYWORDS: { category: CategoryId; words: string[] }[] = [
  {
    category: "dining",
    words: [
      "uber eats",
      "ubereats",
      "just eat",
      "deliveroo",
      "greggs",
      "mcdonald",
      "nando",
      "wagamama",
      "starbucks",
      "costa coffee",
      "costa",
      "pret a manger",
      "pret",
      "kfc",
      "domino",
      "pizza hut",
      "burger king",
    ],
  },
  {
    category: "groceries",
    words: [
      "tesco",
      "sainsbury",
      "asda",
      "aldi",
      "lidl",
      "morrisons",
      "waitrose",
      "iceland",
      "co-op",
      "coop",
      "ocado",
      "m&s food",
      "farmfoods",
    ],
  },
  {
    category: "transport",
    words: ["uber", "bolt", "trainline", "tfl", "nexus", "stagecoach", "national rail", "free now"],
  },
  {
    category: "subscriptions",
    words: [
      "netflix",
      "spotify",
      "disney+",
      "disney plus",
      "youtube premium",
      "now tv",
      "amazon prime",
      "prime video",
      "apple music",
      "icloud",
      "puregym",
      "pure gym",
      "david lloyd",
      "nuffield",
      "the gym group",
      "gymbox",
      "gym",
    ],
  },
  {
    category: "fashion",
    words: ["primark", "zara", "asos", "h&m", "uniqlo", "shein", "nike", "jd sports", "next "],
  },
  {
    category: "entertainment",
    words: ["odeon", "vue", "cineworld", "steam", "playstation", "ticketmaster", "cinema"],
  },
  {
    category: "health",
    words: ["boots", "superdrug", "pharmacy", "holland & barrett", "lloyds pharmacy"],
  },
  {
    category: "household",
    words: ["ikea", "dunelm", "b&q", "screwfix", "the range", "wilko", "home bargains", "robert dyas"],
  },
  {
    category: "bills",
    words: [
      "octopus",
      "british gas",
      "eon",
      "edf",
      "ovo energy",
      "thames water",
      "northumbrian water",
      "council tax",
      "vodafone",
      "giffgaff",
      "virgin media",
      "tv licence",
      "tv license",
      "bt broadband",
    ],
  },
  {
    category: "housing",
    words: ["rent", "landlord", "letting", "lettings", "mortgage", "housing association"],
  },
  {
    category: "kids",
    words: ["smyths", "mothercare", "childcare", "nursery fees", "the entertainer", "kids club"],
  },
  {
    category: "pets",
    words: ["pets at home", "vets4pets", "medivet", "jollyes", "pets corner", "veterinary"],
  },
  {
    category: "education",
    words: ["udemy", "coursera", "tuition", "school fees", "open university", "exam fee"],
  },
  {
    category: "charity",
    words: ["justgiving", "donation", "gift aid", "unicef", "nspcc", "save the children", "wateraid"],
  },
  {
    category: "fees",
    words: ["overdraft fee", "overdraft interest", "late payment fee", "non-sterling", "foreign transaction fee", "account fee"],
  },
  {
    category: "cash",
    words: ["cash withdrawal", "cashpoint", "atm withdrawal", "link atm"],
  },
  {
    category: "savings",
    words: ["savings pot", "to savings", "cash isa", "premium bonds", "ns&i", "easy access saver"],
  },
  {
    category: "investments",
    words: ["vanguard", "trading 212", "hargreaves lansdown", "freetrade", "aj bell", "nutmeg", "stocks and shares isa"],
  },
  {
    category: "transfers",
    words: ["transfer to own", "own account", "to my account", "between accounts"],
  },
  {
    category: "sent",
    words: [
      "lemfi",
      "lem fi",
      "transferwise",
      "wise.com",
      "remitly",
      "worldremit",
      "world remit",
      "western union",
      "moneygram",
      "sendwave",
      "taptap send",
      "ria money",
      "paysend",
      "azimo",
      "afriex",
      "chipper cash",
    ],
  },
  {
    category: "travel",
    words: ["airbnb", "booking.com", "ryanair", "easyjet", "jet2", "british airways"],
  },
  {
    category: "personal",
    words: ["barber", "haircut", "the body shop"],
  },
];

function matchCategory(text: string): { category: CategoryId; len: number } | null {
  const hay = text.toLowerCase();
  let best: { category: CategoryId; len: number } | null = null;
  for (const rule of KEYWORDS) {
    for (const word of rule.words) {
      if (hay.includes(word) && (!best || word.length > best.len)) {
        best = { category: rule.category, len: word.length };
      }
    }
  }
  return best;
}

function tidyName(s: string): string {
  const cleaned = s
    .replace(/\.com\b/gi, "")
    .replace(/\b(with|using|via|on|for|from|paid|payment|card|google|apple|pay)\b/gi, " ");
  return cleaned
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function extractAmount(text: string): number | null {
  const patterns = [
    /£\s*(\d{1,6}(?:,\d{3})*(?:\.\d{1,2})?)/,
    /\bgbp\s*(\d{1,6}(?:,\d{3})*(?:\.\d{1,2})?)/i,
    /(\d{1,6}(?:,\d{3})*\.\d{2})\s*(?:gbp)\b/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const pence = poundsToPence(match[1]);
    if (pence != null && pence > 0) return pence;
  }
  return null;
}

function extractMerchant(text: string): string {
  let t = text.replace(/google\s*pay|apple\s*pay|gpay|apple\s*wallet|samsung\s*pay/gi, " ");
  const directed = t.match(
    /\b(?:at|to|from)\s+([a-z0-9][a-z0-9&.'’-]*(?:\s+[a-z0-9][a-z0-9&.'’-]*){0,3})/i,
  );
  if (directed) return tidyName(directed[1]);
  t = t.replace(/£\s*\d[\d.,]*|\b\d[\d.,]*\s*gbp\b/gi, " ");
  t = t.replace(/[·•|]/g, " ");
  t = t.replace(
    /\b(you|paid|spent|payment|payments|trip|completed|with|using|via|on|the|a|an|for|notification|card|no|receipt|ending|in|gbp|apple|google|pay|debited|purchase)\b/gi,
    " ",
  );
  t = t.replace(/[^a-z0-9&.'’\-\s]/gi, " ").replace(/\s+/g, " ").trim();
  return tidyName(t);
}

/**
 * True when an alert or statement line is money sent to a person: "You sent
 * £50 to Mum", "FPS J SMITH", or a line that is nothing but a name.
 */
function sentToPerson(text: string, merchant: string): boolean {
  if (!merchant || !looksLikePerson(merchant)) return false;
  // "Paid £8 at Mama's Kitchen" is a shop.
  if (/\b(at|in store|contactless)\b/i.test(text)) return false;
  if (saysTransfer(text)) return true;
  // A statement line that is only a payee name and an amount.
  const rest = text
    .replace(/£\s*\d[\d.,]*|\b\d[\d.,]*\s*gbp\b|\b\d[\d.,/-]*\b/gi, " ")
    .replace(/[^a-z'\s-]/gi, " ")
    .trim();
  return looksLikePerson(rest);
}

export function parseAlert(raw: string): ParsedAlert {
  const text = raw.replace(/\s+/g, " ").trim();
  const amountPence = extractAmount(text);
  const hit = matchCategory(text);
  const merchant = extractMerchant(text);
  const category = hit?.category ?? (sentToPerson(text, merchant) ? "sent" : "other");
  let confidence = 0.25;
  if (amountPence && merchant && hit) confidence = 0.88;
  else if (amountPence && merchant) confidence = 0.56;
  else if (amountPence && hit) confidence = 0.62;
  else if (amountPence) confidence = 0.4;
  return {
    merchant: merchant || "Card payment",
    amountPence,
    category,
    confidence,
  };
}

/** "About 20 pounds at ASDA, groceries" reads as "about £20 at ASDA, groceries". */
export function spokenToAlert(text: string): string {
  return text
    .replace(/(\d+(?:[.,]\d{1,2})?)\s*(?:pounds?|quid|gbp)\b/gi, (_, n: string) => `£${n.replace(",", ".")}`)
    .replace(/£\s*(\d+)\s*(?:and\s*)?(\d{1,2})\s*p(?:ence)?\b/gi, (_, a: string, b: string) => `£${a}.${b.padStart(2, "0")}`)
    .replace(/\s+/g, " ")
    .trim();
}

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

export type AdviceCard = {
  id: string;
  title: string;
  body: string;
  tone: "calm" | "warn";
};

const CATEGORY_TIP: Record<CategoryId, string> = {
  groceries:
    "Move the things you buy every week to the shop’s own brand, and check the Clubcard or Nectar price before the ordinary shelf ticket. A same-day Too Good To Go bag can cover breakfasts for less than another top-up shop.",
  household:
    "Refills of washing liquid and cleaning spray are cheaper in a bigger bottle from Aldi, Lidl, or Home Bargains than the branded one that lands in the grocery basket.",
  fashion:
    "Put the item on a list and wait until the next payday. Most clothes bought on a whim don’t survive a week of thinking about them.",
  entertainment:
    "Weekday showings and a Meerkat Movies code are the usual cinema cut. Look at any game or ticket purchase in this category before the next one.",
  dining:
    "Choose two evenings to eat what is already in the house. A Greggs, Deliveroo, or Just Eat habit usually shrinks faster than the weekly shop.",
  transport:
    "Add the rides up. If they repeat the same route, compare that total with a bus, Metro, or weekly ticket before you book the next one.",
  health:
    "Ask for the generic at the counter. A points offer is only a saving if you were going to buy the item at the lower price anyway.",
  bills:
    "These rarely move mid-month. If one jumped, check a fix or a social tariff before the next direct debit, not after it has left.",
  subscriptions:
    "Open each one you paid this month. Cancel the service you have not actually used in the last fortnight.",
  personal:
    "Toiletries last longer than the offer suggests. Skip the multibuy unless the bottle at home is actually empty.",
  travel:
    "A trip is fine when it was planned. If this one wasn’t, leave the extras for next month’s money.",
  gifts:
    "Decide the ceiling before you browse. A smaller present usually lands as well as the upgraded one.",
  sent:
    "Money for family and friends is a choice, not a leak. Set the amount at the start of the pay, and compare transfer fees and rates before you send money abroad.",
  housing:
    "Rent rarely moves mid-year. Check the council tax band and any discount you can claim, such as the single person discount.",
  kids:
    "Agree a list before the shop. School uniform and toy shops run offers before term and in the January sales.",
  pets:
    "Food in a bigger bag is usually cheaper per kilo. Compare the vet plan price with what you paid last year.",
  education:
    "Ask for a student or early-booking price before you pay, and check whether the course is free elsewhere.",
  charity:
    "Giving is a choice, not a leak. If you pay tax, Gift Aid adds to the gift at no cost to you.",
  fees:
    "These are avoidable. Look at what caused each one: a late payment, an overdraft, or a card used abroad.",
  cash:
    "Cash is hard to track. Note what it was spent on, or pay by card so Pence can see it.",
  other:
    "Give these a real category. Other is where forgotten memberships and card taps hide.",
  savings: "Money put aside. Not counted as spending.",
  investments: "Money invested. Not counted as spending.",
  transfers: "Money moved between your own accounts. Not counted as spending.",
};

export function buildAdvice(input: {
  city: string;
  income: number;
  current: MonthSummary;
  previous: MonthSummary;
  projected: number | null;
  complete: boolean;
  cycle: boolean;
}): AdviceCard[] {
  const cards: AdviceCard[] = [];
  const { current, previous, income, projected, city } = input;
  const period = input.cycle ? "pay" : "month";
  const top = current.byCategory[0];

  if (income > 0 && current.spent > income) {
    cards.push({
      id: "over",
      tone: "warn",
      title: `This ${period} is already past your take-home`,
      body: `You’ve logged ${formatGBP(current.spent - income)} more than the ${formatGBP(income)} that landed. Spend only on food, getting to work, or a bill until the next pay.`,
    });
  } else if (income > 0 && projected != null && !input.complete && projected > income) {
    cards.push({
      id: "pace",
      tone: "warn",
      title: "This pace overshoots your pay",
      body: `If the rest of this ${period} looks like the days so far, you’ll land near ${formatGBP(projected)} — ${formatGBP(projected - income)} over your take-home. Slow the biggest category, not a single coffee.`,
    });
  }

  if (top && top.amount > 0) {
    const share = current.spent > 0 ? top.amount / current.spent : 0;
    const ofPay = income > 0 ? ` That’s ${formatPercent(top.amount / income)} of take-home.` : "";
    let body = `${categoryLabel(top.id)} is ${formatPercent(share)} of what you’ve logged.${ofPay} ${CATEGORY_TIP[top.id]}`;
    if (
      top.id === "transport" &&
      /newcastle|tyneside|gateshead|north shields|whitley bay/i.test(city)
    ) {
      body +=
        " Around Newcastle, put the Metro and a Pop card next to those app rides before you assume the car is the only way.";
    }
    cards.push({
      id: "top",
      tone: "calm",
      title: `Most of it is ${categoryLabel(top.id).toLowerCase()}`,
      body,
    });
  }

  const rises = current.byCategory
    .map((row) => {
      const prev = previous.byCategory.find((p) => p.id === row.id)?.amount ?? 0;
      return { id: row.id, now: row.amount, prev, delta: row.amount - prev };
    })
    // Health is never something Pence tells people to cut.
    .filter((row) => row.prev >= 800 && row.delta > row.prev * 0.15 && row.id !== top?.id && row.id !== "health")
    .sort((a, b) => b.delta - a.delta);

  const rise = rises[0];
  if (rise) {
    cards.push({
      id: "rise",
      tone: "warn",
      title: `${categoryLabel(rise.id)} is up on the last ${period}`,
      body: `${formatGBP(rise.delta)} more than the last ${period}. ${CATEGORY_TIP[rise.id]}`,
    });
  }

  const other = current.byCategory.find((c) => c.id === "other");
  if (other && current.spent > 0 && other.amount / current.spent > 0.12) {
    cards.push({
      id: "other",
      tone: "calm",
      title: "A slice is still filed as Other",
      body: `${formatGBP(other.amount)} has no proper category. Naming those taps usually shows a subscription or a takeaway you didn’t think was a habit.`,
    });
  }

  const subs = current.byCategory.find((c) => c.id === "subscriptions");
  if (subs && subs.amount > 0 && cards.length < 4) {
    cards.push({
      id: "subs",
      tone: "calm",
      title: "Subscriptions leave on their own",
      body: `${formatGBP(subs.amount)} is already committed from this ${period}. ${CATEGORY_TIP.subscriptions}`,
    });
  }

  if (cards.length === 0) {
    cards.push({
      id: "empty",
      tone: "calm",
      title: "Log a few spends and the advice gets specific",
      body: "Scan a receipt, or paste a Google Pay, Apple Pay, or Uber alert. Pence will sort it and tell you what to trim.",
    });
  }

  return cards.slice(0, 4);
}

export type Programme = {
  id: string;
  name: string;
  categories: CategoryId[];
  where: string;
  when: string;
  detail: string;
  href: string;
};

export const PROGRAMMES: Programme[] = [
  {
    id: "clubcard",
    name: "Tesco Clubcard Prices",
    categories: ["groceries", "household"],
    where: "Tesco shops and the Tesco app",
    when: "Ongoing. The lower price applies when a Clubcard is scanned.",
    detail:
      "The yellow Clubcard label is a different price from the ordinary shelf ticket. Scan before you pay the big number.",
    href: "https://www.tesco.com/clubcard",
  },
  {
    id: "nectar",
    name: "Nectar Prices",
    categories: ["groceries", "household"],
    where: "Sainsbury’s",
    when: "Ongoing on the products marked with a Nectar Price.",
    detail:
      "Member prices sit under the regular ticket, and points stack on top. Worth opening the Nectar app before a big Sainsbury’s shop.",
    href: "https://www.nectar.com",
  },
  {
    id: "lidl",
    name: "Lidl Plus",
    categories: ["groceries", "household"],
    where: "The Lidl Plus app, then the till",
    when: "Coupons refresh in the app. Check them before the shop, not after you’ve paid.",
    detail:
      "The savings are coupons and weekly treats inside the app. They apply when you scan Lidl Plus at checkout.",
    href: "https://www.lidl.co.uk/",
  },
  {
    id: "aldi",
    name: "Aldi Super 6",
    categories: ["groceries"],
    where: "Aldi",
    when: "A short fruit and veg list that changes through the week.",
    detail:
      "If groceries are mostly produce, look at Super 6 before you buy the same items elsewhere at full price.",
    href: "https://www.aldi.co.uk/",
  },
  {
    id: "tgtg",
    name: "Too Good To Go",
    categories: ["groceries", "dining"],
    where: "The Too Good To Go app, collected near you",
    when: "Same-day bags, usually late afternoon or evening. They disappear once reserved.",
    detail:
      "Shops and cafés sell surplus food for a fraction of the menu price. Set your area, then check the day you actually need food.",
    href: "https://www.toogoodtogo.com/en-gb",
  },
  {
    id: "boots",
    name: "Boots Advantage Card",
    categories: ["health", "personal"],
    where: "Boots shops and the Boots app",
    when: "Points and advantage prices run continuously. Bigger points events are posted in the app.",
    detail:
      "Use it on toiletries and pharmacy items you already needed. A points multiple is not a reason to add a third basket.",
    href: "https://www.boots.com/",
  },
  {
    id: "rides",
    name: "Check the ride price first",
    categories: ["transport"],
    where: "Uber and Bolt, on the confirm screen",
    when: "Fares jump in rain, at closing time, and on match days.",
    detail:
      "The upfront price is the moment to switch to the bus or Metro. A membership fee is only worth it when it is smaller than the fees you already pay.",
    href: "https://www.uber.com/gb/en/",
  },
];

export function programmesFor(categories: CategoryId[]): Programme[] {
  const wanted = new Set(categories);
  const matched = PROGRAMMES.filter((p) => p.categories.some((c) => wanted.has(c)));
  if (matched.length > 0) return matched.slice(0, 3);
  return PROGRAMMES.filter((p) => p.categories.includes("groceries")).slice(0, 2);
}

export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}
