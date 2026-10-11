/*
 * Words that make a deal a promotion, and a promotion across a whole shop.
 * Shared by the personal offers and the Watchlist.
 */

const PROMO =
  /(\d{1,2}\s?% off|half price|\bfree\b|voucher|\bcode\b|cashback|discount|\bsale\b|points|double|rollback|clearance|price drop|reduced|£\d+(?:\.\d{2})? off|buy one get|\bbogof\b|\d for £|\b\d for \d\b|meal deal|members|app only|kids eat)/i;

/** True when a deal reads like a promotion at a shop, rather than one product. Used to rank shop watches. */
export function isPromotion(text: string): boolean {
  return PROMO.test(text);
}

const STORE_WIDE =
  /(spend £|when you spend|off (your|the|an?) (shop|order|basket|bill|meal)|site-?wide|store-?wide|\beverything\b|all (orders|items|products|food|groceries|fashion|clothing|menu)|\bon all\b|whole (shop|store|order)|app (offer|only|users|exclusive)|\bmembers?\b|loyalty|rewards|clubcard|nectar|student|\bnhs\b|blue light|kids eat|free delivery|delivery pass|discount (day|code)|every (mon|tues|wednes|thurs|fri|satur|sun)day|(mon|tues|wednes|thurs|fri|satur|sun)days?\b|\bsale\b.*\bup to\b|\bup to \d{1,2}\s?% off)/i;

/** True when a deal is for the whole shop or a whole department, not one product. */
export function isStoreWide(text: string): boolean {
  return STORE_WIDE.test(text) && isPromotion(text);
}
