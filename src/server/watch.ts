import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { poundsToPence } from "@/lib/spend/model";
import { cleanWhat, floorAfter, offerStatus, type OfferStatus, type WatchStatus } from "@/lib/spend/watch";
import { isPushEndpoint, vapidPublicKey } from "@/server/push";
import { checkDue, checkWatch, WEB_EVERY_HOURS, type WatchRow } from "@/server/watch-check";

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
    select id, user_id, what, town, target_pence, floor_pence, declines, status, checked_at, web_checked_at
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
        town: string;
        target_pence: number | string | null;
        floor_pence: number | string | null;
        status: string;
        checked_at: unknown;
        created_at: unknown;
        closed_at: unknown;
      }>`select id, what, town, target_pence, floor_pence, status, checked_at, created_at, closed_at
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
      const shown = all
        .filter((offer) => (status === "accepted" ? offer.status === "accepted" : offer.status === "new"))
        .sort((a, b) => (a.pricePence ?? Infinity) - (b.pricePence ?? Infinity));
      const priced = all.filter(
        (offer) => offer.status !== "new" && offer.status !== "accepted" && offer.pricePence != null && !offer.monthly,
      );
      const lowest = priced.sort((a, b) => (a.pricePence ?? 0) - (b.pricePence ?? 0))[0] ?? null;
      return {
        id: row.id,
        what: row.what,
        town: row.town ?? "",
        targetPence: num(row.target_pence),
        floorPence: num(row.floor_pence),
        status,
        checkedAt: when(row.checked_at),
        createdAt: when(row.created_at) ?? "",
        closedAt: when(row.closed_at),
        offers: shown.slice(0, 10),
        lowest,
        seen: all.length,
      };
    });
    const rank = (item: WatchItem) => (item.status === "found" ? 0 : item.status === "watching" ? 1 : 2);
    return items.sort((a, b) => rank(a) - rank(b));
  });

/** Start watching something. The first look happens straight after, from the screen. */
export const addWatch = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const row = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
    const what = cleanWhat(typeof row.what === "string" ? row.what : "");
    if (what.length < 2) throw new Error("Say what you want, like iPhone 17 Pro 256GB.");
    const town = typeof row.town === "string" ? cleanWhat(row.town).slice(0, 60) : "";
    return { what, town, most: readMost(row.most) };
  })
  .handler(async ({ context, data }): Promise<{ id: string; existing: boolean }> => {
    const sql = await getSql();
    const active = await sql<{ id: string; what: string }>`
      select id, what from watches where user_id = ${context.userId} and status in ('watching', 'found')`;
    const same = active.find((row) => row.what.toLowerCase() === data.what.toLowerCase());
    if (same) return { id: same.id, existing: true };
    if (active.length >= ACTIVE_LIMIT) throw new Error(`You’re watching ${ACTIVE_LIMIT} things. Stop one first.`);
    const id = crypto.randomUUID();
    await sql`insert into watches (id, user_id, what, town, target_pence)
              values (${id}, ${context.userId}, ${data.what}, ${data.town}, ${data.most})`;
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
    const floor = floorAfter(
      num(watch.floor_pence),
      declined.map((row) => (asBool(row.monthly) ? null : num(row.price_pence))),
    );
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
    await sql`update watches set target_pence = ${data.most} where id = ${watch.id}`;
    if (watch.status !== "watching" && watch.status !== "found") return { found: 0 };
    const limits = {
      targetPence: data.most,
      floorPence: num(watch.floor_pence),
      declines: num(watch.declines) ?? 0,
    };
    const waiting = await sql<{ id: string; price_pence: number | string | null; monthly: unknown }>`
      select id, price_pence, monthly from watch_offers
      where watch_id = ${watch.id} and status in ('above', 'quiet')`;
    let found = 0;
    for (const row of waiting) {
      const status = offerStatus({ pricePence: num(row.price_pence), monthly: asBool(row.monthly) }, limits);
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
    return { endpoint, on: row.on !== false };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    if (data.on) {
      await sql`insert into push_subs (endpoint, user_id) values (${data.endpoint}, ${context.userId})
                on conflict (endpoint) do update set user_id = excluded.user_id, created_at = now()`;
    } else {
      await sql`delete from push_subs where endpoint = ${data.endpoint} and user_id = ${context.userId}`;
    }
    return { ok: true as const };
  });
