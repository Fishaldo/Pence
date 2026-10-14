import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { isCategory, validDate } from "@/lib/core/model";
import { samePayment } from "@/lib/core/duplicate";
import type { StatementRow } from "@/lib/core/statement";
import { asBool, asInt } from "./rows";
import { applyRule, loadRules } from "./rules";

/*
 * Bank statements: same-payment checks, then filing the rows.
 */

function readBankRows(input: unknown): StatementRow[] {
  if (!input || typeof input !== "object") throw new Error("Nothing to import.");
  const raw = (input as { rows?: unknown }).rows;
  if (!Array.isArray(raw) || raw.length === 0) throw new Error("No spends in that file.");
  const rows: StatementRow[] = [];
  for (const item of raw.slice(0, 200)) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const merchant = typeof row.merchant === "string" ? row.merchant.trim().slice(0, 80) : "";
    const spentOn = typeof row.spentOn === "string" ? row.spentOn : "";
    const amountPence = asInt(row.amountPence);
    const category = typeof row.category === "string" && isCategory(row.category) ? row.category : "other";
    const description = typeof row.description === "string" ? row.description.trim().slice(0, 120) : "";
    if (!merchant || amountPence <= 0 || !validDate(spentOn)) continue;
    rows.push({ merchant, spentOn, amountPence, category, description: description || merchant });
  }
  if (rows.length === 0) throw new Error("No outgoing spends in that file.");
  return rows;
}

export type Clash = {
  index: number;
  existingId: string | null;
  existingMerchant: string;
  existingAmountPence: number;
  existingSpentOn: string;
  existingSource: string;
  existingHasReceipt: boolean;
  inFile: boolean;
};

export const findClashes = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => ({ rows: readBankRows(input) }))
  .handler(async ({ context, data }): Promise<Clash[]> => {
    const sql = await getSql();
    const existing = await sql<{
      id: string;
      merchant: string;
      amount_pence: number | string;
      spent_on: string;
      source: string;
      has_receipt: unknown;
    }>`select id, merchant, amount_pence, spent_on::text as spent_on, source, has_receipt
       from transactions where user_id = ${context.userId}`;
    const saved = existing.map((row) => ({
      id: row.id,
      merchant: row.merchant,
      amountPence: asInt(row.amount_pence),
      spentOn: String(row.spent_on).slice(0, 10),
      source: row.source,
      hasReceipt: asBool(row.has_receipt),
    }));
    const used = new Set<string>();
    const clashes: Clash[] = [];
    data.rows.forEach((row, index) => {
      const hit = saved.find(
        (item) => !used.has(item.id) && samePayment(item, { merchant: row.merchant, amountPence: row.amountPence, spentOn: row.spentOn }),
      );
      if (hit) {
        used.add(hit.id);
        clashes.push({
          index,
          existingId: hit.id,
          existingMerchant: hit.merchant,
          existingAmountPence: hit.amountPence,
          existingSpentOn: hit.spentOn,
          existingSource: hit.source,
          existingHasReceipt: hit.hasReceipt,
          inFile: false,
        });
        return;
      }
      const earlier = data.rows.slice(0, index).find((item) =>
        samePayment(item, { merchant: row.merchant, amountPence: row.amountPence, spentOn: row.spentOn }),
      );
      if (!earlier) return;
      clashes.push({
        index,
        existingId: null,
        existingMerchant: earlier.merchant,
        existingAmountPence: earlier.amountPence,
        existingSpentOn: earlier.spentOn,
        existingSource: "bank",
        existingHasReceipt: false,
        inFile: true,
      });
    });
    return clashes;
  });

export const importBank = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => ({ rows: readBankRows(input) }))
  .handler(async ({ context, data }): Promise<{ added: number; skipped: number }> => {
    const sql = await getSql();
    const rules = await loadRules(sql, context.userId);
    let added = 0;
    for (const row of data.rows) {
      const id = crypto.randomUUID();
      const description = row.description || row.merchant;
      // A line still showing its printed name has not been touched in review, so the person's fix applies.
      const fixed =
        row.merchant === description ? applyRule(rules, description, row.merchant, row.category) : { ...row, description };
      await sql`insert into transactions (
        id, user_id, merchant, description, amount_pence, category, spent_on, source, has_receipt,
        note, items_json, image_data, raw_alert, is_sample
      ) values (
        ${id}, ${context.userId}, ${fixed.merchant}, ${description}, ${row.amountPence}, ${fixed.category},
        ${row.spentOn}, 'bank', false, 'From your bank — no receipt', '[]', null, '', false
      )`;
      added += 1;
    }
    return { added, skipped: 0 };
  });
