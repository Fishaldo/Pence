const DROP =
  /\b(ltd|limited|plc|uk|gb|store|stores|extra|superstore|express|local|petrol|fs|pos|contactless|visa|mastercard|debit|credit|card|payment|gbp)\b/g;

export function shopCore(name: string): string {
  return name
    .toLowerCase()
    .replace(/['’‘`]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(DROP, " ")
    .replace(/\d+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function sameShop(a: string, b: string): boolean {
  const left = shopCore(a);
  const right = shopCore(b);
  if (!left || !right) return false;
  if (left === right || left.includes(right) || right.includes(left)) return true;
  const leftWord = left.split(" ")[0] ?? "";
  const rightWord = right.split(" ")[0] ?? "";
  return leftWord.length >= 4 && leftWord === rightWord;
}

export function samePayment(
  a: { merchant: string; amountPence: number; spentOn: string },
  b: { merchant: string; amountPence: number; spentOn: string },
): boolean {
  if (a.amountPence !== b.amountPence || a.amountPence <= 0) return false;
  if (a.spentOn.slice(0, 10) !== b.spentOn.slice(0, 10)) return false;
  return sameShop(a.merchant, b.merchant);
}
