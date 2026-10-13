import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { billsBeforePayday, looksLikePay, lineProgress, safeToSpend, spentBetween, suggestBudget, weekOf } from "./payday.ts";
import { findRegulars, type RegularSpend } from "./regular.ts";
import { paySpan, type Tx } from "./model.ts";
import { shopChoices } from "./habits.ts";

const spend = (merchant: string, amountPence: number, spentOn: string, category: RegularSpend["category"]): RegularSpend => ({
  merchant,
  amountPence,
  spentOn,
  category,
});

function tx(merchant: string, amountPence: number, spentOn: string, category: Tx["category"], isSample = false): Tx {
  return {
    id: `${merchant}-${spentOn}`,
    merchant,
    description: merchant,
    amountPence,
    category,
    spentOn,
    source: "manual",
    hasReceipt: false,
    note: "",
    items: [],
    rawAlert: "",
    isSample,
    createdAt: `${spentOn}T12:00:00Z`,
  };
}

describe("safe to spend until payday", () => {
  // Payday on the 25th; today is Tuesday 13 October 2026, so this pay ends on 24 October.
  const today = "2026-10-13";
  const end = "2026-10-24";
  const regulars = findRegulars(
    [
      spend("Vodafone", 2000, "2026-08-18", "bills"),
      spend("Vodafone", 2000, "2026-09-18", "bills"),
      spend("Netflix", 1099, "2026-09-02", "subscriptions"),
      spend("Netflix", 1099, "2026-10-02", "subscriptions"),
      spend("Council tax", 15000, "2026-08-01", "bills"),
      spend("Council tax", 15000, "2026-09-01", "bills"),
      spend("Council tax", 15000, "2026-10-01", "bills"),
    ],
    [],
    today,
  );

  it("counts only the bills still to come before payday", () => {
    const bills = billsBeforePayday(regulars, today, end);
    assert.deepEqual(
      bills.map((bill) => [bill.name, bill.due]),
      [["Vodafone", "2026-10-18"]],
    );
  });

  it("takes spends and bills to come off the take-home", () => {
    const bills = billsBeforePayday(regulars, today, end);
    const safe = safeToSpend({ takeHomePence: 240000, spentPence: 150000, bills, today, end });
    assert.equal(safe.billsPence, 2000);
    assert.equal(safe.safePence, 88000);
    assert.equal(safe.daysLeft, 12);
    assert.equal(safe.perDayPence, 7333);
  });

  it("shows nothing a day once it is all gone", () => {
    const safe = safeToSpend({ takeHomePence: 100000, spentPence: 120000, bills: [], today, end });
    assert.equal(safe.safePence, -20000);
    assert.equal(safe.perDayPence, 0);
  });

  it("counts a weekly payment each time it comes out", () => {
    const weekly = findRegulars(
      [spend("Gym", 1000, "2026-09-29", "subscriptions"), spend("Gym", 1000, "2026-10-06", "subscriptions")],
      [],
      today,
    );
    assert.deepEqual(
      billsBeforePayday(weekly, today, end).map((bill) => bill.due),
      ["2026-10-13", "2026-10-20"],
    );
  });
});

describe("pay coming in", () => {
  it("finds pay by its name or its size, not refunds", () => {
    const found = looksLikePay(
      [
        { merchant: "ACME LTD SALARY", amountPence: 241200, date: "2026-09-25" },
        { merchant: "Amazon refund", amountPence: 250000, date: "2026-09-26" },
        { merchant: "J Smith", amountPence: 2000, date: "2026-09-27" },
        { merchant: "NORTHERN TRUST", amountPence: 230000, date: "2026-09-25" },
      ],
      240000,
    );
    assert.deepEqual(
      found.map((row) => row.merchant),
      ["ACME LTD SALARY", "NORTHERN TRUST"],
    );
  });
});

describe("the week", () => {
  it("runs Monday to Sunday", () => {
    assert.deepEqual(weekOf("2026-10-13"), { start: "2026-10-12", end: "2026-10-18" });
    assert.deepEqual(weekOf("2026-10-18"), { start: "2026-10-12", end: "2026-10-18" });
  });

  it("leaves savings out of what was spent", () => {
    const total = spentBetween(
      [tx("Tesco", 2450, "2026-10-12", "groceries"), tx("Pot", 5000, "2026-10-12", "savings"), tx("Greggs", 400, "2026-10-11", "dining")],
      "2026-10-12",
      "2026-10-18",
    );
    assert.equal(total.spentPence, 2450);
    assert.equal(total.count, 1);
  });
});

describe("a budget from your own pays", () => {
  const today = new Date(2026, 9, 13);
  const spans = [paySpan(today, 25, -1), paySpan(today, 25, -2)];
  const txs = [
    // The last two pays ran 25 Aug to 24 Sep, and 25 Jul to 24 Aug.
    tx("Tesco", 21000, "2026-09-10", "groceries"),
    tx("Tesco", 19000, "2026-08-10", "groceries"),
    tx("Boots", 1200, "2026-09-05", "health"),
    tx("Rent", 85000, "2026-09-01", "housing"),
    tx("Rent", 85000, "2026-08-01", "housing"),
    tx("Greggs", 300, "2026-09-12", "dining"),
    tx("Sample", 99900, "2026-09-12", "travel", true),
    // This pay is not finished, so it is not in the average.
    tx("Tesco", 50000, "2026-10-01", "groceries"),
  ];

  it("averages each category over the last pays, rounded up to £5", () => {
    const lines = suggestBudget(txs, spans);
    const byCategory = Object.fromEntries(lines.map((line) => [line.category, line.amountPence]));
    assert.equal(byCategory.groceries, 20000);
    assert.equal(byCategory.housing, 85000);
    assert.equal(byCategory.health, 1000);
    assert.equal(byCategory.dining, undefined);
    assert.equal(byCategory.travel, undefined);
  });

  it("does not average over pays with nothing logged", () => {
    const lines = suggestBudget([tx("Tesco", 21000, "2026-09-10", "groceries")], [paySpan(today, 25, -1), paySpan(today, 25, -2), paySpan(today, 25, -3)]);
    assert.equal(lines[0].amountPence, 21000);
  });

  it("never suggests cutting rent or health", () => {
    const lines = suggestBudget(txs, spans);
    assert.equal(lines.find((line) => line.category === "housing")?.neverCut, true);
    assert.equal(lines.find((line) => line.category === "health")?.neverCut, true);
    assert.equal(lines.find((line) => line.category === "groceries")?.neverCut, false);
  });

  it("tracks a line through this pay", () => {
    const span = paySpan(today, 25, 0);
    const progress = lineProgress(
      { id: "c:groceries", name: "", category: "groceries", amountPence: 20000, neverCut: false },
      [tx("Tesco", 12000, "2026-10-01", "groceries"), tx("Aldi", 9000, "2026-10-10", "groceries")],
      span,
    );
    assert.deepEqual(progress, { spentPence: 21000, leftPence: -1000, over: true });
  });
});

describe("one-tap questions", () => {
  it("asks about a shop that sells several kinds of thing", () => {
    const choices = shopChoices("BOOTS 1234 BIRMINGHAM");
    assert.ok(choices.length >= 2, JSON.stringify(choices));
    assert.ok(choices.some((c) => c.id === "pharmacy"));
  });

  it("does not ask about a shop that sells one kind of thing", () => {
    assert.deepEqual(shopChoices("Greggs"), []);
    assert.deepEqual(shopChoices("A shop Pence has never heard of"), []);
  });
});

describe("kinds of bill", () => {
  it("knows a phone, energy and broadband bill by name", async () => {
    const { billKind } = await import("./payday.ts");
    assert.equal(billKind("VODAFONE LTD").id, "mobile");
    assert.equal(billKind("Octopus Energy").id, "energy");
    assert.equal(billKind("Virgin Media").id, "broadband");
    assert.equal(billKind("Sky Broadband").id, "broadband");
  });

  it("does not offer a switch for council tax or water", async () => {
    const { billKind } = await import("./payday.ts");
    assert.equal(billKind("Birmingham City Council Tax").switchable, false);
    assert.equal(billKind("Severn Trent Water").switchable, false);
  });
});

describe("pay on a bank export", () => {
  it("reads money in from a CSV and picks out the pay", async () => {
    const { parseMoneyIn } = await import("./statement.ts");
    const csv = [
      "Date,Name,Amount,Category",
      "25/09/2026,ACME LTD SALARY,2412.00,Income",
      "26/09/2026,Tesco,-24.50,Groceries",
      "27/09/2026,Amazon refund,12.99,Shopping",
    ].join("\n");
    const rows = parseMoneyIn(csv);
    assert.equal(rows.length, 2);
    assert.deepEqual(looksLikePay(rows, 240000), [{ merchant: "ACME LTD SALARY", amountPence: 241200, date: "2026-09-25" }]);
  });
});
