import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { countsAsSpending, isCategory, paySpan, poundsToPence, validDate, type CategoryId } from "@/lib/core/model";
import { interestDef, shopChoices } from "@/lib/core/habits";
import { NEVER_CUT, type BudgetLine } from "@/lib/core/budget";

/*
 * Payday and income, one-tap questions, the budget, the weekly check-in day,
 * the location question, and the person's own data: download it, or delete it.
 * Every query is scoped to the signed-in person.
 */

function asInt(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function asBool(value: unknown): boolean {
  return value === true || value === "t" || value === "true" || value === 1;
}

function dateText(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value ?? "").slice(0, 10);
}

function record(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" ? (input as Record<string, unknown>) : {};
}

/* ------------------------------------------------------------------ */
/* Pay each pay period                                                 */
/* ------------------------------------------------------------------ */

export type PayRecord = { startsOn: string; takeHomePence: number; source: string };

/** Take-home confirmed for each pay period, newest first. */
export const listPay = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<PayRecord[]> => {
    const sql = await getSql();
    const rows = await sql<{ starts_on: unknown; take_home_pence: number | string; source: string }>`
      select starts_on, take_home_pence, source from pay_periods
      where user_id = ${context.userId}
      order by starts_on desc
      limit 24`;
    return rows.map((row) => ({
      startsOn: dateText(row.starts_on),
      takeHomePence: asInt(row.take_home_pence),
      source: row.source,
    }));
  });

/**
 * The person says what landed this payday, or confirms pay Pence spotted on a
 * statement. Saved against the pay period that day falls in.
 */
export const confirmPay = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const row = record(input);
    const on = typeof row.on === "string" ? row.on : "";
    if (!validDate(on)) throw new Error("Check the date.");
    const pence = typeof row.amount === "number" ? Math.round(row.amount) : poundsToPence(String(row.amount ?? ""));
    if (!pence || pence <= 0 || pence > 100_000_000) throw new Error("Enter what landed, like 2400.");
    const source = row.source === "spotted" ? "spotted" : "confirmed";
    return { on, pence, source };
  })
  .handler(async ({ context, data }): Promise<PayRecord> => {
    const sql = await getSql();
    const profile = await sql<{ payday: number | string | null }>`
      select payday from profiles where user_id = ${context.userId}`;
    const paydayRaw = profile[0]?.payday;
    const payday = paydayRaw == null ? null : asInt(paydayRaw);
    const [y, m, d] = data.on.split("-").map(Number);
    const span = paySpan(new Date(y, m - 1, d), payday && payday >= 1 && payday <= 31 ? payday : null);
    await sql`insert into pay_periods (user_id, starts_on, take_home_pence, source)
              values (${context.userId}, ${span.start}, ${data.pence}, ${data.source})
              on conflict (user_id, starts_on) do update set
                take_home_pence = excluded.take_home_pence,
                source = excluded.source`;
    return { startsOn: span.start, takeHomePence: data.pence, source: data.source };
  });

/* ------------------------------------------------------------------ */
/* One-tap questions                                                   */
/* ------------------------------------------------------------------ */

export type TapQuestion = {
  id: string;
  merchant: string;
  amountPence: number;
  spentOn: string;
  choices: { id: string; label: string }[];
};

/**
 * Spends at shops that sell many kinds of thing, with nothing yet saying which:
 * "£38 at Boots: perfume, pharmacy or toiletries?" The newest few, from the last six weeks.
 */
export const listTaps = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<TapQuestion[]> => {
    const sql = await getSql();
    const since = new Date(Date.now() - 42 * 86_400_000).toISOString().slice(0, 10);
    const rows = await sql<{
      id: string;
      merchant: string;
      amount_pence: number | string;
      spent_on: unknown;
      items_json: string;
      category: string;
    }>`select id, merchant, amount_pence, spent_on, items_json, category from transactions
       where user_id = ${context.userId} and kind = '' and spent_on >= ${since} and amount_pence >= 300
       order by spent_on desc, created_at desc
       limit 80`;
    const out: TapQuestion[] = [];
    for (const row of rows) {
      if (out.length >= 3) break;
      if (isCategory(row.category) && !countsAsSpending(row.category)) continue;
      if ((row.items_json ?? "[]").trim() !== "[]") continue;
      const choices = shopChoices(row.merchant);
      if (choices.length < 2) continue;
      out.push({
        id: row.id,
        merchant: row.merchant,
        amountPence: asInt(row.amount_pence),
        spentOn: dateText(row.spent_on),
        choices: choices.map((choice) => ({ id: choice.id, label: choice.label })),
      });
    }
    return out;
  });

/** One tap: what it was. "-" means rather not say, and Pence does not ask again. */
export const answerTap = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const row = record(input);
    const id = typeof row.id === "string" ? row.id : "";
    const kind = typeof row.kind === "string" ? row.kind : "";
    if (!id) throw new Error("That spend was not found.");
    if (kind !== "-" && !interestDef(kind)) throw new Error("Pick one of the choices.");
    return { id, kind };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const def = data.kind === "-" ? null : interestDef(data.kind);
    const category: CategoryId | null = def && isCategory(def.category) ? def.category : null;
    const rows = category
      ? await sql<{ id: string }>`
          update transactions set kind = ${data.kind}, category = ${category}
          where id = ${data.id} and user_id = ${context.userId} returning id`
      : await sql<{ id: string }>`
          update transactions set kind = ${data.kind}
          where id = ${data.id} and user_id = ${context.userId} returning id`;
    if (rows.length === 0) throw new Error("That spend was not found.");
    return { ok: true as const, label: def?.label ?? "" };
  });

/* ------------------------------------------------------------------ */
/* Budget                                                              */
/* ------------------------------------------------------------------ */

export const listBudget = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<BudgetLine[]> => {
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      name: string;
      category: string | null;
      amount_pence: number | string;
      never_cut: unknown;
    }>`select id, name, category, amount_pence, never_cut from budget_lines
       where user_id = ${context.userId}
       order by position, created_at`;
    return rows.map((row) => ({
      id: row.id,
      name: row.name ?? "",
      category: row.category && isCategory(row.category) ? row.category : null,
      amountPence: asInt(row.amount_pence),
      neverCut: asBool(row.never_cut),
    }));
  });

/** Saves the whole budget at once: the lines in order. An empty list clears it. */
export const saveBudget = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const list = Array.isArray(record(input).lines) ? (record(input).lines as unknown[]) : [];
    if (list.length > 40) throw new Error("Forty lines is the most.");
    return {
      lines: list.map((raw) => {
        const row = record(raw);
        const category = typeof row.category === "string" && isCategory(row.category) ? row.category : null;
        const name = typeof row.name === "string" ? row.name.replace(/\s+/g, " ").trim().slice(0, 40) : "";
        const amountPence = typeof row.amountPence === "number" ? Math.round(row.amountPence) : 0;
        if (!category && !name) throw new Error("Give each line a name, like Perfume.");
        if (amountPence <= 0 || amountPence > 100_000_000) throw new Error("Each line needs an amount.");
        return { category, name, amountPence, neverCut: row.neverCut === true || (category != null && row.neverCut !== false && NEVER_CUT.has(category)) };
      }),
    };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await sql`delete from budget_lines where user_id = ${context.userId}`;
    let position = 0;
    for (const line of data.lines) {
      await sql`insert into budget_lines (id, user_id, name, category, amount_pence, never_cut, position)
                values (${crypto.randomUUID()}, ${context.userId}, ${line.name}, ${line.category},
                        ${line.amountPence}, ${line.neverCut}, ${position})`;
      position += 1;
    }
    return { saved: data.lines.length };
  });

/* ------------------------------------------------------------------ */
/* Settings that are only a flag                                       */
/* ------------------------------------------------------------------ */

/** The weekly check-in day, 0 Sunday to 6 Saturday, or null for none. */
export const saveWeeklyDay = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = record(input).day;
    if (raw == null || raw === "") return { day: null as number | null };
    const day = Number(raw);
    if (!Number.isInteger(day) || day < 0 || day > 6) throw new Error("Pick a day of the week.");
    return { day };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await sql`update profiles set weekly_day = ${data.day} where user_id = ${context.userId}`;
    return { day: data.day };
  });

/** The location question after the first sign-in: answered, or skipped. Asked once. */
export const markLocationAsked = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    await sql`update profiles set location_asked = true where user_id = ${context.userId}`;
    return { ok: true as const };
  });

/* ------------------------------------------------------------------ */
/* Your data                                                           */
/* ------------------------------------------------------------------ */

/** Everything Pence keeps about the person, as one JSON file. Receipt photos are never kept. */
export const exportMyData = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<string> => {
    const sql = await getSql();
    const id = context.userId;
    const [profile, spends, alerts, places, regulars, pay, budget, watches, rules, habits] = await Promise.all([
      sql`select display_name, monthly_income_pence, currency, city, payday, weekly_day, created_at from profiles where user_id = ${id}`,
      sql`select spent_on, merchant, description, amount_pence, category, kind, source, has_receipt, note, items_json, is_sample, created_at
          from transactions where user_id = ${id} order by spent_on desc`,
      sql`select raw_text, merchant, amount_pence, suggested_category, status, created_at from wallet_alerts where user_id = ${id}`,
      sql`select label, town, is_phone, created_at from places where user_id = ${id}`,
      sql`select key, name, amount_pence, freq, next_due, stopped, stopped_on, remind, contract_end from regulars where user_id = ${id}`,
      sql`select starts_on, take_home_pence, source from pay_periods where user_id = ${id} order by starts_on desc`,
      sql`select name, category, amount_pence, never_cut from budget_lines where user_id = ${id} order by position`,
      sql`select * from watches where user_id = ${id}`,
      sql`select desc_key, merchant, category from payee_rules where user_id = ${id}`,
      sql`select habit_key, mode from habit_prefs where user_id = ${id}`,
    ]);
    const strip = (rows: Record<string, unknown>[]) =>
      rows.map((row) => {
        const { user_id: _drop, ...rest } = row;
        return rest;
      });
    const file = {
      app: "Pence",
      madeAt: new Date().toISOString(),
      profile: strip(profile as Record<string, unknown>[])[0] ?? null,
      spends: strip(spends as Record<string, unknown>[]),
      pastedAlerts: strip(alerts as Record<string, unknown>[]),
      places: strip(places as Record<string, unknown>[]),
      regularPayments: strip(regulars as Record<string, unknown>[]),
      payPeriods: strip(pay as Record<string, unknown>[]),
      budget: strip(budget as Record<string, unknown>[]),
      watchlist: strip(watches as Record<string, unknown>[]),
      payeeFixes: strip(rules as Record<string, unknown>[]),
      habitChoices: strip(habits as Record<string, unknown>[]),
    };
    return JSON.stringify(file, null, 2);
  });

/**
 * Deletes everything Pence keeps about the person: spends, places, pay,
 * budget, watches, reminders and phone alerts. They can sign in again and start fresh.
 */
export const deleteMyData = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    if (record(input).confirm !== "delete") throw new Error("Confirm first.");
    return { confirm: "delete" as const };
  })
  .handler(async ({ context }) => {
    const sql = await getSql();
    const id = context.userId;
    await sql`delete from watch_offers where user_id = ${id}`;
    await sql`delete from watches where user_id = ${id}`;
    await sql`delete from reminders_sent where user_id = ${id}`;
    await sql`delete from regulars where user_id = ${id}`;
    await sql`delete from budget_lines where user_id = ${id}`;
    await sql`delete from pay_periods where user_id = ${id}`;
    await sql`delete from payee_rules where user_id = ${id}`;
    await sql`delete from habit_prefs where user_id = ${id}`;
    await sql`delete from push_subs where user_id = ${id}`;
    await sql`delete from advice_cache where user_id = ${id}`;
    await sql`delete from wallet_alerts where user_id = ${id}`;
    await sql`delete from transactions where user_id = ${id}`;
    await sql`delete from places where user_id = ${id}`;
    await sql`delete from profiles where user_id = ${id}`;
    return { ok: true as const };
  });
