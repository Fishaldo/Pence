import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { formatGBP } from "@/lib/spend/model";
import {
  alertKey,
  answerWatch,
  changeWatchPrice,
  checkMyWatches,
  checkWatchNow,
  removeWatch,
  saveAlerts,
  type WatchItem,
  type WatchOffer,
} from "@/server/watch";
import { useWatches } from "./data";
import { DealAction } from "./deal-bits";
import { alertState, turnOffAlerts, turnOnAlerts, type AlertState } from "./phone-alerts";
import { errorText } from "./ui";

let lookedThisVisit = false;

/** Opening Pence checks any watch that has waited a day, once per visit. */
function useDailyLook() {
  const client = useQueryClient();
  useEffect(() => {
    if (lookedThisVisit) return;
    lookedThisVisit = true;
    void checkMyWatches()
      .then((result) => {
        if (result.checked > 0) void client.invalidateQueries({ queryKey: ["watches"] });
      })
      .catch(() => undefined);
  }, [client]);
}

/** A card for Home when something on the Watchlist has an offer. */
export function WatchSummary({ className = "mt-4" }: { className?: string }) {
  const watches = useWatches();
  useDailyLook();
  const found = (watches.data ?? []).filter((item) => item.status === "found");
  if (found.length === 0) return null;
  const first = found[0];
  const cheapest = first.offers.find((offer) => offer.pricePence != null && !offer.monthly);
  return (
    <Link to="/offers" hash="watchlist" className={`panel block border-forest p-4 ${className}`}>
      <p className="text-sm font-medium text-forest">{first.shopOnly ? "Pence found a promotion" : "Pence found a price"}</p>
      <p className="mt-1 font-medium">{found.length > 1 ? `${first.what}, and ${found.length - 1} more` : first.what}</p>
      {cheapest?.pricePence != null && !first.shopOnly ? (
        <p className="text-sm text-muted">
          From {formatGBP(cheapest.pricePence)}
          {cheapest.merchant ? ` at ${cheapest.merchant}` : ""}
        </p>
      ) : null}
      <p className="mt-2 text-sm font-medium text-forest">See it on your Watchlist</p>
    </Link>
  );
}

function checkedText(item: WatchItem, now = Date.now()): string {
  if (!item.checkedAt) return "Not checked yet";
  const hours = (now - Date.parse(item.checkedAt)) / 3_600_000;
  if (!Number.isFinite(hours)) return "Checked";
  if (hours < 1) return "Checked just now";
  if (hours < 24) return `Checked ${Math.round(hours)} hour${Math.round(hours) === 1 ? "" : "s"} ago`;
  return `Checked ${Math.round(hours / 24)} day${Math.round(hours / 24) === 1 ? "" : "s"} ago`;
}

function limitText(item: WatchItem): string {
  if (item.shopOnly) return "Any promotion";
  if (item.floorPence != null && (item.targetPence == null || item.floorPence <= item.targetPence)) {
    return `Under ${formatGBP(item.floorPence)}, the price you turned down`;
  }
  if (item.targetPence != null) return `Up to ${formatGBP(item.targetPence)}`;
  return "Any real discount";
}

function OfferPrice({ offer }: { offer: WatchOffer }) {
  if (offer.monthly) return <p className="text-sm text-muted">Monthly price, not the full price</p>;
  if (offer.pricePence == null) return null;
  return <p className="font-display text-3xl leading-none tabular-nums">{formatGBP(offer.pricePence)}</p>;
}

function PhoneAlerts() {
  const [state, setState] = useState<AlertState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void alertState().then(setState);
  }, []);

  async function turnOn() {
    setBusy(true);
    try {
      const { key } = await alertKey();
      if (!key) throw new Error("Alerts aren’t ready on Pence yet. Try again later.");
      const endpoint = await turnOnAlerts(key);
      await saveAlerts({ data: { endpoint, on: true } });
      setState("on");
      toast("Alerts are on. Pence will tell you when it finds an offer.");
    } catch (err) {
      toast(errorText(err, "Couldn’t turn alerts on here."));
      setState(await alertState());
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
    } catch (err) {
      toast(errorText(err, "Couldn’t turn alerts off."));
    } finally {
      setBusy(false);
    }
  }

  if (state == null || state === "unsupported") return null;
  return (
    <div className="mt-3 rounded-md bg-sand px-4 py-3">
      {state === "on" ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm">Phone alerts are on.</p>
          <button type="button" className="min-h-11 shrink-0 text-sm text-muted" disabled={busy} onClick={() => void turnOff()}>
            Turn off
          </button>
        </div>
      ) : state === "off" ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm">Get a message on this phone when Pence finds an offer.</p>
          <button
            type="button"
            className="min-h-11 shrink-0 rounded-md bg-forest px-4 text-sm font-medium text-foam"
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

/**
 * The Watchlist, shown in Offers: offers waiting for an answer first, then
 * everything being watched, then what was taken. Things are added from Plan.
 */
export function Watchlist() {
  const client = useQueryClient();
  const watches = useWatches();
  const [working, setWorking] = useState<string[]>([]);
  const [editing, setEditing] = useState<{ id: string; most: string } | null>(null);
  const [stopping, setStopping] = useState("");
  useDailyLook();

  async function refresh() {
    await client.invalidateQueries({ queryKey: ["watches"] });
  }

  function mark(id: string, on: boolean) {
    setWorking((list) => (on ? [...list, id] : list.filter((item) => item !== id)));
  }

  async function check(id: string) {
    mark(id, true);
    try {
      const result = await checkWatchNow({ data: { id } });
      await refresh();
      if (result.checked) {
        toast(result.found > 0 ? "Pence found an offer." : "Nothing good enough yet. Pence will keep looking every day.");
      } else {
        toast("Checked a moment ago. Pence keeps looking every day.");
      }
    } catch (err) {
      toast(errorText(err, "Couldn’t check just now. Pence will try again later."));
    } finally {
      mark(id, false);
    }
  }

  async function answer(item: WatchItem, take: boolean, offerId = "") {
    mark(item.id, true);
    try {
      await answerWatch({ data: { id: item.id, take, offerId } });
      await refresh();
      toast(
        take
          ? "Done. The offer is saved under Taken."
          : item.shopOnly
            ? "Pence will keep watching for the next promotion."
            : "Pence will keep watching for a lower price.",
      );
    } catch (err) {
      toast(errorText(err, "Couldn’t save that."));
    } finally {
      mark(item.id, false);
    }
  }

  async function savePrice() {
    if (!editing) return;
    const id = editing.id;
    mark(id, true);
    try {
      const result = await changeWatchPrice({ data: { id, most: editing.most } });
      setEditing(null);
      await refresh();
      toast(result.found > 0 ? "Some offers Pence already saw fit that price." : "Price saved.");
    } catch (err) {
      toast(errorText(err, "Couldn’t save that price."));
    } finally {
      mark(id, false);
    }
  }

  async function remove(item: WatchItem) {
    if (stopping !== item.id && item.status !== "accepted") {
      setStopping(item.id);
      return;
    }
    mark(item.id, true);
    try {
      await removeWatch({ data: { id: item.id } });
      setStopping("");
      await refresh();
    } catch (err) {
      toast(errorText(err, "Couldn’t stop that watch."));
    } finally {
      mark(item.id, false);
    }
  }

  const items = watches.data ?? [];
  const found = items.filter((item) => item.status === "found");
  const waiting = items.filter((item) => item.status === "watching");
  const done = items.filter((item) => item.status === "accepted");

  // Opened from a phone alert or the Home card: bring the Watchlist into view once it has loaded.
  const loaded = watches.isSuccess;
  useEffect(() => {
    if (!loaded || typeof window === "undefined" || window.location.hash !== "#watchlist") return;
    document.getElementById("watchlist")?.scrollIntoView({ block: "start" });
  }, [loaded]);

  return (
    <section id="watchlist" className="scroll-mt-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-2xl">Watchlist</h2>
        <Link to="/plan" className="min-h-11 shrink-0 text-sm font-medium text-forest">
          Add
        </Link>
      </div>

      {watches.isPending ? <div className="mt-3 h-24 animate-pulse rounded-lg bg-sand" /> : null}
      {watches.isError ? (
        <p className="panel mt-3 p-4 text-sm">{errorText(watches.error, "Couldn’t load your Watchlist just now.")}</p>
      ) : null}

      {!watches.isPending && items.length === 0 ? (
        <Link to="/plan" className="panel mt-3 block p-4">
          <p className="text-sm text-muted">
            Want something, or want to shop somewhere, but not at today’s price? Add it from Plan. Pence keeps looking every
            day and tells you when an offer turns up.
          </p>
          <p className="mt-2 text-sm font-medium text-forest">Add to your Watchlist</p>
        </Link>
      ) : null}

      {found.length > 0 ? (
        <ul className="mt-3 space-y-4">
          {found.map((item) => (
            <li key={item.id} className="panel border-forest p-4">
              <p className="text-sm font-medium text-forest">{item.shopOnly ? "Pence found a promotion" : "Pence found a price"}</p>
              <p className="mt-1 font-medium">{item.what}</p>
              <p className="text-sm text-muted">{limitText(item)}</p>
              <p className="mt-2 text-sm font-medium">{item.shopOnly ? "Is this one for you?" : "Is the price right for you?"}</p>
              <ul className="mt-3 space-y-3">
                {item.offers.map((offer) => (
                  <li key={offer.id} className="border-t border-line pt-3">
                    <OfferPrice offer={offer} />
                    <p className="mt-1 text-sm text-muted">{offer.merchant || offer.source}</p>
                    <p className="mt-1 font-medium">{offer.title}</p>
                    {offer.detail ? <p className="mt-1 text-sm">{offer.detail}</p> : null}
                    <DealAction deal={offer} />
                    <button
                      type="button"
                      className={`btn mt-2 ${item.shopOnly ? "btn-quiet" : "btn-primary"}`}
                      disabled={working.includes(item.id)}
                      onClick={() => void answer(item, true, offer.id)}
                    >
                      {item.shopOnly ? "I’ll use this one" : "Happy with this price"}
                    </button>
                  </li>
                ))}
              </ul>
              <div className="mt-4 border-t border-line pt-3">
                <p className="text-sm text-muted">
                  {item.shopOnly
                    ? "Not for you? Pence will keep watching for the next promotion."
                    : `Not happy with ${item.offers.length > 1 ? "these prices" : "this price"}? Pence will keep watching for a lower one.`}
                </p>
                <button
                  type="button"
                  className="btn btn-quiet mt-2"
                  disabled={working.includes(item.id)}
                  onClick={() => void answer(item, false)}
                >
                  {item.shopOnly ? "Not this one, keep watching" : "Still too much, keep watching"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {waiting.length > 0 ? (
        <ul className="mt-3 space-y-3">
          {waiting.map((item) => (
            <li key={item.id} className="panel p-4">
              <p className="font-medium">{item.what}</p>
              <p className="text-sm text-muted">
                {limitText(item)}
                {item.town ? ` · ${item.town}` : ""}
              </p>
              <p className="mt-1 text-sm text-muted">
                {working.includes(item.id) ? "Looking now…" : checkedText(item)}
                {item.seen > 0 ? ` · ${item.seen} offer${item.seen === 1 ? "" : "s"} seen` : ""}
              </p>
              {item.lowest?.pricePence != null && !item.shopOnly ? (
                <p className="mt-1 text-sm">
                  Lowest seen: <span className="font-medium tabular-nums">{formatGBP(item.lowest.pricePence)}</span>
                  {item.lowest.merchant ? ` at ${item.lowest.merchant}` : ""}
                </p>
              ) : null}
              {editing?.id === item.id ? (
                <div className="mt-3 flex items-end gap-2">
                  <label className="field flex-1">
                    <span className="field-label">The most you’d pay (£)</span>
                    <input
                      className="control tabular-nums"
                      inputMode="decimal"
                      value={editing.most}
                      placeholder="Empty for any discount"
                      onChange={(event) => setEditing({ id: item.id, most: event.target.value })}
                    />
                  </label>
                  <button type="button" className="btn btn-primary w-auto" onClick={() => void savePrice()}>
                    Save
                  </button>
                </div>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="min-h-11 rounded-md border border-line px-3 text-sm"
                  disabled={working.includes(item.id)}
                  onClick={() => void check(item.id)}
                >
                  Check now
                </button>
                {item.shopOnly ? null : (
                  <button
                    type="button"
                    className="min-h-11 rounded-md border border-line px-3 text-sm"
                    onClick={() =>
                      setEditing(
                        editing?.id === item.id
                          ? null
                          : { id: item.id, most: item.targetPence != null ? (item.targetPence / 100).toFixed(2) : "" },
                      )
                    }
                  >
                    Change price
                  </button>
                )}
                <button
                  type="button"
                  className={`min-h-11 rounded-md border px-3 text-sm ${stopping === item.id ? "border-clay text-clay" : "border-line"}`}
                  disabled={working.includes(item.id)}
                  onClick={() => void remove(item)}
                >
                  {stopping === item.id ? "Tap again to stop" : "Stop watching"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {done.length > 0 ? (
        <>
          <h3 className="mt-5 text-sm font-medium text-muted">Taken</h3>
          <ul className="mt-2 space-y-3">
            {done.map((item) => {
              const offer = item.offers[0];
              return (
                <li key={item.id} className="panel p-4">
                  <p className="font-medium">{item.what}</p>
                  {offer ? (
                    <>
                      <p className="mt-1 tabular-nums">
                        {offer.pricePence != null && !offer.monthly ? formatGBP(offer.pricePence) : offer.title}
                        {offer.merchant ? ` · ${offer.merchant}` : ""}
                      </p>
                      <DealAction deal={offer} />
                    </>
                  ) : null}
                  <button
                    type="button"
                    className="mt-1 block min-h-11 text-sm text-muted"
                    disabled={working.includes(item.id)}
                    onClick={() => void remove(item)}
                  >
                    Clear
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}

      {found.length + waiting.length > 0 ? <PhoneAlerts /> : null}
    </section>
  );
}
