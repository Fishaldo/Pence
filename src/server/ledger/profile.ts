import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import type { Profile } from "@/lib/core/model";
import { asInt, mapProfile } from "./rows";

/*
 * The person's profile: name, take-home, town, payday and the rest of Settings.
 */

type ProfileInput = {
  displayName: string;
  monthlyIncomePence: number;
  city: string;
  payday: number | null;
  notifyAlerts: boolean;
};

function readProfileInput(input: unknown): ProfileInput {
  if (!input || typeof input !== "object") throw new Error("Enter your details to continue.");
  const row = input as Record<string, unknown>;
  const displayName = typeof row.displayName === "string" ? row.displayName.trim().slice(0, 80) : "";
  const city = typeof row.city === "string" ? row.city.trim().slice(0, 80) : "";
  const monthlyIncomePence = asInt(row.monthlyIncomePence);
  let payday: number | null = null;
  if (row.payday != null && row.payday !== "") {
    payday = asInt(row.payday);
    if (payday < 1 || payday > 31) throw new Error("Payday should be a day of the month.");
  }
  if (!displayName) throw new Error("Add your name.");
  if (monthlyIncomePence <= 0) throw new Error("Add your monthly take-home pay.");
  return {
    displayName,
    monthlyIncomePence,
    city,
    payday,
    notifyAlerts: row.notifyAlerts === true,
  };
}

export const getProfile = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<Profile | null> => {
    const sql = await getSql();
    const rows = await sql<{
      display_name: string;
      monthly_income_pence: number;
      city: string;
      payday: number | null;
      onboarded: unknown;
      notify_alerts: unknown;
      lat: number | null;
      lng: number | null;
      location_asked: unknown;
      weekly_day: number | null;
    }>`select display_name, monthly_income_pence, city, payday, onboarded, notify_alerts, lat, lng,
              location_asked, weekly_day
       from profiles where user_id = ${context.userId}`;
    return rows[0] ? mapProfile(rows[0]) : null;
  });

export const saveProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => readProfileInput(input))
  .handler(async ({ context, data }): Promise<Profile> => {
    const sql = await getSql();
    const rows = await sql<{
      display_name: string;
      monthly_income_pence: number;
      city: string;
      payday: number | null;
      onboarded: unknown;
      notify_alerts: unknown;
    }>`insert into profiles (
         user_id, display_name, monthly_income_pence, city, payday, onboarded, notify_alerts
       ) values (
         ${context.userId}, ${data.displayName}, ${data.monthlyIncomePence}, ${data.city},
         ${data.payday}, true, ${data.notifyAlerts}
       )
       on conflict (user_id) do update set
         display_name = excluded.display_name,
         monthly_income_pence = excluded.monthly_income_pence,
         city = excluded.city,
         payday = excluded.payday,
         onboarded = true,
         notify_alerts = excluded.notify_alerts
       returning display_name, monthly_income_pence, city, payday, onboarded, notify_alerts, lat, lng,
                 location_asked, weekly_day`;
    return mapProfile(rows[0]);
  });
