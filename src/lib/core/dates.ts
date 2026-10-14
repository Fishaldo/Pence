/*
 * Dates, the UK way. Every date in Briv is a plain YYYY-MM-DD string for a day
 * in the UK. "Today" is today in Europe/London, whatever clock the phone or the
 * server runs on, so a spend at 00:30 on payday lands in the new pay period.
 *
 * Day arithmetic works on whole days counted from 1 January 1970 (`dayNum`),
 * which never meets a clock change.
 */

const DAY_MS = 86_400_000;

let londonFormat: Intl.DateTimeFormat | null = null;

/** Today in the UK, as YYYY-MM-DD. */
export function londonToday(now: Date = new Date()): string {
  londonFormat ??= new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = londonFormat.formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function dayNum(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

export function isoOf(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

/** True for a real day written YYYY-MM-DD: 2026-02-29 is not one. */
export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export function addDays(iso: string, days: number): string {
  return isoOf(dayNum(iso) + days);
}

/** 0 is Sunday. */
export function weekdayOf(iso: string): number {
  return new Date(dayNum(iso) * DAY_MS).getUTCDay();
}

export function monthLength(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function iso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** A month counted on from another: (2026, 11) + 3 is (2027, 2). Months are 1 to 12. */
export function addMonths(year: number, month: number, by: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + by;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/** "25 Oct": a day in a label, read the same in every time zone. */
export function shortDate(value: string): string {
  return new Date(dayNum(value) * DAY_MS).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

/* ------------------------------------------------------------------ */
/* Bank holidays                                                       */
/* ------------------------------------------------------------------ */

/** Easter Sunday, by the Gregorian computus. */
function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(year, month, day);
}

function firstMonday(year: number, month: number): string {
  const first = iso(year, month, 1);
  return addDays(first, (8 - weekdayOf(first)) % 7);
}

function lastMonday(year: number, month: number): string {
  const last = iso(year, month, monthLength(year, month));
  return addDays(last, -((weekdayOf(last) + 6) % 7));
}

/** Holidays moved or added by proclamation, which no rule predicts. */
const ONE_OFF: Record<number, { moved?: Record<string, string>; added?: string[] }> = {
  2020: { moved: { early: "2020-05-08" } },
  2022: { moved: { spring: "2022-06-02" }, added: ["2022-06-03", "2022-09-19"] },
  2023: { added: ["2023-05-08"] },
};

const holidayCache = new Map<number, Set<string>>();

/**
 * Bank holidays in England and Wales. Bacs, which moves Direct Debits and
 * standing orders, keeps these across the whole UK, so they decide when money
 * really leaves an account. Worked out from the rules, so they never run out.
 */
export function bankHolidays(year: number): Set<string> {
  const cached = holidayCache.get(year);
  if (cached) return cached;
  const extra = ONE_OFF[year];
  const days: string[] = [];

  // New Year's Day, or the Monday after when it falls at a weekend.
  const newYear = iso(year, 1, 1);
  const ny = weekdayOf(newYear);
  days.push(ny === 6 ? addDays(newYear, 2) : ny === 0 ? addDays(newYear, 1) : newYear);

  const easter = easterSunday(year);
  days.push(addDays(easter, -2), addDays(easter, 1));
  days.push(extra?.moved?.early ?? firstMonday(year, 5));
  days.push(extra?.moved?.spring ?? lastMonday(year, 5));
  days.push(lastMonday(year, 8));

  // Christmas and Boxing Day, each moved to the next free weekday.
  const christmas = iso(year, 12, 25);
  const cw = weekdayOf(christmas);
  if (cw === 5) days.push(christmas, iso(year, 12, 28));
  else if (cw === 6) days.push(iso(year, 12, 27), iso(year, 12, 28));
  else if (cw === 0) days.push(iso(year, 12, 26), iso(year, 12, 27));
  else days.push(christmas, iso(year, 12, 26));

  for (const day of extra?.added ?? []) days.push(day);
  const set = new Set(days);
  holidayCache.set(year, set);
  return set;
}

export function isBankHoliday(value: string): boolean {
  return bankHolidays(Number(value.slice(0, 4))).has(value);
}

export function isWorkingDay(value: string): boolean {
  const weekday = weekdayOf(value);
  return weekday !== 0 && weekday !== 6 && !isBankHoliday(value);
}

/** This day if banks work on it, else the working day before. */
export function workingDayOnOrBefore(value: string): string {
  let day = value;
  for (let i = 0; i < 10 && !isWorkingDay(day); i += 1) day = addDays(day, -1);
  return day;
}

/** This day if banks work on it, else the working day after: when a Direct Debit really leaves. */
export function workingDayOnOrAfter(value: string): string {
  let day = value;
  for (let i = 0; i < 10 && !isWorkingDay(day); i += 1) day = addDays(day, 1);
  return day;
}

/** Working days after `from`, up to and including `to`. Weekends and bank holidays are left out. */
export function workingDaysUntil(from: string, to: string): number {
  let count = 0;
  for (let day = dayNum(from) + 1; day <= dayNum(to); day += 1) if (isWorkingDay(isoOf(day))) count += 1;
  return count;
}

/* ------------------------------------------------------------------ */
/* Paydays                                                             */
/* ------------------------------------------------------------------ */

/**
 * How someone is paid. A plain number is a day of the month, as the first app
 * stored it. Null means no payday is known, so periods are calendar months.
 */
export type Payday =
  | number
  | { rule: "day_of_month"; day: number }
  | { rule: "last_working_day" }
  | { rule: "last_friday" }
  | null;

type Rule = Exclude<Payday, number | null>;

/** True when a payday is known, so periods run payday to payday rather than by calendar month. */
export function hasPayday(payday: Payday | undefined): boolean {
  return ruleOf(payday) !== null;
}

function ruleOf(payday: Payday | undefined): Rule | null {
  if (payday == null) return null;
  if (typeof payday === "number") return payday >= 1 && payday <= 31 ? { rule: "day_of_month", day: payday } : null;
  if (payday.rule === "day_of_month" && !(payday.day >= 1 && payday.day <= 31)) return null;
  return payday;
}

/**
 * The day pay arrives in a month. A day of the month that falls on a weekend or
 * bank holiday moves to the working day before, as UK employers pay; the 31st
 * in a 30-day month is the 30th.
 */
export function paydayIn(year: number, month: number, payday: Payday): string | null {
  const rule = ruleOf(payday);
  if (!rule) return null;
  const last = iso(year, month, monthLength(year, month));
  if (rule.rule === "last_working_day") return workingDayOnOrBefore(last);
  if (rule.rule === "last_friday") return workingDayOnOrBefore(addDays(last, -((weekdayOf(last) + 2) % 7)));
  return workingDayOnOrBefore(iso(year, month, Math.min(rule.day, monthLength(year, month))));
}

/** The pay period that holds a day: from one payday to the day before the next. */
export function payPeriodOf(day: string, payday: Payday, offset = 0): { start: string; end: string } {
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7));
  const rule = ruleOf(payday);
  if (!rule) {
    const at = addMonths(year, month, offset);
    return { start: iso(at.year, at.month, 1), end: iso(at.year, at.month, monthLength(at.year, at.month)) };
  }
  // A payday moved back can fall in the month before, so look one month either side.
  let anchor = addMonths(year, month, 1);
  for (let i = 0; i < 3 && (paydayIn(anchor.year, anchor.month, rule) as string) > day; i += 1) {
    anchor = addMonths(anchor.year, anchor.month, -1);
  }
  const startAt = addMonths(anchor.year, anchor.month, offset);
  const nextAt = addMonths(startAt.year, startAt.month, 1);
  const start = paydayIn(startAt.year, startAt.month, rule) as string;
  const next = paydayIn(nextAt.year, nextAt.month, rule) as string;
  return { start, end: addDays(next, -1) };
}
