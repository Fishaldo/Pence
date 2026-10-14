import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { shortDay } from "@/lib/spend/habits";
import { formatGBP, poundsToPence, todayISO, type Profile, type Tx } from "@/lib/spend/model";
import { looksLikePay, spentBetween, weekOf, type MoneyIn } from "@/lib/spend/payday";
import { answerTap, confirmPay } from "@/server/money";
import { useRegulars, useTaps } from "./data";
import { billChecks, isBill, type ThisPay } from "./this-pay";
import { errorText } from "./ui";

/**
 * Home's green card: safe to spend until payday, after the bills still to come,
 * how much of take-home is spent, and the pace against last pay.
 */
export function SafeCard({
  pay,
  hasPayday,
  pace,
}: {
  pay: ThisPay;
  hasPayday: boolean;
  /** "£96 less than this point last pay", or null when there is nothing to compare. */
  pace: string | null;
}) {
  const { safe } = pay;
  const over = safe.safePence < 0;
  const until = hasPayday ? "payday" : "the end of the month";
  const share = pay.takeHomePence > 0 ? Math.min(1, pay.spentPence / pay.takeHomePence) : 0;
  const days = `${safe.daysLeft} day${safe.daysLeft === 1 ? "" : "s"} to ${hasPayday ? "payday" : "the month end"}`;
  return (
    <section className="hero flex flex-col gap-4" aria-label="Safe to spend">
      <div className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-on-forest">
          {over ? `Over your take-home until ${until}` : `Safe to spend until ${until}`}
        </span>
        <span className="text-[2.75rem] leading-[1.1] font-extrabold tracking-[-0.03em] tabular-nums">
          {formatGBP(Math.abs(safe.safePence)).replace(/\.00$/, "")}
        </span>
        <span className="text-sm leading-[1.45] text-on-forest">
          {over
            ? "Spend only on food, getting to work, or a bill until then."
            : `${safe.billsPence > 0 ? "After bills still to come. " : ""}${days}, about ${formatGBP(safe.perDayPence)} a day.`}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        <div
          className="h-2 overflow-hidden rounded-full bg-white/20"
          role="img"
          aria-label={`${Math.round(share * 100)}% of take-home spent`}
        >
          <div className="h-2 rounded-full bg-white" style={{ width: `${Math.max(2, share * 100)}%` }} />
        </div>
        <div className="flex justify-between text-[0.8125rem] font-semibold text-on-forest tabular-nums">
          <span>Spent {formatGBP(pay.spentPence).replace(/\.00$/, "")}</span>
          <span>Take-home {formatGBP(pay.takeHomePence).replace(/\.00$/, "")}</span>
        </div>
      </div>
      {pace ? (
        <span className="self-start rounded-full bg-white/15 px-3 py-2 text-[0.8125rem] font-bold">{pace}</span>
      ) : null}
    </section>
  );
}

/** The three small totals under the green card: bills, spending, and money saved or invested. */
export function PayTiles({ billsPence, spendingPence, movedPence }: { billsPence: number; spendingPence: number; movedPence: number }) {
  const short = (pence: number) => formatGBP(pence).replace(/\.00$/, "");
  return (
    <section className="grid grid-cols-3 gap-2.5" aria-label="This pay so far">
      <Link to="/bills" className="tile">
        <span className="text-xs font-semibold text-muted">Bills</span>
        <span className="text-lg font-extrabold tabular-nums">{short(billsPence)}</span>
      </Link>
      <div className="tile">
        <span className="text-xs font-semibold text-muted">Spending</span>
        <span className="text-lg font-extrabold tabular-nums">{short(spendingPence)}</span>
      </div>
      <div className="tile">
        <span className="text-xs font-semibold text-muted">Saved, invested</span>
        <span className="text-lg font-extrabold text-saved tabular-nums">{short(movedPence)}</span>
      </div>
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
    <section className="panel flex flex-col gap-1 border-forest p-4" aria-label="Payday">
      <p className="text-[0.9375rem] font-extrabold">{profile.payday ? "Did your pay arrive?" : "New month"}</p>
      <p className="text-sm text-muted">
        {usual > 0 ? `Did ${formatGBP(usual)} land this time?` : "How much landed this time?"} Pay can change, so Pence asks every payday.
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
        <div className="mt-3 flex flex-col gap-2">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save(usual)}>
            Yes, {formatGBP(usual)}
          </button>
          <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => setChanging(true)}>
            A different amount
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
    <section aria-label="Needs a tap">
      <h2 className="section-title mb-2.5">Needs a tap</h2>
      <ul className="flex flex-col gap-2.5">
        {list.map((tap) => (
          <li key={tap.id} className="panel flex flex-col gap-3 p-4">
            <div className="flex items-baseline justify-between gap-3">
              <p className="min-w-0 truncate text-base font-extrabold">
                {formatGBP(tap.amountPence)} at {tap.merchant}
              </p>
              <p className="shrink-0 text-[0.8125rem] text-muted">{shortDay(tap.spentOn)}</p>
            </div>
            <p className="-mt-2 text-sm text-muted">What was it? One tap files it.</p>
            <div className="flex flex-wrap gap-2">
              {tap.choices.map((choice) => (
                <button
                  key={choice.id}
                  type="button"
                  className="chip"
                  disabled={busy === tap.id}
                  onClick={() => void answer(tap.id, choice.id, tap.merchant)}
                >
                  {choice.label}
                </button>
              ))}
              <button
                type="button"
                className="chip"
                disabled={busy === tap.id}
                onClick={() => void answer(tap.id, "-", tap.merchant)}
              >
                Something else
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** "3 bills could cost less": shown on Home only when a bill went up or a contract ends. */
export function BillsCard() {
  const regulars = useRegulars();
  if (regulars.isPending || regulars.isError) return null;
  const today = regulars.data.today;
  const bills = regulars.data.items.filter((item) => isBill(item) && !item.stopped && !item.lapsed);
  const checks = billChecks(bills, today);
  if (checks.length === 0) return null;
  return (
    <Link to="/bills" className="flex items-center gap-3.5 rounded-[1.125rem] bg-clay-soft p-4 text-ink">
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-base font-extrabold">
          {checks.length} bill{checks.length === 1 ? "" : "s"} could cost less
        </span>
        <span className="text-sm leading-[1.4] text-clay-ink">
          {checks
            .slice(0, 2)
            .map((check) => `${check.item.name}: ${check.why.charAt(0).toLowerCase()}${check.why.slice(1)}`)
            .join(". ")}
          .
        </span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-clay" strokeWidth={2} aria-hidden="true" />
    </Link>
  );
}

/** A small link to the weekly check-in, with the week so far. */
export function WeekCard({ txs }: { txs: Tx[] }) {
  const today = todayISO(new Date());
  const week = weekOf(today);
  const total = spentBetween(txs, week.start, today);
  return (
    <Link to="/week" className="panel flex items-center justify-between gap-3 px-4 py-3">
      <span className="min-w-0">
        <span className="block font-extrabold">Your week</span>
        <span className="block text-sm text-muted">
          {total.spentPence > 0 ? `${formatGBP(total.spentPence)} since Monday` : "Nothing spent since Monday yet"}
        </span>
      </span>
      <span className="shrink-0 text-sm font-bold text-forest">Check-in</span>
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
          <p className="font-extrabold">Is this your pay?</p>
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
