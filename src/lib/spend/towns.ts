/*
 * UK towns and cities by area, so a deal you can only use in person far away
 * (a restaurant voucher in Scarborough, an in-store price in Bolton) is not
 * shown to someone in Birmingham. Names that are also ordinary words, such as
 * Reading, Bath, Sale, Deal or Rugby, and county names that turn up in product
 * names ("Devon cream tea"), are left out on purpose. A town is matched only as
 * written with a capital, so "a local derby" is not Derby.
 */

const AREAS: Record<string, string[]> = {
  london: [
    "London", "Croydon", "Bromley", "Romford", "Ilford", "Harrow", "Wembley", "Hackney", "Brixton",
    "Camden", "Islington", "Greenwich", "Lewisham", "Ealing", "Hounslow", "Kingston", "Wimbledon", "Enfield",
    "Barnet", "Walthamstow", "Woolwich", "Peckham", "Tottenham", "Uxbridge", "Sutton", "Bexleyheath", "Dagenham",
  ],
  "south-east": [
    "Brighton", "Hove", "Southampton", "Portsmouth", "Oxford", "Milton Keynes", "Slough", "Guildford", "Woking",
    "Crawley", "Maidstone", "Canterbury", "Basingstoke", "High Wycombe", "Aylesbury", "Eastbourne", "Hastings",
    "Worthing", "Chichester", "Winchester", "Tunbridge Wells", "Margate", "Folkestone", "Dover", "Ashford",
    "Bracknell", "Farnborough", "Reigate", "Gillingham", "Chatham", "Rochester", "Dartford", "Gravesend",
    "Bognor Regis", "Newbury", "Banbury",
  ],
  "south-west": [
    "Bristol", "Plymouth", "Exeter", "Bournemouth", "Poole", "Swindon", "Gloucester", "Cheltenham", "Torquay",
    "Taunton", "Weston-super-Mare", "Salisbury", "Yeovil", "Truro", "Newquay", "Barnstaple", "Weymouth",
  ],
  east: [
    "Cambridge", "Norwich", "Ipswich", "Peterborough", "Luton", "Chelmsford", "Colchester", "Southend",
    "Basildon", "Watford", "St Albans", "Stevenage", "Hemel Hempstead", "Bedford", "Harlow", "Great Yarmouth",
    "King's Lynn", "Lowestoft", "Bury St Edmunds", "Hertford", "Brentwood", "Clacton",
  ],
  "west-midlands": [
    "Birmingham", "Solihull", "Coventry", "Wolverhampton", "Walsall", "Dudley", "West Bromwich", "Sutton Coldfield",
    "Stoke", "Stoke-on-Trent", "Stafford", "Worcester", "Hereford", "Telford", "Shrewsbury", "Redditch",
    "Kidderminster", "Nuneaton", "Leamington", "Warwick", "Tamworth", "Cannock", "Lichfield",
    "Bromsgrove", "Stourbridge", "Halesowen", "Oldbury", "Smethwick",
  ],
  "east-midlands": [
    "Nottingham", "Leicester", "Derby", "Northampton", "Lincoln", "Mansfield", "Chesterfield", "Loughborough",
    "Kettering", "Corby", "Wellingborough", "Grantham", "Newark", "Hinckley", "Melton Mowbray",
    "Skegness",
  ],
  yorkshire: [
    "Leeds", "Sheffield", "Bradford", "Hull", "York", "Doncaster", "Rotherham", "Huddersfield", "Wakefield",
    "Barnsley", "Halifax", "Harrogate", "Scarborough", "Middlesbrough", "Grimsby", "Scunthorpe", "Dewsbury",
    "Keighley", "Whitby", "Selby", "Pontefract", "Castleford", "Bridlington",
  ],
  "north-west": [
    "Manchester", "Liverpool", "Salford", "Stockport", "Bolton", "Wigan", "Oldham", "Rochdale", "Preston",
    "Blackpool", "Blackburn", "Burnley", "Warrington", "St Helens", "Birkenhead", "Southport", "Chester",
    "Crewe", "Lancaster", "Carlisle", "Trafford", "Altrincham", "Macclesfield", "Widnes", "Runcorn",
    "Ashton-under-Lyne", "Bury", "Kendal", "Barrow-in-Furness",
  ],
  "north-east": [
    "Newcastle", "Sunderland", "Gateshead", "Durham", "Darlington", "Hartlepool", "Stockton", "South Shields",
    "North Shields", "Tynemouth", "Morpeth", "Blyth",
  ],
  wales: [
    "Cardiff", "Swansea", "Newport", "Wrexham", "Bangor", "Aberystwyth", "Llandudno", "Rhyl", "Bridgend",
    "Merthyr Tydfil", "Pontypridd", "Caerphilly", "Carmarthen", "Llanelli", "Neath", "Port Talbot",
  ],
  scotland: [
    "Glasgow", "Edinburgh", "Aberdeen", "Dundee", "Inverness", "Stirling", "Perth", "Paisley", "Kilmarnock",
    "Ayr", "Falkirk", "Livingston", "Dunfermline", "Kirkcaldy", "East Kilbride", "Motherwell", "Cumbernauld", "St Andrews", "Fort William",
  ],
  "northern-ireland": ["Belfast", "Derry", "Londonderry", "Lisburn", "Newry", "Armagh", "Omagh", "Enniskillen"],
};

const TOWN_AREA = new Map<string, string>();
for (const [area, towns] of Object.entries(AREAS)) {
  for (const town of towns) TOWN_AREA.set(town.toLowerCase(), area);
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/[-\s]+/g, "[-\\s]+");
}

const ALL_TOWNS = Object.values(AREAS)
  .flat()
  .sort((a, b) => b.length - a.length);

/** As written in a deal title: "Bolton" or "BOLTON", never "bolton". */
const IN_TITLES = ALL_TOWNS.map((town) => ({
  town: town.toLowerCase(),
  re: new RegExp(`(?<![A-Za-z])(?:${escape(town)}|${escape(town.toUpperCase())})(?![A-Za-z])`),
}));

/** As a person types their own town, in any case. */
const ANY_CASE = ALL_TOWNS.map((town) => ({
  town: town.toLowerCase(),
  re: new RegExp(`(?<![a-z])${escape(town.toLowerCase())}(?![a-z])`, "i"),
}));

/** The area a town or city is in, such as "west-midlands" for Birmingham. Null when not known. */
export function areaOf(place: string): string | null {
  const clean = place.toLowerCase().replace(/,.*$/, "").trim();
  if (!clean) return null;
  const direct = TOWN_AREA.get(clean);
  if (direct) return direct;
  for (const { town, re } of ANY_CASE) if (re.test(clean)) return TOWN_AREA.get(town) ?? null;
  return null;
}

/** Towns a deal names, such as "Scarborough" in "Taylor’s Bar & Kitchen, Scarborough - £30 voucher". */
export function townsIn(text: string): string[] {
  const found: string[] = [];
  // "New York" is not York.
  let hay = ` ${text} `.replace(/New\s+York/gi, " ");
  for (const { town, re } of IN_TITLES) {
    if (re.test(hay)) {
      found.push(town);
      hay = hay.replace(re, " ");
    }
  }
  return found;
}

/**
 * True when a deal names only places in other parts of the country than the
 * person's town. False when it names no place, names somewhere nearby, or the
 * person's own town is not known, since then nothing can be judged.
 */
export function onlyFarAway(text: string, city: string): boolean {
  const home = areaOf(city);
  if (!home) return false;
  const towns = townsIn(text);
  if (towns.length === 0) return false;
  return towns.every((town) => TOWN_AREA.get(town) !== home);
}
