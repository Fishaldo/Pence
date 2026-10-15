import { hasWord, norm } from "./shops.ts";

/*
 * Plan a spend, from what the person typed: which What it is ("kitchen tap"
 * is DIY, not groceries), short words to search deal boards with, and the
 * searches to run. A long description ("monobloc mixer for high and low
 * pressure with flexible connectors") is kept whole for the web search, but
 * deal boards only find short words, so those are cut down here.
 */

/** Words that say which What an item belongs to. Longer phrases are checked first. */
const KIND_WORDS: Record<string, string[]> = {
  diy: [
    "kitchen tap",
    "bath tap",
    "basin tap",
    "mixer tap",
    "tap",
    "monobloc",
    "sink",
    "toilet seat",
    "toilet",
    "cistern",
    "shower head",
    "shower",
    "radiator",
    "valve",
    "pipe",
    "plumbing",
    "drill",
    "screwdriver",
    "screw",
    "nail",
    "paint",
    "primer",
    "tile",
    "grout",
    "sealant",
    "silicone",
    "plaster",
    "timber",
    "ladder",
    "saw",
    "hammer",
    "spanner",
    "toolbox",
    "tool",
    "light switch",
    "plug socket",
    "socket",
    "light fitting",
    "extension lead",
    "door handle",
    "lock",
    "hinge",
    "bracket",
    "worktop",
    "laminate",
    "flooring",
    "fence panel",
    "decking",
    "wallpaper",
    "insulation",
    "smoke alarm",
  ],
  repairs: ["plumber", "electrician", "boiler service", "boiler repair", "handyman", "decorator", "roofer", "locksmith"],
  tech: [
    "iphone",
    "samsung galaxy",
    "google pixel",
    "pixel",
    "smartphone",
    "phone",
    "laptop",
    "macbook",
    "ipad",
    "tablet",
    "television",
    "smart tv",
    "headphones",
    "airpods",
    "earbuds",
    "smartwatch",
    "apple watch",
    "nintendo switch",
    "playstation",
    "ps5",
    "xbox",
    "console",
    "monitor",
    "printer",
    "camera",
    "speaker",
    "router",
  ],
  furniture: [
    "sofa",
    "bed frame",
    "bed",
    "mattress",
    "wardrobe",
    "dining table",
    "table",
    "chair",
    "desk",
    "chest of drawers",
    "bookcase",
    "fridge freezer",
    "fridge",
    "freezer",
    "washing machine",
    "dishwasher",
    "tumble dryer",
    "oven",
    "cooker",
    "hob",
    "microwave",
    "vacuum",
    "hoover",
  ],
  household: ["kettle", "toaster", "duvet", "pillow", "bedding", "towel", "curtain", "cushion", "rug", "saucepan", "frying pan", "cleaning", "bin bag", "air fryer"],
  garden: ["lawnmower", "lawn mower", "hose", "compost", "plant pot", "garden furniture", "shed", "barbecue", "bbq"],
  fashion: ["trainers", "shoes", "boots", "dress", "jacket", "coat", "jeans", "jumper", "hoodie", "suit"],
  kids: ["pram", "pushchair", "buggy", "car seat", "nappies", "nappy", "baby", "toy"],
  pets: ["dog food", "cat food", "cat litter", "dog bed", "pet food"],
  bike: ["bike lock", "bicycle", "e-bike", "ebike", "bike"],
  car: ["tyre", "car battery", "mot", "car service", "wiper"],
  groceries: ["weekly shop", "milk", "bread", "eggs", "rice", "chicken"],
  health: ["glasses", "contact lenses", "paracetamol", "vitamins", "hearing aid"],
  personal: ["shower gel", "shampoo", "razor", "perfume", "aftershave", "makeup", "moisturiser", "haircut"],
  gifts: ["present", "gift"],
  holiday: ["holiday", "hotel", "all inclusive"],
  fitness: ["gym", "personal trainer"],
};

const KIND_PHRASES: [string, string][] = Object.entries(KIND_WORDS)
  .flatMap(([kind, words]) => words.map((word): [string, string] => [word, kind]))
  .sort((a, b) => b[0].length - a[0].length);

/** The What an item belongs to, or null when the words don't say. */
export function planKindFor(item: string): string | null {
  const hay = norm(item);
  if (!hay) return null;
  for (const [word, kind] of KIND_PHRASES) if (hasWord(hay, word)) return kind;
  return null;
}

/** Common ways of writing the same thing in a shop's own words. */
const SAME_AS: [RegExp, string][] = [
  [/\bmono[\s-]?bloc?k?\b/g, "monobloc"],
  [/\bwi[\s-]?fi\b/g, "wifi"],
  [/\be[\s-]bike\b/g, "ebike"],
];

const FILLER = new Set(
  "a an the for with and or of to in on at by from that this which is are be it its my our your some any very really good nice new best cheap cheapest want need needs looking buy buying get approved recommended system systems type kind one ones please".split(
    " ",
  ),
);

/** Plain words of a description, filler dropped: "Mono block mixer for high…" → "monobloc mixer high low pressure…". */
export function keyWords(text: string): string[] {
  let hay = norm(text)
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9&+.'\s-]/g, " ");
  for (const [from, to] of SAME_AS) hay = hay.replace(from, to);
  const seen = new Set<string>();
  const words: string[] = [];
  for (const raw of hay.split(/\s+/)) {
    const word = raw.replace(/^[.'-]+|[.'-]+$/g, "");
    if (word.length < 2 || FILLER.has(word) || seen.has(word)) continue;
    seen.add(word);
    words.push(word);
  }
  return words;
}

/** A short search for deal boards: at most five words of the item. */
export function itemQuery(item: string): string {
  return keyWords(item).slice(0, 5).join(" ");
}

export type PlanQueryInput = {
  /** What they typed in Item, such as "Kitchen tap". */
  item: string;
  /** Size, type or must-haves, such as "monobloc, high and low pressure". */
  details?: string;
  /** A shop they want, such as "Screwfix". */
  shop?: string;
  town?: string;
  /** Words from Plan's quick answers, such as "click and collect". */
  answers?: string;
  /** A word for the What, used only when no item is given, such as "supermarket". */
  category: string;
  /** Extra searches for the What when no item is given, such as big supermarket names. */
  extra?: string[];
};

/**
 * The deal-board searches for a plan, most specific first, six at most. With an item, every
 * search is about that item (never the What's broad category), so a tap search can't return a sofa.
 */
export function planQueries(input: PlanQueryInput): string[] {
  const focus = itemQuery(input.item);
  const base = focus || input.category;
  const local = input.town?.trim() ?? "";
  const shop = input.shop?.trim() ?? "";
  const extra = input.answers?.trim() ?? "";
  const spec = focus && input.details ? keyWords(input.details).filter((word) => !focus.split(" ").includes(word)).slice(0, 2).join(" ") : "";
  const queries = [
    focus && shop ? `${shop} ${focus}` : "",
    spec ? `${focus} ${spec}` : "",
    local ? `${local} ${base}${extra ? ` ${extra}` : ""}` : "",
    extra ? `${base} ${extra}` : "",
    local ? `${local} ${base}` : "",
    base,
    shop,
    ...(focus ? [] : (input.extra ?? [])),
  ];
  return queries
    .map((query) => query.replace(/\s+/g, " ").trim())
    .filter((query, index, all) => query.length >= 2 && all.indexOf(query) === index)
    .slice(0, 6);
}
