import { anyNear, areaOf, townName, townsIn } from "./towns.ts";

/*
 * Reading an offer's small print before showing it, the way a careful friend
 * would: does it work where you live, is it only for new customers, is it only
 * for some accounts? An offer that plainly will not work for this person is
 * not shown. One that might not gets a short line saying what to check.
 */

export type Terms = {
  /** Towns the terms name, such as "leeds" and "birmingham" in "Definitely works in Leeds & Birmingham". */
  places: string[];
  /** Only in some areas, cities, regions or stores, without saying which. */
  someAreas: boolean;
  /** Only for new customers, a first order, a first ride. */
  newOnly: boolean;
  /** Only for some accounts the shop picked. */
  selectedAccounts: boolean;
};

const SOME_AREAS =
  /\b(?:selected|participating|certain|some|specific|eligible)\s+(?:uk\s+)?(?:areas?|regions?|cities|city|towns?|locations?|stores?|shops?|restaurants?|branches|outlets|postcodes?|venues?)\b|\bnot (?:available|valid) (?:in|everywhere)|\bwhere available\b|\bin (?:some|selected) (?:areas|cities|regions)\b|\blocal (?:deal|offer) only\b/i;

const NEW_ONLY =
  /\bnew (?:customers?|users?|members?|accounts?|sign-?ups?|subscribers?|riders?)\b|\bfirst (?:order|ride|trip|purchase|booking|shop|delivery|box|month)\b|\bnew to\b|\bnever (?:ordered|used)\b/i;

const SELECTED_ACCOUNTS = /\b(?:selected|targeted|select|eligible|some)\s+(?:accounts?|users?|customers?|members?)\b/i;

/** What an offer's title, detail and page say about who and where it is for. */
export function readTerms(text: string): Terms {
  return {
    places: townsIn(text),
    someAreas: SOME_AREAS.test(text),
    newOnly: NEW_ONLY.test(text),
    selectedAccounts: SELECTED_ACCOUNTS.test(text),
  };
}

/** True when the title hints at limits worth reading the deal page for. */
export function worthReadingTerms(text: string): boolean {
  const terms = readTerms(text);
  return terms.someAreas || terms.selectedAccounts || /\b(?:instore|in-store|in store)\b/i.test(text);
}

export type Verdict = {
  /** False when the offer plainly will not work for this person. */
  show: boolean;
  /** One short line on what to check, or that it works where they live. Empty when nothing to say. */
  note: string;
  /** The terms name the person's own area. */
  works: boolean;
};

/**
 * Whether to show an offer to this person, and what to tell them.
 * usesShop: they already shop there, so "new customers only" is not for them.
 */
export function judgeTerms(terms: Terms, context: { city: string; usesShop: boolean }): Verdict {
  const notes: string[] = [];
  let works = false;
  const known = areaOf(context.city) != null;
  const where = context.city || "your area";

  if (context.usesShop && terms.newOnly) return { show: false, note: "", works: false };

  const placed = terms.places.some((place) => areaOf(place) != null);
  if (terms.places.length > 0) {
    if (anyNear(terms.places, context.city)) {
      const near = terms.places.find((place) => anyNear([place], context.city)) ?? terms.places[0];
      notes.push(`Works in ${townName(near)}, the deal page says.`);
      works = true;
    } else if (known && placed) {
      // The terms list where it works, and the person's area is not on it.
      return { show: false, note: "", works: false };
    } else {
      notes.push(`Only in ${terms.places.slice(0, 3).map(townName).join(", ")}${terms.places.length > 3 ? " and a few more places" : ""}.`);
    }
  } else if (terms.someAreas) {
    notes.push(`Only in some areas. Check it works in ${where} before you rely on it.`);
  }

  if (terms.newOnly) notes.push("New customers only.");
  if (terms.selectedAccounts) notes.push("Only some accounts get this. Check your app first.");
  return { show: true, note: notes.join(" "), works };
}

/**
 * Terms from a wider web search, where the search read the offer's page and
 * said where it works (a list of places, "nationwide", or "some areas") and
 * who it is for ("anyone", "new customers", "selected accounts").
 */
export function termsFromOffer(text: string, where: unknown, who: unknown): Terms {
  const terms = readTerms(text);
  const list = Array.isArray(where) ? where : typeof where === "string" ? [where] : [];
  for (const entry of list) {
    if (typeof entry !== "string") continue;
    const place = entry.replace(/\s+/g, " ").trim().slice(0, 60);
    if (!place || /\b(?:nationwide|uk-?wide|all (?:of )?(?:the )?uk|everywhere|online|anywhere)\b/i.test(place)) continue;
    if (/\b(?:some|selected|certain|participating|specific|limited)\b/i.test(place)) {
      terms.someAreas = true;
      continue;
    }
    if (!terms.places.some((have) => have.toLowerCase() === place.toLowerCase())) terms.places.push(place);
  }
  const whoText = typeof who === "string" ? who : "";
  if (/\bnew\b|\bfirst\b/i.test(whoText)) terms.newOnly = true;
  if (/\bselected\b|\btargeted\b|\bsome accounts\b/i.test(whoText)) terms.selectedAccounts = true;
  return terms;
}
