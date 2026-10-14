import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { UserButton } from "@/lib/auth/gates";
import { signOut } from "@/lib/auth/client";
import { categoryLabel, poundsToPence } from "@/lib/spend/model";
import { deleteMyData, exportMyData, saveWeeklyDay } from "@/server/money";
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
  const [confirmDelete, setConfirmDelete] = useState(false);

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

  function download(name: string, body: string, type: string) {
    const url = URL.createObjectURL(new Blob([body], { type }));
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  async function downloadAll() {
    setBusy(true);
    setError("");
    try {
      const file = await exportMyData();
      download(`pence-data-${new Date().toISOString().slice(0, 10)}.json`, file, "application/json");
    } catch (err) {
      setError(errorText(err, "Couldn’t make the file."));
    } finally {
      setBusy(false);
    }
  }

  function downloadSpends() {
    const cell = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const lines = [
      "Date,Shop,Amount (£),Category,Statement text,Note,Items",
      ...(txs.data ?? []).map((tx) =>
        [
          tx.spentOn,
          cell(tx.merchant),
          (tx.amountPence / 100).toFixed(2),
          cell(categoryLabel(tx.category)),
          cell(tx.description),
          cell(tx.note),
          cell(tx.items.map((item) => item.name).join("; ")),
        ].join(","),
      ),
    ];
    download(`pence-spends-${new Date().toISOString().slice(0, 10)}.csv`, lines.join("\n"), "text/csv");
  }

  async function deleteEverything() {
    setBusy(true);
    setError("");
    try {
      await deleteMyData({ data: { confirm: "delete" } });
      await signOut("/");
    } catch (err) {
      setError(errorText(err, "Couldn’t delete that. Try again."));
      setBusy(false);
    }
  }

  async function pickWeekly(value: string) {
    setBusy(true);
    try {
      await saveWeeklyDay({ data: { day: value === "" ? null : Number(value) } });
      await refresh();
    } catch (err) {
      setError(errorText(err, "Couldn’t save that."));
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

  const first = (data.displayName || "").trim();
  const navRow = (to: string, label: string, line: string) => (
    <Link to={to} className="row">
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[0.9375rem] font-bold">{label}</span>
        <span className="text-[0.8125rem] text-muted">{line}</span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-muted" aria-hidden="true" />
    </Link>
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHead back="/" title="Settings" flush />

      <div className="flex items-center gap-3.5">
        <span aria-hidden="true" className="initial size-12 text-lg">{(first.charAt(0) || "·").toUpperCase()}</span>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-[1.0625rem] font-extrabold">{first || "Your account"}</span>
          <span className="truncate text-[0.8125rem] text-muted">{data.city ? `Home town: ${data.city}` : "Add your town below"}</span>
        </div>
      </div>

      <form onSubmit={save} aria-label="Pay">
        <h2 className="group-title">Pay</h2>
        <div className="panel flex flex-col gap-4 p-4">
          <label className="field">
            <span className="field-label">First name</span>
            <input className="control" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Monthly take-home (£)</span>
            <input className="control tabular-nums" inputMode="decimal" value={income} onChange={(e) => setIncome(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Payday</span>
            <select className="control" value={payday} onChange={(e) => setPayday(e.target.value)}>
              <option value="">No fixed payday: calendar months</option>
              {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                <option key={day} value={day}>
                  The {day}
                  {day === 1 || day === 21 || day === 31 ? "st" : day === 2 || day === 22 ? "nd" : day === 3 || day === 23 ? "rd" : "th"}
                </option>
              ))}
            </select>
            <span className="mt-1.5 block text-[0.8125rem] text-muted">
              Payday on the 25th: each pay runs from the 25th to the day before the next 25th.
            </span>
          </label>
          <label className="field">
            <span className="field-label">Home town</span>
            <input className="control" value={city} onChange={(e) => setCity(e.target.value)} />
          </label>
          {error ? <p className="text-sm text-clay">{error}</p> : null}
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </form>

      <section aria-label="Places">
        <h2 className="group-title">Places</h2>
        <div className="rows">
          {saved.map((place) => (
            <div key={place.id} className="row">
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[0.9375rem] font-bold">{place.label}</span>
                <span className="text-[0.8125rem] text-muted">{place.town || "Town not named"}</span>
              </span>
              <button type="button" className="link" disabled={busy} onClick={() => void dropPlace(place.id)}>
                Remove
              </button>
            </div>
          ))}
          <button type="button" className="row text-left" disabled={busy} onClick={usePhone}>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[0.9375rem] font-bold">
                {saved.some((place) => place.isPhone) ? "Update this phone’s location" : "Use this phone’s location"}
              </span>
              <span className="text-[0.8125rem] text-muted">Puts shops and deals near you first.</span>
            </span>
            <ChevronRight className="size-5 shrink-0 text-muted" aria-hidden="true" />
          </button>
        </div>
        <form onSubmit={(event) => void addOther(event)} className="panel mt-3 flex flex-col gap-3 p-4">
          <p className="text-[0.8125rem] text-muted">Add another town, such as where you work or family live. Pick it on Plan.</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="field">
              <span className="field-label">Name</span>
              <input className="control" value={placeLabel} placeholder="Work" onChange={(event) => setPlaceLabel(event.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Town</span>
              <input className="control" value={placeTown} placeholder="Leeds" onChange={(event) => setPlaceTown(event.target.value)} />
            </label>
          </div>
          <button type="submit" className="btn btn-quiet" disabled={busy}>
            Add this town
          </button>
        </form>
      </section>

      <section aria-label="Reminders">
        <h2 className="group-title">Reminders</h2>
        <div className="rows">
          <label className="row cursor-pointer">
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[0.9375rem] font-bold">Ask about receipts</span>
              <span className="text-[0.8125rem] text-muted">
                A phone alert when a pasted payment message is waiting for a receipt. Payment reminders come 7 days, 3 days and 2 working days
                before.
              </span>
            </span>
            <input
              type="checkbox"
              role="switch"
              className="size-6 shrink-0 accent-[#1e5b43]"
              checked={notify}
              onChange={(event) => void onNotify(event.target.checked)}
            />
          </label>
          <label className="row">
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[0.9375rem] font-bold">Weekly check-in</span>
              <span className="text-[0.8125rem] text-muted">A short look at your week</span>
            </span>
            <select
              className="control w-auto min-w-32"
              value={data.weeklyDay == null ? "" : String(data.weeklyDay)}
              disabled={busy}
              onChange={(event) => void pickWeekly(event.target.value)}
            >
              <option value="">Off</option>
              {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((day, index) => (
                <option key={day} value={index}>
                  {day}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section aria-label="Money">
        <h2 className="group-title">Statements, bills and budget</h2>
        <div className="rows">
          {navRow("/bank", "Bank statements", "Upload a CSV from your banking app")}
          {navRow("/bills", "Bills", "Price rises, contract ends and better deals")}
          {navRow("/regular", "Regular payments", "Subscriptions and free trials")}
          {navRow("/budget", "Budget", "Each pay, from your own spending")}
          {navRow("/week", "This week", "The weekly check-in")}
          {samples ? (
            <button type="button" className="row text-left" onClick={() => void clear()} disabled={busy}>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[0.9375rem] font-bold">Remove sample spends</span>
                <span className="text-[0.8125rem] text-muted">Keep only your own</span>
              </span>
            </button>
          ) : null}
        </div>
      </section>

      <section aria-label="Your data">
        <h2 className="group-title">Your data</h2>
        <div className="flex flex-col gap-2.5">
          <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => void downloadAll()}>
            Download my data
          </button>
          <button type="button" className="btn btn-quiet" disabled={busy || (txs.data ?? []).length === 0} onClick={downloadSpends}>
            Download spends as a spreadsheet
          </button>
          {confirmDelete ? (
            <div className="flex flex-col gap-2 rounded-[1.125rem] bg-clay-soft p-4">
              <p className="font-extrabold">Delete everything?</p>
              <p className="text-sm text-clay-ink">
                Every spend, place, budget, bill and watch is removed now, and you are signed out. This can’t be undone.
              </p>
              <button type="button" className="btn btn-danger" disabled={busy} onClick={() => void deleteEverything()}>
                Yes, delete everything
              </button>
              <button type="button" className="btn btn-quiet" onClick={() => setConfirmDelete(false)}>
                Keep my data
              </button>
            </div>
          ) : (
            <button type="button" className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
              Delete my account
            </button>
          )}
        </div>
      </section>

      <div className="panel p-4">
        <UserButton />
      </div>

      <p className="text-[0.8125rem] leading-[1.5] text-muted">
        Pence keeps only what it needs. Receipt photos are read, then deleted.
      </p>
    </div>
  );
}
