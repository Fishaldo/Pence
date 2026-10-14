export type ListedDeal = { title: string; url: string; source: string };

export function mergeDeals<T extends ListedDeal>(first: T[], rest: T[], limit: number): T[] {
  const seen = new Set<string>();
  const found: T[] = [];
  for (const deal of [...first, ...rest]) {
    if (!deal.url || seen.has(deal.url)) continue;
    seen.add(deal.url);
    found.push(deal);
    if (found.length >= limit) break;
  }
  return found;
}
