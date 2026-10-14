import { useState } from "react";
import { saveProfile } from "@/server/ledger";
import { poundsToPence } from "@/lib/core/model";
import { useRefreshLedger } from "./data";
import { errorText } from "./ui";

export function Onboarding({ defaultName }: { defaultName: string }) {
  const refresh = useRefreshLedger();
  const [name, setName] = useState(defaultName);
  const [income, setIncome] = useState("");
  const [city, setCity] = useState("");
  const [payday, setPayday] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const monthlyIncomePence = poundsToPence(income);
    if (!monthlyIncomePence) {
      setError("Enter your monthly take-home, like 2400 or 2400.50.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await saveProfile({
        data: {
          displayName: name.trim(),
          monthlyIncomePence,
          city: city.trim(),
          payday: payday ? Number(payday) : null,
          notifyAlerts: false,
        },
      });
      await refresh();
    } catch (err) {
      setError(errorText(err, "Couldn’t save that. Try again."));
      setBusy(false);
    }
  }

  return (
    <main className="min-h-dvh bg-paper px-5 pt-[max(2rem,env(safe-area-inset-top))] pb-10 text-ink">
      <form onSubmit={submit} className="mx-auto flex w-full max-w-[560px] flex-col gap-5">
        <span className="text-[0.8125rem] font-bold text-forest">Step 1 of 2</span>
        <div className="-mt-3 flex flex-col gap-1.5">
          <h1 className="page-title">A little about you</h1>
          <p className="text-sm leading-[1.45] text-muted">So Pence can set your pay period. You can change this later.</p>
        </div>
        <label className="field">
          <span className="field-label">First name</span>
          <input className="control" value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" required />
        </label>
        <label className="field">
          <span className="field-label">Monthly take-home pay</span>
          <input
            className="control tabular-nums"
            inputMode="decimal"
            placeholder="£2,400"
            value={income}
            onChange={(e) => setIncome(e.target.value)}
            required
          />
          <span className="mt-1.5 block text-[0.8125rem] text-muted">After tax. Pence asks you to confirm it each payday.</span>
        </label>
        <label className="field">
          <span className="field-label">Payday, day of the month</span>
          <select className="control" value={payday} onChange={(e) => setPayday(e.target.value)}>
            <option value="">No fixed payday</option>
            {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
              <option key={day} value={day}>
                {day}
              </option>
            ))}
          </select>
          <span className="mt-1.5 block text-[0.8125rem] text-muted">No fixed payday? Leave it and Pence uses calendar months.</span>
        </label>
        <label className="field">
          <span className="field-label">Home town</span>
          <input
            className="control"
            placeholder="Newcastle upon Tyne"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            autoComplete="address-level2"
          />
        </label>
        <div className="field">
          <span className="field-label">Country</span>
          <span className="chip chip-on self-start">United Kingdom</span>
        </div>
        {error ? <p className="text-sm text-clay">{error}</p> : null}
        <button className="btn btn-primary mt-2" type="submit" disabled={busy}>
          {busy ? "Saving…" : "Continue"}
        </button>
      </form>
    </main>
  );
}
