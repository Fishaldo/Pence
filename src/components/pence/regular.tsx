import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { shortDay } from "@/lib/spend/habits";
import { formatGBP } from "@/lib/spend/model";
import { dueText, FREQ_LABEL, FREQS, type Freq, type Regular } from "@/lib/spend/regular";
import { removeRegular, saveRegular } from "@/server/regular";
import { useRegulars } from "./data";
import { PhoneAlerts } from "./phone-alerts-panel";
import { errorText, PageHead } from "./ui";

const ADD_LABEL: Record<Freq, string> = {
  once: "Once (a free trial or one payment)",
  weekly: FREQ_LABEL.weekly,
  monthly: FREQ_LABEL.monthly,
  quarterly: FREQ_LABEL.quarterly,
  yearly: FREQ_LABEL.yearly,
};

function poundsText(pence: number | null | undefined): string {
  return pence ? (pence / 100).toFixed(2) : "";
}

function cancelSearch(name: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(`how to cancel ${name} UK`)}`;
}

function amountText(item: Regular): string {
  if (item.amountPence <= 0) return item.freq === "once" ? "Free trial" : "";
  return formatGBP(item.amountPence);
}

function useSaver() {
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  async function run(work: () => Promise<unknown>, done?: string): Promise<boolean> {
    setBusy(true);
    try {
      await work();
      await client.invalidateQueries({ queryKey: ["regulars"] });
      if (done) toast(done);
      return true;
    } catch (err) {
      toast(errorText(err, "Couldn’t save that."));
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { busy, run };
}

/** Name, amount, how often and the date. Used to add a payment and to fix one Pence found. */
function PaymentForm({
  item,
  onDone,
  onCancel,
}: {
  item?: Regular;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { busy, run } = useSaver();
  const [name, setName] = useState(item?.name ?? "");
  const [amount, setAmount] = useState(poundsText(item?.amountPence));
  const [freq, setFreq] = useState<Freq>(item?.freq ?? "monthly");
  const [nextDue, setNextDue] = useState(item?.nextDue ?? "");

  async function submit(event: FormEvent) {
    event.preventDefault();
    const ok = await run(
      () =>
        saveRegular({
          data: {
            key: item?.key ?? "",
            name,
            amount,
            freq,
            nextDue: nextDue || null,
          },
        }),
      item ? "Saved" : `${name.trim()} is on your list`,
    );
    if (ok) onDone();
  }

  return (
    <form onSubmit={submit} className="mt-3 flex flex-col gap-3">
      <label className="field">
        <span className="field-label">Name</span>
        <input
          className="control"
          value={name}
          maxLength={60}
          placeholder="Netflix, gym, phone…"
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="field">
          <span className="field-label">Amount (£)</span>
          <input
            className="control tabular-nums"
            inputMode="decimal"
            placeholder={freq === "once" ? "0 if free" : "£"}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">{freq === "once" ? "Trial ends" : "Next payment"}</span>
          <input className="control" type="date" value={nextDue} onChange={(event) => setNextDue(event.target.value)} />
        </label>
      </div>
      <label className="field">
        <span className="field-label">How often</span>
        <select className="control" value={freq} onChange={(event) => setFreq(event.target.value as Freq)}>
          {FREQS.map((value) => (
            <option key={value} value={value}>
              {item ? FREQ_LABEL[value] : ADD_LABEL[value]}
            </option>
          ))}
        </select>
      </label>
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary flex-1" disabled={busy || name.trim().length < 2}>
          {busy ? "Saving…" : item ? "Save" : "Add to the list"}
        </button>
        <button type="button" className="btn btn-quiet" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function PaymentRow({ item }: { item: Regular }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const { busy, run } = useSaver();
  const amount = amountText(item);
  const soon = !item.stopped && !item.lapsed && item.daysLeft != null && item.daysLeft <= 3;

  return (
    <li className="px-4 py-3">
      <button
        type="button"
        className="flex w-full items-start justify-between gap-3 text-left"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="min-w-0">
          <span className="block truncate font-medium">{item.name}</span>
          <span className="block text-sm text-muted">
            {item.stopped
              ? "You cancelled this"
              : item.lapsed
                ? item.lastPaid
                  ? `Last paid ${shortDay(item.lastPaid)}`
                  : "Not seen lately"
                : item.freq === "once"
                  ? item.daysLeft === 0
                    ? "Ends today"
                    : `${(item.daysLeft ?? 0) < 0 ? "Ended" : "Ends"} ${shortDay(item.nextDue ?? "")}`
                  : FREQ_LABEL[item.freq]}
          </span>
        </span>
        <span className="shrink-0 text-right">
          {amount ? <span className="block font-medium tabular-nums">{amount}</span> : null}
          {!item.stopped && !item.lapsed && item.freq !== "once" ? (
            <span className={`block text-sm ${soon ? "font-medium text-clay" : "text-forest"}`}>{dueText(item)}</span>
          ) : null}
        </span>
      </button>

      {item.rise && !item.stopped ? (
        <p className="mt-2 rounded-md bg-clay-soft px-3 py-2 text-sm text-clay">
          Went up from {formatGBP(item.rise.fromPence)} to {formatGBP(item.rise.toPence)} on {shortDay(item.rise.on)}.{" "}
          <Link to="/bills" className="font-medium underline">
            Look for a better deal
          </Link>
        </p>
      ) : null}

      {item.paidAfterStop && item.lastPaid ? (
        <p className="mt-2 rounded-md bg-clay-soft px-3 py-2 text-sm text-clay">
          You said you cancelled this, but it was paid again on {shortDay(item.lastPaid)}. Check with them.
        </p>
      ) : null}

      {open ? (
        <div className="mt-3 border-t border-line pt-3">
          {editing ? (
            <PaymentForm item={item} onDone={() => setEditing(false)} onCancel={() => setEditing(false)} />
          ) : (
            <>
              <p className="text-sm text-muted">
                {item.manual
                  ? "You added this."
                  : `Paid ${item.times} time${item.times === 1 ? "" : "s"}${item.lastPaid ? `, last on ${shortDay(item.lastPaid)}` : ""}.`}
                {item.guessed ? " Pence guessed it comes out every month. Change it if not." : ""}
              </p>
              {item.lapsed ? (
                <p className="mt-2 text-sm">Not paid for longer than usual. Did you cancel it?</p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {item.lapsed ? (
                  <>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={busy}
                      onClick={() => void run(() => saveRegular({ data: { key: item.key, stopped: true } }), "Marked as cancelled")}
                    >
                      Yes, cancelled
                    </button>
                    <button type="button" className="btn btn-quiet" onClick={() => setEditing(true)}>
                      Still paying
                    </button>
                  </>
                ) : item.stopped ? (
                  <button
                    type="button"
                    className="btn btn-quiet"
                    disabled={busy}
                    onClick={() => void run(() => saveRegular({ data: { key: item.key, stopped: false } }), "Back on your list")}
                  >
                    I still pay this
                  </button>
                ) : (
                  <>
                    <button type="button" className="btn btn-quiet" onClick={() => setEditing(true)}>
                      Change
                    </button>
                    <button
                      type="button"
                      className="btn btn-quiet"
                      disabled={busy}
                      onClick={() =>
                        void run(() => saveRegular({ data: { key: item.key, stopped: true } }), `${item.name} marked as cancelled`)
                      }
                    >
                      I’ve cancelled it
                    </button>
                  </>
                )}
                {item.manual ? (
                  <button
                    type="button"
                    className="btn btn-quiet"
                    disabled={busy}
                    onClick={() => void run(() => removeRegular({ data: { key: item.key } }), "Removed")}
                  >
                    Remove
                  </button>
                ) : null}
              </div>
              {!item.stopped ? (
                <>
                  <label className="mt-3 flex min-h-11 items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      className="size-4"
                      checked={item.remind}
                      disabled={busy}
                      onChange={(event) => {
                        const remind = event.target.checked;
                        void run(() => saveRegular({ data: { key: item.key, remind } }));
                      }}
                    />
                    Remind me a week, 3 days and 2 working days before
                  </label>
                  <a
                    href={cancelSearch(item.name)}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex min-h-11 items-center text-sm font-medium text-forest"
                  >
                    How to cancel {item.name}
                  </a>
                </>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </li>
  );
}

function Group({ title, items, note }: { title: string; items: Regular[]; note?: string }) {
  if (items.length === 0) return null;
  return (
    <section className="mt-6">
      <h2 className="font-display text-2xl">{title}</h2>
      {note ? <p className="mt-1 text-sm text-muted">{note}</p> : null}
      <ul className="panel mt-2 divide-y divide-line">
        {items.map((item) => (
          <PaymentRow key={item.key} item={item} />
        ))}
      </ul>
    </section>
  );
}

export function RegularView() {
  const regulars = useRegulars();
  const client = useQueryClient();
  const [adding, setAdding] = useState(false);
  const items = regulars.data?.items ?? [];
  const live = items.filter((item) => !item.stopped && !item.lapsed);
  const warn = live.filter((item) => item.paidAfterStop);
  const soon = live.filter((item) => !item.paidAfterStop && item.daysLeft != null && item.daysLeft <= 7);
  const later = live.filter((item) => !item.paidAfterStop && (item.daysLeft == null || item.daysLeft > 7));
  const lapsed = items.filter((item) => item.lapsed && !item.stopped);
  const stopped = items.filter((item) => item.stopped);

  return (
    <div>
      <PageHead kicker="Money out" title="Regular payments" />

      <section className="panel p-5">
        {regulars.isPending ? (
          <div className="h-16 animate-pulse rounded-md bg-sand" />
        ) : (
          <>
            <p className="text-sm text-muted">About a month</p>
            <p className="mt-1 font-display text-5xl leading-none tabular-nums">{formatGBP(regulars.data?.monthlyPence ?? 0)}</p>
            <p className="mt-2 text-sm text-muted">
              {live.length === 0
                ? "Nothing regular found yet. Every subscription you add shows here."
                : `${live.length} payment${live.length === 1 ? "" : "s"}${soon.length > 0 ? ` · ${soon.length} in the next 7 days` : ""}`}
            </p>
          </>
        )}
        <PhoneAlerts
          what="a week, 3 days and 2 working days before a payment comes out"
          onChange={() => void client.invalidateQueries({ queryKey: ["regulars"] })}
        />
        {adding ? (
          <PaymentForm onDone={() => setAdding(false)} onCancel={() => setAdding(false)} />
        ) : (
          <button type="button" className="btn btn-quiet mt-3 w-full" onClick={() => setAdding(true)}>
            Add a payment or free trial
          </button>
        )}
      </section>

      {regulars.isError ? (
        <p className="mt-4 panel px-4 py-6 text-sm text-clay">{errorText(regulars.error, "Couldn’t load the list.")}</p>
      ) : null}

      <Group title="Check this" items={warn} />
      <Group title="Next 7 days" items={soon} />
      <Group title="Later" items={later} />
      <Group title="Not seen lately" items={lapsed} note="Cancelled, or paid in a way Pence hasn’t seen?" />
      <Group title="Cancelled" items={stopped} />

      {!regulars.isPending && items.length === 0 ? (
        <p className="mt-4 text-sm text-muted">
          Pence lists every payment filed as a subscription, and bills that come back each month.{" "}
          <Link to="/bank" className="font-medium text-forest">
            Bring in a bank statement
          </Link>{" "}
          to find them.
        </p>
      ) : null}
    </div>
  );
}

/** Home card: payments coming out in the next week. */
export function ComingOut({ className = "mt-4" }: { className?: string }) {
  const regulars = useRegulars();
  const items = regulars.data?.items ?? [];
  const live = items.filter((item) => !item.stopped && !item.lapsed);
  const soon = live.filter(
    (item) => item.paidAfterStop || (item.daysLeft != null && item.daysLeft >= 0 && item.daysLeft <= 7),
  );
  if (regulars.isPending || regulars.isError) return null;
  if (soon.length === 0) {
    return (
      <Link to="/regular" className={`panel flex items-center justify-between gap-3 px-4 py-3 ${className}`}>
        <span className="min-w-0">
          <span className="block font-medium">Regular payments</span>
          <span className="block text-sm text-muted">
            {live.length > 0
              ? `${live.length} on your list · about ${formatGBP(regulars.data?.monthlyPence ?? 0)} a month`
              : "Add a free trial, and Pence reminds you before it ends"}
          </span>
        </span>
        <span className="shrink-0 text-sm text-forest">Open</span>
      </Link>
    );
  }
  return (
    <section className={className}>
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="font-display text-2xl">Coming out soon</h2>
        <Link to="/regular" className="text-sm text-forest">
          All regular payments
        </Link>
      </div>
      <ul className="panel divide-y divide-line">
        {soon.slice(0, 3).map((item) => (
          <li key={item.key}>
            <Link to="/regular" className="flex items-baseline justify-between gap-3 px-4 py-3">
              <span className="min-w-0">
                <span className="block truncate font-medium">{item.name}</span>
                <span className={`block text-sm ${item.paidAfterStop || (item.daysLeft ?? 9) <= 3 ? "text-clay" : "text-muted"}`}>
                  {item.paidAfterStop
                    ? "Paid again after you cancelled"
                    : item.freq === "once"
                      ? item.daysLeft === 0
                        ? "Ends today"
                        : `Ends ${shortDay(item.nextDue ?? "")}`
                      : dueText(item)}
                </span>
              </span>
              {item.amountPence > 0 ? (
                <span className="shrink-0 font-medium tabular-nums">{formatGBP(item.amountPence)}</span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
      {soon.length > 3 ? <p className="mt-2 text-sm text-muted">And {soon.length - 3} more this week.</p> : null}
    </section>
  );
}
