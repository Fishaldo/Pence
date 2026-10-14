import { useEffect, useState } from "react";
import { spendQueries } from "@/lib/core/model";
import { mergeDeals } from "@/lib/core/deals";
import { hotDeals, type HotDeal } from "@/server/hotukdeals";
import { publicDeals } from "@/server/public-deals";
import { useLedger } from "./data";
import { DealAction } from "./deal-bits";
import { PageHead } from "./ui";

export function HotView() {
  const { txs } = useLedger();
  const [deals, setDeals] = useState<HotDeal[] | null>(null);
  const [shown, setShown] = useState(15);
  const kinds = spendQueries(
    (txs.data ?? []).map((tx) => ({ category: tx.category, amountPence: tx.amountPence, isSample: tx.isSample })),
    4,
  );
  const key = kinds.join("|");

  useEffect(() => {
    if (txs.isPending) return;
    let cancel = false;
    const queries = key ? key.split("|") : ["uk deals"];
    void hotDeals({ data: { queries, limit: 100 } })
      .then((found) => {
        if (!cancel) setDeals((prev) => mergeDeals(found, prev ?? [], 100));
      })
      .catch(() => {
        if (!cancel) setDeals((prev) => prev ?? []);
      });
    void publicDeals({ data: { queries, limit: 12 } })
      .then((found) => {
        if (!cancel) setDeals((prev) => mergeDeals(prev ?? [], found, 100));
      })
      .catch(() => {
        if (!cancel) setDeals((prev) => prev ?? []);
      });
    return () => {
      cancel = true;
    };
  }, [txs.isPending, key]);

  return (
    <div>
      <PageHead back="/offers" title="Popular now in the UK" sub="Deals people are using right now, from public UK deal pages." />
      {deals == null ? <div className="mb-4 h-40 animate-pulse rounded-lg bg-sand" /> : null}
      {deals && deals.length === 0 ? <p className="panel p-5 text-sm">Nothing trending just now.</p> : null}
      {deals && deals.length > 0 ? (
        <ul className="space-y-3">
          {deals.slice(0, shown).map((deal) => (
            <li key={deal.url} className="panel p-4">
              <p className="text-sm text-muted">{deal.merchant || deal.source}</p>
              <p className="mt-1 font-bold">{deal.title}</p>
              <DealAction deal={deal} />
            </li>
          ))}
        </ul>
      ) : null}
      {deals && deals.length > shown && shown < 100 ? (
        <button type="button" className="btn btn-quiet mt-4" onClick={() => setShown((count) => Math.min(100, count + 15))}>
          More
        </button>
      ) : null}
    </div>
  );
}
