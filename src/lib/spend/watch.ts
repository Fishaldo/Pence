/*
 * Price watch rules, kept pure so they are tested on their own.
 *
 * A watch is something the person wants but not at today's price. Pence keeps
 * looking, and only calls them back for an offer that is good enough: at or
 * under the price they set, and cheaper than anything they already turned down.
 */

export type WatchStatus = "watching" | "found" | "accepted" | "cancelled";
export type OfferStatus = "new" | "declined" | "accepted" | "above" | "quiet";

const STOP = new Set([
  "the",
  "a",
  "an",
  "for",
  "and",
  "with",
  "new",
  "latest",
  "cheap",
  "cheapest",
  "deal",
  "deals",
  "offer",
  "offers",
  "uk",
  "in",
  "at",
  "of",
  "to",
  "my",
  "buy",
  "on",
  "or",
  "some",
  "any",
  "near",
  "me",
]);

/** Things bought for a product rather than the product itself. */
const ACCESSORIES = [
  "case",
  "cover",
  "screen protector",
  "protector",
  "charger",
  "cable",
  "strap",
  "skin",
  "holder",
  "mount",
  "stand",
  "adapter",
  "adaptor",
  "sleeve",
  "tempered glass",
  "replacement",
  "spare",
  "compatible with",
  "for use with",
];

function norm(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’‘'`´]/g, "")
    .replace(/[^a-z0-9+&]+/g, " ")
    .replace(/(\d)\s+(gb|tb|ml|mm|cm|kg|inch|in|hz|w)\b/g, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
}

function tokensOf(text: string): Set<string> {
  return new Set(norm(text).split(" ").filter(Boolean));
}

function hasPhrase(text: string, phrase: string): boolean {
  return ` ${norm(text)} `.includes(` ${norm(phrase)} `) || ` ${norm(text)} `.includes(` ${norm(phrase)}s `);
}

/** The words that must match: names, and any model numbers or sizes. */
export function watchTerms(what: string): { words: string[]; numbers: string[] } {
  const tokens = [...tokensOf(what)].filter((token) => !STOP.has(token));
  return {
    words: tokens.filter((token) => !/\d/.test(token)),
    numbers: tokens.filter((token) => /\d/.test(token)),
  };
}

/**
 * Whether a deal is for the thing being watched. Every model number must be
 * there (an iPhone 16 is not an iPhone 17), most of the words must be there,
 * and accessories are left out unless the person asked for one.
 */
export function fitsWatch(text: string, what: string): boolean {
  const { words, numbers } = watchTerms(what);
  if (words.length === 0 && numbers.length === 0) return false;
  const tokens = tokensOf(text);
  const has = (word: string) => tokens.has(word) || tokens.has(`${word}s`) || (word.endsWith("s") && tokens.has(word.slice(0, -1)));
  if (!numbers.every(has)) return false;
  const hits = words.filter(has).length;
  const need = words.length <= 2 ? words.length : Math.ceil(words.length * 0.6);
  if (hits < need) return false;
  const askedFor = ACCESSORIES.some((word) => hasPhrase(what, word));
  if (!askedFor && ACCESSORIES.some((word) => hasPhrase(text, word))) return false;
  return true;
}

export type PricedOffer = { pricePence: number | null; monthly: boolean };
export type WatchLimits = { targetPence: number | null; floorPence: number | null; declines: number };

/** "match": good enough to ask about. "above": too dear. "unpriced": no full price stated. */
export function judge(offer: PricedOffer, watch: WatchLimits): "match" | "above" | "unpriced" {
  const price = offer.monthly ? null : offer.pricePence;
  if (price == null || price <= 0) return "unpriced";
  if (watch.targetPence != null && price > watch.targetPence) return "above";
  if (watch.floorPence != null && price >= watch.floorPence) return "above";
  return "match";
}

/**
 * What a newly found offer becomes. An offer with no price, such as a code for
 * 10% off, is only worth a call before the person has set a price or turned
 * anything down; after that Pence needs a price to know it is better.
 */
export function offerStatus(offer: PricedOffer, watch: WatchLimits): OfferStatus {
  const verdict = judge(offer, watch);
  if (verdict === "match") return "new";
  if (verdict === "above") return "above";
  return watch.targetPence == null && watch.floorPence == null && watch.declines === 0 ? "new" : "quiet";
}

/** After "Still too much": the next offer must be cheaper than the cheapest one turned down. */
export function floorAfter(current: number | null, declinedPrices: (number | null)[]): number | null {
  const prices = declinedPrices.filter((price): price is number => price != null && price > 0);
  if (current != null) prices.push(current);
  return prices.length > 0 ? Math.min(...prices) : null;
}

/** What the person typed, on one line and not too long. */
export function cleanWhat(raw: string): string {
  return raw.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
}
