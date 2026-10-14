import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { CATEGORIES, categoryLabel, formatGBP, paySpan, poundsToPence, type CategoryId } from "@/lib/core/model";
import {
  fitBudget,
  lineProgress,
  NEVER_CUT,
  suggestBudget,
  usualByCategory,
  type BudgetLine,
  type BudgetPlan,
  type PlannedLine,
} from "@/lib/core/budget";
import { saveBudget } from "@/server/money";
import { useBudget, useLedger } from "./data";
import { useThisPay } from "./this-pay";
import { errorText, PageHead } from "./ui";

type Draft = { key: string; name: string; category: CategoryId | ""; amount: string; neverCut: boolean; usualPence?: number };

const SAVING = new Set<CategoryId | null>(["savings", "investments"]);

function lineName(line: Pick<BudgetLine, "name" | "category">): string {
  return line.name || (line.category ? categoryLabel(line.category) : "Line");
}

function toDraft(lines: (BudgetLine | PlannedLine)[]): Draft[] {
  return lines.map((line) => ({
    key: line.id,
    name: line.name,
    category: line.category ?? "",
    amount: (line.amountPence / 100).toFixed(0),
    neverCut: line.neverCut,
    usualPence: "usualPence" in line ? line.usualPence : undefined,
  }));
}

/**
 * This pay's budget. On Plan it sits under the "Budget" choice (`embedded`);
 * the older /budget address shows it on its own page.
 */
export function BudgetView({ embedded = false }: { embedded?: boolean }) {
  const { profile, txs } = useLedger();
  const budget = useBudget();
  const client = useQueryClient();
  const rows = txs.data ?? [];
  const pay = useThisPay(profile.data, rows);
  const [draft, setDraft] = useState<Draft[] | null>(null);
  const [plan, setPlan] = useState<BudgetPlan | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lines = budget.data ?? [];
  const payday = profile.data?.payday ?? null;
  const now = new Date();
  const spans = [paySpan(now, payday, -1), paySpan(now, payday, -2), paySpan(now, payday, -3)];

  function startFromHistory() {
    const made = suggestBudget(rows, spans, pay.takeHomePence);
    setPlan(made.lines.length > 0 ? made : null);
    setError("");
    setDraft(
      made.lines.length > 0
        ? toDraft(made.lines)
        : [{ key: crypto.randomUUID(), name: "", category: "groceries", amount: "", neverCut: false }],
    );
  }

  function fitToTakeHome() {
    const usual = usualByCategory(rows, spans);
    const fitted = fitBudget(lines, pay.takeHomePence, usual.savingsPence + usual.investmentsPence);
    setPlan(fitted);
    setError("");
    setDraft(toDraft(fitted.lines));
  }

  function update(key: string, change: Partial<Draft>) {
    setDraft((current) => current?.map((row) => (row.key === key ? { ...row, ...change } : row)) ?? null);
  }

  function close() {
    setDraft(null);
    setPlan(null);
    setError("");
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
      close();
      toast("Budget saved");
    } catch (err) {
      setError(errorText(err, "Couldn’t save the budget."));
    } finally {
      setBusy(false);
    }
  }

  const planned = lines.reduce((sum, line) => sum + line.amountPence, 0);
  const takeHome = pay.takeHomePence;
  const head = (sub: string) =>
    embedded ? <p className="mb-4 text-sm leading-[1.45] text-muted">{sub}</p> : <PageHead back="/plan" title="Your budget for this pay" sub={sub} />;

  if (draft) {
    const draftTotal = draft.reduce((sum, row) => sum + (poundsToPence(row.amount) ?? 0), 0);
    return (
      <div>
        {head("Built from your last pays and fitted to your take-home, with savings first. Change any amount.")}
        {plan ? <PlanSummary plan={plan} /> : null}
        <ul className="mt-4 space-y-3">
          {draft.map((row) => {
            const typed = poundsToPence(row.amount) ?? 0;
            const usual = row.usualPence ?? 0;
            const saving = SAVING.has(row.category || null);
            return (
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
                    <input
                      className="control tabular-nums"
                      inputMode="decimal"
                      value={row.amount}
                      onChange={(event) => update(row.key, { amount: event.target.value })}
                    />
                  </label>
                </div>
                {saving ? (
                  <p className="mt-2 text-[0.8125rem] text-saved">
                    Put away first, on payday.
                    {usual >= 100 ? ` You usually ${row.category === "investments" ? "invest" : "save"} ${formatGBP(Math.round(usual / 100) * 100)} a pay.` : " You haven’t been saving yet."}
                  </p>
                ) : usual >= 500 && Math.abs(usual - typed) >= 500 ? (
                  <p className="mt-2 text-[0.8125rem] text-muted">Usually {formatGBP(Math.round(usual / 100) * 100)} a pay</p>
                ) : null}
                {row.category === "" ? (
                  <label className="field mt-2">
                    <span className="field-label">Name</span>
                    <input
                      className="control"
                      placeholder="Perfume, medication, driving lessons"
                      value={row.name}
                      onChange={(event) => update(row.key, { name: event.target.value })}
                    />
                  </label>
                ) : null}
                <div className="mt-2 flex items-center justify-between gap-3">
                  {saving ? (
                    <span />
                  ) : (
                    <label className="flex min-h-11 items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="size-4"
                        checked={row.neverCut}
                        onChange={(event) => update(row.key, { neverCut: event.target.checked })}
                      />
                      Never cut
                    </label>
                  )}
                  <button
                    type="button"
                    className="link text-muted"
                    onClick={() => setDraft((current) => current?.filter((r) => r.key !== row.key) ?? null)}
                  >
                    Remove
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          className="btn btn-quiet mt-3 w-full"
          onClick={() => setDraft((current) => [...(current ?? []), { key: crypto.randomUUID(), name: "", category: "", amount: "", neverCut: false }])}
        >
          Add a line
        </button>
        <p className="mt-4 text-sm" aria-live="polite">
          {formatGBP(draftTotal)} planned
          {takeHome > 0 ? ` of ${formatGBP(takeHome)} take-home` : ""}.
          {takeHome > 0 && draftTotal > takeHome ? <span className="text-clay"> That is more than you take home.</span> : null}
          {takeHome > 0 && draftTotal < takeHome ? <span className="text-muted"> {formatGBP(takeHome - draftTotal)} spare.</span> : null}
        </p>
        {error ? <p className="mt-2 text-sm text-clay">{error}</p> : null}
        <div className="mt-4 flex flex-col gap-2">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>
            {busy ? "Saving…" : "Save budget"}
          </button>
          <button type="button" className="btn btn-quiet" onClick={close}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {head("This pay’s plan for your take-home, with savings first. Change any line.")}
      {budget.isPending ? <div className="h-32 animate-pulse rounded-[1.125rem] bg-sand" /> : null}
      {!budget.isPending && lines.length === 0 ? (
        <section className="panel p-5">
          <p className="section-title">No budget yet</p>
          <p className="mt-2 text-sm text-muted">
            Pence makes one from what you spent in your last pays, fitted to your take-home, with money put away first. You change any line.
          </p>
          <button type="button" className="btn btn-primary mt-4" onClick={startFromHistory}>
            Make my budget
          </button>
        </section>
      ) : null}
      {lines.length > 0 ? (
        <>
          {takeHome > 0 && planned > takeHome ? (
            <section className="panel mb-4 flex flex-col gap-2 border-clay p-4" aria-label="Over your take-home">
              <p className="text-sm font-bold text-clay">
                This budget is {formatGBP(planned - takeHome)} more than your {formatGBP(takeHome)} take-home.
              </p>
              <p className="text-sm text-muted">Pence can fit it: savings first, rent and bills kept, the lines that bend most trimmed most.</p>
              <button type="button" className="btn btn-primary" onClick={fitToTakeHome}>
                Fit it to my take-home
              </button>
            </section>
          ) : null}
          <ul className="rows">
            {lines.map((line) => {
              const progress = lineProgress(line, rows, pay.span);
              const share = line.amountPence > 0 ? Math.min(1, progress.spentPence / line.amountPence) : 0;
              const saving = SAVING.has(line.category);
              return (
                <li key={line.id} className="px-4 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-[0.9375rem] font-bold">{lineName(line)}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      {line.neverCut && !saving ? <span className="badge">Never cut</span> : null}
                      <span className="text-[0.9375rem] font-extrabold tabular-nums">{formatGBP(line.amountPence)}</span>
                    </span>
                  </div>
                  {line.category ? (
                    <>
                      <div className="track mt-2 h-1.5" aria-hidden="true">
                        <span
                          style={{
                            width: `${Math.max(2, share * 100)}%`,
                            ...(saving ? { background: "var(--color-saved)" } : progress.over ? { background: "var(--color-clay)" } : {}),
                          }}
                        />
                      </div>
                      <p className={`mt-1 text-sm ${!saving && progress.over ? "text-clay" : "text-muted"}`}>
                        {saving
                          ? progress.spentPence >= line.amountPence
                            ? `Done: ${formatGBP(progress.spentPence)} put away this pay`
                            : `${formatGBP(progress.spentPence)} put away, ${formatGBP(progress.leftPence)} to go this pay`
                          : progress.over
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
                {takeHome > 0 ? ` of ${formatGBP(takeHome)}` : ""}
              </span>
            </div>
            {takeHome > 0 ? (
              <span className={`text-[0.8125rem] ${planned > takeHome ? "font-semibold text-clay" : "text-muted"}`}>
                {planned <= takeHome
                  ? `${formatGBP(takeHome - planned)} spare for the unexpected.`
                  : `${formatGBP(planned - takeHome)} more than your take-home.`}
              </span>
            ) : null}
          </section>
          <div className="mt-4 flex flex-col gap-2">
            <button type="button" className="btn btn-quiet w-full" onClick={() => setDraft(toDraft(lines))}>
              Change the budget
            </button>
            <button type="button" className="btn btn-quiet w-full" onClick={startFromHistory}>
              Make it again from my pays
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

/** What Pence did to make the plan fit, in plain words. */
function PlanSummary({ plan }: { plan: BudgetPlan }) {
  if (plan.takeHomePence <= 0) {
    return (
      <p className="panel p-4 text-sm text-muted">
        Add your take-home in Settings and Pence will fit this to it, with savings first.
      </p>
    );
  }
  const everyday = plan.lines.filter((line) => line.kind === "flexible").reduce((sum, line) => sum + line.amountPence, 0);
  const usualSpend = plan.lines.filter((line) => line.kind !== "savings").reduce((sum, line) => sum + line.usualPence, 0);
  const saved = Math.round(plan.usualSavingsPence / 100) * 100;
  const rows: [string, number][] = [
    ["Savings", plan.savingsPence],
    ["Never cut: rent, bills and the like", plan.fixedPence],
    ["Everyday spending", everyday],
  ];
  if (plan.sparePence > 0) rows.push(["Spare", plan.sparePence]);
  return (
    <section className="panel flex flex-col gap-3 p-4" aria-label="How Pence made this budget">
      <p className="text-[0.9375rem] font-bold">
        {formatGBP(plan.plannedPence)} planned of your {formatGBP(plan.takeHomePence)} take-home
      </p>
      <dl className="flex flex-col gap-1.5 text-sm">
        {rows.map(([label, pence]) => (
          <div key={label} className="flex items-baseline justify-between gap-3">
            <dt className={label === "Savings" ? "font-bold text-saved" : "text-ink-soft"}>{label}</dt>
            <dd className={`tabular-nums ${label === "Savings" ? "font-extrabold text-saved" : "font-bold"}`}>{formatGBP(pence)}</dd>
          </div>
        ))}
      </dl>
      <p className="text-sm leading-[1.45] text-ink-soft">
        {saved > 0
          ? plan.savingsPence > saved
            ? `You usually put away ${formatGBP(saved)} a pay. This plan puts away ${formatGBP(plan.savingsPence)}.`
            : `You usually put away ${formatGBP(saved)} a pay. This plan keeps that.`
          : plan.savingsPence > 0
            ? `You haven’t been putting money away. This plan starts with ${formatGBP(plan.savingsPence)} a pay.`
            : "There is no room to put money away this pay."}
      </p>
      {plan.trimmed.length > 0 ? (
        <div className="flex flex-col gap-1">
          <p className="text-sm font-bold">To fit, Pence trimmed</p>
          <ul className="flex flex-col gap-1 text-sm">
            {plan.trimmed.slice(0, 6).map((row) => (
              <li key={row.name} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-ink-soft">{row.name}</span>
                <span className="shrink-0 tabular-nums">
                  <span className="text-muted line-through">{formatGBP(row.fromPence)}</span> {formatGBP(row.toPence)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {plan.fixedOver ? (
        <p className="text-sm leading-[1.45] text-clay">
          Rent, bills and your other never-cut lines are more than your take-home on their own. Check the take-home in Settings, or untick Never cut on
          anything that can change.
        </p>
      ) : plan.tight ? (
        <p className="text-sm leading-[1.45] text-clay">
          You usually spend {formatGBP(Math.round(usualSpend / 100) * 100)} a pay, more than your take-home. To fit, the lines that can bend go well below
          usual. Check your take-home in Settings is right, and tick Never cut on anything you can’t change.
        </p>
      ) : null}
    </section>
  );
}
