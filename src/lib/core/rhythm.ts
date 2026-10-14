import { dayNum, isoOf, paydayIn as datePaydayIn } from "./dates.ts";
/* How often something is bought, around payday, and when it is next likely. */

export const DAY_MS = 86_400_000;

// Day numbers live in dates.ts; they are re-exported here for older imports.
export { dayNum, isoOf };

function weekdayOf(day: number): number {
  return new Date(day * DAY_MS).getUTCDay();
}

/** Payday in a month as a day number, moved back to a working day like real pay. */
function paydayIn(year: number, monthIndex: number, payday: number): number {
  const y = year + Math.floor(monthIndex / 12);
  const m = ((monthIndex % 12) + 12) % 12;
  return dayNum(datePaydayIn(y, m + 1, payday) as string);
}

/** The payday on or before this day. */
export function paydayOnOrBefore(day: number, payday: number): number {
  const date = new Date(day * DAY_MS);
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  const here = paydayIn(y, m, payday);
  return here <= day ? here : paydayIn(y, m - 1, payday);
}

/** The first payday strictly after this day. */
export function paydayAfter(day: number, payday: number): number {
  const date = new Date(day * DAY_MS);
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  const here = paydayIn(y, m, payday);
  return here > day ? here : paydayIn(y, m + 1, payday);
}

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function shortDay(iso: string): string {
  const day = dayNum(iso);
  const date = new Date(day * DAY_MS);
  const month = date.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
  return `${WEEKDAYS[weekdayOf(day)].slice(0, 3)} ${date.getUTCDate()} ${month}`;
}

// ---------- rhythm ----------

export type TimeOfDay = "morning" | "afternoon" | "evening" | "late";

export type Rhythm = {
  occasions: number;
  /** Spent in the last 90 days. */
  recentPence: number;
  totalPence: number;
  avgPence: number;
  firstOn: string;
  lastOn: string;
  /** Typical days between buys, when there is enough to say. */
  gapDays: number | null;
  regular: boolean;
  weekday: number | null;
  weekend: boolean;
  afterPayday: boolean;
  timeOfDay: TimeOfDay | null;
  nextOn: string | null;
  due: "now" | "soon" | "later" | null;
  faded: boolean;
};

export type Occasion = { day: number; pence: number; minutes: number | null };

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function bucketOf(minutes: number): TimeOfDay {
  const hour = Math.floor(minutes / 60);
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "late";
}

function snapToWeekday(day: number, weekday: number): number {
  for (let shift = 0; shift <= 3; shift += 1) {
    if (weekdayOf(day + shift) === weekday) return day + shift;
    if (weekdayOf(day - shift) === weekday) return day - shift;
  }
  return day;
}

export function rhythmOf(raw: Occasion[], today: number, payday: number | null): Rhythm {
  const byDay = new Map<number, Occasion>();
  for (const occ of raw) {
    const prev = byDay.get(occ.day);
    if (prev) {
      prev.pence += occ.pence;
      if (prev.minutes == null) prev.minutes = occ.minutes;
    } else {
      byDay.set(occ.day, { ...occ });
    }
  }
  const occs = [...byDay.values()].sort((a, b) => a.day - b.day);
  const occasions = occs.length;
  const totalPence = occs.reduce((sum, occ) => sum + occ.pence, 0);
  const recentPence = occs.filter((occ) => occ.day > today - 90).reduce((sum, occ) => sum + occ.pence, 0);
  const first = occs[0]?.day ?? today;
  const last = occs[occasions - 1]?.day ?? today;
  const gaps = occs.slice(1).map((occ, index) => occ.day - occs[index].day);

  let gapDays: number | null = null;
  let regular = false;
  if (gaps.length >= 2) {
    const mid = median(gaps);
    const spread = median(gaps.map((gap) => Math.abs(gap - mid))) / Math.max(1, mid);
    gapDays = Math.max(1, Math.round(mid));
    regular = mid >= 1 && mid <= 120 && spread <= 0.5;
  }

  let weekday: number | null = null;
  let weekend = false;
  if (occasions >= 3) {
    const counts = new Array<number>(7).fill(0);
    for (const occ of occs) counts[weekdayOf(occ.day)] += 1;
    const top = counts.indexOf(Math.max(...counts));
    if (counts[top] >= 3 && counts[top] / occasions >= 0.5) weekday = top;
    else if (occasions >= 4 && (counts[5] + counts[6] + counts[0]) / occasions >= 0.75) weekend = true;
  }

  let afterPayday = false;
  if (payday && occasions >= 2) {
    const near = occs.filter((occ) => occ.day - paydayOnOrBefore(occ.day, payday) <= 3).length;
    afterPayday = near >= 2 && near / occasions >= 0.6;
  }

  let timeOfDay: TimeOfDay | null = null;
  const timed = occs.filter((occ) => occ.minutes != null).map((occ) => bucketOf(occ.minutes as number));
  if (timed.length >= 3) {
    const tally = new Map<TimeOfDay, number>();
    for (const bucket of timed) tally.set(bucket, (tally.get(bucket) ?? 0) + 1);
    const [bucket, count] = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
    if (count / timed.length >= 0.6) timeOfDay = bucket;
  }

  const faded = today - last > Math.max(60, (gapDays ?? 30) * 3);

  let next: number | null = null;
  if (!faded && afterPayday && payday && (gapDays == null || gapDays >= 20)) {
    next = paydayAfter(last, payday);
    if (next < today - 3) next = paydayAfter(today - 1, payday);
  } else if (!faded && regular && gapDays != null) {
    next = last + gapDays;
    if (weekday != null && gapDays >= 5 && gapDays <= 16) next = snapToWeekday(next, weekday);
    if (next < today) {
      // A little late is still "due"; very late means the habit has paused.
      next = today - next > Math.max(7, gapDays) ? null : today;
    }
  }

  let due: Rhythm["due"] = null;
  if (next != null) {
    const ahead = next - today;
    due = ahead <= 0 ? "now" : ahead <= 7 ? "soon" : "later";
  }

  return {
    occasions,
    recentPence,
    totalPence,
    avgPence: occasions > 0 ? Math.round(totalPence / occasions) : 0,
    firstOn: isoOf(first),
    lastOn: isoOf(last),
    gapDays,
    regular,
    weekday,
    weekend,
    afterPayday,
    timeOfDay,
    nextOn: next == null ? null : isoOf(next),
    due,
    faded,
  };
}
