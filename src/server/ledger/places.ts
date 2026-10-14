import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { asBool } from "./rows";

/*
 * Places: the phone's own location (kept as a town) and extra towns typed by hand.
 */

export const savePlace = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("No location.");
    const row = input as Record<string, unknown>;
    const lat = typeof row.lat === "number" ? row.lat : Number(row.lat);
    const lng = typeof row.lng === "number" ? row.lng : Number(row.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      throw new Error("That location doesn’t look right.");
    }
    return { lat, lng };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const rows = await sql<{ lat: number }>`
      update profiles set lat = ${data.lat}, lng = ${data.lng}
      where user_id = ${context.userId}
      returning lat`;
    if (!rows[0]) throw new Error("Finish setup before sharing a location.");
    return { ok: true as const };
  });

export type Place = {
  id: string;
  label: string;
  town: string;
  lat: number | null;
  lng: number | null;
  isPhone: boolean;
};

function mapPlace(row: {
  id: string;
  label: string;
  town: string;
  lat: number | null;
  lng: number | null;
  is_phone: unknown;
}): Place {
  const lat = row.lat == null ? null : Number(row.lat);
  const lng = row.lng == null ? null : Number(row.lng);
  return {
    id: row.id,
    label: row.label,
    town: row.town ?? "",
    lat: lat != null && Number.isFinite(lat) ? lat : null,
    lng: lng != null && Number.isFinite(lng) ? lng : null,
    isPhone: asBool(row.is_phone),
  };
}

async function locate(query: string): Promise<{ lat: number; lng: number } | null> {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`,
    {
      headers: { Accept: "application/json", "User-Agent": "Pence/1.0 (personal spending)" },
      signal: AbortSignal.timeout(12_000),
    },
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as { lat?: string; lon?: string }[];
  const lat = Number(rows[0]?.lat);
  const lng = Number(rows[0]?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

async function townAt(lat: number, lng: number): Promise<string> {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`,
    {
      headers: { Accept: "application/json", "User-Agent": "Pence/1.0 (personal spending)" },
      signal: AbortSignal.timeout(12_000),
    },
  );
  if (!res.ok) return "";
  const body = (await res.json()) as {
    address?: { city?: string; town?: string; village?: string; county?: string };
  };
  const address = body.address;
  return (address?.city || address?.town || address?.village || address?.county || "").slice(0, 80);
}

export const listPlaces = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<Place[]> => {
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      label: string;
      town: string;
      lat: number | null;
      lng: number | null;
      is_phone: unknown;
    }>`select id, label, town, lat, lng, is_phone from places
       where user_id = ${context.userId}
       order by is_phone desc, created_at`;
    return rows.map(mapPlace);
  });

export const savePhonePlace = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("No location.");
    const row = input as Record<string, unknown>;
    const lat = typeof row.lat === "number" ? row.lat : Number(row.lat);
    const lng = typeof row.lng === "number" ? row.lng : Number(row.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      throw new Error("That location doesn’t look right.");
    }
    return { lat, lng };
  })
  .handler(async ({ context, data }): Promise<Place> => {
    const sql = await getSql();
    const town = await townAt(data.lat, data.lng).catch(() => "");
    await sql`delete from places where user_id = ${context.userId} and is_phone = true`;
    await sql`update profiles set lat = ${data.lat}, lng = ${data.lng} where user_id = ${context.userId}`;
    const id = crypto.randomUUID();
    const rows = await sql<{
      id: string;
      label: string;
      town: string;
      lat: number | null;
      lng: number | null;
      is_phone: unknown;
    }>`insert into places (id, user_id, label, town, lat, lng, is_phone)
       values (${id}, ${context.userId}, 'This phone', ${town}, ${data.lat}, ${data.lng}, true)
       returning id, label, town, lat, lng, is_phone`;
    return mapPlace(rows[0]);
  });

export const addPlace = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("Add a place.");
    const row = input as Record<string, unknown>;
    const label = typeof row.label === "string" ? row.label.trim().slice(0, 40) : "";
    const town = typeof row.town === "string" ? row.town.trim().slice(0, 80) : "";
    if (!label) throw new Error("Name the place, such as Partner.");
    if (town.length < 2) throw new Error("Add the town or city, such as Essex.");
    return { label, town };
  })
  .handler(async ({ context, data }): Promise<Place> => {
    const sql = await getSql();
    const count = await sql<{ n: number | string }>`select count(*)::int as n from places where user_id = ${context.userId} and is_phone = false`;
    if (Number(count[0]?.n ?? 0) >= 6) throw new Error("Six other places is the limit. Remove one first.");
    const found = await locate(`${data.town}, United Kingdom`).catch(() => null);
    const id = crypto.randomUUID();
    const rows = await sql<{
      id: string;
      label: string;
      town: string;
      lat: number | null;
      lng: number | null;
      is_phone: unknown;
    }>`insert into places (id, user_id, label, town, lat, lng, is_phone)
       values (${id}, ${context.userId}, ${data.label}, ${data.town}, ${found?.lat ?? null}, ${found?.lng ?? null}, false)
       returning id, label, town, lat, lng, is_phone`;
    return mapPlace(rows[0]);
  });

export const removePlace = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const id = input && typeof input === "object" ? (input as { id?: unknown }).id : null;
    if (typeof id !== "string" || !id) throw new Error("Missing place.");
    return { id };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const rows = await sql<{ is_phone: unknown }>`
      delete from places where id = ${data.id} and user_id = ${context.userId} returning is_phone`;
    if (rows[0] && asBool(rows[0].is_phone)) {
      await sql`update profiles set lat = null, lng = null where user_id = ${context.userId}`;
    }
    return { ok: true as const };
  });
