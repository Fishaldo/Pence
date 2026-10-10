import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { formatGBP } from "@/lib/spend/model";
import {
  addWatch,
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
import { errorText, PageHead } from "./ui";

let lookedThisVisit = false;

/**
 * A short card for Home and Offers. Shows when Pence found a price; on Offers
 * it also invites the person to watch something. Opening Pence checks any
 * watch that has waited a day, once per visit.
 */
export function WatchSummary({ invite = false, className = "mt-4" }: { invite?: boolean; className?: string }) {
  const client = useQueryClient();
  const watches = useWatches();

  useEffect(() => {
    if (lookedThisVisit) return;
    lookedThisVisit = true;
    void checkMyWatches()
      .then((result) => {
        if (result.checked > 0) void client.invalidateQueries({ queryKey: ["watches"] });
      })
      .catch(() => undefined);
  }, [client]);

  const items = watches.data ?? [];
  const found = items.filter((item) => item.status === "found");
  const active = items.filter((item) => item.status === "watching" || item.status === "found");
  if (found.length > 0) {
    const first = found[0];
    const cheapest = first.offers.find((offer) => offer.pricePence != null && !offer.monthly);
    return (
      <Link to="/watch" className={`panel block border-forest p-4 ${className}`}>
        <p className="text-sm font-medium text-forest">Pence found a price</p>
        <p className="mt-1 font-medium">
          {found.length > 1 ? `${first.what}, and ${found.length - 1} more` : first.what}
        </p>
        {cheapest?.pricePence != null ? (
          <p className="text-sm text-muted">
            From {formatGBP(cheapest.pricePence)}
            {cheapest.merchant ? ` at ${cheapest.merchant}` : ""}
          </p>
        ) : null}
        <p className="mt-2 text-sm font-medium text-forest">See if the price is right for you</p>
      </Link>
    );
  }
  if (!invite || watches.isPending) return null;
  return (
    <Link to="/watch" className={`panel flex items-center justify-between gap-3 p-4 ${className}`}>
      <div className="min-w-0">
        <p className="font-medium">Price watch</p>
        <p className="text-sm text-muted">
          {active.length > 0
            ? `Watching ${active.length} thing${active.length === 1 ? "" : "s"} for a better price`
            : "Want something, but not at today’s price? Pence can watch it for you."}
        </p>
      </div>
      <span className="shrink-0 text-sm font-medium text-forest">{active.length > 0 ? "Open" : "Watch a price"}</span>
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
  if (item.floorPence != null && (item.targetPence == null || item.floorPence <= item.targetPence)) {
    return `Under ${formatGBP(item.floorPence)}, the price you turned down`;
  }
  if (item.targetPence != null) return `Up to ${formatGBP(item.targetPence)}`;
  return "Any real discount";
}

function OfferPrice({ offer }: { offer: WatchOffer }) {
  if (offer.monthly) return <p className="text-sm text-muted">Monthly price, not the full price</p>;
  if (offer.pricePence == null) return <p className="text-sm text-muted">No price on the page</p>;
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
      toast("Alerts are on. Pence will tell you when it finds a price.");
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
    <section className="panel mt-6 p-4">
      <p className="font-medium">Phone alerts</p>
      {state === "on" ? (
        <>
          <p className="mt-1 text-sm text-muted">On. Pence tells this phone when it finds a price.</p>
          <button type="button" className="btn btn-quiet mt-3" disabled={busy} onClick={() => void turnOff()}>
            Turn off
          </button>
        </>
      ) : state === "off" ? (
        <>
          <p className="mt-1 text-sm text-muted">Get a message on this phone when Pence finds a price.</p>
          <button type="button" className="btn btn-primary mt-3" disabled={busy} onClick={() => void turnOn()}>
            {busy ? "Turning on…" : "Turn on alerts"}
          </button>
        </>
      ) : state === "blocked" ? (
        <p className="mt-1 text-sm text-muted">
          Alerts are blocked for Pence. Allow notifications for Pence in your phone’s settings, then come back here.
        </p>
      ) : (
        <p className="mt-1 text-sm text-muted">
          On iPhone, add Pence to your Home Screen first: tap Share, then Add to Home Screen. Open Pence from there and turn alerts on.
        </p>
      )}
    </section>
  );
}

export function WatchView() {
  const client = useQueryClient();
  const watches = useWatches();
  const [what, setWhat] = useState("");
  const [most, setMost] = useState("");
  const [town, setTown] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [working, setWorking] = useState<string[]>([]);
  const [editing, setEditing] = useState<{ id: string; most: string } | null>(null);
  const [stopping, setStopping] = useState("");

  async function refresh() {
    await client.invalidateQueries({ queryKey: ["watches"] });
  }

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const asked = query.get("what");
    const price = query.get("most");
    if (asked) setWhat(asked.slice(0, 120));
    if (price) setMost(price.slice(0, 12));
    if (lookedThisVisit) return;
    lookedThisVisit = true;
    void checkMyWatches()
      .then((result) => {
        if (result.checked > 0) void client.invalidateQueries({ queryKey: ["watches"] });
      })
      .catch(() => undefined);
  }, [client]);

  function mark(id: string, on: boolean) {
    setWorking((list) => (on ? [...list, id] : list.filter((item) => item !== id)));
  }

  async function check(id: string, quietIfSkipped = false) {
    mark(id, true);
    try {
      const result = await checkWatchNow({ data: { id } });
      await refresh();
      if (result.checked) {
        toast(result.found > 0 ? "Pence found an offer." : "Nothing good enough yet. Pence will keep looking every day.");
      } else if (!quietIfSkipped) {
        toast("Checked a moment ago. Pence keeps looking every day.");
      }
    } catch (err) {
      toast(errorText(err, "Couldn’t check just now. Pence will try again later."));
    } finally {
      mark(id, false);
    }
  }

  async function add(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await addWatch({ data: { what, most, town } });
      setWhat("");
      setMost("");
      setTown("");
      await refresh();
      if (result.existing) toast("You’re already watching that.");
      void check(result.id, true);
    } catch (err) {
      setError(errorText(err, "Couldn’t start watching that."));
    } finally {
      setBusy(false);
    }
  }

  async function answer(item: WatchItem, take: boolean, offerId = "") {
    mark(item.id, true);
    try {
      await answerWatch({ data: { id: item.id, take, offerId } });
      await refresh();
      toast(take ? "Done. The offer is saved below." : "Pence will keep watching for a lower price.");
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

  return (
    <div>
      <PageHead kicker="Price watch" title="Wait for a better price" />

      <form onSubmit={(event) => void add(event)} className="panel flex flex-col gap-4 p-4">
        <label className="field">
          <span className="field-label">What do you want?</span>
          <input
            className="control"
            value={what}
            maxLength={120}
            placeholder="iPhone 17 Pro 256GB"
            onChange={(event) => setWhat(event.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">The most you’d pay (£), if you know</span>
          <input
            className="control tabular-nums"
            inputMode="decimal"
            value={most}
            placeholder="800"
            onChange={(event) => setMost(event.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">Town, if it’s a place or a service</span>
          <input className="control" value={town} placeholder="Birmingham" onChange={(event) => setTown(event.target.value)} />
        </label>
        {error ? <p className="text-sm text-clay">{error}</p> : null}
        <button className="btn btn-primary" type="submit" disabled={busy || what.trim().length < 2}>
          {busy ? "Saving…" : "Watch the price"}
        </button>
        <p className="text-sm text-muted">Pence looks now, then every day. It asks you before anything is done.</p>
      </form>

      {watches.isPending ? <div className="mt-6 h-32 animate-pulse rounded-lg bg-sand" /> : null}
      {watches.isError ? (
        <p className="panel mt-6 p-4 text-sm">{errorText(watches.error, "Couldn’t load your watches just now.")}</p>
      ) : null}

      {found.length > 0 ? (
        <section className="mt-6">
          <h2 className="font-display text-2xl">Pence found a price</h2>
          <ul className="mt-3 space-y-4">
            {found.map((item) => (
              <li key={item.id} className="panel border-forest p-4">
                <p className="font-medium">{item.what}</p>
                <p className="text-sm text-muted">{limitText(item)}</p>
                <p className="mt-2 text-sm font-medium">Is the price right for you?</p>
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
                        className="btn btn-primary mt-2"
                        disabled={working.includes(item.id)}
                        onClick={() => void answer(item, true, offer.id)}
                      >
                        Happy with this price
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 border-t border-line pt-3">
                  <p className="text-sm text-muted">
                    Not happy with {item.offers.length > 1 ? "these prices" : "this price"}? Pence will keep watching for a lower one.
                  </p>
                  <button
                    type="button"
                    className="btn btn-quiet mt-2"
                    disabled={working.includes(item.id)}
                    onClick={() => void answer(item, false)}
                  >
                    Still too much, keep watching
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {waiting.length > 0 ? (
        <section className="mt-6">
          <h2 className="font-display text-2xl">Watching</h2>
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
                {item.lowest?.pricePence != null ? (
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
        </section>
      ) : null}

      {!watches.isPending && items.length === 0 ? (
        <p className="panel mt-6 p-4 text-sm text-muted">
          Nothing watched yet. Add something you want but not at today’s price, like a phone, trainers, a hotel, or a meal out.
        </p>
      ) : null}

      {done.length > 0 ? (
        <section className="mt-6">
          <h2 className="font-display text-2xl">Done</h2>
          <ul className="mt-3 space-y-3">
            {done.map((item) => {
              const offer = item.offers[0];
              return (
                <li key={item.id} className="panel p-4">
                  <p className="text-sm text-muted">You took this price</p>
                  <p className="mt-1 font-medium">{item.what}</p>
                  {offer ? (
                    <>
                      <p className="mt-2 tabular-nums">
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
        </section>
      ) : null}

      <PhoneAlerts />
    </div>
  );
}
