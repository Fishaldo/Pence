export type HotDeal = {
  title: string;
  /** The deal page. Stable, so it is also the deal's id. */
  url: string;
  source: string;
  /** The shop's own page for this deal, when the board gives one. People go here, not to the board. */
  shopUrl?: string;
  merchant?: string;
  /** A discount code, only when the board prints one. */
  code?: string;
  /** The price on the board, in pence, or null when none is given. */
  pricePence?: number | null;
  /** The price is per month (a contract or plan), not the full price. */
  monthly?: boolean;
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

const MONTHLY = /(?:\/\s?(?:mo|mth|month)\b|\bper month\b|\ba month\b|\bp\/?m\b|\bmonthly\b)/i;

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

/** Deals from the thread JSON on a HotUKDeals page. Expired deals are left out. */
export function readThreads(html: string, limit: number): HotDeal[] {
  const deals: HotDeal[] = [];
  const seen = new Set<string>();
  for (const match of html.matchAll(/data-vue3=(?:"([^"]*)"|'([^']*)')/g)) {
    let data: unknown;
    try {
      data = JSON.parse(decode(match[1] ?? match[2] ?? ""));
    } catch {
      continue;
    }
    const thread = findThread(data);
    if (!thread || thread.isExpired === true) continue;
    const id = String(thread.threadId);
    const title = decode(String(thread.title)).replace(/\s+/g, " ").trim().slice(0, 140);
    const slug = typeof thread.titleSlug === "string" ? thread.titleSlug : "";
    const share = typeof thread.shareableLink === "string" ? thread.shareableLink.split("?")[0] : "";
    const url = share.startsWith("https://www.hotukdeals.com/")
      ? share
      : `https://www.hotukdeals.com/deals/${slug ? `${slug}-` : ""}${id}`;
    if (!title || seen.has(url)) continue;
    seen.add(url);
    let shopUrl = "";
    if (typeof thread.link === "string") {
      try {
        const link = new URL(thread.link);
        if (link.protocol === "https:" && !/hotukdeals\.com$/.test(link.hostname)) shopUrl = link.href;
      } catch {
        /* no shop link */
      }
    }
    const merchantRow = thread.merchant && typeof thread.merchant === "object" ? (thread.merchant as Record<string, unknown>) : null;
    const merchant =
      typeof merchantRow?.merchantName === "string"
        ? merchantRow.merchantName
        : typeof thread.merchantName === "string"
          ? thread.merchantName
          : "";
    const monthly = isMonthly(title);
    const price = typeof thread.price === "number" ? thread.price : Number(thread.price);
    deals.push({
      title,
      url,
      source: "HotUKDeals",
      shopUrl,
      merchant: merchant.trim().slice(0, 60),
      code: cleanCode(thread.voucherCode),
      pricePence: !monthly && Number.isFinite(price) && price > 0 ? Math.round(price * 100) : titlePrice(title),
      monthly,
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
  const res = await fetch("https://www.hotukdeals.com/rss/trending", {
    headers: { "User-Agent": "Pence/1.0", Accept: "application/rss+xml, text/xml" },
    signal: AbortSignal.timeout(12_000),
    redirect: "follow",
  });
  if (!res.ok) return [];
  return readRss(await res.text(), limit);
}
