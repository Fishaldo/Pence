import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Check, ChevronDown } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { findOffers, type Offer } from "@/server/plan";
import { hotDeals, type HotDeal } from "@/server/hotukdeals";
import { publicDeals } from "@/server/public-deals";
import { mergeDeals } from "@/lib/core/deals";
import { answerBrief, answerWords, questionsFor, type PlanAnswers } from "@/lib/core/plan-questions";
import { planKindFor, planQueries } from "@/lib/core/plan-item";
import { savePhonePlace } from "@/server/ledger";
import { addWatch, checkWatchNow } from "@/server/watch";
import { BudgetView } from "./budget";
import { useLedger } from "./data";
import { DealAction } from "./deal-bits";
import { PageHead } from "./ui";
import { errorText } from "./error-text";

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
  diy: ["screwfix", "toolstation", "b&q", "wickes"],
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
      ["diy", "DIY, tools and plumbing"],
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

/**
 * Plan: a spend before you make it, or this pay's budget. Budget is at
 * /plan#budget, so Home, Insights and the weekly check-in can open it directly.
 */
export function PlanScreen() {
  const navigate = useNavigate();
  const onBudget = useRouterState({ select: (s) => s.location.hash }) === "budget";
  const pick = (budget: boolean) => {
    if (budget !== onBudget) void navigate({ to: "/plan", hash: budget ? "budget" : undefined, replace: true });
  };
  return (
    <div>
      <header className="mb-4 flex flex-col gap-3">
        <h1 className="page-title">Plan</h1>
        <div role="group" aria-label="Plan" className="grid grid-cols-2 gap-2">
          <button type="button" className="chip justify-center" aria-pressed={!onBudget} onClick={() => pick(false)}>
            Plan a spend
          </button>
          <button type="button" className="chip justify-center" aria-pressed={onBudget} onClick={() => pick(true)}>
            Budget
          </button>
        </div>
      </header>
      {onBudget ? <BudgetView embedded /> : <PlanView embedded />}
    </div>
  );
}

export function PlanView({ embedded = false }: { embedded?: boolean }) {
  const client = useQueryClient();
  const { profile, places } = useLedger();
  const saved = places.data ?? [];
  const cityDefault = profile.data?.city ?? "";
  const [kind, setKind] = useState<KindId>("groceries");
  const [place, setPlace] = useState("");
  const [budget, setBudget] = useState("");
  const [items, setItems] = useState("");
  // Size, type or must-haves, in their own words.
  const [need, setNeed] = useState("");
  // Set once they choose a What themselves; until then the item picks it.
  const [kindChosen, setKindChosen] = useState(false);
  const [kindGuessed, setKindGuessed] = useState(false);
  // A search that ran slow: shown quietly under the deals, or as an error when there are none.
  const [slow, setSlow] = useState("");
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

  /** Typing an item picks the What, until they choose one themselves: a kitchen tap is DIY, not groceries. */
  function typeItem(value: string) {
    setItems(value);
    if (kindChosen) return;
    const guess = planKindFor(value);
    if (guess && GROUPS.some((group) => group.kinds.some(([id]) => id === guess))) {
      setKind(guess);
      setKindGuessed(true);
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
    setSlow("");
    setOffers(null);
    setHot(null);
    setHotShown(15);
    const label = GROUPS.flatMap((group) => group.kinds).find(([id]) => id === kind)?.[1] ?? "";
    setWatched(null);
    const inBritain = /united kingdom|\buk\b|england|scotland|wales|britain/i.test(placeCountry);
    const extra = answerWords(kind, answers);
    if (inBritain) {
      const queries = planQueries({
        item: items,
        details: need,
        shop: place,
        town,
        answers: extra,
        category: BOARD[kind] || label,
        extra: EXTRA[kind],
      });
      void hotDeals({ data: { queries, limit: 80, related: true } })
        .then((found) => setHot((prev) => mergeDeals(found, prev ?? [], 80)))
        .catch(() => setHot((prev) => prev ?? []));
      void publicDeals({ data: { queries: queries.slice(0, 4), limit: 24, strict: true } })
        .then((found) => setHot((prev) => mergeDeals(prev ?? [], found, 80)))
        .catch(() => setHot((prev) => prev ?? []));
    }
    try {
      const result = await findOffers({
        data: { kind, place, budget, country: placeCountry, city: town, when, items, need, details: answerBrief(kind, answers) },
      });
      setOffers(result.offers);
      setNote(result.note);
    } catch (err) {
      setSlow(errorText(err, "Couldn’t check offers just now."));
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

  const nearRows = near.length > 0 ? listed.filter((row) => mentionsPlace(row.text, near)) : [];
  const ukRows = listed.filter((row) => !nearRows.includes(row));
  const shownNear = nearRows.slice(0, hotShown);
  const shownUk = ukRows.slice(0, Math.max(0, hotShown - shownNear.length));

  const dealItem = (row: (typeof listed)[number]) => {
    const shop = row.merchant || row.source;
    return (
      <li key={row.key} className="flex flex-col gap-1.5 px-4 py-3.5">
        {shop ? <span className="text-[0.8125rem] font-semibold text-muted">{shop}</span> : null}
        <span className="text-[0.9375rem] leading-snug font-extrabold">{row.title}</span>
        {row.detail ? <span className="text-sm text-ink-soft">{row.detail}</span> : null}
        <DealAction deal={row} />
      </li>
    );
  };

  return (
    <div>
      {embedded ? (
        <p className="mb-4 text-sm leading-[1.45] text-muted">Before you buy: deals near you first, then across the UK.</p>
      ) : (
        <PageHead title="Plan a spend" sub="Before you buy: deals near you first, then across the UK." />
      )}
      <form onSubmit={(event) => void search(event)} className="flex flex-col gap-4" aria-label="What are you planning">
        <label className="field">
          <span className="field-label">
            Item <span className="font-normal text-muted">(optional)</span>
          </span>
          <input
            className="control"
            value={items}
            maxLength={160}
            placeholder="Kitchen tap, sofa, iPhone 16"
            onChange={(event) => typeItem(event.target.value)}
          />
        </label>
        {items.trim() ? (
          <label className="field">
            <span className="field-label">
              Details <span className="font-normal text-muted">(optional)</span>
            </span>
            <textarea
              className="control min-h-[5.5rem] resize-none py-3 leading-snug [field-sizing:content]"
              value={need}
              maxLength={400}
              rows={2}
              placeholder="Size, type or must-haves. For example: monobloc mixer, works on high and low pressure"
              onChange={(event) => setNeed(event.target.value)}
            />
          </label>
        ) : null}
        <div className="field">
          <span className="field-label" id="what-label">
            What
          </span>
          <button
            type="button"
            className="control flex items-center justify-between gap-3 text-left font-bold"
            aria-labelledby="what-label what-value"
            aria-haspopup="dialog"
            onClick={openWhat}
          >
            <span id="what-value">{whatLabel}</span>
            <ChevronDown className="size-5 text-muted" strokeWidth={2} aria-hidden="true" />
          </button>
          {kindGuessed && !kindChosen ? <span className="text-[0.8125rem] text-muted">Picked from your item. Tap to change.</span> : null}
        </div>
        {questions.map((question) => (
          <fieldset key={question.id} className="flex flex-col gap-2">
            <legend className="mb-2 text-[0.9375rem] font-extrabold">{question.label}</legend>
            <div className="flex flex-wrap gap-2">
              {question.choices.map((choice) => (
                <button
                  key={choice.label}
                  type="button"
                  aria-pressed={answers[question.id] === choice.label}
                  className="chip"
                  onClick={() => answer(question.id, choice.label)}
                >
                  {choice.label}
                </button>
              ))}
            </div>
          </fieldset>
        ))}
        <label className="field">
          <span className="field-label">Where</span>
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
          <div className="grid grid-cols-2 gap-3">
            <label className="field">
              <span className="field-label">Country</span>
              <input className="control" value={country} placeholder="China" onChange={(event) => setCountry(event.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Town</span>
              <input
                className="control"
                placeholder={trip ? "Beijing" : "Liverpool"}
                value={city}
                onChange={(event) => setCity(event.target.value)}
              />
            </label>
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <label className="field">
            <span className="field-label">
              When <span className="font-normal text-muted">(optional)</span>
            </span>
            <input className="control" type="date" value={when} onChange={(event) => setWhen(event.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">
              Budget <span className="font-normal text-muted">(optional)</span>
            </span>
            <input
              className="control tabular-nums"
              inputMode="decimal"
              placeholder={trip ? "£400" : "£20"}
              value={budget}
              onChange={(event) => setBudget(event.target.value)}
            />
          </label>
        </div>
        <label className="field">
          <span className="field-label">
            Shop <span className="font-normal text-muted">(optional)</span>
          </span>
          <input
            className="control"
            value={place}
            placeholder={trip ? "Any" : "Any shop"}
            onChange={(event) => setPlace(event.target.value)}
          />
        </label>
        {error ? <p className="text-sm text-clay">{error}</p> : null}
        {slow && !busy && listed.length === 0 ? <p className="text-sm text-clay">{slow}</p> : null}
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "Looking up deals…" : "Find deals"}
        </button>
        <button type="button" className="btn btn-quiet" disabled={watching} onClick={() => void addToWatchlist()}>
          {watching ? "Adding…" : "Add to Watchlist"}
        </button>
        <p className="-mt-2 text-[0.8125rem] text-muted">
          Watchlist: Pence keeps looking every day and tells you when an offer turns up. Needs an item, or a shop.
        </p>
      </form>
      {watched ? (
        <section className="panel mt-6 flex flex-col gap-1 border-forest p-4" aria-live="polite">
          <p className="font-extrabold">{watched.existing ? "Already on your Watchlist" : "Added to your Watchlist"}</p>
          <p className="text-sm">{watched.label}</p>
          <p className="text-sm text-muted">Pence is looking now, then every day. Offers it finds show in Offers.</p>
          <Link to="/watchlist" className="link self-start">
            See your Watchlist
          </Link>
        </section>
      ) : null}
      {listed.length > 0 ? (
        <section className="mt-6 flex flex-col gap-2.5" aria-label="Results">
          <h2 className="section-title">Deals found</h2>
          <div className="panel overflow-hidden">
            {shownNear.length > 0 ? (
              <>
                <p className="bg-paper px-4 py-2 text-[0.6875rem] font-extrabold tracking-[0.08em] text-muted uppercase">
                  Near {town}
                </p>
                <ul className="divide-y divide-line">{shownNear.map(dealItem)}</ul>
              </>
            ) : null}
            {shownUk.length > 0 ? (
              <>
                <p className="bg-paper px-4 py-2 text-[0.6875rem] font-extrabold tracking-[0.08em] text-muted uppercase">
                  Across the UK
                </p>
                <ul className="divide-y divide-line">{shownUk.map(dealItem)}</ul>
              </>
            ) : null}
          </div>
          {listed.length > hotShown ? (
            <button type="button" className="btn btn-quiet" onClick={() => setHotShown((count) => count + 15)}>
              More
            </button>
          ) : null}
          {!busy && slow ? (
            <p className="text-[0.8125rem] text-muted">The wider web search was slow, so these come from deal boards. Search again for more.</p>
          ) : null}
          {!busy && note ? <p className="text-[0.8125rem] text-muted">{note}</p> : null}
        </section>
      ) : null}
      {!busy && offers && listed.length === 0 ? <p className="panel mt-6 p-4 text-sm">{note}</p> : null}
      {offers && !busy && !watched ? (
        <section className="panel mt-6 flex flex-col gap-1 p-4">
          <p className="font-extrabold">Not the price you want?</p>
          <p className="text-sm text-muted">Add it to your Watchlist. Pence keeps looking and tells you when a better offer turns up.</p>
          <button type="button" className="btn btn-quiet mt-2" disabled={watching} onClick={() => void addToWatchlist()}>
            Add to Watchlist
          </button>
        </section>
      ) : null}
      {whatOpen ? (
        <div className="fixed inset-0 z-40 flex flex-col justify-end">
          <button type="button" className="absolute inset-0 bg-[#6e7671]/80" aria-label="Close the list" onClick={closeWhat} />
          <section
            role="dialog"
            aria-label="What are you planning?"
            className="relative mx-auto flex max-h-[80dvh] w-full max-w-[560px] flex-col gap-3 overflow-y-auto rounded-t-3xl bg-card px-5 pt-3 pb-[max(1.75rem,env(safe-area-inset-bottom))]"
          >
            <span className="h-[5px] w-10 shrink-0 self-center rounded-full bg-line-strong" aria-hidden="true" />
            <h2 className="text-xl font-extrabold">What are you planning?</h2>
            {GROUPS.map((group) => (
              <div key={group.label} role="radiogroup" aria-label={group.label}>
                <p className="mt-1 text-[0.6875rem] font-extrabold tracking-[0.08em] text-muted uppercase">{group.label}</p>
                {group.kinds.map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={kind === id}
                    className={`flex min-h-11 w-full items-center justify-between border-b border-rule text-left text-base ${kind === id ? "font-extrabold" : "font-semibold"}`}
                    onClick={() => {
                      setKind(id);
                      setKindChosen(true);
                      closeWhat();
                    }}
                  >
                    <span>{label}</span>
                    {kind === id ? <Check className="size-[22px] text-forest" strokeWidth={2.4} aria-hidden="true" /> : null}
                  </button>
                ))}
              </div>
            ))}
            <span className="text-[0.8125rem] text-muted">Tap outside or use your phone’s back button to close.</span>
          </section>
        </div>
      ) : null}
    </div>
  );
}
