import { isStoreWide } from "./promo.ts";
import { hasWord, matchShop, merchantCore, norm } from "./shops.ts";
import { type InterestHabit, type ShopHabit, type TasteProfile } from "./taste.ts";
import { BIG_TICKET, GENERIC_SHOP_WORDS, INTERESTS, type InterestDef, interestDef } from "./interests.ts";
/* What to search the deal boards for, and whether a deal fits. */

export type Need = {
  key: string;
  query: string;
  /** A deal must contain one of these (empty: anything that passes `avoid`). */
  match: string[];
  avoid: string[];
  /** Brand words of the shop when the need is a shop. */
  shopWords: string[];
  /**
   * For a shop that sells everything, such as a supermarket: the deal must be one
   * of these kinds of thing, or a promotion across the shop. Keeps step stools
   * and screenwash out of a food shop habit.
   */
  kindWords?: string[];
  /** A rival shop for the same habit, where the same spend could cost less. */
  elsewhere?: boolean;
  /** How many results to ask the deal board for. */
  limit?: number;
  item?: string;
  usualPence: number;
};

/** The words that say what a deal is for, without the shop names that appear in every deal. */
function kindWordsOf(def: InterestDef): string[] {
  const shops = new Set(def.shops.map((word) => word.replace(/^=/, "")));
  return [...def.match.filter((word) => !shops.has(word)), ...def.items];
}

/** Words that name this shop in a deal title. Unknown local shops fall back to their own name. */
function shopWordsFor(name: string, brandsOnly = false): string[] {
  const hits = matchShop(name).filter((hit) => !GENERIC_SHOP_WORDS.has(hit.word));
  const words = hits.map((hit) => hit.word.replace(/^=/, ""));
  const core = merchantCore(name);
  if (words.length === 0 && core.length >= 3 && !brandsOnly) words.push(core);
  return [...new Set(words)];
}

/** The searches that would help this person most, best first. */
export function searchNeeds(taste: TasteProfile, max = 9): Need[] {
  const needs: Need[] = [];
  const seen = new Set<string>();
  const push = (need: Need) => {
    const q = need.query.toLowerCase();
    if (!q || seen.has(q) || needs.length >= max) return;
    seen.add(q);
    needs.push(need);
  };
  const shopNeed = (shop: ShopHabit) => {
    const def = shop.interestId ? interestDef(shop.interestId) : undefined;
    // A deal board knows the chains, not the corner shop, so only named brands get a search.
    const words = shopWordsFor(shop.name, true);
    if (words.length === 0 || (def && !def.query)) return;
    push({
      key: shop.key,
      query: shop.name,
      match: [],
      avoid: def?.avoid ?? BIG_TICKET,
      shopWords: words,
      kindWords: def?.broad ? kindWordsOf(def) : undefined,
      usualPence: shop.avgPence,
    });
  };
  const interestNeed = (interest: InterestHabit) => {
    const def = interestDef(interest.id);
    if (!def?.query) return;
    push({
      key: interest.key,
      query: def.query,
      match: def.match,
      avoid: def.avoid,
      shopWords: [],
      // "ASDA screenwash" names a food shop but is not food, so a broad habit also needs a word for what is bought.
      kindWords: def.broad ? kindWordsOf(def) : undefined,
      usualPence: interest.avgPence,
    });
  };
  const itemNeed = (interest: InterestHabit) => {
    const def = interestDef(interest.id);
    // Only something bought more than once is a habit worth a search of its own.
    const fav = interest.items.find((item) => item.times >= 2);
    if (!def?.products || !fav) return;
    const words = fav.name
      .toLowerCase()
      .split(" ")
      .filter((word) => word.length >= 3 && !/^\d/.test(word));
    if (words.length === 0) return;
    push({
      key: interest.key,
      query: words.slice(0, 3).join(" "),
      match: words.slice(0, 3),
      avoid: def.avoid,
      shopWords: [],
      item: fav.name,
      usualPence: interest.avgPence,
    });
  };

  for (const interest of taste.interests) if (interest.added && interest.occasions === 0) interestNeed(interest);
  for (const up of taste.upcoming) {
    const shop = taste.shops.find((row) => row.key === up.key);
    const interest = taste.interests.find((row) => row.key === up.key);
    if (shop) shopNeed(shop);
    if (interest) interestNeed(interest);
  }
  const live = taste.interests.filter((row) => !row.faded || row.added);
  for (const interest of live.slice(0, 5)) {
    interestNeed(interest);
    itemNeed(interest);
  }
  for (const shop of taste.shops.filter((row) => !row.faded).slice(0, 4)) shopNeed(shop);
  for (const interest of live.slice(5)) interestNeed(interest);
  return needs;
}

/** True when this shop sells mainly this kind of thing, like Krispy Kreme for cakes. */
function specialistOf(shop: string, def: InterestDef): boolean {
  return matchShop(shop).some((hit) => hit.interest.id === def.id && !GENERIC_SHOP_WORDS.has(hit.word));
}

/**
 * Rival shops for the habits that matter most: where the same spend could cost
 * less. Someone at ASDA every week also gets Aldi and Iceland deals; someone
 * who pays Cineworld gets Vue and Odeon.
 */
export function rivalNeeds(taste: TasteProfile, max = 5): Need[] {
  const needs: Need[] = [];
  const used = new Set(taste.shops.flatMap((shop) => shopWordsFor(shop.name, true)));
  const live = taste.interests.filter((row) => row.occasions >= 2 && !row.faded);
  for (const interest of live.slice(0, 4)) {
    const def = interestDef(interest.id);
    if (!def?.rivals?.length) continue;
    let picked = 0;
    for (const rival of def.rivals) {
      if (needs.length >= max || picked >= 2) break;
      const words = shopWordsFor(rival, true);
      const names = words.length > 0 ? words : [rival.toLowerCase()];
      if (names.some((word) => used.has(word))) continue;
      needs.push({
        key: interest.key,
        query: rival,
        match: [],
        avoid: def.avoid,
        shopWords: names,
        // A specialist rival (Vue for a Cineworld habit) is on topic by name. Any other shop must be
        // selling the same kind of thing: Tesco counts for a cake habit only on its cakes.
        kindWords: def.broad || !specialistOf(rival, def) ? kindWordsOf(def) : undefined,
        elsewhere: true,
        limit: 8,
        usualPence: interest.avgPence,
      });
      picked += 1;
    }
  }
  return needs;
}

/**
 * Whether a deal fits a need. Keeps a grocery habit away from televisions. The
 * shop the deal board names counts for a shop need; what the deal is for is read
 * from the title alone.
 */
export function dealFits(title: string, need: Need, merchant = ""): boolean {
  const hay = norm(title);
  if (need.avoid.some((word) => hasWord(hay, word))) return false;
  if (need.shopWords.length > 0) {
    const where = norm(`${title} ${merchant}`);
    if (!need.shopWords.some((word) => hasWord(where, word))) return false;
    if (need.kindWords && !isStoreWide(title) && !need.kindWords.some((word) => hasWord(hay, word))) return false;
    return true;
  }
  if (need.match.length === 0) return true;
  if (need.item) return need.match.filter((word) => hasWord(hay, word)).length >= Math.min(2, need.match.length);
  if (!need.match.some((word) => hasWord(hay, word))) return false;
  if (need.kindWords && !isStoreWide(title) && !need.kindWords.some((word) => hasWord(hay, word))) return false;
  return true;
}

/** The interest a habit key belongs to: an interest itself, or the main interest of a shop. */
export function interestOfKey(key: string, taste: TasteProfile): InterestDef | undefined {
  if (key.startsWith("i:")) return interestDef(key.slice(2));
  const shop = taste.shops.find((row) => row.key === key);
  return shop?.interestId ? interestDef(shop.interestId) : undefined;
}

/** Habits where a far-away town is the point: a hotel in Scarborough, a train to Leeds. */
const TRAVEL = new Set(["flights", "hotels", "holidays", "trains"]);

/** True when a deal for this habit is only any use near where the person lives. */
export function usedNearHome(key: string, taste: TasteProfile): boolean {
  const def = interestOfKey(key, taste);
  return !def || !TRAVEL.has(def.id);
}

/** True when a deal is plainly about something else than this habit. */
export function offTopic(text: string, key: string, taste: TasteProfile): boolean {
  const def = interestOfKey(key, taste);
  if (!def) return false;
  const hay = norm(text);
  return def.avoid.some((word) => hasWord(hay, word));
}

/** The usual spend for a habit, used to turn a stated % off into pounds. */
export function usualFor(key: string, taste: TasteProfile): number {
  return (taste.interests.find((row) => row.key === key) ?? taste.shops.find((row) => row.key === key))?.avgPence ?? 0;
}

/** The shop named in a deal title, such as "… £3 @ Tesco" or "… at Boots". */
export function titleShop(title: string): string {
  const match = title.match(/(?:@|\bat\b|\||-)\s*([A-Z][\w&'’.+\- ]{1,30}?)\s*(?:\([^)]*\))?\s*$/);
  return match ? match[1].trim() : "";
}

/** True when a deal is at a shop this person already uses. */
export function atKnownShop(text: string, taste: TasteProfile): boolean {
  const hay = norm(text);
  return taste.shops.some((shop) => shopWordsFor(shop.name).some((word) => hasWord(hay, word)));
}

/** All interests a person can add by hand. */
export function addableInterests(): { key: string; label: string }[] {
  return INTERESTS.filter((def) => def.query).map((def) => ({ key: `i:${def.id}`, label: def.label }));
}
