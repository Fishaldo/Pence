import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { CATEGORIES, categoryLabel, formatGBP, paySpan, poundsToPence, type CategoryId } from "@/lib/spend/model";
import { lineProgress, NEVER_CUT, suggestBudget, type BudgetLine } from "@/lib/spend/payday";
import { saveBudget } from "@/server/money";
import { useBudget, useLedger } from "./data";
import { useThisPay } from "./this-pay";
import { errorText, PageHead } from "./ui";

type Draft = { key: string; name: string; category: CategoryId | ""; amount: string; neverCut: boolean };

function lineName(line: Pick<BudgetLine, "name" | "category">): string {
  return line.name || (line.category ? categoryLabel(line.category) : "Line");
}

function toDraft(lines: BudgetLine[]): Draft[] {
  return lines.map((line) => ({
    key: line.id,
    name: line.name,
    category: line.category ?? "",
    amount: (line.amountPence / 100).toFixed(0),
    neverCut: line.neverCut,
  }));
}

export function BudgetView() {
  const { profile, txs } = useLedger();
  const budget = useBudget();
  const client = useQueryClient();
  const rows = txs.data ?? [];
  const pay = useThisPay(profile.data, rows);
  const [draft, setDraft] = useState<Draft[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lines = budget.data ?? [];
  const payday = profile.data?.payday ?? null;
  const now = new Date();

  function startFromHistory() {
    const spans = [paySpan(now, payday, -1), paySpan(now, payday, -2), paySpan(now, payday, -3)];
    const suggested = suggestBudget(rows, spans);
    setDraft(
      suggested.length > 0
        ? toDraft(suggested)
        : [{ key: crypto.randomUUID(), name: "", category: "groceries", amount: "", neverCut: false }],
    );
  }

  function update(key: string, change: Partial<Draft>) {
    setDraft((current) => current?.map((row) => (row.key === key ? { ...row, ...change } : row)) ?? null);
  }

  async function save() {
    if (!draft) return;
    const out: Omit<BudgetLine, "id">[] = [];
    for (const row of draft) {
      const amountPence = poundsToPence(row.amount);
      if (!row.category && !row.name.trim()) {
        setError("Give each line a name, like Perfume, or pick a category.");
        return;
      }
      if (!amountPence) {
        setError(`Add an amount for ${row.name.trim() || (row.category ? categoryLabel(row.category) : "each line")}.`);
        return;
      }
      out.push({ name: row.name.trim(), category: row.category || null, amountPence, neverCut: row.neverCut });
    }
    setBusy(true);
    setError("");
    try {
      await saveBudget({ data: { lines: out } });
      await client.invalidateQueries({ queryKey: ["budget"] });
      setDraft(null);
      toast("Budget saved");
    } catch (err) {
      setError(errorText(err, "Couldn’t save the budget."));
    } finally {
      setBusy(false);
    }
  }

  const planned = lines.reduce((sum, line) => sum + line.amountPence, 0);

  if (draft) {
    const draftTotal = draft.reduce((sum, row) => sum + (poundsToPence(row.amount) ?? 0), 0);
    return (
      <div>
        <PageHead
          back="/"
          title="Your budget for this pay"
          sub="Built from your last pays, rounded up to the next £5. Change any amount. Never cut lines, like rent, bills and health, are never suggested for trimming."
        />
        <ul className="mt-4 space-y-3">
          {draft.map((row) => (
            <li key={row.key} className="panel p-4">
              <div className="grid grid-cols-[1fr_7rem] gap-2">
                <label className="field">
                  <span className="field-label">What</span>
                  <select
                    className="control"
                    value={row.category}
                    onChange={(event) => {
                      const category = event.target.value as CategoryId | "";
                      update(row.key, { category, neverCut: category ? NEVER_CUT.has(category) : row.neverCut });
                    }}
                  >
                    <option value="">My own line</option>
                    {CATEGORIES.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span className="field-label">£ a pay</span>
                  <input className="control tabular-nums" inputMode="decimal" value={row.amount} onChange={(event) => update(row.key, { amount: event.target.value })} />
                </label>
              </div>
              {row.category === "" ? (
                <label className="field mt-2">
                  <span className="field-label">Name</span>
                  <input className="control" placeholder="Perfume, medication, driving lessons" value={row.name} onChange={(event) => update(row.key, { name: event.target.value })} />
                </label>
              ) : null}
              <div className="mt-2 flex items-center justify-between gap-3">
                <label className="flex min-h-11 items-center gap-2 text-sm">
                  <input type="checkbox" className="size-4" checked={row.neverCut} onChange={(event) => update(row.key, { neverCut: event.target.checked })} />
                  Never cut
                </label>
                <button type="button" className="link text-muted" onClick={() => setDraft((current) => current?.filter((r) => r.key !== row.key) ?? null)}>
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="btn btn-quiet mt-3 w-full"
          onClick={() => setDraft((current) => [...(current ?? []), { key: crypto.randomUUID(), name: "", category: "", amount: "", neverCut: false }])}
        >
          Add a line
        </button>
        <p className="mt-4 text-sm">
          {formatGBP(draftTotal)} planned
          {pay.takeHomePence > 0 ? ` of ${formatGBP(pay.takeHomePence)} take-home` : ""}.
          {pay.takeHomePence > 0 && draftTotal > pay.takeHomePence ? (
            <span className="text-clay"> That is more than you take home.</span>
          ) : null}
        </p>
        {error ? <p className="mt-2 text-sm text-clay">{error}</p> : null}
        <div className="mt-4 flex flex-col gap-2">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>
            {busy ? "Saving…" : "Save budget"}
          </button>
          <button type="button" className="btn btn-quiet" onClick={() => setDraft(null)}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHead back="/" title="Your budget for this pay" sub="Built from your last pays. Change any line." />
      {budget.isPending ? <div className="h-32 animate-pulse rounded-[1.125rem] bg-sand" /> : null}
      {!budget.isPending && lines.length === 0 ? (
        <section className="panel p-5">
          <p className="section-title">No budget yet</p>
          <p className="mt-2 text-sm text-muted">Pence can make one from what you spent in your last pays. You change any line.</p>
          <button type="button" className="btn btn-primary mt-4" onClick={startFromHistory}>
            Make my budget
          </button>
        </section>
      ) : null}
      {lines.length > 0 ? (
        <>
          <ul className="rows">
            {lines.map((line) => {
              const progress = lineProgress(line, rows, pay.span);
              const share = line.amountPence > 0 ? Math.min(1, progress.spentPence / line.amountPence) : 0;
              return (
                <li key={line.id} className="px-4 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-[0.9375rem] font-bold">{lineName(line)}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      {line.neverCut ? <span className="badge">Never cut</span> : null}
                      <span className="text-[0.9375rem] font-extrabold tabular-nums">{formatGBP(line.amountPence)}</span>
                    </span>
                  </div>
                  {line.category ? (
                    <>
                      <div className="track mt-2 h-1.5" aria-hidden="true">
                        <span className={progress.over ? "bg-clay" : ""} style={{ width: `${Math.max(2, share * 100)}%`, ...(progress.over ? { background: "var(--color-clay)" } : {}) }} />
                      </div>
                      <p className={`mt-1 text-sm ${progress.over ? "text-clay" : "text-muted"}`}>
                        {progress.over
                          ? `${formatGBP(progress.spentPence)} spent, ${formatGBP(-progress.leftPence)} over this pay`
                          : `${formatGBP(progress.spentPence)} spent, ${formatGBP(progress.leftPence)} left this pay`}
                      </p>
                    </>
                  ) : (
                    <p className="mt-1 text-sm text-muted">Your own line. Pence keeps it in the plan.</p>
                  )}
                </li>
              );
            })}
          </ul>
          <section className="panel mt-4 flex flex-col gap-1.5 p-4" aria-label="Totals">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[0.9375rem] font-bold">Planned</span>
              <span className="text-[0.9375rem] font-extrabold tabular-nums">
                {formatGBP(planned)}
                {pay.takeHomePence > 0 ? ` of ${formatGBP(pay.takeHomePence)}` : ""}
              </span>
            </div>
            {pay.takeHomePence > 0 ? (
              <span className={`text-[0.8125rem] ${planned > pay.takeHomePence ? "font-semibold text-clay" : "text-muted"}`}>
                {planned <= pay.takeHomePence
                  ? `${formatGBP(pay.takeHomePence - planned)} not planned yet. Put some into savings?`
                  : `${formatGBP(planned - pay.takeHomePence)} more than your take-home.`}
              </span>
            ) : null}
          </section>
          <button type="button" className="btn btn-quiet mt-4 w-full" onClick={() => setDraft(toDraft(lines))}>
            Change the budget
          </button>
        </>
      ) : null}
    </div>
  );
}
