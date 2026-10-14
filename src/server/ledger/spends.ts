import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { isCategory, validDate, type CategoryId, type LineItem, type SpendSource, type Tx } from "@/lib/core/model";
import { descKey } from "@/lib/core/payee";
import { asInt, asItems, mapTx } from "./rows";
import { closeAlert } from "./alerts";

/*
 * Spends: list, add, change, move to another category and delete.
 */

export const listTransactions = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<Tx[]> => {
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      merchant: string;
      description: string;
      amount_pence: number;
      category: string;
      spent_on: string;
      source: string;
      has_receipt: unknown;
      note: string;
      items_json: string;
      raw_alert: string;
      is_sample: unknown;
      created_at: unknown;
      kind: string;
    }>`select id, merchant, description, amount_pence, category, spent_on, source, has_receipt, note,
              items_json, raw_alert, is_sample, created_at, kind
       from transactions
       where user_id = ${context.userId}
       order by spent_on desc, created_at desc
       limit 500`;
    return rows.map(mapTx);
  });

type SpendInput = {
  id?: string;
  merchant: string;
  description: string;
  amountPence: number;
  category: CategoryId;
  spentOn: string;
  source: SpendSource;
  hasReceipt: boolean;
  note: string;
  items: LineItem[];
  imageDataUrl: string | null;
  rawAlert: string;
  alertId: string | null;
};

function readSpend(input: unknown, withImage: boolean): SpendInput {
  if (!input || typeof input !== "object") throw new Error("That spend couldn’t be saved.");
  const row = input as Record<string, unknown>;
  const merchant = typeof row.merchant === "string" ? row.merchant.trim().slice(0, 80) : "";
  const amountPence = asInt(row.amountPence);
  const category = typeof row.category === "string" && isCategory(row.category) ? row.category : null;
  const spentOn = typeof row.spentOn === "string" ? row.spentOn : "";
  const sourceRaw = row.source;
  const source: SpendSource =
    sourceRaw === "receipt" || sourceRaw === "gallery" || sourceRaw === "wallet" || sourceRaw === "manual" || sourceRaw === "bank"
      ? sourceRaw
      : "manual";
  if (!merchant) throw new Error("Add the shop or payee.");
  if (amountPence <= 0) throw new Error("Add an amount greater than zero.");
  if (!category) throw new Error("Pick a category.");
  if (!validDate(spentOn)) throw new Error("That date doesn’t look right.");
  const note = typeof row.note === "string" ? row.note.trim().slice(0, 200) : "";
  const rawAlert = typeof row.rawAlert === "string" ? row.rawAlert.slice(0, 800) : "";
  const items = asItems(JSON.stringify(row.items ?? []));
  // Pence keeps what it read from a photo, never the photo itself.
  const hadImage = withImage && typeof row.imageDataUrl === "string" && row.imageDataUrl.startsWith("data:image/");
  const alertId = typeof row.alertId === "string" && row.alertId.length < 80 ? row.alertId : null;
  const id = typeof row.id === "string" ? row.id : undefined;
  const description = typeof row.description === "string" ? row.description.trim().slice(0, 120) : "";
  return {
    id,
    merchant,
    description: description || merchant,
    amountPence,
    category,
    spentOn,
    source,
    hasReceipt: row.hasReceipt === true || hadImage,
    note,
    items,
    imageDataUrl: null,
    rawAlert,
    alertId,
  };
}

export const saveSpend = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => readSpend(input, true))
  .handler(async ({ context, data }): Promise<Tx> => {
    const sql = await getSql();
    const id = crypto.randomUUID();
    const rows = await sql<{
      id: string;
      merchant: string;
      description: string;
      amount_pence: number;
      category: string;
      spent_on: string;
      source: string;
      has_receipt: unknown;
      note: string;
      items_json: string;
      raw_alert: string;
      is_sample: unknown;
      created_at: unknown;
    }>`insert into transactions (
         id, user_id, merchant, description, amount_pence, category, spent_on, source, has_receipt,
         note, items_json, image_data, raw_alert, is_sample
       ) values (
         ${id}, ${context.userId}, ${data.merchant}, ${data.description}, ${data.amountPence}, ${data.category},
         ${data.spentOn}, ${data.source}, ${data.hasReceipt}, ${data.note},
         ${JSON.stringify(data.items)}, ${data.imageDataUrl}, ${data.rawAlert}, false
       )
       returning id, merchant, description, amount_pence, category, spent_on, source, has_receipt,
                 note, items_json, raw_alert, is_sample, created_at`;
    await closeAlert(sql, context.userId, data.alertId);
    return mapTx(rows[0]);
  });

export type UpdateResult = { tx: Tx; alsoChanged: number };

/**
 * Save an edited payment. With applyToSame, a new name or category also goes to
 * every other payment with the same description, and Pence keeps the fix so
 * future payments like it come in named and filed.
 */
export const updateSpend = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const spend = readSpend(input, false);
    if (!spend.id) throw new Error("Missing spend.");
    const applyToSame = !!input && typeof input === "object" && (input as { applyToSame?: unknown }).applyToSame === true;
    return { ...spend, applyToSame };
  })
  .handler(async ({ context, data }): Promise<UpdateResult> => {
    const sql = await getSql();
    const before = await sql<{ merchant: string; description: string; category: string }>`
      select merchant, description, category from transactions where id = ${data.id} and user_id = ${context.userId}`;
    if (!before[0]) throw new Error("That spend is no longer here.");
    const rows = await sql<{
      id: string;
      merchant: string;
      description: string;
      amount_pence: number;
      category: string;
      spent_on: string;
      source: string;
      has_receipt: unknown;
      note: string;
      items_json: string;
      raw_alert: string;
      is_sample: unknown;
      created_at: unknown;
    }>`update transactions set
         description = case when description = '' then merchant else description end,
         merchant = ${data.merchant},
         amount_pence = ${data.amountPence},
         category = ${data.category},
         spent_on = ${data.spentOn},
         note = ${data.note},
         items_json = ${JSON.stringify(data.items)}
       where id = ${data.id} and user_id = ${context.userId}
       returning id, merchant, description, amount_pence, category, spent_on, source, has_receipt,
                 note, items_json, raw_alert, is_sample, created_at`;
    if (!rows[0]) throw new Error("That spend is no longer here.");

    let alsoChanged = 0;
    const renamed = before[0].merchant !== data.merchant;
    const refiled = before[0].category !== data.category;
    const key = descKey(before[0].description || before[0].merchant);
    if (data.applyToSame && key && (renamed || refiled)) {
      const others = await sql<{ id: string; description: string; merchant: string }>`
        select id, description, merchant from transactions
        where user_id = ${context.userId} and id <> ${data.id}`;
      for (const other of others) {
        if (descKey(other.description || other.merchant) !== key) continue;
        if (renamed && refiled) {
          await sql`update transactions set
                      description = case when description = '' then merchant else description end,
                      merchant = ${data.merchant}, category = ${data.category}
                    where id = ${other.id} and user_id = ${context.userId}`;
        } else if (renamed) {
          await sql`update transactions set
                      description = case when description = '' then merchant else description end,
                      merchant = ${data.merchant}
                    where id = ${other.id} and user_id = ${context.userId}`;
        } else {
          await sql`update transactions set category = ${data.category} where id = ${other.id} and user_id = ${context.userId}`;
        }
        alsoChanged += 1;
      }
      await sql`insert into payee_rules (user_id, desc_key, merchant, category)
                values (${context.userId}, ${key}, ${data.merchant}, ${data.category})
                on conflict (user_id, desc_key) do update set
                  merchant = excluded.merchant, category = excluded.category, created_at = now()`;
    }
    return { tx: mapTx(rows[0]), alsoChanged };
  });

/**
 * Moves several spends to one category at once, such as gifts that were really
 * money sent to people. With `remember`, future payments to the same payees
 * arrive in that category too.
 */
export const refileSpends = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = input && typeof input === "object" ? (input as { ids?: unknown; category?: unknown; remember?: unknown }) : {};
    const ids = Array.isArray(raw.ids) ? raw.ids.filter((id): id is string => typeof id === "string" && id.length > 0 && id.length < 80) : [];
    if (ids.length === 0 || ids.length > 500) throw new Error("Pick the payments to move.");
    const category = typeof raw.category === "string" ? raw.category : "";
    if (!isCategory(category)) throw new Error("Pick a category.");
    return { ids: [...new Set(ids)], category, remember: raw.remember === true };
  })
  .handler(async ({ context, data }): Promise<{ moved: number }> => {
    const sql = await getSql();
    const rows = await sql<{ id: string; merchant: string; description: string }>`
      update transactions set category = ${data.category}
      where user_id = ${context.userId} and id = any(${data.ids}::text[])
      returning id, merchant, description`;
    if (data.remember) {
      const seen = new Set<string>();
      for (const row of rows) {
        const key = descKey(row.description || row.merchant);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        await sql`insert into payee_rules (user_id, desc_key, merchant, category)
                  values (${context.userId}, ${key}, ${row.merchant}, ${data.category})
                  on conflict (user_id, desc_key) do update set
                    merchant = excluded.merchant, category = excluded.category, created_at = now()`;
      }
    }
    return { moved: rows.length };
  });

export const deleteSpend = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const id = input && typeof input === "object" ? (input as { id?: unknown }).id : null;
    if (typeof id !== "string" || !id) throw new Error("Missing spend.");
    return { id };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await sql`delete from transactions where id = ${data.id} and user_id = ${context.userId}`;
    return { ok: true as const };
  });
