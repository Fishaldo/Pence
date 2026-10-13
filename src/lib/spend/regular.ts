import { dayNum, isoOf, shortDay } from "./habits.ts";
import type { CategoryId } from "./model";
import { descKey } from "./payee.ts";

/*
 * Regular payments: subscriptions, bills, rent, memberships, free trials.
 *
 * Every payment filed as a subscription is on the list. Other payments join it
 * when they come back on a steady rhythm for about the same amount, like rent
 * or a phone contract. Pence works out when each one is next due, so it can
 * remind the person a week, three days and two working days before it comes out.
 * It also notices when a bill or subscription goes up.
 */

export type Freq = "once" | "weekly" | "monthly" | "quarterly" | "yearly";

export const FREQS: Freq[] = ["once", "weekly", "monthly", "quarterly", "yearly"];

export const FREQ_LABEL: Record<Freq, string> = {
  once: "Once",
  weekly: "Every week",
  monthly: "Every month",
  quarterly: "Every 3 months",
  yearly: "Every year",
};

const PERIOD_DAYS: Record<Freq, number> = { once: 0, weekly: 7, monthly: 31, quarterly: 92, yearly: 366 };

export function isFreq(value: unknown): value is Freq {
  return typeof value === "string" && (FREQS as string[]).includes(value);
}

export type RegularSpend = {
  merchant: string;
  description?: string;
  amountPence: number;
  category: CategoryId;
  spentOn: string;
  isSample?: boolean;
};

/** What the person set: a payment they added ("m:…"), or a change to one Pence found ("p:…"). */
export type RegularSetting = {
  key: string;
  name: string;
  amountPence: number | null;
  freq: Freq | null;
  nextDue: string | null;
  stopped: boolean;
  /** The day they said they cancelled it. */
  stoppedOn?: string | null;
  remind: boolean;
  /** When the contract or deal ends, if the person told Pence. */
  contractEnd?: string | null;
};

/** A payment that went up: the old amount, the new one, and when the new one was first paid. */
export type Rise = { fromPence: number; toPence: number; on: string };

export type Regular = {
  key: string;
  name: string;
  amountPence: number;
  freq: Freq;
  lastPaid: string | null;
  nextDue: string | null;
  daysLeft: number | null;
  times: number;
  /** How often was worked out from a single payment, so it may be wrong. */
  guessed: boolean;
  manual: boolean;
  stopped: boolean;
  remind: boolean;
  /** Not paid for longer than usual: maybe cancelled. */
  lapsed: boolean;
  /** Marked as cancelled, then paid again after that. */
  paidAfterStop: boolean;
  monthlyPence: number;
  subscription: boolean;
  /** The category of the latest payment, such as bills or subscriptions. */
  category: CategoryId;
  /** The amount of the latest payment, which can differ from the usual amount. */
  lastPence: number | null;
  /** Set when the latest payment is higher than the steady amount before it. */
  rise: Rise | null;
  contractEnd: string | null;
};

/** Categories where a payment going up is worth telling the person about. */
const RISE_WATCHED = new Set<CategoryId>(["bills", "subscriptions", "housing"]);

/**
 * The latest payment is higher than the one before, which matched the one
 * before that (when there is one). A bill that moves every month by usage is
 * not a price rise, so a wobbly history is left alone.
 */
export function findRise(history: { amountPence: number; spentOn: string }[]): Rise | null {
  if (history.length < 2) return null;
  const last = history[history.length - 1];
  const prev = history[history.length - 2];
  const before = history[history.length - 3];
  const up = last.amountPence - prev.amountPence;
  if (up < Math.max(50, Math.round(prev.amountPence * 0.03))) return null;
  if (before && Math.abs(prev.amountPence - before.amountPence) > Math.max(20, prev.amountPence * 0.02)) return null;
  return { fromPence: prev.amountPence, toPence: last.amountPence, on: last.spentOn };
}

/** Categories whose spends are never "regular payments", however steady. */
const NOT_REGULAR = new Set<CategoryId>(["groceries", "dining", "fashion", "gifts", "entertainment", "travel"]);

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** The date one period after this one, keeping to the same day of the month where it exists. */
export function addFreq(iso: string, freq: Freq, anchorDay?: number): string {
  if (freq === "weekly") return isoOf(dayNum(iso) + 7);
  const months = freq === "monthly" ? 1 : freq === "quarterly" ? 3 : freq === "yearly" ? 12 : 0;
  if (months === 0) return iso;
  const [y, m, d] = iso.split("-").map(Number);
  const total = m - 1 + months;
  const year = y + Math.floor(total / 12);
  const month = total % 12;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return `${year}-${pad(month + 1)}-${pad(Math.min(anchorDay ?? d, last))}`;
}

/** The first due date on or after today, stepping on from a known one. */
export function rollForward(from: string, freq: Freq, today: string, anchorDay?: number): string {
  if (freq === "once") return from;
  let next = from;
  for (let i = 0; i < 600 && next < today; i += 1) next = addFreq(next, freq, anchorDay);
  return next;
}

function freqOfGap(gap: number): Freq | null {
  if (gap >= 5 && gap <= 9) return "weekly";
  if (gap >= 25 && gap <= 35) return "monthly";
  if (gap >= 80 && gap <= 100) return "quarterly";
  if (gap >= 350 && gap <= 380) return "yearly";
  return null;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function monthlyOf(amount: number, freq: Freq): number {
  if (freq === "weekly") return Math.round((amount * 52) / 12);
  if (freq === "quarterly") return Math.round(amount / 3);
  if (freq === "yearly") return Math.round(amount / 12);
  if (freq === "once") return 0;
  return amount;
}

/** The key a found regular payment is known by, from its statement description. */
export function payeeKey(spend: Pick<RegularSpend, "merchant" | "description">): string {
  const key = descKey(spend.description || spend.merchant) || spend.merchant.trim().toLowerCase();
  return `p:${key.slice(0, 80)}`;
}

type Found = Omit<Regular, "daysLeft" | "stopped" | "remind" | "manual" | "monthlyPence" | "paidAfterStop" | "contractEnd"> & {
  anchorDay: number;
};

function detect(spends: RegularSpend[]): Found[] {
  const groups = new Map<string, RegularSpend[]>();
  for (const spend of spends) {
    if (spend.amountPence <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(spend.spentOn)) continue;
    const key = payeeKey(spend);
    const list = groups.get(key) ?? [];
    list.push(spend);
    groups.set(key, list);
  }
  const found: Found[] = [];
  for (const [key, list] of groups) {
    list.sort((a, b) => a.spentOn.localeCompare(b.spentOn));
    const subscription = list.some((spend) => spend.category === "subscriptions");
    const days = [...new Set(list.map((spend) => spend.spentOn))];
    const amounts = list.slice(-3).map((spend) => spend.amountPence);
    const amount = Math.round(median(amounts));
    const steady = Math.max(...amounts) - Math.min(...amounts) <= Math.max(200, amount * 0.2);
    const gaps = days.slice(1).map((day, index) => dayNum(day) - dayNum(days[index]));
    const gapFreq = gaps.length > 0 ? freqOfGap(median(gaps)) : null;
    const category = list[list.length - 1].category;
    let freq: Freq | null = null;
    let guessed = false;
    if (subscription) {
      freq = gapFreq ?? "monthly";
      guessed = gapFreq == null;
    } else if (gapFreq && steady && !NOT_REGULAR.has(category)) {
      const enough = days.length >= 3 || ((category === "bills" || category === "housing") && days.length >= 2);
      if (enough) freq = gapFreq;
    }
    if (!freq) continue;
    const lastPaid = days[days.length - 1];
    const dayCounts = new Map<number, number>();
    for (const day of days) {
      const dom = Number(day.slice(8, 10));
      dayCounts.set(dom, (dayCounts.get(dom) ?? 0) + 1);
    }
    const anchorDay = [...dayCounts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
    const latest = list[list.length - 1];
    found.push({
      key,
      name: latest.merchant.trim(),
      amountPence: amount,
      freq,
      lastPaid,
      nextDue: null,
      times: days.length,
      guessed,
      lapsed: false,
      subscription,
      anchorDay,
      category,
      lastPence: latest.amountPence,
      rise: subscription || RISE_WATCHED.has(category) ? findRise(list) : null,
    });
  }
  return found;
}

/** Everything that comes out regularly, soonest first. */
export function findRegulars(spends: RegularSpend[], settings: RegularSetting[], today: string): Regular[] {
  const real = spends.filter((spend) => !spend.isSample);
  const source = real.length > 0 ? real : spends;
  const bySetting = new Map(settings.map((row) => [row.key, row]));
  const items: Regular[] = [];

  for (const row of detect(source)) {
    const set = bySetting.get(row.key);
    const freq = set?.freq ?? row.freq;
    const lastPaid = row.lastPaid as string;
    let nextDue = set?.nextDue && set.nextDue >= lastPaid ? set.nextDue : addFreq(lastPaid, freq, row.anchorDay);
    const lapsed = freq !== "once" && dayNum(today) - dayNum(lastPaid) > PERIOD_DAYS[freq] * 1.6 + 3 && !(set?.nextDue && set.nextDue >= today);
    nextDue = rollForward(nextDue, freq, today, set?.nextDue ? Number(set.nextDue.slice(8, 10)) : row.anchorDay);
    const amountPence = set?.amountPence ?? row.amountPence;
    // Cancelled, yet the money still went out after that: show it again, with a warning.
    const paidAfterStop = Boolean(set?.stopped && set.stoppedOn && lastPaid > set.stoppedOn);
    items.push({
      ...row,
      name: set?.name || row.name,
      amountPence,
      freq,
      guessed: row.guessed && !set?.freq && !set?.nextDue,
      nextDue,
      daysLeft: dayNum(nextDue) - dayNum(today),
      manual: false,
      stopped: (set?.stopped ?? false) && !paidAfterStop,
      remind: set?.remind ?? true,
      lapsed: lapsed && !paidAfterStop,
      paidAfterStop,
      monthlyPence: monthlyOf(amountPence, freq),
      contractEnd: set?.contractEnd ?? null,
    });
  }

  for (const set of settings) {
    if (!set.key.startsWith("m:") || !set.nextDue) continue;
    const freq = set.freq ?? "monthly";
    // A free trial or one-off payment drops off a few days after its date.
    if (freq === "once" && dayNum(today) - dayNum(set.nextDue) > 3) continue;
    const nextDue = rollForward(set.nextDue, freq, today, Number(set.nextDue.slice(8, 10)));
    const amountPence = set.amountPence ?? 0;
    items.push({
      key: set.key,
      name: set.name || "Payment",
      amountPence,
      freq,
      lastPaid: null,
      nextDue,
      daysLeft: dayNum(nextDue) - dayNum(today),
      times: 0,
      guessed: false,
      manual: true,
      stopped: set.stopped,
      remind: set.remind,
      lapsed: false,
      paidAfterStop: false,
      monthlyPence: monthlyOf(amountPence, freq),
      subscription: true,
      category: "subscriptions",
      lastPence: null,
      rise: null,
      contractEnd: set.contractEnd ?? null,
    });
  }

  const rank = (item: Regular) => (item.stopped ? 2 : item.lapsed ? 1 : 0);
  return items.sort((a, b) => rank(a) - rank(b) || (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999));
}

/**
 * Bank holidays in England and Wales, from gov.uk/bank-holidays.json. Banks do
 * not send payments on them, so they are not counted as working days.
 */
export const BANK_HOLIDAYS = new Set([
  "2025-12-25", "2025-12-26",
  "2026-01-01", "2026-04-03", "2026-04-06", "2026-05-04", "2026-05-25", "2026-08-31", "2026-12-25", "2026-12-28",
  "2027-01-01", "2027-03-26", "2027-03-29", "2027-05-03", "2027-05-31", "2027-08-30", "2027-12-27", "2027-12-28",
  "2028-01-03", "2028-04-14", "2028-04-17", "2028-05-01", "2028-05-29", "2028-08-28", "2028-12-25", "2028-12-26",
]);

/** Working days after `from`, up to and including `to`. Weekends and bank holidays are left out. */
export function workingDaysUntil(from: string, to: string, holidays: Set<string> = BANK_HOLIDAYS): number {
  let count = 0;
  for (let day = dayNum(from) + 1; day <= dayNum(to); day += 1) {
    const weekday = new Date(day * 86_400_000).getUTCDay();
    if (weekday === 0 || weekday === 6 || holidays.has(isoOf(day))) continue;
    count += 1;
  }
  return count;
}

export type ReminderStep = 7 | 3 | 2;

/**
 * The reminder step for a payment this many days away: a week, three days, and
 * two working days before. Each step covers the days up to the next one, so a
 * missed daily check, or a payment added five days out, still gets its
 * reminder. Send a step only when no step at or below it was sent for that due
 * date. Without a working-day count, calendar days stand in for it.
 */
export function reminderStep(daysLeft: number | null, workingLeft?: number | null): ReminderStep | null {
  if (daysLeft == null || daysLeft < 0 || daysLeft > 7) return null;
  if ((workingLeft ?? daysLeft) <= 2) return 2;
  return daysLeft <= 3 ? 3 : 7;
}

/** "in 3 days", "tomorrow", "today". */
export function inDays(daysLeft: number): string {
  return daysLeft <= 0 ? "today" : daysLeft === 1 ? "tomorrow" : `in ${daysLeft} days`;
}

/** "Due today", "Due tomorrow", "Due Sat 18 Oct · in 7 days". */
export function dueText(item: Pick<Regular, "nextDue" | "daysLeft">): string {
  if (!item.nextDue || item.daysLeft == null) return "";
  if (item.daysLeft <= 0) return "Due today";
  if (item.daysLeft === 1) return "Due tomorrow";
  return `Due ${shortDay(item.nextDue)} · in ${item.daysLeft} days`;
}

export type SentReminder = { key: string; due: string; daysBefore: number };

/**
 * The payments to remind about now, each with its step. A step is skipped when
 * that step, or a later one, was already sent for the same due date.
 */
export function remindersDue(items: Regular[], sent: SentReminder[]): { item: Regular; step: ReminderStep }[] {
  const out: { item: Regular; step: ReminderStep }[] = [];
  for (const item of items) {
    const today = item.nextDue && item.daysLeft != null ? isoOf(dayNum(item.nextDue) - item.daysLeft) : null;
    const working = today && item.nextDue ? workingDaysUntil(today, item.nextDue) : null;
    const step = reminderStep(item.daysLeft, working);
    if (!step || !item.nextDue || !item.remind || item.stopped || item.lapsed) continue;
    const already = sent.some((row) => row.key === item.key && row.due === item.nextDue && row.daysBefore <= step);
    if (!already) out.push({ item, step });
  }
  return out;
}

function pounds(pence: number): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);
}

/** The words on the phone: one payment by name, or a short list when several are close. */
export function reminderMessage(due: Regular[]): { title: string; body: string; url: string; tag: string } {
  if (due.length === 1) {
    const item = due[0];
    const days = inDays(item.daysLeft ?? 0);
    const amount = item.amountPence > 0 ? pounds(item.amountPence) : "";
    const day = shortDay(item.nextDue ?? "");
    if (item.freq === "once") {
      return {
        title: `${item.name} ends ${days}`,
        body: amount
          ? `Then ${amount} may come out. Cancel before ${day} if you don’t want it.`
          : `Cancel before ${day} if you don’t want to pay.`,
        url: "/regular",
        tag: `due-${item.key}`,
      };
    }
    return {
      title: `${item.name} comes out ${days}`,
      body: `${amount ? `${amount} on ` : ""}${day}. Still need it? Cancel before then if not.`,
      url: "/regular",
      tag: `due-${item.key}`,
    };
  }
  const list = due
    .slice(0, 4)
    .map((item) => `${item.name} ${inDays(item.daysLeft ?? 0)}`)
    .join(", ");
  return {
    title: `${due.length} payments coming out soon`,
    body: `${list}${due.length > 4 ? "…" : ""}. Still need them all?`,
    url: "/regular",
    tag: "due",
  };
}

/** The words on the phone when a contract or deal ends soon. */
export function contractEndMessage(name: string, end: string): { title: string; body: string; url: string; tag: string } {
  return {
    title: `${name}: contract ends ${shortDay(end)}`,
    body: "Prices often go up after a deal ends. Look for a better one before then.",
    url: "/bills",
    tag: `contract-${name}`,
  };
}

/** The words on the phone when a bill or subscription goes up. */
export function riseMessage(name: string, rise: Rise): { title: string; body: string; url: string; tag: string } {
  const up = rise.toPence - rise.fromPence;
  return {
    title: `${name} went up ${pounds(up)}`,
    body: `${pounds(rise.toPence)} on ${shortDay(rise.on)}, from ${pounds(rise.fromPence)}. Worth checking for a better deal.`,
    url: "/bills",
    tag: `rise-${name}`,
  };
}
