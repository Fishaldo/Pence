import { useEffect, useState } from "react";
import { frequentShops, PROGRAMMES, spendQueries } from "@/lib/spend/model";
import { mergeDeals } from "@/lib/spend/deals";
import { shopOffers, type ShopOffer } from "@/server/offers";
import { hotDeals, type HotDeal } from "@/server/hotukdeals";
import { publicDeals } from "@/server/public-deals";
import { useLedger } from "./data";
import { errorText, PageHead } from "./ui";

const SCHEMES: { test: RegExp; id: string }[] = [
  { test: /tesco/, id: "clubcard" },
  { test: /sainsbury/, id: "nectar" },
  { test: /lidl/, id: "lidl" },
  { test: /aldi/, id: "aldi" },
  { test: /boots/, id: "boots" },
  { test: /uber|bolt/, id: "rides" },
];

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function OfferCard({ offer }: { offer: ShopOffer }) {
  return (
    <li className="panel p-4">
      <p className="text-sm text-muted">{offer.merchant}</p>
      <p className="mt-1 font-medium">{offer.title}</p>
      <p className="mt-1 text-sm">{offer.detail}</p>
      {offer.code ? (
        <p className="mt-2 text-sm">
          Code <span className="font-medium tabular-nums">{offer.code}</span>
        </p>
      ) : null}
      <a href={offer.url} className="mt-2 inline-block text-sm font-medium text-forest" target="_blank" rel="noreferrer">
        Open {hostOf(offer.url)}
      </a>
    </li>
  );
}

export function OffersView() {
  const { txs } = useLedger();
  const [yours, setYours] = useState<ShopOffer[] | null>(null);
  const [other, setOther] = useState<ShopOffer[]>([]);
  const [note, setNote] = useState("");
  const [hot, setHot] = useState<HotDeal[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const loaded = !txs.isPending;
  const { shops } = frequentShops(
    (txs.data ?? []).map((tx) => ({
      merchant: tx.merchant,
      amountPence: tx.amountPence,
      isSample: tx.isSample,
    })),
  );
  const schemes = PROGRAMMES.filter((programme) =>
    shops.some((shop) => SCHEMES.some((rule) => rule.id === programme.id && rule.test.test(shop.name))),
  );
  const kinds = spendQueries(
    (txs.data ?? []).map((tx) => ({ category: tx.category, amountPence: tx.amountPence, isSample: tx.isSample })),
    4,
  );

  useEffect(() => {
    if (!loaded || shops.length === 0) return;
    let cancel = false;
    setBusy(true);
    setError("");
    setHot([]);
    const queries = [...kinds, ...shops.slice(0, 4).map((shop) => shop.name)].slice(0, 6);
    void hotDeals({ data: { queries, limit: 60 } })
      .then((deals) => {
        if (!cancel) setHot((prev) => mergeDeals(deals, prev, 60));
      })
      .catch(() => {
        if (!cancel) setHot((prev) => prev);
      });
    void publicDeals({ data: { queries: queries.slice(0, 4), limit: 24 } })
      .then((deals) => {
        if (!cancel) setHot((prev) => mergeDeals(prev, deals, 60));
      })
      .catch(() => {
        /* the open web can fail; shop and HotUKDeals results still show */
      });
    void shopOffers()
      .then((result) => {
        if (cancel) return;
        setYours(result.yours);
        setOther(result.other);
        setNote(result.note);
      })
      .catch((err: unknown) => {
        if (!cancel) setError(errorText(err, "Couldn’t check offers for your shops."));
      })
      .finally(() => {
        if (!cancel) setBusy(false);
      });
    return () => {
      cancel = true;
    };
  }, [loaded, shops.map((shop) => shop.name).join("|"), kinds.join("|")]);

  const [pages, setPages] = useState(1);
  const shopNames = shops.map((shop) => shop.name.toLowerCase());
  const yoursDeals = hot.filter((deal) => shopNames.some((name) => name.length > 2 && deal.title.toLowerCase().includes(name)));
  const otherDeals = hot.filter((deal) => !yoursDeals.includes(deal));
  const primaryCount = (yours?.length ?? 0) + yoursDeals.length + schemes.length;
  const secondaryCount = other.length + otherDeals.length;
  const total = primaryCount + secondaryCount;
  const shown = pages * 30;
  let room = shown;

  return (
    <div>
      <PageHead kicker="Offers" title="Ahead of you" />

      {!loaded ? <div className="h-40 animate-pulse rounded-lg bg-sand" /> : null}

      {loaded && shops.length === 0 ? (
        <p className="panel p-5 text-sm">Once a few regular spends are in, Pence can look ahead at what you tend to buy.</p>
      ) : null}

      {error ? <p className="mb-3 text-sm text-clay">{error}</p> : null}
      {busy && !yours && hot.length === 0 ? <div className="h-28 animate-pulse rounded-lg bg-sand" /> : null}

      {room > 0 && (primaryCount > 0 || (yours && yours.length === 0 && hot.length === 0 && !busy)) ? (
        <section>
          <h2 className="font-display text-2xl">The places you already go</h2>
          {yours && yours.length === 0 && yoursDeals.length === 0 && schemes.length === 0 ? (
            <p className="mt-2 text-sm text-muted">{note || "Nothing current at those shops just now."}</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {schemes.slice(0, room).map((item) => {
                room -= 1;
                return (
                  <li key={item.id} className="panel p-4">
                    <p className="font-medium">{item.name}</p>
                    <p className="mt-1 text-sm">{item.detail}</p>
                    <a href={item.href} className="mt-2 inline-block text-sm font-medium text-forest" target="_blank" rel="noreferrer">
                      Open {item.name}
                    </a>
                  </li>
                );
              })}
              {(yours ?? []).slice(0, Math.max(0, room)).map((offer) => {
                room -= 1;
                return <OfferCard key={`${offer.merchant}-${offer.url}`} offer={offer} />;
              })}
              {yoursDeals.slice(0, Math.max(0, room)).map((deal) => {
                room -= 1;
                return (
                  <li key={deal.url} className="panel p-4">
                    <p className="text-sm text-muted">{deal.source}</p>
                    <p className="mt-1 font-medium">{deal.title}</p>
                    <a href={deal.url} className="mt-2 inline-block text-sm font-medium text-forest" target="_blank" rel="noreferrer">
                      Open {deal.source}
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}

      {room > 0 && secondaryCount > 0 ? (
        <section className="mt-6">
          <h2 className="font-display text-2xl">Somewhere else, if it helps</h2>
          <ul className="mt-3 space-y-3">
            {other.slice(0, room).map((offer) => {
              room -= 1;
              return <OfferCard key={`${offer.merchant}-${offer.url}`} offer={offer} />;
            })}
            {otherDeals.slice(0, Math.max(0, room)).map((deal) => {
              room -= 1;
              return (
                <li key={deal.url} className="panel p-4">
                  <p className="text-sm text-muted">{deal.source}</p>
                  <p className="mt-1 font-medium">{deal.title}</p>
                  <a href={deal.url} className="mt-2 inline-block text-sm font-medium text-forest" target="_blank" rel="noreferrer">
                    Open {deal.source}
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {total > shown ? (
        <button type="button" className="btn btn-quiet mt-4" onClick={() => setPages((n) => n + 1)}>
          More
        </button>
      ) : null}
    </div>
  );
}
