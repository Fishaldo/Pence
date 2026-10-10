import { i as TSS_SERVER_FUNCTION, r as createServerFn } from "./ssr.mjs";
import { b as validDate, c as isCategory, m as poundsToPence, n as authMiddleware, p as parseAlert } from "./middleware-7TFDpBfn.mjs";
import { r as getSql } from "./db-WUPcdEHM.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/ledger-CY-bXx1J.js
var createServerRpc = (serverFnMeta, splitImportFn) => {
	const url = "/_serverFn/" + serverFnMeta.id;
	return Object.assign(splitImportFn, {
		url,
		serverFnMeta,
		[TSS_SERVER_FUNCTION]: true
	});
};
function asBool(value) {
	return value === true || value === "t" || value === "true" || value === 1;
}
function asString(value) {
	if (value instanceof Date) return value.toISOString();
	if (value == null) return "";
	return String(value);
}
function asInt(value) {
	const n = typeof value === "number" ? value : Number(value);
	return Number.isFinite(n) ? Math.round(n) : 0;
}
function asItems(raw) {
	try {
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed.map((row) => {
			if (!row || typeof row !== "object") return null;
			const rec = row;
			const name = typeof rec.name === "string" ? rec.name.slice(0, 80) : "";
			const amountPence = asInt(rec.amountPence);
			if (!name || amountPence < 0) return null;
			return {
				name,
				amountPence
			};
		}).filter((row) => row !== null).slice(0, 40);
	} catch {
		return [];
	}
}
function mapTx(row) {
	const source = row.source === "receipt" || row.source === "gallery" || row.source === "wallet" || row.source === "manual" ? row.source : "manual";
	return {
		id: row.id,
		merchant: row.merchant,
		amountPence: asInt(row.amount_pence),
		category: isCategory(row.category) ? row.category : "other",
		spentOn: String(row.spent_on).slice(0, 10),
		source,
		hasReceipt: asBool(row.has_receipt),
		note: row.note ?? "",
		items: asItems(row.items_json ?? "[]"),
		rawAlert: row.raw_alert ?? "",
		isSample: asBool(row.is_sample),
		createdAt: asString(row.created_at)
	};
}
function mapProfile(row) {
	const payday = row.payday == null ? null : asInt(row.payday);
	return {
		displayName: row.display_name ?? "",
		monthlyIncomePence: asInt(row.monthly_income_pence),
		city: row.city ?? "",
		payday: payday && payday >= 1 && payday <= 31 ? payday : null,
		onboarded: asBool(row.onboarded),
		notifyAlerts: asBool(row.notify_alerts)
	};
}
function mapAlert(row) {
	return {
		id: row.id,
		rawText: row.raw_text,
		merchant: row.merchant || "Card payment",
		amountPence: row.amount_pence == null ? null : asInt(row.amount_pence),
		category: isCategory(row.suggested_category) ? row.suggested_category : "other",
		confidence: Number(row.confidence) || 0,
		createdAt: asString(row.created_at)
	};
}
function readProfileInput(input) {
	if (!input || typeof input !== "object") throw new Error("Enter your details to continue.");
	const row = input;
	const displayName = typeof row.displayName === "string" ? row.displayName.trim().slice(0, 80) : "";
	const city = typeof row.city === "string" ? row.city.trim().slice(0, 80) : "";
	const monthlyIncomePence = asInt(row.monthlyIncomePence);
	let payday = null;
	if (row.payday != null && row.payday !== "") {
		payday = asInt(row.payday);
		if (payday < 1 || payday > 31) throw new Error("Payday should be a day of the month.");
	}
	if (!displayName) throw new Error("Add your name.");
	if (monthlyIncomePence <= 0) throw new Error("Add your monthly take-home pay.");
	return {
		displayName,
		monthlyIncomePence,
		city,
		payday,
		notifyAlerts: row.notifyAlerts === true
	};
}
var getProfile_createServerFn_handler = createServerRpc({
	id: "f9b3c72fc1df0d0e1b1ee3396fbda953bac09bab562d2dda47db0c41ff0fb6fe",
	name: "getProfile",
	filename: "src/server/ledger.ts"
}, (opts) => getProfile.__executeServer(opts));
var getProfile = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(getProfile_createServerFn_handler, async ({ context }) => {
	const rows = await (await getSql())`select display_name, monthly_income_pence, city, payday, onboarded, notify_alerts
       from profiles where user_id = ${context.userId}`;
	return rows[0] ? mapProfile(rows[0]) : null;
});
var saveProfile_createServerFn_handler = createServerRpc({
	id: "119829f651a7c0b3efce1b3930412ff7d2b969279b9d8048c8c79195f0f571bb",
	name: "saveProfile",
	filename: "src/server/ledger.ts"
}, (opts) => saveProfile.__executeServer(opts));
var saveProfile = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input) => readProfileInput(input)).handler(saveProfile_createServerFn_handler, async ({ context, data }) => {
	return mapProfile((await (await getSql())`insert into profiles (
         user_id, display_name, monthly_income_pence, city, payday, onboarded, notify_alerts
       ) values (
         ${context.userId}, ${data.displayName}, ${data.monthlyIncomePence}, ${data.city},
         ${data.payday}, true, ${data.notifyAlerts}
       )
       on conflict (user_id) do update set
         display_name = excluded.display_name,
         monthly_income_pence = excluded.monthly_income_pence,
         city = excluded.city,
         payday = excluded.payday,
         onboarded = true,
         notify_alerts = excluded.notify_alerts
       returning display_name, monthly_income_pence, city, payday, onboarded, notify_alerts`)[0]);
});
var listTransactions_createServerFn_handler = createServerRpc({
	id: "322765e22f7795e129b9b4c49552c244b3c875a7f88e56d4235c12454c0a83c4",
	name: "listTransactions",
	filename: "src/server/ledger.ts"
}, (opts) => listTransactions.__executeServer(opts));
var listTransactions = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(listTransactions_createServerFn_handler, async ({ context }) => {
	return (await (await getSql())`select id, merchant, amount_pence, category, spent_on, source, has_receipt, note,
              items_json, raw_alert, is_sample, created_at
       from transactions
       where user_id = ${context.userId}
       order by spent_on desc, created_at desc
       limit 500`).map(mapTx);
});
var listAlerts_createServerFn_handler = createServerRpc({
	id: "099cafc1a5e7b68ad8e025af8545aa64e38a5346a7d32ae36b6e8adce9fef06c",
	name: "listAlerts",
	filename: "src/server/ledger.ts"
}, (opts) => listAlerts.__executeServer(opts));
var listAlerts = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(listAlerts_createServerFn_handler, async ({ context }) => {
	return (await (await getSql())`select id, raw_text, merchant, amount_pence, suggested_category, confidence, created_at
       from wallet_alerts
       where user_id = ${context.userId} and status = 'pending'
       order by created_at desc
       limit 40`).map(mapAlert);
});
async function askModel(messages, maxTokens) {
	const apiKey = process.env.XAI_API_KEY;
	if (!apiKey) return null;
	for (let attempt = 0; attempt < 2; attempt++) try {
		const res = await fetch("https://api.x.ai/v1/chat/completions", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json"
			},
			signal: AbortSignal.timeout(45e3),
			body: JSON.stringify({
				model: "grok-4.5",
				temperature: 0,
				reasoning_effort: "low",
				max_tokens: maxTokens,
				messages
			})
		});
		if (!res.ok) {
			if (attempt === 0 && res.status >= 500) continue;
			return null;
		}
		const text = (await res.json()).choices?.[0]?.message?.content;
		if (text) return text;
	} catch {
		if (attempt === 0) continue;
		return null;
	}
	return null;
}
function parseModelJson(text) {
	const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
	const body = fenced ? fenced[1] : text;
	const start = body.indexOf("{");
	const end = body.lastIndexOf("}");
	if (start < 0 || end <= start) throw new Error("empty");
	return JSON.parse(body.slice(start, end + 1));
}
var CATEGORY_LIST = [
	"groceries",
	"household",
	"fashion",
	"entertainment",
	"dining",
	"transport",
	"health",
	"bills",
	"subscriptions",
	"personal",
	"travel",
	"gifts",
	"other"
].join(", ");
function moneyOf(value) {
	if (typeof value === "number" && Number.isFinite(value)) return poundsToPence(value.toFixed(2));
	if (typeof value === "string") return poundsToPence(value);
	return null;
}
function receiptDate(value) {
	if (typeof value !== "string") return null;
	const v = value.trim();
	if (validDate(v)) return v;
	const slash = v.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
	if (!slash) return null;
	const day = slash[1].padStart(2, "0");
	const month = slash[2].padStart(2, "0");
	const iso = `${slash[3].length === 2 ? `20${slash[3]}` : slash[3]}-${month}-${day}`;
	return validDate(iso) ? iso : null;
}
function lineName(name, qty) {
	const q = typeof qty === "number" || typeof qty === "string" ? String(qty).trim() : "";
	if (!q || q === "1" || q === "1.0" || q === "x1") return name;
	return `${q} × ${name}`.slice(0, 80);
}
var readReceipt_createServerFn_handler = createServerRpc({
	id: "8c11bf1f8d3b43465ca564ec1fe5cd3565add11f371ab11d1abc9ec1e045c7b4",
	name: "readReceipt",
	filename: "src/server/ledger.ts"
}, (opts) => readReceipt.__executeServer(opts));
var readReceipt = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input) => {
	if (!input || typeof input !== "object") throw new Error("Attach a photo first.");
	const image = input.imageDataUrl;
	if (typeof image !== "string" || !image.startsWith("data:image/")) throw new Error("That file isn’t a photo Pence can read.");
	if (image.length > 24e5) throw new Error("That photo is too large. Try another shot, closer in.");
	return { imageDataUrl: image };
}).handler(readReceipt_createServerFn_handler, async ({ data }) => {
	const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
	const empty = {
		merchant: "",
		amountPence: null,
		spentOn: null,
		category: "other",
		items: [],
		confidence: 0,
		note: "",
		isSpend: false
	};
	if (!process.env.XAI_API_KEY) throw new Error("Reading photos isn’t available right now. Type the shop and the total.");
	const text = await askModel([{
		role: "user",
		content: [{
			type: "text",
			text: `Read this photo for a spending app. It may be a till receipt, invoice, or card payment screenshot, in any currency. Reply with JSON only, no markdown:
{"isSpend":true,"merchant":"","total":"12.40","currency":"GBP","date":"YYYY-MM-DD","time":"","category":"groceries","payment":"","items":[{"name":"Milk","qty":"1","amount":"1.45"}],"confidence":0.9,"note":""}
Rules:
- items must list every product or service bought. Do not include subtotal, tax, VAT, discount, change, cash, or balance as items.
- amount and total are decimal money strings like 1.45, not whole pence. qty is the quantity, or "1" if it is not printed.
- category is one of: ${CATEGORY_LIST}. Use other if unsure.
- date is the date printed on the receipt, or null if there is none. Today is ${today}. Do not invent today's date.
- currency is GBP, NGN, USD, EUR, or OTHER.
- If this is not a purchase or a payment, set isSpend to false, confidence to 0, total to "", items to [], and note to one short sentence saying what the photo actually shows.`
		}, {
			type: "image_url",
			image_url: {
				url: data.imageDataUrl,
				detail: "high"
			}
		}]
	}], 2200);
	if (!text) throw new Error("Couldn’t read that photo. Type the shop and the total.");
	try {
		const parsed = parseModelJson(text);
		const isSpend = parsed.isSpend !== false;
		const merchant = typeof parsed.merchant === "string" ? parsed.merchant.trim().slice(0, 80) : "";
		let amountPence = moneyOf(parsed.total);
		const spentOn = receiptDate(parsed.date);
		const category = typeof parsed.category === "string" && isCategory(parsed.category) ? parsed.category : "other";
		const itemsRaw = Array.isArray(parsed.items) ? parsed.items : [];
		const items = [];
		for (const item of itemsRaw) {
			if (!item || typeof item !== "object") continue;
			const rec = item;
			const rawName = typeof rec.name === "string" ? rec.name.trim().slice(0, 80) : "";
			if (!rawName) continue;
			const lowered = rawName.toLowerCase();
			if (/^(sub\s?total|total|vat|tax|change|cash|balance|discount|amount due)$/.test(lowered)) continue;
			const amount = moneyOf(rec.amount);
			items.push({
				name: lineName(rawName, rec.qty),
				amountPence: amount ?? 0
			});
			if (items.length >= 40) break;
		}
		if ((amountPence == null || amountPence <= 0) && items.some((item) => item.amountPence > 0)) amountPence = items.reduce((sum, item) => sum + item.amountPence, 0);
		const currency = typeof parsed.currency === "string" ? parsed.currency.trim().toUpperCase() : "";
		const payment = typeof parsed.payment === "string" ? parsed.payment.trim().slice(0, 40) : "";
		const time = typeof parsed.time === "string" ? parsed.time.trim().slice(0, 8) : "";
		const modelNote = typeof parsed.note === "string" ? parsed.note.trim().slice(0, 180) : "";
		const bits = [];
		if (currency && currency !== "GBP") bits.push(`Printed in ${currency}, not pounds — check the total.`);
		if (payment) bits.push(payment);
		if (/^\d{1,2}:\d{2}/.test(time)) bits.push(time.slice(0, 5));
		if (modelNote) bits.push(modelNote);
		const note = bits.join(" · ").slice(0, 200);
		const confidence = typeof parsed.confidence === "number" ? Math.min(1, Math.max(0, parsed.confidence)) : .55;
		if (!isSpend) return {
			...empty,
			note: modelNote || "This photo doesn’t show a shop, a total, or items bought.",
			isSpend: false
		};
		return {
			merchant,
			amountPence: amountPence && amountPence > 0 ? amountPence : null,
			spentOn,
			category,
			items,
			confidence,
			note,
			isSpend: true
		};
	} catch {
		throw new Error("Couldn’t read that photo. Type the shop and the total.");
	}
});
async function refineAlert(raw, base) {
	if (base.confidence >= .72 && base.amountPence) return base;
	const text = await askModel([{
		role: "user",
		content: `This is a UK card, Google Pay, Apple Pay, or bank notification. Reply with JSON only:
{"merchant":"","total":"12.40","category":""}
category is one of: ${CATEGORY_LIST}. Use other if you cannot tell. total is pounds as a string.
Text: ${raw.slice(0, 800)}`
	}], 220);
	if (!text) return base;
	try {
		const parsed = parseModelJson(text);
		const merchant = typeof parsed.merchant === "string" && parsed.merchant.trim() ? parsed.merchant.trim().slice(0, 80) : base.merchant;
		const amount = typeof parsed.total === "string" || typeof parsed.total === "number" ? poundsToPence(String(parsed.total)) : null;
		const category = typeof parsed.category === "string" && isCategory(parsed.category) ? parsed.category : base.category;
		return {
			merchant,
			amountPence: amount && amount > 0 ? amount : base.amountPence,
			category,
			confidence: Math.max(base.confidence, category === "other" ? .5 : .8)
		};
	} catch {
		return base;
	}
}
var createAlert_createServerFn_handler = createServerRpc({
	id: "9ab25842a1c68c5c12dc48351e7e56f337b520e8caec5a7ea9b021827919b0bc",
	name: "createAlert",
	filename: "src/server/ledger.ts"
}, (opts) => createAlert.__executeServer(opts));
var createAlert = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input) => {
	if (!input || typeof input !== "object") throw new Error("Paste the payment alert.");
	const raw = input.rawText;
	if (typeof raw !== "string" || raw.trim().length < 3) throw new Error("Paste the payment alert.");
	return { rawText: raw.trim().slice(0, 800) };
}).handler(createAlert_createServerFn_handler, async ({ context, data }) => {
	const base = parseAlert(data.rawText);
	const parsed = await refineAlert(data.rawText, base);
	return mapAlert((await (await getSql())`insert into wallet_alerts (
         id, user_id, raw_text, merchant, amount_pence, suggested_category, confidence, status
       ) values (
         ${crypto.randomUUID()}, ${context.userId}, ${data.rawText}, ${parsed.merchant}, ${parsed.amountPence},
         ${parsed.category}, ${parsed.confidence}, 'pending'
       )
       returning id, raw_text, merchant, amount_pence, suggested_category, confidence, created_at`)[0]);
});
function readSpend(input, withImage) {
	if (!input || typeof input !== "object") throw new Error("That spend couldn’t be saved.");
	const row = input;
	const merchant = typeof row.merchant === "string" ? row.merchant.trim().slice(0, 80) : "";
	const amountPence = asInt(row.amountPence);
	const category = typeof row.category === "string" && isCategory(row.category) ? row.category : null;
	const spentOn = typeof row.spentOn === "string" ? row.spentOn : "";
	const sourceRaw = row.source;
	const source = sourceRaw === "receipt" || sourceRaw === "gallery" || sourceRaw === "wallet" || sourceRaw === "manual" ? sourceRaw : "manual";
	if (!merchant) throw new Error("Add the shop or payee.");
	if (amountPence <= 0) throw new Error("Add an amount greater than zero.");
	if (!category) throw new Error("Pick a category.");
	if (!validDate(spentOn)) throw new Error("That date doesn’t look right.");
	const note = typeof row.note === "string" ? row.note.trim().slice(0, 200) : "";
	const rawAlert = typeof row.rawAlert === "string" ? row.rawAlert.slice(0, 800) : "";
	const items = asItems(JSON.stringify(row.items ?? []));
	let imageDataUrl = null;
	if (withImage && typeof row.imageDataUrl === "string" && row.imageDataUrl.startsWith("data:image/")) imageDataUrl = row.imageDataUrl.length <= 15e5 ? row.imageDataUrl : null;
	const alertId = typeof row.alertId === "string" && row.alertId.length < 80 ? row.alertId : null;
	return {
		id: typeof row.id === "string" ? row.id : void 0,
		merchant,
		amountPence,
		category,
		spentOn,
		source,
		hasReceipt: row.hasReceipt === true || imageDataUrl != null,
		note,
		items,
		imageDataUrl,
		rawAlert,
		alertId
	};
}
async function closeAlert(sql, userId, alertId) {
	if (!alertId) return;
	await sql`update wallet_alerts set status = 'saved'
            where id = ${alertId} and user_id = ${userId}`;
}
var saveSpend_createServerFn_handler = createServerRpc({
	id: "8abc5c986f551de5f5bd541f8d9ccf3f04d6fd0161c9f0c4174d6cae69362b9b",
	name: "saveSpend",
	filename: "src/server/ledger.ts"
}, (opts) => saveSpend.__executeServer(opts));
var saveSpend = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input) => readSpend(input, true)).handler(saveSpend_createServerFn_handler, async ({ context, data }) => {
	const sql = await getSql();
	const rows = await sql`insert into transactions (
         id, user_id, merchant, amount_pence, category, spent_on, source, has_receipt,
         note, items_json, image_data, raw_alert, is_sample
       ) values (
         ${crypto.randomUUID()}, ${context.userId}, ${data.merchant}, ${data.amountPence}, ${data.category},
         ${data.spentOn}, ${data.source}, ${data.hasReceipt}, ${data.note},
         ${JSON.stringify(data.items)}, ${data.imageDataUrl}, ${data.rawAlert}, false
       )
       returning id, merchant, amount_pence, category, spent_on, source, has_receipt,
                 note, items_json, raw_alert, is_sample, created_at`;
	await closeAlert(sql, context.userId, data.alertId);
	return mapTx(rows[0]);
});
var updateSpend_createServerFn_handler = createServerRpc({
	id: "fd40add4083a4f21069134b36564dd0beeabd7ae0b29b09da01205133dbd6aa6",
	name: "updateSpend",
	filename: "src/server/ledger.ts"
}, (opts) => updateSpend.__executeServer(opts));
var updateSpend = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input) => {
	const spend = readSpend(input, false);
	if (!spend.id) throw new Error("Missing spend.");
	return spend;
}).handler(updateSpend_createServerFn_handler, async ({ context, data }) => {
	const rows = await (await getSql())`update transactions set
         merchant = ${data.merchant},
         amount_pence = ${data.amountPence},
         category = ${data.category},
         spent_on = ${data.spentOn},
         note = ${data.note},
         items_json = ${JSON.stringify(data.items)}
       where id = ${data.id} and user_id = ${context.userId}
       returning id, merchant, amount_pence, category, spent_on, source, has_receipt,
                 note, items_json, raw_alert, is_sample, created_at`;
	if (!rows[0]) throw new Error("That spend is no longer here.");
	return mapTx(rows[0]);
});
var deleteSpend_createServerFn_handler = createServerRpc({
	id: "9c934f5ecb285d5a9b6d4893065e662885ee56a44c81ad5260119a4688ffa3ef",
	name: "deleteSpend",
	filename: "src/server/ledger.ts"
}, (opts) => deleteSpend.__executeServer(opts));
var deleteSpend = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input) => {
	const id = input && typeof input === "object" ? input.id : null;
	if (typeof id !== "string" || !id) throw new Error("Missing spend.");
	return { id };
}).handler(deleteSpend_createServerFn_handler, async ({ context, data }) => {
	await (await getSql())`delete from transactions where id = ${data.id} and user_id = ${context.userId}`;
	return { ok: true };
});
var dismissAlert_createServerFn_handler = createServerRpc({
	id: "e56b950cbbcf93343aedcf56200702e6a0ef0d00cc97ebb492ecb3ea498906d2",
	name: "dismissAlert",
	filename: "src/server/ledger.ts"
}, (opts) => dismissAlert.__executeServer(opts));
var dismissAlert = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input) => {
	const id = input && typeof input === "object" ? input.id : null;
	if (typeof id !== "string" || !id) throw new Error("Missing alert.");
	return { id };
}).handler(dismissAlert_createServerFn_handler, async ({ context, data }) => {
	await (await getSql())`update wallet_alerts set status = 'dismissed'
              where id = ${data.id} and user_id = ${context.userId}`;
	return { ok: true };
});
var getReceipt_createServerFn_handler = createServerRpc({
	id: "fd7909567121f4d22dd0e0f5245591cebd4a37e76b6eaf4307387a6082dff596",
	name: "getReceipt",
	filename: "src/server/ledger.ts"
}, (opts) => getReceipt.__executeServer(opts));
var getReceipt = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input) => {
	const id = input && typeof input === "object" ? input.id : null;
	if (typeof id !== "string" || !id) throw new Error("Missing spend.");
	return { id };
}).handler(getReceipt_createServerFn_handler, async ({ context, data }) => {
	const image = (await (await getSql())`
      select image_data from transactions where id = ${data.id} and user_id = ${context.userId}`)[0]?.image_data ?? null;
	return { image: typeof image === "string" && image.startsWith("data:image/") ? image : null };
});
var SAMPLE_PREV = [
	{
		slug: "tesco-a",
		day: 2,
		merchant: "Tesco Extra",
		pounds: "86.40",
		category: "groceries",
		source: "receipt",
		receipt: true
	},
	{
		slug: "uber-a",
		day: 3,
		merchant: "Uber",
		pounds: "14.20",
		category: "transport",
		source: "wallet",
		receipt: false
	},
	{
		slug: "netflix",
		day: 5,
		merchant: "Netflix",
		pounds: "12.99",
		category: "subscriptions",
		source: "wallet",
		receipt: false
	},
	{
		slug: "spotify",
		day: 5,
		merchant: "Spotify",
		pounds: "11.99",
		category: "subscriptions",
		source: "wallet",
		receipt: false
	},
	{
		slug: "primark",
		day: 7,
		merchant: "Primark",
		pounds: "32.00",
		category: "fashion",
		source: "receipt",
		receipt: true
	},
	{
		slug: "boots",
		day: 8,
		merchant: "Boots",
		pounds: "14.50",
		category: "health",
		source: "receipt",
		receipt: true
	},
	{
		slug: "sains",
		day: 9,
		merchant: "Sainsbury's",
		pounds: "54.20",
		category: "groceries",
		source: "receipt",
		receipt: true
	},
	{
		slug: "nando",
		day: 11,
		merchant: "Nando's",
		pounds: "28.50",
		category: "dining",
		source: "wallet",
		receipt: false
	},
	{
		slug: "uber-b",
		day: 12,
		merchant: "Uber",
		pounds: "11.60",
		category: "transport",
		source: "wallet",
		receipt: false
	},
	{
		slug: "odeon",
		day: 13,
		merchant: "Odeon",
		pounds: "19.00",
		category: "entertainment",
		source: "wallet",
		receipt: false
	},
	{
		slug: "aldi",
		day: 16,
		merchant: "Aldi",
		pounds: "41.10",
		category: "groceries",
		source: "gallery",
		receipt: true
	},
	{
		slug: "deliveroo",
		day: 18,
		merchant: "Deliveroo",
		pounds: "24.80",
		category: "dining",
		source: "wallet",
		receipt: false
	},
	{
		slug: "ikea",
		day: 20,
		merchant: "IKEA",
		pounds: "22.40",
		category: "household",
		source: "receipt",
		receipt: true
	},
	{
		slug: "uber-c",
		day: 22,
		merchant: "Uber",
		pounds: "18.40",
		category: "transport",
		source: "wallet",
		receipt: false
	},
	{
		slug: "octopus",
		day: 24,
		merchant: "Octopus Energy",
		pounds: "68.00",
		category: "bills",
		source: "manual",
		receipt: false
	},
	{
		slug: "greggs",
		day: 26,
		merchant: "Greggs",
		pounds: "6.40",
		category: "dining",
		source: "wallet",
		receipt: false
	}
];
var SAMPLE_NOW = [
	{
		slug: "now-tesco",
		day: 1,
		merchant: "Tesco",
		pounds: "48.20",
		category: "groceries",
		source: "receipt",
		receipt: true
	},
	{
		slug: "now-uber",
		day: 2,
		merchant: "Uber",
		pounds: "16.80",
		category: "transport",
		source: "wallet",
		receipt: false
	},
	{
		slug: "now-greggs",
		day: 3,
		merchant: "Greggs",
		pounds: "7.10",
		category: "dining",
		source: "wallet",
		receipt: false
	},
	{
		slug: "now-netflix",
		day: 4,
		merchant: "Netflix",
		pounds: "12.99",
		category: "subscriptions",
		source: "wallet",
		receipt: false
	}
];
function isoOn(key, day) {
	const [y, m] = key.split("-").map(Number);
	const last = new Date(y, m, 0).getDate();
	return `${key}-${String(Math.min(day, last)).padStart(2, "0")}`;
}
var seedSamples_createServerFn_handler = createServerRpc({
	id: "a2c4fd0031ae367396c79026573ce9d6c89d5eb49a51213acc49c4845c2b8342",
	name: "seedSamples",
	filename: "src/server/ledger.ts"
}, (opts) => seedSamples.__executeServer(opts));
var seedSamples = createServerFn({ method: "POST" }).middleware([authMiddleware]).handler(seedSamples_createServerFn_handler, async ({ context }) => {
	const sql = await getSql();
	const today = /* @__PURE__ */ new Date();
	const current = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
	const prevDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
	const previous = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;
	const existing = await sql`
      select id from transactions where user_id = ${context.userId} and is_sample = true`;
	const have = new Set(existing.map((row) => row.id));
	const planned = [];
	for (const row of SAMPLE_PREV) planned.push({
		id: `sample_${context.userId}_${row.slug}`.slice(0, 140),
		spentOn: isoOn(previous, row.day),
		row
	});
	for (const row of SAMPLE_NOW) {
		if (row.day > today.getDate()) continue;
		planned.push({
			id: `sample_${context.userId}_${row.slug}`.slice(0, 140),
			spentOn: isoOn(current, row.day),
			row
		});
	}
	let added = 0;
	for (const item of planned) {
		if (have.has(item.id)) continue;
		const amount = poundsToPence(item.row.pounds) ?? 0;
		const note = item.row.receipt ? "" : "Sample wallet alert — no paper receipt";
		await sql`insert into transactions (
        id, user_id, merchant, amount_pence, category, spent_on, source, has_receipt,
        note, items_json, raw_alert, is_sample
      ) values (
        ${item.id}, ${context.userId}, ${item.row.merchant}, ${amount}, ${item.row.category},
        ${item.spentOn}, ${item.row.source}, ${item.row.receipt}, ${note}, '[]', '', true
      )`;
		added += 1;
	}
	return { added };
});
var clearSamples_createServerFn_handler = createServerRpc({
	id: "fb8ce92e68933d16545fa8dc8902a6f7b3750763b41a0fbb8954d1204e87eff5",
	name: "clearSamples",
	filename: "src/server/ledger.ts"
}, (opts) => clearSamples.__executeServer(opts));
var clearSamples = createServerFn({ method: "POST" }).middleware([authMiddleware]).handler(clearSamples_createServerFn_handler, async ({ context }) => {
	return { removed: (await (await getSql())`
      delete from transactions where user_id = ${context.userId} and is_sample = true returning id`).length };
});
var getAdvice_createServerFn_handler = createServerRpc({
	id: "2e00708de921cebde08db93dbc7ff01dadcb01484281afc792ad5c1b2389c9b8",
	name: "getAdvice",
	filename: "src/server/ledger.ts"
}, (opts) => getAdvice.__executeServer(opts));
var getAdvice = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input) => {
	if (!input || typeof input !== "object") throw new Error("Nothing to review yet.");
	const row = input;
	const fingerprint = typeof row.fingerprint === "string" ? row.fingerprint.slice(0, 300) : "";
	const brief = typeof row.brief === "string" ? row.brief.slice(0, 2500) : "";
	if (!fingerprint || !brief) throw new Error("Nothing to review yet.");
	return {
		fingerprint,
		brief
	};
}).handler(getAdvice_createServerFn_handler, async ({ context, data }) => {
	const sql = await getSql();
	const cached = await sql`
      select body from advice_cache
      where user_id = ${context.userId} and fingerprint = ${data.fingerprint}`;
	if (cached[0]?.body) try {
		const tips = JSON.parse(cached[0].body);
		if (Array.isArray(tips) && tips.every((t) => typeof t === "string")) return {
			tips: tips.slice(0, 4),
			source: "cache"
		};
	} catch {}
	const text = await askModel([{
		role: "user",
		content: `You are Pence, a UK spending coach. Use only the figures below. Do not invent discount codes, prices, or "this week's" deals. You may name ongoing programmes: Tesco Clubcard Prices, Nectar Prices, Lidl Plus, Aldi Super 6, Too Good To Go, Boots Advantage Card. Reply with JSON only: {"tips":["...","...","..."]}
Each tip is one or two sentences, specific to these numbers, British spelling, no emoji.
${data.brief}`
	}], 420);
	if (!text) return {
		tips: [],
		source: "unavailable"
	};
	try {
		const parsed = parseModelJson(text);
		const tips = Array.isArray(parsed.tips) ? parsed.tips.filter((t) => typeof t === "string" && t.trim().length > 0).slice(0, 4) : [];
		if (tips.length === 0) return {
			tips: [],
			source: "unavailable"
		};
		await sql`insert into advice_cache (user_id, fingerprint, body)
                values (${context.userId}, ${data.fingerprint}, ${JSON.stringify(tips)})
                on conflict (user_id, fingerprint) do update set body = excluded.body, created_at = now()`;
		return {
			tips,
			source: "fresh"
		};
	} catch {
		return {
			tips: [],
			source: "unavailable"
		};
	}
});
//#endregion
export { clearSamples_createServerFn_handler, createAlert_createServerFn_handler, deleteSpend_createServerFn_handler, dismissAlert_createServerFn_handler, getAdvice_createServerFn_handler, getProfile_createServerFn_handler, getReceipt_createServerFn_handler, listAlerts_createServerFn_handler, listTransactions_createServerFn_handler, readReceipt_createServerFn_handler, saveProfile_createServerFn_handler, saveSpend_createServerFn_handler, seedSamples_createServerFn_handler, updateSpend_createServerFn_handler };
