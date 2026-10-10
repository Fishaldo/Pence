import { o as __toESM } from "../_runtime.mjs";
import { a as require_react, i as require_jsx_runtime } from "../_libs/react+tanstack__react-query.mjs";
import { C as useNavigate } from "../_libs/@tanstack/react-router+[...].mjs";
import { i as categoryLabel, m as poundsToPence, o as formatGBP, t as CATEGORIES, y as todayISO } from "./middleware-7TFDpBfn.mjs";
import { a as ImagePlus, c as Camera, t as Wallet } from "../_libs/lucide-react.mjs";
import { S as useRefreshLedger, a as Shell, g as saveSpend, i as PageHead, l as dismissAlert, m as readReceipt, s as createAlert, u as errorText, x as useLedger } from "./use-current-user-BQ4guYPZ.mjs";
import { t as RequireUser } from "./gate-BnE7JtP4.mjs";
import { n as toast } from "../_libs/sonner.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/capture-BGME2k69.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function paint(source, width, height) {
	const scale = Math.min(1, 1600 / Math.max(width, height));
	const w = Math.max(1, Math.round(width * scale));
	const h = Math.max(1, Math.round(height * scale));
	const canvas = document.createElement("canvas");
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("Couldn’t read that photo.");
	ctx.drawImage(source, 0, 0, w, h);
	let quality = .82;
	let url = canvas.toDataURL("image/jpeg", quality);
	while (url.length > 14e5 && quality > .5) {
		quality = Math.round((quality - .08) * 100) / 100;
		url = canvas.toDataURL("image/jpeg", quality);
	}
	return url;
}
function compressImage(file) {
	return new Promise((resolve, reject) => {
		if (!file.type.startsWith("image/")) {
			reject(/* @__PURE__ */ new Error("Choose a photo."));
			return;
		}
		const fromElement = () => {
			const objectUrl = URL.createObjectURL(file);
			const img = new Image();
			img.onload = () => {
				URL.revokeObjectURL(objectUrl);
				try {
					resolve(paint(img, img.width, img.height));
				} catch (err) {
					reject(err instanceof Error ? err : /* @__PURE__ */ new Error("Couldn’t read that photo."));
				}
			};
			img.onerror = () => {
				URL.revokeObjectURL(objectUrl);
				reject(/* @__PURE__ */ new Error("Couldn’t read that photo. Try a JPEG or PNG."));
			};
			img.src = objectUrl;
		};
		if (typeof createImageBitmap !== "function") {
			fromElement();
			return;
		}
		createImageBitmap(file, { imageOrientation: "from-image" }).then((bitmap) => {
			try {
				resolve(paint(bitmap, bitmap.width, bitmap.height));
			} catch (err) {
				reject(err instanceof Error ? err : /* @__PURE__ */ new Error("Couldn’t read that photo."));
			} finally {
				bitmap.close();
			}
		}).catch(() => fromElement());
	});
}
var EXAMPLES = [
	"Google Pay · You paid £14.80 to Uber",
	"Apple Pay · Tesco Extra £42.16",
	"Uber · Trip completed £9.60 · No receipt"
];
function moneyField(pence) {
	if (pence == null) return "";
	return (pence / 100).toFixed(2);
}
function toDraftItems(items) {
	return items.map((item) => ({
		name: item.name,
		amount: item.amountPence > 0 ? (item.amountPence / 100).toFixed(2) : ""
	}));
}
function fromDraftItems(items) {
	const out = [];
	for (const item of items) {
		const name = item.name.trim();
		if (!name) continue;
		out.push({
			name: name.slice(0, 80),
			amountPence: poundsToPence(item.amount) ?? 0
		});
		if (out.length >= 40) break;
	}
	return out;
}
function blankDraft(partial) {
	return {
		merchant: "",
		amount: "",
		category: "other",
		spentOn: todayISO(),
		source: "manual",
		hasReceipt: false,
		note: "",
		items: [],
		imageDataUrl: null,
		rawAlert: "",
		alertId: null,
		unsure: false,
		reading: "",
		...partial
	};
}
function CaptureView() {
	const navigate = useNavigate();
	const refresh = useRefreshLedger();
	const { alerts, profile } = useLedger();
	const cameraRef = (0, import_react.useRef)(null);
	const galleryRef = (0, import_react.useRef)(null);
	const attachRef = (0, import_react.useRef)(null);
	const [phase, setPhase] = (0, import_react.useState)({ kind: "choose" });
	const [error, setError] = (0, import_react.useState)("");
	const [busy, setBusy] = (0, import_react.useState)(false);
	(0, import_react.useEffect)(() => {
		const id = sessionStorage.getItem("pence-open-alert");
		if (!id || !alerts.data) return;
		const found = alerts.data.find((item) => item.id === id);
		if (!found) return;
		sessionStorage.removeItem("pence-open-alert");
		setPhase({
			kind: "ask",
			alert: found
		});
	}, [alerts.data]);
	function notify(merchant, amount) {
		if (!profile.data?.notifyAlerts) return;
		if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
		try {
			new Notification("Spend spotted", { body: `${merchant} · ${amount}. Do you have a receipt?` });
		} catch {}
	}
	async function onPhoto(file, source, alert) {
		if (!file) return;
		setError("");
		setPhase({
			kind: "busy",
			label: "Reading the shop, total, and items…"
		});
		let imageDataUrl = null;
		try {
			imageDataUrl = await compressImage(file);
			const read = await readReceipt({ data: { imageDataUrl } });
			const amountPence = read.isSpend ? read.amountPence ?? alert?.amountPence ?? null : alert?.amountPence ?? null;
			const merchant = read.isSpend ? read.merchant || alert?.merchant || "" : alert?.merchant ?? "";
			const category = read.isSpend && read.category !== "other" ? read.category : alert?.category ?? (read.isSpend ? read.category : "other");
			setPhase({
				kind: "review",
				draft: blankDraft({
					merchant,
					amount: moneyField(amountPence),
					category,
					spentOn: read.isSpend && read.spentOn ? read.spentOn : todayISO(),
					source: alert ? "wallet" : source,
					hasReceipt: true,
					note: read.isSpend ? read.note : "",
					items: read.isSpend ? toDraftItems(read.items) : [],
					imageDataUrl,
					rawAlert: alert?.rawText ?? "",
					alertId: alert?.id ?? null,
					unsure: !read.isSpend || amountPence == null || read.confidence < .45,
					reading: read.isSpend ? "" : read.note
				})
			});
		} catch (err) {
			setError(errorText(err, "Couldn’t read that photo. Type the shop and the total."));
			setPhase({
				kind: "review",
				draft: blankDraft({
					merchant: alert?.merchant ?? "",
					amount: moneyField(alert?.amountPence ?? null),
					category: alert?.category ?? "other",
					source: alert ? "wallet" : source,
					hasReceipt: imageDataUrl != null,
					imageDataUrl,
					rawAlert: alert?.rawText ?? "",
					alertId: alert?.id ?? null,
					unsure: true
				})
			});
		}
	}
	async function submitPaste(text) {
		setError("");
		setPhase({
			kind: "busy",
			label: "Reading the payment alert…"
		});
		try {
			const alert = await createAlert({ data: { rawText: text } });
			await refresh();
			const amount = alert.amountPence != null ? formatGBP(alert.amountPence) : "an amount";
			notify(alert.merchant, amount);
			setPhase({
				kind: "ask",
				alert
			});
		} catch (err) {
			setError(errorText(err, "Couldn’t read that alert."));
			setPhase({
				kind: "paste",
				text
			});
		}
	}
	async function save(draft) {
		const amountPence = poundsToPence(draft.amount);
		if (!draft.merchant.trim()) {
			setError("Add the shop or payee.");
			return;
		}
		if (!amountPence) {
			setError("Enter the amount, like 12.40.");
			return;
		}
		setBusy(true);
		setError("");
		try {
			await saveSpend({ data: {
				merchant: draft.merchant.trim(),
				amountPence,
				category: draft.category,
				spentOn: draft.spentOn,
				source: draft.source,
				hasReceipt: draft.hasReceipt,
				note: draft.note,
				items: fromDraftItems(draft.items),
				imageDataUrl: draft.imageDataUrl,
				rawAlert: draft.rawAlert,
				alertId: draft.alertId
			} });
			await refresh();
			toast(`Filed ${draft.merchant.trim()} under ${categoryLabel(draft.category)}`);
			navigate({ to: "/" });
		} catch (err) {
			setError(errorText(err, "Couldn’t save that spend."));
			setBusy(false);
		}
	}
	async function skipAlert(alert) {
		setBusy(true);
		try {
			await dismissAlert({ data: { id: alert.id } });
			await refresh();
			setPhase({ kind: "choose" });
		} catch (err) {
			setError(errorText(err, "Couldn’t dismiss that."));
		} finally {
			setBusy(false);
		}
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PageHead, {
			kicker: "Add",
			title: phase.kind === "ask" ? "Receipt?" : "New spend"
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
			ref: cameraRef,
			className: "sr-only",
			type: "file",
			accept: "image/*",
			capture: "environment",
			onChange: (event) => {
				const file = event.target.files?.[0];
				event.target.value = "";
				onPhoto(file, "receipt");
			}
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
			ref: galleryRef,
			className: "sr-only",
			type: "file",
			accept: "image/*",
			onChange: (event) => {
				const file = event.target.files?.[0];
				event.target.value = "";
				onPhoto(file, "gallery");
			}
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
			ref: attachRef,
			className: "sr-only",
			type: "file",
			accept: "image/*",
			capture: "environment",
			onChange: (event) => {
				const file = event.target.files?.[0];
				event.target.value = "";
				if (phase.kind === "ask") onPhoto(file, "receipt", phase.alert);
			}
		}),
		phase.kind === "choose" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex flex-col gap-3",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-sm text-muted",
					children: "A photo is enough. Pence reads the shop, the total, the date, and each item on the receipt. A card or wallet alert works too, if that’s all you have."
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					type: "button",
					className: "btn btn-primary",
					onClick: () => cameraRef.current?.click(),
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Camera, { className: "size-5" }), " Scan a receipt"]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					type: "button",
					className: "btn btn-quiet",
					onClick: () => galleryRef.current?.click(),
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ImagePlus, { className: "size-5" }), " Choose a photo"]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					type: "button",
					className: "btn btn-quiet",
					onClick: () => setPhase({
						kind: "paste",
						text: ""
					}),
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Wallet, { className: "size-5" }), " No receipt — card or wallet alert"]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: "text-sm font-medium text-forest",
					onClick: () => setPhase({
						kind: "review",
						draft: blankDraft({ unsure: true })
					}),
					children: "Type it in"
				})
			]
		}) : null,
		phase.kind === "paste" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex flex-col gap-3",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-sm text-muted",
					children: "Pence can’t see Google Pay or Apple Pay by itself. Paste the notification. You’ll be asked if a receipt exists, then the spend is filed — as Other if it can’t be sorted."
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
					className: "min-h-28 w-full rounded-md border border-line bg-card p-3 text-base",
					placeholder: "Google Pay · You paid £14.80 to Uber",
					value: phase.text,
					onChange: (event) => setPhase({
						kind: "paste",
						text: event.target.value
					})
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "flex flex-wrap gap-2",
					children: EXAMPLES.map((example) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						className: "rounded-full border border-line bg-card px-3 py-2 text-left text-sm",
						onClick: () => void submitPaste(example),
						children: example
					}, example))
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: "btn btn-primary",
					onClick: () => void submitPaste(phase.text),
					children: "Read this alert"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: "btn btn-quiet",
					onClick: () => setPhase({ kind: "choose" }),
					children: "Back"
				})
			]
		}) : null,
		phase.kind === "busy" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "panel px-5 py-10 text-center",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "font-display text-3xl",
				children: phase.label
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mx-auto mt-4 h-1.5 w-40 overflow-hidden rounded-full bg-sand",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "h-full w-1/2 animate-pulse bg-forest" })
			})]
		}) : null,
		phase.kind === "ask" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "panel p-5",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-sm text-muted",
					children: "Spend spotted"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					className: "mt-1 font-display text-4xl",
					children: phase.alert.merchant
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-1 text-lg tabular-nums",
					children: phase.alert.amountPence != null ? formatGBP(phase.alert.amountPence) : "Amount missing"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-2 text-sm text-muted",
					children: phase.alert.category === "other" ? "This doesn’t look like a known shop, so it will be filed as Other unless you pick a category." : `This looks like ${categoryLabel(phase.alert.category)}.`
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-4 font-medium",
					children: "Do you have a receipt?"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-3 flex flex-col gap-2",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							className: "btn btn-primary",
							onClick: () => attachRef.current?.click(),
							children: "Yes — add the photo"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							className: "btn btn-quiet",
							onClick: () => setPhase({
								kind: "review",
								draft: blankDraft({
									merchant: phase.alert.merchant,
									amount: moneyField(phase.alert.amountPence),
									category: phase.alert.category,
									source: "wallet",
									rawAlert: phase.alert.rawText,
									alertId: phase.alert.id,
									note: "No receipt",
									unsure: phase.alert.category === "other" || phase.alert.amountPence == null
								})
							}),
							children: "No receipt — file it"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							className: "btn btn-quiet",
							disabled: busy,
							onClick: () => void skipAlert(phase.alert),
							children: "Not a spend"
						})
					]
				})
			]
		}) : null,
		phase.kind === "review" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Review, {
			draft: phase.draft,
			busy,
			onChange: (draft) => setPhase({
				kind: "review",
				draft
			}),
			onSave: () => void save(phase.draft),
			onBack: () => setPhase({ kind: "choose" })
		}) : null,
		error ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "mt-3 text-sm text-clay",
			children: error
		}) : null
	] });
}
function itemSum(items) {
	let sum = 0;
	let any = false;
	for (const item of items) {
		const pence = poundsToPence(item.amount);
		if (pence == null) continue;
		any = true;
		sum += pence;
	}
	return any ? sum : null;
}
function Review({ draft, busy, onChange, onSave, onBack }) {
	const sum = itemSum(draft.items);
	const total = poundsToPence(draft.amount);
	const mismatch = sum != null && total != null && Math.abs(sum - total) > 2;
	function patchItem(index, patch) {
		onChange({
			...draft,
			items: draft.items.map((item, i) => i === index ? {
				...item,
				...patch
			} : item)
		});
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex flex-col gap-3",
		children: [
			draft.reading ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "rounded-md bg-clay-soft px-3 py-2 text-sm text-ink",
				children: [
					"This photo isn’t a shop receipt. ",
					draft.reading,
					" You can still type the spend below."
				]
			}) : draft.unsure ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "rounded-md bg-clay-soft px-3 py-2 text-sm text-ink",
				children: ["Check the shop, the total, the date, and the items before saving.", draft.category !== "other" ? "" : " The category stays Other unless you change it."]
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "text-sm text-muted",
				children: [
					"Read from the photo",
					draft.items.length > 0 ? ` — ${draft.items.length} item${draft.items.length === 1 ? "" : "s"}` : "",
					". Check it, then file it."
				]
			}),
			draft.imageDataUrl ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
				src: draft.imageDataUrl,
				alt: "Receipt",
				className: "max-h-40 w-full rounded-lg bg-sand object-contain"
			}) : null,
			draft.items.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "panel px-3 py-3",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "field-label",
						children: "Items on the receipt"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
						className: "flex flex-col gap-2",
						children: draft.items.map((item, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
							className: "flex items-center gap-2",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									className: "control min-w-0 flex-1",
									"aria-label": `Item ${index + 1}`,
									value: item.name,
									onChange: (event) => patchItem(index, { name: event.target.value })
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									className: "control w-24 shrink-0 tabular-nums",
									"aria-label": `Amount for item ${index + 1}`,
									inputMode: "decimal",
									value: item.amount,
									onChange: (event) => patchItem(index, { amount: event.target.value })
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									className: "shrink-0 text-sm text-muted",
									onClick: () => onChange({
										...draft,
										items: draft.items.filter((_, i) => i !== index)
									}),
									children: "Remove"
								})
							]
						}, index))
					}),
					sum != null ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "mt-2 text-sm text-muted",
						children: [
							"Items add up to ",
							formatGBP(sum),
							mismatch ? " — that doesn’t match the total below." : "."
						]
					}) : null
				]
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "button",
				className: "text-left text-sm font-medium text-forest",
				onClick: () => onChange({
					...draft,
					items: [...draft.items, {
						name: "",
						amount: ""
					}]
				}),
				children: "Add an item"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
				className: "field",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "field-label",
					children: "Amount (£)"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
					className: "control font-display text-2xl tabular-nums",
					inputMode: "decimal",
					value: draft.amount,
					onChange: (event) => onChange({
						...draft,
						amount: event.target.value
					})
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
				className: "field",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "field-label",
					children: "Shop or payee"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
					className: "control",
					value: draft.merchant,
					onChange: (event) => onChange({
						...draft,
						merchant: event.target.value
					})
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
				className: "field",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "field-label",
					children: "Category"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", {
					className: "control",
					value: draft.category,
					onChange: (event) => onChange({
						...draft,
						category: event.target.value
					}),
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
					value: draft.spentOn,
					onChange: (event) => onChange({
						...draft,
						spentOn: event.target.value
					})
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
				className: "field",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "field-label",
					children: "Note"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
					className: "control",
					value: draft.note,
					placeholder: "Time, card, or anything else on the slip",
					onChange: (event) => onChange({
						...draft,
						note: event.target.value
					})
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "button",
				className: "btn btn-primary",
				disabled: busy,
				onClick: onSave,
				children: busy ? "Saving…" : "File this spend"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "button",
				className: "btn btn-quiet",
				onClick: onBack,
				children: "Back"
			})
		]
	});
}
function CapturePage() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RequireUser, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Shell, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CaptureView, {}) }) });
}
//#endregion
export { CapturePage as component };
