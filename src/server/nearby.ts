import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { frequentShops } from "@/lib/core/model";
import { citedPage, parseModelObject, searchWebText, tidyCode } from "@/server/search";

const CHAINS: { id: string; test: RegExp; label: string; kinds: string[] }[] = [
  { id: "asda", test: /asda/, label: "Asda", kinds: ["groceries"] },
  { id: "tesco", test: /tesco/, label: "Tesco", kinds: ["groceries"] },
  { id: "sainsbury", test: /sainsbury/, label: "Sainsbury’s", kinds: ["groceries"] },
  { id: "morrisons", test: /morrison/, label: "Morrisons", kinds: ["groceries"] },
  { id: "aldi", test: /\baldi\b/, label: "Aldi", kinds: ["groceries"] },
  { id: "lidl", test: /lidl/, label: "Lidl", kinds: ["groceries"] },
  { id: "waitrose", test: /waitrose/, label: "Waitrose", kinds: ["groceries"] },
  { id: "iceland", test: /iceland/, label: "Iceland", kinds: ["groceries"] },
  { id: "marks", test: /marks|\bm&s\b|m and s/, label: "M&S", kinds: ["groceries", "fashion"] },
  { id: "coop", test: /co-op|\bcoop\b/, label: "Co-op", kinds: ["groceries"] },
  { id: "boots", test: /boots/, label: "Boots", kinds: ["health"] },
  { id: "superdrug", test: /superdrug/, label: "Superdrug", kinds: ["health"] },
  { id: "primark", test: /primark/, label: "Primark", kinds: ["fashion"] },
  { id: "next", test: /\bnext\b/, label: "Next", kinds: ["fashion"] },
];

export type NearbyShop = { name: string; kind: string; km: number | null };
export type NearbyOffer = { shop: string; title: string; detail: string; url: string; code: string };
export type NearbyResult = {
  hasPlace: boolean;
  usual: string[];
  nearby: NearbyShop[];
  offers: NearbyOffer[];
  note: string;
};

function asBool(value: unknown): boolean {
  return value === true || value === "t" || value === "true" || value === 1;
}

function kmBetween(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const r = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return Math.round(r * 2 * Math.asin(Math.sqrt(a)) * 10) / 10;
}

function chainOf(name: string) {
  const hay = name.toLowerCase();
  return CHAINS.find((chain) => chain.test.test(hay)) ?? null;
}

async function overpass(lat: number, lng: number): Promise<NearbyShop[]> {
  const query = `[out:json][timeout:20];(node["shop"="supermarket"](around:4000,${lat},${lng});node["shop"="chemist"](around:4000,${lat},${lng});node["shop"="clothes"](around:4000,${lat},${lng});node["shop"="department_store"](around:4000,${lat},${lng}););out body 80;`;
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) return [];
  const body = (await res.json()) as {
    elements?: { lat?: number; lon?: number; tags?: { name?: string; brand?: string } }[];
  };
  const nearest = new Map<string, NearbyShop>();
  for (const element of body.elements ?? []) {
    if (element.lat == null || element.lon == null) continue;
    const label = element.tags?.brand || element.tags?.name || "";
    const chain = chainOf(label);
    if (!chain) continue;
    const km = kmBetween(lat, lng, element.lat, element.lon);
    const prev = nearest.get(chain.id);
    if (!prev || (prev.km != null && km < prev.km)) {
      nearest.set(chain.id, { name: chain.label, kind: chain.kinds[0], km });
    }
  }
  return [...nearest.values()].sort((a, b) => (a.km ?? 99) - (b.km ?? 99));
}

export const nearbyAdvice = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const id = input && typeof input === "object" ? (input as { placeId?: unknown }).placeId : "";
    return { placeId: typeof id === "string" ? id.slice(0, 80) : "" };
  })
  .handler(async ({ context, data }): Promise<NearbyResult> => {
    const sql = await getSql();
    const profile = await sql<{ city: string; lat: number | null; lng: number | null }>`
      select city, lat, lng from profiles where user_id = ${context.userId}`;
    let city = profile[0]?.city?.trim() || "";
    let lat = profile[0]?.lat == null ? null : Number(profile[0].lat);
    let lng = profile[0]?.lng == null ? null : Number(profile[0].lng);
    if (data.placeId) {
      const place = await sql<{ town: string; lat: number | null; lng: number | null }>`
        select town, lat, lng from places where id = ${data.placeId} and user_id = ${context.userId}`;
      if (!place[0]) throw new Error("That place is no longer saved.");
      city = place[0].town?.trim() || city;
      lat = place[0].lat == null ? null : Number(place[0].lat);
      lng = place[0].lng == null ? null : Number(place[0].lng);
    }
    const hasPlace = lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng);
    const txs = await sql<{ merchant: string; amount_pence: number | string; is_sample: unknown; category: string }>`
      select merchant, amount_pence, is_sample, category from transactions where user_id = ${context.userId}`;
    const { shops } = frequentShops(
      txs.map((row) => ({
        merchant: row.merchant,
        amountPence: Number(row.amount_pence) || 0,
        isSample: asBool(row.is_sample),
      })),
    );
    const usual = shops.map((shop) => chainOf(shop.name)?.label).filter((name): name is string => Boolean(name));
    const uniqueUsual = [...new Set(usual)].slice(0, 4);
    let nearby: NearbyShop[] = [];
    if (hasPlace && lat != null && lng != null) {
      try {
        nearby = (await overpass(lat, lng)).filter((shop) => !uniqueUsual.includes(shop.name)).slice(0, 4);
      } catch {
        nearby = [];
      }
    }
    const empty: NearbyResult = {
      hasPlace,
      usual: uniqueUsual,
      nearby,
      offers: [],
      note: uniqueUsual.length === 0 ? "Log a few grocery, health, or clothes spends and Pence can compare those shops." : "",
    };
    if (uniqueUsual.length === 0) return empty;
    if (!hasPlace && city.length < 2) {
      return { ...empty, note: "Share this phone’s location, or add a town in settings, before Pence names another shop." };
    }

    const today = new Date().toISOString().slice(0, 10);
    const placeKey = hasPlace ? `${lat!.toFixed(2)},${lng!.toFixed(2)}` : city.toLowerCase();
    const fingerprint = `near2:${today}:${placeKey}:${uniqueUsual.join(".")}`.slice(0, 280);
    const cached = await sql<{ body: string }>`
      select body from advice_cache where user_id = ${context.userId} and fingerprint = ${fingerprint}`;
    if (cached[0]?.body) {
      try {
        const saved = JSON.parse(cached[0].body) as { offers?: NearbyOffer[]; note?: string; nearby?: NearbyShop[] };
        if (Array.isArray(saved.offers)) {
          return {
            hasPlace,
            usual: uniqueUsual,
            nearby: nearby.length > 0 ? nearby : saved.nearby ?? [],
            offers: saved.offers.slice(0, 4),
            note: saved.note ?? "",
          };
        }
      } catch {
        /* search again */
      }
    }

    const where = hasPlace
      ? `The person is at ${lat}, ${lng}${city ? ` (${city})` : ""}. These other chains have a branch nearby: ${nearby.map((shop) => `${shop.name} ${shop.km} km`).join(", ") || "none found on the map"}.`
      : `The person named the town ${city}. Do not claim any shop is close. You do not have their exact location.`;
    const found = await searchWebText(
      `They already shop at: ${uniqueUsual.join(", ")}.
${where}
Look up current public offers for the other chains, including in-store and online if a page distinguishes them. A bigger shop is not automatically better. Do not say one is cheaper unless the page states a price or offer.
Reply with JSON only:
{"offers":[{"shop":"","title":"","detail":"","url":"","code":""}],"note":""}
Rules:
- shop is the chain name. Prefer chains that are nearby when distances were given.
- url is the page where the person gets or uses the offer: the shop’s own page when one was opened. A deal board, Reddit, or a forum only when no shop page was opened. url must be a page opened in this search.
- code only if printed on that page, otherwise "".
- Do not invent a price, a distance, or a saving.
- At most 4 offers. detail is one sentence.
- note can mention online shopping only if a page describes it.`,
      1400,
    );
    if (!found) throw new Error("Couldn’t compare nearby shops just now.");
    let parsed: Record<string, unknown>;
    try {
      parsed = parseModelObject(found.text);
    } catch {
      throw new Error("Couldn’t compare nearby shops just now.");
    }
    const offers: NearbyOffer[] = [];
    if (Array.isArray(parsed.offers)) {
      for (const item of parsed.offers) {
        if (!item || typeof item !== "object") continue;
        const row = item as Record<string, unknown>;
        const shop = typeof row.shop === "string" ? row.shop.trim().slice(0, 40) : "";
        const title = typeof row.title === "string" ? row.title.trim().slice(0, 80) : "";
        const detail = typeof row.detail === "string" ? row.detail.trim().slice(0, 220) : "";
        const url = typeof row.url === "string" ? row.url.trim() : "";
        if (!shop || !title || !detail || !citedPage(url, found.sources)) continue;
        offers.push({ shop, title, detail, url, code: tidyCode(row.code) });
        if (offers.length >= 4) break;
      }
    }
    const note =
      typeof parsed.note === "string" && parsed.note.trim()
        ? parsed.note.trim().slice(0, 280)
        : nearby.length > 0
          ? "Closer is not the same as cheaper. A price is shown only when a page states it."
          : "No other big shop turned up on the map from this spot.";
    const result = { offers, note, nearby };
    await sql`insert into advice_cache (user_id, fingerprint, body)
              values (${context.userId}, ${fingerprint}, ${JSON.stringify(result)})
              on conflict (user_id, fingerprint) do update set body = excluded.body, created_at = now()`;
    return { hasPlace, usual: uniqueUsual, nearby, offers, note };
  });
