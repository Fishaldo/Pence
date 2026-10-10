export type HotDeal = {
  title: string;
  url: string;
  source: string;
};

/*
 * Reading HotUKDeals' public search and listing pages. Shared by the
 * trending list and the personal offer search.
 */

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
  const deals: HotDeal[] = [];
  const seen = new Set<string>();
  const pattern = /href="(https:\/\/www\.hotukdeals\.com\/deals\/[^"]+)"[^>]*>([^<]+)<\/a>/g;
  for (const match of html.matchAll(pattern)) {
    const url = match[1].split("?")[0];
    const title = decode(match[2]).replace(/\s+/g, " ").trim().slice(0, 140);
    if (!title || seen.has(url)) continue;
    seen.add(url);
    deals.push({ title, url, source: "HotUKDeals" });
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
