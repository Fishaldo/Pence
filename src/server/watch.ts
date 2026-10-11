import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { poundsToPence } from "@/lib/spend/model";
import {
  cleanWhat,
  floorAfter,
  isStoreWide,
  KIND_WORDS,
  offerStatusFor,
  plausiblePrice,
  watchLabel,
  type OfferStatus,
  type WatchStatus,
} from "@/lib/spend/watch";
import { catchUpDailyCheck, lastDailyCheck } from "@/server/daily";
import { isPushEndpoint, pushTo, vapidPublicKey } from "@/server/push";
import { checkDue, checkWatch, targetOf, WEB_EVERY_HOURS, type WatchRow } from "@/server/watch-check";

export type WatchOffer = {
  id: string;
  title: string;
  merchant: string;
  url: string;
  shopUrl: string;
  source: string;
  code: string;
  pricePence: number | null;
  monthly: boolean;
  detail: string;
  status: OfferStatus;
  foundAt: string;
};

export type WatchItem = {
  id: string;
  what: string;
  item: string;
  shop: string;
  /** Watching a shop or place for any promotion, rather than an item for a lower price. */
  shopOnly: boolean;
  town: string;
  targetPence: number | null;
  floorPence: number | null;
  status: WatchStatus;
  checkedAt: string | null;
  createdAt: string;
  closedAt: string | null;
  /** Offers waiting for an answer, or the one taken. */
  offers: WatchOffer[];
  /** The cheapest priced offer seen that was not good enough. */
  lowest: WatchOffer | null;
  /** Every offer seen, cheapest believable first, so the person can change their mind and take one. */
  seenOffers: (WatchOffer & { unlikely: boolean })[];
  /** Everything seen so far, good enough or not. */
  seen: number;
};

const ACTIVE_LIMIT = 20;

function num(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function when(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function asBool(value: unknown): boolean {
  return value === true || value === "t" || value === "true" || value === 1;
}

const OFFER_STATUSES = new Set<OfferStatus>(["new", "declined", "accepted", "above", "quiet"]);
const WATCH_STATUSES = new Set<WatchStatus>(["watching", "found", "accepted", "cancelled"]);

type OfferRow = {
  id: string;
  watch_id: string;
  title: string;
  merchant: string;
  url: string;
  shop_url: string;
  source: string;
  code: string;
  price_pence: number | string | null;
  monthly: unknown;
  detail: string;
  status: string;
  found_at: unknown;
};

function mapOffer(row: OfferRow): WatchOffer {
  return {
    id: row.id,
    title: row.title,
    merchant: row.merchant ?? "",
    url: row.url,
    shopUrl: row.shop_url ?? "",
    source: row.source ?? "",
    code: row.code ?? "",
    pricePence: num(row.price_pence),
    monthly: asBool(row.monthly),
    detail: row.detail ?? "",
    status: OFFER_STATUSES.has(row.status as OfferStatus) ? (row.status as OfferStatus) : "quiet",
    foundAt: when(row.found_at) ?? "",
  };
}

function readId(input: unknown): string {
  const row = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id.trim() : "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("That watch isn’t here any more.");
  return id;
}

function readMost(raw: unknown): number | null {
  const text = raw == null ? "" : String(raw).trim();
  if (!text) return null;
  const pence = poundsToPence(text);
  if (!pence) throw new Error("Enter a price like 800 or 799.99, or leave it empty.");
  return pence;
}

async function ownWatch(userId: string, id: string): Promise<WatchRow> {
  const sql = await getSql();
  const rows = await sql<WatchRow>`
    select id, user_id, what, item, shop, kind, town, target_pence, floor_pence, declines, status, checked_at, web_checked_at
    from watches where id = ${id} and user_id = ${userId}`;
  if (!rows[0]) throw new Error("That watch isn’t here any more.");
  return rows[0];
}

/** Everything being watched, offers waiting for an answer first. */
export const listWatches = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<WatchItem[]> => {
    const sql = await getSql();
    const [watches, offers] = await Promise.all([
      sql<{
        id: string;
        what: string;
        item: string;
        shop: string;
        town: string;
        target_pence: number | string | null;
        floor_pence: number | string | null;
        status: string;
        checked_at: unknown;
        created_at: unknown;
        closed_at: unknown;
      }>`select id, what, item, shop, town, target_pence, floor_pence, status, checked_at, created_at, closed_at
         from watches
         where user_id = ${context.userId}
           and (status in ('watching', 'found') or (status = 'accepted' and closed_at > now() - interval '30 days'))
         order by created_at desc
         limit 60`,
      sql<OfferRow>`select id, watch_id, title, merchant, url, shop_url, source, code, price_pence, monthly,
                           detail, status, found_at
                    from watch_offers
                    where user_id = ${context.userId}
                    order by found_at desc
                    limit 800`,
    ]);
    const byWatch = new Map<string, WatchOffer[]>();
    for (const row of offers) {
      const list = byWatch.get(row.watch_id) ?? [];
      list.push(mapOffer(row));
      byWatch.set(row.watch_id, list);
    }
    const items = watches.map((row): WatchItem => {
      const all = byWatch.get(row.id) ?? [];
      const status = WATCH_STATUSES.has(row.status as WatchStatus) ? (row.status as WatchStatus) : "watching";
      const target = targetOf(row);
      const shopOnly = !target.item && Boolean(target.shop);
      const shown = all
        .filter((offer) => (status === "accepted" ? offer.status === "accepted" : offer.status === "new"))
        .sort((a, b) =>
          shopOnly
            ? Number(isStoreWide(b.title)) - Number(isStoreWide(a.title))
            : (a.pricePence ?? Infinity) - (b.pricePence ?? Infinity),
        );
      const prices = all
        .filter((offer) => offer.pricePence != null && !offer.monthly)
        .map((offer) => offer.pricePence as number);
      const targetPence = num(row.target_pence);
      const believable = (offer: WatchOffer) =>
        shopOnly || offer.monthly || plausiblePrice(offer.pricePence, prices, targetPence);
      const priced = all.filter(
        (offer) =>
          offer.status !== "new" && offer.status !== "accepted" && offer.pricePence != null && !offer.monthly && believable(offer),
      );
      const lowest = priced.sort((a, b) => (a.pricePence ?? 0) - (b.pricePence ?? 0))[0] ?? null;
      const seenOffers = all
        .map((offer) => ({ ...offer, unlikely: !believable(offer) }))
        .sort((a, b) => {
          if (a.unlikely !== b.unlikely) return a.unlikely ? 1 : -1;
          const pa = a.monthly ? null : a.pricePence;
          const pb = b.monthly ? null : b.pricePence;
          if (pa == null || pb == null) return pa == null ? (pb == null ? 0 : 1) : -1;
          return pa - pb;
        })
        .slice(0, 40);
      return {
        id: row.id,
        what: row.what,
        item: target.item,
        shop: target.shop,
        shopOnly,
        town: row.town ?? "",
        targetPence: num(row.target_pence),
        floorPence: num(row.floor_pence),
        status,
        checkedAt: when(row.checked_at),
        createdAt: when(row.created_at) ?? "",
        closedAt: when(row.closed_at),
        offers: shown.slice(0, 10),
        lowest,
        seenOffers,
        seen: all.length,
      };
    });
    const rank = (item: WatchItem) => (item.status === "found" ? 0 : item.status === "watching" ? 1 : 2);
    return items.sort((a, b) => rank(a) - rank(b));
  });

/** Add to the Watchlist: an item, a shop or place, or both. The first look happens straight after. */
export const addWatch = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const row = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
    // Older screens sent one "what" box; it is an item.
    const item = cleanWhat(typeof row.item === "string" ? row.item : typeof row.what === "string" ? row.what : "");
    const shop = cleanWhat(typeof row.shop === "string" ? row.shop : "").slice(0, 80);
    if (item.length < 2 && shop.length < 2) throw new Error("Add an item, or a shop or place, to watch.");
    const town = typeof row.town === "string" ? cleanWhat(row.town).slice(0, 60) : "";
    const kindRaw = typeof row.kind === "string" ? row.kind.trim() : "";
    const kind = KIND_WORDS[kindRaw] ? kindRaw : "";
    return { item: item.length >= 2 ? item : "", shop: shop.length >= 2 ? shop : "", town, kind, most: readMost(row.most) };
  })
  .handler(async ({ context, data }): Promise<{ id: string; existing: boolean }> => {
    const sql = await getSql();
    const what = watchLabel({ item: data.item, shop: data.shop });
    const active = await sql<{ id: string; what: string }>`
      select id, what from watches where user_id = ${context.userId} and status in ('watching', 'found')`;
    const same = active.find((row) => row.what.toLowerCase() === what.toLowerCase());
    if (same) return { id: same.id, existing: true };
    if (active.length >= ACTIVE_LIMIT) throw new Error(`Your Watchlist has ${ACTIVE_LIMIT} things. Stop one first.`);
    const id = crypto.randomUUID();
    // A budget means nothing for "any promotion at ASDA", so a shop on its own keeps no price.
    const most = data.item ? data.most : null;
    await sql`insert into watches (id, user_id, what, item, shop, kind, town, target_pence)
              values (${id}, ${context.userId}, ${what}, ${data.item}, ${data.shop}, ${data.kind}, ${data.town}, ${most})`;
    return { id, existing: false };
  });

/** "Check now". The free deal-board check runs at most every half hour; the web search once a day. */
export const checkWatchNow = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => ({ id: readId(input) }))
  .handler(async ({ context, data }): Promise<{ found: number; checked: boolean }> => {
    const watch = await ownWatch(context.userId, data.id);
    if (watch.status !== "watching" && watch.status !== "found") return { found: 0, checked: false };
    const now = Date.now();
    const age = (value: unknown) => {
      if (value == null) return Infinity;
      const time = value instanceof Date ? value.getTime() : Date.parse(String(value));
      return Number.isFinite(time) ? (now - time) / 3_600_000 : Infinity;
    };
    if (age(watch.checked_at) < 0.5 && age(watch.web_checked_at) < WEB_EVERY_HOURS) return { found: 0, checked: false };
    const result = await checkWatch(watch, { push: false, now });
    return { found: result.found, checked: true };
  });

/** Checks the person's own watches that are due, when they open Pence. */
export const checkMyWatches = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => checkDue({ userId: context.userId, limit: 2, budgetMs: 45_000, push: false }));

/** "Take this one", or "Still too much" to keep waiting for a lower price. */
export const answerWatch = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const row = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
    const take = row.take === true;
    const offerId = typeof row.offerId === "string" ? row.offerId : "";
    if (take && !/^[0-9a-f-]{36}$/i.test(offerId)) throw new Error("Pick the offer you want.");
    return { id: readId(input), take, offerId };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const watch = await ownWatch(context.userId, data.id);
    if (data.take) {
      const hit = await sql<{ id: string }>`
        update watch_offers set status = 'accepted'
        where id = ${data.offerId} and watch_id = ${watch.id} and user_id = ${context.userId}
        returning id`;
      if (!hit[0]) throw new Error("That offer isn’t here any more.");
      await sql`update watch_offers set status = 'declined'
                where watch_id = ${watch.id} and status = 'new'`;
      await sql`update watches set status = 'accepted', closed_at = now() where id = ${watch.id}`;
      return { ok: true as const };
    }
    const declined = await sql<{ price_pence: number | string | null; monthly: unknown }>`
      update watch_offers set status = 'declined'
      where watch_id = ${watch.id} and status = 'new'
      returning price_pence, monthly`;
    const goal = targetOf(watch);
    const everyPrice = await sql<{ price_pence: number | string | null; monthly: unknown }>`
      select price_pence, monthly from watch_offers where watch_id = ${watch.id}`;
    const prices = everyPrice
      .map((row) => (asBool(row.monthly) ? null : num(row.price_pence)))
      .filter((price): price is number => price != null && price > 0);
    const target = num(watch.target_pence);
    // "Not this one" on a watched shop just waits for the next promotion; only items wait for a lower price,
    // and only a believable price can become the one to beat.
    const floor = goal.item
      ? floorAfter(
          num(watch.floor_pence),
          declined
            .map((row) => (asBool(row.monthly) ? null : num(row.price_pence)))
            .filter((price) => plausiblePrice(price, prices, target)),
        )
      : null;
    await sql`update watches set status = 'watching', floor_pence = ${floor}, declines = declines + 1
              where id = ${watch.id}`;
    return { ok: true as const };
  });

/** Change the most the person would pay. Offers already seen are judged again at once. */
export const changeWatchPrice = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const row = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
    return { id: readId(input), most: readMost(row.most) };
  })
  .handler(async ({ context, data }): Promise<{ found: number }> => {
    const sql = await getSql();
    const watch = await ownWatch(context.userId, data.id);
    // A new limit starts fresh: the price turned down before no longer has to be beaten.
    await sql`update watches set target_pence = ${data.most}, floor_pence = null where id = ${watch.id}`;
    if (watch.status !== "watching" && watch.status !== "found") return { found: 0 };
    const limits = { targetPence: data.most, floorPence: null, declines: num(watch.declines) ?? 0 };
    const offers = await sql<{ id: string; price_pence: number | string | null; monthly: unknown; status: string }>`
      select id, price_pence, monthly, status from watch_offers where watch_id = ${watch.id}`;
    const prices = offers
      .map((row) => (asBool(row.monthly) ? null : num(row.price_pence)))
      .filter((price): price is number => price != null && price > 0);
    const goal = targetOf(watch);
    let found = 0;
    for (const row of offers) {
      if (row.status !== "above" && row.status !== "quiet") continue;
      const price = asBool(row.monthly) ? null : num(row.price_pence);
      if (goal.item && !plausiblePrice(price, prices, data.most)) continue;
      const status = offerStatusFor({ pricePence: num(row.price_pence), monthly: asBool(row.monthly) }, limits, goal);
      if (status !== "new") continue;
      await sql`update watch_offers set status = 'new' where id = ${row.id}`;
      found += 1;
    }
    if (found > 0) await sql`update watches set status = 'found', found_at = now() where id = ${watch.id}`;
    return { found };
  });

/** Stop watching, or clear a finished watch. */
export const removeWatch = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => ({ id: readId(input) }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await sql`delete from watch_offers where watch_id = ${data.id} and user_id = ${context.userId}`;
    await sql`delete from watches where id = ${data.id} and user_id = ${context.userId}`;
    return { ok: true as const };
  });

/** The key a phone needs to turn alerts on. */
export const alertKey = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async (): Promise<{ key: string | null }> => {
    try {
      return { key: await vapidPublicKey() };
    } catch {
      return { key: null };
    }
  });

export const saveAlerts = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const row = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
    const endpoint = typeof row.endpoint === "string" ? row.endpoint.trim() : "";
    if (!isPushEndpoint(endpoint)) throw new Error("This phone can’t take alerts from Pence.");
    const key = (value: unknown) => (typeof value === "string" && /^[A-Za-z0-9_-]{16,200}$/.test(value) ? value : null);
    return { endpoint, on: row.on !== false, p256dh: key(row.p256dh), auth: key(row.auth) };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    if (data.on) {
      await sql`insert into push_subs (endpoint, user_id, p256dh, auth)
                values (${data.endpoint}, ${context.userId}, ${data.p256dh}, ${data.auth})
                on conflict (endpoint) do update set
                  user_id = excluded.user_id,
                  p256dh = coalesce(excluded.p256dh, push_subs.p256dh),
                  auth = coalesce(excluded.auth, push_subs.auth),
                  created_at = now()`;
    } else {
      await sql`delete from push_subs where endpoint = ${data.endpoint} and user_id = ${context.userId}`;
    }
    return { ok: true as const };
  });

/**
 * Send a test alert to this phone now, so the person can see alerts arrive.
 * Says plainly what went wrong when the phone's push service turns it down.
 */
export const testAlert = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const row = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
    const endpoint = typeof row.endpoint === "string" ? row.endpoint.trim() : "";
    if (!isPushEndpoint(endpoint)) throw new Error("Turn phone alerts on first.");
    return { endpoint };
  })
  .handler(async ({ context, data }): Promise<{ ok: boolean; problem: string }> => {
    const sql = await getSql();
    const rows = await sql<{ endpoint: string; p256dh: string | null; auth: string | null }>`
      select endpoint, p256dh, auth from push_subs where endpoint = ${data.endpoint} and user_id = ${context.userId}`;
    if (!rows[0]) return { ok: false, problem: "This phone isn’t signed up for alerts. Turn alerts off and on again." };
    const result = await pushTo(rows[0], {
      title: "Pence alerts are working",
      body: "This is how Pence tells you about offers and payments coming out.",
      url: "/",
      tag: "pence-test",
    });
    if (result.ok) return { ok: true, problem: "" };
    if (result.status === 404 || result.status === 410) {
      return { ok: false, problem: "This phone stopped taking alerts from Pence. Turn alerts on again." };
    }
    if (result.status === 401 || result.status === 403) {
      return { ok: false, problem: "The phone’s alert service turned Pence down. Turn alerts off and on again." };
    }
    return { ok: false, problem: "The phone’s alert service didn’t answer. Try again in a minute." };
  });

/** When the morning check last ran, for the alerts panel. */
export const dailyStatus = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async (): Promise<{ last: string | null }> => ({ last: await lastDailyCheck().catch(() => null) }));

/** Run the morning check on a visit when it has not run for over a day. */
export const dailyCatchUp = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async (): Promise<{ ran: boolean }> => {
    try {
      const { ran } = await catchUpDailyCheck();
      return { ran };
    } catch {
      return { ran: false };
    }
  });
