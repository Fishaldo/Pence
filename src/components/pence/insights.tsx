import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { dayNum, isoOf } from "@/lib/spend/habits";
import {
  buildAdvice,
  categoryLabel,
  countsAsSpending,
  formatGBP,
  formatPercent,
  paySpan,
  projectedSpend,
  spanProgress,
  summarizeSpan,
  todayISO,
  type CategoryId,
  type PaySpan,
  type Tx,
} from "@/lib/spend/model";
import { getAdvice } from "@/server/ledger";
import { useLedger } from "./data";
import { NearbyPanel } from "./nearby";
import { SectionHead } from "./ui";

const THIS_PAY = "#1e5b43";
const LAST_PAY = "#c9d3cc";

const SEARCH_PERIODS = [
  { id: "1w", label: "1W", words: "last week", days: 7 },
  { id: "1m", label: "1M", words: "last month", days: 31 },
  { id: "3m", label: "3M", words: "last 3 months", days: 92 },
  { id: "6m", label: "6M", words: "last 6 months", days: 183 },
  { id: "1y", label: "1Y", words: "last year", days: 366 },
  { id: "all", label: "All", words: "all time", days: 0 },
] as const;

/** Running total of spending for each day of a pay period, up to `through`. */
function runningTotals(rows: Tx[], span: PaySpan, through: string): number[] {
  const byDay = new Map<string, number>();
  for (const tx of rows) {
    if (!countsAsSpending(tx.category) || tx.spentOn < span.start || tx.spentOn > through) continue;
    byDay.set(tx.spentOn, (byDay.get(tx.spentOn) ?? 0) + tx.amountPence);
  }
  const out: number[] = [];
  let sum = 0;
  for (let day = dayNum(span.start); day <= dayNum(through < span.end ? through : span.end); day++) {
    sum += byDay.get(isoOf(day)) ?? 0;
    out.push(sum);
  }
  return out;
}

/** Spending through the pay: this pay's line against last pay's, day by day. */
function PayLines({ now, last, days }: { now: number[]; last: number[]; days: number }) {
  const width = 320;
  const height = 140;
  const top = Math.max(...now, ...last, 1);
  const x = (i: number) => (days <= 1 ? 0 : (i / (days - 1)) * width);
  const y = (v: number) => height - (v / top) * (height - 8) - 4;
  const path = (values: number[]) => values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-36 w-full" role="img" aria-label="Spending through this pay and last pay">
      <line x1="0" y1={height - 4} x2={width} y2={height - 4} stroke="#e2e5df" strokeWidth="1" />
      {last.length > 1 ? <path d={path(last)} fill="none" stroke={LAST_PAY} strokeWidth="2.5" strokeDasharray="5 4" strokeLinecap="round" /> : null}
      {now.length > 1 ? <path d={path(now)} fill="none" stroke={THIS_PAY} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /> : null}
      {now.length > 0 ? <circle cx={x(now.length - 1)} cy={y(now[now.length - 1])} r="4" fill={THIS_PAY} /> : null}
    </svg>
  );
}

export function InsightsView() {
  const { profile, txs } = useLedger();
  const [tips, setTips] = useState<string[] | null>(null);
  const [tipState, setTipState] = useState<"idle" | "loading" | "ready" | "unavailable">("idle");
  const [period, setPeriod] = useState<"this" | "last" | "three">("this");
  const [query, setQuery] = useState("");
  const [over, setOver] = useState<(typeof SEARCH_PERIODS)[number]["id"]>("6m");

  if (txs.isPending || profile.isPending) {
    return <div className="h-72 animate-pulse rounded-[1.125rem] bg-sand" />;
  }

  const today = new Date();
  const todayIso = todayISO(today);
  const payday = profile.data?.payday ?? null;
  const unit = payday ? "pay" : "month";
  const span = paySpan(today, payday, 0);
  const prevSpan = paySpan(today, payday, -1);
  const olderSpan = paySpan(today, payday, -2);
  const rows = txs.data ?? [];
  const current = summarizeSpan(rows, span);
  const previous = summarizeSpan(rows, prevSpan);
  const older = summarizeSpan(rows, olderSpan);
  const progress = spanProgress(span, today);
  const income = profile.data?.monthlyIncomePence ?? 0;
  const city = profile.data?.city ?? "";
  const projected = progress.complete ? null : projectedSpend(current.spent, progress.day, progress.days);
  const advice = buildAdvice({
    city,
    income,
    current,
    previous,
    projected,
    complete: progress.complete,
    cycle: Boolean(payday),
  });

  // Compared with last pay, on the same day.
  const sameDayEnd = isoOf(Math.min(dayNum(prevSpan.start) + Math.max(progress.day, 1) - 1, dayNum(prevSpan.end)));
  const sameDay = summarizeSpan(rows, { ...prevSpan, end: sameDayEnd });
  const compareTop = Math.max(current.spent, sameDay.spent, 1);
  const diff = current.spent - sameDay.spent;

  // Where it went: the chosen period against the one before it.
  const [mainSummary, otherSummary, mainLabel, otherLabel] =
    period === "this"
      ? [current, previous, `This ${unit}`, `Last ${unit}`]
      : period === "last"
        ? [previous, older, `Last ${unit}`, `The ${unit} before`]
        : [current, previous, `This ${unit}`, `Last ${unit}`];
  const ids = new Set<CategoryId>();
  for (const row of mainSummary.byCategory) ids.add(row.id);
  for (const row of otherSummary.byCategory) ids.add(row.id);
  if (period === "three") for (const row of older.byCategory) ids.add(row.id);
  const where = [...ids]
    .map((id) => {
      const amounts =
        period === "three"
          ? [current, previous, older].map((sum) => sum.byCategory.find((row) => row.id === id)?.amount ?? 0)
          : [mainSummary, otherSummary].map((sum) => sum.byCategory.find((row) => row.id === id)?.amount ?? 0);
      return { id, amounts };
    })
    .sort((a, b) => b.amounts[0] - a.amounts[0] || b.amounts[1] - a.amounts[1]);
  const whereTop = Math.max(...where.flatMap((row) => row.amounts), 1);
  const whereColours = period === "three" ? [THIS_PAY, "#3d8b68", LAST_PAY] : [THIS_PAY, LAST_PAY];
  const whereNames =
    period === "three" ? [span.short, prevSpan.short, olderSpan.short] : [mainLabel, otherLabel];

  const nowLine = runningTotals(rows, span, todayIso);
  const lastLine = runningTotals(rows, prevSpan, prevSpan.end);

  // Search your spending.
  const range = SEARCH_PERIODS.find((item) => item.id === over) ?? SEARCH_PERIODS[3];
  const from = range.days > 0 ? isoOf(dayNum(todayIso) - range.days + 1) : "";
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const found =
    words.length === 0
      ? []
      : rows.filter((tx) => {
          if (from && tx.spentOn < from) return false;
          const hay = [tx.merchant, tx.description, tx.note, categoryLabel(tx.category), ...tx.items.map((item) => item.name)]
            .join(" ")
            .toLowerCase();
          return words.every((word) => hay.includes(word));
        });
  const foundTotal = found.reduce((sum, tx) => sum + tx.amountPence, 0);

  const topMerchant = current.byMerchant[0];

  async function closer() {
    setTipState("loading");
    const brief = [
      `City: ${city || "not set"}`,
      `Take-home: ${formatGBP(income)}`,
      `${span.label} so far: ${formatGBP(current.spent)} across ${current.count} spends.`,
      current.byCategory.map((row) => `${categoryLabel(row.id)} ${formatGBP(row.amount)}`).join("; ") || "No categories.",
      `${prevSpan.label}: ${formatGBP(previous.spent)}.`,
      `${olderSpan.label}: ${formatGBP(older.spent)}.`,
      previous.byCategory.map((row) => `${categoryLabel(row.id)} ${formatGBP(row.amount)}`).join("; ") || "No earlier categories.",
      projected ? `Projected full month: ${formatGBP(projected)}.` : "Month already complete.",
      topMerchant ? `Largest payee this month: ${topMerchant.name} ${formatGBP(topMerchant.amount)}.` : "",
    ].join("\n");
    const fingerprint = `${span.start}|${income}|${current.spent}|${current.byCategory.map((r) => `${r.id}:${r.amount}`).join(",")}`;
    try {
      const result = await getAdvice({ data: { fingerprint, brief } });
      setTips(result.tips);
      setTipState(result.source === "unavailable" ? "unavailable" : "ready");
    } catch {
      setTipState("unavailable");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <h1 className="page-title">Insights</h1>
        <div role="group" aria-label="Period" className="flex gap-2">
          <button type="button" className="chip" aria-pressed={period === "this"} onClick={() => setPeriod("this")}>
            This {unit}
          </button>
          <button type="button" className="chip" aria-pressed={period === "last"} onClick={() => setPeriod("last")}>
            Last {unit}
          </button>
          <button type="button" className="chip" aria-pressed={period === "three"} onClick={() => setPeriod("three")}>
            3 {unit}s
          </button>
        </div>
      </header>

      <section className="panel flex flex-col gap-3.5 p-[1.125rem]" aria-label={`Compared with last ${unit}`}>
        <span className="text-[0.8125rem] font-semibold text-muted">
          {span.label} · day {progress.day} of {progress.days}
        </span>
        <div className="flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-bold">This {unit} so far</span>
            <span className="text-lg font-extrabold tabular-nums">{formatGBP(current.spent)}</span>
          </div>
          <div className="track">
            <span style={{ width: `${(current.spent / compareTop) * 100}%` }} />
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-bold text-muted">Same day last {unit}</span>
            <span className="text-lg font-extrabold text-muted tabular-nums">{formatGBP(sameDay.spent)}</span>
          </div>
          <div className="track">
            <span style={{ width: `${(sameDay.spent / compareTop) * 100}%`, background: LAST_PAY }} />
          </div>
        </div>
        <span className={`text-sm font-bold ${diff > 0 ? "text-clay" : "text-forest"}`}>
          {previous.spent === 0
            ? `No last ${unit} to compare yet.`
            : Math.abs(diff) < 500
              ? `About the same as last ${unit} at this point.`
              : `${formatGBP(Math.abs(diff))} ${diff < 0 ? "less" : "more"} than last ${unit} at this point`}
        </span>
        {current.moved > 0 ? (
          <span className="text-[0.8125rem] font-semibold text-saved">
            Saved and invested {formatGBP(current.moved)}. Not counted as spending.
          </span>
        ) : null}
        {income > 0 && current.spent > 0 ? (
          <span className="text-[0.8125rem] text-muted">{formatPercent(current.spent / income)} of take-home is spent.</span>
        ) : null}
      </section>

      {nowLine.some((v) => v > 0) || lastLine.some((v) => v > 0) ? (
        <section className="panel flex flex-col gap-3 p-[1.125rem]" aria-label={`Spending through the ${unit}`}>
          <h2 className="section-title">Spending through the {unit}</h2>
          <PayLines now={nowLine} last={lastLine} days={Math.max(progress.days, lastLine.length)} />
          <div className="flex gap-4 text-[0.8125rem] font-semibold">
            <span className="flex items-center gap-1.5">
              <span className="h-[3px] w-4 rounded-full" style={{ background: THIS_PAY }} /> This {unit}
            </span>
            <span className="flex items-center gap-1.5 text-muted">
              <span className="h-[3px] w-4 rounded-full" style={{ background: LAST_PAY }} /> Last {unit}
            </span>
          </div>
          <p className="text-sm leading-[1.45] text-muted">
            {lastLine.length === 0 || previous.spent === 0
              ? "Last pay's line appears once there is a full pay to compare."
              : diff <= 0
                ? `You are under last ${unit}'s line.`
                : `You are above last ${unit}'s line. Slow the biggest category, not a single coffee.`}
          </p>
        </section>
      ) : null}

      {where.length > 0 ? (
        <section aria-label="Where it went">
          <SectionHead title="Where it went" sub={whereNames.join(", ")} />
          <div className="rows">
            {where.map((row) => (
              <div key={row.id} className="flex flex-col gap-2 px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 text-[0.9375rem] font-bold">
                    {categoryLabel(row.id)}
                    {income > 0 && row.amounts[0] > 0 ? (
                      <span className="font-normal text-muted"> · {formatPercent(row.amounts[0] / income)} of pay</span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-[0.9375rem] font-extrabold tabular-nums">{formatGBP(row.amounts[0])}</span>
                </div>
                {row.amounts.map((amount, index) => (
                  <div key={index} className="track h-1.5" title={`${whereNames[index]}: ${formatGBP(amount)}`}>
                    <span
                      style={{
                        width: `${amount > 0 ? Math.max(2, (amount / whereTop) * 100) : 0}%`,
                        background: whereColours[index],
                      }}
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>
      ) : (
        <p className="panel p-4 text-sm text-muted">Add a few spends and Pence shows where the money went.</p>
      )}

      <section className="panel flex flex-col gap-3 p-[1.125rem]" aria-label="What to trim">
        <h2 className="section-title">Before your next spend</h2>
        {advice.map((card) => (
          <p key={card.id} className="text-sm leading-[1.5] text-ink-soft">
            <strong className={card.tone === "warn" ? "text-clay" : "text-ink"}>{card.title}.</strong> {card.body}
          </p>
        ))}
        <button
          type="button"
          className="btn btn-quiet"
          onClick={closer}
          disabled={tipState === "loading" || current.count === 0}
        >
          {tipState === "loading" ? "Reading your pay…" : "Ask for a closer read"}
        </button>
        {tipState === "unavailable" ? (
          <p className="text-sm text-muted">A closer read isn’t available right now. The notes above still stand.</p>
        ) : null}
        {tips && tips.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {tips.map((tip) => (
              <li key={tip} className="rounded-xl bg-paper px-3 py-2.5 text-sm">
                {tip}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="panel flex flex-col gap-3 p-[1.125rem]" aria-label="Search your spending">
        <label className="field">
          <span className="field-label">Search your spending</span>
          <input
            type="search"
            className="control"
            placeholder="Perfume, Uber, Tesco"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div role="group" aria-label="Over" className="grid grid-cols-6 gap-1.5">
          {SEARCH_PERIODS.map((item) => (
            <button key={item.id} type="button" className="chip justify-center px-0" aria-pressed={over === item.id} onClick={() => setOver(item.id)}>
              {item.label}
            </button>
          ))}
        </div>
        {words.length > 0 ? (
          <div className="flex items-baseline justify-between gap-3 rounded-xl bg-paper px-3.5 py-3">
            <span className="text-sm text-ink-soft">
              {query.trim()}, {range.words} · {found.length} spend{found.length === 1 ? "" : "s"}
            </span>
            <span className="text-lg font-extrabold tabular-nums">{formatGBP(foundTotal)}</span>
          </div>
        ) : null}
        {words.length > 0 && found.length > 0 ? (
          <Link to="/activity" className="link self-start">
            See them in Activity
          </Link>
        ) : null}
      </section>

      <NearbyPanel />

      <div className="rows">
        <Link to="/budget" className="row">
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-[0.9375rem] font-bold">Your budget for this {unit}</span>
            <span className="text-[0.8125rem] text-muted">Built from your last pays</span>
          </span>
          <ChevronRight className="size-5 text-muted" aria-hidden="true" />
        </Link>
        <Link to="/week" className="row">
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-[0.9375rem] font-bold">Your week</span>
            <span className="text-[0.8125rem] text-muted">The weekly check-in</span>
          </span>
          <ChevronRight className="size-5 text-muted" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
