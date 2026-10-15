/*
 * Where a deal sends the person, and what the link says. The shop's own page
 * comes first; a deal board or forum only when nothing else is known.
 */

/** Deal boards and forums: places that talk about a deal but are not where you get it. */
const BOARDS =
  /(^|\.)(hotukdeals\.com|reddit\.com|latestdeals\.co\.uk|moneysavingexpert\.com|vouchercodes\.co\.uk|myvouchercodes\.co\.uk|voucherbox\.co\.uk|quidco\.com|topcashback\.co\.uk|facebook\.com|x\.com|twitter\.com)$/;

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export type Linkable = { url: string; shopUrl?: string; merchant?: string; code?: string; source?: string; shopHost?: string };

/** Where to send the person: the shop's own page whenever it is known. */
export function goUrl(deal: Linkable): string {
  return deal.shopUrl || deal.url;
}

export function goLabel(deal: Linkable): string {
  const target = goUrl(deal);
  const host = hostOf(target);
  // HotUKDeals' /visit/ links forward straight to the shop, like their "Get deal" button.
  const forwards = /hotukdeals\.com$/.test(host) && /\/visit\//.test(target);
  if (BOARDS.test(host) && !forwards) return deal.code ? `Where to use it, on ${host}` : `See the deal on ${host}`;
  const known = deal.merchant || deal.shopHost;
  if (forwards && !known) return deal.code ? "Use it at the shop" : "Go to the shop";
  const name = known || (forwards ? "" : host) || "the shop";
  return deal.code ? `Use it at ${name}` : `Get it at ${name}`;
}

/** The shop page a deal's picture can be read from: never a board, and never a board's click-through link. */
export function pictureSource(deal: Linkable): string {
  for (const link of [deal.shopUrl, deal.url]) {
    if (!link) continue;
    const host = hostOf(link);
    if (!host || BOARDS.test(host) || /\/visit\//.test(link)) continue;
    return link;
  }
  return "";
}

/** The shop's name for a deal: the shop itself, never the board it was found on. */
export function shopName(deal: Linkable & { shopHost?: string }): string {
  if (deal.merchant?.trim()) return deal.merchant.trim();
  const host = deal.shopHost || hostOf(pictureSource(deal));
  if (host) return host;
  const source = deal.source?.trim() ?? "";
  return source && !/hotukdeals|reddit|latestdeals/i.test(source) ? source : "UK deal";
}
