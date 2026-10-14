/*
 * Money sent to people is not shopping.
 *
 * £100 sent to Mum on LemFi, or a bank transfer to a partner filed as a gift,
 * says nothing about what the person buys. If Pence treated it as a gift
 * purchase, it would look for gift boxes. So Pence tells the two apart:
 *
 *   - a money-transfer app (LemFi, Wise, Remitly…) is always money sent;
 *   - a payee that reads like a person's name ("SOMTOCHUKWU NKEMEL",
 *     "FPS J SMITH", "Mum") is money sent when the payment was filed as a gift,
 *     cash, charity, other or money sent, and there is no receipt.
 *
 * Money sent is still counted as spending (it has left the account), but it
 * never becomes a shopping habit, a "shop", or a web lookup of someone's name.
 */

/** Apps and services for sending money, at home or abroad. Tested against the merchant and the statement line. */
export const SENDING_SERVICES: { name: string; test: RegExp }[] = [
  { name: "LemFi", test: /\blem\s?fi\b|lemonade finance/ },
  { name: "Wise", test: /\bwise\.com\b|\btransferwise\b|^wise( payments?( ltd| limited)?| europe.*| ltd| limited)?$/ },
  { name: "Remitly", test: /\bremitly\b/ },
  { name: "WorldRemit", test: /\bworld\s?remit\b/ },
  { name: "Western Union", test: /\bwestern union\b/ },
  { name: "MoneyGram", test: /\bmoney\s?gram\b/ },
  { name: "Sendwave", test: /\bsendwave\b/ },
  { name: "Taptap Send", test: /\btaptap\s?send\b/ },
  { name: "Ria", test: /\bria money\b|\bria financial\b/ },
  { name: "Xoom", test: /\bxoom\b/ },
  { name: "Paysend", test: /\bpaysend\b/ },
  { name: "Small World", test: /\bsmall world (financial|money)\b/ },
  { name: "Azimo", test: /\bazimo\b/ },
  { name: "Afriex", test: /\bafriex\b/ },
  { name: "Nala", test: /\bnala money\b|\bsend with nala\b/ },
  { name: "Chipper Cash", test: /\bchipper\s?cash\b/ },
  { name: "Grey", test: /\bgrey\.co\b|\bgrey finance\b/ },
];

/** The money-transfer app named in a payment, or null. */
export function sendingService(...texts: (string | undefined)[]): string | null {
  for (const text of texts) {
    const hay = (text ?? "").toLowerCase();
    if (!hay) continue;
    for (const service of SENDING_SERVICES) if (service.test.test(hay)) return service.name;
  }
  return null;
}

/** How a bank or app marks a payment to a person, not to a shop. */
const TRANSFER_WORDS =
  /\b(you sent|sent to|sent you|transfer(red)? to|bank transfer|faster payments?|\bfps\b|\btfr\b|standing order|\bbacs\b|mobile payment|payment to|online transfer|paid to)\b/i;

export function saysTransfer(text: string): boolean {
  return TRANSFER_WORDS.test(text);
}

/** Words at the front or back of a statement line that say how it was paid, not who to. */
const LEAD = new Set([
  "fps",
  "fp",
  "faster",
  "payment",
  "payments",
  "to",
  "tfr",
  "trf",
  "transfer",
  "bank",
  "so",
  "standing",
  "order",
  "bacs",
  "mobile",
  "online",
  "sent",
  "bp",
  "ob",
  "p2p",
  "mr",
  "mrs",
  "ms",
  "miss",
  "dr",
  "mx",
]);

/** Words that mean a business, a place or a thing, not a person. */
const BUSINESS = new Set(
  (
    "ltd limited plc llp llc inc co uk gb com net org store stores shop shops supermarket supermarkets super market markets mart " +
    "superstore express extra metro local cafe café coffee restaurant restaurants kitchen bar pub inn grill diner bistro eatery " +
    "takeaway pizza pizzeria chicken kebab kebabs burger burgers fish chips chippy bakery bakers butchers butcher grocer grocers grocery groceries " +
    "foods food wines wine off licence newsagent newsagents news stationers chemist pharmacy pharmacies clinic dental dentist dentists " +
    "opticians optician vets vet veterinary services service group holdings trading traders trade enterprises enterprise international " +
    "global solutions systems energy water gas electric electricity council borough county city town bank building society insurance " +
    "assurance finance financial capital credit loans loan gym fitness studio studios centre center club school schools college university " +
    "academy nursery church ministries ministry mosque temple chapel halal continental african africa asian asia oriental caribbean polish " +
    "turkish indian chinese thai italian wholesale cash carry direct online digital payments pay wallet card cards the and of house homes home " +
    "hair beauty nails cosmetics salon salons barbers barber spa fashion fashions clothing clothes boutique wear shoes textiles " +
    "petrol fuel filling station parking park taxi taxis cabs cars car motors garage autos auto wash repairs repair tyres lettings letting " +
    "estates estate properties property housing association rentals rent landlord hotel hotels travel travels tours airways airlines air " +
    "rail railway trains buses bus coaches transport logistics couriers delivery post office mail parcel parcels amazon ebay paypal google " +
    "apple microsoft netflix spotify tesco asda aldi lidl sainsbury morrisons waitrose iceland primark boots argos currys greggs " +
    "mcdonalds kfc subway nandos costa starbucks uber bolt deliveroo just eat trainline ticket tickets cinema theatre games gaming " +
    "media tv mobile telecom broadband fibre phone phones network networks electronics computers tech technology software apps app " +
    "brothers bros sons daughters partners associates company companies corp corporation agency " +
    "lounge palace royal kingdom world depot outlet warehouse factory works workshop supplies supply hire"
  ).split(/\s+/),
);

/** A single word that is still a person: "Sent £50 to Mum". */
const FAMILY = new Set([
  "mum",
  "mom",
  "mam",
  "mummy",
  "mother",
  "dad",
  "daddy",
  "father",
  "brother",
  "bro",
  "sister",
  "sis",
  "auntie",
  "aunty",
  "aunt",
  "uncle",
  "grandma",
  "grandpa",
  "nan",
  "nana",
  "nanna",
  "granny",
  "grandad",
  "grandmother",
  "grandfather",
  "son",
  "daughter",
  "wife",
  "husband",
  "partner",
  "cousin",
  "niece",
  "nephew",
  "fiance",
  "fiancee",
]);

function words(text: string): string[] {
  const cut = text
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    // Everything after a reference is the note, not the payee: "J SMITH REF BIRTHDAY".
    .replace(/\b(ref|reference|memo)\b.*$/, " ")
    .replace(/[^a-z' -]+/g, " ");
  const all = cut.split(/\s+/).filter(Boolean);
  let start = 0;
  while (start < all.length && LEAD.has(all[start])) start += 1;
  return all.slice(start);
}

/**
 * True when a payee reads like a person, not a shop: two to four plain name
 * words with no business words ("SOMTOCHUKWU NKEMEL", "FPS J SMITH",
 * "Ngozi A. Okafor"), or a family word on its own ("Mum").
 * It only reads the words; the caller decides whether a known shop wins.
 */
export function looksLikePerson(name: string): boolean {
  const tokens = words(name);
  if (tokens.length === 1) return FAMILY.has(tokens[0]);
  if (tokens.length < 2 || tokens.length > 4) return false;
  if (tokens.some((word) => BUSINESS.has(word))) return false;
  if (!tokens.every((word) => /^[a-z][a-z'-]{0,19}$/.test(word))) return false;
  // Initials are fine ("J SMITH"), but a name needs at least one real word of three letters.
  const longest = Math.max(...tokens.map((word) => word.replace(/[^a-z]/g, "").length));
  return longest >= 3;
}

export type PayeeKind = "service" | "person" | null;

/** Whether a payment went to a money-transfer app, to a person, or neither as far as the words show. */
export function payeeKind(merchant: string, description = ""): PayeeKind {
  if (sendingService(merchant, description)) return "service";
  if (looksLikePerson(merchant) || (description && looksLikePerson(description))) return "person";
  return null;
}

/** Categories where a person's name means money given, not a purchase. */
const GIVING = new Set(["gifts", "cash", "charity", "other", "sent"]);

/**
 * True when a payment is money sent to someone rather than something bought.
 * `knownShop` is true when Pence already knows the payee as a shop (Card
 * Factory, Moonpig); a known shop is never a person.
 */
export function isMoneySent(
  spend: {
    merchant: string;
    description?: string;
    category: string;
    items?: unknown[];
    source?: string;
  },
  knownShop = false,
): boolean {
  if (spend.category === "sent") return true;
  if (sendingService(spend.merchant, spend.description)) return true;
  if (knownShop || !GIVING.has(spend.category)) return false;
  // A receipt or a list of items means something was bought.
  if ((spend.items?.length ?? 0) > 0 || spend.source === "receipt" || spend.source === "gallery") return false;
  return payeeKind(spend.merchant, spend.description) === "person";
}
