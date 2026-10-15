import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { pageImage, previewImage } from "./page-image-read.ts";

describe("deal pictures from the shop's own page", () => {
  it("takes the link-preview picture, whichever way round the tag is written", () => {
    const html = `<html><head><meta content="https://media.screwfix.com/is/image/tap.jpg?$fxSharpen$" property="og:image"></head></html>`;
    assert.equal(previewImage(html, "https://www.screwfix.com/p/tap/123"), "https://media.screwfix.com/is/image/tap.jpg?$fxSharpen$");
  });

  it("turns a relative picture into a full address, and refuses one that is not https", () => {
    assert.equal(previewImage(`<meta name="twitter:image" content="/img/a.png">`, "https://shop.example.co.uk/p/1"), "https://shop.example.co.uk/img/a.png");
    assert.equal(previewImage(`<meta property="og:image" content="http://shop.example.co.uk/a.png">`, "https://shop.example.co.uk/"), "");
    assert.equal(previewImage(`<meta property="og:image" content="javascript:alert(1)">`, "https://shop.example.co.uk/"), "");
  });

  it("never reads a deal board, a click-through link or a private address", async () => {
    assert.equal(await pageImage("https://www.hotukdeals.com/deals/a-1"), "");
    assert.equal(await pageImage("http://www.screwfix.com/"), "");
    assert.equal(await pageImage("https://127.0.0.1/"), "");
    assert.equal(await pageImage("https://localhost/"), "");
    assert.equal(await pageImage("https://www.screwfix.com:8443/"), "");
  });
});
