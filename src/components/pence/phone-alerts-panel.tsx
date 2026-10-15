import { useEffect, useState } from "react";
import { toast } from "sonner";
import { alertKey, dailyStatus, saveAlerts, testAlert } from "@/server/watch";
import { alertState, currentSub, turnOffAlerts, turnOnAlerts, type AlertState } from "./phone-alerts";
import { errorText } from "./error-text";

function checkedAgo(iso: string, now = Date.now()): string {
  const hours = (now - Date.parse(iso)) / 3_600_000;
  if (!Number.isFinite(hours)) return "recently";
  if (hours < 1) return "within the hour";
  if (hours < 24) return `${Math.round(hours)} hour${Math.round(hours) === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/** Turn phone alerts on or off: offers on the Watchlist, and payments coming out soon. */
export function PhoneAlerts({ what = "when Pence finds an offer", onChange }: { what?: string; onChange?: () => void }) {
  const [state, setState] = useState<AlertState | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastCheck, setLastCheck] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (state !== "on") return;
    let cancel = false;
    void dailyStatus()
      .then((result) => {
        if (!cancel) setLastCheck(result.last);
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, [state]);

  useEffect(() => {
    let cancel = false;
    void alertState().then(async (found) => {
      if (cancel) return;
      setState(found);
      // Phones that turned alerts on before alerts could carry words: hand over their keys now.
      if (found === "on") {
        const sub = await currentSub();
        if (sub?.p256dh && sub.auth) await saveAlerts({ data: { ...sub, on: true } }).catch(() => undefined);
      }
    });
    return () => {
      cancel = true;
    };
  }, []);

  async function turnOn() {
    setBusy(true);
    try {
      const { key } = await alertKey();
      if (!key) throw new Error("Alerts aren’t ready on Pence yet. Try again later.");
      const sub = await turnOnAlerts(key);
      await saveAlerts({ data: { ...sub, on: true } });
      setState("on");
      onChange?.();
      toast("Phone alerts are on.");
    } catch (err) {
      toast(errorText(err, "Couldn’t turn alerts on here."));
      setState(await alertState());
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    try {
      const sub = await currentSub();
      if (!sub) {
        setState(await alertState());
        throw new Error("Alerts are off on this phone. Turn them on again.");
      }
      // Hand over the keys again in case this phone turned alerts on before alerts carried words.
      if (sub.p256dh && sub.auth) await saveAlerts({ data: { ...sub, on: true } });
      const result = await testAlert({ data: { endpoint: sub.endpoint } });
      toast(result.ok ? "Test sent. It should show on this phone in a few seconds." : result.problem);
    } catch (err) {
      toast(errorText(err, "Couldn’t send a test alert."));
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    try {
      const endpoint = await turnOffAlerts();
      if (endpoint) await saveAlerts({ data: { endpoint, on: false } }).catch(() => undefined);
      setState("off");
      onChange?.();
    } catch (err) {
      toast(errorText(err, "Couldn’t turn alerts off."));
    } finally {
      setBusy(false);
    }
  }

  if (state == null || state === "unsupported") return null;
  return (
    <div className="mt-3 rounded-xl bg-paper px-4 py-3">
      {state === "on" ? (
        <>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm">Phone alerts are on.</p>
            <div className="flex shrink-0 items-center gap-3">
              <button
                type="button"
                className="min-h-11 text-sm font-bold text-accent"
                disabled={busy}
                onClick={() => void sendTest()}
              >
                {busy ? "Sending…" : "Send a test"}
              </button>
              <button type="button" className="min-h-11 text-sm text-muted" disabled={busy} onClick={() => void turnOff()}>
                Turn off
              </button>
            </div>
          </div>
          {lastCheck !== undefined ? (
            <p className="text-xs text-muted">
              {lastCheck ? `Morning check last ran ${checkedAgo(lastCheck)}.` : "The morning check hasn’t run yet."}
            </p>
          ) : null}
        </>
      ) : state === "off" ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm">Get a message on this phone {what}.</p>
          <button
            type="button"
            className="btn-pill shrink-0"
            disabled={busy}
            onClick={() => void turnOn()}
          >
            {busy ? "Turning on…" : "Turn on"}
          </button>
        </div>
      ) : state === "blocked" ? (
        <p className="text-sm text-muted">Phone alerts are blocked for Pence. Allow notifications for Pence in your phone’s settings.</p>
      ) : (
        <p className="text-sm text-muted">
          For phone alerts on iPhone, add Pence to your Home Screen first: tap Share, then Add to Home Screen.
        </p>
      )}
    </div>
  );
}
