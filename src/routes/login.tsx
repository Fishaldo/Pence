import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { authClient, GROK_PROVIDERS, signIn } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { BootScreen, Mark } from "@/components/pence/ui";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const { user, isPending } = useCurrentUserState();
  const [mode, setMode] = useState<"create" | "enter">("create");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (isPending) return <BootScreen />;
  if (user) return <Navigate to="/" />;

  async function submit(event: React.FormEvent) {
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
          callbackURL: "/",
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
          callbackURL: "/",
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

  return (
    <main className="min-h-dvh bg-paper px-4 py-10 text-ink">
      <div className="mx-auto w-full max-w-md">
        <Mark />
        <p className="mt-6 text-xs tracking-[0.16em] text-muted uppercase">Pence</p>
        <h1 className="mt-1 font-display text-4xl">
          {mode === "create" ? "Create your account" : "Welcome back"}
        </h1>
        <p className="mt-2 text-sm text-muted">
          Next you’ll add your monthly take-home, so every category can be shown as a share of pay.
        </p>
        <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
          {mode === "create" ? (
            <label className="field">
              <span className="field-label">Name</span>
              <input className="control" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </label>
          ) : null}
          <label className="field">
            <span className="field-label">Email</span>
            <input
              className="control"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </label>
          <label className="field">
            <span className="field-label">Password</span>
            <input
              className="control"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "create" ? "new-password" : "current-password"}
              required
            />
          </label>
          {error ? <p className="text-sm text-clay">{error}</p> : null}
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? "Please wait…" : mode === "create" ? "Create account" : "Sign in"}
          </button>
        </form>
        <button
          type="button"
          className="mt-3 text-sm font-medium text-forest"
          onClick={() => {
            setMode(mode === "create" ? "enter" : "create");
            setError("");
          }}
        >
          {mode === "create" ? "I already have an account" : "Create an account"}
        </button>
        <div className="my-6 flex items-center gap-3 text-xs tracking-wide text-muted uppercase">
          <span className="h-px flex-1 bg-line" />
          or
          <span className="h-px flex-1 bg-line" />
        </div>
        <div className="flex flex-col gap-2">
          {GROK_PROVIDERS.map((provider) => (
            <button
              key={provider.providerId}
              type="button"
              className="btn btn-quiet"
              onClick={() => {
                void signIn(provider.providerId, { callbackURL: "/" }).catch((err: unknown) => {
                  setError(err instanceof Error ? err.message : "Couldn’t open sign-in.");
                });
              }}
            >
              Continue with {provider.label}
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}
