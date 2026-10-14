import { londonToday } from "./dates.ts";
import { isCategory, parseAlert, poundsToPence, validDate, type CategoryId } from "./model.ts";

/*
 * Reading a bank or card export. UK banks all export differently:
 *
 *   Monzo        Name, Category, Amount (minus is money out), Money Out, Money In
 *   Starling     Counter Party, Type, Amount (GBP), Spending Category
 *   Barclays     Date, Amount, Subcategory, Memo
 *   Lloyds       Transaction Description, Debit Amount, Credit Amount
 *   Nationwide   a few account lines first, then Description, Paid out, Paid in, with £ signs
 *   HSBC         no header at all: date, description, amount
 *   Credit cards purchases are plus and repayments minus, the other way round
 *
 * So the reader finds the header wherever it is (or works without one),
 * reads amounts written as -12.00, (12.00), 12.00-, 12.00 DR or £12.00,
 * reads quoted cells that run over several lines, works out which way round
 * the signs are, and says how many lines it could not read rather than
 * dropping them without a word.
 */

export type StatementRow = {
  spentOn: string;
  merchant: string;
  amountPence: number;
  category: CategoryId;
  /** The line as printed, when the merchant shown has been tidied or renamed. */
  description?: string;
};

export type MoneyInRow = { merchant: string; amountPence: number; date: string };

/** Which way round the amounts are: a bank (minus is money out), a card (plus is money out), or two columns. */
export type SignConvention = "minus-out" | "plus-out" | "columns";

export type StatementRead = {
  /** Money out, the spends. */
  rows: StatementRow[];
  /** Money in, kept apart: only used to ask whether one of them is pay. */
  moneyIn: MoneyInRow[];
  /** Lines with something on them that could not be read as a payment. */
  skipped: number;
  signs: SignConvention;
  /** True when the file had more payments than one import takes. */
  truncated: boolean;
};

const MAX_ROWS = 1000;

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
  { test: /eat out|eating out|dining|restaurant|coffee|food|takeaway/, category: "dining" },
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

const DATE_HEADERS = ["date", "transaction date", "booked date", "posted date", "datetime", "posting date", "value date"];
/** Cleaner names first: Monzo's Name beats its Description. */
const NAME_HEADERS = ["name", "counter party", "counterparty", "merchant", "merchant name", "payee"];
const TEXT_HEADERS = ["description", "transaction description", "narrative", "memo", "details", "reference", "transaction details"];
const AMOUNT_HEADERS = ["amount", "amount (gbp)", "amount gbp", "value", "gross", "net", "amount(gbp)"];
const OUT_HEADERS = ["debit amount", "debit", "money out", "paid out", "out", "withdrawals"];
const IN_HEADERS = ["credit amount", "credit", "money in", "paid in", "in", "deposits"];
const TYPE_HEADERS = ["type", "transaction type", "subcategory"];
const LABEL_HEADERS = ["category", "spending category"];

/* ------------------------------------------------------------------ */
/* Cells                                                               */
/* ------------------------------------------------------------------ */

function delimiterOf(text: string): string {
  const firstLines = text.split(/\r?\n/).filter((line) => line.trim()).slice(0, 12).join("\n");
  const count = (char: string) => firstLines.split(char).length - 1;
  const candidates = [",", ";", "\t"].map((char) => ({ char, n: count(char) }));
  candidates.sort((a, b) => b.n - a.n);
  return candidates[0].n > 0 ? candidates[0].char : ",";
}

/** Rows of cells, honouring quotes, including quoted cells that span lines. */
export function readCsv(text: string, delimiter = delimiterOf(text)): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += char;
    } else if (char === '"' && cell.trim() === "") {
      quoted = true;
      cell = "";
    } else if (char === delimiter) {
      row.push(cell.trim());
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell.trim());
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  row.push(cell.trim());
  if (row.some((value) => value !== "")) rows.push(row);
  return rows;
}

function clean(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/* ------------------------------------------------------------------ */
/* Dates and amounts                                                   */
/* ------------------------------------------------------------------ */

function isoIfValid(year: string, month: string, day: string): string | null {
  const full = year.length === 2 ? `20${year}` : year;
  const iso = `${full}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  return validDate(iso) ? iso : null;
}

/** 25/09/2026, 25-09-26, 2026-09-25, 25 Sep 2026, 25-Sep-2026. Day first, as UK banks write it. */
export function statementDate(raw: string): string | null {
  const value = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(value) && validDate(value.slice(0, 10))) return value.slice(0, 10);
  const numeric = value.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/);
  if (numeric) {
    // Day first; only when that cannot be a date, month first (an American export).
    return isoIfValid(numeric[3], numeric[2], numeric[1]) ?? isoIfValid(numeric[3], numeric[1], numeric[2]);
  }
  const named = value.match(/^(\d{1,2})[\s-]+([A-Za-z]{3,9})[\s-]+(\d{2,4})\b/);
  if (named) {
    const month = MONTHS[named[2].slice(0, 3).toLowerCase()];
    if (month) return isoIfValid(named[3], month, named[1]);
  }
  return null;
}

/**
 * An amount as signed pence: minus for money out on a bank statement.
 * Reads -12.00, −12.00, (12.00), 12.00-, 12.00 DR, 12.00 CR, £1,234.56 and
 * GBP 12.00. Empty or unreadable cells give null.
 */
export function readAmount(raw: string): number | null {
  let value = raw.trim().replace(/−/g, "-");
  if (!value || value === "-") return null;
  let sign = 1;
  if (/\b(dr|debit)\.?$/i.test(value)) {
    sign = -1;
    value = value.replace(/\b(dr|debit)\.?$/i, "");
  } else if (/\b(cr|credit)\.?$/i.test(value)) {
    value = value.replace(/\b(cr|credit)\.?$/i, "");
  }
  value = value.replace(/gbp|£/gi, "").trim();
  if (/^\(.*\)$/.test(value)) {
    sign *= -1;
    value = value.slice(1, -1).trim();
  }
  if (value.startsWith("-")) {
    sign *= -1;
    value = value.slice(1).trim();
  } else if (value.endsWith("-")) {
    sign *= -1;
    value = value.slice(0, -1).trim();
  } else if (value.startsWith("+")) value = value.slice(1).trim();
  // Commas only as thousands (1,234.56). "24,50" is a European decimal: unread, never £2,450.
  if (!/^(\d{1,3}(,\d{3})+|\d+)(\.\d{1,2})?$/.test(value)) return null;
  const pence = poundsToPence(value);
  if (pence == null || pence === 0) return null;
  return sign * pence;
}

/* ------------------------------------------------------------------ */
/* Categories                                                          */
/* ------------------------------------------------------------------ */

function labelCategory(label: string, text: string): CategoryId {
  const hay = label.toLowerCase().replace(/_/g, " ").trim();
  if (hay && isCategory(hay)) return hay;
  if (hay) {
    for (const rule of BANK_LABEL) if (rule.test.test(hay)) return rule.category;
  }
  return parseAlert(text).category;
}

/** Bank types that are money in, or money moved inside the person's own bank: not spending. */
const NOT_SPENT_TYPE = /salary|income|interest|refund|pot transfer|\bbgc\b|^cr$/i;

/* ------------------------------------------------------------------ */
/* The table                                                           */
/* ------------------------------------------------------------------ */

type Columns = {
  date: number;
  name: number;
  text: number;
  amount: number;
  out: number;
  in: number;
  type: number;
  label: number;
};

function columnsOf(header: string[]): Columns | null {
  const names = header.map((cell) => cell.toLowerCase().replace(/[:*]/g, "").replace(/\s+/g, " ").trim());
  const find = (options: string[]) => names.findIndex((name) => options.includes(name));
  const date = find(DATE_HEADERS);
  const name = find(NAME_HEADERS);
  const text = find(TEXT_HEADERS);
  const amount = find(AMOUNT_HEADERS);
  const out = find(OUT_HEADERS);
  const inCol = find(IN_HEADERS);
  if (date < 0 || (name < 0 && text < 0) || (amount < 0 && out < 0)) return null;
  return { date, name, text, amount, out, in: inCol, type: find(TYPE_HEADERS), label: find(LABEL_HEADERS) };
}

/** No header: the first column that reads as a date, the longest text, then the first amount after it. */
function guessColumns(rows: string[][]): Columns | null {
  const sample = rows.slice(0, 20);
  if (sample.length === 0) return null;
  const width = Math.max(...sample.map((row) => row.length));
  const share = (test: (cell: string) => boolean, col: number) =>
    sample.filter((row) => row[col] !== undefined && test(row[col])).length / sample.length;
  let date = -1;
  for (let col = 0; col < width && date < 0; col++) if (share((cell) => statementDate(cell) !== null, col) >= 0.8) date = col;
  if (date < 0) return null;
  let text = -1;
  let longest = 0;
  for (let col = 0; col < width; col++) {
    if (col === date || share((cell) => readAmount(cell) !== null, col) > 0.5) continue;
    const length = sample.reduce((sum, row) => sum + (row[col]?.length ?? 0), 0);
    if (length > longest) [text, longest] = [col, length];
  }
  let amount = -1;
  for (let col = Math.max(text, date) + 1; col < width && amount < 0; col++) {
    if (share((cell) => readAmount(cell) !== null, col) >= 0.8) amount = col;
  }
  if (text < 0 || amount < 0) return null;
  return { date, name: -1, text, amount, out: -1, in: -1, type: -1, label: -1 };
}

/** Bank or card: on a card most lines are purchases written as plus, with a minus repayment now and then. */
function signsOf(rows: string[][], cols: Columns, header: string[]): SignConvention {
  if (cols.out >= 0) return "columns";
  let plus = 0;
  let minus = 0;
  let repaymentMinus = 0;
  for (const row of rows) {
    const amount = readAmount(row[cols.amount] ?? "");
    if (amount == null) continue;
    if (amount > 0) plus += 1;
    else {
      minus += 1;
      const words = `${row[cols.name] ?? ""} ${row[cols.text] ?? ""}`.toLowerCase();
      if (/payment received|thank you|repayment|direct debit payment|payment - thank/.test(words)) repaymentMinus += 1;
    }
  }
  const cardWords = header.some((cell) => /card member|cardmember|card number|extended details/i.test(cell));
  if (cardWords || repaymentMinus > 0 || plus > minus * 3) return "plus-out";
  return "minus-out";
}

function fromTable(rows: string[][], forced?: SignConvention): StatementRead | null {
  // The header may sit below a few lines about the account (Nationwide).
  let headerAt = -1;
  let cols: Columns | null = null;
  for (let i = 0; i < Math.min(rows.length, 12) && !cols; i++) {
    cols = columnsOf(rows[i]);
    if (cols) headerAt = i;
  }
  const header = headerAt >= 0 ? rows[headerAt] : [];
  const body = headerAt >= 0 ? rows.slice(headerAt + 1) : rows;
  if (!cols) cols = guessColumns(rows);
  if (!cols) return null;

  const signs = forced && !(forced === "columns" && cols.out < 0) ? forced : signsOf(body, cols, header);
  const out: StatementRow[] = [];
  const moneyIn: MoneyInRow[] = [];
  let skipped = 0;
  let truncated = false;
  for (const row of body) {
    const spentOn = statementDate(row[cols.date] ?? "");
    const name = clean(row[cols.name] ?? "");
    const text = clean(row[cols.text] ?? "");
    const merchant = (name || text).slice(0, 80);
    if (!spentOn || !merchant) {
      skipped += 1;
      continue;
    }
    let outPence: number | null = null;
    let inPence: number | null = null;
    if (signs === "columns") {
      const debit = readAmount(row[cols.out] ?? "");
      const credit = cols.in >= 0 ? readAmount(row[cols.in] ?? "") : null;
      if (debit) outPence = Math.abs(debit);
      else if (credit) inPence = Math.abs(credit);
      else if (cols.amount >= 0) {
        const signed = readAmount(row[cols.amount] ?? "");
        if (signed != null && signed < 0) outPence = -signed;
        else if (signed != null) inPence = signed;
      }
    } else {
      const signed = readAmount(row[cols.amount] ?? "");
      if (signed != null) {
        const isOut = signs === "minus-out" ? signed < 0 : signed > 0;
        if (isOut) outPence = Math.abs(signed);
        else inPence = Math.abs(signed);
      }
    }
    if (outPence == null && inPence == null) {
      skipped += 1;
      continue;
    }
    const type = clean(row[cols.type] ?? "");
    if (inPence != null) {
      if (moneyIn.length < 50) moneyIn.push({ merchant, amountPence: inPence, date: spentOn });
      continue;
    }
    if (NOT_SPENT_TYPE.test(type)) continue;
    if (out.length >= MAX_ROWS) {
      truncated = true;
      continue;
    }
    const printed = text && text !== merchant ? text.slice(0, 120) : undefined;
    out.push({
      spentOn,
      merchant,
      amountPence: outPence as number,
      // The bank's type ("FASTER PAYMENT", "DD") helps tell a person from a shop.
      category: labelCategory(row[cols.label] ?? "", `${type} ${merchant} ${text}`),
      ...(printed ? { description: printed } : {}),
    });
  }
  return { rows: out, moneyIn, skipped, signs, truncated };
}

/** Pasted lines rather than a file: "25/09/2026 Tesco £42.16", one spend a line. */
function fromLines(text: string, today: string): StatementRead {
  const rows: StatementRow[] = [];
  let skipped = 0;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length < 3) continue;
    const dated = trimmed.match(/^(\d{4}-\d{2}-\d{2}|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{1,2}[\s-]+[A-Za-z]{3,9}[\s-]+\d{2,4})\b[, ]*(.*)$/);
    const spentOn = dated ? statementDate(dated[1]) : null;
    const rest = dated ? dated[2] : trimmed;
    const parsed = parseAlert(rest);
    if (!parsed.amountPence || parsed.amountPence <= 0) {
      skipped += 1;
      continue;
    }
    rows.push({
      spentOn: spentOn ?? today,
      merchant: parsed.merchant.slice(0, 80),
      amountPence: parsed.amountPence,
      category: parsed.category,
    });
    if (rows.length >= MAX_ROWS) break;
  }
  return { rows, moneyIn: [], skipped, signs: "minus-out", truncated: false };
}

/**
 * Reads a bank or card export, or pasted lines. `signs` overrides which way
 * round the amounts are, when the person says "this is a credit card".
 */
export function readStatement(text: string, options: { signs?: SignConvention; today?: string } = {}): StatementRead {
  const body = text.replace(/^\uFEFF/, "");
  const today = options.today ?? londonToday();
  if (!body.trim()) return { rows: [], moneyIn: [], skipped: 0, signs: "minus-out", truncated: false };
  const table = fromTable(readCsv(body), options.signs);
  if (table && (table.rows.length > 0 || table.moneyIn.length > 0 || table.skipped > 0)) return table;
  return fromLines(body, today);
}

/** Money out from a bank export or pasted lines. */
export function parseStatement(text: string): StatementRow[] {
  return readStatement(text).rows;
}

/**
 * Money coming in on a bank export, kept apart from spending. Briv only uses it
 * to ask whether one of them is pay. Refunds and transfers stay in the list;
 * looksLikePay picks out pay.
 */
export function parseMoneyIn(text: string): MoneyInRow[] {
  return readStatement(text).moneyIn;
}
