import { isMoneySent, sendingService } from "./money-sent.ts";
import { interestDef } from "./interests.ts";
import { habitLine } from "./habit-words.ts";
import { dayNum } from "./dates.ts";
import { type ShopKinds, cleanItem, isKnownShop, isPaymentToPerson, itemInterestAt, merchantCore, merchantInterest } from "./shops.ts";
import { type Occasion, type Rhythm, rhythmOf } from "./rhythm.ts";
import { type LineItem } from "./model.ts";
import { type CategoryId, countsAsSpending } from "./categories.ts";
/*
 * What Briv learns about one person from their own spends.
 *
 * Every receipt line and every payment is mapped to an interest (perfume,
 * trainers, the food shop, taxis …) and to a shop. For each interest and each
 * regular shop Briv works out how often, which weekday, whether it follows
 * payday, the time of day when a receipt printed one, the usual spend, and
 * when the next one is likely. Offers are then searched and explained from
 * that profile.
 *
 * Everything here is pure, so it runs the same on the server and in tests.
 */


export type SpendInput = {
  merchant: string;
  amountPence: number;
  category: CategoryId;
  spentOn: string;
  source?: string;
  note?: string;
  rawAlert?: string;
  items?: LineItem[];
  isSample?: boolean;
  /** The payee as the bank printed it, such as "BLD*MYPERFECTCV.CO". */
  description?: string;
  /** What the person said it was, with one tap: an interest id such as "perfume". */
  kind?: string;
};

/** What a shop really is, found on the web: "Pizza & Co", a pizza takeaway near Birmingham. */
export type ShopInfo = {
  interestId: string | null;
  name: string;
  what: string;
  /** "chain", "local", "online" or "service". */
  kind: string;
  place: string;
  site: string;
};

/** Shop facts by merchant core ("pizza & co"). */
export type ShopBook = Record<string, ShopInfo>;

/** One plain line about a shop: "Pizza takeaway in Selly Oak". */
export function aboutShop(info: ShopInfo | undefined): string {
  if (!info?.what) return "";
  const what = info.what.charAt(0).toUpperCase() + info.what.slice(1);
  if (info.kind === "local" && info.place) return `${what} in ${info.place}`;
  if (info.kind === "online") return `${what}, online`;
  return what;
}

export type InterestHabit = Rhythm & {
  key: string;
  id: string;
  label: string;
  noun: string;
  category: CategoryId;
  shops: string[];
  items: { name: string; times: number }[];
  added: boolean;
};

export type ShopHabit = Rhythm & {
  key: string;
  name: string;
  interestId: string | null;
  category: CategoryId;
  /** What Briv found this shop is, such as "Pizza takeaway in Selly Oak". Empty when not looked up. */
  about: string;
  /** The shop's own website, when found. */
  site: string;
  /** A local business rather than a chain or an online service. */
  local: boolean;
};

export type Upcoming = {
  key: string;
  interestKey: string | null;
  title: string;
  kind: string;
  nextOn: string;
  usualPence: number;
  line: string;
};

export type TasteProfile = {
  interests: InterestHabit[];
  shops: ShopHabit[];
  upcoming: Upcoming[];
  hidden: { key: string; label: string }[];
  basedOn: number;
  usingSamples: boolean;
  today: string;
};

export type HabitPrefs = { muted: string[]; added: string[] };

function timeOf(...texts: (string | undefined)[]): number | null {
  for (const text of texts) {
    const match = text?.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
    if (match) return Number(match[1]) * 60 + Number(match[2]);
  }
  return null;
}

function shopKey(name: string): string {
  return `s:${merchantCore(name).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "shop"}`;
}

type Bucket = {
  occs: Occasion[];
  names: Map<string, number>;
  shops: Map<string, number>;
  items: Map<string, { name: string; days: Set<number> }>;
};

function bucket(): Bucket {
  return { occs: [], names: new Map(), shops: new Map(), items: new Map() };
}

function rankScore(r: Rhythm): number {
  const steady = r.regular ? 1500 : 0;
  const stale = r.faded ? 5000 : 0;
  return r.recentPence + 0.3 * r.totalPence + steady + r.occasions * 300 - stale;
}

export function buildTaste(
  spends: SpendInput[],
  options: { today: string; payday: number | null; prefs?: HabitPrefs; kinds?: ShopKinds; book?: ShopBook },
): TasteProfile {
  const today = dayNum(options.today);
  const muted = new Set(options.prefs?.muted ?? []);
  const added = new Set(options.prefs?.added ?? []);
  const real = spends.filter((tx) => !tx.isSample);
  const usingSamples = real.length === 0 && spends.length > 0;
  const source = (usingSamples ? spends : real).filter((tx) => {
    if (tx.amountPence <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(tx.spentOn)) return false;
    // Savings, investments and transfers are money moved, not habits to find deals for.
    if (!countsAsSpending(tx.category)) return false;
    const day = dayNum(tx.spentOn);
    return day > today - 400 && day <= today;
  });

  const book = options.book ?? {};
  const kinds: ShopKinds = { ...(options.kinds ?? {}) };
  for (const [core, info] of Object.entries(book)) if (info.interestId) kinds[core] = info.interestId;
  const infoByKey = new Map<string, ShopInfo>();
  const interests = new Map<string, Bucket>();
  const shops = new Map<string, Bucket & { interest: Map<string, number>; category: Map<CategoryId, number> }>();

  for (const tx of source) {
    const day = dayNum(tx.spentOn);
    const minutes = tx.source === "bank" ? null : timeOf(tx.note, tx.rawAlert);
    if (isMoneySent(tx, isKnownShop(tx.merchant))) {
      // Money sent to family or friends is not shopping: no gift boxes for a transfer to Mum.
      // A transfer app is still worth a look, for its fees and rates. A person is never a "shop".
      const service = sendingService(tx.merchant, tx.description);
      if (service) {
        const b = interests.get("sending-money") ?? bucket();
        b.occs.push({ day, pence: tx.amountPence, minutes });
        b.shops.set(service, (b.shops.get(service) ?? 0) + 1);
        interests.set("sending-money", b);
      }
      continue;
    }
    const { id: shopId, brand } = merchantInterest(tx.merchant, tx.category, kinds);
    // The person's own answer ("perfume", not pharmacy) beats anything worked out from the shop.
    const mainId = tx.kind && interestDef(tx.kind) ? tx.kind : shopId;
    const info = book[merchantCore(tx.merchant)];
    // The name the shop really goes by, when the web said: "MyPerfectCV", not "BLD*MYPERFECTCV.CO".
    // Rent to a private landlord still counts as rent, but the landlord is never a "shop".
    const toPerson = isPaymentToPerson(tx);
    const shopName = toPerson ? "" : brand ?? (info?.name || tx.merchant.trim());
    const items = tx.items ?? [];
    // Each item goes to what it is: nappies to the kids, perfume to perfume, bread to the food shop.
    // Items with no price share what is left of the total equally, so a no-receipt
    // "ASDA £20.50: nappies, bread" counts about half for each.
    const priced = new Map<string, number>();
    const unpriced = new Map<string, number>();
    let pricedTotal = 0;
    for (const item of items) {
      const id = itemInterestAt(item.name, mainId) ?? mainId;
      if (!id) continue;
      if (item.amountPence > 0) {
        priced.set(id, (priced.get(id) ?? 0) + item.amountPence);
        pricedTotal += item.amountPence;
      } else {
        unpriced.set(id, (unpriced.get(id) ?? 0) + 1);
      }
    }
    const pool = Math.max(0, tx.amountPence - pricedTotal);
    const shares = [...unpriced.values()].reduce((sum, n) => sum + n, 0);
    const perInterest = new Map<string, number>(priced);
    if (shares > 0) {
      for (const [id, n] of unpriced) perInterest.set(id, (perInterest.get(id) ?? 0) + Math.round((pool * n) / shares));
    } else if (mainId && (pool > 0 || perInterest.size === 0)) {
      perInterest.set(mainId, (perInterest.get(mainId) ?? 0) + pool);
    }
    for (const [id, pence] of perInterest) {
      const b = interests.get(id) ?? bucket();
      b.occs.push({ day, pence, minutes });
      if (shopName) b.shops.set(shopName, (b.shops.get(shopName) ?? 0) + 1);
      interests.set(id, b);
    }
    for (const item of items) {
      const id = itemInterestAt(item.name, mainId) ?? mainId;
      if (!id) continue;
      const def = interestDef(id);
      if (!def?.products) continue;
      const clean = cleanItem(item.name);
      if (!/[a-z]{3,}/i.test(clean)) continue;
      const b = interests.get(id);
      if (!b) continue;
      const k = clean.toLowerCase();
      const entry = b.items.get(k) ?? { name: clean, days: new Set<number>() };
      entry.days.add(day);
      b.items.set(k, entry);
    }

    if (!shopName) continue;
    const key = shopKey(shopName);
    if (info && !infoByKey.has(key)) infoByKey.set(key, info);
    const s = shops.get(key) ?? {
      ...bucket(),
      interest: new Map<string, number>(),
      category: new Map<CategoryId, number>(),
    };
    s.occs.push({ day, pence: tx.amountPence, minutes });
    s.names.set(shopName, (s.names.get(shopName) ?? 0) + 1);
    if (mainId) s.interest.set(mainId, (s.interest.get(mainId) ?? 0) + 1);
    s.category.set(tx.category, (s.category.get(tx.category) ?? 0) + 1);
    shops.set(key, s);
  }

  const top = <T,>(map: Map<T, number>): T | null => {
    let best: T | null = null;
    let count = -1;
    for (const [value, n] of map) if (n > count) [best, count] = [value, n];
    return best;
  };

  const interestList: InterestHabit[] = [];
  const hidden: { key: string; label: string }[] = [];
  for (const [id, b] of interests) {
    const def = interestDef(id);
    if (!def) continue;
    const key = `i:${id}`;
    if (muted.has(key)) {
      hidden.push({ key, label: def.label });
      continue;
    }
    const rhythm = rhythmOf(b.occs, today, options.payday);
    interestList.push({
      ...rhythm,
      key,
      id,
      label: def.label,
      noun: def.noun,
      category: def.category,
      shops: [...b.shops.entries()]
        .sort((a, b2) => b2[1] - a[1])
        .map(([name]) => name)
        .slice(0, 4),
      items: [...b.items.values()]
        .sort((a, b2) => b2.days.size - a.days.size)
        .slice(0, 4)
        .map((entry) => ({ name: entry.name, times: entry.days.size })),
      added: added.has(key),
    });
  }
  for (const key of added) {
    const id = key.replace(/^i:/, "");
    const def = interestDef(id);
    if (!def || muted.has(key) || interestList.some((row) => row.id === id)) continue;
    interestList.push({
      ...rhythmOf([], today, options.payday),
      occasions: 0,
      key,
      id,
      label: def.label,
      noun: def.noun,
      category: def.category,
      shops: [],
      items: [],
      added: true,
    });
  }
  interestList.sort((a, b) => {
    if ((a.occasions === 0) !== (b.occasions === 0)) return a.occasions === 0 ? 1 : -1;
    return rankScore(b) - rankScore(a);
  });

  const shopList: ShopHabit[] = [];
  for (const [key, s] of shops) {
    const name = top(s.names) ?? key;
    if (muted.has(key)) {
      hidden.push({ key, label: name });
      continue;
    }
    const interestId = top(s.interest);
    if (interestId && muted.has(`i:${interestId}`)) continue;
    const info = infoByKey.get(key);
    shopList.push({
      ...rhythmOf(s.occs, today, options.payday),
      key,
      name,
      interestId,
      category: top(s.category) ?? "other",
      about: aboutShop(info),
      site: info?.site ?? "",
      local: info?.kind === "local",
    });
  }
  shopList.sort((a, b) => b.occasions - a.occasions || rankScore(b) - rankScore(a));

  const upcoming: Upcoming[] = [];
  const coveredInterests = new Set<string>();
  for (const shop of shopList) {
    if (!shop.nextOn || (shop.due !== "now" && shop.due !== "soon")) continue;
    const def = shop.interestId ? interestDef(shop.interestId) : undefined;
    if (def && !def.query) continue;
    if (shop.interestId) coveredInterests.add(shop.interestId);
    upcoming.push({
      key: shop.key,
      interestKey: shop.interestId ? `i:${shop.interestId}` : null,
      title: shop.name,
      kind: def?.label ?? "",
      nextOn: shop.nextOn,
      usualPence: shop.avgPence,
      line: habitLine(shop),
    });
  }
  for (const interest of interestList) {
    if (!interest.nextOn || (interest.due !== "now" && interest.due !== "soon")) continue;
    if (coveredInterests.has(interest.id) || !interestDef(interest.id)?.query) continue;
    upcoming.push({
      key: interest.key,
      interestKey: interest.key,
      title: interest.label,
      kind: interest.shops[0] ?? "",
      nextOn: interest.nextOn,
      usualPence: interest.avgPence,
      line: habitLine(interest),
    });
  }
  upcoming.sort((a, b) => a.nextOn.localeCompare(b.nextOn) || b.usualPence - a.usualPence);

  return {
    interests: interestList,
    shops: shopList.slice(0, 12),
    upcoming: upcoming.slice(0, 5),
    hidden,
    basedOn: source.length,
    usingSamples,
    today: options.today,
  };
}
