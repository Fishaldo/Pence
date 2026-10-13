import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { findOffers, type Offer } from "@/server/plan";
import { hotDeals, type HotDeal } from "@/server/hotukdeals";
import { publicDeals } from "@/server/public-deals";
import { mergeDeals } from "@/lib/spend/deals";
import { answerBrief, answerWords, questionsFor, type PlanAnswers } from "@/lib/spend/plan-questions";
import { savePhonePlace } from "@/server/ledger";
import { addWatch, checkWatchNow } from "@/server/watch";
import { useLedger } from "./data";
import { DealAction } from "./deal-bits";
import { errorText, PageHead } from "./ui";

function placeWords(town: string): string[] {
  return town
    .toLowerCase()
    .replace(/['’]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 3 && !["upon", "city", "near", "town"].includes(word));
}

function mentionsPlace(text: string, words: string[]): boolean {
  if (words.length === 0) return false;
  const hay = text.toLowerCase();
  return words.some((word) => hay.includes(word));
}

const BOARD: Partial<Record<string, string>> = {
  dining: "restaurant",
  groceries: "supermarket",
  pub: "pub",
  holiday: "hotel",
  travel: "travel",
};

const EXTRA: Partial<Record<string, string[]>> = {
  groceries: ["tesco", "asda", "aldi", "sainsburys", "morrisons", "lidl"],
  dining: ["meal deal", "takeaway"],
  pub: ["pub offer"],
};

const GROUPS: { label: string; kinds: [string, string][] }[] = [
  {
    label: "Food",
    kinds: [
      ["groceries", "Groceries"],
      ["dining", "Dining"],
      ["pub", "Pub"],
    ],
  },
  {
    label: "Home",
    kinds: [
      ["rent", "Rent"],
      ["energy", "Gas and electricity"],
      ["water", "Water"],
      ["broadband", "Broadband"],
      ["mobile", "Mobile contract"],
      ["tv", "TV"],
      ["bills", "Council tax and other bills"],
      ["insurance", "Insurance"],
      ["repairs", "Home repairs"],
      ["furniture", "Furniture and appliances"],
      ["household", "Household"],
      ["garden", "Garden"],
    ],
  },
  {
    label: "Getting around",
    kinds: [
      ["transport", "Fuel and transport"],
      ["parking", "Parking"],
      ["car", "Car"],
      ["bike", "Bike"],
      ["driving", "Driving lessons"],
      ["holiday", "Holiday"],
      ["travel", "Travel"],
    ],
  },
  {
    label: "Shopping",
    kinds: [
      ["tech", "Phone and electronics"],
      ["fashion", "Fashion and shoes"],
      ["gifts", "Gifts"],
    ],
  },
  {
    label: "You",
    kinds: [
      ["health", "Health"],
      ["personal", "Personal care"],
      ["fitness", "Gym and fitness"],
      ["sport", "Sport"],
      ["entertainment", "Entertainment"],
      ["hobbies", "Hobbies"],
    ],
  },
  {
    label: "Life",
    kinds: [
      ["kids", "Kids and baby"],
      ["childcare", "Childcare"],
      ["pets", "Pets"],
      ["education", "Education"],
      ["subscriptions", "Subscriptions"],
      ["events", "Wedding and parties"],
      ["moving", "Moving house"],
      ["charity", "Charity"],
      ["other", "Something else"],
    ],
  },
];

type KindId = (typeof GROUPS)[number]["kinds"][number][0];

export function PlanView() {
  const client = useQueryClient();
  const { profile, places } = useLedger();
  const saved = places.data ?? [];
  const cityDefault = profile.data?.city ?? "";
  const [kind, setKind] = useState<KindId>("groceries");
  const [place, setPlace] = useState("");
  const [budget, setBudget] = useState("");
  const [items, setItems] = useState("");
  const [country, setCountry] = useState("United Kingdom");
  const [city, setCity] = useState("");
  // Where: "home" (the town from setup), "place:<id>" (a saved place), or "manual".
  const [where, setWhere] = useState<string>("");
  const [locating, setLocating] = useState(false);
  const [watching, setWatching] = useState(false);
  const [watched, setWatched] = useState<{ label: string; existing: boolean } | null>(null);
  const [when, setWhen] = useState("");
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [hot, setHot] = useState<HotDeal[] | null>(null);
  const [hotShown, setHotShown] = useState(8);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [whatOpen, setWhatOpen] = useState(false);
  const [answers, setAnswers] = useState<PlanAnswers>({});
  const questions = questionsFor(kind);

  // Last time's answers for this What come back, so only what is different needs a tap.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(`pence-plan-${kind}`);
      setAnswers(saved ? (JSON.parse(saved) as PlanAnswers) : {});
    } catch {
      setAnswers({});
    }
  }, [kind]);

  function answer(id: string, label: string) {
    setAnswers((current) => {
      const next = { ...current };
      if (next[id] === label) delete next[id];
      else next[id] = label;
      try {
        window.localStorage.setItem(`pence-plan-${kind}`, JSON.stringify(next));
      } catch {
        /* remembering is a convenience only */
      }
      return next;
    });
  }
  const firstChoice = cityDefault ? "home" : saved[0] ? `place:${saved[0].id}` : "manual";
  const choice = where || firstChoice;
  const chosenPlace = choice.startsWith("place:") ? saved.find((item) => `place:${item.id}` === choice) : undefined;
  const manual = choice === "manual" || (choice.startsWith("place:") && !chosenPlace);
  const town = manual ? city : choice === "home" ? cityDefault : chosenPlace?.town || chosenPlace?.label || "";
  const placeCountry = manual ? country : "United Kingdom";
  const trip = kind === "holiday" || kind === "travel";
  const whatLabel = GROUPS.flatMap((group) => group.kinds).find(([id]) => id === kind)?.[1] ?? "Choose";

  useEffect(() => {
    if (!whatOpen) return;
    const onPop = () => setWhatOpen(false);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [whatOpen]);

  function openWhat() {
    window.history.pushState({ penceWhat: 1 }, "");
    setWhatOpen(true);
  }

  function closeWhat() {
    setWhatOpen(false);
    if ((window.history.state as { penceWhat?: number } | null)?.penceWhat) window.history.back();
  }

  function pickWhere(value: string) {
    if (value === "phone-now") {
      void locateMe();
      return;
    }
    setWhere(value);
  }

  async function locateMe() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("This phone can’t share its location. Pick a saved place or type one.");
      return;
    }
    setLocating(true);
    setError("");
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: false, timeout: 15_000, maximumAge: 600_000 }),
      );
      const found = await savePhonePlace({ data: { lat: position.coords.latitude, lng: position.coords.longitude } });
      await client.invalidateQueries({ queryKey: ["places"] });
      setWhere(`place:${found.id}`);
      toast(found.town ? `Using your location: ${found.town}` : "Using your location");
    } catch (err) {
      const denied = typeof err === "object" && err != null && "code" in err && (err as { code: number }).code === 1;
      setError(
        denied
          ? "Location is off for Pence. Allow it in your phone’s settings, or pick a saved place."
          : errorText(err, "Couldn’t find your location. Pick a saved place or type one."),
      );
    } finally {
      setLocating(false);
    }
  }

  async function addToWatchlist() {
    setError("");
    if (items.trim().length < 2 && place.trim().length < 2) {
      setError("To add to your Watchlist, fill in the item, or the shop or place.");
      return;
    }
    setWatching(true);
    try {
      const result = await addWatch({
        data: {
          item: items.trim(),
          shop: place.trim(),
          town: town.trim(),
          most: budget.trim(),
          kind,
        },
      });
      await client.invalidateQueries({ queryKey: ["watches"] });
      setWatched({
        label: items.trim() && place.trim() ? `${items.trim()} at ${place.trim()}` : items.trim() || place.trim(),
        existing: result.existing,
      });
      if (!result.existing) {
        void checkWatchNow({ data: { id: result.id } })
          .then(() => client.invalidateQueries({ queryKey: ["watches"] }))
          .catch(() => undefined);
      }
    } catch (err) {
      setError(errorText(err, "Couldn’t add that to your Watchlist."));
    } finally {
      setWatching(false);
    }
  }

  async function search(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setOffers(null);
    setHot(null);
    setHotShown(15);
    const label = GROUPS.flatMap((group) => group.kinds).find(([id]) => id === kind)?.[1] ?? "";
    setWatched(null);
    const inBritain = /united kingdom|\buk\b|england|scotland|wales|britain/i.test(placeCountry);
    const extra = answerWords(kind, answers);
    if (inBritain) {
      const focus = items.trim();
      const category = BOARD[kind] || label;
      const local = town.trim();
      const base = focus || category;
      const queries = [
        local ? `${local} ${base}${extra ? ` ${extra}` : ""}` : "",
        extra ? `${base} ${extra}` : "",
        local ? `${local} ${base}` : "",
        base,
        focus ? `${local ? `${local} ` : ""}${category}` : "",
        place.trim(),
        ...(focus ? [] : (EXTRA[kind] ?? [])),
      ]
        .map((item) => item.replace(/\s+/g, " ").trim())
        .filter((item, index, all) => item.length >= 2 && all.indexOf(item) === index)
        .slice(0, 6);
      void hotDeals({ data: { queries, limit: 80, related: true } })
        .then((found) => setHot((prev) => mergeDeals(found, prev ?? [], 80)))
        .catch(() => setHot((prev) => prev ?? []));
      void publicDeals({ data: { queries: queries.slice(0, 4), limit: 24, strict: true } })
        .then((found) => setHot((prev) => mergeDeals(prev ?? [], found, 80)))
        .catch(() => setHot((prev) => prev ?? []));
    }
    try {
      const result = await findOffers({
        data: { kind, place, budget, country: placeCountry, city: town, when, items, details: answerBrief(kind, answers) },
      });
      setOffers(result.offers);
      setNote(result.note);
    } catch (err) {
      setError(errorText(err, "Couldn’t check offers just now."));
    } finally {
      setBusy(false);
    }
  }

  const near = placeWords(town);
  const listed = [
    ...(offers ?? []).map((offer) => ({
      key: `offer:${offer.url}`,
      source: offer.facet,
      title: offer.title,
      detail: offer.detail,
      url: offer.url,
      shopUrl: "",
      merchant: "",
      code: offer.code,
      text: `${offer.title} ${offer.detail} ${offer.facet}`,
    })),
    ...(hot ?? []).map((deal) => ({
      key: `hot:${deal.url}`,
      source: deal.source,
      title: deal.title,
      detail: "",
      url: deal.url,
      shopUrl: deal.shopUrl ?? "",
      merchant: deal.merchant ?? "",
      code: deal.code ?? "",
      text: `${deal.title} ${deal.source}`,
    })),
  ];
  if (near.length > 0) {
    listed.sort((a, b) => Number(mentionsPlace(b.text, near)) - Number(mentionsPlace(a.text, near)));
  }

  return (
    <div>
      <PageHead kicker="Plan" title="Before you spend" />
      <form onSubmit={(event) => void search(event)} className="flex flex-col gap-4">
        <div className="field">
          <span className="field-label">What</span>
          <button type="button" className="control text-left" onClick={openWhat}>
            {whatLabel}
          </button>
        </div>
        {questions.map((question) => (
          <fieldset key={question.id} className="field">
            <legend className="field-label">{question.label}</legend>
            <div className="mt-1 flex flex-wrap gap-2">
              {question.choices.map((choice) => {
                const on = answers[question.id] === choice.label;
                return (
                  <button
                    key={choice.label}
                    type="button"
                    aria-pressed={on}
                    className={`min-h-11 rounded-full px-4 text-sm font-medium ${on ? "bg-forest text-foam" : "border border-line bg-card text-ink"}`}
                    onClick={() => answer(question.id, choice.label)}
                  >
                    {choice.label}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}
        <label className="field">
          <span className="field-label">Saved place</span>
          <select
            className="control"
            value={locating ? "phone-now" : choice}
            disabled={locating}
            onChange={(event) => pickWhere(event.target.value)}
          >
            {cityDefault ? <option value="home">Your town · {cityDefault}</option> : null}
            {saved.map((item) => (
              <option key={item.id} value={`place:${item.id}`}>
                {item.label}
                {item.town ? ` · ${item.town}` : ""}
              </option>
            ))}
            <option value="phone-now">{locating ? "Finding you…" : "Use my location now"}</option>
            <option value="manual">Type a place</option>
          </select>
        </label>
        {manual ? (
          <>
            <label className="field">
              <span className="field-label">Country</span>
              <input className="control" value={country} placeholder="China" onChange={(event) => setCountry(event.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Town or city</span>
              <input
                className="control"
                placeholder={trip ? "Beijing" : "Liverpool"}
                value={city}
                onChange={(event) => setCity(event.target.value)}
              />
            </label>
          </>
        ) : null}
        <label className="field">
          <span className="field-label">Item, if you have one</span>
          <input
            className="control"
            value={items}
            placeholder="Latest iPhone"
            onChange={(event) => setItems(event.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">Shop or place, if you have one</span>
          <input
            className="control"
            value={place}
            placeholder={trip ? "Optional" : "ASDA, a restaurant, a gym"}
            onChange={(event) => setPlace(event.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">Date, if you have one</span>
          <input className="control" type="date" value={when} onChange={(event) => setWhen(event.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Budget (£), if you have one</span>
          <input
            className="control tabular-nums"
            inputMode="decimal"
            placeholder={trip ? "400" : "20"}
            value={budget}
            onChange={(event) => setBudget(event.target.value)}
          />
        </label>
        {error ? <p className="text-sm text-clay">{error}</p> : null}
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "Looking up offers…" : "Find offers"}
        </button>
        <button type="button" className="btn btn-quiet" disabled={watching} onClick={() => void addToWatchlist()}>
          {watching ? "Adding…" : "Add to Watchlist"}
        </button>
        <p className="-mt-2 text-sm text-muted">
          Watchlist: Pence keeps looking every day and tells you when an offer turns up. Needs an item, or a shop or place.
        </p>
      </form>
      {watched ? (
        <section className="panel mt-6 border-forest p-4" aria-live="polite">
          <p className="font-medium">{watched.existing ? "Already on your Watchlist" : "Added to your Watchlist"}</p>
          <p className="mt-1 text-sm">{watched.label}</p>
          <p className="mt-1 text-sm text-muted">Pence is looking now, then every day. Offers it finds show in Offers.</p>
          <Link to="/offers" hash="watchlist" className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-forest">
            See your Watchlist
          </Link>
        </section>
      ) : null}
      {listed.length > 0 ? (
        <section className="mt-6">
          <ul className="space-y-3">
            {listed.slice(0, hotShown).map((row) => (
              <li key={row.key} className="panel p-4">
                {row.source ? <p className="text-sm text-muted">{row.source}</p> : null}
                <p className={row.source ? "mt-1 font-medium" : "font-medium"}>{row.title}</p>
                {row.detail ? <p className="mt-1 text-sm">{row.detail}</p> : null}
                <DealAction deal={row} />
              </li>
            ))}
          </ul>
          {listed.length > hotShown ? (
            <button type="button" className="btn btn-quiet mt-4" onClick={() => setHotShown((count) => count + 15)}>
              More
            </button>
          ) : null}
          {!busy && note ? <p className="mt-3 text-sm text-muted">{note}</p> : null}
        </section>
      ) : null}
      {!busy && offers && listed.length === 0 ? <p className="panel mt-6 p-4 text-sm">{note}</p> : null}
      {offers && !busy && !watched ? (
        <section className="panel mt-6 p-4">
          <p className="font-medium">Not the price you want?</p>
          <p className="mt-1 text-sm text-muted">
            Add it to your Watchlist. Pence keeps looking and tells you when a better offer turns up.
          </p>
          <button type="button" className="btn btn-quiet mt-3" disabled={watching} onClick={() => void addToWatchlist()}>
            Add to Watchlist
          </button>
        </section>
      ) : null}
      {whatOpen ? (
        <div className="fixed inset-0 z-40 flex items-end">
          <button type="button" className="absolute inset-0 bg-ink/40" aria-label="Close" onClick={closeWhat} />
          <div className="relative max-h-[70dvh] w-full overflow-y-auto rounded-t-2xl bg-card px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <p className="text-sm text-muted">What</p>
            {GROUPS.map((group) => (
              <div key={group.label} className="mt-3">
                <p className="text-xs tracking-[0.14em] text-muted uppercase">{group.label}</p>
                <ul className="mt-1">
                  {group.kinds.map(([id, label]) => (
                    <li key={id}>
                      <button
                        type="button"
                        className="flex min-h-11 w-full items-center text-left text-sm"
                        onClick={() => {
                          setKind(id);
                          closeWhat();
                        }}
                      >
                        {label}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
