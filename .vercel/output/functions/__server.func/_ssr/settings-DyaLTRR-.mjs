import { o as __toESM } from "../_runtime.mjs";
import { a as require_react, i as require_jsx_runtime } from "../_libs/react+tanstack__react-query.mjs";
import { m as poundsToPence } from "./middleware-7TFDpBfn.mjs";
import { S as useRefreshLedger, a as Shell, h as saveProfile, i as PageHead, o as clearSamples, u as errorText, x as useLedger } from "./use-current-user-BQ4guYPZ.mjs";
import { n as UserButton, t as RequireUser } from "./gate-BnE7JtP4.mjs";
import { n as toast } from "../_libs/sonner.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/settings-DyaLTRR-.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function SettingsView() {
	const { profile, txs } = useLedger();
	const refresh = useRefreshLedger();
	const data = profile.data;
	const [name, setName] = (0, import_react.useState)(data?.displayName ?? "");
	const [income, setIncome] = (0, import_react.useState)(data ? (data.monthlyIncomePence / 100).toFixed(2) : "");
	const [city, setCity] = (0, import_react.useState)(data?.city ?? "");
	const [payday, setPayday] = (0, import_react.useState)(data?.payday ? String(data.payday) : "");
	const [notify, setNotify] = (0, import_react.useState)(data?.notifyAlerts ?? false);
	const [error, setError] = (0, import_react.useState)("");
	const [busy, setBusy] = (0, import_react.useState)(false);
	const samples = (txs.data ?? []).some((row) => row.isSample);
	if (!data) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "h-40 animate-pulse rounded-lg bg-sand" });
	async function save(event) {
		event.preventDefault();
		const monthlyIncomePence = poundsToPence(income);
		if (!monthlyIncomePence) {
			setError("Enter take-home like 2400 or 2400.50.");
			return;
		}
		setBusy(true);
		setError("");
		try {
			await saveProfile({ data: {
				displayName: name.trim(),
				monthlyIncomePence,
				city: city.trim(),
				payday: payday ? Number(payday) : null,
				notifyAlerts: notify
			} });
			await refresh();
			toast("Details saved");
		} catch (err) {
			setError(errorText(err, "Couldn’t save that."));
		} finally {
			setBusy(false);
		}
	}
	async function onNotify(next) {
		if (next && typeof Notification !== "undefined") {
			if (await Notification.requestPermission() !== "granted") {
				setError("Notifications stay off until this browser allows them.");
				setNotify(false);
				return;
			}
		}
		if (next && typeof Notification === "undefined") {
			setError("This browser can’t show notifications.");
			return;
		}
		setNotify(next);
		setError("");
	}
	async function clear() {
		setBusy(true);
		try {
			const result = await clearSamples();
			await refresh();
			toast(result.removed > 0 ? "Sample spends removed" : "No sample spends to remove");
		} catch (err) {
			setError(errorText(err, "Couldn’t clear the samples."));
		} finally {
			setBusy(false);
		}
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PageHead, {
			kicker: "Account",
			title: "Settings"
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
			onSubmit: save,
			className: "flex flex-col gap-4",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
					className: "field",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "field-label",
						children: "Name"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
						className: "control",
						value: name,
						onChange: (e) => setName(e.target.value)
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
					className: "field",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "field-label",
						children: "Monthly take-home (£)"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
						className: "control tabular-nums",
						inputMode: "decimal",
						value: income,
						onChange: (e) => setIncome(e.target.value)
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
					className: "field",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "field-label",
						children: "City"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
						className: "control",
						value: city,
						onChange: (e) => setCity(e.target.value)
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
					className: "field",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "field-label",
						children: "Payday"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
						className: "control",
						value: payday,
						onChange: (e) => setPayday(e.target.value),
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
							value: "",
							children: "Not set"
						}), Array.from({ length: 31 }, (_, i) => i + 1).map((day) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
							value: day,
							children: day
						}, day))]
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
					className: "panel flex items-start gap-3 p-4",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
						type: "checkbox",
						className: "mt-1 size-4",
						checked: notify,
						onChange: (event) => void onNotify(event.target.checked)
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "block font-medium",
						children: "Ask about receipts"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "mt-1 block text-sm text-muted",
						children: "When a pasted payment alert is waiting, this device can notify you to add a receipt. It still can’t watch Google Pay or Apple Pay on its own."
					})] })]
				}),
				error ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-sm text-clay",
					children: error
				}) : null,
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					className: "btn btn-primary",
					type: "submit",
					disabled: busy,
					children: busy ? "Saving…" : "Save details"
				})
			]
		}),
		samples ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
			type: "button",
			className: "btn btn-quiet mt-3",
			onClick: () => void clear(),
			disabled: busy,
			children: "Remove sample spends"
		}) : null,
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "panel mt-6 p-4",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(UserButton, {})
		})
	] });
}
function SettingsPage() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RequireUser, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Shell, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SettingsView, {}) }) });
}
//#endregion
export { SettingsPage as component };
