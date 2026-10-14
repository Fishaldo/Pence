/* Amounts: whole pence in, pounds out. */

export function poundsToPence(raw: string): number | null {
  let t = raw
    .trim()
    .replace(/[£$€¥₦]/g, "")
    .replace(/\b(gbp|ngn|usd|eur)\b/gi, "")
    .replace(/\s/g, "");
  if (t.includes(",") && t.includes(".")) t = t.replace(/,/g, "");
  else if (/^\d{1,3}(,\d{3})+$/.test(t)) t = t.replace(/,/g, "");
  else if (/^\d+,\d{1,2}$/.test(t)) t = t.replace(",", ".");
  else t = t.replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const [whole, frac = ""] = t.split(".");
  const pence = Number(whole) * 100 + Number((frac + "00").slice(0, 2));
  if (!Number.isFinite(pence) || pence > 100_000_000) return null;
  return pence;
}

export function formatGBP(pence: number): string {
  const neg = pence < 0;
  const abs = Math.abs(Math.round(pence));
  const pounds = Math.floor(abs / 100);
  const rem = abs % 100;
  return `${neg ? "−" : ""}£${pounds.toLocaleString("en-GB")}.${String(rem).padStart(2, "0")}`;
}

export function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}
