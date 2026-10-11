import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { descKey, samePayee } from "./payee.ts";

describe("statement descriptions", () => {
  it("keeps the payee and drops numbers, dates and how it was paid", () => {
    assert.equal(descKey("BLD*MYPERFECTCV.CO"), "bld myperfectcv.co");
    assert.equal(descKey("BLD*MYPERFECTCV.CO 4421"), "bld myperfectcv.co");
    assert.equal(descKey("TESCO STORES 3456"), "tesco stores");
    assert.equal(descKey("CARD PAYMENT TO ASDA 12/10"), "asda");
    assert.equal(descKey("AMZN Mktp UK*1A2B3C4D5"), "amzn mktp uk");
    assert.equal(descKey("Uber *Trip help.uber.com"), "uber trip help.uber.com");
    assert.equal(descKey("1234 5678"), "");
  });

  it("matches the same payee on different days and stores", () => {
    assert.equal(samePayee("TESCO STORES 3456", "Tesco Stores 2210"), true);
    assert.equal(samePayee("BLD*MYPERFECTCV.CO 4421", "BLD*MYPERFECTCV.CO 9902"), true);
    assert.equal(samePayee("TESCO STORES 3456", "TESCO PETROL 3456"), false);
    assert.equal(samePayee("1234", "1234"), false);
  });
});
