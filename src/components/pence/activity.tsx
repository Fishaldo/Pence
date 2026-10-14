import { ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  CATEGORIES,
  categoryLabel,
  countsAsSpending,
  dayLabel,
  formatGBP,
  poundsToPence,
  todayISO,
  type CategoryId,
  type Tx,
} from "@/lib/core/model";
import { dayNum, isoOf } from "@/lib/core/habits";
import { descKey } from "@/lib/core/payee";
import { deleteSpend, updateSpend } from "@/server/ledger";
import { useLedger, useRefreshLedger } from "./data";
import { ItemsEditor, type DraftItem } from "./items-editor";
import { PageHead } from "./ui";
import { errorText } from "./error-text";

const PERIODS = [
  { id: "1w", label: "1 week", days: 7 },
  { id: "1m", label: "1 month", days: 31 },
  { id: "3m", label: "3 months", days: 92 },
  { id: "6m", label: "6 months", days: 183 },
  { id: "1y", label: "1 year", days: 366 },
  { id: "all", label: "All time", days: 0 },
] as const;

type PeriodId = (typeof PERIODS)[number]["id"];

/** Everything a search can match: shop, statement text, items, note and category. */
function searchText(tx: Tx): string {
  return [tx.merchant, tx.description, tx.note, categoryLabel(tx.category), ...tx.items.map((item) => item.name)].join(" ").toLowerCase();
}

export function ActivityView() {
  const { txs } = useLedger();
  const [category, setCategory] = useState<CategoryId | "all">("all");
  const [period, setPeriod] = useState<PeriodId>("all");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Tx | null>(null);

  const rows = useMemo(() => txs.data ?? [], [txs.data]);
  const today = todayISO(new Date());
  const days = PERIODS.find((item) => item.id === period)?.days ?? 0;
  const from = days > 0 ? isoOf(dayNum(today) - days + 1) : "";
  const filtered = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return rows.filter((row) => {
      if (category !== "all" && row.category !== category) return false;
      if (from && row.spentOn < from) return false;
      if (words.length > 0) {
        const hay = searchText(row);
        if (!words.every((word) => hay.includes(word))) return false;
      }
      return true;
    });
  }, [rows, category, from, query]);
  const spent = filtered.filter((row) => countsAsSpending(row.category));
  const spentTotal = spent.reduce((sum, row) => sum + row.amountPence, 0);
  const movedTotal = filtered.filter((row) => !countsAsSpending(row.category)).reduce((sum, row) => sum + row.amountPence, 0);

  const groups: { label: string; items: Tx[] }[] = [];
  for (const row of filtered) {
    const label = dayLabel(row.spentOn);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(row);
    else groups.push({ label, items: [row] });
  }

  if (txs.isPending) return <div className="h-64 animate-pulse rounded-lg bg-sand" />;

  return (
    <div>
      <PageHead
        back="/"
        title="Activity"
        action={
          <label className="relative shrink-0">
            <span className="sr-only">Time range</span>
            <select
              className="chip appearance-none pr-9"
              value={period}
              onChange={(event) => setPeriod(event.target.value as PeriodId)}
            >
              {PERIODS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
            <ChevronDown
              className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2"
              strokeWidth={2.2}
              aria-hidden="true"
            />
          </label>
        }
      />
      <label className="mb-3 block">
        <span className="field-label">Search</span>
        <input
          className="control"
          type="search"
          placeholder="Shop, item or note, like Uber or nappies"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <div className="-mx-5 mb-4 flex gap-2 overflow-x-auto px-5 pb-1" role="group" aria-label="Category">
        <Filter on={category === "all"} onClick={() => setCategory("all")}>
          All
        </Filter>
        {CATEGORIES.filter((item) => rows.some((row) => row.category === item.id)).map((item) => (
          <Filter key={item.id} on={category === item.id} onClick={() => setCategory(item.id)}>
            {item.label}
          </Filter>
        ))}
      </div>
      <p className="panel mb-4 px-4 py-3" aria-live="polite">
        <span className="block text-[1.75rem] font-extrabold tracking-[-0.02em] tabular-nums">{formatGBP(spentTotal)}</span>
        <span className="block text-sm text-muted">
          {spent.length} spend{spent.length === 1 ? "" : "s"}
          {query.trim() ? ` matching “${query.trim()}”` : ""}
          {period === "all" ? ", all time" : `, last ${PERIODS.find((item) => item.id === period)?.label}`}
          {movedTotal > 0 ? `. Plus ${formatGBP(movedTotal)} saved, invested or moved.` : "."}
        </span>
      </p>

      {filtered.length === 0 ? (
        <p className="panel px-4 py-8 text-center text-sm text-muted">No spends in this view yet.</p>
      ) : (
        <div className="space-y-5">
          {groups.map((group) => (
            <section key={group.label}>
              <h2 className="mb-2 text-[0.8125rem] font-bold text-muted">{group.label}</h2>
              <ul className="rows">
                {group.items.map((tx) => (
                  <li key={tx.id}>
                    <button
                      type="button"
                      className="row w-full text-left"
                      onClick={() => setEditing(tx)}
                    >
                      <span aria-hidden="true" className={countsAsSpending(tx.category) ? "initial" : "initial initial-blue"}>
                        {(tx.merchant.trim().charAt(0) || "·").toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[0.9375rem] font-bold">{tx.merchant}</span>
                        <span className="block truncate text-[0.8125rem] text-muted">
                          {categoryLabel(tx.category)}
                          {tx.items.length > 0 && !tx.hasReceipt ? ` · ${tx.items.length} item${tx.items.length === 1 ? "" : "s"}` : ""}
                          {tx.source === "wallet" && !tx.hasReceipt ? " · wallet, no receipt" : ""}
                          {tx.source === "bank" ? " · bank, no receipt" : ""}
                          {tx.hasReceipt ? " · receipt" : ""}
                          {tx.isSample ? " · sample" : ""}
                        </span>
                      </span>
                      <span className={`shrink-0 text-[0.9375rem] font-extrabold tabular-nums ${countsAsSpending(tx.category) ? "" : "text-saved"}`}>
                        {formatGBP(tx.amountPence)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {editing ? <SpendDialog tx={editing} all={rows} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function Filter({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className="chip shrink-0"
    >
      {children}
    </button>
  );
}

function toDraft(items: Tx["items"]): DraftItem[] {
  return items.map((item) => ({ name: item.name, amount: item.amountPence > 0 ? (item.amountPence / 100).toFixed(2) : "" }));
}

function fromDraft(items: DraftItem[]): Tx["items"] {
  return items
    .filter((item) => item.name.trim())
    .slice(0, 40)
    .map((item) => ({ name: item.name.trim().slice(0, 80), amountPence: poundsToPence(item.amount) ?? 0 }));
}

function SpendDialog({ tx, all, onClose }: { tx: Tx; all: Tx[]; onClose: () => void }) {
  const refresh = useRefreshLedger();
  const [merchant, setMerchant] = useState(tx.merchant);
  const [amount, setAmount] = useState((tx.amountPence / 100).toFixed(2));
  const [category, setCategory] = useState<CategoryId>(tx.category);
  const [spentOn, setSpentOn] = useState(tx.spentOn);
  const [note, setNote] = useState(tx.note);
  const [items, setItems] = useState<DraftItem[]>(() => toDraft(tx.items));
  const [applyToSame, setApplyToSame] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const key = descKey(tx.description || tx.merchant);
  const same = key ? all.filter((row) => row.id !== tx.id && descKey(row.description || row.merchant) === key).length : 0;
  const changedPayee = merchant.trim() !== tx.merchant || category !== tx.category;
  const printed = tx.description && tx.description !== tx.merchant ? tx.description : "";

  async function save() {
    const amountPence = poundsToPence(amount);
    if (!amountPence) {
      setError("Enter an amount like 12.40.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await updateSpend({
        data: {
          id: tx.id,
          merchant: merchant.trim(),
          description: tx.description,
          amountPence,
          category,
          spentOn,
          source: tx.source,
          hasReceipt: tx.hasReceipt,
          note,
          items: fromDraft(items),
          rawAlert: tx.rawAlert,
          alertId: null,
          applyToSame: changedPayee && applyToSame,
        },
      });
      await refresh();
      toast(
        result.alsoChanged > 0
          ? `Saved, and ${result.alsoChanged} other payment${result.alsoChanged === 1 ? "" : "s"} changed too`
          : "Spend updated",
      );
      onClose();
    } catch (err) {
      setError(errorText(err, "Couldn’t update that."));
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await deleteSpend({ data: { id: tx.id } });
      await refresh();
      toast("Spend removed");
      onClose();
    } catch (err) {
      setError(errorText(err, "Couldn’t remove that."));
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-[#6e7671]/80 md:items-center md:p-3" role="presentation" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="spend-title"
        className="max-h-[90dvh] w-full max-w-[560px] overflow-y-auto rounded-t-3xl bg-card px-5 pt-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] md:rounded-3xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="initial size-12 text-lg">{(tx.merchant.trim().charAt(0) || "·").toUpperCase()}</span>
          <div className="min-w-0 flex-1">
            <h2 id="spend-title" className="truncate text-xl font-extrabold">
              {tx.merchant}
            </h2>
            <p className="text-[0.8125rem] text-muted">
              {dayLabel(tx.spentOn)} · {formatGBP(tx.amountPence)}
            </p>
          </div>
        </div>
        {printed ? (
          <p className="mt-1 text-sm text-muted">
            On your statement: <span className="font-bold text-ink">{printed}</span>
          </p>
        ) : null}
        <div className="mt-4 space-y-3">
          <label className="field">
            <span className="field-label">Amount (£)</span>
            <input className="control tabular-nums" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Shop or payee</span>
            <input className="control" value={merchant} onChange={(e) => setMerchant(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Category</span>
            <select className="control" value={category} onChange={(e) => setCategory(e.target.value as CategoryId)}>
              {CATEGORIES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          {changedPayee ? (
            <label className="flex items-start gap-3 rounded-xl bg-mist px-3 py-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-5 shrink-0 accent-[var(--color-forest)]"
                checked={applyToSame}
                onChange={(event) => setApplyToSame(event.target.checked)}
              />
              <span>
                {same > 0
                  ? `Also change the ${same} other payment${same === 1 ? "" : "s"} like this, and future ones.`
                  : "Use this for future payments like this too."}
                <span className="block text-muted">Untick to change only this one.</span>
              </span>
            </label>
          ) : null}
          <ItemsEditor
            items={items}
            onChange={setItems}
            label={tx.hasReceipt ? "Items on the receipt" : "What did you buy?"}
            hint={
              tx.hasReceipt
                ? ""
                : "Add what you bought, like bread or nappies. Pence learns your habits from it. Prices are optional."
            }
            totalPence={poundsToPence(amount)}
          />
          <label className="field">
            <span className="field-label">Date</span>
            <input className="control" type="date" value={spentOn} onChange={(e) => setSpentOn(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Note</span>
            <input className="control" value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <p className="text-sm text-muted">
            {tx.hasReceipt ? "Read from a receipt. Pence keeps the details, not the photo." : "No receipt."}
          </p>
          {error ? <p className="text-sm text-clay">{error}</p> : null}
        </div>
        <div className="mt-4 flex flex-col gap-2">
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
            Save changes
          </button>
          <button type="button" className="btn btn-quiet" onClick={remove} disabled={busy}>
            Delete spend
          </button>
          <button type="button" className="btn btn-quiet" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
