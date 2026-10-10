import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { listing, searchHot, trending, type HotDeal } from "@/server/hot-search";

export type { HotDeal };

function cleanQuery(value: string): string {
  return value.replace(/[^\p{L}\p{N}\s&.'’-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 60);
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
