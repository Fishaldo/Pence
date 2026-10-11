import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { areaOf, onlyFarAway, townsIn } from "./towns.ts";

describe("deals in other towns", () => {
  it("knows which part of the country a town is in", () => {
    assert.equal(areaOf("Birmingham"), "west-midlands");
    assert.equal(areaOf("birmingham, UK"), "west-midlands");
    assert.equal(areaOf("Stoke-on-Trent"), "west-midlands");
    assert.equal(areaOf("Nowhere Special"), null);
  });

  it("drops in-person deals far away, keeps nearby and nationwide ones", () => {
    assert.equal(onlyFarAway("Taylor’s Bar & Kitchen, Scarborough. - £30 Restaurant Voucher", "Birmingham"), true);
    assert.equal(onlyFarAway("Grosvenor Casino - £30 Restaurant Voucher (Sheffield)", "Birmingham"), true);
    assert.equal(onlyFarAway("ASDA Lemon Tart 350g (Frozen), Instore Bolton", "Birmingham"), true);
    assert.equal(onlyFarAway("Krispy Kreme dozen for £12 at Solihull", "Birmingham"), false);
    assert.equal(onlyFarAway("Burger King BOGOF nationwide", "Birmingham"), false);
    assert.equal(onlyFarAway("Taylor’s Bar & Kitchen, Scarborough", "Somewhere unknown"), false);
  });

  it("does not mistake words for towns", () => {
    assert.deepEqual(townsIn("New York Bakery bagels"), []);
    assert.deepEqual(townsIn("a local derby"), []);
    assert.deepEqual(townsIn("Bath towels in the sale"), []);
  });
});
