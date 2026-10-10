import { o as __toESM } from "../_runtime.mjs";
import { a as require_react, i as require_jsx_runtime } from "../_libs/react+tanstack__react-query.mjs";
import { a as dayLabel, i as categoryLabel, l as monthKey, m as poundsToPence, o as formatGBP, t as CATEGORIES, u as monthLabel } from "./middleware-7TFDpBfn.mjs";
import { S as useRefreshLedger, a as Shell, c as deleteSpend, i as PageHead, p as getReceipt, u as errorText, v as updateSpend, x as useLedger } from "./use-current-user-BQ4guYPZ.mjs";
import { t as RequireUser } from "./gate-BnE7JtP4.mjs";
import { n as toast } from "../_libs/sonner.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/activity-BQqigY0X.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function ActivityView() {
	const { txs } = useLedger();
	const [category, setCategory] = (0, import_react.useState)("all");
	const [month, setMonth] = (0, import_react.useState)("all");
	const [editing, setEditing] = (0, import_react.useState)(null);
	const rows = txs.data ?? [];
	const months = (0, import_react.useMemo)(() => {
		const keys = /* @__PURE__ */ new Set();
		for (const row of rows) keys.add(row.spentOn.slice(0, 7));
		keys.add(monthKey(/* @__PURE__ */ new Date()));
		return [...keys].sort().reverse();
	}, [rows]);
	const filtered = rows.filter((row) => {
		if (category !== "all" && row.category !== category) return false;
		if (month !== "all" && !row.spentOn.startsWith(month)) return false;
		return true;
	});
	const groups = [];
	for (const row of filtered) {
		const label = dayLabel(row.spentOn);
		const last = groups[groups.length - 1];
		if (last && last.label === label) last.items.push(row);
		else groups.push({
			label,
			items: [row]
		});
	}
	if (txs.isPending) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "h-64 animate-pulse rounded-lg bg-sand" });
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PageHead, {
			kicker: "Ledger",
			title: "Activity"
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mb-4 flex gap-2 overflow-x-auto pb-1",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Filter, {
				on: category === "all",
				onClick: () => setCategory("all"),
				children: "All"
			}), CATEGORIES.filter((item) => rows.some((row) => row.category === item.id)).map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Filter, {
				on: category === item.id,
				onClick: () => setCategory(item.id),
				children: item.label
			}, item.id))]
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
			className: "mb-4 block",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "field-label",
				children: "Month"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
				className: "control",
				value: month,
				onChange: (e) => setMonth(e.target.value),
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
					value: "all",
					children: "Every month"
				}), months.map((key) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
					value: key,
					children: monthLabel(key)
				}, key))]
			})]
		}),
		filtered.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "panel px-4 py-8 text-center text-sm text-muted",
			children: "No spends in this view yet."
		}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "space-y-5",
			children: groups.map((group) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
				className: "mb-2 text-sm text-muted",
				children: group.label
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
				className: "panel divide-y divide-line",
				children: group.items.map((tx) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					type: "button",
					className: "flex w-full items-center justify-between gap-3 px-4 py-3 text-left",
					onClick: () => setEditing(tx),
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: "min-w-0",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "block truncate font-medium",
							children: tx.merchant
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
							className: "block text-sm text-muted",
							children: [
								categoryLabel(tx.category),
								tx.source === "wallet" && !tx.hasReceipt ? " · wallet, no receipt" : "",
								tx.hasReceipt ? " · receipt" : "",
								tx.isSample ? " · sample" : ""
							]
						})]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "tabular-nums",
						children: formatGBP(tx.amountPence)
					})]
				}) }, tx.id))
			})] }, group.label))
		}),
		editing ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SpendDialog, {
			tx: editing,
			onClose: () => setEditing(null)
		}) : null
	] });
}
function Filter({ on, onClick, children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
		type: "button",
		onClick,
		className: `h-10 shrink-0 rounded-full px-3 text-sm ${on ? "bg-forest text-foam" : "border border-line bg-card text-ink"}`,
		children
	});
}
function SpendDialog({ tx, onClose }) {
	const refresh = useRefreshLedger();
	const [merchant, setMerchant] = (0, import_react.useState)(tx.merchant);
	const [amount, setAmount] = (0, import_react.useState)((tx.amountPence / 100).toFixed(2));
	const [category, setCategory] = (0, import_react.useState)(tx.category);
	const [spentOn, setSpentOn] = (0, import_react.useState)(tx.spentOn);
	const [note, setNote] = (0, import_react.useState)(tx.note);
	const [error, setError] = (0, import_react.useState)("");
	const [busy, setBusy] = (0, import_react.useState)(false);
	const [image, setImage] = (0, import_react.useState)(null);
	async function showReceipt() {
		setBusy(true);
		try {
			const result = await getReceipt({ data: { id: tx.id } });
			setImage(result.image);
			if (!result.image) setError("The photo wasn’t kept for this spend.");
		} catch (err) {
			setError(errorText(err, "Couldn’t open the receipt."));
		} finally {
			setBusy(false);
		}
	}
	async function save() {
		const amountPence = poundsToPence(amount);
		if (!amountPence) {
			setError("Enter an amount like 12.40.");
			return;
		}
		setBusy(true);
		setError("");
		try {
			await updateSpend({ data: {
				id: tx.id,
				merchant,
				amountPence,
				category,
				spentOn,
				source: tx.source,
				hasReceipt: tx.hasReceipt,
				note,
				items: tx.items,
				rawAlert: tx.rawAlert,
				alertId: null
			} });
			await refresh();
			toast("Spend updated");
			onClose();
		} catch (err) {
			setError(errorText(err, "Couldn’t update that."));
			setBusy(false);
		}
	}
	async function remove() {
		setBusy(true);
		try {
			await deleteSpend({ data: { id: tx.id } });
			await refresh();
			toast("Spend removed");
			onClose();
		} catch (err) {
			setError(errorText(err, "Couldn’t remove that."));
			setBusy(false);
		}
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "fixed inset-0 z-40 flex items-end justify-center bg-ink/40 p-3 md:items-center",
		role: "presentation",
		onClick: onClose,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			role: "dialog",
			"aria-modal": "true",
			"aria-labelledby": "spend-title",
			className: "panel max-h-[90dvh] w-full max-w-md overflow-y-auto p-5",
			onClick: (event) => event.stopPropagation(),
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					id: "spend-title",
					className: "font-display text-3xl",
					children: "Edit spend"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-4 space-y-3",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
							className: "field",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "field-label",
								children: "Amount (£)"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								className: "control tabular-nums",
								inputMode: "decimal",
								value: amount,
								onChange: (e) => setAmount(e.target.value)
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
							className: "field",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "field-label",
								children: "Shop or payee"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								className: "control",
								value: merchant,
								onChange: (e) => setMerchant(e.target.value)
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
							className: "field",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "field-label",
								children: "Category"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", {
								className: "control",
								value: category,
								onChange: (e) => setCategory(e.target.value),
								children: CATEGORIES.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
									value: item.id,
									children: item.label
								}, item.id))
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
							className: "field",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "field-label",
								children: "Date"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								className: "control",
								type: "date",
								value: spentOn,
								onChange: (e) => setSpentOn(e.target.value)
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
							className: "field",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "field-label",
								children: "Note"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								className: "control",
								value: note,
								onChange: (e) => setNote(e.target.value)
							})]
						}),
						tx.items.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
							className: "text-sm text-muted",
							children: tx.items.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
								className: "flex justify-between gap-3 py-1",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "truncate",
									children: item.name
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "tabular-nums",
									children: formatGBP(item.amountPence)
								})]
							}, item.name))
						}) : null,
						tx.hasReceipt ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							className: "text-sm font-medium text-forest",
							onClick: showReceipt,
							disabled: busy,
							children: "View receipt photo"
						}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-sm text-muted",
							children: "No receipt attached."
						}),
						image ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
							src: image,
							alt: "Receipt",
							className: "max-h-64 w-full rounded-md object-contain"
						}) : null,
						error ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-sm text-clay",
							children: error
						}) : null
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-4 flex flex-col gap-2",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							className: "btn btn-primary",
							onClick: save,
							disabled: busy,
							children: "Save changes"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							className: "btn btn-quiet",
							onClick: remove,
							disabled: busy,
							children: "Delete spend"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							className: "btn btn-quiet",
							onClick: onClose,
							children: "Close"
						})
					]
				})
			]
		})
	});
}
function ActivityPage() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RequireUser, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Shell, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ActivityView, {}) }) });
}
//#endregion
export { ActivityPage as component };
