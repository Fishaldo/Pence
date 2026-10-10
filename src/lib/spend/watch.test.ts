import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cleanWhat, fitsWatch, floorAfter, judge, offerStatus, watchTerms } from "./watch.ts";

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
