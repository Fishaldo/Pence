import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  cleanWhat,
  fitsTarget,
  fitsWatch,
  floorAfter,
  isPromotion,
  judge,
  namesShop,
  offerStatus,
  offerStatusFor,
  isStoreWide,
  shopDealFits,
  watchLabel,
  watchTerms,
} from "./watch.ts";

describe("what is being watched", () => {
  it("keeps names and model numbers, drops filler", () => {
    assert.deepEqual(watchTerms("the latest iPhone 17 Pro 256 GB"), { words: ["iphone", "pro"], numbers: ["17", "256gb"] });
    assert.equal(cleanWhat("  Dyson\nV15  "), "Dyson V15");
  });

  it("matches the same product and not a different model", () => {
    const want = "iPhone 17 Pro 256GB";
    assert.equal(fitsWatch("Apple iPhone 17 Pro 256 GB £899 at Argos", want), true);
    assert.equal(fitsWatch("Apple iPhone 16 Pro 256GB £699", want), false);
    assert.equal(fitsWatch("iPhone 17 Pro 512GB £1,049", want), false);
  });

  it("leaves out accessories unless they were asked for", () => {
    assert.equal(fitsWatch("Spigen case for iPhone 17 Pro 256GB £9", "iPhone 17 Pro 256GB"), false);
    assert.equal(fitsWatch("Spigen case for iPhone 17 Pro £9", "iPhone 17 Pro case"), true);
  });

  it("works for places and services too", () => {
    assert.equal(fitsWatch("Nando's: free starter with the app this week", "Nando's"), true);
    assert.equal(fitsWatch("Premier Inn Leeds City Centre rooms from £39", "hotel in Leeds"), false);
    assert.equal(fitsWatch("Leeds hotel rooms from £39 at Premier Inn", "hotel in Leeds"), true);
  });
});

describe("whether an offer is good enough", () => {
  const free = { targetPence: null, floorPence: null, declines: 0 };

  it("asks about any real offer before a price is set", () => {
    assert.equal(offerStatus({ pricePence: 89900, monthly: false }, free), "new");
    assert.equal(offerStatus({ pricePence: null, monthly: false }, free), "new");
  });

  it("respects the most the person will pay", () => {
    const most = { targetPence: 80000, floorPence: null, declines: 0 };
    assert.equal(judge({ pricePence: 79900, monthly: false }, most), "match");
    assert.equal(judge({ pricePence: 84900, monthly: false }, most), "above");
    assert.equal(offerStatus({ pricePence: null, monthly: false }, most), "quiet");
  });

  it("never takes a monthly payment for the price", () => {
    assert.equal(judge({ pricePence: 3500, monthly: true }, { targetPence: 80000, floorPence: null, declines: 0 }), "unpriced");
  });

  it("after Still too much, only something cheaper counts", () => {
    const floor = floorAfter(null, [89900, null, 92000]);
    assert.equal(floor, 89900);
    const after = { targetPence: null, floorPence: floor, declines: 1 };
    assert.equal(offerStatus({ pricePence: 89900, monthly: false }, after), "above");
    assert.equal(offerStatus({ pricePence: 86000, monthly: false }, after), "new");
    assert.equal(offerStatus({ pricePence: null, monthly: false }, after), "quiet");
    assert.equal(floorAfter(86000, [88000]), 86000);
    assert.equal(floorAfter(null, [null]), null);
  });
});

describe("watching a shop or place", () => {
  it("reads as the item, the shop, or both", () => {
    assert.equal(watchLabel({ item: "iPhone 17 Pro", shop: "Argos" }), "iPhone 17 Pro at Argos");
    assert.equal(watchLabel({ item: "", shop: "ASDA" }), "ASDA");
    assert.equal(watchLabel({ item: "Dyson V15", shop: "" }), "Dyson V15");
  });

  it("finds the shop by name, however it is written", () => {
    assert.equal(namesShop("Half price groceries every Tuesday at ASDA", "ASDA"), true);
    assert.equal(namesShop("PureGym: no joining fee this week", "Pure Gym"), true);
    assert.equal(namesShop("Nando's: free starter with the app", "Nandos"), true);
    assert.equal(namesShop("Tesco Clubcard prices on fruit", "ASDA"), false);
  });

  it("needs both the item and the shop when both are given", () => {
    const target = { item: "iPhone 17 Pro", shop: "Argos" };
    assert.equal(fitsTarget("Apple iPhone 17 Pro 256GB £899", "Argos", target), true);
    assert.equal(fitsTarget("Apple iPhone 17 Pro 256GB £899", "Currys", target), false);
    assert.equal(fitsTarget("50% off groceries on Tuesday", "ASDA", { item: "", shop: "ASDA" }), true);
  });

  it("calls about any promotion at a watched shop, whatever the price", () => {
    const limits = { targetPence: 2000, floorPence: null, declines: 2 };
    assert.equal(offerStatusFor({ pricePence: 5000, monthly: false }, limits, { item: "", shop: "ASDA" }), "new");
    assert.equal(offerStatusFor({ pricePence: 5000, monthly: false }, limits, { item: "Air fryer", shop: "ASDA" }), "above");
    assert.equal(isPromotion("50% off groceries every Tuesday"), true);
    assert.equal(isPromotion("Exceptional by ASDA Extra Large Onions 3pk"), false);
  });
});

describe("which deals at a watched shop are worth a call", () => {
  it("always counts a promotion across the shop", () => {
    assert.equal(isStoreWide("50% off groceries every Tuesday at ASDA"), true);
    assert.equal(isStoreWide("£10 off when you spend £60 on your shop"), true);
    assert.equal(isStoreWide("Scoville 6L Digital Air Fryer £32 - Free C&C"), false);
  });

  it("keeps a supermarket to what it was picked for", () => {
    assert.equal(shopDealFits("Scoville 6L Digital Air Fryer £32 - Free C&C", "groceries", "ASDA"), false);
    assert.equal(shopDealFits("Exceptional by ASDA Extra Large Onions 3pk", "groceries", "ASDA"), true);
    assert.equal(shopDealFits("Persil Bio 1.4L half price", "groceries", "ASDA"), true);
    assert.equal(shopDealFits("Black Regular Fit Active Waist Trousers", "fashion", "ASDA"), true);
    assert.equal(shopDealFits("Asda All Seasons Screenwash 5L", "groceries", "ASDA"), false);
    assert.equal(shopDealFits("Asda Folding Step Stool", "groceries", "ASDA"), false);
    assert.equal(isStoreWide("Halloween Sale - Up To 50% Off On Home Furnishings, Furniture, Toys"), true);
  });

  it("keeps a specialist to what it sells, whatever was picked", () => {
    assert.equal(shopDealFits("PureGym: no joining fee this week", "groceries", "PureGym"), true);
    assert.equal(shopDealFits("Mama Ngozi's Kitchen: 2 for 1 mains", "dining", "Mama Ngozi's Kitchen"), true);
  });
});
