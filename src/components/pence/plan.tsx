import { useEffect, useState } from "react";
import { findOffers, type Offer } from "@/server/plan";
import { hotDeals, type HotDeal } from "@/server/hotukdeals";
import { publicDeals } from "@/server/public-deals";
import { mergeDeals } from "@/lib/spend/deals";
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
  const { profile, places } = useLedger();
  const saved = places.data ?? [];
  const cityDefault = profile.data?.city ?? "";
  const [kind, setKind] = useState<KindId>("groceries");
  const [place, setPlace] = useState("");
  const [budget, setBudget] = useState("");
  const [items, setItems] = useState("");
  const [country, setCountry] = useState("United Kingdom");
  const [city, setCity] = useState("");
  const [cityTouched, setCityTouched] = useState(false);
  const [when, setWhen] = useState("");
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [hot, setHot] = useState<HotDeal[] | null>(null);
  const [hotShown, setHotShown] = useState(8);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [whatOpen, setWhatOpen] = useState(false);
  const town = cityTouched ? city : city || cityDefault;
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

  async function search(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setOffers(null);
    setHot(null);
    setHotShown(15);
    const label = GROUPS.flatMap((group) => group.kinds).find(([id]) => id === kind)?.[1] ?? "";
    const inBritain = /united kingdom|\buk\b|england|scotland|wales|britain/i.test(country);
    if (inBritain) {
      const focus = items.trim();
      const category = BOARD[kind] || label;
      const local = town.trim();
      const queries = [
        local ? `${local} ${focus || category}` : "",
        focus || category,
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
        data: { kind, place, budget, country, city: town, when, items },
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
        <label className="field">
          <span className="field-label">Country</span>
          <input className="control" value={country} placeholder="China" onChange={(event) => setCountry(event.target.value)} />
        </label>
        {saved.length > 0 ? (
          <label className="field">
            <span className="field-label">Saved place</span>
            <select
              className="control"
              value=""
              onChange={(event) => {
                const found = saved.find((item) => item.id === event.target.value);
                if (!found) return;
                setCityTouched(true);
                setCity(found.town || found.label);
              }}
            >
              <option value="">Pick a saved place, or type a town</option>
              {saved.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                  {item.town ? ` · ${item.town}` : ""}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="field">
          <span className="field-label">Town or city</span>
          <input
            className="control"
            placeholder={trip ? "Beijing" : "Liverpool"}
            value={town}
            onChange={(event) => {
              setCityTouched(true);
              setCity(event.target.value);
            }}
          />
        </label>
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
        <label className="field">
          <span className="field-label">Shop, if you have one</span>
          <input
            className="control"
            value={place}
            placeholder={trip ? "Optional" : "McDonald’s"}
            onChange={(event) => setPlace(event.target.value)}
          />
        </label>
        {error ? <p className="text-sm text-clay">{error}</p> : null}
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "Looking up offers…" : "Find offers"}
        </button>
      </form>
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
      {offers && !busy ? (
        <a
          href={`/watch?what=${encodeURIComponent((items.trim() || place.trim() || whatLabel).slice(0, 120))}${
            budget.trim() ? `&most=${encodeURIComponent(budget.trim())}` : ""
          }`}
          className="panel mt-6 block p-4"
        >
          <p className="font-medium">Not the price you want?</p>
          <p className="mt-1 text-sm text-muted">Pence can watch it and tell you when a better offer turns up.</p>
          <p className="mt-2 text-sm font-medium text-forest">Watch the price</p>
        </a>
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
