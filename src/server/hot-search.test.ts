import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isMonthly, readDealText, readHot, titlePrice } from "./hot-search.ts";

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
    assert.equal(isMonthly("iPhone 17 128GB £21.99/m, 100GB data"), true);
    assert.equal(isMonthly("iPhone 17 £30 x24"), true);
  });
});

describe("deal pages and dates", () => {
  it("reads the words of a deal post from its page", () => {
    const description =
      '<img src="x.jpg" /> apply code in advance via App/Website <br />Use code: Large10<br />Definitely works in Leeds &amp; Birmingham <br />Cannot be used with any other offer';
    const html = `<script>window.__INITIAL_STATE__ = {"threadDetail":{"threadDetails":{"preparedHtmlDescription":${JSON.stringify(description)}}}};</script>`;
    const text = readDealText(html);
    assert.match(text, /Use code: Large10/);
    assert.match(text, /Definitely works in Leeds & Birmingham/);
    assert.doesNotMatch(text, /<img/);
    assert.equal(readDealText("<html>no state</html>"), "");
  });

  it("keeps the end date the board prints, drops deals past it, and marks in-store deals", () => {
    const soon = Math.floor(Date.now() / 1000) + 5 * 86_400;
    const gone = Math.floor(Date.now() / 1000) - 86_400;
    const html =
      card({ threadId: 1, title: "Free doughnut instore", titleSlug: "free-doughnut", endDate: { timestamp: soon }, isLocal: true, selectedLocations: { isNational: false } }) +
      card({ threadId: 2, title: "Old voucher", titleSlug: "old-voucher", endDate: { timestamp: gone } });
    const deals = readHot(html, 10);
    assert.equal(deals.length, 1);
    assert.match(deals[0].endsOn ?? "", /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(deals[0].inStore, true);
  });
});
