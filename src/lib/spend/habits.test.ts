import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildTaste,
  cleanItem,
  dayNum,
  dealFits,
  habitLine,
  isoOf,
  itemInterest,
  merchantInterest,
  paydayAfter,
  paydayOnOrBefore,
  reasonFor,
  rhythmOf,
  savingLine,
  searchNeeds,
  whenText,
  type SpendInput,
} from "./habits.ts";

const TODAY = "2026-10-10"; // a Saturday

function daysBefore(n: number): string {
  return isoOf(dayNum(TODAY) - n);
}

describe("matching shops and items", () => {
  it("files the shop under the interest it sells", () => {
    assert.equal(merchantInterest("TESCO STORES 3456", "groceries").id, "food-shop");
    assert.equal(merchantInterest("TESCO STORES 3456", "groceries").brand, "Tesco");
    assert.equal(merchantInterest("Uber Eats", "dining").id, "takeaway");
    assert.equal(merchantInterest("UBER *TRIP", "transport").id, "taxis");
    assert.equal(merchantInterest("The Perfume Shop", "personal").id, "perfume");
    assert.equal(merchantInterest("Sainsbury's", "groceries").brand, "Sainsbury’s");
  });

  it("follows the category the person chose for a shop that sells everything", () => {
    assert.equal(merchantInterest("Tesco", "household").id, "home");
    assert.equal(merchantInterest("Boots", "health").id, "pharmacy");
    assert.equal(merchantInterest("Boots", "personal").id, "beauty");
  });

  it("does not mistake common words for shops", () => {
    assert.notEqual(merchantInterest("Post Office", "other").id, "shoes");
    assert.equal(merchantInterest("NEXT RETAIL LTD", "fashion").id, "clothes");
    assert.notEqual(merchantInterest("Spar", "groceries").id, "beauty");
    assert.equal(merchantInterest("Tesco Metro", "groceries").brand, "Tesco");
  });

  it("falls back to the category when the shop is unknown", () => {
    assert.equal(merchantInterest("Mama Ngozi Kitchen", "dining").id, "eating-out");
    assert.equal(merchantInterest("Random Ltd", "other").id, null);
  });

  it("reads receipt lines", () => {
    assert.equal(itemInterest("DIOR SAUVAGE EDT 100ML"), "perfume");
    assert.equal(itemInterest("Nike Air Max 90"), "shoes");
    assert.equal(itemInterest("Persil Bio 1.4L"), "cleaning");
    assert.equal(itemInterest("Phone Top Up"), null);
    assert.equal(itemInterest("Semi skimmed milk"), "food-shop");
    assert.equal(itemInterest("Phone top up"), null);
  });

  it("cleans a receipt line for people to read", () => {
    assert.equal(cleanItem("2 × DIOR SAUVAGE EDT 100ML"), "Dior Sauvage EDT");
    assert.equal(cleanItem("TESCO FINEST COFFEE 227G"), "Coffee");
  });
});

describe("paydays", () => {
  it("finds the payday before and after a day", () => {
    assert.equal(isoOf(paydayOnOrBefore(dayNum("2026-10-10"), 25)), "2026-09-25");
    assert.equal(isoOf(paydayOnOrBefore(dayNum("2026-10-25"), 25)), "2026-10-25");
    assert.equal(isoOf(paydayAfter(dayNum("2026-10-25"), 25)), "2026-11-25");
    assert.equal(isoOf(paydayAfter(dayNum("2026-02-10"), 31)), "2026-02-28");
  });
});

describe("rhythm", () => {
  const occ = (n: number, pence = 5000, minutes: number | null = null) => ({ day: dayNum(daysBefore(n)), pence, minutes });

  it("sees a weekly Saturday shop and predicts the next one", () => {
    const r = rhythmOf([occ(35), occ(28), occ(21), occ(14), occ(7)], dayNum(TODAY), null);
    assert.equal(r.regular, true);
    assert.equal(r.gapDays, 7);
    assert.equal(r.weekday, 6);
    assert.equal(r.nextOn, TODAY);
    assert.equal(r.due, "now");
    assert.match(habitLine(r), /^Most Saturdays · about £50 each time$/);
  });

  it("does not predict from two buys", () => {
    const r = rhythmOf([occ(20), occ(10)], dayNum(TODAY), null);
    assert.equal(r.regular, false);
    assert.equal(r.nextOn, null);
  });

  it("lets a habit that stopped go quiet", () => {
    const r = rhythmOf([occ(120), occ(113), occ(106), occ(99)], dayNum(TODAY), null);
    assert.equal(r.faded, true);
    assert.equal(r.nextOn, null);
  });

  it("spots buying right after payday", () => {
    const occs = ["2026-07-25", "2026-08-26", "2026-09-25"].map((iso) => ({ day: dayNum(iso), pence: 3000, minutes: null }));
    const r = rhythmOf(occs, dayNum(TODAY), 25);
    assert.equal(r.afterPayday, true);
    assert.equal(r.nextOn, "2026-10-25");
    assert.equal(r.due, "later");
  });

  it("reads the usual time of day", () => {
    const r = rhythmOf([occ(30, 900, 19 * 60), occ(20, 900, 18 * 60 + 30), occ(10, 900, 20 * 60)], dayNum(TODAY), null);
    assert.equal(r.timeOfDay, "evening");
  });
});

function spend(n: number, merchant: string, pounds: number, category: SpendInput["category"], extra: Partial<SpendInput> = {}): SpendInput {
  return { merchant, amountPence: Math.round(pounds * 100), category, spentOn: daysBefore(n), ...extra };
}

describe("taste profile", () => {
  const spends: SpendInput[] = [
    // Weekly Tesco on Saturdays, with a receipt time in the evening.
    ...[56, 49, 42, 35, 28, 21, 14, 7].map((n) => spend(n, "Tesco", 54, "groceries", { note: "Visa · 18:40" })),
    // Perfume roughly every six weeks, once inside a Boots receipt.
    spend(130, "The Perfume Shop", 68, "personal", { items: [{ name: "Dior Sauvage EDT 100ml", amountPence: 6800 }] }),
    spend(88, "The Perfume Shop", 70, "personal", { items: [{ name: "Dior Sauvage EDT 100ml", amountPence: 7000 }] }),
    spend(45, "Boots", 82, "health", {
      items: [
        { name: "Dior Sauvage EDT 100ml", amountPence: 7200 },
        { name: "Paracetamol 16", amountPence: 1000 },
      ],
    }),
    // Uber on Friday nights.
    ...[50, 43, 36, 29, 22, 15, 8, 1].map((n) => spend(n, "Uber", 14, "transport")),
    // A one-off sample spend must not count when real spends exist.
    spend(3, "Sample Shop", 999, "other", { isSample: true }),
  ];
  const taste = buildTaste(spends, { today: TODAY, payday: 25 });

  it("learns what the person buys, with perfume found inside a pharmacy receipt", () => {
    const ids = taste.interests.map((row) => row.id);
    assert.ok(ids.includes("food-shop"));
    assert.ok(ids.includes("perfume"));
    assert.ok(ids.includes("taxis"));
    assert.ok(ids.includes("pharmacy"));
    const perfume = taste.interests.find((row) => row.id === "perfume");
    assert.equal(perfume?.occasions, 3);
    assert.equal(perfume?.items[0]?.name, "Dior Sauvage EDT");
    assert.equal(perfume?.items[0]?.times, 3);
    const pharmacy = taste.interests.find((row) => row.id === "pharmacy");
    assert.equal(pharmacy?.totalPence, 1000);
  });

  it("ignores samples once real spends exist", () => {
    assert.equal(taste.usingSamples, false);
    assert.ok(!taste.shops.some((shop) => shop.name === "Sample Shop"));
  });

  it("predicts the Saturday food shop and the Friday ride", () => {
    const tesco = taste.shops.find((shop) => shop.name === "Tesco");
    assert.equal(tesco?.weekday, 6);
    assert.equal(tesco?.timeOfDay, "evening");
    assert.equal(tesco?.nextOn, TODAY);
    const titles = taste.upcoming.map((row) => row.title);
    assert.ok(titles.includes("Tesco"));
    assert.ok(titles.includes("Uber"));
    assert.equal(whenText(TODAY, TODAY), "Due about now");
    assert.match(reasonFor("i:taxis", taste), /^You take taxis most Fridays\./);
    assert.match(reasonFor("s:uber", taste), /^You ride with Uber most Fridays, about £14 each time\./);
  });

  it("explains a deal in plain words", () => {
    assert.equal(
      reasonFor("s:tesco", taste),
      "You do a food shop at Tesco most Saturdays, about £54 each time. The next one is due about now.",
    );
    assert.match(reasonFor("i:perfume", taste), /^You buy perfume about every 6 weeks\./);
    assert.equal(
      reasonFor("i:perfume", taste, "Dior Sauvage EDT"),
      "You’ve bought Dior Sauvage EDT 3 times. The next one is due about now.",
    );
  });

  it("searches for the things the person actually buys", () => {
    const needs = searchNeeds(taste);
    const queries = needs.map((need) => need.query.toLowerCase());
    assert.ok(queries.includes("tesco"));
    assert.ok(queries.includes("perfume"));
    assert.ok(queries.includes("dior sauvage edt"));
    assert.ok(needs.length <= 9);
  });

  it("hides what the person said is not them, and adds what they asked for", () => {
    const tuned = buildTaste(spends, { today: TODAY, payday: 25, prefs: { muted: ["i:taxis"], added: ["i:holidays"] } });
    assert.ok(!tuned.interests.some((row) => row.id === "taxis"));
    assert.ok(!tuned.upcoming.some((row) => row.title === "Uber"));
    assert.deepEqual(tuned.hidden, [{ key: "i:taxis", label: "Taxis & rides" }]);
    const holidays = tuned.interests.find((row) => row.id === "holidays");
    assert.equal(holidays?.added, true);
    assert.equal(reasonFor("i:holidays", tuned), "You asked for deals on holidays.");
    assert.ok(searchNeeds(tuned).some((need) => need.key === "i:holidays"));
  });

  it("uses samples when there is nothing else", () => {
    const only = buildTaste([spend(3, "Tesco", 10, "groceries", { isSample: true })], { today: TODAY, payday: null });
    assert.equal(only.usingSamples, true);
    assert.equal(only.interests[0]?.id, "food-shop");
  });
});

describe("what people tell Pence", () => {
  it("knows a CV builder is not streaming", () => {
    assert.equal(merchantInterest("BLD*MYPERFECTCV.CO", "subscriptions").id, "career");
    assert.equal(merchantInterest("BLD*MYPERFECTCV.CO", "subscriptions").brand, "MyPerfectCV");
    assert.equal(merchantInterest("ACME CLOUD TOOLS", "subscriptions").id, "memberships");
    assert.equal(merchantInterest("Netflix", "subscriptions").id, "streaming");
  });

  it("learns from items added to a payment with no receipt", () => {
    const taste = buildTaste(
      [
        spend(20, "ASDA", 20.5, "groceries", {
          source: "bank",
          items: [
            { name: "Nappies", amountPence: 0 },
            { name: "Bread", amountPence: 0 },
          ],
        }),
      ],
      { today: TODAY, payday: null },
    );
    const kids = taste.interests.find((row) => row.id === "kids");
    const food = taste.interests.find((row) => row.id === "food-shop");
    assert.equal(kids?.totalPence, 1025);
    assert.equal(food?.totalPence, 1025);
  });

  it("uses the prices people know and shares the rest", () => {
    const taste = buildTaste(
      [
        spend(20, "Boots", 40, "health", {
          items: [
            { name: "Sauvage perfume", amountPence: 3000 },
            { name: "Paracetamol", amountPence: 0 },
          ],
        }),
      ],
      { today: TODAY, payday: null },
    );
    assert.equal(taste.interests.find((row) => row.id === "perfume")?.totalPence, 3000);
    assert.equal(taste.interests.find((row) => row.id === "pharmacy")?.totalPence, 1000);
  });
});

describe("keeping deals on topic", () => {
  const taste = buildTaste(
    [56, 49, 42, 35].map((n) => spend(n, "Tesco", 54, "groceries")),
    { today: TODAY, payday: null },
  );
  const tescoNeed = searchNeeds(taste).find((need) => need.key === "s:tesco");

  it("keeps a television out of a food shop habit", () => {
    if (!tescoNeed) throw new Error("expected a Tesco search");
    assert.equal(dealFits("Lurpak Spreadable 1kg £6 with Clubcard @ Tesco", tescoNeed), true);
    assert.equal(dealFits("Samsung 55 inch QLED TV £399 @ Tesco", tescoNeed), false);
    assert.equal(dealFits("Lurpak 1kg £6 @ Asda", tescoNeed), false);
  });

  it("needs most of the product name for an item search", () => {
    const need = { key: "i:perfume", query: "dior sauvage", match: ["dior", "sauvage"], avoid: ["candle"], shopWords: [], item: "Dior Sauvage", usualPence: 7000 };
    assert.equal(dealFits("Dior Sauvage EDT 100ml £69 at Boots", need), true);
    assert.equal(dealFits("Dior Addict lipstick £20", need), false);
  });
});

describe("savings", () => {
  it("only states a saving the deal page printed", () => {
    assert.equal(savingLine("20% off everything at Boots", 7000), "20% off is about £14 on your usual £70");
    assert.equal(savingLine("Half price Persil", 1200), "50% off is about £6 on your usual £12");
    assert.equal(savingLine("Up to 70% off in the sale", 7000), "");
    assert.equal(savingLine("Persil 2 for £10", 1200), "");
    assert.equal(savingLine("10% off", 200), "");
  });
});
