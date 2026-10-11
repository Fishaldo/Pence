import { judgeTerms, readTerms, worthReadingTerms } from "@/lib/spend/terms";
import { dealText } from "@/server/hot-search";

/*
 * Reading an offer's small print before it is shown, the way a careful friend
 * would. The title is read first; when it hints at limits, or carries a code,
 * or is an in-store deal, the deal page is read too. Offers that plainly do
 * not work where the person lives, or are for new customers at a shop they
 * already use, are dropped. The rest carry a short line on what Pence read.
 */

export type Vetted = { check: string; works: boolean };

type Offer = { url: string; title: string; detail?: string; code?: string; inStore?: boolean };

export async function vetOffers<T extends Offer>(
  offers: T[],
  context: { city: string; usesShop?: (offer: T) => boolean; maxPages?: number },
): Promise<(T & Vetted)[]> {
  const kept: (T & Vetted & { readPage: boolean; uses: boolean })[] = [];
  for (const offer of offers) {
    const uses = context.usesShop?.(offer) ?? false;
    const text = `${offer.title}\n${offer.detail ?? ""}`;
    const verdict = judgeTerms(readTerms(text), { city: context.city, usesShop: uses });
    if (!verdict.show) continue;
    kept.push({
      ...offer,
      check: verdict.note,
      works: verdict.works,
      readPage: Boolean(offer.code) || offer.inStore === true || worthReadingTerms(text),
      uses,
    });
  }
  const dropped = new Set<string>();
  await Promise.all(
    kept
      .filter((offer) => offer.readPage)
      .slice(0, context.maxPages ?? 12)
      .map(async (offer) => {
        const page = await dealText(offer.url);
        if (!page) return;
        const verdict = judgeTerms(readTerms(`${offer.title}\n${offer.detail ?? ""}\n${page}`), {
          city: context.city,
          usesShop: offer.uses,
        });
        if (!verdict.show) dropped.add(offer.url);
        offer.check = verdict.note;
        offer.works = verdict.works;
      }),
  );
  return kept
    .filter((offer) => !dropped.has(offer.url))
    .map(({ readPage: _readPage, uses: _uses, ...offer }) => offer as unknown as T & Vetted);
}
