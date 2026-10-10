import { o as __toESM } from "../_runtime.mjs";
import { a as require_react, i as require_jsx_runtime } from "../_libs/react+tanstack__react-query.mjs";
import { C as useNavigate } from "../_libs/@tanstack/react-router+[...].mjs";
import { i as categoryLabel, o as formatGBP } from "./middleware-7TFDpBfn.mjs";
import { S as useRefreshLedger, a as Shell, i as PageHead, l as dismissAlert, u as errorText, x as useLedger } from "./use-current-user-BQ4guYPZ.mjs";
import { t as RequireUser } from "./gate-BnE7JtP4.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/alerts-Ns37Eofz.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function AlertsView() {
	const { alerts } = useLedger();
	const refresh = useRefreshLedger();
	const navigate = useNavigate();
	const [error, setError] = (0, import_react.useState)("");
	async function dismiss(id) {
		setError("");
		try {
			await dismissAlert({ data: { id } });
			await refresh();
		} catch (err) {
			setError(errorText(err, "Couldn’t dismiss that."));
		}
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PageHead, {
			kicker: "Wallet",
			title: "Alerts"
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "mb-4 text-sm text-muted",
			children: "A website can’t read Google Pay, Apple Pay, or your bank. Paste the notification from Add, and it waits here until you say whether there’s a receipt. Uber rides and other card taps with no paper slip belong in this list."
		}),
		alerts.isPending ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "h-32 animate-pulse rounded-lg bg-sand" }) : null,
		!alerts.isPending && (alerts.data?.length ?? 0) === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "panel p-5",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					className: "font-display text-3xl",
					children: "No alerts waiting"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-2 text-sm text-muted",
					children: "When you paste a payment notification, Pence asks if you have a receipt before filing it."
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: "btn btn-primary mt-4",
					onClick: () => void navigate({ to: "/capture" }),
					children: "Paste a payment alert"
				})
			]
		}) : null,
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
			className: "space-y-3",
			children: (alerts.data ?? []).map((alert) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
				className: "panel p-4",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "font-medium",
						children: alert.merchant
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "tabular-nums",
						children: [alert.amountPence != null ? formatGBP(alert.amountPence) : "Amount missing", /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
							className: "text-muted",
							children: [" · ", categoryLabel(alert.category)]
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-1 text-sm text-muted",
						children: alert.rawText
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mt-3 flex flex-col gap-2 sm:flex-row",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							className: "btn btn-primary sm:w-auto",
							onClick: () => {
								sessionStorage.setItem("pence-open-alert", alert.id);
								navigate({ to: "/capture" });
							},
							children: "Do you have a receipt?"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							className: "btn btn-quiet sm:w-auto",
							onClick: () => void dismiss(alert.id),
							children: "Dismiss"
						})]
					})
				]
			}, alert.id))
		}),
		error ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "mt-3 text-sm text-clay",
			children: error
		}) : null
	] });
}
function AlertsPage() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RequireUser, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Shell, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AlertsView, {}) }) });
}
//#endregion
export { AlertsPage as component };
