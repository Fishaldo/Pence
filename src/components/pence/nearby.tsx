import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { nearbyAdvice, type NearbyOffer, type NearbyShop } from "@/server/nearby";
import { useLedger } from "./data";
import { errorText } from "./ui";

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function NearbyPanel() {
  const { places } = useLedger();
  const saved = places.data ?? [];
  const [placeId, setPlaceId] = useState("");
  const chosen = saved.find((place) => place.id === placeId) ?? saved.find((place) => place.isPhone) ?? saved[0];
  const [nearby, setNearby] = useState<NearbyShop[] | null>(null);
  const [usual, setUsual] = useState<string[]>([]);
  const [offers, setOffers] = useState<NearbyOffer[] | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function compare() {
    setBusy(true);
    setError("");
    try {
      const result = await nearbyAdvice({ data: { placeId: chosen?.id ?? "" } });
      setUsual(result.usual);
      setNearby(result.nearby);
      setOffers(result.offers);
      setNote(result.note);
    } catch (err) {
      setError(errorText(err, "Couldn’t compare nearby shops."));
    } finally {
      setBusy(false);
    }
  }

  const from = chosen ? (chosen.isPhone ? "this phone" : chosen.label) : "the town in settings";

  return (
    <section className="mt-6">
      <h2 className="font-display text-2xl">Another shop</h2>
      {saved.length > 1 ? (
        <label className="mt-3 block">
          <span className="field-label">Place</span>
          <select className="control mt-1" value={chosen?.id ?? ""} onChange={(event) => setPlaceId(event.target.value)}>
            {saved.map((place) => (
              <option key={place.id} value={place.id}>
                {place.label}
                {place.town ? ` · ${place.town}` : ""}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <button type="button" className="btn btn-primary" onClick={() => void compare()} disabled={busy}>
          {busy ? "Looking…" : "Compare shops"}
        </button>
        <Link to="/settings" className="btn btn-quiet">
          Places
        </Link>
      </div>
      {error ? <p className="mt-2 text-sm text-clay">{error}</p> : null}
      {usual.length > 0 ? <p className="mt-3 text-sm">You already use {usual.join(", ")}.</p> : null}
      {nearby && nearby.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {nearby.map((shop) => (
            <li key={shop.name} className="panel px-4 py-3 text-sm">
              <span className="font-medium">{shop.name}</span>
              {shop.km != null ? <span className="text-muted"> · {shop.km} km from {from}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {offers && offers.length > 0 ? (
        <ul className="mt-3 space-y-3">
          {offers.map((offer) => (
            <li key={offer.url} className="panel p-4">
              <p className="text-sm text-muted">{offer.shop}</p>
              <p className="mt-1 font-medium">{offer.title}</p>
              <p className="mt-1 text-sm">{offer.detail}</p>
              {offer.code ? (
                <p className="mt-2 text-sm">
                  Code <span className="font-medium tabular-nums">{offer.code}</span>
                </p>
              ) : null}
              <a href={offer.url} className="mt-2 inline-block text-sm font-medium text-forest" target="_blank" rel="noreferrer">
                Open {hostOf(offer.url)}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
      {note ? <p className="mt-3 text-sm text-muted">{note}</p> : null}
    </section>
  );
}
