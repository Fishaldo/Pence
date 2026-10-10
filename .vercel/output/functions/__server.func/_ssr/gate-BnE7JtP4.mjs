import { o as __toESM } from "../_runtime.mjs";
import { a as require_react, i as require_jsx_runtime, t as useQuery } from "../_libs/react+tanstack__react-query.mjs";
import { S as Navigate } from "../_libs/@tanstack/react-router+[...].mjs";
import { m as poundsToPence } from "./middleware-7TFDpBfn.mjs";
import { i as signOut } from "./client-1vAx-gM_.mjs";
import { S as useRefreshLedger, b as useCurrentUserState, f as getProfile, h as saveProfile, n as Mark, t as BootScreen, u as errorText, y as useCurrentUser } from "./use-current-user-BQ4guYPZ.mjs";
import { a as hasGateSessionMarker } from "./server-6dxLhctB.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/gate-BnE7JtP4.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var subscribeToNothing = () => () => {};
var noGateSessionOnServer = () => false;
/**
* Auth state components — plain wrappers around `useCurrentUserState()`.
*
* With auth on, visitors are signed out until they authenticate — in the sandbox
* live preview too, which does real sign-in. The shared dev user appears only
* when auth is disabled (`VITE_AUTH_ENABLED=false`, the shipped default).
* While the session is still resolving, gates that care about signed-out state
* render nothing so there's no signed-out flash on hard reload.
*/
/** Where `RedirectToSignIn` sends signed-out visitors. Create this route. */
var SIGN_IN_PATH = "/login";
/**
* Client-side redirect to the sign-in route (TanStack `<Navigate>` — NOT a full
* `window.location` reload). A hard navigation re-bootstraps the SPA and re-runs
* session loading, which feels like a second "Loading…" on /login.
*
* Guard routes by waiting out `isPending` first (see `use-current-user`), then
* render this.
*/
function RedirectToSignIn({ to = SIGN_IN_PATH }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Navigate, { to });
}
/**
* Minimal signed-in identity chip + sign-out. Restyle freely (see the
* `design-ui` skill). Sign-out is only shown when auth is enabled (the
* disabled-auth dev user has nothing to sign out of) and the session is not
* gate-materialized — behind the gate the next request signs the viewer
* straight back in, so a sign-out control there is a broken loop.
*/
function UserButton() {
	const user = useCurrentUser();
	const [signingOut, setSigningOut] = (0, import_react.useState)(false);
	const gateSession = (0, import_react.useSyncExternalStore)(subscribeToNothing, hasGateSessionMarker, noGateSessionOnServer);
	if (!user) return null;
	const label = user.displayName ?? user.primaryEmail ?? "Account";
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex items-center gap-2",
		children: [
			user.profileImageUrl ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
				src: user.profileImageUrl,
				alt: "",
				className: "h-8 w-8 rounded-full object-cover"
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "grid h-8 w-8 place-items-center rounded-full bg-black/10 text-sm font-medium dark:bg-white/20",
				children: label.charAt(0).toUpperCase()
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "text-sm font-medium",
				children: label
			}),
			!gateSession && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "button",
				disabled: signingOut,
				onClick: () => {
					setSigningOut(true);
					signOut().catch(() => setSigningOut(false));
				},
				className: "cursor-pointer text-sm underline-offset-4 opacity-70 hover:underline disabled:cursor-wait disabled:no-underline",
				children: signingOut ? "Signing out…" : "Sign out"
			})
		]
	});
}
function Onboarding({ defaultName }) {
	const refresh = useRefreshLedger();
	const [name, setName] = (0, import_react.useState)(defaultName);
	const [income, setIncome] = (0, import_react.useState)("");
	const [city, setCity] = (0, import_react.useState)("");
	const [payday, setPayday] = (0, import_react.useState)("");
	const [error, setError] = (0, import_react.useState)("");
	const [busy, setBusy] = (0, import_react.useState)(false);
	async function submit(event) {
		event.preventDefault();
		const monthlyIncomePence = poundsToPence(income);
		if (!monthlyIncomePence) {
			setError("Enter your monthly take-home, like 2400 or 2400.50.");
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
				notifyAlerts: false
			} });
			await refresh();
		} catch (err) {
			setError(errorText(err, "Couldn’t save that. Try again."));
			setBusy(false);
		}
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("main", {
		className: "min-h-dvh bg-paper px-4 py-10 text-ink",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
			onSubmit: submit,
			className: "mx-auto flex w-full max-w-md flex-col gap-5",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Mark, {}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-xs tracking-[0.16em] text-muted uppercase",
						children: "Your account"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
						className: "mt-1 font-display text-4xl",
						children: "What lands in your account?"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-2 text-sm text-muted",
						children: "Pence uses your take-home pay to show what share goes to groceries, rides, and the rest. It stays with your account."
					})
				] }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
					className: "field",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "field-label",
						children: "Your name"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
						className: "control",
						value: name,
						onChange: (e) => setName(e.target.value),
						autoComplete: "name",
						required: true
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
						placeholder: "2400",
						value: income,
						onChange: (e) => setIncome(e.target.value),
						required: true
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
					className: "field",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "field-label",
						children: "City, so tips can be local"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
						className: "control",
						placeholder: "Newcastle upon Tyne",
						value: city,
						onChange: (e) => setCity(e.target.value),
						autoComplete: "address-level2"
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
					className: "field",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "field-label",
						children: "Payday (optional)"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
						className: "control",
						value: payday,
						onChange: (e) => setPayday(e.target.value),
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
							value: "",
							children: "Not sure"
						}), Array.from({ length: 31 }, (_, i) => i + 1).map((day) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
							value: day,
							children: day
						}, day))]
					})]
				}),
				error ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-sm text-clay",
					children: error
				}) : null,
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					className: "btn btn-primary",
					type: "submit",
					disabled: busy,
					children: busy ? "Saving…" : "Start tracking"
				})
			]
		})
	});
}
function RequireUser({ children }) {
	const { user, isPending } = useCurrentUserState();
	const profile = useQuery({
		queryKey: ["profile"],
		queryFn: () => getProfile(),
		enabled: !isPending && user != null
	});
	if (isPending || user && profile.isPending) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(BootScreen, {});
	if (!user) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RedirectToSignIn, {});
	if (!profile.data?.onboarded) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Onboarding, { defaultName: user.displayName ?? "" });
	return children;
}
//#endregion
export { UserButton as n, RequireUser as t };
