import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { UserButton } from "@/lib/auth/gates";
import { poundsToPence } from "@/lib/spend/model";
import { addPlace, clearSamples, removePlace, savePhonePlace, saveProfile } from "@/server/ledger";
import { useLedger, useRefreshLedger } from "./data";
import { errorText, PageHead } from "./ui";

export function SettingsView() {
  const { profile, txs, places } = useLedger();
  const refresh = useRefreshLedger();
  const data = profile.data;
  const [name, setName] = useState(data?.displayName ?? "");
  const [income, setIncome] = useState(data ? (data.monthlyIncomePence / 100).toFixed(2) : "");
  const [city, setCity] = useState(data?.city ?? "");
  const [payday, setPayday] = useState(data?.payday ? String(data.payday) : "");
  const [notify, setNotify] = useState(data?.notifyAlerts ?? false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [placeLabel, setPlaceLabel] = useState("");
  const [placeTown, setPlaceTown] = useState("");
  const samples = (txs.data ?? []).some((row) => row.isSample);
  const saved = places.data ?? [];

  if (!data) return <div className="h-40 animate-pulse rounded-lg bg-sand" />;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const monthlyIncomePence = poundsToPence(income);
    if (!monthlyIncomePence) {
      setError("Enter take-home like 2400 or 2400.50.");
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
          notifyAlerts: notify,
        },
      });
      await refresh();
      toast("Details saved");
    } catch (err) {
      setError(errorText(err, "Couldn’t save that."));
    } finally {
      setBusy(false);
    }
  }

  async function onNotify(next: boolean) {
    if (next && typeof Notification !== "undefined") {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setError("Notifications stay off until this browser allows them.");
        setNotify(false);
        return;
      }
    }
    if (next && typeof Notification === "undefined") {
      setError("This browser can’t show notifications.");
      return;
    }
    setNotify(next);
    setError("");
  }

  async function usePhone() {
    if (!navigator.geolocation) {
      setError("This browser can’t share a location.");
      return;
    }
    setError("");
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        void (async () => {
          try {
            await savePhonePlace({ data: { lat: pos.coords.latitude, lng: pos.coords.longitude } });
            await refresh();
            toast("This phone’s location is saved");
          } catch (err) {
            setError(errorText(err, "Couldn’t save that location."));
          } finally {
            setBusy(false);
          }
        })();
      },
      () => {
        setBusy(false);
        setError("Location was blocked. You can still type a town below.");
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 },
    );
  }

  async function addOther(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await addPlace({ data: { label: placeLabel, town: placeTown } });
      setPlaceLabel("");
      setPlaceTown("");
      await refresh();
      toast("Place saved");
    } catch (err) {
      setError(errorText(err, "Couldn’t save that place."));
    } finally {
      setBusy(false);
    }
  }

  async function dropPlace(id: string) {
    setBusy(true);
    setError("");
    try {
      await removePlace({ data: { id } });
      await refresh();
    } catch (err) {
      setError(errorText(err, "Couldn’t remove that place."));
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    setBusy(true);
    try {
      const result = await clearSamples();
      await refresh();
      toast(result.removed > 0 ? "Sample spends removed" : "No sample spends to remove");
    } catch (err) {
      setError(errorText(err, "Couldn’t clear the samples."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHead kicker="Account" title="Settings" />
      <div className="panel mb-6 p-4">
        <p className="font-medium">Receipts or your bank</p>
        <p className="mt-1 text-sm text-muted">
          Scan receipts when you have them. For gym, rent, and other payments with no slip, bring the transactions in from a bank export.
        </p>
        <Link to="/bank" className="btn btn-quiet mt-3">
          From your bank
        </Link>
      </div>
      <div className="panel mb-6 p-4">
        <p className="font-medium">Regular payments</p>
        <p className="mt-1 text-sm text-muted">Subscriptions, bills and free trials, with a reminder 7, 3 and 1 day before each one.</p>
        <Link to="/regular" className="btn btn-quiet mt-3">
          See the list
        </Link>
      </div>
      <form onSubmit={save} className="flex flex-col gap-4">
        <label className="field">
          <span className="field-label">Name</span>
          <input className="control" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Monthly take-home (£)</span>
          <input className="control tabular-nums" inputMode="decimal" value={income} onChange={(e) => setIncome(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">City</span>
          <input className="control" value={city} onChange={(e) => setCity(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Payday</span>
          <select className="control" value={payday} onChange={(e) => setPayday(e.target.value)}>
            <option value="">Not set</option>
            {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
              <option key={day} value={day}>
                {day}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-sm text-muted">
            Home and Insights count from this day. Payday on the 25th starts on the 25th of last month and runs until the day before the next 25th.
          </span>
        </label>
        <label className="panel flex items-start gap-3 p-4">
          <input
            type="checkbox"
            className="mt-1 size-4"
            checked={notify}
            onChange={(event) => void onNotify(event.target.checked)}
          />
          <span>
            <span className="block font-medium">Ask about receipts</span>
            <span className="mt-1 block text-sm text-muted">
              When a pasted payment alert is waiting, this device can notify you to add a receipt. It still can’t watch Google Pay or Apple Pay on its own.
            </span>
          </span>
        </label>
        {error ? <p className="text-sm text-clay">{error}</p> : null}
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save details"}
        </button>
      </form>
      <section className="mt-8">
        <h2 className="font-display text-2xl">Places</h2>
        <p className="mt-1 text-sm text-muted">
          Use this phone for shops near you. Add another place, such as a partner in Essex, and pick it on Plan or when comparing shops.
        </p>
        <button type="button" className="btn btn-primary mt-3" disabled={busy} onClick={usePhone}>
          {saved.some((place) => place.isPhone) ? "Update this phone’s location" : "Use this phone’s location"}
        </button>
        {saved.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {saved.map((place) => (
              <li key={place.id} className="panel flex items-center justify-between gap-3 px-4 py-3">
                <span>
                  <span className="block font-medium">{place.label}</span>
                  <span className="text-sm text-muted">{place.town || "Town not named"}</span>
                </span>
                <button type="button" className="text-sm text-muted" disabled={busy} onClick={() => void dropPlace(place.id)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <form onSubmit={(event) => void addOther(event)} className="mt-4 flex flex-col gap-3">
          <label className="field">
            <span className="field-label">Name</span>
            <input className="control" value={placeLabel} placeholder="Partner" onChange={(event) => setPlaceLabel(event.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Town, city, or area</span>
            <input className="control" value={placeTown} placeholder="Essex" onChange={(event) => setPlaceTown(event.target.value)} />
          </label>
          <button type="submit" className="btn btn-quiet" disabled={busy}>
            Add this place
          </button>
        </form>
      </section>
      {samples ? (
        <button type="button" className="btn btn-quiet mt-3" onClick={() => void clear()} disabled={busy}>
          Remove sample spends
        </button>
      ) : null}
      <div className="panel mt-6 p-4">
        <UserButton />
      </div>
    </div>
  );
}
