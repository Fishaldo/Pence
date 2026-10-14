import { useNavigate } from "@tanstack/react-router";
import { categoryLabel, formatGBP } from "@/lib/core/model";
import { dismissAlert } from "@/server/ledger";
import { useLedger, useRefreshLedger } from "./data";
import { errorText, PageHead } from "./ui";
import { useState } from "react";

export function AlertsView() {
  const { alerts } = useLedger();
  const refresh = useRefreshLedger();
  const navigate = useNavigate();
  const [error, setError] = useState("");

  async function dismiss(id: string) {
    setError("");
    try {
      await dismissAlert({ data: { id } });
      await refresh();
    } catch (err) {
      setError(errorText(err, "Couldn’t dismiss that."));
    }
  }

  return (
    <div>
      <PageHead back="/capture" title="Payment messages" />
      <p className="mb-4 text-sm text-muted">
        A website can’t read Google Pay, Apple Pay, or your bank. Paste the notification from Add, and it waits here until you say whether there’s a receipt. Uber rides and other card taps with no paper slip belong in this list.
      </p>
      {alerts.isPending ? <div className="h-32 animate-pulse rounded-lg bg-sand" /> : null}
      {!alerts.isPending && (alerts.data?.length ?? 0) === 0 ? (
        <div className="panel p-5">
          <h2 className="section-title">No payment messages waiting</h2>
          <p className="mt-2 text-sm text-muted">
            When you paste a payment notification, Pence asks if you have a receipt before filing it.
          </p>
          <button type="button" className="btn btn-primary mt-4" onClick={() => void navigate({ to: "/capture" })}>
            Paste a payment alert
          </button>
        </div>
      ) : null}
      <ul className="space-y-3">
        {(alerts.data ?? []).map((alert) => (
          <li key={alert.id} className="panel p-4">
            <p className="font-bold">{alert.merchant}</p>
            <p className="tabular-nums">
              {alert.amountPence != null ? formatGBP(alert.amountPence) : "Amount missing"}
              <span className="text-muted"> · {categoryLabel(alert.category)}</span>
            </p>
            <p className="mt-1 text-sm text-muted">{alert.rawText}</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                className="btn btn-primary sm:w-auto"
                onClick={() => {
                sessionStorage.setItem("pence-open-alert", alert.id);
                void navigate({ to: "/capture" });
              }}
              >
                Do you have a receipt?
              </button>
              <button type="button" className="btn btn-quiet sm:w-auto" onClick={() => void dismiss(alert.id)}>
                Dismiss
              </button>
            </div>
          </li>
        ))}
      </ul>
      {error ? <p className="mt-3 text-sm text-clay">{error}</p> : null}
    </div>
  );
}
