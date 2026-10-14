import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Eye, MapPin } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { formatGBP, PROGRAMMES } from "@/lib/core/model";
import { habitLine, interestDef, interestOfKey, shortDay, type TasteProfile, type Upcoming } from "@/lib/core/habits";
import { setHabit, type PersonalDeal } from "@/server/for-you";
import { useForYou, useForYouWide, useWatches } from "./data";
import { DealAction } from "./deal-bits";
import { goUrl } from "./deal-links";
import { errorText, PageHead } from "./ui";
import { Watchlist } from "./watch";

const SCHEMES: { test: RegExp; id: string }[] = [
  { test: /tesco/, id: "clubcard" },
  { test: /sainsbury/, id: "nectar" },
  { test: /lidl/, id: "lidl" },
  { test: /aldi/, id: "aldi" },
  { test: /boots/, id: "boots" },
  { test: /uber|bolt/, id: "rides" },
];

const PAGE = 30;

const OFFERS_LINE = "From the shops’ own pages. A price, code or end date shows only when the page states it.";

/** Near you first, then the shops this person already uses. */
/** A deal with something to check first ("only some areas") ranks below one that plainly works. */
function doubtful(deal: PersonalDeal): boolean {
  return Boolean(deal.check) && !deal.works;
}

function rank(a: PersonalDeal, b: PersonalDeal): number {
  return (
    Number(a.elsewhere) - Number(b.elsewhere) ||
    Number(b.works) - Number(a.works) ||
    Number(b.local) - Number(a.local) ||
    Number(doubtful(a)) - Number(doubtful(b)) ||
    Number(b.yours) - Number(a.yours)
  );
}

/** What Pence read in the terms, and the end date the page prints. */
export function DealTerms({ deal }: { deal: PersonalDeal }) {
  if (!deal.check && !deal.endsOn) return null;
  return (
    <>
      {deal.check ? (
        <p className={`mt-1 text-sm ${deal.works ? "text-forest" : "text-clay"}`}>{deal.check}</p>
      ) : null}
      {deal.endsOn ? <p className="mt-1 text-sm text-muted">Ends {shortDay(deal.endsOn)}</p> : null}
    </>
  );
}

export function DealCard({ deal, showReason = true }: { deal: PersonalDeal; showReason?: boolean }) {
  const shop = deal.merchant || deal.source;
  return (
    <li className="panel flex flex-col gap-2 px-4 py-3.5">
      <div className="flex items-center gap-2.5">
        <span aria-hidden="true" className="initial initial-amber size-9 text-[0.9375rem]">{(shop.trim().charAt(0) || "·").toUpperCase()}</span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-extrabold">{shop}</span>
          <span className="truncate text-xs text-muted">
            {deal.local ? "Near you" : deal.elsewhere ? "Could cost less than your usual" : deal.source && deal.source !== shop ? `From ${deal.source}` : "Across the UK"}
          </span>
        </div>
        {deal.yours ? <span className="badge">Your shop</span> : null}
      </div>
      <a href={goUrl(deal)} className="text-base leading-[1.35] font-extrabold" target="_blank" rel="noreferrer">
        {deal.title}
      </a>
      {deal.detail ? <p className="text-sm text-ink-soft">{deal.detail}</p> : null}
      {deal.saving ? <p className="text-[0.8125rem] font-semibold text-forest">{deal.saving}</p> : null}
      {deal.check ? (
        <p className={`text-[0.8125rem] leading-snug font-semibold ${deal.works ? "text-forest" : "text-clay"}`}>{deal.check}</p>
      ) : null}
      {showReason && deal.reason ? <p className="text-[0.8125rem] text-muted">{deal.reason}</p> : null}
      {deal.endsOn ? <p className="text-xs text-muted">Ends {shortDay(deal.endsOn)}</p> : null}
      <DealAction deal={deal} />
    </li>
  );
}

type Group = { id: string; label: string; line: string; deals: PersonalDeal[] };

function arrange(deals: PersonalDeal[], taste: TasteProfile) {
  const used = new Set<string>();
  const coming: { up: Upcoming; deals: PersonalDeal[] }[] = taste.upcoming.slice(0, 4).map((up) => {
    const picks = deals
      .filter((deal) => !used.has(deal.url) && (deal.key === up.key || deal.key === up.interestKey))
      .sort(rank)
      .slice(0, 2);
    for (const deal of picks) used.add(deal.url);
    return { up, deals: picks };
  })
    // Coming up is about offers: a buy with nothing to make it cheaper is not shown.
    .filter((row) => row.deals.length > 0);

  const groups = new Map<string, Group>();
  for (const deal of deals) {
    if (used.has(deal.url)) continue;
    const def = interestOfKey(deal.key, taste);
    const id = def?.id ?? deal.key;
    let group = groups.get(id);
    if (!group) {
      const interest = taste.interests.find((row) => row.id === id);
      const shop = taste.shops.find((row) => row.key === deal.key);
      group = {
        id,
        label: def?.label ?? shop?.name ?? "More for you",
        line: interest ? habitLine(interest) : shop ? habitLine(shop) : "",
        deals: [],
      };
      groups.set(id, group);
    }
    group.deals.push(deal);
  }
  const order = taste.interests.map((row) => row.id);
  const sorted = [...groups.values()].sort((a, b) => {
    const ia = order.indexOf(a.id);
    const ib = order.indexOf(b.id);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  for (const group of sorted) group.deals.sort(rank);
  return { coming, groups: sorted };
}

export function OffersView() {
  const client = useQueryClient();
  const mine = useForYou();
  const taste = mine.data?.taste;
  const hasHabits = (taste?.interests.length ?? 0) > 0;
  const wide = useForYouWide(hasHabits);
  const [pages, setPages] = useState(1);
  const [picked, setPicked] = useState<"for-you" | "shops" | "elsewhere">("for-you");
  const [find, setFind] = useState("");
  const [adding, setAdding] = useState(false);
  const [busyKey, setBusyKey] = useState("");

  const navigate = useNavigate();
  const watches = useWatches();
  // The Watchlist lives at Offers#watchlist, so Home and Plan can link to it and
  // the phone's back button closes it again.
  const watching = useRouterState({ select: (s) => s.location.hash }) === "watchlist";
  const view = watching ? "watch" : picked;

  function show(next: typeof picked) {
    setPicked(next);
    if (watching) void navigate({ to: "/offers" });
  }

  function toggleWatchlist() {
    void navigate(watching ? { to: "/offers" } : { to: "/offers", hash: "watchlist" });
  }

  useEffect(() => {
    if (!adding) return;
    const onPop = () => setAdding(false);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [adding]);

  function openAdd() {
    window.history.pushState({ penceAdd: 1 }, "");
    setAdding(true);
  }

  function closeAdd() {
    setAdding(false);
    if ((window.history.state as { penceAdd?: number } | null)?.penceAdd) window.history.back();
  }

  async function change(key: string, mode: "muted" | "added" | "clear", label: string) {
    setBusyKey(key);
    try {
      await setHabit({ data: { key, mode } });
      await client.invalidateQueries({ queryKey: ["forYou"] });
      toast(
        mode === "muted"
          ? `${label} is hidden. Pence won’t look for deals on it.`
          : mode === "added"
            ? `${label} added. Pence will look for deals on it.`
            : `${label} is back.`,
      );
    } catch (err) {
      toast(errorText(err, "Couldn’t change that just now."));
    } finally {
      setBusyKey("");
    }
  }

  const deals = useMemo(() => {
    if (!taste) return [];
    const live = new Set([...taste.interests.map((row) => row.key), ...taste.shops.map((row) => row.key)]);
    const seen = new Set<string>();
    const merged: PersonalDeal[] = [];
    for (const deal of [...(mine.data?.deals ?? []), ...(wide.data?.deals ?? [])]) {
      if (seen.has(deal.url) || !live.has(deal.key)) continue;
      seen.add(deal.url);
      merged.push(deal);
    }
    return merged;
  }, [taste, mine.data?.deals, wide.data?.deals]);

  if (mine.isPending) {
    return (
      <div>
        <PageHead title="Offers" sub={OFFERS_LINE} />
        <div className="space-y-3">
          <div className="h-24 animate-pulse rounded-lg bg-sand" />
          <div className="h-40 animate-pulse rounded-lg bg-sand" />
          <div className="h-40 animate-pulse rounded-lg bg-sand" />
        </div>
      </div>
    );
  }

  if (mine.isError || !taste) {
    return (
      <div>
        <PageHead title="Offers" sub={OFFERS_LINE} />
        <p className="panel p-5 text-sm">{errorText(mine.error, "Couldn’t load your offers just now.")}</p>
        <button type="button" className="btn btn-quiet mt-3" onClick={() => void mine.refetch()}>
          Try again
        </button>
      </div>
    );
  }

  const addable = (mine.data?.addable ?? []).filter(
    (item) => !taste.interests.some((row) => row.key === item.key) && !taste.hidden.some((row) => row.key === item.key),
  );
  const { coming, groups } = arrange(deals, taste);
  const shopNames = taste.shops.map((shop) => shop.name.toLowerCase());
  const schemes = PROGRAMMES.filter((programme) =>
    shopNames.some((name) => SCHEMES.some((rule) => rule.id === programme.id && rule.test.test(name))),
  );
  const learned = taste.interests.filter((row) => row.occasions > 0).slice(0, 4).map((row) => row.label);
  const topShops = taste.shops.slice(0, 3).map((shop) => shop.name);

  const addSheet = adding ? (
    <div className="fixed inset-0 z-40 flex items-end">
      <button type="button" className="absolute inset-0 bg-ink/40" aria-label="Close" onClick={closeAdd} />
      <div className="relative max-h-[70dvh] w-full overflow-y-auto rounded-t-2xl bg-card px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <p className="font-bold">What else do you buy?</p>
        <p className="mt-1 text-sm text-muted">Pence will look for deals on it.</p>
        <ul className="mt-2 divide-y divide-line">
          {addable.map((item) => (
            <li key={item.key}>
              <button
                type="button"
                className="flex min-h-12 w-full items-center text-left text-sm"
                disabled={busyKey === item.key}
                onClick={() => {
                  closeAdd();
                  void change(item.key, "added", item.label);
                }}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  ) : null;

  if (!hasHabits) {
    return (
      <div>
        <PageHead title="Offers" sub={OFFERS_LINE} />
        <section className="panel p-5">
          <p className="font-bold">Pence learns what you buy</p>
          <p className="mt-1 text-sm text-muted">
            Add a few receipts or payments. Pence will see what you buy, where, and how often, then look for cheaper ways to buy it.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Link to="/capture" className="btn btn-primary sm:w-auto">
              Add a spend
            </Link>
            <button type="button" className="btn btn-quiet sm:w-auto" onClick={openAdd}>
              Tell Pence what you buy
            </button>
          </div>
        </section>
        <div className="mt-6">
          <Watchlist />
        </div>
        {taste.hidden.length > 0 ? <HiddenList taste={taste} busyKey={busyKey} onShow={change} /> : null}
        {addSheet}
      </div>
    );
  }

  const needle = find.trim().toLowerCase();
  const matches = (deal: PersonalDeal) =>
    !needle || `${deal.title} ${deal.merchant} ${deal.source} ${deal.detail}`.toLowerCase().includes(needle);
  const shownDeals = deals.filter(matches).filter((deal) => (view === "elsewhere" ? deal.elsewhere : true));
  const near = shownDeals.filter((deal) => deal.local).sort(rank);
  const nearUrls = new Set(near.map((deal) => deal.url));
  const ukGroups = groups
    .map((group) => ({ ...group, deals: group.deals.filter((deal) => !nearUrls.has(deal.url) && shownDeals.includes(deal)) }))
    .filter((group) => group.deals.length > 0);
  const comingDeals = coming.flatMap((row) => row.deals).filter((deal) => !nearUrls.has(deal.url) && shownDeals.includes(deal));
  const ukTotal = comingDeals.length + ukGroups.reduce((sum, group) => sum + group.deals.length, 0);
  let room = pages * PAGE - near.length;
  const city = mine.data?.city?.trim();

  const chips = (
    <div role="group" aria-label="Show" className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-0.5">
      <button type="button" className="chip" aria-pressed={view === "for-you"} onClick={() => show("for-you")}>
        For you
      </button>
      <button type="button" className="chip" aria-pressed={view === "shops"} onClick={() => show("shops")}>
        Your shops
      </button>
      <Link to="/bills" className="chip">
        Bills
      </Link>
      <button type="button" className="chip" aria-pressed={view === "elsewhere"} onClick={() => show("elsewhere")}>
        Cheaper elsewhere
      </button>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHead
        title="Offers"
        sub={OFFERS_LINE}
        flush
        action={<WatchlistButton on={watching} items={watches.data ?? []} onClick={toggleWatchlist} />}
      />

      <label className="field">
        <span className="field-label">Search offers</span>
        <input
          type="search"
          className="control"
          placeholder="Shop or product"
          value={find}
          onChange={(event) => setFind(event.target.value)}
        />
      </label>

      {chips}

      {view === "watch" ? <Watchlist /> : null}

      {view === "shops" ? (
        <YourShops
          taste={taste}
          schemes={schemes}
          addable={addable.length > 0}
          busyKey={busyKey}
          onChange={change}
          onAdd={openAdd}
        />
      ) : null}

      {view === "for-you" || view === "elsewhere" ? (
        <>
          <p className="text-[0.8125rem] text-muted">
            {taste.usingSamples ? "Learned from the sample month" : `Learned from ${taste.basedOn} spends`}
            {learned.length > 0 ? `: ${learned.join(", ")}` : ""}
            {topShops.length > 0 ? `, mostly at ${topShops.join(", ")}` : ""}.
          </p>

          {near.length > 0 ? (
            <section aria-label="Near you" className="flex flex-col gap-2.5">
              <h2 className="section-title flex items-center gap-1.5">
                <MapPin className="size-[18px] text-forest" strokeWidth={2} aria-hidden="true" />
                {city ? `Near ${city}` : "Near you"}
              </h2>
              <ul className="flex flex-col gap-2.5">
                {near.slice(0, pages * PAGE).map((deal) => (
                  <DealCard key={deal.url} deal={deal} />
                ))}
              </ul>
            </section>
          ) : null}

          {ukTotal > 0 && room > 0 ? (
            <section aria-label="Across the UK" className="flex flex-col gap-2.5">
              <h2 className="section-title">Across the UK</h2>
              {comingDeals.length > 0 ? (
                <ul className="flex flex-col gap-2.5">
                  {comingDeals.slice(0, Math.max(room, 0)).map((deal) => {
                    room -= 1;
                    return <DealCard key={deal.url} deal={deal} />;
                  })}
                </ul>
              ) : null}
              {ukGroups.map((group) => {
                if (room <= 0) return null;
                const shown = group.deals.slice(0, room);
                room -= shown.length;
                return (
                  <div key={group.id} className="flex flex-col gap-2.5">
                    <p className="mt-1 text-[0.8125rem] font-bold text-muted">
                      {group.label}
                      {group.line ? <span className="font-normal"> · {group.line}</span> : null}
                    </p>
                    <ul className="flex flex-col gap-2.5">
                      {shown.map((deal, index) => (
                        <DealCard
                          key={deal.url}
                          deal={deal}
                          showReason={index === 0 || shown[index - 1].reason !== deal.reason}
                        />
                      ))}
                    </ul>
                  </div>
                );
              })}
            </section>
          ) : null}

          {near.length + ukTotal > pages * PAGE ? (
            <button type="button" className="btn btn-quiet" onClick={() => setPages((n) => n + 1)}>
              More offers
            </button>
          ) : null}

          {wide.isFetching && !wide.data ? (
            <div className="panel p-4">
              <p className="text-sm text-muted">Searching more of the web for your habits. The first look of the day can take a minute.</p>
              <div className="mt-3 h-16 animate-pulse rounded-xl bg-sand" />
            </div>
          ) : null}

          {!wide.isFetching && shownDeals.length === 0 ? (
            <p className="panel p-4 text-sm text-muted">
              {needle
                ? "No offer matches that. Try a shop name or a simpler word."
                : view === "elsewhere"
                  ? "Nothing cheaper elsewhere turned up today."
                  : "Nothing current turned up for your habits today. Check each shop’s own app before you pay."}
            </p>
          ) : null}

          {wide.data?.note && deals.length > 0 ? <p className="text-[0.8125rem] text-muted">{wide.data.note}</p> : null}
        </>
      ) : null}
      {addSheet}
    </div>
  );
}

/** Always in view at the top of Offers, with how many things are watched and a dot when Pence found a price. */
function WatchlistButton({
  on,
  items,
  onClick,
}: {
  on: boolean;
  items: { status: string }[];
  onClick: () => void;
}) {
  const found = items.some((item) => item.status === "found");
  return (
    <button type="button" className="chip relative shrink-0" aria-pressed={on} onClick={onClick}>
      <Eye className="size-[18px]" strokeWidth={2} aria-hidden="true" />
      Watchlist
      {items.length > 0 ? <span className="tabular-nums opacity-70">{items.length}</span> : null}
      {found ? (
        <span
          className="absolute -top-0.5 -right-0.5 size-3 rounded-full bg-clay ring-2 ring-paper"
          aria-label="Pence found a price"
        />
      ) : null}
    </button>
  );
}

/** Your shops: where you spend, what Pence knows, and the cards or apps that save money there. */
function YourShops({
  taste,
  schemes,
  addable,
  busyKey,
  onChange,
  onAdd,
}: {
  taste: TasteProfile;
  schemes: typeof PROGRAMMES;
  addable: boolean;
  busyKey: string;
  onChange: (key: string, mode: "muted" | "added" | "clear", label: string) => Promise<void>;
  onAdd: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm leading-[1.45] text-muted">
        Where you spend most, and the cards or apps that can save you money there.
      </p>
      {taste.shops.length > 0 ? (
        <ul className="flex flex-col gap-2.5">
          {taste.shops.map((shop) => {
            const scheme = schemes.find((item) =>
              SCHEMES.some((rule) => rule.id === item.id && rule.test.test(shop.name.toLowerCase())),
            );
            return (
              <li key={shop.key} className="panel flex flex-col gap-2 px-4 py-3.5">
                <div className="flex items-center gap-3">
                  <span aria-hidden="true" className="initial">{(shop.name.trim().charAt(0) || "·").toUpperCase()}</span>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[0.9375rem] font-extrabold">{shop.name}</span>
                    <span className="truncate text-[0.8125rem] text-muted">
                      {shop.occasions} visit{shop.occasions === 1 ? "" : "s"}
                      {shop.about ? ` · ${shop.about}` : shop.interestId ? ` · ${interestDef(shop.interestId)?.label ?? ""}` : ""}
                    </span>
                  </div>
                  <span className="shrink-0 text-[0.9375rem] font-extrabold tabular-nums">{formatGBP(shop.totalPence)}</span>
                </div>
                {scheme ? (
                  <a href={scheme.href} className="text-[0.8125rem] font-semibold text-forest" target="_blank" rel="noreferrer">
                    {scheme.name}: {scheme.detail}
                  </a>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="panel p-4 text-sm text-muted">Add a few spends and your shops show here.</p>
      )}

      <section className="flex flex-col gap-2.5">
        <h2 className="section-title">What Pence knows you buy</h2>
        <div className="rows">
          {taste.interests.map((row) => (
            <div key={row.key} className="row">
              <div className="min-w-0 flex-1">
                <p className="text-[0.9375rem] font-bold">{row.label}</p>
                <p className="text-[0.8125rem] text-muted">{habitLine(row)}</p>
              </div>
              <button
                type="button"
                className="chip shrink-0"
                disabled={busyKey === row.key}
                onClick={() => void onChange(row.key, row.added && row.occasions === 0 ? "clear" : "muted", row.label)}
              >
                {row.added && row.occasions === 0 ? "Remove" : "Not me"}
              </button>
            </div>
          ))}
        </div>
        {addable ? (
          <button type="button" className="btn btn-quiet" onClick={onAdd}>
            Add something you buy
          </button>
        ) : null}
        {taste.hidden.length > 0 ? <HiddenList taste={taste} busyKey={busyKey} onShow={onChange} /> : null}
      </section>
    </div>
  );
}

function HiddenList({
  taste,
  busyKey,
  onShow,
}: {
  taste: TasteProfile;
  busyKey: string;
  onShow: (key: string, mode: "clear", label: string) => Promise<void>;
}) {
  return (
    <div className="mt-4">
      <p className="text-sm text-muted">Hidden</p>
      <ul className="mt-1 divide-y divide-line">
        {taste.hidden.map((row) => (
          <li key={row.key} className="flex items-center justify-between gap-3 py-2">
            <span className="text-sm">{row.label}</span>
            <button
              type="button"
              className="chip shrink-0"
              disabled={busyKey === row.key}
              onClick={() => void onShow(row.key, "clear", row.label)}
            >
              Show again
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
