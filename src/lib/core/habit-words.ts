import { norm } from "./shops.ts";
import { interestDef } from "./interests.ts";
import { dayNum } from "./dates.ts";
import { type TasteProfile } from "./taste.ts";
import { DAY_MS, type Rhythm, type TimeOfDay, WEEKDAYS, shortDay } from "./rhythm.ts";
/* The sentences that explain a habit or an offer. */

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
  cakes: "buy cakes at",
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
const VISITED = new Set(["food-shop", "coffee", "lunch", "cakes", "eating-out", "drinks", "hair", "clothes", "shoes", "perfume", "beauty", "pharmacy", "home", "kids", "pets", "gifts", "tech", "car"]);

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
