import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  CATEGORIES,
  categoryLabel,
  dayLabel,
  formatGBP,
  monthKey,
  monthLabel,
  poundsToPence,
  type CategoryId,
  type Tx,
} from "@/lib/spend/model";
import { descKey } from "@/lib/spend/payee";
import { deleteSpend, getReceipt, updateSpend } from "@/server/ledger";
import { useLedger, useRefreshLedger } from "./data";
import { ItemsEditor, type DraftItem } from "./items-editor";
import { errorText, PageHead } from "./ui";

export function ActivityView() {
  const { txs } = useLedger();
  const [category, setCategory] = useState<CategoryId | "all">("all");
  const [month, setMonth] = useState("all");
  const [editing, setEditing] = useState<Tx | null>(null);

  const rows = txs.data ?? [];
  const months = useMemo(() => {
    const keys = new Set<string>();
    for (const row of rows) keys.add(row.spentOn.slice(0, 7));
    keys.add(monthKey(new Date()));
    return [...keys].sort().reverse();
  }, [rows]);

  const filtered = rows.filter((row) => {
    if (category !== "all" && row.category !== category) return false;
    if (month !== "all" && !row.spentOn.startsWith(month)) return false;
    return true;
  });

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
      <PageHead kicker="Ledger" title="Activity" />
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        <Filter on={category === "all"} onClick={() => setCategory("all")}>
          All
        </Filter>
        {CATEGORIES.filter((item) => rows.some((row) => row.category === item.id)).map((item) => (
          <Filter key={item.id} on={category === item.id} onClick={() => setCategory(item.id)}>
            {item.label}
          </Filter>
        ))}
      </div>
      <label className="mb-4 block">
        <span className="field-label">Month</span>
        <select className="control" value={month} onChange={(e) => setMonth(e.target.value)}>
          <option value="all">Every month</option>
          {months.map((key) => (
            <option key={key} value={key}>
              {monthLabel(key)}
            </option>
          ))}
        </select>
      </label>

      {filtered.length === 0 ? (
        <p className="panel px-4 py-8 text-center text-sm text-muted">No spends in this view yet.</p>
      ) : (
        <div className="space-y-5">
          {groups.map((group) => (
            <section key={group.label}>
              <h2 className="mb-2 text-sm text-muted">{group.label}</h2>
              <ul className="panel divide-y divide-line">
                {group.items.map((tx) => (
                  <li key={tx.id}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                      onClick={() => setEditing(tx)}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{tx.merchant}</span>
                        <span className="block text-sm text-muted">
                          {categoryLabel(tx.category)}
                          {tx.items.length > 0 && !tx.hasReceipt ? ` · ${tx.items.length} item${tx.items.length === 1 ? "" : "s"}` : ""}
                          {tx.source === "wallet" && !tx.hasReceipt ? " · wallet, no receipt" : ""}
                          {tx.source === "bank" ? " · bank, no receipt" : ""}
                          {tx.hasReceipt ? " · receipt" : ""}
                          {tx.isSample ? " · sample" : ""}
                        </span>
                      </span>
                      <span className="tabular-nums">{formatGBP(tx.amountPence)}</span>
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
      className={`h-10 shrink-0 rounded-full px-3 text-sm ${on ? "bg-forest text-foam" : "border border-line bg-card text-ink"}`}
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
  const [image, setImage] = useState<string | null>(null);

  const key = descKey(tx.description || tx.merchant);
  const same = key ? all.filter((row) => row.id !== tx.id && descKey(row.description || row.merchant) === key).length : 0;
  const changedPayee = merchant.trim() !== tx.merchant || category !== tx.category;
  const printed = tx.description && tx.description !== tx.merchant ? tx.description : "";

  async function showReceipt() {
    setBusy(true);
    try {
      const result = await getReceipt({ data: { id: tx.id } });
      setImage(result.image);
      if (!result.image) setError("The photo wasn’t kept for this spend.");
    } catch (err) {
      setError(errorText(err, "Couldn’t open the receipt."));
    } finally {
      setBusy(false);
    }
  }

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
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 p-3 md:items-center" role="presentation" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="spend-title"
        className="panel max-h-[90dvh] w-full max-w-md overflow-y-auto p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="spend-title" className="font-display text-3xl">
          Edit spend
        </h2>
        {printed ? (
          <p className="mt-1 text-sm text-muted">
            On your statement: <span className="font-medium text-ink">{printed}</span>
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
            <label className="flex items-start gap-3 rounded-md bg-mist px-3 py-3 text-sm">
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
          {tx.hasReceipt ? (
            <button type="button" className="text-sm font-medium text-forest" onClick={showReceipt} disabled={busy}>
              View receipt photo
            </button>
          ) : (
            <p className="text-sm text-muted">No receipt attached.</p>
          )}
          {image ? <img src={image} alt="Receipt" className="max-h-64 w-full rounded-md object-contain" /> : null}
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
