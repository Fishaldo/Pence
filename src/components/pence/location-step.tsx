import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { markLocationAsked } from "@/server/money";
import { savePhonePlace } from "@/server/ledger";
import { Check, MapPin } from "lucide-react";
import { errorText } from "./error-text";

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
    <main className="min-h-dvh bg-paper px-5 pt-[max(2rem,env(safe-area-inset-top))] pb-10 text-ink">
      <div className="mx-auto flex w-full max-w-[560px] flex-col gap-5">
        <span className="text-[0.8125rem] font-bold text-accent">Step 2 of 2</span>
        <span className="grid size-[84px] place-items-center rounded-full bg-accent-tint" aria-hidden="true">
          <MapPin className="size-9 text-accent" strokeWidth={1.9} />
        </span>
        <div className="flex flex-col gap-2">
          <h1 className="page-title">Deals near you first</h1>
          <p className="text-base leading-[1.5] text-muted">
            Pence uses this phone’s location to put nearby shops and deals at the top. National deals still show underneath.
          </p>
        </div>
        <ul className="flex flex-col gap-2.5">
          {["Precise location finds shops on your street.", "Change it or turn it off any time in Settings."].map((line) => (
            <li key={line} className="flex items-center gap-2.5 text-[0.9375rem] font-bold">
              <Check className="size-[18px] shrink-0 text-accent" strokeWidth={2.4} aria-hidden="true" />
              {line}
            </li>
          ))}
        </ul>
        {error ? <p className="text-sm text-bad">{error}</p> : null}
        <div className="mt-4 flex flex-col gap-2.5">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void allow()}>
            {busy ? "Finding you…" : "Allow location"}
          </button>
          <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => void skip()}>
            {city ? `Not now, use ${city}` : "Not now"}
          </button>
          <p className="text-center text-[0.8125rem] text-muted">Your phone asks next.</p>
        </div>
      </div>
    </main>
  );
}
