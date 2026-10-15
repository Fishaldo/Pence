/*
 * Plan's quick questions: at most three for each What, one tap each. Only
 * questions whose answer changes which places or deals fit are asked. Every
 * answer becomes words for the search and a line in the brief, so offers come
 * only from places that can do it. Skip is always allowed.
 */

export type PlanChoice = { label: string; /** Words added to deal searches. Empty adds none. */ words?: string };
export type PlanQuestion = { id: string; label: string; choices: PlanChoice[] };

const WHO: PlanQuestion = {
  id: "who",
  label: "Who's going?",
  choices: [
    { label: "Just me" },
    { label: "Two of us", words: "for two" },
    { label: "Family", words: "family" },
    { label: "Friends, 3 to 6", words: "group" },
    { label: "A big group, 7+", words: "group booking" },
  ],
};

const NEEDS_HELP: PlanChoice = { label: "Someone needs help getting about", words: "accessible" };

const EATING_OUT: PlanQuestion[] = [
  WHO,
  {
    id: "meal",
    label: "Which meal?",
    choices: [
      { label: "Breakfast", words: "breakfast" },
      { label: "Lunch", words: "lunch" },
      { label: "Dinner", words: "dinner" },
      { label: "Takeaway", words: "takeaway" },
    ],
  },
  {
    id: "food",
    label: "Food",
    choices: [
      { label: "Any" },
      { label: "Indian", words: "indian" },
      { label: "Pizza", words: "pizza" },
      { label: "Italian", words: "italian" },
      { label: "Chinese", words: "chinese" },
      { label: "Caribbean", words: "caribbean" },
      { label: "Halal", words: "halal" },
      { label: "Vegan", words: "vegan" },
    ],
  },
];

const SPORT: PlanQuestion[] = [
  {
    id: "activity",
    label: "Which activity?",
    choices: [
      { label: "Gym", words: "gym" },
      { label: "Swimming", words: "swimming" },
      { label: "Classes", words: "fitness classes" },
      { label: "Football", words: "football" },
      { label: "Running", words: "running" },
    ],
  },
  {
    id: "often",
    label: "How often a week?",
    choices: [{ label: "Once" }, { label: "2 or 3 times" }, { label: "4 or more", words: "membership" }],
  },
];

const BILL_FOCUS = (extra: PlanChoice[]): PlanQuestion => ({
  id: "matters",
  label: "What matters most?",
  choices: [{ label: "Lowest price", words: "cheapest" }, { label: "No long contract", words: "no contract" }, ...extra],
});

const HOME_BUY: PlanQuestion[] = [
  { id: "condition", label: "New or used?", choices: [{ label: "New" }, { label: "Used or refurbished", words: "refurbished" }] },
  {
    id: "delivery",
    label: "Getting it home",
    choices: [{ label: "Delivered", words: "free delivery" }, { label: "Delivered and fitted", words: "installation" }, { label: "I'll collect", words: "click and collect" }],
  },
];

const GETTING_THERE: PlanQuestion[] = [
  {
    id: "how",
    label: "How?",
    choices: [
      { label: "Train", words: "train tickets" },
      { label: "Coach", words: "coach tickets" },
      { label: "Flight", words: "flights" },
      { label: "Taxi", words: "taxi" },
      { label: "Car hire", words: "car hire" },
    ],
  },
  { id: "trip", label: "Single or return?", choices: [{ label: "Single", words: "single" }, { label: "Return", words: "return" }, { label: "Not sure yet" }] },
  {
    id: "travellers",
    label: "Who's travelling?",
    choices: [{ label: "Just me" }, { label: "Two adults" }, { label: "With children", words: "family" }, NEEDS_HELP],
  },
];

export const PLAN_QUESTIONS: Record<string, PlanQuestion[]> = {
  dining: EATING_OUT,
  pub: [WHO, EATING_OUT[1]],
  groceries: [
    { id: "size", label: "Weekly shop or one thing?", choices: [{ label: "Weekly shop", words: "weekly shop" }, { label: "One thing" }] },
    {
      id: "how",
      label: "How?",
      choices: [{ label: "Delivery", words: "delivery" }, { label: "Click and collect", words: "click and collect" }, { label: "In store" }],
    },
  ],
  holiday: [
    {
      id: "length",
      label: "How long?",
      choices: [{ label: "A weekend", words: "weekend break" }, { label: "A week", words: "7 nights" }, { label: "Two weeks", words: "14 nights" }],
    },
    {
      id: "who",
      label: "Who's going?",
      choices: [{ label: "Just me", words: "solo" }, { label: "A couple", words: "couples" }, { label: "Family with children", words: "family holiday" }, { label: "Friends", words: "group" }, NEEDS_HELP],
    },
    {
      id: "type",
      label: "What kind?",
      choices: [{ label: "City break", words: "city break" }, { label: "Beach", words: "beach" }, { label: "All inclusive", words: "all inclusive" }, { label: "UK break", words: "uk staycation" }],
    },
  ],
  travel: GETTING_THERE,
  transport: GETTING_THERE,
  parking: [{ id: "when", label: "How long?", choices: [{ label: "A few hours" }, { label: "All day", words: "all day" }, { label: "Airport, a week", words: "airport parking" }] }],
  car: [
    {
      id: "need",
      label: "What's needed?",
      choices: [
        { label: "MOT", words: "mot" },
        { label: "Service", words: "car service" },
        { label: "Tyres", words: "tyres" },
        { label: "Insurance", words: "car insurance" },
        { label: "Fuel", words: "fuel" },
      ],
    },
  ],
  driving: [{ id: "level", label: "Where are you up to?", choices: [{ label: "First lessons", words: "beginner" }, { label: "Test soon", words: "intensive" }] }],
  household: HOME_BUY,
  furniture: HOME_BUY,
  diy: [
    { id: "fit", label: "Who's fitting it?", choices: [{ label: "I'll fit it" }, { label: "I need it fitted", words: "fitting service" }] },
    {
      id: "get",
      label: "Getting it",
      choices: [{ label: "Delivered", words: "delivery" }, { label: "Click and collect", words: "click and collect" }, { label: "In store" }],
    },
  ],
  repairs: [
    {
      id: "what",
      label: "What needs doing?",
      choices: [
        { label: "Plumbing", words: "plumber" },
        { label: "Electrics", words: "electrician" },
        { label: "Boiler", words: "boiler service" },
        { label: "Decorating", words: "decorator" },
      ],
    },
  ],
  garden: [{ id: "what", label: "What for?", choices: [{ label: "Plants", words: "plants" }, { label: "Tools", words: "garden tools" }, { label: "Furniture", words: "garden furniture" }] }],
  energy: [BILL_FOCUS([{ label: "Green energy", words: "green tariff" }, { label: "Fixed price", words: "fixed tariff" }])],
  broadband: [BILL_FOCUS([{ label: "Fast speed", words: "full fibre" }])],
  mobile: [BILL_FOCUS([{ label: "Lots of data", words: "unlimited data" }, { label: "New phone too", words: "phone contract" }])],
  tv: [BILL_FOCUS([{ label: "Sport", words: "sports" }, { label: "Films", words: "movies" }])],
  insurance: [
    {
      id: "what",
      label: "Which insurance?",
      choices: [
        { label: "Car", words: "car insurance" },
        { label: "Home", words: "home insurance" },
        { label: "Travel", words: "travel insurance" },
        { label: "Pet", words: "pet insurance" },
        { label: "Life", words: "life insurance" },
      ],
    },
  ],
  fashion: [
    { id: "for", label: "For whom?", choices: [{ label: "Me" }, { label: "Partner" }, { label: "Children", words: "kids" }, { label: "A gift", words: "gift" }] },
    { id: "what", label: "What?", choices: [{ label: "Clothes" }, { label: "Shoes", words: "shoes" }, { label: "Coat", words: "coat" }, { label: "Workwear", words: "workwear" }] },
  ],
  tech: [
    { id: "condition", label: "New or refurbished?", choices: [{ label: "New" }, { label: "Refurbished", words: "refurbished" }] },
    { id: "trade", label: "Trading one in?", choices: [{ label: "Yes", words: "trade in" }, { label: "No" }] },
  ],
  health: [
    { id: "type", label: "Product or appointment?", choices: [{ label: "Product" }, { label: "Appointment", words: "appointment" }] },
    { id: "for", label: "For whom?", choices: [{ label: "Me" }, { label: "A child", words: "children's" }] },
  ],
  personal: [
    { id: "type", label: "Product or appointment?", choices: [{ label: "Product" }, { label: "Appointment", words: "salon" }] },
  ],
  fitness: SPORT,
  sport: SPORT,
  entertainment: [
    {
      id: "kind",
      label: "What kind?",
      choices: [
        { label: "Cinema", words: "cinema" },
        { label: "Theme park", words: "theme park" },
        { label: "Show", words: "theatre" },
        { label: "Museum", words: "museum" },
        { label: "Bowling", words: "bowling" },
      ],
    },
    WHO,
  ],
  hobbies: [{ id: "kind", label: "What kind?", choices: [{ label: "Crafts", words: "craft" }, { label: "Music", words: "music" }, { label: "Games", words: "games" }, { label: "Books", words: "books" }] }],
  kids: [
    {
      id: "for",
      label: "What for?",
      choices: [
        { label: "Clothes and shoes", words: "kids clothes" },
        { label: "Toys", words: "toys" },
        { label: "School", words: "school uniform" },
        { label: "Baby things", words: "baby" },
        { label: "Days out", words: "kids days out" },
      ],
    },
  ],
  childcare: [{ id: "type", label: "What kind?", choices: [{ label: "Nursery", words: "nursery" }, { label: "Holiday club", words: "holiday club" }, { label: "After school", words: "after school club" }] }],
  pets: [
    {
      id: "for",
      label: "What for?",
      choices: [{ label: "Food", words: "pet food" }, { label: "Vet", words: "vet" }, { label: "Insurance", words: "pet insurance" }, { label: "Toys and bedding", words: "pet bed" }],
    },
  ],
  gifts: [
    { id: "for", label: "For whom?", choices: [{ label: "Partner" }, { label: "A child", words: "kids" }, { label: "Friend" }, { label: "Family" }, { label: "Work" }] },
    {
      id: "occasion",
      label: "Occasion",
      choices: [{ label: "Birthday", words: "birthday" }, { label: "Christmas", words: "christmas" }, { label: "Wedding", words: "wedding" }, { label: "Thank you" }],
    },
    { id: "type", label: "A thing or an experience?", choices: [{ label: "A thing" }, { label: "An experience", words: "experience" }] },
  ],
  events: [
    {
      id: "occasion",
      label: "Occasion",
      choices: [{ label: "Birthday", words: "birthday party" }, { label: "Wedding", words: "wedding" }, { label: "Christening", words: "christening" }, { label: "Graduation", words: "graduation" }],
    },
    { id: "guests", label: "How many guests?", choices: [{ label: "Under 10" }, { label: "10 to 30", words: "party" }, { label: "30 to 100", words: "venue hire" }, { label: "Over 100", words: "large venue" }] },
    { id: "need", label: "What's needed?", choices: [{ label: "Venue", words: "venue" }, { label: "Food", words: "catering" }, { label: "Cake", words: "cake" }, { label: "Decorations", words: "decorations" }] },
  ],
  education: [{ id: "what", label: "What?", choices: [{ label: "A course", words: "course" }, { label: "Books", words: "books" }, { label: "Tuition", words: "tutor" }, { label: "School uniform", words: "school uniform" }] }],
  subscriptions: [{ id: "what", label: "What?", choices: [{ label: "Streaming", words: "streaming" }, { label: "Music", words: "music" }, { label: "Gym", words: "gym" }, { label: "Software", words: "software" }] }],
  moving: [{ id: "need", label: "What's needed?", choices: [{ label: "A van", words: "van hire" }, { label: "Removals", words: "removals" }, { label: "Boxes", words: "boxes" }, { label: "Storage", words: "storage" }] }],
};

export type PlanAnswers = Record<string, string>;

/** The questions for a What, three at most. */
export function questionsFor(kind: string): PlanQuestion[] {
  return (PLAN_QUESTIONS[kind] ?? []).slice(0, 3);
}

/** Search words from the answers, in question order: "family indian dinner". */
export function answerWords(kind: string, answers: PlanAnswers): string {
  const words: string[] = [];
  for (const question of questionsFor(kind)) {
    const picked = question.choices.find((choice) => choice.label === answers[question.id]);
    if (picked?.words) words.push(picked.words);
  }
  return words.join(" ");
}

/** The answers as plain sentences for the search brief: "Who's going? Family. Food: Indian." */
export function answerBrief(kind: string, answers: PlanAnswers): string {
  return questionsFor(kind)
    .filter((question) => answers[question.id])
    .map((question) => `${question.label.replace(/\?$/, "")}: ${answers[question.id]}.`)
    .join(" ");
}
