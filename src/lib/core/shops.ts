import { isMoneySent, payeeKind, saysTransfer, sendingService } from "./money-sent.ts";
import { type SpendInput } from "./taste.ts";
import { type CategoryId } from "./categories.ts";
import { BRAND, CATEGORY_HOME, GENERIC_SHOP_WORDS, INTERESTS, type InterestDef, NAME_HINTS, interestDef } from "./interests.ts";
/* Matching shops and receipt lines to what people buy. */

export function norm(text: string): string {
  return text.toLowerCase().replace(/[’‘`´]/g, "'").replace(/\s+/g, " ").trim();
}

const WORD_CACHE = new Map<string, RegExp>();

/** True when `word` appears as a whole word (a plural or possessive counts). */
export function hasWord(hay: string, word: string): boolean {
  let re = WORD_CACHE.get(word);
  if (!re) {
    const esc = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    re = new RegExp(`(?:^|[^a-z0-9])${esc}(?:s|es|'s)?(?![a-z0-9])`);
    WORD_CACHE.set(word, re);
  }
  return re.test(hay);
}

const MERCHANT_NOISE = new Set([
  "ltd",
  "limited",
  "plc",
  "uk",
  "gb",
  "store",
  "stores",
  "retail",
  "online",
  "www",
  "com",
  "co",
  "the",
  "extra",
  "express",
  "metro",
  "superstore",
  "local",
  "petrol",
  "station",
]);

/** The merchant with store numbers and filler removed: "TESCO STORES 3456" → "tesco". */
export function merchantCore(merchant: string): string {
  return norm(merchant)
    .replace(/[^a-z0-9&'+ ]/g, " ")
    .split(" ")
    // "Pizza & Co" keeps its "Co"; "TESCO.CO.UK" loses it.
    .filter((word, index, words) => word && !/^\d+$/.test(word) && (!MERCHANT_NOISE.has(word) || (word === "co" && words[index - 1] === "&")))
    .join(" ");
}

function shopHit(merchant: string, core: string, word: string): boolean {
  if (word.startsWith("=")) {
    const bare = word.slice(1);
    return core === bare || core.startsWith(`${bare} `);
  }
  return hasWord(merchant, word);
}

function titleCase(text: string): string {
  return text
    .split(" ")
    .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(" ");
}

export function brandName(word: string): string {
  return BRAND[word] ?? titleCase(word.replace(/^=/, ""));
}

type ShopMatch = { interest: InterestDef; word: string };

export function matchShop(merchant: string): ShopMatch[] {
  const hay = norm(merchant);
  const core = merchantCore(merchant);
  const found: ShopMatch[] = [];
  for (const interest of INTERESTS) {
    let best = "";
    for (const word of interest.shops) {
      if (word.replace(/^=/, "").length > best.replace(/^=/, "").length && shopHit(hay, core, word)) best = word;
    }
    if (best) found.push({ interest, word: best });
  }
  return found.sort((a, b) => b.word.replace(/^=/, "").length - a.word.replace(/^=/, "").length);
}

/** True when Briv knows this payee as a shop by name: Moonpig, Card Factory, Tesco. */
export function isKnownShop(merchant: string): boolean {
  return matchShop(merchant).some((hit) => !GENERIC_SHOP_WORDS.has(hit.word));
}

/** Money sent to a person or through a transfer app, as opposed to something bought. */
export function sentNotBought(spend: Parameters<typeof isMoneySent>[0]): boolean {
  return isMoneySent(spend, isKnownShop(spend.merchant));
}

/** Categories where people are often paid straight from the bank: a landlord, a childminder, a cleaner, a tutor. */
const PEOPLE_PAID = new Set<string>(["gifts", "cash", "charity", "other", "sent", "housing", "kids", "education", "personal", "pets", "household"]);

/**
 * True when a payment went to a person, so their name must not be kept,
 * shown as a shop, or searched for. This is a privacy decision, apart from
 * whether the money counts as "money sent":
 *
 * - the app said so, or it was filed as Money sent (and is not a transfer app);
 * - the payee reads like a name, and it was filed where people are often paid
 *   (gifts, rent, childcare, a cleaner…) or the bank line says it was a transfer.
 *
 * A shop Briv knows by name (Moonpig, Jo Malone) is never a person. Erring
 * this way can hide a small shop's name; erring the other way would keep a
 * person's name, which Briv promises never to do.
 */
export function isPaymentToPerson(payment: { merchant: string; description?: string; category: string; toPerson?: boolean }): boolean {
  if (payment.toPerson === true) return true;
  if (sendingService(payment.merchant, payment.description)) return false;
  if (isKnownShop(payment.merchant)) return false;
  if (payment.category === "sent") return true;
  if (payeeKind(payment.merchant, payment.description) !== "person") return false;
  return PEOPLE_PAID.has(payment.category) || saysTransfer(payment.description ?? "") || saysTransfer(payment.merchant);
}

/**
 * What a shop sells, learned once from its name by a wider lookup and kept for
 * everyone: merchant core ("cakebox") → interest id ("cakes").
 */
export type ShopKinds = Record<string, string>;

/** What a shop's name says it sells, even run together: CAKEBOX → cakes. Null when the name says nothing. */
export function nameHint(merchant: string, category: CategoryId): string | null {
  const compact = merchantCore(merchant).replace(/[^a-z]/g, "");
  if (compact.length < 3) return null;
  for (const [stem, id] of NAME_HINTS) {
    if (!compact.includes(stem.replace(/[^a-z]/g, ""))) continue;
    const def = interestDef(id);
    if (def && (category === "other" || def.category === category)) return id;
  }
  return null;
}

/** True when nothing in Briv knows this shop: no chain, no telling word in its name. Worth a lookup. */
export function unknownShop(merchant: string, category: CategoryId, kinds?: ShopKinds): boolean {
  if (kinds?.[merchantCore(merchant)]) return false;
  return matchShop(merchant).length === 0 && nameHint(merchant, category) == null;
}

/**
 * Shops worth looking up on the web: anything that is not a chain Briv knows
 * by name, most used first. "Pizza & Co" is looked up even though its name says
 * pizza, so Briv learns it is one particular shop near the person.
 */
export function shopsToLookUp(
  spends: Pick<SpendInput, "merchant" | "category" | "description">[],
): { core: string; merchant: string; description: string; category: CategoryId; times: number }[] {
  const found = new Map<string, { core: string; merchant: string; description: string; category: CategoryId; times: number }>();
  for (const spend of spends) {
    if (spend.category === "other") continue;
    const core = merchantCore(spend.merchant);
    if (core.replace(/[^a-z]/g, "").length < 3) continue;
    const named = matchShop(spend.merchant).some((hit) => !GENERIC_SHOP_WORDS.has(hit.word));
    if (named) continue;
    // Never search the web for a person's name, whatever the payment was for.
    if (isMoneySent(spend) || isPaymentToPerson(spend)) continue;
    const row = found.get(core) ?? {
      core,
      merchant: spend.merchant.trim().slice(0, 60),
      description: (spend.description ?? "").trim().slice(0, 80),
      category: spend.category,
      times: 0,
    };
    row.times += 1;
    found.set(core, row);
  }
  return [...found.values()].sort((a, b) => b.times - a.times);
}

/** Which interest a merchant belongs to, honouring the category the person chose. */
/**
 * The kinds of thing a shop sells, when it sells several: Boots is perfume,
 * pharmacy or toiletries. Empty when the shop sells one kind of thing, or Briv
 * does not know it, so nothing needs asking.
 */
export function shopChoices(merchant: string): { id: string; label: string; category: CategoryId }[] {
  const seen = new Set<string>();
  const out: { id: string; label: string; category: CategoryId }[] = [];
  for (const hit of matchShop(merchant)) {
    if (GENERIC_SHOP_WORDS.has(hit.word) || seen.has(hit.interest.id)) continue;
    seen.add(hit.interest.id);
    out.push({ id: hit.interest.id, label: hit.interest.label, category: hit.interest.category });
  }
  return out.length >= 2 ? out.slice(0, 4) : [];
}

export function merchantInterest(
  merchant: string,
  category: CategoryId,
  kinds?: ShopKinds,
): { id: string | null; brand: string | null } {
  const hits = matchShop(merchant);
  const named = hits.find((hit) => !GENERIC_SHOP_WORDS.has(hit.word));
  const brand = named ? brandName(named.word) : null;
  const namedSame = named && named.interest.category === category ? named : undefined;
  if (namedSame) return { id: namedSame.interest.id, brand };
  // Found on the web for this very shop: Pizza & Co is a pizza takeaway, MyPerfectCV a CV service.
  // That beats a guess from one word of its name, but not a chain Briv knows by name.
  const learned = kinds?.[merchantCore(merchant)];
  if (learned && interestDef(learned) && !(named && !named.interest.broad)) return { id: learned, brand };
  const sameCategory = hits.find((hit) => hit.interest.category === category);
  if (sameCategory) return { id: sameCategory.interest.id, brand };
  // A shop that sells one kind of thing tells us more than the category does.
  if (named && !named.interest.broad) return { id: named.interest.id, brand };
  if (learned && interestDef(learned)) return { id: learned, brand };
  const hinted = hits.length === 0 ? nameHint(merchant, category) : null;
  if (hinted) return { id: hinted, brand };
  // A supermarket filed under Household is a household spend: keep the person's choice.
  const home = CATEGORY_HOME[category];
  if (home) return { id: home, brand };
  return { id: hits[0]?.interest.id ?? null, brand };
}

/**
 * Which interest a receipt line belongs to at this shop. A cake from Cake Box
 * is a cake-shop buy; the same word on a Tesco receipt is the food shop.
 */
export function itemInterestAt(name: string, shopInterest: string | null): string | null {
  const def = shopInterest ? interestDef(shopInterest) : undefined;
  if (def && !def.broad) {
    const hay = norm(name);
    if (def.items.some((word) => hasWord(hay, word))) return def.id;
  }
  return itemInterest(name);
}

/** Which interest a receipt line belongs to, or null. */
export function itemInterest(name: string): string | null {
  const hay = norm(name);
  let best: { id: string; len: number } | null = null;
  for (const interest of INTERESTS) {
    for (const word of interest.items) {
      if ((!best || word.length > best.len) && hasWord(hay, word)) best = { id: interest.id, len: word.length };
    }
  }
  return best?.id ?? null;
}

/** A receipt line as a person would say it: "2 × TESCO S/SKIM MILK 4PT" → "S Skim Milk". */
export function cleanItem(name: string): string {
  let text = name.replace(/^\s*\d+(?:\.\d+)?\s*[×x*]\s*/i, " ");
  text = text.replace(/\b\d+(?:\.\d+)?\s*(?:ml|l|ltr|litre|litres|g|kg|cl|oz|pk|pack|x|pt|pint|pints|pcs|s)\b/gi, " ");
  text = text.replace(
    /\b(?:tesco|sainsbury'?s?|asda|aldi|lidl|morrisons|waitrose|co-?op|finest|value|essential|everyday|smartprice|stockwell|by sainsbury'?s)\b/gi,
    " ",
  );
  text = text.replace(/[^\p{L}\p{N}&'+ ]/gu, " ").replace(/\s+/g, " ").trim();
  if (text && text === text.toUpperCase()) {
    text = titleCase(text.toLowerCase()).replace(/\b(Edt|Edp|Spf|Xl|Xxl|Usb|Hdmi|Uk)\b/g, (word) => word.toUpperCase());
  }
  return text.slice(0, 40);
}
