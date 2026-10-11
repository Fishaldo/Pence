import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PROGRAMMES } from "@/lib/spend/model";
import { habitLine, interestOfKey, whenText, type TasteProfile, type Upcoming } from "@/lib/spend/habits";
import { setHabit, type PersonalDeal } from "@/server/for-you";
import { useForYou, useForYouWide } from "./data";
import { CodeChip, DealAction } from "./deal-bits";
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

/** Near you first, then the shops this person already uses. */
function rank(a: PersonalDeal, b: PersonalDeal): number {
  return Number(a.elsewhere) - Number(b.elsewhere) || Number(b.local) - Number(a.local) || Number(b.yours) - Number(a.yours);
}

export function DealCard({ deal, showReason = true }: { deal: PersonalDeal; showReason?: boolean }) {
  return (
    <li className="panel p-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
        <span>{deal.merchant || deal.source}</span>
        {deal.local ? <span className="rounded-full bg-mist px-2 py-0.5 text-xs text-forest-deep">Near you</span> : null}
        {deal.yours ? <span className="rounded-full bg-sand px-2 py-0.5 text-xs text-ink">Your shop</span> : null}
      </div>
      <p className="mt-1 font-medium">{deal.title}</p>
      {deal.detail ? <p className="mt-1 text-sm">{deal.detail}</p> : null}
      {deal.saving ? <p className="mt-1 text-sm font-medium text-forest">{deal.saving}</p> : null}
      {showReason && deal.reason ? <p className="mt-2 text-sm text-muted">{deal.reason}</p> : null}
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
  const [learnedOpen, setLearnedOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [busyKey, setBusyKey] = useState("");

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
        <PageHead kicker="Offers" title="For you" />
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
        <PageHead kicker="Offers" title="For you" />
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
  const groupTotal = groups.reduce((sum, group) => sum + group.deals.length, 0);
  let room = pages * PAGE;

  const addSheet = adding ? (
    <div className="fixed inset-0 z-40 flex items-end">
      <button type="button" className="absolute inset-0 bg-ink/40" aria-label="Close" onClick={closeAdd} />
      <div className="relative max-h-[70dvh] w-full overflow-y-auto rounded-t-2xl bg-card px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <p className="font-medium">What else do you buy?</p>
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
        <PageHead kicker="Offers" title="For you" />
        <section className="panel p-5">
          <p className="font-medium">Pence learns what you buy</p>
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

  return (
    <div>
      <PageHead kicker="Offers" title="For you" />

      <Watchlist />

      <section className="panel mt-6 p-4">
        <p className="text-sm text-muted">
          {taste.usingSamples ? "Learned from the sample month" : `Learned from ${taste.basedOn} spends`}
        </p>
        <p className="mt-1 font-medium">
          {learned.length > 0 ? `You buy: ${learned.join(", ")}` : "You told Pence what you buy"}
        </p>
        {topShops.length > 0 ? <p className="mt-1 text-sm text-muted">Mostly at {topShops.join(", ")}</p> : null}
        <button
          type="button"
          className="mt-2 min-h-11 text-sm font-medium text-forest"
          aria-expanded={learnedOpen}
          onClick={() => setLearnedOpen((open) => !open)}
        >
          {learnedOpen ? "Close" : "What Pence knows"}
        </button>
        {learnedOpen ? (
          <div className="mt-1">
            <ul className="divide-y divide-line border-t border-line">
              {taste.interests.map((row) => (
                <li key={row.key} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-medium">{row.label}</p>
                    <p className="text-sm text-muted">{habitLine(row)}</p>
                  </div>
                  <button
                    type="button"
                    className="shrink-0 rounded-md border border-line px-3 py-2 text-sm"
                    disabled={busyKey === row.key}
                    onClick={() =>
                      void change(row.key, row.added && row.occasions === 0 ? "clear" : "muted", row.label)
                    }
                  >
                    {row.added && row.occasions === 0 ? "Remove" : "Not me"}
                  </button>
                </li>
              ))}
            </ul>
            {addable.length > 0 ? (
              <button type="button" className="btn btn-quiet mt-3" onClick={openAdd}>
                Add something you buy
              </button>
            ) : null}
            {taste.hidden.length > 0 ? <HiddenList taste={taste} busyKey={busyKey} onShow={change} /> : null}
          </div>
        ) : null}
      </section>

      {coming.length > 0 ? (
        <section className="mt-6">
          <h2 className="font-display text-2xl">Coming up</h2>
          <ul className="mt-3 space-y-3">
            {coming.map(({ up, deals: picks }) => (
              <li key={up.key} className="panel p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-medium">
                    {up.title}
                    {up.kind && up.kind !== up.title ? <span className="font-normal text-muted"> · {up.kind}</span> : null}
                  </p>
                  <p className="shrink-0 text-sm text-forest">{whenText(up.nextOn, taste.today)}</p>
                </div>
                <p className="mt-1 text-sm text-muted">{up.line}</p>
                {picks.length > 0 ? (
                  <ul className="mt-3 space-y-2 border-t border-line pt-3">
                    {picks.map((deal) => (
                      <li key={deal.url}>
                        <a href={goUrl(deal)} className="block font-medium" target="_blank" rel="noreferrer">
                          {deal.title}
                        </a>
                        <p className="text-sm text-muted">
                          {deal.merchant || deal.source}
                          {deal.local ? " · near you" : ""}
                        </p>
                        {deal.saving ? <p className="text-sm font-medium text-forest">{deal.saving}</p> : null}
                        {deal.code ? <CodeChip code={deal.code} /> : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {groups.map((group) => {
        if (room <= 0) return null;
        const shown = group.deals.slice(0, room);
        room -= shown.length;
        const here = shown.filter((deal) => !deal.elsewhere);
        const away = shown.filter((deal) => deal.elsewhere);
        return (
          <section key={group.id} className="mt-6">
            <h2 className="font-display text-2xl">{group.label}</h2>
            {group.line ? <p className="text-sm text-muted">{group.line}</p> : null}
            {here.length > 0 ? (
              <ul className="mt-3 space-y-3">
                {here.map((deal, index) => (
                  // The same reason on every card in a group is noise: say it once, then only when it changes.
                  <DealCard key={deal.url} deal={deal} showReason={index === 0 || here[index - 1].reason !== deal.reason} />
                ))}
              </ul>
            ) : null}
            {away.length > 0 ? (
              <>
                <h3 className="mt-4 text-sm font-medium text-forest">Could cost less elsewhere</h3>
                <ul className="mt-2 space-y-3">
                  {away.map((deal) => (
                    <DealCard key={deal.url} deal={deal} />
                  ))}
                </ul>
              </>
            ) : null}
          </section>
        );
      })}

      {groupTotal > pages * PAGE ? (
        <button type="button" className="btn btn-quiet mt-4" onClick={() => setPages((n) => n + 1)}>
          More
        </button>
      ) : null}

      {wide.isFetching && !wide.data ? (
        <div className="panel mt-6 p-4">
          <p className="text-sm text-muted">Searching more of the web for your habits. The first look of the day can take a minute.</p>
          <div className="mt-3 h-16 animate-pulse rounded-md bg-sand" />
        </div>
      ) : null}

      {!wide.isFetching && deals.length === 0 ? (
        <p className="panel mt-6 p-4 text-sm text-muted">
          Nothing current turned up for your habits today. Check each shop’s own app before you pay.
        </p>
      ) : null}

      {schemes.length > 0 ? (
        <section className="mt-6">
          <h2 className="font-display text-2xl">Cards and apps for your shops</h2>
          <ul className="mt-3 space-y-3">
            {schemes.map((item) => (
              <li key={item.id} className="panel p-4">
                <p className="font-medium">{item.name}</p>
                <p className="mt-1 text-sm">{item.detail}</p>
                <a href={item.href} className="mt-2 inline-block text-sm font-medium text-forest" target="_blank" rel="noreferrer">
                  Open {item.name}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {wide.data?.note && deals.length > 0 ? <p className="mt-4 text-sm text-muted">{wide.data.note}</p> : null}
      {addSheet}
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
              className="shrink-0 rounded-md border border-line px-3 py-2 text-sm"
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
