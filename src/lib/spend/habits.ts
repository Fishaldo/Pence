import type { CategoryId, LineItem } from "./model";
import {
  BIG_TICKET,
  BRAND,
  CATEGORY_HOME,
  GENERIC_SHOP_WORDS,
  INTERESTS,
  interestDef,
  type InterestDef,
} from "./interests.ts";
import { isStoreWide } from "./promo.ts";

export { INTERESTS, interestDef, type InterestDef };

/*
 * What Pence learns about one person from their own spends.
 *
 * Every receipt line and every payment is mapped to an interest (perfume,
 * trainers, the food shop, taxis …) and to a shop. For each interest and each
 * regular shop Pence works out how often, which weekday, whether it follows
 * payday, the time of day when a receipt printed one, the usual spend, and
 * when the next one is likely. Offers are then searched and explained from
 * that profile.
 *
 * Everything here is pure, so it runs the same on the server and in tests.
 */

// ---------- text matching ----------

function norm(text: string): string {
  return text.toLowerCase().replace(/[’‘`´]/g, "'").replace(/\s+/g, " ").trim();
}

const WORD_CACHE = new Map<string, RegExp>();

/** True when `word` appears as a whole word (a plural or possessive counts). */
export function hasWord(hay: string, word: string): boolean {
  let re = WORD_CACHE.get(word);
  if (!re) {
    const esc = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    re = new RegExp(`(?:^|[^a-z0-9])${esc}(?:s|es|'s)?(?![a-z0-9])`);
    WORD_CACHE.set(word, re);
  }
  return re.test(hay);
}

const MERCHANT_NOISE = new Set([
  "ltd",
  "limited",
  "plc",
  "uk",
  "gb",
  "store",
  "stores",
  "retail",
  "online",
  "www",
  "com",
  "co",
  "the",
  "extra",
  "express",
  "metro",
  "superstore",
  "local",
  "petrol",
  "station",
]);

/** The merchant with store numbers and filler removed: "TESCO STORES 3456" → "tesco". */
export function merchantCore(merchant: string): string {
  return norm(merchant)
    .replace(/[^a-z0-9&'+ ]/g, " ")
    .split(" ")
    .filter((word) => word && !/^\d+$/.test(word) && !MERCHANT_NOISE.has(word))
    .join(" ");
}

function shopHit(merchant: string, core: string, word: string): boolean {
  if (word.startsWith("=")) {
    const bare = word.slice(1);
    return core === bare || core.startsWith(`${bare} `);
  }
  return hasWord(merchant, word);
}

function titleCase(text: string): string {
  return text
    .split(" ")
    .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(" ");
}

export function brandName(word: string): string {
  return BRAND[word] ?? titleCase(word.replace(/^=/, ""));
}

type ShopMatch = { interest: InterestDef; word: string };

function matchShop(merchant: string): ShopMatch[] {
  const hay = norm(merchant);
  const core = merchantCore(merchant);
  const found: ShopMatch[] = [];
  for (const interest of INTERESTS) {
    let best = "";
    for (const word of interest.shops) {
      if (word.replace(/^=/, "").length > best.replace(/^=/, "").length && shopHit(hay, core, word)) best = word;
    }
    if (best) found.push({ interest, word: best });
  }
  return found.sort((a, b) => b.word.replace(/^=/, "").length - a.word.replace(/^=/, "").length);
}

/** Which interest a merchant belongs to, honouring the category the person chose. */
export function merchantInterest(merchant: string, category: CategoryId): { id: string | null; brand: string | null } {
  const hits = matchShop(merchant);
  const named = hits.find((hit) => !GENERIC_SHOP_WORDS.has(hit.word));
  const brand = named ? brandName(named.word) : null;
  const sameCategory = hits.find((hit) => hit.interest.category === category);
  if (sameCategory) return { id: sameCategory.interest.id, brand };
  // A shop that sells one kind of thing tells us more than the category does.
  if (named && !named.interest.broad) return { id: named.interest.id, brand };
  // A supermarket filed under Household is a household spend: keep the person's choice.
  const home = CATEGORY_HOME[category];
  if (home) return { id: home, brand };
  return { id: hits[0]?.interest.id ?? null, brand };
}

/** Which interest a receipt line belongs to, or null. */
export function itemInterest(name: string): string | null {
  const hay = norm(name);
  let best: { id: string; len: number } | null = null;
  for (const interest of INTERESTS) {
    for (const word of interest.items) {
      if ((!best || word.length > best.len) && hasWord(hay, word)) best = { id: interest.id, len: word.length };
    }
  }
  return best?.id ?? null;
}

/** A receipt line as a person would say it: "2 × TESCO S/SKIM MILK 4PT" → "S Skim Milk". */
export function cleanItem(name: string): string {
  let text = name.replace(/^\s*\d+(?:\.\d+)?\s*[×x*]\s*/i, " ");
  text = text.replace(/\b\d+(?:\.\d+)?\s*(?:ml|l|ltr|litre|litres|g|kg|cl|oz|pk|pack|x|pt|pint|pints|pcs|s)\b/gi, " ");
  text = text.replace(
    /\b(?:tesco|sainsbury'?s?|asda|aldi|lidl|morrisons|waitrose|co-?op|finest|value|essential|everyday|smartprice|stockwell|by sainsbury'?s)\b/gi,
    " ",
  );
  text = text.replace(/[^\p{L}\p{N}&'+ ]/gu, " ").replace(/\s+/g, " ").trim();
  if (text && text === text.toUpperCase()) {
    text = titleCase(text.toLowerCase()).replace(/\b(Edt|Edp|Spf|Xl|Xxl|Usb|Hdmi|Uk)\b/g, (word) => word.toUpperCase());
  }
  return text.slice(0, 40);
}

// ---------- dates ----------

const DAY_MS = 86_400_000;

export function dayNum(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

export function isoOf(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

function weekdayOf(day: number): number {
  return new Date(day * DAY_MS).getUTCDay();
}

function monthLength(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function paydayIn(year: number, monthIndex: number, payday: number): number {
  const y = year + Math.floor(monthIndex / 12);
  const m = ((monthIndex % 12) + 12) % 12;
  return Math.round(Date.UTC(y, m, Math.min(payday, monthLength(y, m))) / DAY_MS);
}

/** The payday on or before this day. */
export function paydayOnOrBefore(day: number, payday: number): number {
  const date = new Date(day * DAY_MS);
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  const here = paydayIn(y, m, payday);
  return here <= day ? here : paydayIn(y, m - 1, payday);
}

/** The first payday strictly after this day. */
export function paydayAfter(day: number, payday: number): number {
  const date = new Date(day * DAY_MS);
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  const here = paydayIn(y, m, payday);
  return here > day ? here : paydayIn(y, m + 1, payday);
}

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function shortDay(iso: string): string {
  const day = dayNum(iso);
  const date = new Date(day * DAY_MS);
  const month = date.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
  return `${WEEKDAYS[weekdayOf(day)].slice(0, 3)} ${date.getUTCDate()} ${month}`;
}

// ---------- rhythm ----------

export type TimeOfDay = "morning" | "afternoon" | "evening" | "late";

export type Rhythm = {
  occasions: number;
  /** Spent in the last 90 days. */
  recentPence: number;
  totalPence: number;
  avgPence: number;
  firstOn: string;
  lastOn: string;
  /** Typical days between buys, when there is enough to say. */
  gapDays: number | null;
  regular: boolean;
  weekday: number | null;
  weekend: boolean;
  afterPayday: boolean;
  timeOfDay: TimeOfDay | null;
  nextOn: string | null;
  due: "now" | "soon" | "later" | null;
  faded: boolean;
};

type Occasion = { day: number; pence: number; minutes: number | null };

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function bucketOf(minutes: number): TimeOfDay {
  const hour = Math.floor(minutes / 60);
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "late";
}

function snapToWeekday(day: number, weekday: number): number {
  for (let shift = 0; shift <= 3; shift += 1) {
    if (weekdayOf(day + shift) === weekday) return day + shift;
    if (weekdayOf(day - shift) === weekday) return day - shift;
  }
  return day;
}

export function rhythmOf(raw: Occasion[], today: number, payday: number | null): Rhythm {
  const byDay = new Map<number, Occasion>();
  for (const occ of raw) {
    const prev = byDay.get(occ.day);
    if (prev) {
      prev.pence += occ.pence;
      if (prev.minutes == null) prev.minutes = occ.minutes;
    } else {
      byDay.set(occ.day, { ...occ });
    }
  }
  const occs = [...byDay.values()].sort((a, b) => a.day - b.day);
  const occasions = occs.length;
  const totalPence = occs.reduce((sum, occ) => sum + occ.pence, 0);
  const recentPence = occs.filter((occ) => occ.day > today - 90).reduce((sum, occ) => sum + occ.pence, 0);
  const first = occs[0]?.day ?? today;
  const last = occs[occasions - 1]?.day ?? today;
  const gaps = occs.slice(1).map((occ, index) => occ.day - occs[index].day);

  let gapDays: number | null = null;
  let regular = false;
  if (gaps.length >= 2) {
    const mid = median(gaps);
    const spread = median(gaps.map((gap) => Math.abs(gap - mid))) / Math.max(1, mid);
    gapDays = Math.max(1, Math.round(mid));
    regular = mid >= 1 && mid <= 120 && spread <= 0.5;
  }

  let weekday: number | null = null;
  let weekend = false;
  if (occasions >= 3) {
    const counts = new Array<number>(7).fill(0);
    for (const occ of occs) counts[weekdayOf(occ.day)] += 1;
    const top = counts.indexOf(Math.max(...counts));
    if (counts[top] >= 3 && counts[top] / occasions >= 0.5) weekday = top;
    else if (occasions >= 4 && (counts[5] + counts[6] + counts[0]) / occasions >= 0.75) weekend = true;
  }

  let afterPayday = false;
  if (payday && occasions >= 2) {
    const near = occs.filter((occ) => occ.day - paydayOnOrBefore(occ.day, payday) <= 3).length;
    afterPayday = near >= 2 && near / occasions >= 0.6;
  }

  let timeOfDay: TimeOfDay | null = null;
  const timed = occs.filter((occ) => occ.minutes != null).map((occ) => bucketOf(occ.minutes as number));
  if (timed.length >= 3) {
    const tally = new Map<TimeOfDay, number>();
    for (const bucket of timed) tally.set(bucket, (tally.get(bucket) ?? 0) + 1);
    const [bucket, count] = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
    if (count / timed.length >= 0.6) timeOfDay = bucket;
  }

  const faded = today - last > Math.max(60, (gapDays ?? 30) * 3);

  let next: number | null = null;
  if (!faded && afterPayday && payday && (gapDays == null || gapDays >= 20)) {
    next = paydayAfter(last, payday);
    if (next < today - 3) next = paydayAfter(today - 1, payday);
  } else if (!faded && regular && gapDays != null) {
    next = last + gapDays;
    if (weekday != null && gapDays >= 5 && gapDays <= 16) next = snapToWeekday(next, weekday);
    if (next < today) {
      // A little late is still "due"; very late means the habit has paused.
      next = today - next > Math.max(7, gapDays) ? null : today;
    }
  }

  let due: Rhythm["due"] = null;
  if (next != null) {
    const ahead = next - today;
    due = ahead <= 0 ? "now" : ahead <= 7 ? "soon" : "later";
  }

  return {
    occasions,
    recentPence,
    totalPence,
    avgPence: occasions > 0 ? Math.round(totalPence / occasions) : 0,
    firstOn: isoOf(first),
    lastOn: isoOf(last),
    gapDays,
    regular,
    weekday,
    weekend,
    afterPayday,
    timeOfDay,
    nextOn: next == null ? null : isoOf(next),
    due,
    faded,
  };
}

// ---------- the profile ----------

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
};

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
  options: { today: string; payday: number | null; prefs?: HabitPrefs },
): TasteProfile {
  const today = dayNum(options.today);
  const muted = new Set(options.prefs?.muted ?? []);
  const added = new Set(options.prefs?.added ?? []);
  const real = spends.filter((tx) => !tx.isSample);
  const usingSamples = real.length === 0 && spends.length > 0;
  const source = (usingSamples ? spends : real).filter((tx) => {
    if (tx.amountPence <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(tx.spentOn)) return false;
    const day = dayNum(tx.spentOn);
    return day > today - 400 && day <= today;
  });

  const interests = new Map<string, Bucket>();
  const shops = new Map<string, Bucket & { interest: Map<string, number>; category: Map<CategoryId, number> }>();

  for (const tx of source) {
    const day = dayNum(tx.spentOn);
    const minutes = tx.source === "bank" ? null : timeOf(tx.note, tx.rawAlert);
    const { id: mainId, brand } = merchantInterest(tx.merchant, tx.category);
    const shopName = brand ?? tx.merchant.trim();
    const items = tx.items ?? [];
    // Each item goes to what it is: nappies to the kids, perfume to perfume, bread to the food shop.
    // Items with no price share what is left of the total equally, so a no-receipt
    // "ASDA £20.50: nappies, bread" counts about half for each.
    const priced = new Map<string, number>();
    const unpriced = new Map<string, number>();
    let pricedTotal = 0;
    for (const item of items) {
      const id = itemInterest(item.name) ?? mainId;
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
      b.shops.set(shopName, (b.shops.get(shopName) ?? 0) + 1);
      interests.set(id, b);
    }
    for (const item of items) {
      const id = itemInterest(item.name) ?? mainId;
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

    const key = shopKey(shopName);
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
    shopList.push({
      ...rhythmOf(s.occs, today, options.payday),
      key,
      name,
      interestId,
      category: top(s.category) ?? "other",
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

// ---------- words ----------

function pounds(pence: number): string {
  const whole = Math.round(pence / 100);
  return whole >= 1 ? `£${whole.toLocaleString("en-GB")}` : `${Math.max(1, Math.round(pence))}p`;
}

/** "most Saturdays", "about every 6 weeks", or "" when there is no pattern yet. */
export function rhythmPhrase(r: Rhythm): string {
  if (!r.regular || r.gapDays == null) return "";
  const g = r.gapDays;
  if (r.weekday != null && g >= 5 && g <= 9) return `most ${WEEKDAYS[r.weekday]}s`;
  if (g <= 2) return "almost every day";
  if (g <= 4) return "a few times a week";
  if (g <= 9) return r.weekend ? "most weekends" : "about once a week";
  if (g <= 17) return "about every two weeks";
  if (g <= 24) return "about every three weeks";
  if (g <= 38) return r.afterPayday ? "every payday" : "about once a month";
  if (g <= 70) return `about every ${Math.round(g / 7)} weeks`;
  return `about every ${Math.round(g / 30)} months`;
}

const TIME_WORDS: Record<TimeOfDay, string> = {
  morning: "in the morning",
  afternoon: "in the afternoon",
  evening: "in the evening",
  late: "late at night",
};

/** One short line about a habit: "Most Saturdays · about £54". */
export function habitLine(r: Rhythm): string {
  if (r.occasions === 0) return "You added this";
  const bits: string[] = [];
  const phrase = rhythmPhrase(r);
  if (phrase) bits.push(phrase);
  else if (r.weekday != null) bits.push(`often on ${WEEKDAYS[r.weekday]}s`);
  else if (r.weekend) bits.push("mostly at weekends");
  else bits.push(r.occasions === 1 ? "once so far" : `${r.occasions} times so far`);
  if (r.afterPayday && phrase !== "every payday") bits.push("just after payday");
  if (r.timeOfDay) bits.push(TIME_WORDS[r.timeOfDay]);
  if (r.avgPence > 0) bits.push(r.occasions === 1 ? pounds(r.avgPence) : `about ${pounds(r.avgPence)} each time`);
  const line = bits.join(" · ");
  return line.charAt(0).toUpperCase() + line.slice(1);
}

/** When the next one is likely, in plain words. */
export function whenText(nextOn: string, today: string): string {
  const ahead = dayNum(nextOn) - dayNum(today);
  if (ahead <= 0) return "Due about now";
  if (ahead === 1) return "Likely tomorrow";
  return `Likely ${shortDay(nextOn)}`;
}

function sinceMonth(iso: string): string {
  const date = new Date(dayNum(iso) * DAY_MS);
  return date.toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" });
}

/** How a regular shop reads in a sentence, by what it sells: "You ride with Uber …". */
const SHOP_VERB: Record<string, string> = {
  "food-shop": "do a food shop at",
  coffee: "get coffee at",
  lunch: "get lunch at",
  takeaway: "order from",
  "eating-out": "eat at",
  drinks: "buy drinks at",
  taxis: "ride with",
  trains: "travel with",
  "getting-around": "travel with",
  car: "fill up at",
  hair: "go to",
  streaming: "pay",
  fitness: "pay",
  energy: "pay",
  "phone-broadband": "pay",
  insurance: "pay",
  housing: "pay",
};

/** Shops people walk into, as opposed to services they use. */
const VISITED = new Set(["food-shop", "coffee", "lunch", "eating-out", "drinks", "hair", "clothes", "shoes", "perfume", "beauty", "pharmacy", "home", "kids", "pets", "gifts", "tech", "car"]);

/** Why a deal is shown: "You buy perfume about every 6 weeks. Next one likely Sat 17 Oct." */
export function reasonFor(key: string, taste: TasteProfile, itemName?: string): string {
  const parts: string[] = [];
  const interest = taste.interests.find((row) => row.key === key);
  const shop = taste.shops.find((row) => row.key === key);
  const habit: Rhythm | undefined = interest ?? shop;
  if (itemName && interest) {
    const times = interest.items.find((item) => item.name === itemName)?.times ?? 0;
    parts.push(
      times > 1
        ? `You’ve bought ${itemName} ${times} times.`
        : `You bought ${itemName} in ${sinceMonth(interest.lastOn)}.`,
    );
  } else if (interest) {
    if (interest.occasions === 0) parts.push(`You asked for deals on ${interest.noun}.`);
    else {
      const phrase = rhythmPhrase(interest);
      const verb = interestDef(interest.id)?.verb ?? `buy ${interest.noun}`;
      parts.push(
        phrase
          ? `You ${verb} ${phrase}.`
          : `You’ve spent ${pounds(interest.totalPence)} on ${interest.noun} since ${sinceMonth(interest.firstOn)}.`,
      );
    }
  } else if (shop) {
    const phrase = rhythmPhrase(shop);
    const verb = (shop.interestId && SHOP_VERB[shop.interestId]) || "shop at";
    const visited = !shop.interestId || VISITED.has(shop.interestId);
    parts.push(
      phrase
        ? `You ${verb} ${shop.name} ${phrase}, about ${pounds(shop.avgPence)} each time.`
        : shop.occasions > 1
          ? `You’ve ${visited ? "been to" : "used"} ${shop.name} ${shop.occasions} times since ${sinceMonth(shop.firstOn)}.`
          : `You ${visited ? "went to" : "used"} ${shop.name} recently.`,
    );
  }
  if (habit?.nextOn && (habit.due === "now" || habit.due === "soon")) {
    const ahead = dayNum(habit.nextOn) - dayNum(taste.today);
    parts.push(
      ahead <= 0
        ? "The next one is due about now."
        : ahead === 1
          ? "The next one is likely tomorrow."
          : `The next one is likely ${shortDay(habit.nextOn)}.`,
    );
  }
  return parts.join(" ");
}

/** Why a deal at another shop is shown: "You usually use Asda for this. This one is at Aldi." */
export function elsewhereReason(key: string, taste: TasteProfile, merchant: string): string {
  const interest = taste.interests.find((row) => row.key === key);
  const shop = taste.shops.find((row) => row.key === key);
  const usual = interest?.shops[0] ?? shop?.name ?? "";
  const where = merchant.trim();
  if (usual && where) return `You usually use ${usual} for this. This one is at ${where}.`;
  if (usual) return `You usually use ${usual} for this. This could cost less.`;
  return "This could cost less than where you usually go.";
}

/** A saving the page itself states, applied to this person's usual spend. Never guessed. */
export function savingLine(title: string, usualPence: number): string {
  if (usualPence < 300) return "";
  const text = norm(title);
  let percent = 0;
  const off = text.match(/(\d{1,2})\s?%\s*(?:off|discount|cheaper|saving)/) ?? text.match(/save\s+(?:up to\s+)?(\d{1,2})\s?%/);
  if (off) percent = Number(off[1]);
  else if (/\bhalf price\b/.test(text)) percent = 50;
  if (/\bup to\b/.test(text)) return "";
  if (percent < 5 || percent > 80) return "";
  const saved = Math.round((usualPence * percent) / 100);
  if (saved < 50) return "";
  return `${percent}% off is about ${pounds(saved)} on your usual ${pounds(usualPence)}`;
}

// ---------- what to search ----------

export type Need = {
  key: string;
  query: string;
  /** A deal must contain one of these (empty: anything that passes `avoid`). */
  match: string[];
  avoid: string[];
  /** Brand words of the shop when the need is a shop. */
  shopWords: string[];
  /**
   * For a shop that sells everything, such as a supermarket: the deal must be one
   * of these kinds of thing, or a promotion across the shop. Keeps step stools
   * and screenwash out of a food shop habit.
   */
  kindWords?: string[];
  /** A rival shop for the same habit, where the same spend could cost less. */
  elsewhere?: boolean;
  /** How many results to ask the deal board for. */
  limit?: number;
  item?: string;
  usualPence: number;
};

/** The words that say what a deal is for, without the shop names that appear in every deal. */
function kindWordsOf(def: InterestDef): string[] {
  const shops = new Set(def.shops.map((word) => word.replace(/^=/, "")));
  return [...def.match.filter((word) => !shops.has(word)), ...def.items];
}

/** Words that name this shop in a deal title. Unknown local shops fall back to their own name. */
function shopWordsFor(name: string, brandsOnly = false): string[] {
  const hits = matchShop(name).filter((hit) => !GENERIC_SHOP_WORDS.has(hit.word));
  const words = hits.map((hit) => hit.word.replace(/^=/, ""));
  const core = merchantCore(name);
  if (words.length === 0 && core.length >= 3 && !brandsOnly) words.push(core);
  return [...new Set(words)];
}

/** The searches that would help this person most, best first. */
export function searchNeeds(taste: TasteProfile, max = 9): Need[] {
  const needs: Need[] = [];
  const seen = new Set<string>();
  const push = (need: Need) => {
    const q = need.query.toLowerCase();
    if (!q || seen.has(q) || needs.length >= max) return;
    seen.add(q);
    needs.push(need);
  };
  const shopNeed = (shop: ShopHabit) => {
    const def = shop.interestId ? interestDef(shop.interestId) : undefined;
    // A deal board knows the chains, not the corner shop, so only named brands get a search.
    const words = shopWordsFor(shop.name, true);
    if (words.length === 0 || (def && !def.query)) return;
    push({
      key: shop.key,
      query: shop.name,
      match: [],
      avoid: def?.avoid ?? BIG_TICKET,
      shopWords: words,
      kindWords: def?.broad ? kindWordsOf(def) : undefined,
      usualPence: shop.avgPence,
    });
  };
  const interestNeed = (interest: InterestHabit) => {
    const def = interestDef(interest.id);
    if (!def?.query) return;
    push({ key: interest.key, query: def.query, match: def.match, avoid: def.avoid, shopWords: [], usualPence: interest.avgPence });
  };
  const itemNeed = (interest: InterestHabit) => {
    const def = interestDef(interest.id);
    // Only something bought more than once is a habit worth a search of its own.
    const fav = interest.items.find((item) => item.times >= 2);
    if (!def?.products || !fav) return;
    const words = fav.name
      .toLowerCase()
      .split(" ")
      .filter((word) => word.length >= 3 && !/^\d/.test(word));
    if (words.length === 0) return;
    push({
      key: interest.key,
      query: words.slice(0, 3).join(" "),
      match: words.slice(0, 3),
      avoid: def.avoid,
      shopWords: [],
      item: fav.name,
      usualPence: interest.avgPence,
    });
  };

  for (const interest of taste.interests) if (interest.added && interest.occasions === 0) interestNeed(interest);
  for (const up of taste.upcoming) {
    const shop = taste.shops.find((row) => row.key === up.key);
    const interest = taste.interests.find((row) => row.key === up.key);
    if (shop) shopNeed(shop);
    if (interest) interestNeed(interest);
  }
  const live = taste.interests.filter((row) => !row.faded || row.added);
  for (const interest of live.slice(0, 5)) {
    interestNeed(interest);
    itemNeed(interest);
  }
  for (const shop of taste.shops.filter((row) => !row.faded).slice(0, 4)) shopNeed(shop);
  for (const interest of live.slice(5)) interestNeed(interest);
  return needs;
}

/**
 * Rival shops for the habits that matter most: where the same spend could cost
 * less. Someone at ASDA every week also gets Aldi and Iceland deals; someone
 * who pays Cineworld gets Vue and Odeon.
 */
export function rivalNeeds(taste: TasteProfile, max = 5): Need[] {
  const needs: Need[] = [];
  const used = new Set(taste.shops.flatMap((shop) => shopWordsFor(shop.name, true)));
  const live = taste.interests.filter((row) => row.occasions >= 2 && !row.faded);
  for (const interest of live.slice(0, 4)) {
    const def = interestDef(interest.id);
    if (!def?.rivals?.length) continue;
    let picked = 0;
    for (const rival of def.rivals) {
      if (needs.length >= max || picked >= 2) break;
      const words = shopWordsFor(rival, true);
      const names = words.length > 0 ? words : [rival.toLowerCase()];
      if (names.some((word) => used.has(word))) continue;
      needs.push({
        key: interest.key,
        query: rival,
        match: [],
        avoid: def.avoid,
        shopWords: names,
        // A specialist rival (Vue for a Cineworld habit) is on topic by name; a supermarket needs the kind check.
        kindWords: def.broad ? kindWordsOf(def) : undefined,
        elsewhere: true,
        limit: 8,
        usualPence: interest.avgPence,
      });
      picked += 1;
    }
  }
  return needs;
}

/**
 * Whether a deal fits a need. Keeps a grocery habit away from televisions. The
 * shop the deal board names counts for a shop need; what the deal is for is read
 * from the title alone.
 */
export function dealFits(title: string, need: Need, merchant = ""): boolean {
  const hay = norm(title);
  if (need.avoid.some((word) => hasWord(hay, word))) return false;
  if (need.shopWords.length > 0) {
    const where = norm(`${title} ${merchant}`);
    if (!need.shopWords.some((word) => hasWord(where, word))) return false;
    if (need.kindWords && !isStoreWide(title) && !need.kindWords.some((word) => hasWord(hay, word))) return false;
    return true;
  }
  if (need.match.length === 0) return true;
  if (need.item) return need.match.filter((word) => hasWord(hay, word)).length >= Math.min(2, need.match.length);
  return need.match.some((word) => hasWord(hay, word));
}

/** The interest a habit key belongs to: an interest itself, or the main interest of a shop. */
export function interestOfKey(key: string, taste: TasteProfile): InterestDef | undefined {
  if (key.startsWith("i:")) return interestDef(key.slice(2));
  const shop = taste.shops.find((row) => row.key === key);
  return shop?.interestId ? interestDef(shop.interestId) : undefined;
}

/** True when a deal is plainly about something else than this habit. */
export function offTopic(text: string, key: string, taste: TasteProfile): boolean {
  const def = interestOfKey(key, taste);
  if (!def) return false;
  const hay = norm(text);
  return def.avoid.some((word) => hasWord(hay, word));
}

/** The usual spend for a habit, used to turn a stated % off into pounds. */
export function usualFor(key: string, taste: TasteProfile): number {
  return (taste.interests.find((row) => row.key === key) ?? taste.shops.find((row) => row.key === key))?.avgPence ?? 0;
}

/** The shop named in a deal title, such as "… £3 @ Tesco" or "… at Boots". */
export function titleShop(title: string): string {
  const match = title.match(/(?:@|\bat\b|\||-)\s*([A-Z][\w&'’.+\- ]{1,30}?)\s*(?:\([^)]*\))?\s*$/);
  return match ? match[1].trim() : "";
}

/** True when a deal is at a shop this person already uses. */
export function atKnownShop(text: string, taste: TasteProfile): boolean {
  const hay = norm(text);
  return taste.shops.some((shop) => shopWordsFor(shop.name).some((word) => hasWord(hay, word)));
}

/** All interests a person can add by hand. */
export function addableInterests(): { key: string; label: string }[] {
  return INTERESTS.filter((def) => def.query).map((def) => ({ key: `i:${def.id}`, label: def.label }));
}
