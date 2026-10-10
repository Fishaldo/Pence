import { n as createMiddleware } from "./ssr.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/middleware-7TFDpBfn.js
var CATEGORIES = [
	{
		id: "groceries",
		label: "Groceries"
	},
	{
		id: "household",
		label: "Household"
	},
	{
		id: "fashion",
		label: "Fashion"
	},
	{
		id: "entertainment",
		label: "Entertainment"
	},
	{
		id: "dining",
		label: "Dining"
	},
	{
		id: "transport",
		label: "Transport"
	},
	{
		id: "health",
		label: "Health"
	},
	{
		id: "bills",
		label: "Bills"
	},
	{
		id: "subscriptions",
		label: "Subscriptions"
	},
	{
		id: "personal",
		label: "Personal care"
	},
	{
		id: "travel",
		label: "Travel"
	},
	{
		id: "gifts",
		label: "Gifts"
	},
	{
		id: "other",
		label: "Other"
	}
];
var CATEGORY_SET = new Set(CATEGORIES.map((c) => c.id));
function isCategory(value) {
	return CATEGORY_SET.has(value);
}
function categoryLabel(id) {
	return CATEGORIES.find((c) => c.id === id)?.label ?? "Other";
}
function poundsToPence(raw) {
	let t = raw.trim().replace(/[£$€¥₦]/g, "").replace(/\b(gbp|ngn|usd|eur)\b/gi, "").replace(/\s/g, "");
	if (t.includes(",") && t.includes(".")) t = t.replace(/,/g, "");
	else if (/^\d{1,3}(,\d{3})+$/.test(t)) t = t.replace(/,/g, "");
	else if (/^\d+,\d{1,2}$/.test(t)) t = t.replace(",", ".");
	else t = t.replace(/,/g, "");
	if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
	const [whole, frac = ""] = t.split(".");
	const pence = Number(whole) * 100 + Number((frac + "00").slice(0, 2));
	if (!Number.isFinite(pence) || pence > 1e8) return null;
	return pence;
}
function formatGBP(pence) {
	const neg = pence < 0;
	const abs = Math.abs(Math.round(pence));
	const pounds = Math.floor(abs / 100);
	const rem = abs % 100;
	return `${neg ? "−" : ""}£${pounds.toLocaleString("en-GB")}.${String(rem).padStart(2, "0")}`;
}
function formatPercent(ratio) {
	return `${Math.round(ratio * 100)}%`;
}
function monthKey(d) {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function shiftMonth(key, delta) {
	const [y, m] = key.split("-").map(Number);
	return monthKey(new Date(y, m - 1 + delta, 1));
}
function daysInMonth(key) {
	const [y, m] = key.split("-").map(Number);
	return new Date(y, m, 0).getDate();
}
function monthLabel(key) {
	const [y, m] = key.split("-").map(Number);
	return new Date(y, m - 1, 1).toLocaleDateString("en-GB", {
		month: "long",
		year: "numeric"
	});
}
function monthShort(key) {
	const [y, m] = key.split("-").map(Number);
	return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "long" });
}
function todayISO(d = /* @__PURE__ */ new Date()) {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function dayLabel(iso, today = /* @__PURE__ */ new Date()) {
	const current = todayISO(today);
	const y = new Date(today);
	y.setDate(today.getDate() - 1);
	const yesterday = todayISO(y);
	if (iso === current) return "Today";
	if (iso === yesterday) return "Yesterday";
	const [year, month, day] = iso.split("-").map(Number);
	return new Date(year, month - 1, day).toLocaleDateString("en-GB", {
		weekday: "short",
		day: "numeric",
		month: "short"
	});
}
function monthProgress(key, today = /* @__PURE__ */ new Date()) {
	const current = monthKey(today);
	const days = daysInMonth(key);
	if (key < current) return {
		day: days,
		days,
		complete: true
	};
	if (key > current) return {
		day: 0,
		days,
		complete: false
	};
	return {
		day: Math.min(today.getDate(), days),
		days,
		complete: false
	};
}
var KEYWORDS = [
	{
		category: "dining",
		words: [
			"uber eats",
			"ubereats",
			"just eat",
			"deliveroo",
			"greggs",
			"mcdonald",
			"nando",
			"wagamama",
			"starbucks",
			"costa coffee",
			"costa",
			"pret a manger",
			"pret",
			"kfc",
			"domino",
			"pizza hut",
			"burger king"
		]
	},
	{
		category: "groceries",
		words: [
			"tesco",
			"sainsbury",
			"asda",
			"aldi",
			"lidl",
			"morrisons",
			"waitrose",
			"iceland",
			"co-op",
			"coop",
			"ocado",
			"m&s food",
			"farmfoods"
		]
	},
	{
		category: "transport",
		words: [
			"uber",
			"bolt",
			"trainline",
			"tfl",
			"nexus",
			"stagecoach",
			"national rail",
			"free now"
		]
	},
	{
		category: "subscriptions",
		words: [
			"netflix",
			"spotify",
			"disney+",
			"disney plus",
			"youtube premium",
			"now tv",
			"amazon prime",
			"prime video",
			"apple music",
			"icloud",
			"puregym",
			"pure gym"
		]
	},
	{
		category: "fashion",
		words: [
			"primark",
			"zara",
			"asos",
			"h&m",
			"uniqlo",
			"shein",
			"nike",
			"jd sports",
			"next "
		]
	},
	{
		category: "entertainment",
		words: [
			"odeon",
			"vue",
			"cineworld",
			"steam",
			"playstation",
			"ticketmaster",
			"cinema"
		]
	},
	{
		category: "health",
		words: [
			"boots",
			"superdrug",
			"pharmacy",
			"holland & barrett",
			"lloyds pharmacy"
		]
	},
	{
		category: "household",
		words: [
			"ikea",
			"dunelm",
			"b&q",
			"screwfix",
			"the range",
			"wilko",
			"home bargains",
			"robert dyas"
		]
	},
	{
		category: "bills",
		words: [
			"octopus",
			"british gas",
			"eon",
			"edf",
			"ovo energy",
			"thames water",
			"northumbrian water",
			"council tax",
			"vodafone",
			"giffgaff",
			"virgin media",
			"tv licence",
			"tv license",
			"bt broadband"
		]
	},
	{
		category: "travel",
		words: [
			"airbnb",
			"booking.com",
			"ryanair",
			"easyjet",
			"jet2",
			"british airways"
		]
	},
	{
		category: "personal",
		words: [
			"barber",
			"haircut",
			"the body shop"
		]
	}
];
function matchCategory(text) {
	const hay = text.toLowerCase();
	let best = null;
	for (const rule of KEYWORDS) for (const word of rule.words) if (hay.includes(word) && (!best || word.length > best.len)) best = {
		category: rule.category,
		len: word.length
	};
	return best;
}
function tidyName(s) {
	return s.replace(/\.com\b/gi, "").replace(/\b(with|using|via|on|for|from|paid|payment|card|google|apple|pay)\b/gi, " ").trim().split(/\s+/).filter(Boolean).slice(0, 4).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}
function extractAmount(text) {
	for (const pattern of [
		/£\s*(\d{1,6}(?:,\d{3})*(?:\.\d{1,2})?)/,
		/\bgbp\s*(\d{1,6}(?:,\d{3})*(?:\.\d{1,2})?)/i,
		/(\d{1,6}(?:,\d{3})*\.\d{2})\s*(?:gbp)\b/i
	]) {
		const match = text.match(pattern);
		if (!match) continue;
		const pence = poundsToPence(match[1]);
		if (pence != null && pence > 0) return pence;
	}
	return null;
}
function extractMerchant(text) {
	let t = text.replace(/google\s*pay|apple\s*pay|gpay|apple\s*wallet|samsung\s*pay/gi, " ");
	const directed = t.match(/\b(?:at|to|from)\s+([a-z0-9][a-z0-9&.'’\-]*(?:\s+[a-z0-9][a-z0-9&.'’\-]*){0,3})/i);
	if (directed) return tidyName(directed[1]);
	t = t.replace(/£\s*\d[\d.,]*|\b\d[\d.,]*\s*gbp\b/gi, " ");
	t = t.replace(/[·•|]/g, " ");
	t = t.replace(/\b(you|paid|spent|payment|payments|trip|completed|with|using|via|on|the|a|an|for|notification|card|no|receipt|ending|in|gbp|apple|google|pay|debited|purchase)\b/gi, " ");
	t = t.replace(/[^a-z0-9&.'’\-\s]/gi, " ").replace(/\s+/g, " ").trim();
	return tidyName(t);
}
function parseAlert(raw) {
	const text = raw.replace(/\s+/g, " ").trim();
	const amountPence = extractAmount(text);
	const hit = matchCategory(text);
	const merchant = extractMerchant(text);
	const category = hit?.category ?? "other";
	let confidence = .25;
	if (amountPence && merchant && hit) confidence = .88;
	else if (amountPence && merchant) confidence = .56;
	else if (amountPence && hit) confidence = .62;
	else if (amountPence) confidence = .4;
	return {
		merchant: merchant || "Card payment",
		amountPence,
		category,
		confidence
	};
}
function summarize(txs, key) {
	const rows = txs.filter((t) => t.spentOn.slice(0, 7) === key);
	const cat = /* @__PURE__ */ new Map();
	const merch = /* @__PURE__ */ new Map();
	let spent = 0;
	for (const tx of rows) {
		spent += tx.amountPence;
		cat.set(tx.category, (cat.get(tx.category) ?? 0) + tx.amountPence);
		const slug = tx.merchant.trim().toLowerCase();
		const prev = merch.get(slug);
		if (prev) {
			prev.amount += tx.amountPence;
			prev.count += 1;
		} else merch.set(slug, {
			name: tx.merchant,
			amount: tx.amountPence,
			count: 1
		});
	}
	return {
		key,
		spent,
		count: rows.length,
		byCategory: [...cat.entries()].map(([id, amount]) => ({
			id,
			amount
		})).sort((a, b) => b.amount - a.amount),
		byMerchant: [...merch.values()].sort((a, b) => b.amount - a.amount).slice(0, 5)
	};
}
function projectedSpend(spent, day, days) {
	if (day <= 0) return null;
	return Math.round(spent / day * days);
}
var CATEGORY_TIP = {
	groceries: "Move the things you buy every week to the shop’s own brand, and check the Clubcard or Nectar price before the ordinary shelf ticket. A same-day Too Good To Go bag can cover breakfasts for less than another top-up shop.",
	household: "Refills of washing liquid and cleaning spray are cheaper in a bigger bottle from Aldi, Lidl, or Home Bargains than the branded one that lands in the grocery basket.",
	fashion: "Put the item on a list and wait until the next payday. Most clothes bought on a whim don’t survive a week of thinking about them.",
	entertainment: "Weekday showings and a Meerkat Movies code are the usual cinema cut. Look at any game or ticket purchase in this category before the next one.",
	dining: "Choose two evenings to eat what is already in the house. A Greggs, Deliveroo, or Just Eat habit usually shrinks faster than the weekly shop.",
	transport: "Add the rides up. If they repeat the same route, compare that total with a bus, Metro, or weekly ticket before you book the next one.",
	health: "Ask for the generic at the counter. A points offer is only a saving if you were going to buy the item at the lower price anyway.",
	bills: "These rarely move mid-month. If one jumped, check a fix or a social tariff before the next direct debit, not after it has left.",
	subscriptions: "Open each one you paid this month. Cancel the service you have not actually used in the last fortnight.",
	personal: "Toiletries last longer than the offer suggests. Skip the multibuy unless the bottle at home is actually empty.",
	travel: "A trip is fine when it was planned. If this one wasn’t, leave the extras for next month’s money.",
	gifts: "Decide the ceiling before you browse. A smaller present usually lands as well as the upgraded one.",
	other: "Give these a real category. Other is where forgotten memberships and card taps hide."
};
function buildAdvice(input) {
	const cards = [];
	const { current, previous, income, projected, city } = input;
	const top = current.byCategory[0];
	if (income > 0 && current.spent > income) cards.push({
		id: "over",
		tone: "warn",
		title: "This month is already past your take-home",
		body: `You’ve logged ${formatGBP(current.spent - income)} more than the ${formatGBP(income)} that lands in your account. Pause anything that isn’t food, transport to work, or a bill.`
	});
	else if (income > 0 && projected != null && !input.complete && projected > income) cards.push({
		id: "pace",
		tone: "warn",
		title: "This pace overshoots your pay",
		body: `If the rest of the month looks like the days so far, you’ll land near ${formatGBP(projected)} — ${formatGBP(projected - income)} over your take-home. The cut has to come from the biggest category, not from skipping a coffee once.`
	});
	if (top && top.amount > 0) {
		const share = current.spent > 0 ? top.amount / current.spent : 0;
		const ofPay = income > 0 ? ` That’s ${formatPercent(top.amount / income)} of take-home.` : "";
		let body = `${categoryLabel(top.id)} is ${formatPercent(share)} of what you’ve logged.${ofPay} ${CATEGORY_TIP[top.id]}`;
		if (top.id === "transport" && /newcastle|tyneside|gateshead|north shields|whitley bay/i.test(city)) body += " Around Newcastle, put the Metro and a Pop card next to those app rides before you assume the car is the only way.";
		cards.push({
			id: "top",
			tone: "calm",
			title: `Most of it is ${categoryLabel(top.id).toLowerCase()}`,
			body
		});
	}
	const rise = current.byCategory.map((row) => {
		const prev = previous.byCategory.find((p) => p.id === row.id)?.amount ?? 0;
		return {
			id: row.id,
			now: row.amount,
			prev,
			delta: row.amount - prev
		};
	}).filter((row) => row.prev >= 800 && row.delta > row.prev * .15 && row.id !== top?.id).sort((a, b) => b.delta - a.delta)[0];
	if (rise) cards.push({
		id: "rise",
		tone: "warn",
		title: `${categoryLabel(rise.id)} is up on last month`,
		body: `${formatGBP(rise.delta)} more than last month so far in the comparison. ${CATEGORY_TIP[rise.id]}`
	});
	const other = current.byCategory.find((c) => c.id === "other");
	if (other && current.spent > 0 && other.amount / current.spent > .12) cards.push({
		id: "other",
		tone: "calm",
		title: "A slice is still filed as Other",
		body: `${formatGBP(other.amount)} has no proper category. Naming those taps usually shows a subscription or a takeaway you didn’t think was a habit.`
	});
	const subs = current.byCategory.find((c) => c.id === "subscriptions");
	if (subs && subs.amount > 0 && cards.length < 4) cards.push({
		id: "subs",
		tone: "calm",
		title: "Subscriptions leave on their own",
		body: `${formatGBP(subs.amount)} is already committed this month. ${CATEGORY_TIP.subscriptions}`
	});
	if (cards.length === 0) cards.push({
		id: "empty",
		tone: "calm",
		title: "Log a few spends and the advice gets specific",
		body: "Scan a receipt, or paste a Google Pay, Apple Pay, or Uber alert. Pence will sort it and tell you what to trim."
	});
	return cards.slice(0, 4);
}
var PROGRAMMES = [
	{
		id: "clubcard",
		name: "Tesco Clubcard Prices",
		categories: ["groceries", "household"],
		where: "Tesco shops and the Tesco app",
		when: "Ongoing. The lower price applies when a Clubcard is scanned.",
		detail: "The yellow Clubcard label is a different price from the ordinary shelf ticket. Scan before you pay the big number.",
		href: "https://www.tesco.com/clubcard"
	},
	{
		id: "nectar",
		name: "Nectar Prices",
		categories: ["groceries", "household"],
		where: "Sainsbury’s",
		when: "Ongoing on the products marked with a Nectar Price.",
		detail: "Member prices sit under the regular ticket, and points stack on top. Worth opening the Nectar app before a big Sainsbury’s shop.",
		href: "https://www.nectar.com"
	},
	{
		id: "lidl",
		name: "Lidl Plus",
		categories: ["groceries", "household"],
		where: "The Lidl Plus app, then the till",
		when: "Coupons refresh in the app. Check them before the shop, not after you’ve paid.",
		detail: "The savings are coupons and weekly treats inside the app. They apply when you scan Lidl Plus at checkout.",
		href: "https://www.lidl.co.uk/"
	},
	{
		id: "aldi",
		name: "Aldi Super 6",
		categories: ["groceries"],
		where: "Aldi",
		when: "A short fruit and veg list that changes through the week.",
		detail: "If groceries are mostly produce, look at Super 6 before you buy the same items elsewhere at full price.",
		href: "https://www.aldi.co.uk/"
	},
	{
		id: "tgtg",
		name: "Too Good To Go",
		categories: ["groceries", "dining"],
		where: "The Too Good To Go app, collected near you",
		when: "Same-day bags, usually late afternoon or evening. They disappear once reserved.",
		detail: "Shops and cafés sell surplus food for a fraction of the menu price. Set your area, then check the day you actually need food.",
		href: "https://www.toogoodtogo.com/en-gb"
	},
	{
		id: "boots",
		name: "Boots Advantage Card",
		categories: ["health", "personal"],
		where: "Boots shops and the Boots app",
		when: "Points and advantage prices run continuously. Bigger points events are posted in the app.",
		detail: "Use it on toiletries and pharmacy items you already needed. A points multiple is not a reason to add a third basket.",
		href: "https://www.boots.com/"
	},
	{
		id: "rides",
		name: "Check the ride price first",
		categories: ["transport"],
		where: "Uber and Bolt, on the confirm screen",
		when: "Fares jump in rain, at closing time, and on match days.",
		detail: "The upfront price is the moment to switch to the bus or Metro. A membership fee is only worth it when it is smaller than the fees you already pay.",
		href: "https://www.uber.com/gb/en/"
	}
];
function programmesFor(categories) {
	const wanted = new Set(categories);
	const matched = PROGRAMMES.filter((p) => p.categories.some((c) => wanted.has(c)));
	if (matched.length > 0) return matched.slice(0, 3);
	return PROGRAMMES.filter((p) => p.categories.includes("groceries")).slice(0, 2);
}
function validDate(value) {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	const [y, m, d] = value.split("-").map(Number);
	const dt = new Date(y, m - 1, d);
	return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}
/**
* Auth middleware for server functions — the standard way to get the caller's
* verified user id. When deployed the session cookie is same-origin and rides
* along automatically. In the live preview the client also forwards the bearer
* token (partitioned cookies) via the `.client` hook below — call sites do not
* thread it themselves.
*
*   import { createServerFn } from "@tanstack/react-start";
*   import { getSql } from "@/lib/db";
*   import { authMiddleware } from "@/lib/auth/middleware";
*
*   export const listTodos = createServerFn({ method: "GET" })
*     .middleware([authMiddleware])
*     .handler(async ({ context }) => {
*       const sql = await getSql();
*       return sql`select * from todos where user_id = ${context.userId}`;
*     });
*
* Signed out with auth on (live preview included) -> throws `UnauthorizedError`
* (see `verify.server.ts`). With auth disabled (`VITE_AUTH_ENABLED=false`, the
* shipped default) it resolves the shared dev user — but throws instead when a
* `DATABASE_URL` is also set, so an app without sign-in must not use this at
* all. On the auth-on path, use it on every server function that touches
* per-user data and scope every query by `context.userId`.
*/
var authMiddleware = createMiddleware({ type: "function" }).client(async ({ next }) => {
	const { getBearerToken } = await import("./client-1vAx-gM_.mjs").then((n) => n.n).then((n) => n.n);
	return next({ sendContext: { bearerToken: getBearerToken() ?? void 0 } });
}).server(async ({ next, context }) => {
	const { assertSameSiteRequest } = await import("./isolation.server-CGNg1r0B.mjs");
	const { requireUserId } = await import("./verify.server-BVPvKw4h.mjs");
	assertSameSiteRequest();
	return next({ context: { userId: await requireUserId(context.bearerToken) } });
});
//#endregion
export { shiftMonth as _, dayLabel as a, validDate as b, isCategory as c, monthProgress as d, monthShort as f, projectedSpend as g, programmesFor as h, categoryLabel as i, monthKey as l, poundsToPence as m, authMiddleware as n, formatGBP as o, parseAlert as p, buildAdvice as r, formatPercent as s, CATEGORIES as t, monthLabel as u, summarize as v, todayISO as y };
