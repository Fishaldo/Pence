import { i as require_jsx_runtime, r as useQueryClient, t as useQuery } from "../_libs/react+tanstack__react-query.mjs";
import { m as useRouterState, x as Link } from "../_libs/@tanstack/react-router+[...].mjs";
import { a as getServerFnById, i as TSS_SERVER_FUNCTION, r as createServerFn } from "./ssr.mjs";
import { b as validDate, c as isCategory, n as authMiddleware, o as formatGBP } from "./middleware-7TFDpBfn.mjs";
import { t as authClient } from "./client-1vAx-gM_.mjs";
import { i as Plus, l as Bell, o as House, r as Settings, s as ChartPie, t as Wallet } from "../_libs/lucide-react.mjs";
import { t as clsx } from "../_libs/clsx.mjs";
import { t as twMerge } from "../_libs/tailwind-merge.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/use-current-user-BQ4guYPZ.js
var import_jsx_runtime = require_jsx_runtime();
var createSsrRpc = (functionId) => {
	const url = "/_serverFn/" + functionId;
	const serverFnMeta = { id: functionId };
	const fn = async (...args) => {
		return (await getServerFnById(functionId, { origin: "server" }))(...args);
	};
	return Object.assign(fn, {
		url,
		serverFnMeta,
		[TSS_SERVER_FUNCTION]: true
	});
};
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
var getProfile = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(createSsrRpc("f9b3c72fc1df0d0e1b1ee3396fbda953bac09bab562d2dda47db0c41ff0fb6fe"));
var saveProfile = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input) => readProfileInput(input)).handler(createSsrRpc("119829f651a7c0b3efce1b3930412ff7d2b969279b9d8048c8c79195f0f571bb"));
var listTransactions = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(createSsrRpc("322765e22f7795e129b9b4c49552c244b3c875a7f88e56d4235c12454c0a83c4"));
var listAlerts = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(createSsrRpc("099cafc1a5e7b68ad8e025af8545aa64e38a5346a7d32ae36b6e8adce9fef06c"));
var readReceipt = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input) => {
	if (!input || typeof input !== "object") throw new Error("Attach a photo first.");
	const image = input.imageDataUrl;
	if (typeof image !== "string" || !image.startsWith("data:image/")) throw new Error("That file isn’t a photo Pence can read.");
	if (image.length > 24e5) throw new Error("That photo is too large. Try another shot, closer in.");
	return { imageDataUrl: image };
}).handler(createSsrRpc("8c11bf1f8d3b43465ca564ec1fe5cd3565add11f371ab11d1abc9ec1e045c7b4"));
var createAlert = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input) => {
	if (!input || typeof input !== "object") throw new Error("Paste the payment alert.");
	const raw = input.rawText;
	if (typeof raw !== "string" || raw.trim().length < 3) throw new Error("Paste the payment alert.");
	return { rawText: raw.trim().slice(0, 800) };
}).handler(createSsrRpc("9ab25842a1c68c5c12dc48351e7e56f337b520e8caec5a7ea9b021827919b0bc"));
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
var saveSpend = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input) => readSpend(input, true)).handler(createSsrRpc("8abc5c986f551de5f5bd541f8d9ccf3f04d6fd0161c9f0c4174d6cae69362b9b"));
var updateSpend = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input) => {
	const spend = readSpend(input, false);
	if (!spend.id) throw new Error("Missing spend.");
	return spend;
}).handler(createSsrRpc("fd40add4083a4f21069134b36564dd0beeabd7ae0b29b09da01205133dbd6aa6"));
var deleteSpend = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input) => {
	const id = input && typeof input === "object" ? input.id : null;
	if (typeof id !== "string" || !id) throw new Error("Missing spend.");
	return { id };
}).handler(createSsrRpc("9c934f5ecb285d5a9b6d4893065e662885ee56a44c81ad5260119a4688ffa3ef"));
var dismissAlert = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input) => {
	const id = input && typeof input === "object" ? input.id : null;
	if (typeof id !== "string" || !id) throw new Error("Missing alert.");
	return { id };
}).handler(createSsrRpc("e56b950cbbcf93343aedcf56200702e6a0ef0d00cc97ebb492ecb3ea498906d2"));
var getReceipt = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator((input) => {
	const id = input && typeof input === "object" ? input.id : null;
	if (typeof id !== "string" || !id) throw new Error("Missing spend.");
	return { id };
}).handler(createSsrRpc("fd7909567121f4d22dd0e0f5245591cebd4a37e76b6eaf4307387a6082dff596"));
var seedSamples = createServerFn({ method: "POST" }).middleware([authMiddleware]).handler(createSsrRpc("a2c4fd0031ae367396c79026573ce9d6c89d5eb49a51213acc49c4845c2b8342"));
var clearSamples = createServerFn({ method: "POST" }).middleware([authMiddleware]).handler(createSsrRpc("fb8ce92e68933d16545fa8dc8902a6f7b3750763b41a0fbb8954d1204e87eff5"));
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
}).handler(createSsrRpc("2e00708de921cebde08db93dbc7ff01dadcb01484281afc792ad5c1b2389c9b8"));
function useLedger() {
	return {
		profile: useQuery({
			queryKey: ["profile"],
			queryFn: () => getProfile()
		}),
		txs: useQuery({
			queryKey: ["txs"],
			queryFn: () => listTransactions()
		}),
		alerts: useQuery({
			queryKey: ["alerts"],
			queryFn: () => listAlerts()
		})
	};
}
function useRefreshLedger() {
	const client = useQueryClient();
	return async () => {
		await client.invalidateQueries({ queryKey: ["profile"] });
		await client.invalidateQueries({ queryKey: ["txs"] });
		await client.invalidateQueries({ queryKey: ["alerts"] });
	};
}
function cn(...inputs) {
	return twMerge(clsx(inputs));
}
function Mark({ className }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
		className: cn("grid size-11 place-items-center rounded-lg bg-forest font-display text-2xl text-foam", className),
		"aria-hidden": "true",
		children: "p"
	});
}
function BootScreen() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("main", {
		className: "grid min-h-dvh place-items-center bg-paper px-6 text-ink",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex flex-col items-center gap-4 text-center",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Mark, {}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "font-display text-4xl",
				children: "Pence"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-1 text-sm text-muted",
				children: "See where it went."
			})] })]
		})
	});
}
function Money({ pence, className }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
		className: cn("tabular-nums", className),
		children: formatGBP(pence)
	});
}
function errorText(error, fallback) {
	if (error instanceof Error && error.message) return error.message;
	return fallback;
}
var NAV = [
	{
		to: "/",
		label: "Home",
		icon: House
	},
	{
		to: "/activity",
		label: "Activity",
		icon: Wallet
	},
	{
		to: "/capture",
		label: "Add",
		icon: Plus
	},
	{
		to: "/insights",
		label: "Insights",
		icon: ChartPie
	},
	{
		to: "/alerts",
		label: "Alerts",
		icon: Bell
	}
];
function Shell({ children }) {
	const path = useRouterState({ select: (s) => s.location.pathname });
	const { alerts, profile } = useLedger();
	const count = alerts.data?.length ?? 0;
	const income = profile.data?.monthlyIncomePence ?? 0;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "min-h-dvh bg-paper text-ink",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mx-auto flex min-h-dvh max-w-6xl",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("aside", {
				className: "sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line bg-card px-4 py-6 md:flex",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
						to: "/",
						className: "flex items-center gap-3 px-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Mark, { className: "size-10 text-xl" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "font-display text-2xl",
							children: "Pence"
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("nav", {
						className: "mt-8 flex flex-1 flex-col gap-1",
						"aria-label": "Primary",
						children: NAV.map((item) => {
							const active = path === item.to;
							const Icon = item.icon;
							return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
								to: item.to,
								className: cn("flex h-11 items-center gap-3 rounded-md px-3 text-sm", active ? "bg-mist font-medium text-forest-deep" : "text-ink hover:bg-sand"),
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, {
										className: "size-4",
										strokeWidth: 1.75
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "flex-1",
										children: item.label
									}),
									item.to === "/alerts" && count > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										className: "grid min-w-5 place-items-center rounded-full bg-clay px-1.5 text-xs text-foam tabular-nums",
										children: count
									}) : null
								]
							}, item.to);
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
						to: "/settings",
						className: "mt-4 flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted hover:bg-sand hover:text-ink",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Settings, {
							className: "size-4",
							strokeWidth: 1.75
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: ["Take-home", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "mt-0.5 block font-medium text-ink tabular-nums",
							children: income > 0 ? `${formatGBP(income)} / mo` : "Add pay"
						})] })]
					})
				]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "min-w-0 flex-1",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("main", {
					className: "mx-auto w-full max-w-3xl px-4 pt-6 pb-28 md:px-8 md:pb-12",
					children
				})
			})]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("nav", {
			className: "fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/95 backdrop-blur md:hidden",
			"aria-label": "Primary",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
				className: "mx-auto grid max-w-lg grid-cols-5 px-1 pt-1 pb-[max(0.4rem,env(safe-area-inset-bottom))]",
				children: NAV.map((item) => {
					const active = path === item.to;
					const Icon = item.icon;
					const add = item.to === "/capture";
					return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", {
						className: "flex justify-center",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
							to: item.to,
							className: cn("flex min-h-12 min-w-12 flex-col items-center justify-center gap-0.5 text-[11px]", add && "-mt-5", active ? "text-forest" : "text-muted"),
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: cn("relative grid place-items-center", add ? "size-14 rounded-full bg-forest text-foam" : "size-6"),
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, {
									className: add ? "size-6" : "size-5",
									strokeWidth: 1.75
								}), item.to === "/alerts" && count > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "absolute -top-1 -right-2 grid min-w-4 place-items-center rounded-full bg-clay px-1 text-[10px] text-foam tabular-nums",
									children: count
								}) : null]
							}), add ? null : item.label]
						})
					}, item.to);
				})
			})
		})]
	});
}
function PageHead({ kicker, title, action }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
		className: "mb-6 flex items-end justify-between gap-4",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [kicker ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "text-xs tracking-[0.16em] text-muted uppercase",
			children: kicker
		}) : null, /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
			className: "font-display text-4xl leading-none",
			children: title
		})] }), action]
	});
}
/**
* Current user + loading state. Same behavior in live preview and when deployed:
*   - Auth enabled -> the real signed-in user; `user` is `null` while
*                            the session resolves (`isPending: true`) and when
*                            signed out (`isPending: false`). Session comes from
*                            Better Auth `useSession()` → `/api/auth/get-session`
*                            (cookie when deployed; bearer in live preview).
*   - Auth disabled (`VITE_AUTH_ENABLED=false`) -> `DEV_USER`, never pending.
*
* Protect a route by waiting out `isPending` before acting on `user` —
* redirecting on `user: null` alone bounces signed-in visitors to sign-in on
* every hard reload:
*
*   import { RedirectToSignIn } from "@/lib/auth/gates";
*   const { user, isPending } = useCurrentUserState();
*   if (isPending) return null;              // still resolving — don't redirect yet
*   if (!user) return <RedirectToSignIn />;  // definitely signed out
*
* `authEnabled` is a module-level constant fixed at load, so the guarded hook
* call keeps a stable hook order across every render of a given component.
*/
function useCurrentUserState() {
	const { data, isPending } = authClient.useSession();
	const user = data?.user;
	return {
		user: user ? {
			id: user.id,
			displayName: user.name ?? null,
			primaryEmail: user.email ?? null,
			profileImageUrl: user.image ?? null,
			isDevFallback: false
		} : null,
		isPending
	};
}
/**
* Convenience view of `useCurrentUserState().user` for display (e.g.
* `user?.displayName ?? "Guest"`). NOTE: `null` means *loading OR signed out* —
* for redirects/guards use `useCurrentUserState()` and check `isPending`.
*/
function useCurrentUser() {
	return useCurrentUserState().user;
}
//#endregion
export { useRefreshLedger as S, seedSamples as _, Shell as a, useCurrentUserState as b, deleteSpend as c, getAdvice as d, getProfile as f, saveSpend as g, saveProfile as h, PageHead as i, dismissAlert as l, readReceipt as m, Mark as n, clearSamples as o, getReceipt as p, Money as r, createAlert as s, BootScreen as t, errorText as u, updateSpend as v, useLedger as x, useCurrentUser as y };
