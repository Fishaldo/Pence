import { isCategory, type CategoryId } from "@/lib/core/model";
import { descKey } from "@/lib/core/payee";
import type { SqlClient } from "./rows";

/*
 * The person's own fixes: this statement text is this payee, in this category.
 */

type Rule = { merchant: string; category: CategoryId };

/** The person's own fixes, by description. */
export async function loadRules(sql: SqlClient, userId: string): Promise<Map<string, Rule>> {
  const rows = await sql<{ desc_key: string; merchant: string; category: string }>`
    select desc_key, merchant, category from payee_rules where user_id = ${userId}`;
  const rules = new Map<string, Rule>();
  for (const row of rows) {
    if (row.desc_key && row.merchant) {
      rules.set(row.desc_key, { merchant: row.merchant, category: isCategory(row.category) ? row.category : "other" });
    }
  }
  return rules;
}

/** Name and file a payment the way the person did last time, if they fixed one like it. */
export function applyRule(
  rules: Map<string, Rule>,
  description: string,
  merchant: string,
  category: CategoryId,
): { merchant: string; category: CategoryId; description: string } {
  const rule = rules.get(descKey(description));
  if (!rule) return { merchant, category, description };
  return { merchant: rule.merchant, category: rule.category, description };
}
