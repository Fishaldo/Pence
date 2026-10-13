import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { dayNum, isoOf, shortDay } from "@/lib/spend/habits";
import { categoryLabel, formatGBP, todayISO } from "@/lib/spend/model";
import { spentBetween, weekOf } from "@/lib/spend/payday";
import { saveWeeklyDay } from "@/server/money";
import { useLedger, useRegulars } from "./data";
import { NeedsTap } from "./money-cards";
import { useThisPay } from "./this-pay";
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

  return (
    <div>
      <PageHead kicker="Weekly check-in" title="Your week" />

      <section className="panel p-5">
        <p className="text-sm text-muted">
          Since Monday {shortDay(week.start).replace(/^Mon /, "")}
        </p>
        <p className="mt-1 font-display text-5xl leading-none tabular-nums">{formatGBP(now.spentPence)}</p>
        <p className="mt-2 text-sm text-muted">
          {last.spentPence === 0 && now.spentPence === 0
            ? "Nothing logged this week or last."
            : diff === 0
              ? "The same as last week by this day."
              : `${formatGBP(Math.abs(diff))} ${diff < 0 ? "less" : "more"} than last week by this day.`}
        </p>
        {now.byCategory.length > 0 ? (
          <ul className="mt-3 space-y-1 text-sm">
            {now.byCategory.slice(0, 3).map((row) => (
              <li key={row.id} className="flex justify-between gap-3">
                <span>{categoryLabel(row.id)}</span>
                <span className="tabular-nums">{formatGBP(row.amountPence)}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {up ? (
          <p className="mt-3 rounded-md bg-clay-soft px-3 py-2 text-sm text-clay">
            {categoryLabel(up.id)} is up {formatGBP(up.change)} on last week.
          </p>
        ) : null}
      </section>

      {pay.takeHomePence > 0 ? (
        <section className="panel mt-4 p-4">
          <p className="font-medium">
            {pay.safe.safePence >= 0
              ? `${formatGBP(pay.safe.safePence)} safe to spend until payday`
              : `${formatGBP(Math.abs(pay.safe.safePence))} over until payday`}
          </p>
          <p className="mt-1 text-sm text-muted">
            {pay.safe.safePence >= 0
              ? `About ${formatGBP(pay.safe.perDayPence)} a day for ${pay.safe.daysLeft} day${pay.safe.daysLeft === 1 ? "" : "s"}.`
              : "Spend only on what you need until then."}
          </p>
        </section>
      ) : null}

      <section className="mt-6">
        <h2 className="font-display text-2xl">Coming out in the next 7 days</h2>
        {coming.length === 0 ? (
          <p className="panel mt-2 px-4 py-4 text-sm text-muted">No regular payments due this week.</p>
        ) : (
          <>
            <ul className="panel mt-2 divide-y divide-line">
              {coming.map((item) => (
                <li key={item.key} className="flex items-baseline justify-between gap-3 px-4 py-3">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{item.name}</span>
                    <span className="block text-sm text-muted">{shortDay(item.nextDue ?? "")}</span>
                  </span>
                  {item.amountPence > 0 ? <span className="shrink-0 tabular-nums">{formatGBP(item.amountPence)}</span> : null}
                </li>
              ))}
            </ul>
            {comingTotal > 0 ? <p className="mt-2 text-sm text-muted">About {formatGBP(comingTotal)} in all.</p> : null}
          </>
        )}
      </section>

      <NeedsTap />

      <section className="panel mt-6 p-4">
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
        <p className="mt-1 text-sm text-muted">On that day, a phone alert opens this page.</p>
        {weeklyDay != null ? <PhoneAlerts what="for your weekly check-in" /> : null}
      </section>

      <p className="mt-6 text-sm text-muted">
        <Link to="/budget" className="font-medium text-forest">
          Your budget
        </Link>
        {" · "}
        <Link to="/bills" className="font-medium text-forest">
          Bills
        </Link>
        {" · "}
        <Link to="/activity" className="font-medium text-forest">
          All activity
        </Link>
      </p>
    </div>
  );
}
