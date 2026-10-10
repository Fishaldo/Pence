import { useState } from "react";
import { saveProfile } from "@/server/ledger";
import { poundsToPence } from "@/lib/spend/model";
import { useRefreshLedger } from "./data";
import { errorText, Mark } from "./ui";

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
    <main className="min-h-dvh bg-paper px-4 py-10 text-ink">
      <form onSubmit={submit} className="mx-auto flex w-full max-w-md flex-col gap-5">
        <Mark />
        <div>
          <p className="text-xs tracking-[0.16em] text-muted uppercase">Your account</p>
          <h1 className="mt-1 font-display text-4xl">What lands in your account?</h1>
          <p className="mt-2 text-sm text-muted">
            Pence uses your take-home pay to show what share goes to groceries, rides, and the rest. It stays with your account.
          </p>
        </div>
        <label className="field">
          <span className="field-label">Your name</span>
          <input className="control" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
        </label>
        <label className="field">
          <span className="field-label">Monthly take-home (£)</span>
          <input
            className="control tabular-nums"
            inputMode="decimal"
            placeholder="2400"
            value={income}
            onChange={(e) => setIncome(e.target.value)}
            required
          />
        </label>
        <label className="field">
          <span className="field-label">City, so tips can be local</span>
          <input
            className="control"
            placeholder="Newcastle upon Tyne"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            autoComplete="address-level2"
          />
        </label>
        <label className="field">
          <span className="field-label">Payday (optional)</span>
          <select className="control" value={payday} onChange={(e) => setPayday(e.target.value)}>
            <option value="">Not sure</option>
            {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
              <option key={day} value={day}>
                {day}
              </option>
            ))}
          </select>
        </label>
        {error ? <p className="text-sm text-clay">{error}</p> : null}
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "Saving…" : "Start tracking"}
        </button>
      </form>
    </main>
  );
}
