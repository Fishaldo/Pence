import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { markLocationAsked } from "@/server/money";
import { savePhonePlace } from "@/server/ledger";
import { errorText, Mark } from "./ui";

/**
 * Asked once, right after the first sign-in: may Pence use this phone's
 * location to put nearby shops and deals first? Changeable in Settings.
 */
export function LocationStep({ city }: { city: string }) {
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function finish() {
    await markLocationAsked();
    await Promise.all([client.invalidateQueries({ queryKey: ["profile"] }), client.invalidateQueries({ queryKey: ["places"] })]);
  }

  async function allow() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("This browser can’t share a location.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15_000, maximumAge: 600_000 }),
      );
      await savePhonePlace({ data: { lat: position.coords.latitude, lng: position.coords.longitude } });
      await finish();
    } catch (err) {
      const denied = typeof err === "object" && err != null && "code" in err && (err as { code: number }).code === 1;
      setError(denied ? "Location is off for Pence. You can use your town instead." : errorText(err, "Couldn’t find your location."));
      setBusy(false);
    }
  }

  async function skip() {
    setBusy(true);
    try {
      await finish();
    } catch (err) {
      setError(errorText(err, "Couldn’t save that."));
      setBusy(false);
    }
  }

  return (
    <main className="min-h-dvh bg-paper px-4 py-10 text-ink">
      <div className="mx-auto flex w-full max-w-md flex-col gap-5">
        <Mark />
        <div>
          <p className="text-xs tracking-[0.16em] text-muted uppercase">One more thing</p>
          <h1 className="mt-1 font-display text-4xl">Deals near you first</h1>
          <p className="mt-2 text-sm text-muted">
            Pence uses this phone’s location to put nearby shops and deals at the top. National deals still show underneath.
          </p>
        </div>
        <ul className="space-y-2 text-sm">
          <li>Precise location finds shops on your street.</li>
          <li>Change it or turn it off any time in Settings.</li>
        </ul>
        {error ? <p className="text-sm text-clay">{error}</p> : null}
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void allow()}>
          {busy ? "Finding you…" : "Allow location"}
        </button>
        <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => void skip()}>
          {city ? `Not now, use ${city}` : "Not now"}
        </button>
        <p className="text-center text-sm text-muted">Your phone asks next.</p>
      </div>
    </main>
  );
}
