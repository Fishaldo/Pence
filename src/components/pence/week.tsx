import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { dayNum, isoOf, shortDay } from "@/lib/spend/habits";
import { categoryLabel, formatGBP, todayISO } from "@/lib/spend/model";
import { spentBetween, weekOf } from "@/lib/spend/payday";
import { saveWeeklyDay } from "@/server/money";
import { useLedger, useRegulars } from "./data";
import { NeedsTap } from "./money-cards";
import { billChecks, isBill, longToday, useThisPay } from "./this-pay";
import { PhoneAlerts } from "./phone-alerts-panel";
import { errorText, PageHead } from "./ui";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** The weekly check-in: the week so far against last week, what is coming, and anything to answer. */
export function WeekView() {
  const { profile, txs } = useLedger();
  const regulars = useRegulars();
  const client = useQueryClient();
  const rows = txs.data ?? [];
  const pay = useThisPay(profile.data, rows);
  const [busy, setBusy] = useState(false);

  const today = todayISO(new Date());
  const week = weekOf(today);
  const daysIn = dayNum(today) - dayNum(week.start);
  const lastStart = isoOf(dayNum(week.start) - 7);
  const lastSameDay = isoOf(dayNum(lastStart) + daysIn);
  const now = spentBetween(rows, week.start, today);
  const last = spentBetween(rows, lastStart, lastSameDay);
  const diff = now.spentPence - last.spentPence;
  const up = now.byCategory
    .map((row) => ({ ...row, before: last.byCategory.find((b) => b.id === row.id)?.amountPence ?? 0 }))
    .map((row) => ({ ...row, change: row.amountPence - row.before }))
    .filter((row) => row.change >= 500)
    .sort((a, b) => b.change - a.change)[0];
  const nextWeek = isoOf(dayNum(today) + 7);
  const coming = (regulars.data?.items ?? []).filter(
    (item) => !item.stopped && !item.lapsed && item.nextDue && item.nextDue >= today && item.nextDue <= nextWeek,
  );
  const comingTotal = coming.reduce((sum, item) => sum + Math.max(0, item.amountPence), 0);
  const weeklyDay = profile.data?.weeklyDay ?? null;

  async function pickDay(value: string) {
    setBusy(true);
    try {
      await saveWeeklyDay({ data: { day: value === "" ? null : Number(value) } });
      await client.invalidateQueries({ queryKey: ["profile"] });
      toast(value === "" ? "Weekly reminder off" : `Weekly check-in on ${DAYS[Number(value)]}s`);
    } catch (err) {
      toast(errorText(err, "Couldn’t save that."));
    } finally {
      setBusy(false);
    }
  }

  const bills = (regulars.data?.items ?? []).filter((item) => isBill(item) && !item.stopped && !item.lapsed);
  const check = billChecks(bills, regulars.data?.today ?? today)[0];

  return (
    <div className="flex flex-col gap-5">
      <PageHead close="/" date={longToday()} title="Your week" flush />

      <section className="hero flex flex-col gap-1.5" aria-label="This week">
        <span className="text-sm font-semibold text-on-forest">Spent this week, since Monday</span>
        <span className="text-[2.75rem] leading-[1.1] font-extrabold tracking-[-0.03em] tabular-nums">
          {formatGBP(now.spentPence).replace(/\.00$/, "")}
        </span>
        <span className="text-sm font-semibold text-on-forest">
          {last.spentPence === 0 && now.spentPence === 0
            ? "Nothing logged this week or last."
            : Math.abs(diff) < 100
              ? "About the same as last week by this day."
              : `${formatGBP(Math.abs(diff))} ${diff < 0 ? "less" : "more"} than last week by this day`}
        </span>
      </section>

      {now.byCategory.length > 0 || up ? (
        <section className="panel flex flex-col gap-2.5 p-[1.125rem]" aria-label="What stood out">
          <h2 className="section-title">What stood out</h2>
          {now.byCategory.slice(0, 3).map((row) => (
            <p key={row.id} className="text-sm leading-[1.5] text-ink-soft">
              {categoryLabel(row.id)} came to <strong className="text-ink tabular-nums">{formatGBP(row.amountPence)}</strong>.
            </p>
          ))}
          {up ? (
            <p className="text-sm leading-[1.5] font-semibold text-clay">
              {categoryLabel(up.id)} is up {formatGBP(up.change)} on last week.
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="panel flex flex-col gap-2.5 p-[1.125rem]" aria-label="One thing for next week">
        <h2 className="section-title">One thing for next week</h2>
        {check ? (
          <>
            <p className="text-sm leading-[1.5] text-ink-soft">
              {check.item.name}: {check.why.charAt(0).toLowerCase()}
              {check.why.slice(1)}. A better deal could cost less.
            </p>
            <Link to="/bills" className="btn-pill self-start">
              See deals
            </Link>
          </>
        ) : pay.takeHomePence > 0 ? (
          <p className="text-sm leading-[1.5] text-ink-soft">
            {pay.safe.safePence >= 0
              ? `${formatGBP(pay.safe.safePence)} is safe to spend until payday: about ${formatGBP(pay.safe.perDayPence)} a day for ${pay.safe.daysLeft} day${pay.safe.daysLeft === 1 ? "" : "s"}.`
              : `You are ${formatGBP(Math.abs(pay.safe.safePence))} over until payday. Spend only on what you need until then.`}
          </p>
        ) : (
          <p className="text-sm leading-[1.5] text-ink-soft">Add your take-home in Settings and Pence shows what is safe to spend.</p>
        )}
      </section>

      <section className="flex flex-col gap-2.5" aria-label="Coming out in the next 7 days">
        <h2 className="section-title">Coming out in the next 7 days</h2>
        {coming.length === 0 ? (
          <p className="panel px-4 py-4 text-sm text-muted">No regular payments due this week.</p>
        ) : (
          <>
            <div className="rows">
              {coming.map((item) => (
                <div key={item.key} className="row">
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-[0.9375rem] font-bold">{item.name}</span>
                    <span className="text-[0.8125rem] text-muted">{shortDay(item.nextDue ?? "")}</span>
                  </span>
                  {item.amountPence > 0 ? (
                    <span className="shrink-0 text-[0.9375rem] font-extrabold tabular-nums">{formatGBP(item.amountPence)}</span>
                  ) : null}
                </div>
              ))}
            </div>
            {comingTotal > 0 ? <p className="text-[0.8125rem] text-muted">About {formatGBP(comingTotal)} in all.</p> : null}
          </>
        )}
      </section>

      <NeedsTap />

      <section className="panel flex flex-col gap-2 p-4">
        <label className="field">
          <span className="field-label">Check-in day</span>
          <select className="control" value={weeklyDay == null ? "" : String(weeklyDay)} disabled={busy} onChange={(event) => void pickDay(event.target.value)}>
            <option value="">No reminder</option>
            {DAYS.map((day, index) => (
              <option key={day} value={index}>
                {day}
              </option>
            ))}
          </select>
        </label>
        <p className="text-[0.8125rem] text-muted">On that day, a phone alert opens this page.</p>
        {weeklyDay != null ? <PhoneAlerts what="for your weekly check-in" /> : null}
      </section>

      <div className="rows">
        <Link to="/budget" className="row">
          <span className="flex-1 text-[0.9375rem] font-bold">Your budget</span>
          <ChevronRight className="size-5 text-muted" aria-hidden="true" />
        </Link>
        <Link to="/activity" className="row">
          <span className="flex-1 text-[0.9375rem] font-bold">All activity</span>
          <ChevronRight className="size-5 text-muted" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
