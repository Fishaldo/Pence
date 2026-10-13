import { addFreq, type Regular } from "./regular.ts";
import { countsAsSpending, type CategoryId, type PaySpan, type Tx } from "./model.ts";
import { dayNum, isoOf } from "./habits.ts";

/*
 * Money until payday: what is safe to spend, the bills still to come, the pay
 * that came in, the week so far, and a budget made from the person's own pays.
 */

export type BillToCome = { key: string; name: string; due: string; amountPence: number };

/**
 * Regular payments still to come out from today until the last day of this
 * pay. A weekly one counts each time it comes out. A bill already paid this
 * time has moved on to its next date, so it is not counted twice.
 */
export function billsBeforePayday(items: Regular[], today: string, end: string): BillToCome[] {
  const out: BillToCome[] = [];
  for (const item of items) {
    if (item.stopped || item.lapsed || !item.nextDue || item.amountPence <= 0) continue;
    let due = item.nextDue;
    let guard = 0;
    while (due <= end && guard < 6) {
      if (due >= today) out.push({ key: item.key, name: item.name, due, amountPence: item.amountPence });
      if (item.freq === "once") break;
      due = addFreq(due, item.freq);
      guard += 1;
    }
  }
  return out.sort((a, b) => a.due.localeCompare(b.due) || b.amountPence - a.amountPence);
}

export type SafeToSpend = {
  /** Take-home, less what is spent, less bills still to come. Below zero means over. */
  safePence: number;
  billsPence: number;
  /** Days from today until the day before payday, today included. */
  daysLeft: number;
  /** About this much a day keeps to it. Zero when nothing is left. */
  perDayPence: number;
};

export function safeToSpend(input: {
  takeHomePence: number;
  spentPence: number;
  bills: BillToCome[];
  today: string;
  end: string;
}): SafeToSpend {
  const billsPence = input.bills.reduce((sum, bill) => sum + bill.amountPence, 0);
  const safePence = input.takeHomePence - input.spentPence - billsPence;
  const daysLeft = Math.max(1, dayNum(input.end) - dayNum(input.today) + 1);
  const perDayPence = safePence > 0 ? Math.floor(safePence / daysLeft) : 0;
  return { safePence, billsPence, daysLeft, perDayPence };
}

export type MoneyIn = { merchant: string; amountPence: number; date: string };

const PAY_WORDS = /\b(salary|wages?|payroll|pay ?roll|bgc|net pay|monthly pay|hmrc|pension|universal credit|dwp)\b/i;

/**
 * Money coming in that looks like pay: it says salary or wages, or it is most of
 * the take-home the person gave. Refunds and transfers from their own pots do not count.
 */
export function looksLikePay(rows: MoneyIn[], usualPence: number): MoneyIn[] {
  return rows
    .filter((row) => row.amountPence > 0)
    .filter((row) => !/\b(refund|pot|transfer from|savings|cashback|interest)\b/i.test(row.merchant))
    .filter((row) => PAY_WORDS.test(row.merchant) || (usualPence > 0 && row.amountPence >= usualPence * 0.6))
    .sort((a, b) => b.amountPence - a.amountPence);
}

/** Monday to Sunday around a day, as ISO dates. */
export function weekOf(today: string): { start: string; end: string } {
  const day = dayNum(today);
  const weekday = new Date(day * 86_400_000).getUTCDay();
  const back = (weekday + 6) % 7;
  return { start: isoOf(day - back), end: isoOf(day - back + 6) };
}

export type RangeTotal = {
  spentPence: number;
  count: number;
  byCategory: { id: CategoryId; amountPence: number }[];
};

/** What was spent between two days, both included. Savings and transfers are left out. */
export function spentBetween(txs: Pick<Tx, "amountPence" | "category" | "spentOn">[], start: string, end: string): RangeTotal {
  const byCategory = new Map<CategoryId, number>();
  let spentPence = 0;
  let count = 0;
  for (const tx of txs) {
    if (tx.spentOn < start || tx.spentOn > end || !countsAsSpending(tx.category)) continue;
    spentPence += tx.amountPence;
    count += 1;
    byCategory.set(tx.category, (byCategory.get(tx.category) ?? 0) + tx.amountPence);
  }
  return {
    spentPence,
    count,
    byCategory: [...byCategory.entries()].map(([id, amountPence]) => ({ id, amountPence })).sort((a, b) => b.amountPence - a.amountPence),
  };
}

export type BudgetLine = {
  id: string;
  name: string;
  /** The category it counts, or null for a line the person tracks by hand, such as perfume. */
  category: CategoryId | null;
  amountPence: number;
  /** Pence never suggests cutting this line: rent, bills, health and the like. */
  neverCut: boolean;
};

/** Lines Pence never suggests cutting, unless the person says otherwise. */
export const NEVER_CUT = new Set<CategoryId>(["housing", "bills", "health", "kids", "education"]);

function roundUpTo(pence: number, step: number): number {
  return Math.ceil(pence / step) * step;
}

/**
 * A first budget from the person's own pays: each category's average over the
 * last finished pay periods with spends in them (up to three), rounded up to the
 * next £5, plus savings when they saved. Categories under £5 a pay are left out.
 */
export function suggestBudget(txs: Pick<Tx, "amountPence" | "category" | "spentOn" | "isSample">[], spans: PaySpan[]): BudgetLine[] {
  const real = txs.filter((tx) => !tx.isSample);
  const source = real.length > 0 ? real : txs;
  // Only pays with something logged count, so a person with one pay of history is not averaged over three.
  const used = spans.slice(0, 3).filter((span) => source.some((tx) => tx.spentOn >= span.start && tx.spentOn <= span.end));
  if (used.length === 0) return [];
  const totals = new Map<CategoryId, number>();
  for (const span of used) {
    for (const tx of source) {
      if (tx.spentOn < span.start || tx.spentOn > span.end) continue;
      if (tx.category === "transfers") continue;
      totals.set(tx.category, (totals.get(tx.category) ?? 0) + tx.amountPence);
    }
  }
  const lines: BudgetLine[] = [];
  for (const [category, total] of totals) {
    const average = total / used.length;
    if (average < 500) continue;
    lines.push({
      id: `c:${category}`,
      name: "",
      category,
      amountPence: roundUpTo(average, 500),
      neverCut: NEVER_CUT.has(category),
    });
  }
  return lines.sort((a, b) => Number(b.neverCut) - Number(a.neverCut) || b.amountPence - a.amountPence);
}

/** How far through a budget line this pay is. */
export function lineProgress(line: BudgetLine, txs: Pick<Tx, "amountPence" | "category" | "spentOn">[], span: PaySpan) {
  const spentPence = line.category
    ? txs
        .filter((tx) => tx.category === line.category && tx.spentOn >= span.start && tx.spentOn <= span.end)
        .reduce((sum, tx) => sum + tx.amountPence, 0)
    : 0;
  return { spentPence, leftPence: line.amountPence - spentPence, over: spentPence > line.amountPence };
}

export type BillKind = {
  id: "energy" | "broadband" | "mobile" | "tv" | "insurance" | "streaming" | "water" | "council-tax" | "rent" | "gym" | "other";
  label: string;
  /** Words for public deal pages. Empty when there is nothing to switch to. */
  query: string;
  /** False for bills a household cannot move, such as water or council tax. */
  switchable: boolean;
  /** A plain line about this kind of bill, true for everyone in Britain. */
  note: string;
};

const BILL_KINDS: { test: RegExp; kind: BillKind }[] = [
  {
    test: /council tax/,
    kind: {
      id: "council-tax",
      label: "Council tax",
      query: "",
      switchable: false,
      note: "Council tax cannot be switched. If you live alone, ask your council about the single person discount.",
    },
  },
  {
    test: /\bwater\b|severn trent|thames water|anglian|yorkshire water|united utilities|northumbrian|south west water|welsh water|dwr cymru|southern water|wessex water/,
    kind: {
      id: "water",
      label: "Water",
      query: "",
      switchable: false,
      note: "Homes cannot switch water company. A water meter or a social tariff can still bring it down.",
    },
  },
  {
    test: /octopus|british gas|\beon\b|e\.on|\bedf\b|ovo|scottish power|so energy|utility warehouse|shell energy|outfox|energy|electric|\bgas\b/,
    kind: { id: "energy", label: "Gas and electricity", query: "energy fixed tariff", switchable: true, note: "" },
  },
  {
    test: /broadband|virgin media|\bbt\b|talktalk|plusnet|hyperoptic|community fibre|vodafone broadband|sky broadband|fibre/,
    kind: { id: "broadband", label: "Broadband", query: "broadband deal", switchable: true, note: "" },
  },
  {
    test: /vodafone|\bee\b|\bo2\b|three|giffgaff|smarty|voxi|lebara|id mobile|tesco mobile|sky mobile|lyca|mobile/,
    kind: { id: "mobile", label: "Mobile", query: "sim only deal", switchable: true, note: "" },
  },
  {
    test: /tv licen[cs]e/,
    kind: { id: "tv", label: "TV licence", query: "", switchable: false, note: "The TV licence is set by law and cannot be switched." },
  },
  {
    test: /\bsky\b|now tv|now entertainment/,
    kind: { id: "tv", label: "TV", query: "sky tv deal", switchable: true, note: "" },
  },
  {
    test: /insurance|aviva|admiral|direct line|churchill|lv=|hastings|axa|legal & general|vitality/,
    kind: { id: "insurance", label: "Insurance", query: "insurance cashback", switchable: true, note: "" },
  },
  {
    test: /netflix|disney|spotify|apple music|youtube|prime video|amazon prime|paramount|audible|deezer/,
    kind: { id: "streaming", label: "Streaming", query: "streaming subscription offer", switchable: true, note: "" },
  },
  {
    test: /puregym|pure gym|the gym|gym group|david lloyd|nuffield|anytime fitness|jd gyms|\bgym\b/,
    kind: { id: "gym", label: "Gym", query: "gym membership offer", switchable: true, note: "" },
  },
  {
    test: /\brent\b|landlord|letting|mortgage|housing association/,
    kind: { id: "rent", label: "Rent or mortgage", query: "", switchable: false, note: "" },
  },
];

/** What kind of bill a payment is, from its name: Vodafone is mobile, Octopus is energy. */
export function billKind(name: string): BillKind {
  const hay = name.toLowerCase();
  for (const rule of BILL_KINDS) if (rule.test.test(hay)) return rule.kind;
  return { id: "other", label: "Bill", query: "", switchable: true, note: "" };
}
