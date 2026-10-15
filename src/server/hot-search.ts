export type HotDeal = {
  title: string;
  /** The deal page. Stable, so it is also the deal's id. */
  url: string;
  source: string;
  /** The shop's own page for this deal, when the board gives one. People go here, not to the board. */
  shopUrl?: string;
  merchant?: string;
  /** The shop's web address, such as "tkmaxx.com", for its logo. */
  shopHost?: string;
  /** A picture of the deal from the shop's own page, when there is one. */
  image?: string;
  code?: string;
  /** The price on the board, in pence, or null when none is given. */
  pricePence?: number | null;
  /** The price is per month (a contract or plan), not the full price. */
  monthly?: boolean;
  /** The end date the deal page prints, as YYYY-MM-DD, when it gives one. */
  endsOn?: string;
  /** An in-store deal at some places only, not nationwide. */
  inStore?: boolean;
};

/*
 * Reading HotUKDeals' public search and listing pages. Shared by the
 * trending list, the personal offer search and the price watch.
 *
 * Each deal card carries its thread as JSON in a data-vue3 attribute: the
 * title, the price, any voucher code, the shop's own link, and whether the
 * deal has expired. That is read first. If the page ever stops carrying it,
 * the plain links are read instead, as before.
 */

const MONTHLY =
  /(?:\/\s?(?:m|mo|mth|month)\b|\bper (?:month|mth)\b|\ba (?:month|mth)\b|\d\s?p\/m\b|\bpcm\b|£\s?\d+(?:\.\d{1,2})?\s?p\/?m\b|\bmonthly\b|\bx\s?(?:12|18|24|30|36)\b)/i;

/** True when a price in this text is a monthly payment, not the price of the thing. */
export function isMonthly(text: string): boolean {
  return MONTHLY.test(text);
}

/**
 * The price printed in a deal title, in pence. Skips amounts that are a saving
 * ("£50 off", "save £50") and gives up on monthly prices.
 */
export function titlePrice(title: string): number | null {
  if (isMonthly(title)) return null;
  for (const match of title.matchAll(/£\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?/g)) {
    const before = title.slice(Math.max(0, (match.index ?? 0) - 12), match.index).toLowerCase();
    const after = title.slice((match.index ?? 0) + match[0].length, (match.index ?? 0) + match[0].length + 10).toLowerCase();
    if (/(save|saving|get|extra|up to)\s*$/.test(before) || /^\s*(off|cashback|credit|voucher|gift)/.test(after)) continue;
    const pounds = Number(match[1].replace(/,/g, ""));
    const pence = Math.round(pounds * 100 + Number((match[2] ?? "0").padEnd(2, "0")));
    if (pence > 0) return pence;
  }
  return null;
}

function cleanCode(value: unknown): string {
  const code = typeof value === "string" ? value.trim() : "";
  return /^[A-Za-z0-9-]{3,24}$/.test(code) ? code : "";
}

function findThread(value: unknown, depth = 0): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || depth > 6) return null;
  const row = value as Record<string, unknown>;
  const id = row.threadId;
  if ((typeof id === "string" || typeof id === "number") && typeof row.title === "string") return row;
  for (const child of Object.values(row)) {
    const hit = findThread(child, depth + 1);
    if (hit) return hit;
  }
  return null;
}

/**
 * Deals from the thread JSON on a HotUKDeals page. Expired deals are left out.
 *
 * Each card carries two pieces: the thread itself (title, price, voucher code,
 * merchant, the shop's host, expiry) and the "Get deal" button, whose link
 * goes through HotUKDeals straight on to the shop. That button link is used as
 * the shop link, so people land on the shop, not on the deal board.
 */
/** Titles of board threads that gather many deals or chat, rather than one deal. */
export const ROUNDUP = /\bmega ?thread\b|\bround[- ]?up\b|\bdiscussion\b|\bweekly thread\b|\bbest deals (?:thread|list)\b/i;

export function readThreads(html: string, limit: number): HotDeal[] {
  const threads: Record<string, unknown>[] = [];
  const buttons = new Map<string, string>();
  for (const match of html.matchAll(/data-vue3=(?:"([^"]*)"|'([^']*)')/g)) {
    let data: unknown;
    try {
      data = JSON.parse(decode(match[1] ?? match[2] ?? ""));
    } catch {
      continue;
    }
    const row = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
    const props = row?.props && typeof row.props === "object" ? (row.props as Record<string, unknown>) : null;
    if (row?.name === "ThreadListItemMainButton" && props) {
      const id = props.threadId;
      const link = props.link;
      if ((typeof id === "string" || typeof id === "number") && typeof link === "string") {
        if (/^https:\/\/www\.hotukdeals\.com\/visit\//.test(link)) buttons.set(String(id), link);
      }
      continue;
    }
    const thread = findThread(data);
    if (thread) threads.push(thread);
  }

  const deals: HotDeal[] = [];
  const seen = new Set<string>();
  for (const thread of threads) {
    if (thread.isExpired === true) continue;
    // A round-up or discussion thread is not a deal you can get: skip it.
    if (ROUNDUP.test(String(thread.title ?? ""))) continue;
    const id = String(thread.threadId);
    const title = decode(String(thread.title)).replace(/\s+/g, " ").trim().slice(0, 140);
    const slug = typeof thread.titleSlug === "string" ? thread.titleSlug : "";
    const url = `https://www.hotukdeals.com/deals/${slug ? `${slug}-` : ""}${id}`;
    if (!title || seen.has(url)) continue;
    seen.add(url);
    let shopUrl = "";
    if (typeof thread.link === "string" && thread.link) {
      try {
        const link = new URL(thread.link);
        if (link.protocol === "https:" && !/hotukdeals\.com$/.test(link.hostname)) shopUrl = link.href;
      } catch {
        /* no direct shop link */
      }
    }
    const hasShop = typeof thread.linkHost === "string" && thread.linkHost.trim() !== "";
    if (!shopUrl && hasShop) shopUrl = buttons.get(id) ?? `https://www.hotukdeals.com/visit/thread/${id}`;
    const merchantRow =
      thread.merchant && typeof thread.merchant === "object" ? (thread.merchant as Record<string, unknown>) : null;
    const merchant =
      typeof merchantRow?.merchantName === "string"
        ? merchantRow.merchantName
        : typeof thread.merchantName === "string"
          ? thread.merchantName
          : "";
    const monthly = isMonthly(title);
    const price = typeof thread.price === "number" ? thread.price : Number(thread.price);
    const end =
      thread.endDate && typeof thread.endDate === "object" ? Number((thread.endDate as Record<string, unknown>).timestamp) : NaN;
    // Past its printed end date, even if nobody has marked it expired yet.
    if (Number.isFinite(end) && end * 1000 < Date.now()) continue;
    const locations =
      thread.selectedLocations && typeof thread.selectedLocations === "object"
        ? (thread.selectedLocations as Record<string, unknown>)
        : null;
    deals.push({
      title,
      url,
      source: "HotUKDeals",
      shopUrl,
      merchant: merchant.trim().slice(0, 60),
      shopHost: hasShop ? String(thread.linkHost).trim().toLowerCase().replace(/^www\./, "").slice(0, 80) : "",
      code: cleanCode(thread.voucherCode),
      pricePence: !monthly && Number.isFinite(price) && price > 0 ? Math.round(price * 100) : titlePrice(title),
      monthly,
      endsOn: Number.isFinite(end) ? londonDay(end * 1000) : undefined,
      inStore: thread.isLocal === true && locations?.isNational !== true,
    });
    if (deals.length >= limit) break;
  }
  return deals;
}

export function decode(value: string): string {
  let text = value.replace(/<!\[CDATA\[|\]\]>/g, "");
  for (let i = 0; i < 2; i += 1) {
    text = text
      .replace(/\u0026amp;/g, "\u0026")
      .replace(/\u0026quot;/g, '"')
      .replace(/\u0026#0?39;|\u0026apos;/g, "'")
      .replace(/\u0026lt;/g, "<")
      .replace(/\u0026gt;/g, ">")
      .replace(/\u0026nbsp;/g, " ");
  }
  return text;
}

export function readHot(html: string, limit: number): HotDeal[] {
  const threads = readThreads(html, limit);
  if (threads.length > 0) return threads;
  const deals: HotDeal[] = [];
  const seen = new Set<string>();
  const pattern = /href="(https:\/\/www\.hotukdeals\.com\/deals\/[^"]+)"[^>]*>([^<]+)<\/a>/g;
  for (const match of html.matchAll(pattern)) {
    const url = match[1].split("?")[0];
    const title = decode(match[2]).replace(/\s+/g, " ").trim().slice(0, 140);
    if (!title || seen.has(url)) continue;
    seen.add(url);
    deals.push({ title, url, source: "HotUKDeals", pricePence: titlePrice(title), monthly: isMonthly(title) });
    if (deals.length >= limit) break;
  }
  return deals;
}

function londonDay(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(ms),
  );
}

/** The words of a deal post, from its page: where it works, who it is for, how to use it. */
export function readDealText(html: string): string {
  const match = html.match(/"preparedHtmlDescription":"((?:[^"\\]|\\.)*)"/);
  if (!match) return "";
  let raw = "";
  try {
    raw = JSON.parse(`"${match[1]}"`) as string;
  } catch {
    return "";
  }
  return decode(raw.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " "))
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim()
    .slice(0, 3000);
}

const pageCache = globalThis as typeof globalThis & { __penceDealText__?: Map<string, { at: number; text: string }> };

/** The words of one deal post, read from its page, kept for an hour. Empty when the page can't be read. */
export async function dealText(url: string): Promise<string> {
  if (!/^https:\/\/www\.hotukdeals\.com\/deals\//.test(url)) return "";
  const cache = (pageCache.__penceDealText__ ??= new Map());
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < 3_600_000) return hit.text;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return "";
    const text = readDealText(await res.text());
    if (cache.size > 500) cache.clear();
    cache.set(url, { at: Date.now(), text });
    return text;
  } catch {
    return "";
  }
}

export async function searchHot(query: string, limit: number): Promise<HotDeal[]> {
  const pages = limit > 20 ? [1, 2, 3] : limit > 8 ? [1, 2] : [1];
  const chunks = await Promise.all(
    pages.map(async (page) => {
      const res = await fetch(
        `https://www.hotukdeals.com/search?q=${encodeURIComponent(query)}&page=${page}&ajax=true`,
        {
          headers: {
            Accept: "application/json",
            "User-Agent": "Mozilla/5.0",
            "X-Requested-With": "XMLHttpRequest",
          },
          signal: AbortSignal.timeout(12_000),
        },
      );
      if (!res.ok) return [] as HotDeal[];
      const body = (await res.json()) as { data?: { content?: string } };
      return readHot(body.data?.content ?? "", limit);
    }),
  );
  const found: HotDeal[] = [];
  const seen = new Set<string>();
  for (const deal of chunks.flat()) {
    if (seen.has(deal.url)) continue;
    seen.add(deal.url);
    found.push(deal);
    if (found.length >= limit) break;
  }
  return found;
}

export function tidyTitle(value: string): string {
  return decode(value)
    .replace(/^\d+\u00b0\s*-\s*/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);
}

export function readRss(xml: string, limit: number): HotDeal[] {
  const deals: HotDeal[] = [];
  const seen = new Set<string>();
  const pattern = /<item>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<link>([\s\S]*?)<\/link>/g;
  for (const match of xml.matchAll(pattern)) {
    const title = tidyTitle(match[1]);
    const url = decode(match[2]).trim().split("?")[0];
    if (!title || !url.startsWith("https://www.hotukdeals.com/deals/") || seen.has(url)) continue;
    seen.add(url);
    deals.push({ title, url, source: "HotUKDeals" });
    if (deals.length >= limit) break;
  }
  return deals;
}

export async function listing(page: number): Promise<HotDeal[]> {
  const res = await fetch(`https://www.hotukdeals.com/new?page=${page}&ajax=true`, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0",
      "X-Requested-With": "XMLHttpRequest",
    },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) return [];
  const body = (await res.json()) as { data?: { content?: string } };
  return readHot(body.data?.content ?? "", 40);
}

export async function trending(limit: number): Promise<HotDeal[]> {
  // The hot page carries codes and shop links; the RSS feed is the fallback.
  try {
    const res = await fetch("https://www.hotukdeals.com/hot?page=1&ajax=true", {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0",
        "X-Requested-With": "XMLHttpRequest",
      },
      signal: AbortSignal.timeout(12_000),
    });
    if (res.ok) {
      const body = (await res.json()) as { data?: { content?: string } };
      const deals = readHot(body.data?.content ?? "", limit);
      if (deals.length > 0) return deals;
    }
  } catch {
    /* fall back to the feed */
  }
  const res = await fetch("https://www.hotukdeals.com/rss/trending", {
    headers: { "User-Agent": "Pence/1.0", Accept: "application/rss+xml, text/xml" },
    signal: AbortSignal.timeout(12_000),
    redirect: "follow",
  });
  if (!res.ok) return [];
  return readRss(await res.text(), limit);
}
