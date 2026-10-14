import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { isCategory, parseAlert, poundsToPence, type WalletAlert } from "@/lib/core/model";
import { mapAlert, type SqlClient } from "./rows";
import { CATEGORY_LIST, askModel, parseModelJson } from "./ai";
import { applyRule, loadRules } from "./rules";

/*
 * Payment alerts pasted from Google Pay, Apple Pay, a bank or Uber, waiting for a receipt.
 */

export const listAlerts = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<WalletAlert[]> => {
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      raw_text: string;
      merchant: string;
      amount_pence: number | null;
      suggested_category: string;
      confidence: number;
      created_at: unknown;
    }>`select id, raw_text, merchant, description, amount_pence, suggested_category, confidence, created_at
       from wallet_alerts
       where user_id = ${context.userId} and status = 'pending'
       order by created_at desc
       limit 40`;
    return rows.map(mapAlert);
  });

async function refineAlert(raw: string, base: ReturnType<typeof parseAlert>) {
  if (base.confidence >= 0.72 && base.amountPence) return base;
  const text = await askModel(
    [
      {
        role: "user",
        content: `This is a UK card, Google Pay, Apple Pay, or bank notification. Reply with JSON only:
{"merchant":"","total":"12.40","category":""}
category is one of: ${CATEGORY_LIST}. Use other if you cannot tell. total is pounds as a string.
Text: ${raw.slice(0, 800)}`,
      },
    ],
    220,
  );
  if (!text) return base;
  try {
    const parsed = parseModelJson(text) as Record<string, unknown>;
    const merchant =
      typeof parsed.merchant === "string" && parsed.merchant.trim()
        ? parsed.merchant.trim().slice(0, 80)
        : base.merchant;
    const amount =
      typeof parsed.total === "string" || typeof parsed.total === "number"
        ? poundsToPence(String(parsed.total))
        : null;
    const category =
      typeof parsed.category === "string" && isCategory(parsed.category) ? parsed.category : base.category;
    return {
      merchant,
      amountPence: amount && amount > 0 ? amount : base.amountPence,
      category,
      confidence: Math.max(base.confidence, category === "other" ? 0.5 : 0.8),
    };
  } catch {
    return base;
  }
}

export const createAlert = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("Paste the payment alert.");
    const raw = (input as { rawText?: unknown }).rawText;
    if (typeof raw !== "string" || raw.trim().length < 3) throw new Error("Paste the payment alert.");
    return { rawText: raw.trim().slice(0, 800) };
  })
  .handler(async ({ context, data }): Promise<WalletAlert> => {
    const base = parseAlert(data.rawText);
    const parsed = await refineAlert(data.rawText, base);
    const sql = await getSql();
    const fixed = applyRule(await loadRules(sql, context.userId), parsed.merchant, parsed.merchant, parsed.category);
    const id = crypto.randomUUID();
    const rows = await sql<{
      id: string;
      raw_text: string;
      merchant: string;
      description: string;
      amount_pence: number | null;
      suggested_category: string;
      confidence: number;
      created_at: unknown;
    }>`insert into wallet_alerts (
         id, user_id, raw_text, merchant, description, amount_pence, suggested_category, confidence, status
       ) values (
         ${id}, ${context.userId}, ${data.rawText}, ${fixed.merchant}, ${parsed.merchant}, ${parsed.amountPence},
         ${fixed.category}, ${fixed.merchant !== parsed.merchant ? Math.max(parsed.confidence, 0.9) : parsed.confidence}, 'pending'
       )
       returning id, raw_text, merchant, description, amount_pence, suggested_category, confidence, created_at`;
    return mapAlert(rows[0]);
  });

export async function closeAlert(sql: SqlClient, userId: string, alertId: string | null) {
  if (!alertId) return;
  await sql`update wallet_alerts set status = 'saved'
            where id = ${alertId} and user_id = ${userId}`;
}

export const dismissAlert = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const id = input && typeof input === "object" ? (input as { id?: unknown }).id : null;
    if (typeof id !== "string" || !id) throw new Error("Missing alert.");
    return { id };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await sql`update wallet_alerts set status = 'dismissed'
              where id = ${data.id} and user_id = ${context.userId}`;
    return { ok: true as const };
  });
