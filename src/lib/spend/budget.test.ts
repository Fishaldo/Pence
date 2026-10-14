import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fitBudget, lineProgress, planBudget, savingsGoal, suggestBudget, type BudgetLine } from "./budget.ts";
import { paySpan, type CategoryId, type Tx } from "./model.ts";

function tx(merchant: string, amountPence: number, spentOn: string, category: Tx["category"], isSample = false): Tx {
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
    isSample,
    createdAt: `${spentOn}T12:00:00Z`,
  };
}

const want = (category: CategoryId, usualPence: number, neverCut = ["housing", "bills", "health", "kids", "education"].includes(category)) => ({
  id: `c:${category}`,
  name: "",
  category,
  usualPence,
  neverCut,
});

const amount = (plan: ReturnType<typeof planBudget>, category: CategoryId) => plan.lines.find((line) => line.category === category)?.amountPence ?? 0;

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

  it("averages each category over the last pays, rounded up to £5, when there is no take-home to fit", () => {
    const { lines } = suggestBudget(txs, spans);
    const byCategory = Object.fromEntries(lines.map((line) => [line.category, line.amountPence]));
    assert.equal(byCategory.groceries, 20000);
    assert.equal(byCategory.housing, 85000);
    assert.equal(byCategory.health, 1000);
    assert.equal(byCategory.dining, undefined);
    assert.equal(byCategory.travel, undefined);
  });

  it("does not average over pays with nothing logged", () => {
    const { lines } = suggestBudget([tx("Tesco", 21000, "2026-09-10", "groceries")], [paySpan(today, 25, -1), paySpan(today, 25, -2), paySpan(today, 25, -3)]);
    assert.equal(lines[0].amountPence, 21000);
  });

  it("never suggests cutting rent or health", () => {
    const { lines } = suggestBudget(txs, spans, 240000);
    assert.equal(lines.find((line) => line.category === "housing")?.neverCut, true);
    assert.equal(lines.find((line) => line.category === "health")?.neverCut, true);
    assert.equal(lines.find((line) => line.category === "groceries")?.neverCut, false);
  });

  it("puts savings first, at least 10% of take-home for someone not saving yet", () => {
    const plan = suggestBudget(txs, spans, 240000);
    assert.equal(plan.lines[0].category, "savings");
    assert.equal(plan.savingsPence, 24000);
    assert.equal(plan.usualSavingsPence, 0);
    assert.ok(plan.plannedPence <= 240000);
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

describe("saving more than usual", () => {
  it("aims above what the person usually saves, up to a fifth of take-home", () => {
    assert.equal(savingsGoal(200000, 0), 20000);
    assert.equal(savingsGoal(200000, 10000), 20000);
    assert.equal(savingsGoal(200000, 20000), 30000);
    assert.equal(savingsGoal(200000, 36000), 40000);
    // Someone already saving a quarter keeps that level.
    assert.equal(savingsGoal(200000, 50000), 50000);
  });

  it("saves the goal and keeps the rest spare when spending already fits", () => {
    const plan = planBudget({
      wanted: [want("housing", 80000), want("groceries", 40000), want("dining", 20000)],
      takeHomePence: 200000,
      usualSavingsPence: 10000,
    });
    assert.equal(plan.savingsPence, 20000);
    assert.ok(plan.savingsPence > plan.usualSavingsPence);
    assert.equal(amount(plan, "groceries"), 40000);
    assert.equal(plan.trimmed.length, 0);
    assert.equal(plan.sparePence, 200000 - 80000 - 40000 - 20000 - 20000);
  });

  it("keeps money already invested", () => {
    const plan = planBudget({
      wanted: [want("housing", 80000)],
      takeHomePence: 200000,
      usualSavingsPence: 10000,
      usualInvestmentsPence: 10000,
    });
    assert.equal(amount(plan, "investments"), 10000);
    assert.equal(plan.savingsPence, 30000);
  });
});

describe("fitting the take-home", () => {
  it("trims the lines that bend most, and the food shop least", () => {
    const plan = planBudget({
      wanted: [want("housing", 100000), want("groceries", 40000), want("dining", 60000)],
      takeHomePence: 200000,
      usualSavingsPence: 0,
    });
    assert.equal(plan.plannedPence, 200000);
    assert.equal(amount(plan, "housing"), 100000);
    assert.equal(plan.savingsPence, 20000);
    const groceryCut = 40000 - amount(plan, "groceries");
    const diningCut = 60000 - amount(plan, "dining");
    assert.ok(diningCut > groceryCut, `${diningCut} > ${groceryCut}`);
    assert.ok(amount(plan, "groceries") >= 34000);
    assert.equal(plan.trimmed[0].name, "Dining");
    assert.equal(plan.tight, false);
  });

  it("is never more than the take-home, even when spending is far over it", () => {
    // Like £3,610 of spending against £2,200 take-home.
    const plan = planBudget({
      wanted: [
        want("housing", 90000),
        want("bills", 30000),
        want("groceries", 50000),
        want("dining", 40000),
        want("fashion", 30000),
        want("sent", 60000),
        want("entertainment", 20000),
        want("transport", 15000),
        want("subscriptions", 10000),
        want("other", 16000),
      ],
      takeHomePence: 220000,
      usualSavingsPence: 0,
    });
    assert.ok(plan.plannedPence <= 220000, String(plan.plannedPence));
    assert.equal(amount(plan, "housing"), 90000);
    assert.equal(amount(plan, "bills"), 30000);
    assert.equal(plan.tight, true);
    // A small amount still goes into savings, to start the habit.
    assert.ok(plan.savingsPence >= 6000, String(plan.savingsPence));
    assert.ok(plan.trimmed.length > 0);
  });

  it("says so when never-cut lines alone are more than the take-home", () => {
    const plan = planBudget({
      wanted: [want("housing", 150000), want("bills", 60000), want("dining", 20000)],
      takeHomePence: 200000,
      usualSavingsPence: 0,
    });
    assert.equal(plan.fixedOver, true);
    assert.equal(amount(plan, "housing"), 150000);
    assert.equal(amount(plan, "dining"), 0);
  });

  it("stays within the take-home for many shapes of spending", () => {
    const cats: CategoryId[] = ["groceries", "dining", "fashion", "transport", "gifts", "sent", "subscriptions", "entertainment"];
    for (let seed = 1; seed <= 60; seed++) {
      const wanted = cats.map((category, i) => want(category, ((seed * 7919 * (i + 3)) % 60000) + 500));
      wanted.push(want("housing", 50000 + ((seed * 104729) % 40000)));
      const takeHomePence = 150000 + ((seed * 15485863) % 150000);
      const plan = planBudget({ wanted, takeHomePence, usualSavingsPence: (seed * 31) % 20000 });
      if (!plan.fixedOver) assert.ok(plan.plannedPence <= takeHomePence, `seed ${seed}: ${plan.plannedPence} > ${takeHomePence}`);
      for (const line of plan.lines) assert.equal(line.amountPence % 500, 0, `seed ${seed}: ${line.category} ${line.amountPence}`);
    }
  });
});

describe("fitting a budget the person already has", () => {
  const lines: BudgetLine[] = [
    { id: "a", name: "", category: "housing", amountPence: 95000, neverCut: true },
    { id: "b", name: "", category: "groceries", amountPence: 60000, neverCut: false },
    { id: "c", name: "", category: "gifts", amountPence: 140000, neverCut: false },
    { id: "d", name: "Perfume", category: null, amountPence: 30000, neverCut: false },
    { id: "e", name: "", category: "transport", amountPence: 10000, neverCut: true },
    { id: "f", name: "", category: "fashion", amountPence: 26000, neverCut: false },
  ];

  it("brings it within the take-home and keeps the person's own choices", () => {
    const plan = fitBudget(lines, 220000);
    assert.ok(plan.plannedPence <= 220000, String(plan.plannedPence));
    assert.equal(plan.lines.find((line) => line.id === "a")?.amountPence, 95000);
    // Transport was marked never cut by the person, so it stays.
    assert.equal(plan.lines.find((line) => line.id === "e")?.amountPence, 10000);
    assert.ok(plan.lines.some((line) => line.name === "Perfume"));
  });

  it("does not lower savings the person set when there is room", () => {
    const plan = fitBudget(
      [
        { id: "a", name: "", category: "housing", amountPence: 50000, neverCut: true },
        { id: "s", name: "", category: "savings", amountPence: 60000, neverCut: false },
      ],
      200000,
    );
    assert.equal(plan.savingsPence, 60000);
  });
});
