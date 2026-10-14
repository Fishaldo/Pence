import { APP_NAME } from "./brand.ts";
import { categoryLabel, type CategoryId } from "./categories.ts";
import { formatGBP, formatPercent } from "./money.ts";
import type { MonthSummary } from "./summary.ts";

/* Plain advice on a pay period: what to trim, and how. */

export type AdviceCard = {
  id: string;
  title: string;
  body: string;
  tone: "calm" | "warn";
};

const CATEGORY_TIP: Record<CategoryId, string> = {
  groceries:
    "Move the things you buy every week to the shop’s own brand, and check the Clubcard or Nectar price before the ordinary shelf ticket. A same-day Too Good To Go bag can cover breakfasts for less than another top-up shop.",
  household:
    "Refills of washing liquid and cleaning spray are cheaper in a bigger bottle from Aldi, Lidl, or Home Bargains than the branded one that lands in the grocery basket.",
  fashion:
    "Put the item on a list and wait until the next payday. Most clothes bought on a whim don’t survive a week of thinking about them.",
  entertainment:
    "Weekday showings and a Meerkat Movies code are the usual cinema cut. Look at any game or ticket purchase in this category before the next one.",
  dining:
    "Choose two evenings to eat what is already in the house. A Greggs, Deliveroo, or Just Eat habit usually shrinks faster than the weekly shop.",
  transport:
    "Add the rides up. If they repeat the same route, compare that total with a bus, Metro, or weekly ticket before you book the next one.",
  health:
    "Ask for the generic at the counter. A points offer is only a saving if you were going to buy the item at the lower price anyway.",
  bills:
    "These rarely move mid-month. If one jumped, check a fix or a social tariff before the next direct debit, not after it has left.",
  subscriptions:
    "Open each one you paid this month. Cancel the service you have not actually used in the last fortnight.",
  personal:
    "Toiletries last longer than the offer suggests. Skip the multibuy unless the bottle at home is actually empty.",
  travel:
    "A trip is fine when it was planned. If this one wasn’t, leave the extras for next month’s money.",
  gifts:
    "Decide the ceiling before you browse. A smaller present usually lands as well as the upgraded one.",
  sent:
    "Money for family and friends is a choice, not a leak. Set the amount at the start of the pay, and compare transfer fees and rates before you send money abroad.",
  housing:
    "Rent rarely moves mid-year. Check the council tax band and any discount you can claim, such as the single person discount.",
  kids:
    "Agree a list before the shop. School uniform and toy shops run offers before term and in the January sales.",
  pets:
    "Food in a bigger bag is usually cheaper per kilo. Compare the vet plan price with what you paid last year.",
  education:
    "Ask for a student or early-booking price before you pay, and check whether the course is free elsewhere.",
  charity:
    "Giving is a choice, not a leak. If you pay tax, Gift Aid adds to the gift at no cost to you.",
  fees:
    "These are avoidable. Look at what caused each one: a late payment, an overdraft, or a card used abroad.",
  cash:
    `Cash is hard to track. Note what it was spent on, or pay by card so ${APP_NAME} can see it.`,
  other:
    "Give these a real category. Other is where forgotten memberships and card taps hide.",
  savings: "Money put aside. Not counted as spending.",
  investments: "Money invested. Not counted as spending.",
  transfers: "Money moved between your own accounts. Not counted as spending.",
};

export function buildAdvice(input: {
  city: string;
  income: number;
  current: MonthSummary;
  previous: MonthSummary;
  projected: number | null;
  complete: boolean;
  cycle: boolean;
}): AdviceCard[] {
  const cards: AdviceCard[] = [];
  const { current, previous, income, projected, city } = input;
  const period = input.cycle ? "pay" : "month";
  const top = current.byCategory[0];

  if (income > 0 && current.spent > income) {
    cards.push({
      id: "over",
      tone: "warn",
      title: `This ${period} is already past your take-home`,
      body: `You’ve logged ${formatGBP(current.spent - income)} more than the ${formatGBP(income)} that landed. Spend only on food, getting to work, or a bill until the next pay.`,
    });
  } else if (income > 0 && projected != null && !input.complete && projected > income) {
    cards.push({
      id: "pace",
      tone: "warn",
      title: "This pace overshoots your pay",
      body: `If the rest of this ${period} looks like the days so far, you’ll land near ${formatGBP(projected)} — ${formatGBP(projected - income)} over your take-home. Slow the biggest category, not a single coffee.`,
    });
  }

  if (top && top.amount > 0) {
    const share = current.spent > 0 ? top.amount / current.spent : 0;
    const ofPay = income > 0 ? ` That’s ${formatPercent(top.amount / income)} of take-home.` : "";
    let body = `${categoryLabel(top.id)} is ${formatPercent(share)} of what you’ve logged.${ofPay} ${CATEGORY_TIP[top.id]}`;
    if (
      top.id === "transport" &&
      /newcastle|tyneside|gateshead|north shields|whitley bay/i.test(city)
    ) {
      body +=
        " Around Newcastle, put the Metro and a Pop card next to those app rides before you assume the car is the only way.";
    }
    cards.push({
      id: "top",
      tone: "calm",
      title: `Most of it is ${categoryLabel(top.id).toLowerCase()}`,
      body,
    });
  }

  const rises = current.byCategory
    .map((row) => {
      const prev = previous.byCategory.find((p) => p.id === row.id)?.amount ?? 0;
      return { id: row.id, now: row.amount, prev, delta: row.amount - prev };
    })
    // Health is never something Briv tells people to cut.
    .filter((row) => row.prev >= 800 && row.delta > row.prev * 0.15 && row.id !== top?.id && row.id !== "health")
    .sort((a, b) => b.delta - a.delta);

  const rise = rises[0];
  if (rise) {
    cards.push({
      id: "rise",
      tone: "warn",
      title: `${categoryLabel(rise.id)} is up on the last ${period}`,
      body: `${formatGBP(rise.delta)} more than the last ${period}. ${CATEGORY_TIP[rise.id]}`,
    });
  }

  const other = current.byCategory.find((c) => c.id === "other");
  if (other && current.spent > 0 && other.amount / current.spent > 0.12) {
    cards.push({
      id: "other",
      tone: "calm",
      title: "A slice is still filed as Other",
      body: `${formatGBP(other.amount)} has no proper category. Naming those taps usually shows a subscription or a takeaway you didn’t think was a habit.`,
    });
  }

  const subs = current.byCategory.find((c) => c.id === "subscriptions");
  if (subs && subs.amount > 0 && cards.length < 4) {
    cards.push({
      id: "subs",
      tone: "calm",
      title: "Subscriptions leave on their own",
      body: `${formatGBP(subs.amount)} is already committed from this ${period}. ${CATEGORY_TIP.subscriptions}`,
    });
  }

  if (cards.length === 0) {
    cards.push({
      id: "empty",
      tone: "calm",
      title: "Log a few spends and the advice gets specific",
      body: `Scan a receipt, or paste a Google Pay, Apple Pay, or Uber alert. ${APP_NAME} will sort it and tell you what to trim.`,
    });
  }

  return cards.slice(0, 4);
}
