import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";

export type HotDeal = {
  title: string;
  url: string;
  source: string;
};

function cleanQuery(value: string): string {
  return value.replace(/[^\p{L}\p{N}\s&.'’-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}

function decode(value: string): string {
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

function readHot(html: string, limit: number): HotDeal[] {
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

async function searchHot(query: string, limit: number): Promise<HotDeal[]> {
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

function tidyTitle(value: string): string {
  return decode(value)
    .replace(/^\d+\u00b0\s*-\s*/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);
}

function readRss(xml: string, limit: number): HotDeal[] {
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

async function listing(page: number): Promise<HotDeal[]> {
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

async function trending(limit: number): Promise<HotDeal[]> {
  const res = await fetch("https://www.hotukdeals.com/rss/trending", {
    headers: { "User-Agent": "Pence/1.0", Accept: "application/rss+xml, text/xml" },
    signal: AbortSignal.timeout(12_000),
    redirect: "follow",
  });
  if (!res.ok) return [];
  return readRss(await res.text(), limit);
}

export const hotDeals = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    if (!input || typeof input !== "object") return { queries: [] as string[], limit: 6, related: false };
    const row = input as Record<string, unknown>;
    const raw = Array.isArray(row.queries) ? row.queries : [];
    const queries = raw
      .filter((item): item is string => typeof item === "string")
      .map(cleanQuery)
      .filter((item) => item.length >= 2)
      .slice(0, 6);
    const asked = typeof row.limit === "number" ? row.limit : Number(row.limit);
    const limit = Number.isFinite(asked) ? Math.min(100, Math.max(1, Math.round(asked))) : 6;
    return { queries, limit, related: row.related === true };
  })
  .handler(async ({ data }): Promise<HotDeal[]> => {
    if (data.related) {
      const each = Math.max(20, Math.ceil(data.limit / Math.max(1, data.queries.length)));
      const batches = await Promise.all(
        data.queries.map(async (query) => searchHot(query, each).catch(() => [] as HotDeal[])),
      );
      const fold = (value: string) => value.toLowerCase().replace(/['’]/g, "");
      const keys = data.queries
        .flatMap((query) => fold(query).split(/\s+/))
        .filter((word) => word.length > 2 && !["and", "the", "for", "with", "upon"].includes(word));
      const found: HotDeal[] = [];
      const seen = new Set<string>();
      for (const deal of batches.flat()) {
        if (seen.has(deal.url)) continue;
        if (keys.length > 0 && !keys.some((word) => fold(deal.title).includes(word))) continue;
        seen.add(deal.url);
        found.push(deal);
        if (found.length >= data.limit) break;
      }
      return found;
    }
    if (data.limit >= 80) {
      const pages = Math.min(4, Math.ceil(data.limit / 30));
      const [national, listed, habits] = await Promise.all([
        trending(30).catch(() => [] as HotDeal[]),
        Promise.all(Array.from({ length: pages }, (_, index) => listing(index + 1).catch(() => [] as HotDeal[]))),
        Promise.all(data.queries.map(async (query) => searchHot(query, 8).catch(() => [] as HotDeal[]))),
      ]);
      const found: HotDeal[] = [];
      const seen = new Set<string>();
      for (const deal of [...national, ...habits.flat(), ...listed.flat()]) {
        if (seen.has(deal.url)) continue;
        seen.add(deal.url);
        found.push(deal);
        if (found.length >= data.limit) break;
      }
      return found;
    }
    const nationalCap = data.limit <= 3 ? data.limit : Math.min(12, Math.ceil(data.limit / 2));
    const national = await trending(nationalCap).catch(() => [] as HotDeal[]);
    const room = data.limit - national.length;
    const each = room > 0 ? Math.max(3, Math.ceil(room / Math.max(1, data.queries.length))) : 0;
    const batches =
      each === 0
        ? []
        : await Promise.all(data.queries.map(async (query) => searchHot(query, each).catch(() => [] as HotDeal[])));
    const found: HotDeal[] = [];
    const seen = new Set<string>();
    for (const deal of [...national, ...batches.flat()]) {
      if (seen.has(deal.url)) continue;
      seen.add(deal.url);
      found.push(deal);
      if (found.length >= data.limit) break;
    }
    return found;
  });
