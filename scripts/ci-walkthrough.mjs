#!/usr/bin/env node
/**
 * Walks through Pence the way a person would, on a phone-sized screen, and
 * saves screenshots plus a short report. Used by the GitHub check so the app is
 * really run, not just compiled.
 *
 *   node scripts/ci-walkthrough.mjs http://127.0.0.1:8080 ci-out/dev
 *
 * Signs up a fresh account, fills in the first-run form, loads the sample
 * month, then opens Home, Offers, Price watch (adding a watch), Plan, Hot deals,
 * Insights and Activity. Every console error, page error and failed request is
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

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
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
  await page.getByText("Create your account").waitFor();
  await shot("01-login");
});

await step("create an account", async () => {
  await page.getByLabel("Name", { exact: true }).fill("Somto Test");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("pence-check-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByText("What lands in your account?").waitFor({ timeout: 45_000 });
  await shot("02-first-run");
});

await step("fill in pay and town", async () => {
  await page.getByLabel("Monthly take-home (£)").fill("2400");
  await page.getByLabel("City, so tips can be local").fill("Birmingham");
  await page.getByLabel("Payday (optional)").selectOption("25");
  await page.getByRole("button", { name: "Start tracking" }).click();
  await page.getByText("Spent so far").waitFor({ timeout: 45_000 });
  await shot("03-home-empty");
});

await step("load the sample month", async () => {
  await page.getByRole("button", { name: "Try a sample month" }).click();
  await page.getByText("Activity", { exact: true }).waitFor({ timeout: 45_000 });
  await settle(6000);
  await shot("04-home-sample");
});

await step("open Offers", async () => {
  await page.goto(`${base}/offers`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "For you" }).waitFor();
  await settle(15_000);
  await shot("05-offers");
  const knows = page.getByRole("button", { name: "What Pence knows" });
  if (await knows.count()) {
    await knows.click();
    await shot("06-offers-what-pence-knows");
  }
  return (await page.locator("main").innerText()).slice(0, 1200);
});

await step("add a price watch", async () => {
  await page.goto(`${base}/watch`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Wait for a better price" }).waitFor();
  await page.getByLabel("What do you want?").fill("iPhone 17 Pro 256GB");
  await page.getByLabel("The most you’d pay (£), if you know").fill("800");
  await page.getByRole("button", { name: "Watch the price" }).click();
  await page.getByText("iPhone 17 Pro 256GB").first().waitFor();
  await page.waitForTimeout(2000);
  await page
    .getByText("Looking now…")
    .waitFor({ state: "detached", timeout: 90_000 })
    .catch(() => undefined);
  await settle(2000);
  await shot("07-watch");
  return (await page.locator("main").innerText()).slice(0, 1200);
});

await step("open Plan", async () => {
  await page.goto(`${base}/plan`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Before you spend" }).waitFor();
  await shot("08-plan");
});

await step("open Hot deals", async () => {
  await page.goto(`${base}/hot`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Hot deals" }).waitFor();
  await settle(8000);
  await shot("09-hot");
  return (await page.locator("main").innerText()).slice(0, 600);
});

await step("open Insights", async () => {
  await page.goto(`${base}/insights`, { waitUntil: "domcontentloaded" });
  await settle(3000);
  await shot("10-insights");
});

await step("open Activity", async () => {
  await page.goto(`${base}/activity`, { waitUntil: "domcontentloaded" });
  await settle(2000);
  await shot("11-activity");
});

await step("home on a computer screen", async () => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
  await page.getByText("Spent so far").waitFor();
  await settle(4000);
  await shot("12-home-desktop");
  await page.setViewportSize({ width: 390, height: 844 });
});

await step("phone width has no sideways scroll", async () => {
  for (const path of ["/", "/offers", "/watch", "/plan"]) {
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
