import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { judgeTerms, readTerms, termsFromOffer } from "./terms.ts";

const UBER = "BIG-NIGHT-OUT promo. 40% off next 2 trips max £6 each by adding the code in the app, valid in selected UK regions until late November.";
const PAPA =
  "Any Large Pizza £10 w/Code (Selected Stores)\nUse code: Large10\nDefinitely works in Leeds & Birmingham\nPotentially also available at:\nBelfast - Upper Newtownards Road, Birmingham - Masshouse Lane, Chester, Glasgow - Broomhill, Liverpool - Allerton Road, Manchester - Denton, Solihull, Warrington and Wrexham.";

describe("reading an offer's small print", () => {
  it("sees when an offer is only for some places, people or accounts", () => {
    assert.equal(readTerms(UBER).someAreas, true);
    assert.equal(readTerms("£5 Off First Ride Bookings").newOnly, true);
    assert.equal(readTerms("£10 off on £10+ Spend - Selected Accounts").selectedAccounts, true);
    assert.deepEqual(readTerms("Tesco Finest Celebration Cake - Clubcard Price"), {
      places: [],
      someAreas: false,
      newOnly: false,
      selectedAccounts: false,
    });
  });

  it("drops an offer whose page lists places, none near the person", () => {
    assert.equal(judgeTerms(readTerms(PAPA), { city: "Chelmsford, Essex", usesShop: false }).show, false);
    const brum = judgeTerms(readTerms(PAPA), { city: "Birmingham", usesShop: false });
    assert.equal(brum.show, true);
    assert.equal(brum.works, true);
    assert.equal(brum.note, "Works in Birmingham, the deal page says.");
  });

  it("says what to check when the page does not name the places", () => {
    const essex = judgeTerms(readTerms(UBER), { city: "Essex", usesShop: true });
    assert.equal(essex.show, true);
    assert.equal(essex.works, false);
    assert.match(essex.note, /^Only in some areas\. Check it works in Essex/);
  });

  it("leaves out new-customer offers at a shop the person already uses", () => {
    assert.equal(judgeTerms(readTerms("£5 Off First Ride Bookings"), { city: "Birmingham", usesShop: true }).show, false);
    assert.equal(judgeTerms(readTerms("£5 Off First Ride Bookings"), { city: "Birmingham", usesShop: false }).note, "New customers only.");
  });

  it("uses where and who from the wider search", () => {
    const london = termsFromOffer(UBER, ["London", "Manchester", "Birmingham"], "anyone");
    assert.equal(judgeTerms(london, { city: "Chelmsford, Essex", usesShop: true }).show, false);
    assert.equal(judgeTerms(london, { city: "Birmingham", usesShop: true }).works, true);
    assert.equal(judgeTerms(termsFromOffer("20% off", "nationwide", "anyone"), { city: "Essex", usesShop: true }).note, "");
    assert.equal(judgeTerms(termsFromOffer("20% off", "nationwide", "new customers"), { city: "Essex", usesShop: true }).show, false);
    assert.equal(termsFromOffer("20% off", "some areas", "anyone").someAreas, true);
  });

  it("keeps offers it cannot judge when the person's town is not known", () => {
    const verdict = judgeTerms(readTerms(PAPA), { city: "", usesShop: false });
    assert.equal(verdict.show, true);
    assert.match(verdict.note, /^Only in /);
  });
});
