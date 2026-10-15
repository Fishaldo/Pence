/*
 * How a deal looks before its picture loads, or when a shop gives none: a
 * coloured tile with the shop's first letter. The colour comes from the shop's
 * name, so Tesco is always the same colour and two shops side by side usually
 * differ. Every colour keeps white text readable (WCAG AA, 4.5 to 1).
 */

export const TILE_COLOURS = ["#1E5B43", "#2B5A8C", "#8A3B12", "#6A2C70", "#0F6B6B", "#9B2335", "#4B5320", "#3D3B8E", "#7A4A00", "#24527A"] as const;

export type ShopLook = { initial: string; colour: string };

function nameKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** The tile for a shop: its first letter or digit, and a colour that stays the same for that shop. */
export function shopLook(name: string): ShopLook {
  const key = nameKey(name);
  const initial = (key.match(/[a-z0-9]/)?.[0] ?? "·").toUpperCase();
  let h = 0;
  for (let i = 0; i < key.length; i += 1) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return { initial, colour: TILE_COLOURS[h % TILE_COLOURS.length] };
}

/** A shop's web address from a link, without "www.", or "" when there is none. */
export function shopHostOf(url: string | undefined | null): string {
  if (!url) return "";
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host : "";
  } catch {
    return "";
  }
}
