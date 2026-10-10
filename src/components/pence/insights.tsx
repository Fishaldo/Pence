import { useState } from "react";
import {
  buildAdvice,
  categoryLabel,
  formatGBP,
  formatPercent,
  paySpan,
  projectedSpend,
  spanProgress,
  summarizeSpan,
  todayISO,
  type CategoryId,
  type Tx,
} from "@/lib/spend/model";
import { getAdvice } from "@/server/ledger";
import { useLedger } from "./data";
import { NearbyPanel } from "./nearby";
import { Money, PageHead } from "./ui";

const SLICE = ["#1b5e45", "#3d8b68", "#b4532a", "#c4b396", "#3d3832", "#8fbfa4"];

function dailyTotals(rows: Tx[], start: string, through: string) {
  const totals = new Map<string, number>();
  for (const tx of rows) {
    if (tx.spentOn < start || tx.spentOn > through) continue;
    totals.set(tx.spentOn, (totals.get(tx.spentOn) ?? 0) + tx.amountPence);
  }
  const [ys, ms, ds] = start.split("-").map(Number);
  const [ye, me, de] = through.split("-").map(Number);
  const cursor = new Date(ys, ms - 1, ds);
  const end = new Date(ye, me - 1, de);
  const days: { day: number; amount: number }[] = [];
  for (; cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    const iso = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
    days.push({ day: cursor.getDate(), amount: totals.get(iso) ?? 0 });
  }
  return days;
}

function Donut({
  slices,
}: {
  slices: { name: string; amount: number; color: string }[];
}) {
  const total = slices.reduce((sum, slice) => sum + slice.amount, 0);
  const radius = 42;
  const circ = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <svg viewBox="0 0 120 120" className="size-36 shrink-0" role="img" aria-label="Share of this month by category">
      {slices.map((slice) => {
        const length = total > 0 ? (slice.amount / total) * circ : 0;
        const node = (
          <circle
            key={slice.name}
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke={slice.color}
            strokeWidth="14"
            strokeDasharray={`${Math.max(length - (slices.length > 1 ? 1.5 : 0), 0)} ${circ}`}
            strokeDashoffset={-offset}
            transform="rotate(-90 60 60)"
          />
        );
        offset += length;
        return node;
      })}
      <circle cx="60" cy="60" r="30" fill="#fffdf8" />
    </svg>
  );
}

export function InsightsView() {
  const { profile, txs } = useLedger();
  const [tips, setTips] = useState<string[] | null>(null);
  const [tipState, setTipState] = useState<"idle" | "loading" | "ready" | "unavailable">("idle");

  if (txs.isPending || profile.isPending) {
    return <div className="h-72 animate-pulse rounded-lg bg-sand" />;
  }

  const today = new Date();
  const payday = profile.data?.payday ?? null;
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

  const names = new Set<CategoryId>();
  for (const row of current.byCategory) names.add(row.id);
  for (const row of previous.byCategory) names.add(row.id);
  for (const row of older.byCategory) names.add(row.id);
  const chartRows = [...names]
    .map((id) => ({
      name: categoryLabel(id),
      amounts: [
        current.byCategory.find((row) => row.id === id)?.amount ?? 0,
        previous.byCategory.find((row) => row.id === id)?.amount ?? 0,
        older.byCategory.find((row) => row.id === id)?.amount ?? 0,
      ],
    }))
    .sort((a, b) => b.amounts.reduce((sum, n) => sum + n, 0) - a.amounts.reduce((sum, n) => sum + n, 0))
    .slice(0, 6);
  const maxBar = Math.max(...chartRows.flatMap((item) => item.amounts), 1);
  const slices = current.byCategory.slice(0, 6).map((row, index) => ({
    name: categoryLabel(row.id),
    amount: row.amount,
    color: SLICE[index % SLICE.length],
  }));
  const through = todayISO(today) < span.end ? todayISO(today) : span.end;
  const days = dailyTotals(rows, span.start, through);
  const maxDay = Math.max(...days.map((day) => day.amount), 1);

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
    <div>
      <PageHead kicker={payday ? "This pay" : "Compared"} title={payday ? span.label : span.short} />
      <section className="panel p-5">
        <div className="grid grid-cols-2 gap-6">
          <div className="min-w-0">
            <p className="text-sm text-muted">{span.label}</p>
            <p className="font-display text-3xl tabular-nums">
              <Money pence={current.spent} />
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-sm text-muted">{prevSpan.label}</p>
            <p className="font-display text-3xl tabular-nums">
              <Money pence={previous.spent} />
            </p>
          </div>
        </div>
        <p className="mt-3 text-sm text-muted">
          {current.spent === 0 && previous.spent === 0
            ? "Nothing to compare until a spend is logged."
            : previous.spent === 0
              ? `No spends from ${prevSpan.short}.`
              : current.spent >= previous.spent
                ? `${formatGBP(current.spent - previous.spent)} more than ${payday ? `the pay from ${prevSpan.short}` : prevSpan.short}.${progress.complete ? "" : payday ? " This pay is still in progress." : " This month is still in progress."}`
                : `${formatGBP(previous.spent - current.spent)} less than ${payday ? `the pay from ${prevSpan.short}` : prevSpan.short}.`}
        </p>
        {income > 0 && current.spent > 0 ? (
          <p className="mt-2 text-sm">
            {formatPercent(current.spent / income)} of take-home is spent
            {topMerchant ? `, most of it at ${topMerchant.name} (${formatGBP(topMerchant.amount)})` : ""}.
          </p>
        ) : null}
      </section>

      {slices.length > 0 ? (
        <section className="mt-4 panel p-5">
          <h2 className="font-display text-2xl">{payday ? "Where this pay went" : "Where this month went"}</h2>
          <div className="mt-4 flex flex-col items-center gap-5 sm:flex-row sm:items-center">
            <Donut slices={slices} />
            <ul className="w-full space-y-2">
              {slices.map((slice) => (
                <li key={slice.name} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: slice.color }} />
                    <span className="truncate">{slice.name}</span>
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {formatGBP(slice.amount)}
                    {current.spent > 0 ? <span className="text-muted"> · {formatPercent(slice.amount / current.spent)}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {days.some((day) => day.amount > 0) ? (
        <section className="mt-4 panel p-5">
          <h2 className="font-display text-2xl">By day</h2>
          <p className="mt-1 text-sm text-muted">{span.label}, up to today.</p>
          <div className="mt-4 flex h-28 items-end gap-1" role="img" aria-label="Spending on each day this month">
            {days.map((day) => (
              <div key={day.day} className="flex h-full min-w-0 flex-1 flex-col justify-end">
                <div
                  className="w-full rounded-sm bg-forest"
                  style={{ height: day.amount > 0 ? `${Math.max(6, (day.amount / maxDay) * 100)}%` : "0%" }}
                  title={`${day.day}: ${formatGBP(day.amount)}`}
                />
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-xs text-muted tabular-nums">
            <span>{days[0]?.day ?? ""}</span>
            <span>{days[days.length - 1]?.day ?? ""}</span>
          </div>
        </section>
      ) : null}

      {chartRows.length > 0 ? (
        <section className="mt-4 panel p-5">
          <h2 className="font-display text-2xl">{payday ? "Past three pays" : "Past three months"}</h2>
          <div className="mb-4 mt-3 flex flex-wrap gap-4 text-sm">
            {[
              ["#1b5e45", span.short],
              ["#3d8b68", prevSpan.short],
              ["#c4b396", olderSpan.short],
            ].map(([color, label]) => (
              <span key={label} className="flex items-center gap-2">
                <span className="size-2.5 rounded-full" style={{ background: color }} /> {label}
              </span>
            ))}
          </div>
          <ul className="space-y-4">
            {chartRows.map((row) => (
              <li key={row.name}>
                <p className="mb-1.5 text-sm font-medium">{row.name}</p>
                <div className="space-y-1.5">
                  {row.amounts.map((amount, index) => (
                    <div key={index} className="flex items-center gap-3">
                      <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-sand">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${amount > 0 ? Math.max(2, (amount / maxBar) * 100) : 0}%`,
                            background: ["#1b5e45", "#3d8b68", "#c4b396"][index],
                          }}
                        />
                      </div>
                      <span className="w-20 shrink-0 text-right text-xs tabular-nums">{formatGBP(amount)}</span>
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {current.byCategory.length > 0 ? (
        <section className="mt-4">
          <h2 className="mb-2 font-display text-2xl">Share of pay</h2>
          <ul className="panel divide-y divide-line">
            {current.byCategory.map((row) => {
              const prev = previous.byCategory.find((item) => item.id === row.id)?.amount ?? 0;
              const before = older.byCategory.find((item) => item.id === row.id)?.amount ?? 0;
              const change = row.amount - prev;
              return (
                <li key={row.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="font-medium">{categoryLabel(row.id)}</p>
                    <p className="text-sm text-muted">
                      {income > 0 ? `${formatPercent(row.amount / income)} of take-home` : "Add take-home to see the share"}
                      {prev > 0 ? (
                        <span className={change > 100 ? " text-clay" : " text-forest"}>
                          {" · "}
                          {change >= 0 ? "up" : "down"} {formatGBP(Math.abs(change))} on {prevSpan.short}
                        </span>
                      ) : (
                        ` · none from ${prevSpan.short}`
                      )}
                      {before > 0 ? ` · ${formatGBP(before)} from ${olderSpan.short}` : ` · none from ${olderSpan.short}`}
                    </p>
                  </div>
                  <p className="shrink-0 tabular-nums">{formatGBP(row.amount)}</p>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <NearbyPanel />

      <section className="mt-6">
        <h2 className="font-display text-2xl">What to trim</h2>
        <ul className="mt-3 space-y-3">
          {advice.map((card) => (
            <li
              key={card.id}
              className={`rounded-lg border p-4 ${card.tone === "warn" ? "border-clay/40 bg-clay-soft" : "border-line bg-card"}`}
            >
              <h3 className="font-medium">{card.title}</h3>
              <p className="mt-1 text-sm text-muted">{card.body}</p>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="btn btn-quiet mt-3"
          onClick={closer}
          disabled={tipState === "loading" || current.count === 0}
        >
          {tipState === "loading" ? "Reading your month…" : "Ask for a closer read"}
        </button>
        {tipState === "unavailable" ? (
          <p className="mt-2 text-sm text-muted">
            A closer read isn’t available right now. The notes above still stand.
          </p>
        ) : null}
        {tips && tips.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {tips.map((tip) => (
              <li key={tip} className="panel px-4 py-3 text-sm">
                {tip}
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
