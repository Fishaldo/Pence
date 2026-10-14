import type { CategoryId } from "./categories.ts";
import { poundsToPence } from "./money.ts";
import { looksLikePerson, saysTransfer } from "./money-sent.ts";

/* Reading a payment alert or a line of text: the amount, the shop, and a first guess at the category. */

export type ParsedAlert = {
  merchant: string;
  amountPence: number | null;
  category: CategoryId;
  confidence: number;
};

const KEYWORDS: { category: CategoryId; words: string[] }[] = [
  {
    category: "dining",
    words: [
      "uber eats",
      "ubereats",
      "just eat",
      "deliveroo",
      "greggs",
      "mcdonald",
      "nando",
      "wagamama",
      "starbucks",
      "costa coffee",
      "costa",
      "pret a manger",
      "pret",
      "kfc",
      "domino",
      "pizza hut",
      "burger king",
    ],
  },
  {
    category: "groceries",
    words: [
      "tesco",
      "sainsbury",
      "asda",
      "aldi",
      "lidl",
      "morrisons",
      "waitrose",
      "iceland",
      "co-op",
      "coop",
      "ocado",
      "m&s food",
      "farmfoods",
    ],
  },
  {
    category: "transport",
    words: ["uber", "bolt", "trainline", "tfl", "nexus", "stagecoach", "national rail", "free now"],
  },
  {
    category: "subscriptions",
    words: [
      "netflix",
      "spotify",
      "disney+",
      "disney plus",
      "youtube premium",
      "now tv",
      "amazon prime",
      "prime video",
      "apple music",
      "icloud",
      "puregym",
      "pure gym",
      "david lloyd",
      "nuffield",
      "the gym group",
      "gymbox",
      "gym",
    ],
  },
  {
    category: "fashion",
    words: ["primark", "zara", "asos", "h&m", "uniqlo", "shein", "nike", "jd sports", "next "],
  },
  {
    category: "entertainment",
    words: ["odeon", "vue", "cineworld", "steam", "playstation", "ticketmaster", "cinema"],
  },
  {
    category: "health",
    words: ["boots", "superdrug", "pharmacy", "holland & barrett", "lloyds pharmacy"],
  },
  {
    category: "household",
    words: ["ikea", "dunelm", "b&q", "screwfix", "the range", "wilko", "home bargains", "robert dyas"],
  },
  {
    category: "bills",
    words: [
      "octopus",
      "british gas",
      "eon",
      "edf",
      "ovo energy",
      "thames water",
      "northumbrian water",
      "council tax",
      "vodafone",
      "giffgaff",
      "virgin media",
      "tv licence",
      "tv license",
      "bt broadband",
    ],
  },
  {
    category: "housing",
    words: ["rent", "landlord", "letting", "lettings", "mortgage", "housing association"],
  },
  {
    category: "kids",
    words: ["smyths", "mothercare", "childcare", "nursery fees", "the entertainer", "kids club", "parentpay", "parent pay"],
  },
  {
    category: "pets",
    words: ["pets at home", "vets4pets", "medivet", "jollyes", "pets corner", "veterinary"],
  },
  {
    category: "education",
    words: ["udemy", "coursera", "tuition", "school fees", "open university", "exam fee"],
  },
  {
    category: "charity",
    words: ["justgiving", "donation", "gift aid", "unicef", "nspcc", "save the children", "wateraid"],
  },
  {
    category: "fees",
    words: ["overdraft fee", "overdraft interest", "late payment fee", "non-sterling", "foreign transaction fee", "account fee"],
  },
  {
    category: "cash",
    words: ["cash withdrawal", "cashpoint", "atm withdrawal", "link atm"],
  },
  {
    category: "savings",
    words: ["savings pot", "to savings", "cash isa", "premium bonds", "ns&i", "easy access saver"],
  },
  {
    category: "investments",
    words: ["vanguard", "trading 212", "hargreaves lansdown", "freetrade", "aj bell", "nutmeg", "stocks and shares isa"],
  },
  {
    category: "transfers",
    words: [
      "transfer to own",
      "own account",
      "to my account",
      "between accounts",
      "to current account",
      "from current account",
    ],
  },
  {
    category: "sent",
    words: [
      "lemfi",
      "lem fi",
      "transferwise",
      "wise.com",
      "remitly",
      "worldremit",
      "world remit",
      "western union",
      "moneygram",
      "sendwave",
      "taptap send",
      "ria money",
      "paysend",
      "azimo",
      "afriex",
      "chipper cash",
    ],
  },
  {
    category: "travel",
    words: ["airbnb", "booking.com", "ryanair", "easyjet", "jet2", "british airways"],
  },
  {
    category: "personal",
    words: ["barber", "haircut", "the body shop"],
  },
];

/** Money moved, not spent: when one of these phrases is there, it wins over any shop word. */
const MOVED = new Set<CategoryId>(["transfers", "savings", "investments"]);

/**
 * Each keyword as a whole word, so "rent" is not found in "current" and "bolt"
 * not in "Bolton". A plural or possessive still counts: McDonald's, Sainsburys.
 */
const KEYWORD_PATTERNS = KEYWORDS.flatMap((rule) =>
  rule.words.map((word) => {
    const text = word.trim();
    const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return { category: rule.category, len: text.length, test: new RegExp(`(?<![a-z0-9])${escaped}(?:'?s)?(?![a-z0-9])`) };
  }),
);

function matchCategory(text: string): { category: CategoryId; len: number } | null {
  const hay = text.toLowerCase().replace(/[’‘]/g, "'");
  let best: { category: CategoryId; len: number } | null = null;
  let moved: { category: CategoryId; len: number } | null = null;
  for (const pattern of KEYWORD_PATTERNS) {
    if (!pattern.test.test(hay)) continue;
    if (MOVED.has(pattern.category)) {
      if (!moved || pattern.len > moved.len) moved = { category: pattern.category, len: pattern.len };
    } else if (!best || pattern.len > best.len) {
      best = { category: pattern.category, len: pattern.len };
    }
  }
  return moved ?? best;
}

function tidyName(s: string): string {
  const cleaned = s
    .replace(/\.com\b/gi, "")
    .replace(/\b(with|using|via|on|for|from|paid|payment|card|google|apple|pay)\b/gi, " ");
  return cleaned
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function extractAmount(text: string): number | null {
  const patterns = [
    /£\s*(\d{1,6}(?:,\d{3})*(?:\.\d{1,2})?)/,
    /\bgbp\s*(\d{1,6}(?:,\d{3})*(?:\.\d{1,2})?)/i,
    /(\d{1,6}(?:,\d{3})*\.\d{2})\s*(?:gbp)\b/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const pence = poundsToPence(match[1]);
    if (pence != null && pence > 0) return pence;
  }
  return null;
}

function extractMerchant(text: string): string {
  let t = text.replace(/google\s*pay|apple\s*pay|gpay|apple\s*wallet|samsung\s*pay/gi, " ");
  const directed = t.match(
    /\b(?:at|to|from)\s+([a-z0-9][a-z0-9&.'’-]*(?:\s+[a-z0-9][a-z0-9&.'’-]*){0,3})/i,
  );
  if (directed) return tidyName(directed[1]);
  t = t.replace(/£\s*\d[\d.,]*|\b\d[\d.,]*\s*gbp\b/gi, " ");
  t = t.replace(/[·•|]/g, " ");
  t = t.replace(
    /\b(you|paid|spent|payment|payments|trip|completed|with|using|via|on|the|a|an|for|notification|card|no|receipt|ending|in|gbp|apple|google|pay|debited|purchase)\b/gi,
    " ",
  );
  t = t.replace(/[^a-z0-9&.'’\-\s]/gi, " ").replace(/\s+/g, " ").trim();
  return tidyName(t);
}

/**
 * True when an alert or statement line says money was sent to a person: "You
 * sent £50 to Mum", "FPS J SMITH". A bare name is not enough to file it, since
 * "Bolton Wanderers" reads like a name too; those stay as Other, and the person
 * is asked.
 */
function sentToPerson(text: string, merchant: string): boolean {
  if (!merchant || !looksLikePerson(merchant)) return false;
  // "Paid £8 at Mama's Kitchen" is a shop.
  if (/\b(at|in store|contactless)\b/i.test(text)) return false;
  return saysTransfer(text);
}

export function parseAlert(raw: string): ParsedAlert {
  const text = raw.replace(/\s+/g, " ").trim();
  const amountPence = extractAmount(text);
  const hit = matchCategory(text);
  const merchant = extractMerchant(text);
  const category = hit?.category ?? (sentToPerson(text, merchant) ? "sent" : "other");
  let confidence = 0.25;
  if (amountPence && merchant && hit) confidence = 0.88;
  else if (amountPence && merchant) confidence = 0.56;
  else if (amountPence && hit) confidence = 0.62;
  else if (amountPence) confidence = 0.4;
  return {
    merchant: merchant || "Card payment",
    amountPence,
    category,
    confidence,
  };
}

/** "About 20 pounds at ASDA, groceries" reads as "about £20 at ASDA, groceries". */
export function spokenToAlert(text: string): string {
  return text
    .replace(/(\d+(?:[.,]\d{1,2})?)\s*(?:pounds?|quid|gbp)\b/gi, (_, n: string) => `£${n.replace(",", ".")}`)
    .replace(/£\s*(\d+)\s*(?:and\s*)?(\d{1,2})\s*p(?:ence)?\b/gi, (_, a: string, b: string) => `£${a}.${b.padStart(2, "0")}`)
    .replace(/\s+/g, " ")
    .trim();
}
