import { o as __toESM } from "../_runtime.mjs";
import { a as require_react, i as require_jsx_runtime } from "../_libs/react+tanstack__react-query.mjs";
import { x as Link } from "../_libs/@tanstack/react-router+[...].mjs";
import { _ as shiftMonth, d as monthProgress, f as monthShort, g as projectedSpend, i as categoryLabel, l as monthKey, o as formatGBP, s as formatPercent, v as summarize } from "./middleware-7TFDpBfn.mjs";
import { r as Settings } from "../_libs/lucide-react.mjs";
import { S as useRefreshLedger, _ as seedSamples, a as Shell, i as PageHead, r as Money, u as errorText, x as useLedger } from "./use-current-user-BQ4guYPZ.mjs";
import { t as RequireUser } from "./gate-BnE7JtP4.mjs";
import { n as toast } from "../_libs/sonner.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routes-CkNROYiI.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function HomeView() {
	const { profile, txs } = useLedger();
	const refresh = useRefreshLedger();
	const [busy, setBusy] = (0, import_react.useState)(false);
	const [error, setError] = (0, import_react.useState)("");
	if (txs.isPending || profile.isPending) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-4",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "h-8 w-32 animate-pulse rounded-md bg-sand" }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "h-40 animate-pulse rounded-lg bg-sand" }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "h-28 animate-pulse rounded-lg bg-sand" })
		]
	});
	const today = /* @__PURE__ */ new Date();
	const key = monthKey(today);
	const prevKey = shiftMonth(key, -1);
	const rows = txs.data ?? [];
	const current = summarize(rows, key);
	const previous = summarize(rows, prevKey);
	const progress = monthProgress(key, today);
	const income = profile.data?.monthlyIncomePence ?? 0;
	const name = profile.data?.displayName?.split(" ")[0] || "there";
	const projected = projectedSpend(current.spent, progress.day, progress.days);
	const left = income - current.spent;
	const daysLeft = Math.max(1, progress.days - progress.day + 1);
	const perDay = Math.floor(left / daysLeft);
	const ratio = income > 0 ? Math.min(1, current.spent / income) : 0;
	const over = income > 0 && current.spent > income;
	const top = current.byCategory[0];
	const hasSample = rows.some((row) => row.isSample);
	const recent = rows.filter((row) => row.spentOn.slice(0, 7) === key).slice(0, 4);
	async function loadSample() {
		setBusy(true);
		setError("");
		try {
			const result = await seedSamples();
			await refresh();
			toast(result.added > 0 ? "Sample month added" : "Sample spends are already here");
		} catch (err) {
			setError(errorText(err, "Couldn’t add the sample."));
		} finally {
			setBusy(false);
		}
	}
	let pace = "Log a spend and the month starts to take shape.";
	if (current.count > 0 && projected != null && previous.spent > 0) {
		const delta = projected - previous.spent;
		if (progress.day < 3 && current.count < 3) pace = "Too few days to trust the pace yet. It settles once a handful of spends are in.";
		else if (Math.abs(delta) < 500) pace = `At this pace ${monthShort(key)} lands near ${formatGBP(projected)}, close to ${monthShort(prevKey)}.`;
		else if (delta > 0) pace = `At this pace ${monthShort(key)} lands near ${formatGBP(projected)}, ${formatGBP(delta)} above ${monthShort(prevKey)}.`;
		else pace = `At this pace ${monthShort(key)} lands near ${formatGBP(projected)}, ${formatGBP(Math.abs(delta))} under ${monthShort(prevKey)}.`;
	} else if (current.count > 0 && previous.spent === 0) pace = "There’s no full month before this one yet, so the comparison starts next month.";
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PageHead, {
			kicker: monthShort(key),
			title: `Hello, ${name}`,
			action: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
				to: "/settings",
				className: "grid size-11 place-items-center rounded-full border border-line bg-card text-ink",
				"aria-label": "Settings",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Settings, {
					className: "size-5",
					strokeWidth: 1.75
				})
			})
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
			className: "panel p-5",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-sm text-muted",
					children: "Spent so far"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-1 font-display text-5xl leading-none",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Money, { pence: current.spent })
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-2 text-sm text-muted",
					children: income > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
						"of ",
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "tabular-nums",
							children: formatGBP(income)
						}),
						" take-home",
						" · ",
						formatPercent(current.spent / income)
					] }) : "Add your take-home in settings to see the share of pay."
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "mt-4 h-2 overflow-hidden rounded-full bg-sand",
					"aria-hidden": "true",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: over ? "h-full bg-clay" : "h-full bg-forest",
						style: { width: `${income > 0 ? Math.max(4, ratio * 100) : 0}%` }
					})
				}),
				income > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-4 grid grid-cols-2 gap-3",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-xs text-muted",
						children: over ? "Over by" : "Left this month"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: `mt-1 text-lg font-medium tabular-nums ${over ? "text-clay" : "text-ink"}`,
						children: formatGBP(Math.abs(left))
					})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-xs text-muted",
						children: over ? "Stop here" : "About a day"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-1 text-lg font-medium tabular-nums",
						children: over ? "—" : formatGBP(Math.max(0, perDay))
					})] })]
				}) : null,
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-4 text-sm text-muted",
					children: pace
				})
			]
		}),
		top ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
			className: "mt-4 panel p-5",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-xs tracking-[0.14em] text-muted uppercase",
					children: "Where it goes"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-2 font-display text-3xl",
					children: categoryLabel(top.id)
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
					className: "mt-1 text-sm text-muted",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "tabular-nums",
							children: formatGBP(top.amount)
						}),
						current.spent > 0 ? ` · ${formatPercent(top.amount / current.spent)} of this month` : "",
						income > 0 ? ` · ${formatPercent(top.amount / income)} of pay` : ""
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
					className: "mt-4 space-y-3",
					children: current.byCategory.slice(0, 5).map((row) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mb-1 flex justify-between text-sm",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: categoryLabel(row.id) }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "tabular-nums text-muted",
							children: formatGBP(row.amount)
						})]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "h-1.5 overflow-hidden rounded-full bg-sand",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "h-full bg-forest",
							style: { width: `${current.spent ? row.amount / current.spent * 100 : 0}%` }
						})
					})] }, row.id))
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Link, {
					to: "/insights",
					className: "mt-4 inline-block text-sm font-medium text-forest",
					children: ["Compare with ", monthShort(prevKey)]
				})
			]
		}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
			className: "mt-4 panel p-5",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					className: "font-display text-3xl",
					children: "Nothing logged this month"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-2 text-sm text-muted",
					children: "Scan a receipt, pick a photo, or paste a Google Pay, Apple Pay, or Uber alert. If there’s no receipt, Pence still files the spend."
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-4 flex flex-col gap-2 sm:flex-row",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
						to: "/capture",
						className: "btn btn-primary sm:w-auto",
						children: "Add a spend"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						className: "btn btn-quiet sm:w-auto",
						onClick: loadSample,
						disabled: busy,
						children: busy ? "Adding…" : "Try a sample month"
					})]
				}),
				error ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-2 text-sm text-clay",
					children: error
				}) : null
			]
		}),
		recent.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
			className: "mt-6",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mb-2 flex items-baseline justify-between",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
						className: "font-display text-2xl",
						children: "Latest"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link, {
						to: "/activity",
						className: "text-sm text-forest",
						children: "All activity"
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
					className: "panel divide-y divide-line",
					children: recent.map((tx) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
						className: "flex items-center justify-between gap-3 px-4 py-3",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "min-w-0",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "truncate font-medium",
								children: tx.merchant
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
								className: "text-sm text-muted",
								children: [categoryLabel(tx.category), tx.hasReceipt ? "" : " · no receipt"]
							})]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "tabular-nums",
							children: formatGBP(tx.amountPence)
						})]
					}, tx.id))
				}),
				hasSample ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-3 text-sm text-muted",
					children: "Includes sample spends. Clear them in settings when you want only your own."
				}) : null
			]
		}) : null
	] });
}
function HomePage() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RequireUser, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Shell, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(HomeView, {}) }) });
}
//#endregion
export { HomePage as component };
