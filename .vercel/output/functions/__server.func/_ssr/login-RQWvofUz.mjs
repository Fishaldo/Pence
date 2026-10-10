import { o as __toESM } from "../_runtime.mjs";
import { a as require_react, i as require_jsx_runtime } from "../_libs/react+tanstack__react-query.mjs";
import { S as Navigate } from "../_libs/@tanstack/react-router+[...].mjs";
import { r as signIn, t as authClient } from "./client-1vAx-gM_.mjs";
import { b as useCurrentUserState, n as Mark, t as BootScreen } from "./use-current-user-BQ4guYPZ.mjs";
import { t as GROK_PROVIDERS } from "./server-6dxLhctB.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/login-RQWvofUz.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function LoginPage() {
	const { user, isPending } = useCurrentUserState();
	const [mode, setMode] = (0, import_react.useState)("create");
	const [name, setName] = (0, import_react.useState)("");
	const [email, setEmail] = (0, import_react.useState)("");
	const [password, setPassword] = (0, import_react.useState)("");
	const [error, setError] = (0, import_react.useState)("");
	const [busy, setBusy] = (0, import_react.useState)(false);
	if (isPending) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(BootScreen, {});
	if (user) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Navigate, { to: "/" });
	async function submit(event) {
		event.preventDefault();
		setError("");
		if (password.length < 8) {
			setError("Use at least 8 characters.");
			return;
		}
		setBusy(true);
		try {
			if (mode === "create") {
				if (!name.trim()) {
					setError("Add your name.");
					setBusy(false);
					return;
				}
				const result = await authClient.signUp.email({
					email: email.trim(),
					password,
					name: name.trim(),
					callbackURL: "/"
				});
				if (result.error) {
					setError(result.error.message || "Couldn’t create the account.");
					setBusy(false);
					return;
				}
			} else {
				const result = await authClient.signIn.email({
					email: email.trim(),
					password,
					callbackURL: "/"
				});
				if (result.error) {
					setError(result.error.message || "Those details didn’t match.");
					setBusy(false);
					return;
				}
			}
			window.location.assign("/");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Couldn’t sign you in.");
			setBusy(false);
		}
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("main", {
		className: "min-h-dvh bg-paper px-4 py-10 text-ink",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mx-auto w-full max-w-md",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Mark, {}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-6 text-xs tracking-[0.16em] text-muted uppercase",
					children: "Pence"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
					className: "mt-1 font-display text-4xl",
					children: mode === "create" ? "Create your account" : "Welcome back"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-2 text-sm text-muted",
					children: "Next you’ll add your monthly take-home, so every category can be shown as a share of pay."
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
					onSubmit: submit,
					className: "mt-6 flex flex-col gap-3",
					children: [
						mode === "create" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
							className: "field",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "field-label",
								children: "Name"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								className: "control",
								value: name,
								onChange: (e) => setName(e.target.value),
								autoComplete: "name"
							})]
						}) : null,
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
							className: "field",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "field-label",
								children: "Email"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								className: "control",
								type: "email",
								value: email,
								onChange: (e) => setEmail(e.target.value),
								autoComplete: "email",
								required: true
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
							className: "field",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "field-label",
								children: "Password"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								className: "control",
								type: "password",
								value: password,
								onChange: (e) => setPassword(e.target.value),
								autoComplete: mode === "create" ? "new-password" : "current-password",
								required: true
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
							children: busy ? "Please wait…" : mode === "create" ? "Create account" : "Sign in"
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: "mt-3 text-sm font-medium text-forest",
					onClick: () => {
						setMode(mode === "create" ? "enter" : "create");
						setError("");
					},
					children: mode === "create" ? "I already have an account" : "Create an account"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "my-6 flex items-center gap-3 text-xs tracking-wide text-muted uppercase",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "h-px flex-1 bg-line" }),
						"or",
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "h-px flex-1 bg-line" })
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "flex flex-col gap-2",
					children: GROK_PROVIDERS.map((provider) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						type: "button",
						className: "btn btn-quiet",
						onClick: () => {
							signIn(provider.providerId, { callbackURL: "/" }).catch((err) => {
								setError(err instanceof Error ? err.message : "Couldn’t open sign-in.");
							});
						},
						children: ["Continue with ", provider.label]
					}, provider.providerId))
				})
			]
		})
	});
}
//#endregion
export { LoginPage as component };
