/*
 * Bank and wallet descriptions, and the fixes a person makes to them.
 *
 * A statement line such as "BLD*MYPERFECTCV.CO 4421" says little. When the
 * person renames it or picks a category, Briv keeps the fix against the
 * description, so every payment with the same description changes too, and
 * future ones arrive named and filed.
 */

/** Payment words that say how someone paid, not who they paid. */
const NOISE = new Set([
  "card",
  "payment",
  "payments",
  "contactless",
  "visa",
  "debit",
  "credit",
  "pos",
  "purchase",
  "gbp",
  "ref",
  "via",
  "apple",
  "google",
  "pay",
  "paypal",
  "sumup",
  "zettle",
  "izettle",
  "sq",
  "clp",
  "cnp",
  "dd",
  "so",
  "fpo",
  "bgc",
  "on",
  "at",
  "to",
]);

/**
 * The part of a description that names the payee: lower case, and without
 * store numbers, dates, card references, or how it was paid.
 *
 *   "BLD*MYPERFECTCV.CO 4421"   → "bld myperfectcv.co"
 *   "TESCO STORES 3456"         → "tesco stores"
 *   "CARD PAYMENT TO ASDA 12/10" → "asda"
 */
export function descKey(text: string): string {
  const words = text
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .split(/[^a-z0-9&'.]+/)
    .map((word) => word.replace(/^[.']+|[.']+$/g, ""))
    .filter((word) => word.length > 0 && !/\d/.test(word) && !NOISE.has(word));
  return words.join(" ").slice(0, 80);
}

/** True when two descriptions are for the same payee. */
export function samePayee(a: string, b: string): boolean {
  const left = descKey(a);
  return left !== "" && left === descKey(b);
}

export type PayeeRule = { key: string; merchant: string; category: string };
