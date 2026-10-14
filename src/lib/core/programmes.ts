import type { CategoryId } from "./categories.ts";

/* Loyalty cards and apps that save money at the shops a person uses. */

export type Programme = {
  id: string;
  name: string;
  categories: CategoryId[];
  where: string;
  when: string;
  detail: string;
  href: string;
};

export const PROGRAMMES: Programme[] = [
  {
    id: "clubcard",
    name: "Tesco Clubcard Prices",
    categories: ["groceries", "household"],
    where: "Tesco shops and the Tesco app",
    when: "Ongoing. The lower price applies when a Clubcard is scanned.",
    detail:
      "The yellow Clubcard label is a different price from the ordinary shelf ticket. Scan before you pay the big number.",
    href: "https://www.tesco.com/clubcard",
  },
  {
    id: "nectar",
    name: "Nectar Prices",
    categories: ["groceries", "household"],
    where: "Sainsbury’s",
    when: "Ongoing on the products marked with a Nectar Price.",
    detail:
      "Member prices sit under the regular ticket, and points stack on top. Worth opening the Nectar app before a big Sainsbury’s shop.",
    href: "https://www.nectar.com",
  },
  {
    id: "lidl",
    name: "Lidl Plus",
    categories: ["groceries", "household"],
    where: "The Lidl Plus app, then the till",
    when: "Coupons refresh in the app. Check them before the shop, not after you’ve paid.",
    detail:
      "The savings are coupons and weekly treats inside the app. They apply when you scan Lidl Plus at checkout.",
    href: "https://www.lidl.co.uk/",
  },
  {
    id: "aldi",
    name: "Aldi Super 6",
    categories: ["groceries"],
    where: "Aldi",
    when: "A short fruit and veg list that changes through the week.",
    detail:
      "If groceries are mostly produce, look at Super 6 before you buy the same items elsewhere at full price.",
    href: "https://www.aldi.co.uk/",
  },
  {
    id: "tgtg",
    name: "Too Good To Go",
    categories: ["groceries", "dining"],
    where: "The Too Good To Go app, collected near you",
    when: "Same-day bags, usually late afternoon or evening. They disappear once reserved.",
    detail:
      "Shops and cafés sell surplus food for a fraction of the menu price. Set your area, then check the day you actually need food.",
    href: "https://www.toogoodtogo.com/en-gb",
  },
  {
    id: "boots",
    name: "Boots Advantage Card",
    categories: ["health", "personal"],
    where: "Boots shops and the Boots app",
    when: "Points and advantage prices run continuously. Bigger points events are posted in the app.",
    detail:
      "Use it on toiletries and pharmacy items you already needed. A points multiple is not a reason to add a third basket.",
    href: "https://www.boots.com/",
  },
  {
    id: "rides",
    name: "Check the ride price first",
    categories: ["transport"],
    where: "Uber and Bolt, on the confirm screen",
    when: "Fares jump in rain, at closing time, and on match days.",
    detail:
      "The upfront price is the moment to switch to the bus or Metro. A membership fee is only worth it when it is smaller than the fees you already pay.",
    href: "https://www.uber.com/gb/en/",
  },
];

export function programmesFor(categories: CategoryId[]): Programme[] {
  const wanted = new Set(categories);
  const matched = PROGRAMMES.filter((p) => p.categories.some((c) => wanted.has(c)));
  if (matched.length > 0) return matched.slice(0, 3);
  return PROGRAMMES.filter((p) => p.categories.includes("groceries")).slice(0, 2);
}
