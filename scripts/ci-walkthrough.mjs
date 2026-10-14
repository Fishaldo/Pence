#!/usr/bin/env node
/**
 * Walks through Pence the way a person would, on a phone-sized screen, and
 * saves screenshots plus a short report. Used by the GitHub check so the app is
 * really run, not just compiled.
 *
 *   node scripts/ci-walkthrough.mjs http://127.0.0.1:8080 ci-out/dev
 *
 * Signs up a fresh account, fills in the first-run form, loads the sample
 * month, then opens Home, Offers, the Watchlist (adding watches), Plan, regular
 * payments (adding a free trial), Hot deals, Insights and Activity, then the
 * payday features: safe to spend, one-tap questions, Bills, Budget, the weekly
 * check-in, search with totals, Plan's quick questions, Add and your data. Every console error, page error and failed request is
 * written to report.json.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const base = (process.argv[2] ?? "http://127.0.0.1:8080").replace(/\/$/, "");
const out = process.argv[3] ?? "ci-out/dev";
mkdirSync(out, { recursive: true });

const report = { base, steps: [], consoleErrors: [], pageErrors: [], failedRequests: [], watchCheck: null };

async function step(name, run) {
  const started = Date.now();
  try {
    const note = await run();
    report.steps.push({ name, ok: true, ms: Date.now() - started, note: note ?? "" });
  } catch (err) {
    report.steps.push({ name, ok: false, ms: Date.now() - started, note: String(err?.message || err).slice(0, 500) });
  }
}

// PENCE_CHROMIUM points at a browser that is already installed, when the one Playwright expects is not.
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
  ...(process.env.PENCE_CHROMIUM ? { executablePath: process.env.PENCE_CHROMIUM } : {}),
});
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await context.newPage();
page.setDefaultTimeout(30_000);
page.on("console", (msg) => {
  if (msg.type() === "error") report.consoleErrors.push(`${page.url()} :: ${msg.text()}`.slice(0, 400));
});
page.on("pageerror", (err) => report.pageErrors.push(`${page.url()} :: ${String(err?.message || err)}`.slice(0, 400)));
page.on("response", (res) => {
  if (res.status() >= 500 && res.url().startsWith(base)) report.failedRequests.push(`${res.status()} ${res.url()}`);
});

async function shot(name) {
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(out, `${name}.png`), fullPage: true });
}

async function settle(ms = 1500) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(ms);
}

const email = `ci-${Date.now()}@example.com`;

await step("open the app", async () => {
  await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Create account" }).waitFor();
  await shot("01-login");
});

await step("create an account", async () => {
  await page.getByLabel("Name", { exact: true }).fill("Somto Test");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("pence-check-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByText("A little about you").waitFor({ timeout: 45_000 });
  await shot("02-first-run");
});

await step("fill in pay and town", async () => {
  await page.getByLabel("Monthly take-home pay").fill("2400");
  await page.getByLabel("Home town").fill("Birmingham");
  await page.getByLabel("Payday, day of the month").selectOption("25");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByText("Deals near you first").waitFor({ timeout: 45_000 });
  await shot("03a-location-once");
  await page.getByRole("button", { name: /^Not now/ }).click();
  await page.getByText("Add your first spends").waitFor({ timeout: 45_000 });
  await shot("03-home-empty");
});

await step("load the sample month", async () => {
  await page.getByRole("button", { name: "Show a sample month" }).click();
  await page.getByRole("heading", { name: "Latest", exact: true }).waitFor({ timeout: 45_000 });
  await settle(6000);
  await shot("04-home-sample");
});

await step("open Offers", async () => {
  await page.goto(`${base}/offers`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Offers", exact: true }).waitFor();
  await settle(15_000);
  await shot("05-offers");
  const knows = page.getByRole("button", { name: "Your shops", exact: true });
  if (await knows.count()) {
    await knows.click();
    await shot("06-offers-what-pence-knows");
  }
  return (await page.locator("main").innerText()).slice(0, 1200);
});

await step("Plan: place picker", async () => {
  await page.goto(`${base}/plan`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Plan a spend" }).waitFor();
  const where = page.getByLabel(/^Where/);
  await where.waitFor();
  const options = await where.locator("option").allInnerTexts();
  if (await page.getByLabel("Country").count()) throw new Error("Country shows before Type a place is picked");
  await where.selectOption("manual");
  await page.getByLabel("Country").waitFor();
  await page.getByLabel("Town", { exact: true }).waitFor();
  await shot("07-plan-type-a-place");
  return options.join(" | ");
});

await step("Plan: Watchlist needs an item or a shop", async () => {
  await page.goto(`${base}/plan`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Add to Watchlist" }).first().click();
  await page.getByText("To add to your Watchlist, fill in the item, or the shop or place.").waitFor();
});

await step("Plan: add an item to the Watchlist", async () => {
  await page.getByLabel(/^Item/).fill("iPhone 17 Pro 256GB");
  await page.getByLabel(/^Budget/).fill("800");
  await page.getByRole("button", { name: "Add to Watchlist" }).first().click();
  await page.getByText("Added to your Watchlist").waitFor();
  await shot("08-plan-added");
});

await step("Plan: add a shop to the Watchlist", async () => {
  await page.goto(`${base}/plan`, { waitUntil: "domcontentloaded" });
  await page.getByLabel(/^Shop/).fill("ASDA");
  await page.getByRole("button", { name: "Add to Watchlist" }).first().click();
  await page.getByText("Added to your Watchlist").waitFor();
});

await step("Offers: the Watchlist", async () => {
  await page.goto(`${base}/offers#watchlist`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Watchlist", exact: true }).waitFor();
  await page.waitForTimeout(3000);
  await page
    .getByText("Looking now…")
    .waitFor({ state: "detached", timeout: 90_000 })
    .catch(() => undefined);
  await settle(5000);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Watchlist", exact: true }).waitFor();
  await settle(3000);
  await page.locator("#watchlist").screenshot({ path: join(out, "09-watchlist.png") });
  return (await page.locator("#watchlist").innerText()).slice(0, 1500);
});

await step("Watchlist: reopen every offer seen", async () => {
  const seen = page.locator("#watchlist").getByRole("button", { name: /\d+ offers? seen/ }).first();
  if ((await seen.count()) === 0) return "no offers seen yet";
  await seen.click();
  await page.getByText(/Changed your mind\? Take one\./).first().waitFor();
  await page.locator("#watchlist").screenshot({ path: join(out, "09b-watchlist-seen.png") });
  const takes = await page.locator("#watchlist").getByRole("button", { name: "Take this one" }).count();
  return `${takes} offers can be taken`;
});

await step("Offers: cheaper elsewhere under your own shops", async () => {
  await page.goto(`${base}/offers`, { waitUntil: "domcontentloaded" });
  await settle(6000);
  await page.getByRole("button", { name: "Cheaper elsewhere", exact: true }).click();
  await settle(1000);
  const away = await page.locator("main li").count();
  return away > 0 ? `${away} cheaper places shown` : "no cheaper places found right now";
});

await step("Activity: rename a payee for every payment like it", async () => {
  await page.goto(`${base}/activity`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Activity", exact: true }).waitFor();
  await page.getByRole("button", { name: /^Uber/ }).first().click();
  await page.getByRole("dialog").waitFor();
  await page.getByLabel("Shop or payee").fill("Uber rides");
  await page.getByText(/Also change the \d+ other payments? like this/).waitFor();
  await page.getByRole("dialog").screenshot({ path: join(out, "10-edit-rename.png") });
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.getByText(/other payments? changed too/).waitFor();
  await settle(1500);
  const renamed = await page.getByRole("button", { name: /^Uber rides/ }).count();
  const all = await page.getByRole("button", { name: /^Uber/ }).count();
  if (renamed < 2 || renamed !== all) throw new Error(`${renamed} of ${all} renamed`);
  return `all ${renamed} Uber payments now read Uber rides`;
});

await step("Activity: add what was bought to a payment", async () => {
  await page.getByRole("button", { name: /^Greggs/ }).first().click();
  await page.getByRole("dialog").waitFor();
  await page.getByLabel("Add an item").fill("Nappies, bread, milk");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByLabel("Item 3", { exact: true }).waitFor();
  await page.getByRole("dialog").screenshot({ path: join(out, "11-edit-items.png") });
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.getByText("Spend updated").waitFor();
  await settle(1000);
  const row = await page.getByRole("button", { name: /^Greggs/ }).first().innerText();
  if (!/3 items/.test(row)) throw new Error(`row reads: ${row}`);
  return row.replace(/\s+/g, " ");
});

await step("Regular payments: the list", async () => {
  await page.goto(`${base}/regular`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Regular payments", exact: true }).waitFor();
  await page.getByRole("button", { name: /^Netflix/ }).waitFor();
  await page.getByRole("button", { name: /^Spotify/ }).waitFor();
  await settle(800);
  await shot("16-regular");
  return (await page.locator("main").innerText()).replace(/\s+/g, " ").slice(0, 400);
});

await step("Regular payments: add a free trial", async () => {
  const ends = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
  await page.getByRole("button", { name: "Add a payment or free trial" }).click();
  await page.getByLabel("Name").fill("Audible trial");
  await page.getByLabel("Amount (£)").fill("0");
  await page.getByLabel("How often").selectOption("once");
  await page.getByLabel("Trial ends").fill(ends);
  await page.getByRole("button", { name: "Add to the list" }).click();
  await page.getByText("Audible trial is on your list").waitFor();
  const soon = page.locator("section").filter({ has: page.getByRole("heading", { name: "Next 7 days" }) });
  await soon.getByRole("button", { name: /^Audible trial/ }).waitFor();
  await settle(800);
  await shot("17-regular-trial");
});

await step("Regular payments: mark one as cancelled", async () => {
  await page.getByRole("button", { name: /^Spotify/ }).click();
  await page.getByRole("link", { name: "How to cancel Spotify" }).waitFor();
  await page.getByRole("button", { name: "I’ve cancelled it" }).click();
  const done = page.locator("section").filter({ has: page.getByRole("heading", { name: "Cancelled", exact: true }) });
  await done.getByRole("button", { name: /^Spotify/ }).waitFor();
});

await step("Home: payments coming out soon", async () => {
  await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: /^Coming up before/ }).waitFor();
  const card = page.locator("section[aria-label='Coming up']");
  await card.getByText("Audible trial").waitFor();
  await card.screenshot({ path: join(out, "18-home-coming-out.png") });
});

await step("open Hot deals", async () => {
  await page.goto(`${base}/hot`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Popular now in the UK", exact: true }).waitFor();
  await settle(8000);
  await shot("12-hot");
  return (await page.locator("main").innerText()).slice(0, 600);
});

await step("open Insights", async () => {
  await page.goto(`${base}/insights`, { waitUntil: "domcontentloaded" });
  await settle(3000);
  await shot("13-insights");
});

await step("Home: safe to spend and one-tap questions", async () => {
  await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
  await page.getByText(/^(Safe to spend|Over your take-home) until/).first().waitFor();
  await settle(2500);
  await shot("19-home-safe-to-spend");
  const tap = page.locator("section[aria-label='Needs a tap'] li").first();
  if ((await tap.count()) === 0) return "no questions waiting";
  const question = (await tap.innerText()).replace(/\s+/g, " ");
  await tap.getByRole("button").first().click();
  await settle(2000);
  return `answered: ${question.slice(0, 80)}`;
});

await step("Bills: list, price rises and a better deal", async () => {
  await page.goto(`${base}/bills`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Bills", exact: true }).waitFor();
  await settle(2000);
  await shot("20-bills");
  const rows = page.locator("main li button[aria-expanded]");
  if ((await rows.count()) === 0) return "no bills found";
  await rows.first().click();
  const look = page.getByRole("button", { name: "Look for a better deal" }).first();
  if ((await look.count()) === 0) return "this bill cannot be switched";
  await look.click();
  await page
    .getByRole("button", { name: "Looking…" })
    .waitFor({ state: "detached", timeout: 90_000 })
    .catch(() => undefined);
  await settle(1500);
  await shot("21-bills-deals");
  return (await page.locator("main").innerText()).replace(/\s+/g, " ").slice(0, 500);
});

await step("Budget: made from past pays", async () => {
  await page.goto(`${base}/budget`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Your budget for this pay", exact: true }).waitFor();
  await page.getByRole("button", { name: "Make my budget" }).click();
  await page.getByRole("button", { name: "Save budget" }).waitFor();
  await shot("22-budget-draft");
  await page.getByRole("button", { name: "Save budget" }).click();
  await page.getByText("Planned", { exact: true }).waitFor();
  await settle(1000);
  await shot("23-budget");
});

await step("Weekly check-in", async () => {
  await page.goto(`${base}/week`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Your week", exact: true }).waitFor();
  await page.getByLabel("Check-in day").selectOption("1");
  await page.getByText("Weekly check-in on Mondays").waitFor();
  await settle(800);
  await shot("24-week");
});

await step("Activity: search with totals by period", async () => {
  await page.goto(`${base}/activity`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Search").fill("uber");
  await page.getByLabel("Time range").selectOption("3m");
  await settle(800);
  const total = await page.locator("p[aria-live='polite']").first().innerText();
  if (!/matching “uber”/.test(total)) throw new Error(`totals read: ${total}`);
  if (!/last 3 months/.test(total)) throw new Error(`time range not applied: ${total}`);
  await shot("25-activity-search");
  return total.replace(/\s+/g, " ");
});

await step("Back returns to where you came from", async () => {
  await page.goto(`${base}/offers`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Offers", exact: true }).waitFor();
  await page.getByRole("link", { name: "Bills", exact: true }).click();
  await page.getByRole("heading", { name: "Bills", exact: true }).waitFor();
  await page.getByRole("link", { name: "Back" }).click();
  await page.getByRole("heading", { name: "Offers", exact: true }).waitFor();
  await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Latest", exact: true }).waitFor();
  await page.goto(`${base}/bills`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Bills", exact: true }).waitFor();
  await page.getByRole("link", { name: "Back" }).click();
  await page.waitForURL(/\/$/);
  return "Offers → Bills → Back lands on Offers; Bills opened directly → Back lands on Home";
});

await step("Plan: quick questions for eating out", async () => {
  await page.goto(`${base}/plan`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Plan a spend" }).waitFor();
  await page.locator("form .field button.control").first().click();
  await page.getByRole("radio", { name: "Dining", exact: true }).click();
  await page.getByText("Who's going?").waitFor();
  await page.getByRole("button", { name: "Family", exact: true }).click();
  await page.getByRole("button", { name: "Dinner", exact: true }).click();
  await settle(500);
  await shot("26-plan-questions");
});

await step("Add: paste a payment message", async () => {
  await page.goto(`${base}/capture`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Add a spend" }).waitFor();
  await shot("27a-add");
  await page.getByRole("button", { name: "Paste a payment message" }).click();
  await page.getByPlaceholder("Google Pay · You paid £14.80 to Uber").waitFor();
  await shot("27-add-paste");
});

await step("Settings: your data", async () => {
  await page.goto(`${base}/settings`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Your data" }).waitFor();
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 30_000 }),
    page.getByRole("button", { name: "Download my data" }).click(),
  ]);
  const name = download.suggestedFilename();
  if (!/^pence-data-.*\.json$/.test(name)) throw new Error(`file was ${name}`);
  await page.getByRole("heading", { name: "Your data" }).scrollIntoViewIfNeeded();
  await shot("28-settings-data");
  return name;
});

await step("open Activity", async () => {
  await page.goto(`${base}/activity`, { waitUntil: "domcontentloaded" });
  await settle(2000);
  await shot("14-activity");
});

await step("home on a computer screen", async () => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Latest", exact: true }).waitFor();
  await settle(4000);
  await shot("15-home-desktop");
  await page.setViewportSize({ width: 390, height: 844 });
});

await step("phone width has no sideways scroll", async () => {
  for (const path of ["/", "/offers", "/plan", "/activity", "/regular", "/bills", "/budget", "/week", "/settings"]) {
    await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded" });
    await settle(1500);
    const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    if (wide) throw new Error(`${path} scrolls sideways`);
  }
});

await step("daily watch check route", async () => {
  const res = await page.request.get(`${base}/api/watch-check`, { timeout: 120_000 });
  report.watchCheck = { status: res.status(), body: (await res.text()).slice(0, 300) };
  if (res.status() !== 200) throw new Error(`status ${res.status()}`);
  return report.watchCheck.body;
});

await step("service worker file is served", async () => {
  const res = await page.request.get(`${base}/pence-sw.js`);
  if (res.status() !== 200) throw new Error(`status ${res.status()}`);
});

await browser.close();
writeFileSync(join(out, "report.json"), JSON.stringify(report, null, 2));
const failed = report.steps.filter((row) => !row.ok);
console.log(
  `${report.steps.length - failed.length}/${report.steps.length} steps passed, ` +
    `${report.consoleErrors.length} console errors, ${report.pageErrors.length} page errors`,
);
for (const row of failed) console.log(`FAILED ${row.name}: ${row.note}`);
