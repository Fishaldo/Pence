import { useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { CATEGORIES, formatGBP, type CategoryId } from "@/lib/spend/model";
import { parseMoneyIn, parseStatement, type StatementRow } from "@/lib/spend/statement";
import type { MoneyIn } from "@/lib/spend/payday";
import { deleteSpend, findClashes, importBank, type Clash } from "@/server/ledger";
import { SamePayment, type ClashChoice } from "./clash";
import { useLedger, useRefreshLedger } from "./data";
import { PaySpotted } from "./money-cards";
import { errorText, PageHead } from "./ui";

export function BankView() {
  const navigate = useNavigate();
  const refresh = useRefreshLedger();
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [rows, setRows] = useState<StatementRow[] | null>(null);
  const [moneyIn, setMoneyIn] = useState<MoneyIn[]>([]);
  const { profile } = useLedger();
  const [clashes, setClashes] = useState<Clash[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function readText(value: string) {
    setText(value);
    setError("");
    const parsed = parseStatement(value);
    setRows(parsed.length > 0 ? parsed : null);
    setMoneyIn(parseMoneyIn(value));
    if (value.trim() && parsed.length === 0) {
      setError("No outgoing spends in that. Income and money in are left out.");
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    const body = await file.text();
    readText(body);
  }

  function setCategory(index: number, category: CategoryId) {
    setRows((current) => current?.map((row, i) => (i === index ? { ...row, category } : row)) ?? null);
  }

  async function fileRows(nextRows = rows, checked = false) {
    if (!nextRows || nextRows.length === 0) return;
    setBusy(true);
    setError("");
    try {
      if (!checked) {
        const found = await findClashes({ data: { rows: nextRows } });
        if (found.length > 0) {
          setRows(nextRows);
          setClashes(found);
          setBusy(false);
          return;
        }
      }
      const result = await importBank({ data: { rows: nextRows } });
      await refresh();
      setClashes(null);
      toast(result.added === 0 ? "Nothing new to file" : `Filed ${result.added} from your bank`);
      if (result.added > 0) void navigate({ to: "/" });
    } catch (err) {
      setError(errorText(err, "Couldn’t file those spends."));
    } finally {
      setBusy(false);
    }
  }

  async function resolve(choices: ClashChoice[]) {
    if (!rows || !clashes) return;
    setBusy(true);
    setError("");
    try {
      for (let index = 0; index < clashes.length; index += 1) {
        const clash = clashes[index];
        if (choices[index] === "replace" && clash.existingId) {
          await deleteSpend({ data: { id: clash.existingId } });
        }
      }
      const drop = new Set(clashes.filter((_, index) => choices[index] === "drop").map((clash) => clash.index));
      const keep = rows.filter((_, index) => !drop.has(index));
      if (keep.length === 0) {
        await refresh();
        setClashes(null);
        setRows(null);
        setText("");
        toast("Kept the payments already in Pence");
        setBusy(false);
        return;
      }
      await fileRows(keep, true);
    } catch (err) {
      setError(errorText(err, "Couldn’t update those payments."));
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHead kicker="Bank" title="From your bank" />
      {moneyIn.length > 0 ? (
        <div className="mb-4">
          <PaySpotted rows={moneyIn} usualPence={profile.data?.monthlyIncomePence ?? 0} />
        </div>
      ) : null}
      <p className="mb-4 text-sm text-muted">
        New payments can only arrive on their own through Open Banking: you approve Pence inside your bank’s own app. This app does not have that connection, and it will not ask for your bank password.
      </p>
      <p className="mb-4 text-sm text-muted">
        Google Pay and Apple Pay do not have a feed a website can read. Those taps show up on the bank statement. PayPal is separate: export its activity as a CSV. Muting notifications does not matter here, because Pence is not listening to them.
      </p>
      <p className="mb-4 text-sm text-muted">
        Until a bank connection exists, one export covers the month. Upload a CSV from Monzo, Starling, Lloyds, Barclays, HSBC, or PayPal, or paste the lines. Gym, rent, and online shops come in without a receipt. Money in is left out. Anything unclear stays as Other.
      </p>
      <input
        ref={fileRef}
        className="sr-only"
        type="file"
        accept=".csv,text/csv,text/plain"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          void onFile(file);
        }}
      />
      <div className="flex flex-col gap-3">
        <button type="button" className="btn btn-primary" onClick={() => fileRef.current?.click()}>
          Upload a bank CSV
        </button>
        <textarea
          className="min-h-28 w-full rounded-md border border-line bg-card p-3 text-base"
          placeholder={"01/10/2026, Tesco, -42.16\nor paste a CSV"}
          value={text}
          onChange={(event) => readText(event.target.value)}
        />
      </div>
      {clashes && clashes.length > 0 ? (
        <div className="mt-4">
          <SamePayment clashes={clashes} busy={busy} onResolve={(choices) => void resolve(choices)} onBack={() => setClashes(null)} />
        </div>
      ) : null}
      {rows && !clashes ? (
        <div className="mt-4">
          <p className="mb-2 text-sm text-muted">
            {rows.length} outgoing spend{rows.length === 1 ? "" : "s"}. Change a category if it’s wrong, or leave Other.
          </p>
          <ul className="panel divide-y divide-line">
            {rows.map((row, index) => (
              <li key={`${row.spentOn}-${row.merchant}-${row.amountPence}-${index}`} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{row.merchant}</span>
                  <span className="text-sm text-muted">{row.spentOn}</span>
                </span>
                <span className="tabular-nums sm:w-24 sm:text-right">{formatGBP(row.amountPence)}</span>
                <label className="sr-only" htmlFor={`cat-${index}`}>
                  Category for {row.merchant}
                </label>
                <select
                  id={`cat-${index}`}
                  className="control sm:w-44"
                  value={row.category}
                  onChange={(event) => setCategory(index, event.target.value as CategoryId)}
                >
                  {CATEGORIES.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
          <button type="button" className="btn btn-primary mt-3" disabled={busy} onClick={() => void fileRows()}>
            {busy ? "Filing…" : `File ${rows.length} spend${rows.length === 1 ? "" : "s"}`}
          </button>
        </div>
      ) : null}
      {error ? <p className="mt-3 text-sm text-clay">{error}</p> : null}
    </div>
  );
}
