import { isCategory, parseAlert, poundsToPence, validDate, type CategoryId } from "./model.ts";

export type StatementRow = {
  spentOn: string;
  merchant: string;
  amountPence: number;
  category: CategoryId;
  /** The line as printed, when the merchant shown has been tidied or renamed. */
  description?: string;
};

const MONTHS: Record<string, string> = {
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  oct: "10",
  nov: "11",
  dec: "12",
};

const BANK_LABEL: { test: RegExp; category: CategoryId }[] = [
  { test: /^savings?\b|\bisa\b/, category: "savings" },
  { test: /invest/, category: "investments" },
  { test: /transfer/, category: "transfers" },
  { test: /^cash\b|withdrawal/, category: "cash" },
  { test: /charit|donation/, category: "charity" },
  { test: /\bfees?\b|\bcharges?\b/, category: "fees" },
  { test: /\bpets?\b|\bvet/, category: "pets" },
  { test: /family|\bkids\b|child/, category: "kids" },
  { test: /education|tuition|course/, category: "education" },
  { test: /^rent\b|\brent\b|mortgage|housing/, category: "housing" },
  { test: /groc|supermarket/, category: "groceries" },
  { test: /eat out|dining|restaurant|coffee|food|takeaway/, category: "dining" },
  { test: /transport|fuel|petrol/, category: "transport" },
  { test: /utilit|bill|energy|council/, category: "bills" },
  { test: /subscription|gym|digital|entertainment sub/, category: "subscriptions" },
  { test: /fashion|clothes|shopping/, category: "fashion" },
  { test: /entertain|cinema|games/, category: "entertainment" },
  { test: /health|medical|pharmacy/, category: "health" },
  { test: /household|home|diy/, category: "household" },
  { test: /holiday|travel|flight/, category: "travel" },
  { test: /personal|hair|beauty/, category: "personal" },
  { test: /gift/, category: "gifts" },
];

function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else quoted = false;
      } else cur += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      out.push(cur.trim());
      cur = "";
    } else cur += char;
  }
  out.push(cur.trim());
  return out;
}

function statementDate(raw: string): string | null {
  const value = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(value) && validDate(value.slice(0, 10))) return value.slice(0, 10);
  const slash = value.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (slash) {
    const year = slash[3].length === 2 ? `20${slash[3]}` : slash[3];
    const iso = `${year}-${slash[2].padStart(2, "0")}-${slash[1].padStart(2, "0")}`;
    if (validDate(iso)) return iso;
  }
  const named = value.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})/);
  if (named) {
    const month = MONTHS[named[2].slice(0, 3).toLowerCase()];
    if (month) {
      const iso = `${named[3]}-${month}-${named[1].padStart(2, "0")}`;
      if (validDate(iso)) return iso;
    }
  }
  return null;
}

function signedPence(raw: string): number | null {
  const value = raw.trim();
  if (!value || value === "-") return null;
  const negative = value.startsWith("-") || value.startsWith("−") || /^\(.*\)$/.test(value);
  const amount = poundsToPence(value.replace(/[()−-]/g, ""));
  if (amount == null || amount === 0) return null;
  return negative ? -amount : amount;
}

function labelCategory(label: string, merchant: string): CategoryId {
  const hay = label.toLowerCase().replace(/_/g, " ");
  if (isCategory(hay)) return hay;
  for (const rule of BANK_LABEL) {
    if (rule.test.test(hay)) return rule.category;
  }
  return parseAlert(merchant).category;
}

function findCol(headers: string[], names: string[]): number {
  return headers.findIndex((header) => names.includes(header));
}

function fromTable(lines: string[]): StatementRow[] | null {
  const headers = splitCsv(lines[0]).map((cell) => cell.toLowerCase().replace(/\s+/g, " "));
  const dateCol = findCol(headers, ["date", "transaction date", "booked date", "posted date", "datetime"]);
  const nameCol = findCol(headers, [
    "name",
    "counter party",
    "counterparty",
    "description",
    "transaction description",
    "narrative",
    "merchant",
    "merchant name",
    "payee",
  ]);
  if (dateCol < 0 || nameCol < 0) return null;
  const amountCol = findCol(headers, ["amount", "amount (gbp)", "value", "amount gbp", "gross", "net"]);
  const debitCol = findCol(headers, ["debit amount", "debit", "money out", "paid out"]);
  const typeCol = findCol(headers, ["type", "transaction type"]);
  const categoryCol = findCol(headers, ["category", "spending category"]);
  if (amountCol < 0 && debitCol < 0) return null;

  const rows: StatementRow[] = [];
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const cells = splitCsv(line);
    const spentOn = statementDate(cells[dateCol] ?? "");
    const merchant = (cells[nameCol] ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
    if (!spentOn || !merchant) continue;
    const type = (cells[typeCol] ?? "").toLowerCase();
    if (/salary|income|interest|refund|pot transfer/.test(type)) continue;
    let amountPence: number | null = null;
    if (debitCol >= 0) {
      const debit = signedPence(cells[debitCol] ?? "");
      amountPence = debit == null ? null : Math.abs(debit);
      if (!amountPence) continue;
    } else {
      const signed = signedPence(cells[amountCol] ?? "");
      if (signed == null || signed > 0) continue;
      amountPence = Math.abs(signed);
    }
    rows.push({
      spentOn,
      merchant,
      amountPence,
      category: labelCategory(cells[categoryCol] ?? "", merchant),
    });
    if (rows.length >= 200) break;
  }
  return rows;
}

function fromLines(text: string): StatementRow[] {
  const rows: StatementRow[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length < 3) continue;
    const dated = trimmed.match(/^(\d{4}-\d{2}-\d{2}|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})\b[, ]*(.*)$/);
    const spentOn = dated ? statementDate(dated[1]) : null;
    const rest = dated ? dated[2] : trimmed;
    const parsed = parseAlert(rest);
    if (!parsed.amountPence || parsed.amountPence <= 0) continue;
    rows.push({
      spentOn: spentOn ?? new Date().toISOString().slice(0, 10),
      merchant: parsed.merchant.slice(0, 80),
      amountPence: parsed.amountPence,
      category: parsed.category,
    });
    if (rows.length >= 200) break;
  }
  return rows;
}

export function parseStatement(text: string): StatementRow[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length === 0) return [];
  const table = fromTable(lines);
  if (table && table.length > 0) return table;
  return fromLines(text);
}

/**
 * Money coming in on a bank export, kept apart from spending. Pence only uses it
 * to ask whether one of them is pay. Refunds and transfers stay in the list;
 * looksLikePay picks out pay.
 */
export function parseMoneyIn(text: string): { merchant: string; amountPence: number; date: string }[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const headers = splitCsv(lines[0]).map((cell) => cell.toLowerCase().replace(/\s+/g, " "));
  const dateCol = findCol(headers, ["date", "transaction date", "booked date", "posted date", "datetime"]);
  const nameCol = findCol(headers, [
    "name",
    "counter party",
    "counterparty",
    "description",
    "transaction description",
    "narrative",
    "merchant",
    "merchant name",
    "payee",
  ]);
  if (dateCol < 0 || nameCol < 0) return [];
  const amountCol = findCol(headers, ["amount", "amount (gbp)", "value", "amount gbp", "gross", "net"]);
  const creditCol = findCol(headers, ["credit amount", "credit", "money in", "paid in"]);
  if (amountCol < 0 && creditCol < 0) return [];
  const out: { merchant: string; amountPence: number; date: string }[] = [];
  for (const line of lines.slice(1)) {
    const cells = splitCsv(line);
    const date = statementDate(cells[dateCol] ?? "");
    const merchant = (cells[nameCol] ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
    if (!date || !merchant) continue;
    let amountPence: number | null = null;
    if (creditCol >= 0) {
      const credit = signedPence(cells[creditCol] ?? "");
      amountPence = credit == null ? null : Math.abs(credit);
    } else {
      const signed = signedPence(cells[amountCol] ?? "");
      amountPence = signed != null && signed > 0 ? signed : null;
    }
    if (!amountPence) continue;
    out.push({ merchant, amountPence, date });
    if (out.length >= 50) break;
  }
  return out;
}
