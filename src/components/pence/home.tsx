import { Link } from "@tanstack/react-router";
import { Camera, ClipboardPaste, FileUp } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { dayNum, isoOf, shortDay, type TasteProfile } from "@/lib/core/habits";
import {
  categoryLabel,
  countsAsSpending,
  dayLabel,
  formatGBP,
  paySpan,
  spanProgress,
  spendQueries,
  summarizeSpan,
  todayISO,
  type CategoryId,
  type PaySpan,
} from "@/lib/core/model";
import { FREQ_LABEL } from "@/lib/core/regular";
import type { PersonalDeal } from "@/server/for-you";
import { hotDeals, type HotDeal } from "@/server/hotukdeals";
import { seedSamples } from "@/server/ledger";
import { useForYou, useLedger, useRefreshLedger, useRegulars } from "./data";
import { CodeChip } from "./deal-bits";
import { goUrl } from "./deal-links";
import { BillsCard, NeedsTap, PaydayCard, PayTiles, SafeCard } from "./money-cards";
import { longToday, useThisPay } from "./this-pay";
import { SectionHead, SettingsButton } from "./ui";
import { errorText } from "./error-text";

/** Bills, rent and subscriptions: the "Bills" total on Home. */
const BILL_CATEGORIES = new Set<CategoryId>(["bills", "housing", "subscriptions"]);

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

/** The first `day` days of a pay period, to compare like with like. */
function firstDays(span: PaySpan, day: number): PaySpan {
  const end = isoOf(dayNum(span.start) + Math.max(day, 1) - 1);
  return { ...span, end: end < span.end ? end : span.end };
}

function initialOf(name: string): string {
  return (name.trim().charAt(0) || "·").toUpperCase();
}

function short(pence: number): string {
  return formatGBP(pence).replace(/\.00$/, "");
}

export function HomeView() {
  const { profile, txs } = useLedger();
  const regulars = useRegulars();
  const mine = useForYou();
  const [trending, setTrending] = useState<HotDeal[] | null>(null);
  const picks = picksFor(mine.data?.deals ?? [], mine.data?.taste);
  const thisPay = useThisPay(profile.data, txs.data ?? []);
  const rows = txs.data ?? [];
  const needTrending = !mine.isPending && picks.length === 0;
  const kinds = spendQueries(
    rows.map((tx) => ({ category: tx.category, amountPence: tx.amountPence, isSample: tx.isSample })),
    3,
  );
  const kindKey = kinds.length > 0 ? kinds.join("|") : "uk deals";

  useEffect(() => {
    if (!needTrending || txs.isPending) return;
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
  }, [needTrending, kindKey, txs.isPending]);

  if (txs.isPending || profile.isPending) {
    return (
      <div className="flex flex-col gap-4">
        <div className="h-14 w-48 animate-pulse rounded-xl bg-sand" />
        <div className="h-52 animate-pulse rounded-[1.375rem] bg-mist" />
        <div className="h-24 animate-pulse rounded-[1.125rem] bg-sand" />
      </div>
    );
  }

  const name = profile.data?.displayName?.split(" ")[0] || "";
  if (rows.length === 0) return <FirstDay name={name} trending={trending} />;

  const today = new Date();
  const payday = profile.data?.payday ?? null;
  const span = paySpan(today, payday, 0);
  const prevSpan = paySpan(today, payday, -1);
  const current = summarizeSpan(rows, span);
  const previous = summarizeSpan(rows, prevSpan);
  const progress = spanProgress(span, today);
  const sameDayLast = summarizeSpan(rows, firstDays(prevSpan, progress.day));
  const billsPence = current.byCategory.filter((c) => BILL_CATEGORIES.has(c.id)).reduce((sum, c) => sum + c.amount, 0);
  const income = thisPay.takeHomePence;

  let pace: string | null = null;
  if (previous.spent > 0) {
    const diff = current.spent - sameDayLast.spent;
    pace =
      Math.abs(diff) < 500
        ? `About the same as this point last ${payday ? "pay" : "month"}`
        : `${short(Math.abs(diff))} ${diff < 0 ? "less" : "more"} than this point last ${payday ? "pay" : "month"}`;
  }

  // Coming up before payday: regular payments and trials due from today to the end of this pay.
  const todayIso = todayISO(today);
  const upcoming = (regulars.data?.items ?? [])
    .filter((item) => !item.stopped && !item.lapsed && item.nextDue && item.nextDue >= todayIso && item.nextDue <= span.end)
    .sort((a, b) => (a.nextDue ?? "").localeCompare(b.nextDue ?? ""))
    .slice(0, 4);

  const recent = rows.slice(0, 6);
  const hasSample = rows.some((row) => row.isSample);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-[0.8125rem] font-semibold text-muted">{longToday(today)}</span>
          <h1 className="text-[1.625rem] leading-tight font-extrabold tracking-[-0.02em]">
            {name ? `Hello, ${name}` : "Hello"}
          </h1>
        </div>
        <SettingsButton />
      </header>

      {income > 0 ? (
        <SafeCard pay={thisPay} hasPayday={payday != null} pace={pace} />
      ) : (
        <section className="hero flex flex-col gap-3" aria-label="Spent so far">
          <span className="text-sm font-semibold text-on-forest">Spent so far this {payday ? "pay" : "month"}</span>
          <span className="text-[2.75rem] leading-[1.1] font-extrabold tracking-[-0.03em] tabular-nums">
            {short(current.spent)}
          </span>
          <Link to="/settings" className="text-sm font-semibold text-on-forest underline underline-offset-4">
            Add your take-home to see what is safe to spend
          </Link>
          {pace ? <span className="self-start rounded-full bg-white/15 px-3 py-2 text-[0.8125rem] font-bold">{pace}</span> : null}
        </section>
      )}

      <PayTiles billsPence={billsPence} spendingPence={current.spent - billsPence} movedPence={current.moved} />

      {profile.data ? <PaydayCard pay={thisPay} profile={profile.data} /> : null}

      <BillsCard />

      <NeedsTap />

      {upcoming.length > 0 ? (
        <section aria-label="Coming up">
          <SectionHead
            title={`Coming up before ${payday ? "payday" : "the month end"}`}
            sub="Reminders 7 days, 3 days and 2 working days before."
            link={
              <Link to="/regular" className="link">
                All
              </Link>
            }
          />
          <div className="rows">
            {upcoming.map((item) => {
              const due = item.nextDue ?? todayIso;
              const date = new Date(`${due}T12:00:00`);
              return (
                <Link key={item.key} to="/regular" className="row">
                  <span className="flex size-11 shrink-0 flex-col items-center justify-center rounded-xl bg-paper">
                    <span className="text-[0.625rem] font-bold tracking-[0.06em] text-muted uppercase">
                      {date.toLocaleDateString("en-GB", { weekday: "short" })}
                    </span>
                    <span className="text-base leading-none font-extrabold">{date.getDate()}</span>
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-[0.9375rem] font-bold">{item.name}</span>
                    <span className="truncate text-[0.8125rem] text-muted">
                      {item.paidAfterStop
                        ? "Paid again after you cancelled"
                        : item.freq === "once"
                          ? `Free trial ends ${shortDay(due)}`
                          : FREQ_LABEL[item.freq]}
                    </span>
                  </span>
                  {item.amountPence > 0 ? (
                    <span className="shrink-0 text-[0.9375rem] font-extrabold tabular-nums">{formatGBP(item.amountPence)}</span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}

      <section aria-label="Offers for you">
        <SectionHead
          title={picks.length > 0 ? "For you" : "Popular now in the UK"}
          link={
            <Link to={picks.length > 0 ? "/offers" : "/hot"} className="link">
              All offers
            </Link>
          }
        />
        {mine.isPending || (needTrending && trending == null) ? (
          <div className="h-24 animate-pulse rounded-[1.125rem] bg-sand" />
        ) : null}
        {picks.length > 0 ? (
          <ul className="flex flex-col gap-2.5">
            {picks.map((deal) => (
              <li key={deal.url} className="panel flex items-start gap-3 px-4 py-3.5">
                <span aria-hidden="true" className="initial initial-amber">{initialOf(deal.merchant || deal.source)}</span>
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="text-[0.8125rem] font-semibold text-muted">
                    {deal.merchant || deal.source}
                    {deal.local ? " · near you" : deal.yours ? " · your shop" : ""}
                  </span>
                  <a href={goUrl(deal)} className="text-[0.9375rem] leading-snug font-extrabold" target="_blank" rel="noreferrer">
                    {deal.title}
                  </a>
                  {deal.saving ? <span className="text-[0.8125rem] font-semibold text-forest">{deal.saving}</span> : null}
                  {deal.check ? (
                    <span className={`text-[0.8125rem] font-semibold ${deal.works ? "text-forest" : "text-clay"}`}>{deal.check}</span>
                  ) : null}
                  {deal.endsOn ? <span className="text-xs text-muted">Ends {shortDay(deal.endsOn)}</span> : null}
                  {deal.code ? <CodeChip code={deal.code} /> : null}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
        {needTrending && trending && trending.length > 0 ? (
          <ul className="flex flex-col gap-2.5">
            {trending.map((deal) => (
              <li key={deal.url} className="panel flex items-start gap-3 px-4 py-3.5">
                <span aria-hidden="true" className="initial initial-amber">{initialOf(deal.merchant || deal.source)}</span>
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="text-[0.8125rem] font-semibold text-muted">{deal.merchant || deal.source}</span>
                  <a href={goUrl(deal)} className="text-[0.9375rem] leading-snug font-extrabold" target="_blank" rel="noreferrer">
                    {deal.title}
                  </a>
                  {deal.code ? <CodeChip code={deal.code} /> : null}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
        {needTrending && trending?.length === 0 ? (
          <p className="panel px-4 py-5 text-sm text-muted">Nothing current for your habits just now.</p>
        ) : null}
      </section>

      <section aria-label="Latest">
        <SectionHead
          title="Latest"
          link={
            <Link to="/activity" className="link">
              All
            </Link>
          }
        />
        <div className="rows">
          {recent.map((tx) => {
            const moved = !countsAsSpending(tx.category);
            return (
              <Link key={tx.id} to="/activity" className="row">
                <span aria-hidden="true" className={moved ? "initial initial-blue" : "initial"}>{initialOf(tx.merchant)}</span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-[0.9375rem] font-bold">{tx.merchant}</span>
                  <span className="truncate text-[0.8125rem] text-muted">
                    {categoryLabel(tx.category)} · {dayLabel(tx.spentOn)}
                    {moved ? " · not spending" : tx.hasReceipt ? "" : " · no receipt"}
                  </span>
                </span>
                <span className={`shrink-0 text-[0.9375rem] font-extrabold tabular-nums ${moved ? "text-saved" : ""}`}>
                  {formatGBP(tx.amountPence)}
                </span>
              </Link>
            );
          })}
        </div>
        {hasSample ? (
          <p className="mt-3 text-[0.8125rem] text-muted">Includes sample spends. Clear them in Settings when you want only your own.</p>
        ) : null}
      </section>
    </div>
  );
}

/** Home before anything is added: ways to add, a sample month, and what is popular. */
function FirstDay({ name, trending }: { name: string; trending: HotDeal[] | null }) {
  const refresh = useRefreshLedger();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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

  const ways = [
    { to: "/bank", label: "Upload a bank statement", icon: FileUp },
    { to: "/capture", label: "Scan a receipt", icon: Camera },
    { to: "/capture", label: "Paste a payment message", icon: ClipboardPaste },
  ] as const;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-[0.8125rem] font-semibold text-muted">Welcome to Pence</span>
          <h1 className="text-[1.625rem] leading-tight font-extrabold tracking-[-0.02em]">{name ? `Hello, ${name}` : "Hello"}</h1>
        </div>
        <SettingsButton />
      </header>

      <section className="panel flex flex-col gap-3 p-[1.125rem]" aria-label="Get started">
        <div className="flex flex-col gap-1">
          <h2 className="section-title">Add your first spends</h2>
          <p className="text-sm text-muted">Pick the easiest way. You can use them all.</p>
        </div>
        {ways.map((way) => {
          const Icon = way.icon;
          return (
            <Link key={way.label} to={way.to} className="btn btn-quiet justify-start gap-3">
              <Icon className="size-5 text-forest" strokeWidth={1.9} aria-hidden="true" />
              {way.label}
            </Link>
          );
        })}
      </section>

      <section className="flex flex-col gap-3 rounded-[1.25rem] bg-mist p-[1.125rem]" aria-label="Sample month">
        <div className="flex flex-col gap-1">
          <h2 className="section-title">See it with a sample month</h2>
          <p className="text-sm leading-[1.45] text-ink-soft">
            Made-up spending, so you can see how Pence works before adding your own. Remove it with one tap.
          </p>
        </div>
        <button type="button" className="btn-pill self-start" onClick={loadSample} disabled={busy}>
          {busy ? "Adding…" : "Show a sample month"}
        </button>
        {error ? <p className="text-sm text-clay">{error}</p> : null}
      </section>

      <section aria-label="Popular now">
        <SectionHead title="Popular now in the UK" sub="Once Pence learns what you buy, this follows your habits." />
        {trending == null ? <div className="h-24 animate-pulse rounded-[1.125rem] bg-sand" /> : null}
        {trending && trending.length > 0 ? (
          <ul className="flex flex-col gap-2.5">
            {trending.map((deal) => (
              <li key={deal.url} className="panel flex flex-col gap-1 px-4 py-3.5">
                <span className="text-[0.8125rem] font-semibold text-muted">{deal.merchant || deal.source}</span>
                <a href={goUrl(deal)} className="text-[0.9375rem] leading-snug font-extrabold" target="_blank" rel="noreferrer">
                  {deal.title}
                </a>
                {deal.code ? <CodeChip code={deal.code} /> : null}
              </li>
            ))}
          </ul>
        ) : null}
        {trending?.length === 0 ? <p className="panel px-4 py-5 text-sm text-muted">Nothing trending just now.</p> : null}
      </section>
    </div>
  );
}
