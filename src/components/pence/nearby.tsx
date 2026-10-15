import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { nearbyAdvice, type NearbyOffer, type NearbyShop } from "@/server/nearby";
import { useLedger } from "./data";
import { DealAction } from "./deal-bits";
import { errorText } from "./error-text";

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
    <section className="panel flex flex-col p-[1.125rem]" aria-label="Another shop">
      <h2 className="section-title">Another shop near you</h2>
      <p className="mt-1 text-sm text-muted">Shops near {from} that sell what you already buy, with their current offers.</p>
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
      <div className="mt-3 flex flex-col gap-2">
        <button type="button" className="btn btn-primary" onClick={() => void compare()} disabled={busy}>
          {busy ? "Looking…" : "Compare shops"}
        </button>
        <Link to="/settings" className="btn btn-quiet">
          Places
        </Link>
      </div>
      {error ? <p className="mt-2 text-sm text-bad">{error}</p> : null}
      {usual.length > 0 ? <p className="mt-3 text-sm">You already use {usual.join(", ")}.</p> : null}
      {nearby && nearby.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {nearby.map((shop) => (
            <li key={shop.name} className="panel px-4 py-3 text-sm">
              <span className="font-bold">{shop.name}</span>
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
              <p className="mt-1 font-bold">{offer.title}</p>
              <p className="mt-1 text-sm">{offer.detail}</p>
              <DealAction deal={{ url: offer.url, merchant: offer.shop, code: offer.code }} />
            </li>
          ))}
        </ul>
      ) : null}
      {note ? <p className="mt-3 text-sm text-muted">{note}</p> : null}
    </section>
  );
}
