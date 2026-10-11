import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isMonthly, readHot, titlePrice } from "./hot-search.ts";

/** A card as HotUKDeals sends it: JSON in single-quoted data-vue3 attributes, entity-encoded. */
function card(thread: Record<string, unknown>): string {
  const attr = (value: unknown) => JSON.stringify(value).replace(/&/g, "&amp;").replace(/'/g, "&#039;");
  const main = { name: "ThreadMainListItemNormalizer", props: { thread } };
  const button = {
    name: "ThreadListItemMainButton",
    props: { layout: "LIST", threadId: thread.threadId, link: `https://www.hotukdeals.com/visit/search/${thread.threadId}` },
  };
  return `<article id="thread_${thread.threadId}" class="thread"><div class="js-vue3" data-handler="vue3" data-vue3='${attr(main)}'></div>
    <a href="https://www.hotukdeals.com/deals/${thread.titleSlug}-${thread.threadId}" class="thread-link">${thread.title}</a>
    <div class="js-vue3" data-vue3='${attr(button)}'></div></article>`;
}

describe("reading HotUKDeals cards", () => {
  const html = [
    card({
      threadId: "4512345",
      titleSlug: "dior-sauvage-edt-100ml",
      title: "Dior Sauvage EDT 100ml £69 at Boots",
      price: 69,
      voucherCode: "SCENT15",
      link: "",
      linkHost: "www.boots.com",
      isExpired: false,
      merchant: { merchantName: "Boots" },
    }),
    card({
      threadId: "4512000",
      titleSlug: "old-deal",
      title: "Old deal & Jo's gone",
      price: 10,
      linkHost: "www.argos.co.uk",
      isExpired: true,
    }),
    card({
      threadId: "4511999",
      titleSlug: "iphone-17-pro-ee",
      title: "iPhone 17 Pro 256GB £35/month on EE",
      price: 35,
      link: "",
      linkHost: "",
      isExpired: false,
    }),
  ].join("\n");

  it("takes the code, the shop link and the price, and drops expired deals", () => {
    const deals = readHot(html, 10);
    assert.equal(deals.length, 2);
    const dior = deals[0];
    assert.equal(dior.code, "SCENT15");
    assert.equal(dior.shopUrl, "https://www.hotukdeals.com/visit/search/4512345");
    assert.equal(dior.merchant, "Boots");
    assert.equal(dior.pricePence, 6900);
    assert.equal(dior.url, "https://www.hotukdeals.com/deals/dior-sauvage-edt-100ml-4512345");
  });

  it("never treats a monthly contract as the price, and gives no shop link when there is no shop", () => {
    const phone = readHot(html, 10)[1];
    assert.equal(phone.monthly, true);
    assert.equal(phone.pricePence, null);
    assert.equal(phone.shopUrl, "");
  });

  it("still reads plain links when the cards carry no data", () => {
    const plain = `<a href="https://www.hotukdeals.com/deals/lurpak-1kg-123" class="x">Lurpak 1kg &amp; more £6 @ Tesco</a>`;
    const deals = readHot(plain, 10);
    assert.equal(deals.length, 1);
    assert.equal(deals[0].title, "Lurpak 1kg & more £6 @ Tesco");
    assert.equal(deals[0].pricePence, 600);
  });
});

describe("prices in titles", () => {
  it("skips savings and monthly prices", () => {
    assert.equal(titlePrice("Save £50: iPhone 17 Pro £749 at Argos"), 74900);
    assert.equal(titlePrice("£100 off iPhone 17 Pro, now £899"), 89900);
    assert.equal(titlePrice("iPhone 17 Pro £30/month, no upfront"), null);
    assert.equal(titlePrice("Nike Air Max 90 for £64.99"), 6499);
    assert.equal(titlePrice("Apple iPhone 17 Pro Max 256GB - £1019.98 (In-store)"), 101998);
    assert.equal(titlePrice("MacBook Air £1,049 at John Lewis"), 104900);
    assert.equal(titlePrice("Free delivery this weekend"), null);
    assert.equal(isMonthly("SIM only 100GB £10 per month"), true);
    assert.equal(isMonthly("iPhone 17 Pro + Unlimited Data - £40.99pm - £29 Upfront"), true);
    assert.equal(isMonthly("Pizza Express: kids eat free until 9pm"), false);
  });
});
