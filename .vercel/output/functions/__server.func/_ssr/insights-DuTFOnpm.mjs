import { o as __toESM } from "../_runtime.mjs";
import { a as require_react, i as require_jsx_runtime } from "../_libs/react+tanstack__react-query.mjs";
import { _ as shiftMonth, d as monthProgress, f as monthShort, g as projectedSpend, h as programmesFor, i as categoryLabel, l as monthKey, o as formatGBP, r as buildAdvice, s as formatPercent, v as summarize } from "./middleware-7TFDpBfn.mjs";
import { a as Shell, d as getAdvice, i as PageHead, r as Money, x as useLedger } from "./use-current-user-BQ4guYPZ.mjs";
import { t as RequireUser } from "./gate-BnE7JtP4.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/insights-DuTFOnpm.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function InsightsView() {
	const { profile, txs } = useLedger();
	const [tips, setTips] = (0, import_react.useState)(null);
	const [tipState, setTipState] = (0, import_react.useState)("idle");
	if (txs.isPending || profile.isPending) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "h-72 animate-pulse rounded-lg bg-sand" });
	const today = /* @__PURE__ */ new Date();
	const key = monthKey(today);
	const prevKey = shiftMonth(key, -1);
	const rows = txs.data ?? [];
	const current = summarize(rows, key);
	const previous = summarize(rows, prevKey);
	const progress = monthProgress(key, today);
	const income = profile.data?.monthlyIncomePence ?? 0;
	const city = profile.data?.city ?? "";
	const projected = progress.complete ? null : projectedSpend(current.spent, progress.day, progress.days);
	const advice = buildAdvice({
		city,
		income,
		current,
		previous,
		projected,
		complete: progress.complete
	});
	const ids = /* @__PURE__ */ new Set();
	for (const row of current.byCategory.slice(0, 2)) ids.add(row.id);
	for (const row of current.byCategory) {
		const prev = previous.byCategory.find((item) => item.id === row.id)?.amount ?? 0;
		if (prev > 0 && row.amount > prev * 1.15) ids.add(row.id);
	}
	const programmes = programmesFor([...ids]);
	const names = /* @__PURE__ */ new Set();
	for (const row of current.byCategory) names.add(row.id);
	for (const row of previous.byCategory) names.add(row.id);
	const chartRows = [...names].map((id) => ({
		name: categoryLabel(id),
		now: current.byCategory.find((row) => row.id === id)?.amount ?? 0,
		prev: previous.byCategory.find((row) => row.id === id)?.amount ?? 0
	})).sort((a, b) => b.now + b.prev - (a.now + a.prev)).slice(0, 6);
	const maxBar = Math.max(...chartRows.flatMap((item) => [item.now, item.prev]), 1);
	const delta = current.spent - previous.spent;
	const topMerchant = current.byMerchant[0];
	async function closer() {
		setTipState("loading");
		const brief = [
			`City: ${city || "not set"}`,
			`Take-home: ${formatGBP(income)}`,
			`${monthShort(key)} so far: ${formatGBP(current.spent)} across ${current.count} spends.`,
			current.byCategory.map((row) => `${categoryLabel(row.id)} ${formatGBP(row.amount)}`).join("; ") || "No categories.",
			`${monthShort(prevKey)}: ${formatGBP(previous.spent)}.`,
			previous.byCategory.map((row) => `${categoryLabel(row.id)} ${formatGBP(row.amount)}`).join("; ") || "No earlier categories.",
			projected ? `Projected full month: ${formatGBP(projected)}.` : "Month already complete.",
			topMerchant ? `Largest payee this month: ${topMerchant.name} ${formatGBP(topMerchant.amount)}.` : ""
		].join("\n");
		const fingerprint = `${key}|${income}|${current.spent}|${current.byCategory.map((r) => `${r.id}:${r.amount}`).join(",")}`;
		try {
			const result = await getAdvice({ data: {
				fingerprint,
				brief
			} });
			setTips(result.tips);
			setTipState(result.source === "unavailable" ? "unavailable" : "ready");
		} catch {
			setTipState("unavailable");
		}
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PageHead, {
			kicker: "Compared",
			title: monthShort(key)
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
			className: "panel p-5",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "grid gap-4 sm:grid-cols-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-sm text-muted",
						children: "This month so far"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "font-display text-4xl",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Money, { pence: current.spent })
					})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-sm text-muted",
						children: monthShort(prevKey)
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "font-display text-4xl",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Money, { pence: previous.spent })
					})] })]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-3 text-sm text-muted",
					children: previous.spent === 0 && current.spent === 0 ? "Nothing to compare until a spend is logged." : previous.spent === 0 ? `No spends in ${monthShort(prevKey)} yet.` : delta >= 0 ? `${formatGBP(delta)} more than ${monthShort(prevKey)} at this point in the ledger. Early in the month, use the pace on Home rather than this raw gap.` : `${formatGBP(Math.abs(delta))} less than the whole of ${monthShort(prevKey)}.`
				}),
				income > 0 && current.spent > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
					className: "mt-2 text-sm",
					children: [
						formatPercent(current.spent / income),
						" of take-home is spent",
						topMerchant ? `, most of it at ${topMerchant.name} (${formatGBP(topMerchant.amount)})` : "",
						"."
					]
				}) : null
			]
		}),
		chartRows.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
			className: "mt-4 panel p-5",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mb-4 flex flex-wrap gap-4 text-sm",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
					className: "flex items-center gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "size-2.5 rounded-full bg-forest" }), " This month"]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
					className: "flex items-center gap-2 text-muted",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "size-2.5 rounded-full bg-tone-6" }),
						" ",
						monthShort(prevKey)
					]
				})]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
				className: "space-y-4",
				children: chartRows.map((row) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mb-1.5 text-sm font-medium",
					children: row.name
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "space-y-1.5",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex items-center gap-3",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-sand",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "h-full rounded-full bg-forest",
								style: { width: `${row.now > 0 ? Math.max(2, row.now / maxBar * 100) : 0}%` }
							})
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "w-20 shrink-0 text-right text-xs tabular-nums",
							children: formatGBP(row.now)
						})]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex items-center gap-3",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-sand",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "h-full rounded-full bg-tone-6",
								style: { width: `${row.prev > 0 ? Math.max(2, row.prev / maxBar * 100) : 0}%` }
							})
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "w-20 shrink-0 text-right text-xs text-muted tabular-nums",
							children: formatGBP(row.prev)
						})]
					})]
				})] }, row.name))
			})]
		}) : null,
		current.byCategory.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
			className: "mt-4",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
				className: "mb-2 font-display text-2xl",
				children: "Share of pay"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
				className: "panel divide-y divide-line",
				children: current.byCategory.map((row) => {
					const prev = previous.byCategory.find((item) => item.id === row.id)?.amount ?? 0;
					const change = row.amount - prev;
					return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
						className: "flex items-center justify-between gap-3 px-4 py-3",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "min-w-0",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "font-medium",
								children: categoryLabel(row.id)
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
								className: "text-sm text-muted",
								children: [income > 0 ? `${formatPercent(row.amount / income)} of take-home` : "Add take-home to see the share", prev > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
									className: change > 100 ? " text-clay" : " text-forest",
									children: [
										" · ",
										change >= 0 ? "up" : "down",
										" ",
										formatGBP(Math.abs(change))
									]
								}) : " · new this month"]
							})]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "shrink-0 tabular-nums",
							children: formatGBP(row.amount)
						})]
					}, row.id);
				})
			})]
		}) : null,
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
			className: "mt-6",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					className: "font-display text-2xl",
					children: "What to trim"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
					className: "mt-3 space-y-3",
					children: advice.map((card) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
						className: `rounded-lg border p-4 ${card.tone === "warn" ? "border-clay/40 bg-clay-soft" : "border-line bg-card"}`,
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
							className: "font-medium",
							children: card.title
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-1 text-sm text-muted",
							children: card.body
						})]
					}, card.id))
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: "btn btn-quiet mt-3",
					onClick: closer,
					disabled: tipState === "loading" || current.count === 0,
					children: tipState === "loading" ? "Reading your month…" : "Ask for a closer read"
				}),
				tipState === "unavailable" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-2 text-sm text-muted",
					children: "A closer read isn’t available right now. The notes above still stand."
				}) : null,
				tips && tips.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
					className: "mt-3 space-y-2",
					children: tips.map((tip) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", {
						className: "panel px-4 py-3 text-sm",
						children: tip
					}, tip))
				}) : null
			]
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
			className: "mt-6",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					className: "font-display text-2xl",
					children: "Where to look for less"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-1 text-sm text-muted",
					children: "Ongoing programmes matched to what you’re actually spending on. Not voucher codes, and not a promise that a price is live today."
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
					className: "mt-3 space-y-3",
					children: programmes.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
						className: "panel p-4",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "font-medium",
								children: item.name
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "mt-1 text-sm",
								children: item.detail
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
								className: "mt-2 text-sm text-muted",
								children: [
									item.where,
									". ",
									item.when
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("a", {
								href: item.href,
								className: "mt-2 inline-block text-sm font-medium text-forest",
								target: "_blank",
								rel: "noreferrer",
								children: ["Open ", item.name]
							})
						]
					}, item.id))
				})
			]
		})
	] });
}
function InsightsPage() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RequireUser, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Shell, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(InsightsView, {}) }) });
}
//#endregion
export { InsightsPage as component };
