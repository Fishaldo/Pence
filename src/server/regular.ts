import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { isCategory, poundsToPence } from "@/lib/spend/model";
import { dayNum, isoOf } from "@/lib/spend/habits";
import {
  findRegulars,
  isFreq,
  contractEndMessage,
  reminderMessage,
  riseMessage,
  remindersDue,
  type Freq,
  type Regular,
  type RegularSetting,
  type RegularSpend,
} from "@/lib/spend/regular";
import { pushUser } from "@/server/push";

/*
 * Regular payments and their reminders. The list is worked out fresh from the
 * person's spends each time; the database only keeps what they added or changed.
 */

export type RegularList = {
  today: string;
  items: Regular[];
  /** Roughly what the payments still running cost in a month. */
  monthlyPence: number;
  /** Phone alerts are on somewhere, so reminders can reach them. */
  alertsOn: boolean;
};

const MANUAL_LIMIT = 60;

function londonToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function asInt(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function asBool(value: unknown): boolean {
  return value === true || value === "t" || value === "true" || value === 1;
}

function dateOrNull(value: unknown): string | null {
  const text = value == null ? "" : String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

type SettingRow = {
  key: string;
  name: string;
  amount_pence: number | string | null;
  freq: string | null;
  next_due: unknown;
  stopped: unknown;
  stopped_on: unknown;
  remind: unknown;
  contract_end?: unknown;
};

function mapSetting(row: SettingRow): RegularSetting {
  return {
    key: row.key,
    name: row.name ?? "",
    amountPence: asInt(row.amount_pence),
    freq: isFreq(row.freq) ? row.freq : null,
    nextDue: dateOrNull(row.next_due),
    stopped: asBool(row.stopped),
    stoppedOn: dateOrNull(row.stopped_on),
    remind: row.remind == null ? true : asBool(row.remind),
    contractEnd: dateOrNull(row.contract_end),
  };
}

async function loadSettings(userId: string): Promise<RegularSetting[]> {
  const sql = await getSql();
  const rows = await sql<SettingRow>`
    select key, name, amount_pence, freq, next_due, stopped, stopped_on, remind, contract_end
    from regulars where user_id = ${userId}`;
  return rows.map(mapSetting);
}

/** Every regular payment for one person, as of today in Britain. */
export async function regularsFor(userId: string, today = londonToday()): Promise<Regular[]> {
  const sql = await getSql();
  const since = isoOf(dayNum(today) - 400);
  const [rows, settings] = await Promise.all([
    sql<{
      merchant: string;
      description: string | null;
      amount_pence: number | string;
      category: string;
      spent_on: unknown;
      is_sample: unknown;
    }>`select merchant, description, amount_pence, category, spent_on, is_sample
       from transactions
       where user_id = ${userId} and spent_on >= ${since}
       order by spent_on desc
       limit 2000`,
    loadSettings(userId),
  ]);
  const spends: RegularSpend[] = rows.map((row) => ({
    merchant: row.merchant ?? "",
    description: row.description ?? "",
    amountPence: asInt(row.amount_pence) ?? 0,
    category: isCategory(row.category) ? row.category : "other",
    spentOn: String(row.spent_on).slice(0, 10),
    isSample: asBool(row.is_sample),
  }));
  return findRegulars(spends, settings, today);
}

export const listRegulars = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<RegularList> => {
    const sql = await getSql();
    const today = londonToday();
    const [items, subs] = await Promise.all([
      regularsFor(context.userId, today),
      sql<{ n: number }>`select count(*) as n from push_subs where user_id = ${context.userId}`,
    ]);
    const monthlyPence = items
      .filter((item) => !item.stopped && !item.lapsed)
      .reduce((sum, item) => sum + item.monthlyPence, 0);
    return { today, items, monthlyPence, alertsOn: Number(subs[0]?.n ?? 0) > 0 };
  });

type SaveInput = {
  key: string | null;
  name?: string;
  amountPence?: number | null;
  freq?: Freq;
  nextDue?: string | null;
  remind?: boolean;
  stopped?: boolean;
  contractEnd?: string | null;
};

function readSave(input: unknown): SaveInput {
  const row = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const keyRaw = typeof row.key === "string" ? row.key.trim() : "";
  if (keyRaw && !/^(m|p):.{1,90}$/.test(keyRaw)) throw new Error("That payment was not found.");
  const out: SaveInput = { key: keyRaw || null };
  if (typeof row.name === "string") out.name = row.name.replace(/\s+/g, " ").trim().slice(0, 60);
  if ("amount" in row) {
    const text = typeof row.amount === "string" ? row.amount.trim() : "";
    if (text === "") out.amountPence = null;
    else {
      const pence = poundsToPence(text);
      if (pence == null || pence < 0 || pence > 10_000_000) throw new Error("Check the amount.");
      out.amountPence = pence;
    }
  }
  if ("freq" in row) {
    if (!isFreq(row.freq)) throw new Error("Choose how often it comes out.");
    out.freq = row.freq;
  }
  if ("nextDue" in row) {
    const due = dateOrNull(row.nextDue);
    if (row.nextDue && !due) throw new Error("Check the date.");
    if (due) {
      const today = londonToday();
      if (dayNum(due) < dayNum(today) - 400 || dayNum(due) > dayNum(today) + 800) throw new Error("Check the date.");
    }
    out.nextDue = due;
  }
  if (typeof row.remind === "boolean") out.remind = row.remind;
  if (typeof row.stopped === "boolean") out.stopped = row.stopped;
  if ("contractEnd" in row) {
    const end = dateOrNull(row.contractEnd);
    if (row.contractEnd && !end) throw new Error("Check the contract end date.");
    if (end) {
      const today = londonToday();
      if (dayNum(end) < dayNum(today) - 3650 || dayNum(end) > dayNum(today) + 3650) throw new Error("Check the contract end date.");
    }
    out.contractEnd = end;
  }
  return out;
}

/**
 * Add a payment or free trial (no key), or change one on the list. Only the
 * fields sent change; the rest stay as they were, or as Pence worked them out.
 */
export const saveRegular = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(readSave)
  .handler(async ({ context, data }): Promise<{ key: string }> => {
    const sql = await getSql();
    let key = data.key;
    if (!key) {
      if (!data.name || data.name.length < 2) throw new Error("Add a name, like Netflix or Gym.");
      if (!data.nextDue) throw new Error("Add the date it next comes out, or the trial ends.");
      const manual = await sql<{ n: number }>`
        select count(*) as n from regulars where user_id = ${context.userId} and key like 'm:%'`;
      if (Number(manual[0]?.n ?? 0) >= MANUAL_LIMIT) throw new Error("Your list is full. Remove an old one first.");
      key = `m:${crypto.randomUUID()}`;
    }
    const existing = (await loadSettings(context.userId)).find((row) => row.key === key);
    if (!existing && key.startsWith("m:") && data.key) throw new Error("That payment was not found.");
    const merged = {
      name: data.name ?? existing?.name ?? "",
      amountPence: data.amountPence !== undefined ? data.amountPence : (existing?.amountPence ?? null),
      freq: data.freq ?? existing?.freq ?? (key.startsWith("m:") ? "monthly" : null),
      nextDue: data.nextDue !== undefined ? data.nextDue : (existing?.nextDue ?? null),
      remind: data.remind ?? existing?.remind ?? true,
      stopped: data.stopped ?? existing?.stopped ?? false,
      contractEnd: data.contractEnd !== undefined ? data.contractEnd : (existing?.contractEnd ?? null),
    };
    const stoppedOn = merged.stopped ? (existing?.stopped ? (existing.stoppedOn ?? londonToday()) : londonToday()) : null;
    await sql`insert into regulars (user_id, key, name, amount_pence, freq, next_due, stopped, stopped_on, remind, contract_end)
              values (${context.userId}, ${key}, ${merged.name}, ${merged.amountPence}, ${merged.freq},
                      ${merged.nextDue}, ${merged.stopped}, ${stoppedOn}, ${merged.remind}, ${merged.contractEnd})
              on conflict (user_id, key) do update set
                name = excluded.name,
                amount_pence = excluded.amount_pence,
                freq = excluded.freq,
                next_due = excluded.next_due,
                stopped = excluded.stopped,
                stopped_on = excluded.stopped_on,
                remind = excluded.remind,
                contract_end = excluded.contract_end`;
    return { key };
  });

/** Remove a payment the person added, or undo their changes to one Pence found. */
export const removeRegular = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const key = readSave(input).key;
    if (!key) throw new Error("That payment was not found.");
    return { key };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await sql`delete from regulars where user_id = ${context.userId} and key = ${data.key}`;
    await sql`delete from reminders_sent where user_id = ${context.userId} and key = ${data.key}`;
    return { ok: true as const };
  });

/**
 * Remind people a week, three days and two working days before a regular payment comes out.
 * Called by the daily check. Each step is sent once per due date, so running
 * it more often never repeats a reminder.
 */
export async function sendDueReminders(options: { budgetMs?: number } = {}): Promise<{ users: number; sent: number }> {
  const started = Date.now();
  const budget = options.budgetMs ?? 60_000;
  const sql = await getSql();
  const users = await sql<{ user_id: string }>`select distinct user_id from push_subs`;
  const today = londonToday();
  let sent = 0;
  for (const { user_id: userId } of users) {
    if (Date.now() - started > budget) break;
    try {
      const items = await regularsFor(userId, today);
      const sentRows = await sql<{ key: string; due: unknown; days_before: number | string }>`
        select key, due, days_before from reminders_sent
        where user_id = ${userId} and due >= ${today}`;
      const already = sentRows.map((row) => ({
        key: row.key,
        due: dateOrNull(row.due) ?? "",
        daysBefore: Number(row.days_before),
      }));
      const due: Regular[] = [];
      for (const { item, step } of remindersDue(items, already)) {
        const inserted = await sql<{ key: string }>`
          insert into reminders_sent (user_id, key, due, days_before)
          values (${userId}, ${item.key}, ${item.nextDue}, ${step})
          on conflict do nothing
          returning key`;
        if (inserted.length > 0) due.push(item);
      }
      // A bill or subscription that went up: told once, soon after the higher payment.
      for (const item of items) {
        const rise = item.rise;
        if (!rise || item.stopped || rise.on < isoOf(dayNum(today) - 30)) continue;
        const marked = await sql<{ key: string }>`
          insert into reminders_sent (user_id, key, due, days_before)
          values (${userId}, ${item.key}, ${rise.on}, ${-1})
          on conflict do nothing
          returning key`;
        if (marked.length > 0) await pushUser(userId, riseMessage(item.name, rise));
      }
      // A contract or deal ending within a month: told once, while there is time to switch.
      for (const item of items) {
        const end = item.contractEnd;
        if (!end || item.stopped || end < today || dayNum(end) - dayNum(today) > 30) continue;
        const marked = await sql<{ key: string }>`
          insert into reminders_sent (user_id, key, due, days_before)
          values (${userId}, ${item.key}, ${end}, ${-3})
          on conflict do nothing
          returning key`;
        if (marked.length > 0) await pushUser(userId, contractEndMessage(item.name, end));
      }
      if (due.length === 0) continue;
      await pushUser(userId, reminderMessage(due));
      sent += due.length;
    } catch {
      /* one person's list failing must not stop the others */
    }
  }
  // Old reminders are never needed again.
  await sql`delete from reminders_sent where due < ${isoOf(dayNum(today) - 60)}`;
  return { users: users.length, sent };
}
