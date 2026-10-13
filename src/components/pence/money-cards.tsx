import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { shortDay } from "@/lib/spend/habits";
import { formatGBP, nextPayday, poundsToPence, todayISO, type Profile, type Tx } from "@/lib/spend/model";
import { looksLikePay, spentBetween, weekOf, type MoneyIn } from "@/lib/spend/payday";
import { answerTap, confirmPay } from "@/server/money";
import { useRegulars, useTaps } from "./data";
import { billChecks, isBill, type ThisPay } from "./this-pay";
import { errorText } from "./ui";

/** Home's main card: safe to spend until payday, after the bills still to come. */
export function SafeCard({ pay, hasPayday }: { pay: ThisPay; hasPayday: boolean }) {
  const { safe } = pay;
  const over = safe.safePence < 0;
  const until = hasPayday ? `payday on ${nextPayday(pay.span)}` : "the end of the month";
  return (
    <section className="panel p-5" aria-label="Safe to spend">
      <p className="text-sm text-muted">{over ? `Over until ${until}` : `Safe to spend until ${until}`}</p>
      <p className={`mt-1 font-display text-5xl leading-none tabular-nums ${over ? "text-clay" : ""}`}>
        {formatGBP(Math.abs(safe.safePence))}
      </p>
      <p className="mt-2 text-sm text-muted">
        {over
          ? "Spend only on food, getting to work, or a bill until then."
          : `${safe.daysLeft} day${safe.daysLeft === 1 ? "" : "s"} left, about ${formatGBP(safe.perDayPence)} a day.`}
        {safe.billsPence > 0
          ? ` After ${formatGBP(safe.billsPence)} of bills still to come.`
          : " No regular payments due before then."}
      </p>
      {pay.bills.length > 0 ? (
        <ul className="mt-3 space-y-1 text-sm">
          {pay.bills.slice(0, 3).map((bill) => (
            <li key={`${bill.key}-${bill.due}`} className="flex justify-between gap-3">
              <span className="min-w-0 truncate">
                {bill.name} <span className="text-muted">· {shortDay(bill.due)}</span>
              </span>
              <span className="shrink-0 tabular-nums">{formatGBP(bill.amountPence)}</span>
            </li>
          ))}
          {pay.bills.length > 3 ? <li className="text-muted">And {pay.bills.length - 3} more.</li> : null}
        </ul>
      ) : null}
    </section>
  );
}

/** At the start of a pay period: did the usual take-home land? */
export function PaydayCard({ pay, profile }: { pay: ThisPay; profile: Profile }) {
  const client = useQueryClient();
  const [changing, setChanging] = useState(false);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const usual = profile.monthlyIncomePence;
  if (pay.confirmed || pay.day > 6 || pay.day < 1) return null;

  async function save(pence: number) {
    setBusy(true);
    setError("");
    try {
      await confirmPay({ data: { on: pay.span.start, amount: pence } });
      await client.invalidateQueries({ queryKey: ["pay"] });
      toast(`This pay: ${formatGBP(pence)}`);
    } catch (err) {
      setError(errorText(err, "Couldn’t save that."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel mt-4 border-forest p-4" aria-label="Payday">
      <p className="font-medium">{profile.payday ? "Payday" : "New month"}</p>
      <p className="mt-1 text-sm text-muted">
        {usual > 0 ? `Did ${formatGBP(usual)} land this time?` : "How much landed this time?"} Pence counts this pay from it.
      </p>
      {changing || usual <= 0 ? (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const pence = poundsToPence(amount);
            if (!pence) {
              setError("Enter what landed, like 2400.");
              return;
            }
            void save(pence);
          }}
        >
          <label className="sr-only" htmlFor="pay-landed">
            What landed (£)
          </label>
          <input
            id="pay-landed"
            className="control tabular-nums"
            inputMode="decimal"
            placeholder="2400"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
          <button type="submit" className="btn btn-primary shrink-0" disabled={busy}>
            Save
          </button>
        </form>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save(usual)}>
            Yes, {formatGBP(usual)}
          </button>
          <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => setChanging(true)}>
            It was different
          </button>
        </div>
      )}
      {error ? <p className="mt-2 text-sm text-clay">{error}</p> : null}
    </section>
  );
}

/** "£38 at Boots: perfume, pharmacy or toiletries?" One tap files it. */
export function NeedsTap() {
  const taps = useTaps();
  const client = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const list = taps.data ?? [];
  if (list.length === 0) return null;

  async function answer(id: string, kind: string, merchant: string) {
    setBusy(id);
    try {
      const result = await answerTap({ data: { id, kind } });
      await Promise.all([
        client.invalidateQueries({ queryKey: ["taps"] }),
        client.invalidateQueries({ queryKey: ["txs"] }),
        client.invalidateQueries({ queryKey: ["forYou"] }),
      ]);
      if (result.label) toast(`${merchant}: ${result.label.toLowerCase()}`);
    } catch (err) {
      toast(errorText(err, "Couldn’t save that."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="mt-4" aria-label="Needs a tap">
      <h2 className="mb-2 font-display text-2xl">Needs a tap</h2>
      <ul className="space-y-2">
        {list.map((tap) => (
          <li key={tap.id} className="panel p-4">
            <div className="flex items-baseline justify-between gap-3">
              <p className="min-w-0 truncate font-medium">
                {formatGBP(tap.amountPence)} at {tap.merchant}
              </p>
              <p className="shrink-0 text-sm text-muted">{shortDay(tap.spentOn)}</p>
            </div>
            <p className="mt-1 text-sm text-muted">What was it? One tap files it.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {tap.choices.map((choice) => (
                <button
                  key={choice.id}
                  type="button"
                  className="min-h-11 rounded-full border border-line bg-card px-4 text-sm font-medium"
                  disabled={busy === tap.id}
                  onClick={() => void answer(tap.id, choice.id, tap.merchant)}
                >
                  {choice.label}
                </button>
              ))}
              <button
                type="button"
                className="min-h-11 rounded-full px-3 text-sm text-muted"
                disabled={busy === tap.id}
                onClick={() => void answer(tap.id, "-", tap.merchant)}
              >
                Rather not say
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function BillsCard() {
  const regulars = useRegulars();
  if (regulars.isPending || regulars.isError) return null;
  const today = regulars.data.today;
  const bills = regulars.data.items.filter((item) => isBill(item) && !item.stopped && !item.lapsed);
  const checks = billChecks(bills, today);
  const monthly = bills.reduce((sum, item) => sum + item.monthlyPence, 0);
  return (
    <Link
      to="/bills"
      className={`mt-4 flex items-center justify-between gap-3 rounded-lg px-4 py-3 ${checks.length > 0 ? "bg-clay-soft" : "panel"}`}
    >
      <span className="min-w-0">
        <span className="block font-medium">
          {checks.length > 0 ? `${checks.length} bill${checks.length === 1 ? "" : "s"} to check` : "Bills"}
        </span>
        <span className="block text-sm text-muted">
          {checks.length > 0
            ? `${checks[0].item.name}: ${checks[0].why}`
            : bills.length > 0
              ? `${bills.length} on your list · about ${formatGBP(monthly)} a month`
              : "Rent, energy, phone and the rest, with contract ends and price rises"}
        </span>
      </span>
      <span className="shrink-0 text-sm text-forest">Open</span>
    </Link>
  );
}

/** A small link to the weekly check-in, with the week so far. */
export function WeekCard({ txs }: { txs: Tx[] }) {
  const today = todayISO(new Date());
  const week = weekOf(today);
  const total = spentBetween(txs, week.start, today);
  return (
    <Link to="/week" className="panel mt-4 flex items-center justify-between gap-3 px-4 py-3">
      <span className="min-w-0">
        <span className="block font-medium">Your week</span>
        <span className="block text-sm text-muted">
          {total.spentPence > 0 ? `${formatGBP(total.spentPence)} since Monday` : "Nothing spent since Monday yet"}
        </span>
      </span>
      <span className="shrink-0 text-sm text-forest">Check-in</span>
    </Link>
  );
}

/**
 * Money coming in that looks like pay, seen on a statement or screenshot.
 * One tap saves it as the take-home for that pay period.
 */
export function PaySpotted({ rows, usualPence }: { rows: MoneyIn[]; usualPence: number }) {
  const client = useQueryClient();
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pay = looksLikePay(rows, usualPence)[0];
  if (!pay) return null;

  async function confirm() {
    setBusy(true);
    try {
      const saved = await confirmPay({ data: { on: pay.date, amount: pay.amountPence, source: "spotted" } });
      await client.invalidateQueries({ queryKey: ["pay"] });
      setDone(saved.startsOn);
    } catch (err) {
      toast(errorText(err, "Couldn’t save that."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel border-forest p-4" aria-label="Pay spotted">
      {done ? (
        <p className="text-sm">
          Saved: {formatGBP(pay.amountPence)} is your take-home for the pay from {shortDay(done)}.
        </p>
      ) : (
        <>
          <p className="font-medium">Is this your pay?</p>
          <p className="mt-1 text-sm text-muted">
            {formatGBP(pay.amountPence)} came in from {pay.merchant} on {shortDay(pay.date)}. Pence can count that pay from it.
          </p>
          <button type="button" className="btn btn-primary mt-3" disabled={busy} onClick={() => void confirm()}>
            Yes, that’s my pay
          </button>
        </>
      )}
    </section>
  );
}
