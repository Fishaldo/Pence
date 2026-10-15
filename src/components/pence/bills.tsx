import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { shortDay } from "@/lib/core/habits";
import { formatGBP, formatPercent } from "@/lib/core/model";
import { mergeDeals } from "@/lib/core/deals";
import { billKind } from "@/lib/core/payday";
import { FREQ_LABEL, type Regular } from "@/lib/core/regular";
import { hotDeals, type HotDeal } from "@/server/hotukdeals";
import { publicDeals } from "@/server/public-deals";
import { saveRegular } from "@/server/regular";
import { useLedger, useRegulars } from "./data";
import { DealAction } from "./deal-bits";
import { billChecks, isBill } from "./this-pay";
import { PageHead } from "./ui";
import { errorText } from "./error-text";

function switchSearch(label: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(`how to switch ${label.toLowerCase()} provider UK`)}`;
}

/** What one month of a deal's stated price compares with, when the page gives a monthly price. */
function cheaperLine(deal: HotDeal, item: Regular): string {
  if (deal.pricePence == null || !deal.monthly || item.freq !== "monthly") return "";
  const paying = item.lastPence ?? item.amountPence;
  if (deal.pricePence >= paying) return "";
  return `${formatGBP(deal.pricePence)} a month on the page, against the ${formatGBP(paying)} you pay.`;
}

function BillRow({ item, today, why, card = false }: { item: Regular; today: string; why: string | null; card?: boolean }) {
  const client = useQueryClient();
  const { profile } = useLedger();
  const kind = billKind(item.name);
  const [open, setOpen] = useState(false);
  const [end, setEnd] = useState(item.contractEnd ?? "");
  const [busy, setBusy] = useState(false);
  const [deals, setDeals] = useState<HotDeal[] | null>(null);
  const [looking, setLooking] = useState(false);
  const paying = item.lastPence ?? item.amountPence;

  async function saveEnd(value: string | null) {
    setBusy(true);
    try {
      await saveRegular({ data: { key: item.key, contractEnd: value } });
      await client.invalidateQueries({ queryKey: ["regulars"] });
      toast(value ? `Contract end saved: ${shortDay(value)}` : "Contract end removed");
    } catch (err) {
      toast(errorText(err, "Couldn’t save that."));
    } finally {
      setBusy(false);
    }
  }

  async function look() {
    if (!kind.query) return;
    setLooking(true);
    const city = profile.data?.city?.trim() ?? "";
    const queries = [kind.query, ...(city && kind.id === "broadband" ? [`${city} ${kind.query}`] : [])];
    const [board, pages] = await Promise.all([
      hotDeals({ data: { queries, limit: 30, related: true } }).catch(() => [] as HotDeal[]),
      publicDeals({ data: { queries: queries.slice(0, 2), limit: 12, strict: true } }).catch(() => [] as HotDeal[]),
    ]);
    setDeals(mergeDeals(board, pages, 30));
    setLooking(false);
  }

  return (
    <li className={card ? "panel px-4 py-3.5" : "px-4 py-3"}>
      <button type="button" className="flex w-full items-start gap-3 text-left" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {card ? <span aria-hidden="true" className="initial initial-warn">{(item.name.trim().charAt(0) || "·").toUpperCase()}</span> : null}
        <span className="min-w-0 flex-1">
          {card ? <span className="block text-[0.8125rem] font-semibold text-muted">{kind.label}</span> : null}
          <span className="block truncate text-[0.9375rem] font-extrabold">{item.name}</span>
          <span className="block text-[0.8125rem] text-muted">
            {card ? FREQ_LABEL[item.freq] : `${kind.label} · ${FREQ_LABEL[item.freq]}`}
            {item.contractEnd ? ` · contract ${item.contractEnd < today ? "ended" : "ends"} ${shortDay(item.contractEnd)}` : ""}
          </span>
          {why ? <span className="mt-1 block text-[0.8125rem] font-bold text-warn">{why}</span> : null}
        </span>
        <span className="shrink-0 text-right">
          {paying > 0 ? <span className="block text-[0.9375rem] font-extrabold tabular-nums">{formatGBP(paying)}</span> : null}
          {item.nextDue ? <span className="block text-[0.8125rem] text-muted">{shortDay(item.nextDue)}</span> : null}
        </span>
      </button>

      {open ? (
        <div className="mt-3 border-t border-line pt-3">
          {item.rise ? (
            <p className="text-sm">
              Was {formatGBP(item.rise.fromPence)}, now {formatGBP(item.rise.toPence)} since {shortDay(item.rise.on)}.
            </p>
          ) : null}
          {kind.note ? <p className="mt-1 text-sm text-muted">{kind.note}</p> : null}

          {kind.switchable ? (
            <form
              className="mt-3 flex flex-col gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void saveEnd(end || null);
              }}
            >
              <label className="field">
                <span className="field-label">When the contract or deal ends</span>
                <input className="control" type="date" value={end} onChange={(event) => setEnd(event.target.value)} />
              </label>
              <button type="submit" className="btn btn-quiet" disabled={busy}>
                Save the date
              </button>
            </form>
          ) : null}
          {kind.switchable ? (
            <p className="mt-1 text-sm text-muted">Pence reminds you before it ends, when out-of-contract prices usually go up.</p>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-2">
            {kind.query ? (
              <button type="button" className="btn btn-primary" disabled={looking} onClick={() => void look()}>
                {looking ? "Looking…" : "Look for a better deal"}
              </button>
            ) : null}
            {kind.switchable && kind.id !== "other" ? (
              <a href={switchSearch(kind.label)} target="_blank" rel="noreferrer" className="btn btn-quiet">
                How to switch
              </a>
            ) : null}
          </div>

          {deals ? (
            deals.length === 0 ? (
              <p className="mt-3 text-sm text-muted">No current {kind.label.toLowerCase()} offers found on public pages just now.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {deals.slice(0, 8).map((deal) => {
                  const cheaper = cheaperLine(deal, item);
                  return (
                    <li key={deal.url} className="rounded-xl border border-line p-3">
                      <p className="text-sm text-muted">{deal.merchant || deal.source}</p>
                      <p className="mt-1 font-bold">{deal.title}</p>
                      {cheaper ? <p className="mt-1 text-sm font-bold text-accent">{cheaper}</p> : null}
                      <DealAction deal={deal} />
                    </li>
                  );
                })}
              </ul>
            )
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export function BillsView() {
  const regulars = useRegulars();
  const { profile } = useLedger();
  const items = regulars.data?.items ?? [];
  const today = regulars.data?.today ?? new Date().toISOString().slice(0, 10);
  const bills = items.filter((item) => isBill(item) && !item.stopped && !item.lapsed);
  const checks = billChecks(bills, today);
  const checkKeys = new Map(checks.map((row) => [row.item.key, row.why]));
  const monthly = bills.reduce((sum, item) => sum + item.monthlyPence, 0);
  const rest = bills.filter((item) => !checkKeys.has(item.key));

  const income = profile.data?.monthlyIncomePence ?? 0;
  const rises = bills.filter((item) => item.rise);

  return (
    <div className="flex flex-col gap-6">
      <PageHead back="/" title="Bills" flush />
      <section className="panel flex flex-col gap-1.5 p-[1.125rem]" aria-label="Bills each month">
        {regulars.isPending ? (
          <div className="h-16 animate-pulse rounded-xl bg-sand" />
        ) : (
          <>
            <span className="text-sm font-semibold text-muted">Bills each month</span>
            <span className="text-[2.25rem] leading-tight font-extrabold tracking-[-0.02em] tabular-nums">{formatGBP(monthly)}</span>
            <span className="text-sm text-muted">
              {bills.length === 0
                ? "No bills found yet. Upload a bank statement, or add them on Regular payments."
                : `${bills.length} bill${bills.length === 1 ? "" : "s"}${income > 0 ? ` · ${formatPercent(monthly / income)} of your take-home` : ""}`}
            </span>
            {checks.length > 0 ? (
              <span className="badge badge-amber mt-1 self-start">
                {checks.length} could cost less
              </span>
            ) : null}
          </>
        )}
      </section>

      {checks.length > 0 ? (
        <section aria-label="Could cost less" className="flex flex-col gap-2.5">
          <h2 className="section-title">Could cost less</h2>
          <ul className="flex flex-col gap-2.5">
            {checks.map(({ item, why }) => (
              <BillRow key={item.key} item={item} today={today} why={why} card />
            ))}
          </ul>
        </section>
      ) : null}

      {rises.length > 0 ? (
        <section aria-label="Price rises" className="flex flex-col gap-2.5">
          <h2 className="section-title">Price rises</h2>
          <div className="rows">
            {rises.map((item) => (
              <div key={item.key} className="row">
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-[0.9375rem] font-bold">{item.name}</span>
                  <span className="text-[0.8125rem] text-muted">Since {shortDay(item.rise?.on ?? today)}</span>
                </span>
                <span className="shrink-0 text-[0.9375rem] font-extrabold text-warn tabular-nums">
                  +{formatGBP((item.rise?.toPence ?? 0) - (item.rise?.fromPence ?? 0))}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {rest.length > 0 ? (
        <section aria-label="All bills" className="flex flex-col gap-2.5">
          <h2 className="section-title">{checks.length > 0 ? "All other bills" : "All bills"}</h2>
          <ul className="rows">
            {rest.map((item) => (
              <BillRow key={item.key} item={item} today={today} why={null} />
            ))}
          </ul>
        </section>
      ) : null}

      <p className="text-[0.8125rem] leading-[1.5] text-muted">
        Offers come from public deal pages. A price shows only when the page states it.{" "}
        <Link to="/regular" className="font-bold text-accent">
          All regular payments
        </Link>
      </p>
    </div>
  );
}
