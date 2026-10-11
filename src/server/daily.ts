import { getSql } from "@/lib/db";

/*
 * The daily check: reminders for payments coming out soon, then the Watchlist.
 * The scheduler in vercel.json calls it each morning. If the scheduler is not
 * running on a deployment, the first visit after a missed day runs it instead,
 * so reminders still go out, late rather than never.
 */

const KEY = "daily-check";

export async function lastDailyCheck(): Promise<string | null> {
  const sql = await getSql();
  const rows = await sql<{ value: string }>`select value from app_keys where name = ${KEY}`;
  const value = rows[0]?.value ?? "";
  return Number.isFinite(Date.parse(value)) ? value : null;
}

async function markDailyCheck(previous: string | null): Promise<boolean> {
  const sql = await getSql();
  const now = new Date().toISOString();
  if (previous == null) {
    const rows = await sql<{ name: string }>`
      insert into app_keys (name, value) values (${KEY}, ${now})
      on conflict (name) do nothing
      returning name`;
    return rows.length > 0;
  }
  // Only one visit claims a missed day, however many arrive at once.
  const rows = await sql<{ name: string }>`
    update app_keys set value = ${now} where name = ${KEY} and value = ${previous}
    returning name`;
  return rows.length > 0;
}

export type DailyResult = {
  checked: number;
  found: number;
  reminders: { users: number; sent: number; failed?: boolean };
};

async function runChecks(budgetMs: number, watchLimit: number): Promise<DailyResult> {
  const started = Date.now();
  const { sendDueReminders } = await import("@/server/regular");
  const reminders = await sendDueReminders({ budgetMs: Math.round(budgetMs * 0.2) }).catch(() => ({
    users: 0,
    sent: 0,
    failed: true,
  }));
  const { checkDue } = await import("@/server/watch-check");
  const left = Math.max(5_000, budgetMs - (Date.now() - started));
  const result = await checkDue({ limit: watchLimit, budgetMs: left, push: true });
  return { ...result, reminders };
}

/** The scheduled run. Always runs; reminders and watch checks never repeat within a day. */
export async function runDailyCheck(): Promise<DailyResult> {
  const previous = await lastDailyCheck();
  await markDailyCheck(previous).catch(() => false);
  return runChecks(240_000, 30);
}

/** Run the daily check from a visit when the scheduler has not run for over a day. */
export async function catchUpDailyCheck(now = Date.now()): Promise<{ ran: boolean; last: string | null }> {
  const previous = await lastDailyCheck();
  if (previous && now - Date.parse(previous) < 26 * 3_600_000) return { ran: false, last: previous };
  const claimed = await markDailyCheck(previous);
  if (!claimed) return { ran: false, last: previous };
  await runChecks(40_000, 6);
  return { ran: true, last: new Date(now).toISOString() };
}
