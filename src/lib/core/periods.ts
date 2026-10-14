import { addDays, hasPayday, londonToday, payPeriodOf, shortDate, type Payday } from "./dates.ts";

/* Months and pay periods, always counted in UK dates. */

/** "2026-10": the month of a moment, in the UK. */
export function monthKey(d: Date): string {
  return londonToday(d).slice(0, 7);
}

export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  const index = y * 12 + (m - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

export function daysInMonth(key: string): number {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

export function monthShort(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" });
}

/** Today in the UK, as YYYY-MM-DD, whatever the device's or server's clock is set to. */
export function todayISO(d = new Date()): string {
  return londonToday(d);
}

export type PaySpan = { start: string; end: string; label: string; short: string };

/**
 * The pay period around a moment, or `offset` periods before or after it. With
 * no payday, periods are calendar months. A payday on a weekend or bank
 * holiday moves to the working day before, as UK pay does.
 */
export function paySpan(today: Date, payday: Payday, offset = 0): PaySpan {
  const { start, end } = payPeriodOf(londonToday(today), payday, offset);
  if (!hasPayday(payday)) {
    const name = monthShort(start.slice(0, 7));
    return { start, end, label: name, short: name };
  }
  return { start, end, label: `${shortDate(start)} – ${shortDate(end)}`, short: shortDate(start) };
}

export function nextPayday(span: PaySpan): string {
  return shortDate(addDays(span.end, 1));
}

export function spanProgress(span: PaySpan, today = new Date()): { day: number; days: number; complete: boolean } {
  const now = londonToday(today);
  const days = Math.round((Date.parse(`${span.end}T00:00:00Z`) - Date.parse(`${span.start}T00:00:00Z`)) / 86_400_000) + 1;
  if (now > span.end) return { day: days, days, complete: true };
  if (now < span.start) return { day: 0, days, complete: false };
  const day = Math.round((Date.parse(`${now}T00:00:00Z`) - Date.parse(`${span.start}T00:00:00Z`)) / 86_400_000) + 1;
  return { day, days, complete: false };
}

export function dayLabel(iso: string, today = new Date()): string {
  const current = londonToday(today);
  if (iso === current) return "Today";
  if (iso === addDays(current, -1)) return "Yesterday";
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export function monthProgress(key: string, today = new Date()) {
  const now = londonToday(today);
  const current = now.slice(0, 7);
  const days = daysInMonth(key);
  if (key < current) return { day: days, days, complete: true };
  if (key > current) return { day: 0, days, complete: false };
  return { day: Math.min(Number(now.slice(8, 10)), days), days, complete: false };
}
