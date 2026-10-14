import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CATEGORIES,
  categoryLabel,
  countsAsSpending,
  formatGBP,
  isCategory,
  parseAlert,
  paySpan,
  poundsToPence,
  summarizeSpan,
  validDate,
  type Tx,
} from "./model.ts";
import { samePayment } from "./duplicate.ts";

function tx(merchant: string, amountPence: number, spentOn: string, category: Tx["category"]): Tx {
  return {
    id: `${merchant}-${spentOn}-${amountPence}`,
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
    isSample: false,
    createdAt: `${spentOn}T12:00:00Z`,
  };
}

describe("categories", () => {
  it("has the agreed list, each id once", () => {
    const ids = CATEGORIES.map((c) => c.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(ids.length, 24);
    for (const id of ["groceries", "housing", "kids", "pets", "education", "charity", "fees", "cash", "sent", "savings", "investments", "transfers"]) {
      assert.ok(isCategory(id), id);
    }
  });

  it("does not count savings, investments or transfers as spending", () => {
    assert.equal(countsAsSpending("savings"), false);
    assert.equal(countsAsSpending("investments"), false);
    assert.equal(countsAsSpending("transfers"), false);
    assert.equal(countsAsSpending("groceries"), true);
    assert.equal(countsAsSpending("cash"), true);
    // Money sent to family or friends has left the account, so it counts.
    assert.equal(countsAsSpending("sent"), true);
  });

  it("labels in plain words", () => {
    assert.equal(categoryLabel("housing"), "Rent and housing");
    assert.equal(categoryLabel("personal"), "Personal care");
  });
});

describe("pay period", () => {
  it("runs from payday to the day before the next payday", () => {
    const span = paySpan(new Date(2026, 9, 13), 25);
    assert.equal(span.start, "2026-09-25");
    assert.equal(span.end, "2026-10-24");
  });

  it("starts on payday itself", () => {
    const span = paySpan(new Date(2026, 9, 25), 25);
    assert.equal(span.start, "2026-10-25");
    assert.equal(span.end, "2026-11-24");
  });

  it("uses the calendar month when there is no payday", () => {
    const span = paySpan(new Date(2026, 1, 10), null);
    assert.equal(span.start, "2026-02-01");
    assert.equal(span.end, "2026-02-28");
  });

  it("moves payday to the last day in a short month", () => {
    const span = paySpan(new Date(2026, 1, 28), 31);
    assert.equal(span.start, "2026-02-28");
    assert.equal(span.end, "2026-03-30");
  });

  it("goes back one period with an offset", () => {
    const span = paySpan(new Date(2026, 9, 13), 25, -1);
    assert.equal(span.start, "2026-08-25");
    assert.equal(span.end, "2026-09-24");
  });
});

describe("spent so far", () => {
  it("keeps money moved apart from money spent", () => {
    const span = paySpan(new Date(2026, 9, 13), 25);
    const summary = summarizeSpan(
      [
        tx("Tesco", 2450, "2026-10-01", "groceries"),
        tx("Savings pot", 10000, "2026-10-02", "savings"),
        tx("Vanguard", 5000, "2026-10-03", "investments"),
        tx("Greggs", 395, "2026-10-04", "dining"),
        tx("Tesco", 1200, "2026-09-20", "groceries"),
      ],
      span,
    );
    assert.equal(summary.spent, 2845);
    assert.equal(summary.count, 2);
    assert.equal(summary.moved, 15000);
    assert.deepEqual(
      summary.byCategory.map((c) => c.id),
      ["groceries", "dining"],
    );
  });
});

describe("money", () => {
  it("reads pounds in the ways people write them", () => {
    assert.equal(poundsToPence("£12.50"), 1250);
    assert.equal(poundsToPence("1,250"), 125000);
    assert.equal(poundsToPence("3,99"), 399);
    assert.equal(poundsToPence("abc"), null);
  });

  it("prints pounds", () => {
    assert.equal(formatGBP(123456), "£1,234.56");
    assert.equal(formatGBP(-500), "−£5.00");
  });

  it("checks real dates", () => {
    assert.equal(validDate("2026-02-29"), false);
    assert.equal(validDate("2028-02-29"), true);
  });
});

describe("pasted alerts", () => {
  it("reads a Google Pay alert", () => {
    const alert = parseAlert("You paid £4.20 at Greggs with Google Pay");
    assert.equal(alert.amountPence, 420);
    assert.equal(alert.merchant, "Greggs");
    assert.equal(alert.category, "dining");
  });

  it("files rent under housing", () => {
    assert.equal(parseAlert("£850.00 to Landlord rent").category, "housing");
  });

  it("does not take visa for an ISA", () => {
    assert.notEqual(parseAlert("£12.00 at Boots, Visa debit").category, "savings");
  });
});

describe("already saved?", () => {
  const saved = { merchant: "TESCO STORES 2041", amountPence: 2450, spentOn: "2026-10-01" };

  it("matches the same amount, shop and date", () => {
    assert.equal(samePayment(saved, { merchant: "Tesco", amountPence: 2450, spentOn: "2026-10-01" }), true);
  });

  it("does not match the same amount on a different date", () => {
    assert.equal(samePayment(saved, { merchant: "Tesco", amountPence: 2450, spentOn: "2026-10-02" }), false);
  });

  it("does not match a different shop", () => {
    assert.equal(samePayment(saved, { merchant: "Aldi", amountPence: 2450, spentOn: "2026-10-01" }), false);
  });
});

describe("said out loud", () => {
  it("turns spoken pounds into an amount Pence can read", async () => {
    const { spokenToAlert } = await import("./model.ts");
    assert.equal(spokenToAlert("about 20 pounds at ASDA groceries"), "about £20 at ASDA groceries");
    assert.equal(spokenToAlert("£4 and 20p at Greggs"), "£4.20 at Greggs");
    const alert = parseAlert(spokenToAlert("about 20 pounds at Asda groceries"));
    assert.equal(alert.amountPence, 2000);
    assert.equal(alert.category, "groceries");
  });
});
