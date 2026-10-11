import { hasWord, interestDef, merchantInterest } from "./habits.ts";
import { isPromotion, isStoreWide } from "./promo.ts";

export { isPromotion, isStoreWide };

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
  "magsafe",
  "wallet",
  "lens protector",
  "camera protector",
  "screen guard",
  "popsocket",
  "grip",
  "film",
  "dock",
  "lanyard",
  "tripod",
  "selfie stick",
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

/**
 * Whether a price is believable for the thing watched. A £21.99 "iPhone" next to
 * £800 ones is a case, a part, or a monthly price that slipped through, so it must
 * not be offered as the iPhone, nor become the price to beat.
 */
export function plausiblePrice(price: number | null, others: number[], targetPence: number | null): boolean {
  if (price == null || price <= 0) return true;
  if (targetPence != null && price < targetPence * 0.2) return false;
  const priced = others.filter((value) => value > 0).sort((a, b) => a - b);
  if (priced.length < 3) return true;
  const mid = priced.length % 2 ? priced[(priced.length - 1) / 2] : (priced[priced.length / 2 - 1] + priced[priced.length / 2]) / 2;
  return price >= mid * 0.35;
}

/** After "Still too much": the next offer must be cheaper than the cheapest one turned down. */
export function floorAfter(current: number | null, declinedPrices: (number | null)[]): number | null {
  const prices = declinedPrices.filter((price): price is number => price != null && price > 0);
  if (current != null) prices.push(current);
  return prices.length > 0 ? Math.min(...prices) : null;
}

/** What is being watched: an item, a shop or place, or an item at a shop. */
export type WatchTarget = { item: string; shop: string };

/** How a watch reads: "iPhone 17 Pro at Argos", "ASDA", or "Nike Air Max 90". */
export function watchLabel(target: WatchTarget): string {
  const item = cleanWhat(target.item);
  const shop = cleanWhat(target.shop);
  if (item && shop) return `${item} at ${shop}`.slice(0, 120);
  return item || shop;
}

/** Whether a deal names this shop or place: every word of its name, in the title or the shop field. */
export function namesShop(text: string, shop: string): boolean {
  const words = [...tokensOf(shop)].filter((word) => !STOP.has(word) || tokensOf(shop).size === 1);
  if (words.length === 0) return false;
  const tokens = tokensOf(text);
  const joined = ` ${[...tokens].join(" ")} `;
  // "Pure Gym" is often written "PureGym", and "Nando's" as "Nandos".
  return words.every((word) => tokens.has(word)) || joined.includes(` ${words.join("")} `);
}

/** Whether a deal fits a watch: the item, the shop, or both when both were given. */
export function fitsTarget(text: string, merchant: string, target: WatchTarget): boolean {
  const item = cleanWhat(target.item);
  const shop = cleanWhat(target.shop);
  if (!item && !shop) return false;
  if (item && !fitsWatch(text, item)) return false;
  if (shop && !namesShop(`${text} ${merchant}`, shop)) return false;
  return true;
}

/** Plan's "What" choices, in words, and the kinds of thing each one covers. */
export const KIND_WORDS: Record<string, { words: string; interests: string[] }> = {
  groceries: { words: "groceries", interests: ["food-shop", "drinks", "cleaning", "toiletries", "kids", "pets"] },
  dining: { words: "eating out", interests: ["eating-out", "takeaway", "coffee", "lunch"] },
  pub: { words: "the pub", interests: ["eating-out", "drinks"] },
  fashion: { words: "clothes and shoes", interests: ["clothes", "shoes"] },
  tech: { words: "phones and tech", interests: ["tech", "gaming"] },
  health: { words: "health and pharmacy", interests: ["pharmacy"] },
  personal: { words: "beauty and personal care", interests: ["beauty", "toiletries", "hair", "perfume"] },
  fitness: { words: "the gym", interests: ["fitness"] },
  household: { words: "household things", interests: ["home", "cleaning"] },
  furniture: { words: "furniture and appliances", interests: ["home"] },
  garden: { words: "the garden", interests: ["home"] },
  kids: { words: "kids and baby", interests: ["kids"] },
  pets: { words: "pets", interests: ["pets"] },
  entertainment: { words: "days out and entertainment", interests: ["going-out", "gaming"] },
  holiday: { words: "holidays", interests: ["hotels", "flights", "holidays"] },
  travel: { words: "travel", interests: ["hotels", "flights", "holidays", "trains"] },
  transport: { words: "fuel and transport", interests: ["car", "trains", "getting-around", "taxis"] },
  car: { words: "the car", interests: ["car"] },
  gifts: { words: "gifts", interests: ["gifts"] },
  subscriptions: { words: "subscriptions", interests: ["streaming", "memberships", "career"] },
  energy: { words: "gas and electricity", interests: ["energy"] },
  broadband: { words: "broadband", interests: ["phone-broadband"] },
  mobile: { words: "mobile", interests: ["phone-broadband"] },
  insurance: { words: "insurance", interests: ["insurance"] },
};

/**
 * For a watched shop or place, which deals are worth a call. Promotions across
 * the whole shop always count. Single products count when they are the kind of
 * thing the person goes there for: a big shop goes by what was picked in Plan
 * (ASDA for groceries skips its air fryers), while a specialist such as a gym,
 * or a place Pence does not know, takes anything naming it.
 */
export function shopDealFits(text: string, kind: string): boolean;
export function shopDealFits(text: string, kind: string, shop: string): boolean;
export function shopDealFits(text: string, kind: string, shop = ""): boolean {
  if (isStoreWide(text)) return true;
  const own = shop ? merchantInterest(shop, "other").id : null;
  const ownDef = own ? interestDef(own) : undefined;
  const fromKind = KIND_WORDS[kind]?.interests ?? [];
  // A place Pence does not know, such as a local restaurant, is rare on deal pages: anything naming it counts.
  if (!own || !ownDef) return true;
  // A specialist only sells one kind of thing, so a deal naming it is already on topic.
  if (!ownDef.broad) return true;
  const allowed = fromKind.length > 0 ? fromKind : [own];
  const hay = text.toLowerCase();
  return allowed.some((id) => {
    const def = interestDef(id);
    if (!def) return false;
    if (def.avoid.some((word) => hasWord(hay, word))) return false;
    // A shop's own name is in most of its deals, so it says nothing about what the deal is for.
    const shops = new Set(def.shops.map((word) => word.replace(/^=/, "")));
    const words = [...def.match.filter((word) => !shops.has(word)), ...def.items];
    return words.some((word) => hasWord(hay, word));
  });
}

/**
 * What a newly found offer becomes for this watch. A watch on a shop or place
 * alone is waiting for any promotion there, so price does not decide it.
 */
export function offerStatusFor(offer: PricedOffer, watch: WatchLimits, target: WatchTarget): OfferStatus {
  if (!cleanWhat(target.item) && cleanWhat(target.shop)) return "new";
  return offerStatus(offer, watch);
}

/** What the person typed, on one line and not too long. */
export function cleanWhat(raw: string): string {
  return raw.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
}
