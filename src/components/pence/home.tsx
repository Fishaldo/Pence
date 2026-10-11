import { Link } from "@tanstack/react-router";
import { Settings } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  categoryLabel,
  formatGBP,
  formatPercent,
  nextPayday,
  paySpan,
  projectedSpend,
  spanProgress,
  spendQueries,
  summarizeSpan,
  todayISO,
} from "@/lib/spend/model";
import { whenText, type TasteProfile } from "@/lib/spend/habits";
import type { PersonalDeal } from "@/server/for-you";
import { hotDeals, type HotDeal } from "@/server/hotukdeals";
import { seedSamples } from "@/server/ledger";
import { useForYou, useLedger, useRefreshLedger } from "./data";
import { CodeChip } from "./deal-bits";
import { goUrl } from "./deal-links";
import { DealTerms } from "./offers";
import { ComingOut } from "./regular";
import { WatchSummary } from "./watch";
import { errorText, Money, PageHead } from "./ui";

/** Three picks: the next likely buys first, one per habit, ones that work where you live and at your shops first. */
function picksFor(deals: PersonalDeal[], taste: TasteProfile | undefined): PersonalDeal[] {
  if (!taste) return [];
  const soon = new Set(taste.upcoming.flatMap((up) => [up.key, up.interestKey ?? ""]));
  const sorted = [...deals].sort(
    (a, b) =>
      Number(soon.has(b.key)) - Number(soon.has(a.key)) ||
      Number(b.works) - Number(a.works) ||
      Number(b.local) - Number(a.local) ||
      // A deal with something to check first is not one of the three on Home.
      Number(Boolean(a.check) && !a.works) - Number(Boolean(b.check) && !b.works) ||
      Number(b.yours) - Number(a.yours),
  );
  const picks: PersonalDeal[] = [];
  const keys = new Set<string>();
  for (const deal of sorted) {
    if (picks.length >= 3) break;
    if (keys.has(deal.key)) continue;
    keys.add(deal.key);
    picks.push(deal);
  }
  for (const deal of sorted) {
    if (picks.length >= 3) break;
    if (!picks.includes(deal)) picks.push(deal);
  }
  return picks;
}

export function HomeView() {
  const { profile, txs } = useLedger();
  const refresh = useRefreshLedger();
  const mine = useForYou();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [trending, setTrending] = useState<HotDeal[] | null>(null);
  const picks = picksFor(mine.data?.deals ?? [], mine.data?.taste);
  const needTrending = !mine.isPending && picks.length === 0;
  const kindKey = spendQueries(
    (txs.data ?? []).map((tx) => ({ category: tx.category, amountPence: tx.amountPence, isSample: tx.isSample })),
    3,
  ).join("|");

  useEffect(() => {
    if (!needTrending || !kindKey) return;
    let cancel = false;
    void hotDeals({ data: { queries: kindKey.split("|"), limit: 3 } })
      .then((found) => {
        if (!cancel) setTrending(found);
      })
      .catch(() => {
        if (!cancel) setTrending([]);
      });
    return () => {
      cancel = true;
    };
  }, [needTrending, kindKey]);

  if (txs.isPending || profile.isPending) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-32 animate-pulse rounded-md bg-sand" />
        <div className="h-40 animate-pulse rounded-lg bg-sand" />
        <div className="h-28 animate-pulse rounded-lg bg-sand" />
      </div>
    );
  }

  const today = new Date();
  const payday = profile.data?.payday ?? null;
  const span = paySpan(today, payday, 0);
  const prevSpan = paySpan(today, payday, -1);
  const rows = txs.data ?? [];
  const current = summarizeSpan(rows, span);
  const previous = summarizeSpan(rows, prevSpan);
  const progress = spanProgress(span, today);
  const income = profile.data?.monthlyIncomePence ?? 0;
  const name = profile.data?.displayName?.split(" ")[0] || "there";
  const projected = projectedSpend(current.spent, progress.day, progress.days);
  const left = income - current.spent;
  const daysLeft = Math.max(1, progress.days - progress.day + 1);
  const perDay = Math.floor(left / daysLeft);
  const ratio = income > 0 ? Math.min(1, current.spent / income) : 0;
  const over = income > 0 && current.spent > income;
  const top = current.byCategory[0];
  const hasSample = rows.some((row) => row.isSample);
  const recent = rows.filter((row) => row.spentOn >= span.start && row.spentOn <= span.end).slice(0, 4);
  const cycle = payday ? "pay" : "month";
  // Coming up is about offers: only buys Pence has found something for.
  const dealKeys = new Set((mine.data?.deals ?? []).map((deal) => deal.key));
  const upcoming = (mine.data?.taste.upcoming ?? []).filter(
    (up) => dealKeys.has(up.key) || (up.interestKey != null && dealKeys.has(up.interestKey)),
  );
  const tasteToday = mine.data?.taste.today ?? todayISO(today);

  async function loadSample() {
    setBusy(true);
    setError("");
    try {
      const result = await seedSamples();
      await refresh();
      toast(result.added > 0 ? "Sample month added" : "Sample spends are already here");
    } catch (err) {
      setError(errorText(err, "Couldn’t add the sample."));
    } finally {
      setBusy(false);
    }
  }

  let pace = payday ? "Log a spend and this pay starts to take shape." : "Log a spend and the month starts to take shape.";
  if (over && payday) {
    pace = `This pay is already past take-home. Spend only what you need until ${nextPayday(span)}.`;
  } else if (current.count > 0 && projected != null && previous.spent > 0) {
    const delta = projected - previous.spent;
    if (progress.day < 3 && current.count < 3) {
      pace = "Too few days to trust the pace yet. It settles once a handful of spends are in.";
    } else if (Math.abs(delta) < 500) {
      pace = `At this pace this ${cycle} lands near ${formatGBP(projected)}, close to the one from ${prevSpan.short}.`;
    } else if (delta > 0) {
      pace = `At this pace this ${cycle} lands near ${formatGBP(projected)}, ${formatGBP(delta)} above the one from ${prevSpan.short}.`;
    } else {
      pace = `At this pace this ${cycle} lands near ${formatGBP(projected)}, ${formatGBP(Math.abs(delta))} under the one from ${prevSpan.short}.`;
    }
  } else if (current.count > 0 && previous.spent === 0) {
    pace = payday ? "There’s no earlier pay to compare yet." : "There’s no full month before this one yet, so the comparison starts next month.";
  }

  return (
    <div>
      <PageHead
        kicker={payday ? "This pay" : span.short}
        title={`Hello, ${name}`}
        action={
          <Link
            to="/settings"
            className="grid size-11 place-items-center rounded-full border border-line bg-card text-ink"
            aria-label="Settings"
          >
            <Settings className="size-5" strokeWidth={1.75} />
          </Link>
        }
      />

      <section className="panel p-5">
        <p className="text-sm text-muted">Spent so far</p>
        <p className="mt-1 font-display text-5xl leading-none">
          <Money pence={current.spent} />
        </p>
        <p className="mt-2 text-sm text-muted">
          {payday ? (
            <>
              From {span.short} until payday on {nextPayday(span)}
              {income > 0 ? (
                <>
                  {" · "}
                  {formatPercent(current.spent / income)} of {formatGBP(income)}
                </>
              ) : (
                ". Add take-home in settings to see the share of this pay."
              )}
            </>
          ) : income > 0 ? (
            <>
              of <span className="tabular-nums">{formatGBP(income)}</span> take-home
              {" · "}
              {formatPercent(current.spent / income)}
            </>
          ) : (
            "Add your take-home in settings to see the share of pay."
          )}
        </p>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-sand" aria-hidden="true">
          <div
            className={over ? "h-full bg-clay" : "h-full bg-forest"}
            style={{ width: `${income > 0 ? Math.max(4, ratio * 100) : 0}%` }}
          />
        </div>
        {income > 0 ? (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted">{over ? "Over by" : payday ? "Left this pay" : "Left this month"}</p>
              <p className={`mt-1 text-lg font-medium tabular-nums ${over ? "text-clay" : "text-ink"}`}>
                {formatGBP(Math.abs(left))}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted">{over ? "Stop here" : "About a day"}</p>
              <p className="mt-1 text-lg font-medium tabular-nums">
                {over ? "—" : formatGBP(Math.max(0, perDay))}
              </p>
            </div>
          </div>
        ) : null}
        <p className="mt-4 text-sm text-muted">{pace}</p>
      </section>

      <WatchSummary />

      <ComingOut />

      {upcoming.length > 0 ? (
        <section className="mt-4">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="font-display text-2xl">Coming up</h2>
            <Link to="/offers" className="text-sm text-forest">
              Deals
            </Link>
          </div>
          <ul className="panel divide-y divide-line">
            {upcoming.slice(0, 2).map((up) => (
              <li key={up.key} className="px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="min-w-0 truncate font-medium">{up.title}</p>
                  <p className="shrink-0 text-sm text-forest">{whenText(up.nextOn, tasteToday)}</p>
                </div>
                <p className="text-sm text-muted">{up.line}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {top ? (
        <section className="mt-4">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="font-display text-2xl">{picks.length > 0 ? "Picked for you" : "Hot deals"}</h2>
            <Link to={picks.length > 0 ? "/offers" : "/hot"} className="text-sm text-forest">
              More
            </Link>
          </div>
          {mine.isPending || (needTrending && trending == null && kindKey) ? (
            <div className="h-24 animate-pulse rounded-lg bg-sand" />
          ) : null}
          {picks.length > 0 ? (
            <ul className="space-y-2">
              {picks.map((deal) => (
                <li key={deal.url} className="panel px-4 py-3">
                  <p className="text-sm text-muted">
                    {deal.merchant || deal.source}
                    {deal.local ? " · near you" : ""}
                  </p>
                  <a href={goUrl(deal)} className="mt-1 block font-medium" target="_blank" rel="noreferrer">
                    {deal.title}
                  </a>
                  {deal.saving ? <p className="mt-1 text-sm font-medium text-forest">{deal.saving}</p> : null}
                  <DealTerms deal={deal} />
                  {deal.code ? <CodeChip code={deal.code} /> : null}
                  {deal.reason ? <p className="mt-1 text-sm text-muted">{deal.reason}</p> : null}
                </li>
              ))}
            </ul>
          ) : null}
          {needTrending && trending && trending.length > 0 ? (
            <ul className="space-y-2">
              {trending.map((deal) => (
                <li key={deal.url} className="panel px-4 py-3">
                  <p className="text-sm text-muted">{deal.merchant || deal.source}</p>
                  <a href={goUrl(deal)} className="mt-1 block font-medium" target="_blank" rel="noreferrer">
                    {deal.title}
                  </a>
                  {deal.code ? <CodeChip code={deal.code} /> : null}
                </li>
              ))}
            </ul>
          ) : null}
          {needTrending && (trending?.length === 0 || !kindKey) ? (
            <p className="panel px-4 py-6 text-sm text-muted">Nothing current for your habits just now.</p>
          ) : null}
        </section>
      ) : (
        <section className="mt-4 panel p-5">
          <h2 className="font-display text-3xl">{payday ? "Nothing logged in this pay" : "Nothing logged this month"}</h2>
          <p className="mt-2 text-sm text-muted">
            Scan a receipt, pick a photo, or paste a Google Pay, Apple Pay, or Uber alert. If there’s no receipt, Pence still files the spend.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Link to="/capture" className="btn btn-primary sm:w-auto">
              Add a spend
            </Link>
            <button type="button" className="btn btn-quiet sm:w-auto" onClick={loadSample} disabled={busy}>
              {busy ? "Adding…" : "Try a sample month"}
            </button>
          </div>
          {error ? <p className="mt-2 text-sm text-clay">{error}</p> : null}
        </section>
      )}

      {recent.length > 0 ? (
        <section className="mt-6">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="font-display text-2xl">Activity</h2>
            <Link to="/activity" className="text-sm text-forest">
              All Activity
            </Link>
          </div>
          <ul className="panel divide-y divide-line">
            {recent.map((tx) => (
              <li key={tx.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{tx.merchant}</p>
                  <p className="text-sm text-muted">
                    {categoryLabel(tx.category)}
                    {tx.hasReceipt ? "" : " · no receipt"}
                  </p>
                </div>
                <p className="tabular-nums">{formatGBP(tx.amountPence)}</p>
              </li>
            ))}
          </ul>
          {hasSample ? (
            <p className="mt-3 text-sm text-muted">
              Includes sample spends. Clear them in settings when you want only your own.
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
