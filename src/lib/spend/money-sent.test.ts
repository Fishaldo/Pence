import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isMoneySent, looksLikePerson, payeeKind, sendingService } from "./money-sent.ts";
import { parseAlert } from "./model.ts";
import { buildTaste, dayNum, isoOf, shopsToLookUp, type SpendInput } from "./habits.ts";

describe("money-transfer apps", () => {
  it("knows the apps people use to send money", () => {
    assert.equal(sendingService("LEMFI LIMITED"), "LemFi");
    assert.equal(sendingService("Card payment", "LEMFI*TOPUP 1234"), "LemFi");
    assert.equal(sendingService("TRANSFERWISE"), "Wise");
    assert.equal(sendingService("Wise"), "Wise");
    assert.equal(sendingService("WISE PAYMENTS LTD"), "Wise");
    assert.equal(sendingService("Remitly"), "Remitly");
    assert.equal(sendingService("WESTERN UNION 445"), "Western Union");
  });

  it("does not see one in an ordinary shop name", () => {
    assert.equal(sendingService("Wise Owl Cafe"), null);
    assert.equal(sendingService("Otherwise Coffee"), null);
    assert.equal(sendingService("Tesco"), null);
  });
});

describe("payees that are people", () => {
  it("reads a name as a person", () => {
    for (const name of ["SOMTOCHUKWU NKEMEL", "FPS J SMITH", "Ngozi A. Okafor", "Mum", "To Mum", "Payment to Ada Eze ref birthday"]) {
      assert.equal(looksLikePerson(name), true, name);
    }
  });

  it("reads a shop as a shop", () => {
    for (const name of [
      "Jollof Food Store Main Store",
      "Najeb Halal Continental Supermarket",
      "Google Commerce Limited",
      "Amazon",
      "Card Factory",
      "Tesco Stores 3456",
      "SAVINGS",
      "J K",
      "Mama Ngozi Kitchen",
    ]) {
      assert.equal(looksLikePerson(name), false, name);
    }
  });

  it("names the kind of payee", () => {
    assert.equal(payeeKind("LemFi"), "service");
    assert.equal(payeeKind("Somtochukwu Nkemel"), "person");
    assert.equal(payeeKind("Card payment", "FPS ADA EZE"), "person");
    assert.equal(payeeKind("ASDA"), null);
  });
});

describe("money sent, not something bought", () => {
  it("treats a gift to a person as money sent", () => {
    assert.equal(isMoneySent({ merchant: "SOMTOCHUKWU NKEMEL", category: "gifts" }), true);
    assert.equal(isMoneySent({ merchant: "Ada Eze", category: "other", source: "bank" }), true);
    assert.equal(isMoneySent({ merchant: "Anything", category: "sent" }), true);
    assert.equal(isMoneySent({ merchant: "LEMFI", category: "gifts" }), true);
    assert.equal(isMoneySent({ merchant: "LEMFI", category: "other" }), true);
  });

  it("keeps real gift shopping as gifts", () => {
    assert.equal(isMoneySent({ merchant: "Moonpig", category: "gifts" }, true), false);
    assert.equal(isMoneySent({ merchant: "Hotel Chocolat", category: "gifts" }), false);
    // A receipt or items mean something was bought, even from a person.
    assert.equal(isMoneySent({ merchant: "Ada Eze", category: "gifts", items: [{ name: "cake" }] }), false);
    assert.equal(isMoneySent({ merchant: "Ada Eze", category: "gifts", source: "receipt" }), false);
  });

  it("leaves a person paid for a real service alone", () => {
    // Rent to a private landlord, or paying a friend back for dinner, keeps its category.
    assert.equal(isMoneySent({ merchant: "John Smith", category: "housing" }), false);
    assert.equal(isMoneySent({ merchant: "John Smith", category: "dining" }), false);
  });
});

describe("alerts and statement lines", () => {
  it("files money sent to a person", () => {
    assert.equal(parseAlert("You sent £50.00 to Mum").category, "sent");
    assert.equal(parseAlert("Faster payment £120.00 to ADA EZE").category, "sent");
    assert.equal(parseAlert("SOMTOCHUKWU NKEMEL").category, "sent");
    assert.equal(parseAlert("LEMFI £132.00").category, "sent");
  });

  it("does not mistake a shop for a person", () => {
    assert.equal(parseAlert("You paid £8.20 at Mama Africa").category, "other");
    assert.equal(parseAlert("£12.66 at Jollof Food Store").category, "other");
    assert.equal(parseAlert("You paid £40.00 at Tesco").category, "groceries");
    assert.equal(parseAlert("£100 transfer to own account").category, "transfers");
  });
});

describe("offers learn from shopping, not from money sent", () => {
  const TODAY = "2026-10-10";
  const before = (n: number) => isoOf(dayNum(TODAY) - n);
  const spend = (merchant: string, amountPence: number, n: number, category: SpendInput["category"]): SpendInput => ({
    merchant,
    amountPence,
    spentOn: before(n),
    category,
    source: "bank",
  });

  const spends: SpendInput[] = [
    spend("SOMTOCHUKWU NKEMEL", 13200, 3, "gifts"),
    spend("SOMTOCHUKWU NKEMEL", 13200, 33, "gifts"),
    spend("SOMTOCHUKWU NKEMEL", 13200, 63, "gifts"),
    spend("Ada Eze", 5000, 10, "gifts"),
    spend("Moonpig", 450, 20, "gifts"),
    spend("Moonpig", 450, 80, "gifts"),
    spend("LEMFI", 20000, 5, "other"),
    spend("LEMFI", 20000, 35, "other"),
    spend("LEMFI", 20000, 65, "other"),
  ];
  const taste = buildTaste(spends, { today: TODAY, payday: 25 });

  it("counts only real gift shopping as a gift habit", () => {
    const gifts = taste.interests.find((row) => row.id === "gifts");
    assert.ok(gifts);
    assert.equal(gifts.occasions, 2);
    assert.deepEqual(gifts.shops, ["Moonpig"]);
  });

  it("never lists a person as a shop", () => {
    assert.equal(
      taste.shops.some((shop) => /nkemel|eze/i.test(shop.name)),
      false,
    );
  });

  it("turns a transfer app into a habit worth checking fees for", () => {
    const sending = taste.interests.find((row) => row.id === "sending-money");
    assert.ok(sending);
    assert.equal(sending.occasions, 3);
    assert.deepEqual(sending.shops, ["LemFi"]);
  });

  it("never looks a person up on the web", () => {
    const wanted = shopsToLookUp(spends).map((row) => row.merchant);
    assert.equal(wanted.some((name) => /nkemel|eze/i.test(name)), false);
  });
});
