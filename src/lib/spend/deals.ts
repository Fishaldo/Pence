export type ListedDeal = { title: string; url: string; source: string };

export function mergeDeals(first: ListedDeal[], rest: ListedDeal[], limit: number): ListedDeal[] {
  const seen = new Set<string>();
  const found: ListedDeal[] = [];
  for (const deal of [...first, ...rest]) {
    if (!deal.url || seen.has(deal.url)) continue;
    seen.add(deal.url);
    found.push(deal);
    if (found.length >= limit) break;
  }
  return found;
}
