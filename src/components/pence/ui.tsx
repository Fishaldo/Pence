import { Link, useCanGoBack, useRouter, useRouterState } from "@tanstack/react-router";
import {
  CalendarCheck,
  ChartNoAxesColumn,
  ChevronLeft,
  House,
  Plus,
  Receipt,
  Repeat,
  Search,
  Settings,
  Tag,
  Wallet,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { formatGBP } from "@/lib/spend/model";
import { useLedger, useWatches } from "./data";

export function Mark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "grid size-10 place-items-center rounded-xl bg-forest text-[1.375rem] leading-none font-extrabold text-white",
        className,
      )}
      aria-hidden="true"
    >
      p
    </span>
  );
}

export function BootScreen() {
  return (
    <main className="grid min-h-dvh place-items-center bg-paper px-6 text-ink">
      <div className="flex flex-col items-center gap-4 text-center">
        <Mark />
        <div>
          <p className="text-[1.375rem] font-extrabold">Pence</p>
          <p className="mt-1 text-sm text-muted">See where your pay goes.</p>
        </div>
      </div>
    </main>
  );
}

export function Money({
  pence,
  className,
}: {
  pence: number;
  className?: string;
}) {
  return <span className={cn("tabular-nums", className)}>{formatGBP(pence)}</span>;
}

export function errorText(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message && !/cannot read propert/i.test(error.message)) return error.message;
  return fallback;
}

const NAV = [
  { to: "/", label: "Home", icon: House },
  { to: "/plan", label: "Plan", icon: Search },
  { to: "/capture", label: "Add", icon: Plus },
  { to: "/insights", label: "Insights", icon: ChartNoAxesColumn },
  { to: "/offers", label: "Offers", icon: Tag },
] as const;

const MORE = [
  { to: "/bills", label: "Bills", icon: Receipt },
  { to: "/regular", label: "Regular payments", icon: Repeat },
  // Budget sits on Plan, next to "Plan a spend".
  { to: "/plan", hash: "budget", label: "Budget", icon: Wallet },
  { to: "/week", label: "Weekly check-in", icon: CalendarCheck },
] as const;

export function Shell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const hash = useRouterState({ select: (s) => s.location.hash });
  const onBudget = path === "/plan" && hash === "budget";
  const { profile } = useLedger();
  const watches = useWatches();
  const income = profile.data?.monthlyIncomePence ?? 0;
  const priceFound = (watches.data ?? []).some((item) => item.status === "found");

  return (
    <div className="min-h-dvh bg-paper text-ink">
      <div className="mx-auto flex min-h-dvh max-w-6xl">
        <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line bg-card px-4 py-6 md:flex">
          <Link to="/" className="flex items-center gap-3 px-2">
            <Mark />
            <span className="text-xl font-extrabold">Pence</span>
          </Link>
          <nav className="mt-8 flex flex-1 flex-col gap-1" aria-label="Primary">
            {NAV.map((item) => {
              const active = path === item.to && !(item.to === "/plan" && onBudget);
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold",
                    active ? "bg-mist font-extrabold text-forest" : "text-ink hover:bg-sand",
                  )}
                >
                  <Icon className="size-5" strokeWidth={1.9} />
                  <span className="flex-1">{item.label}</span>
                </Link>
              );
            })}
          </nav>
          {MORE.map((item) => {
            const Icon = item.icon;
            const itemHash = "hash" in item ? item.hash : undefined;
            const active = itemHash ? onBudget : path === item.to;
            return (
              <Link
                key={item.label}
                to={item.to}
                hash={itemHash}
                className={cn(
                  "flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold",
                  active ? "bg-mist font-extrabold text-forest" : "text-ink hover:bg-sand",
                )}
              >
                <Icon className="size-4" strokeWidth={1.75} />
                <span className="flex-1">{item.label}</span>
              </Link>
            );
          })}
          <Link
            to="/settings"
            className="mt-4 flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted hover:bg-sand hover:text-ink"
          >
            <Settings className="size-4" strokeWidth={1.75} />
            <span>
              Take-home
              <span className="mt-0.5 block font-bold text-ink tabular-nums">
                {income > 0 ? `${formatGBP(income)} / mo` : "Add pay"}
              </span>
            </span>
          </Link>
        </aside>
        <div className="min-w-0 flex-1">
          <main className="mx-auto w-full max-w-[560px] px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-32 md:max-w-2xl md:px-8 md:pt-10 md:pb-12">
            {children}
          </main>
        </div>
      </div>
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card md:hidden"
        aria-label="Primary"
      >
        <ul className="mx-auto grid max-w-[560px] grid-cols-5 items-end px-2 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {NAV.map((item) => {
            const active = path === item.to;
            const Icon = item.icon;
            const add = item.to === "/capture";
            return (
              <li key={item.to} className="flex justify-center">
                <Link
                  to={item.to}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-[3.25rem] min-w-14 flex-col items-center justify-end gap-1 text-xs",
                    active ? "font-extrabold text-forest" : add ? "font-bold text-ink" : "font-semibold text-muted",
                  )}
                >
                  <span
                    className={cn(
                      "relative grid place-items-center",
                      add ? "-mt-[22px] size-[52px] rounded-full bg-forest text-white" : "size-6",
                    )}
                  >
                    <Icon className={add ? "size-[26px]" : "size-6"} strokeWidth={add ? 2.2 : 1.9} />
                    {item.to === "/offers" && priceFound ? (
                      <span
                        className="absolute -top-0.5 -right-1 size-2.5 rounded-full bg-clay ring-2 ring-card"
                        aria-label="Pence found a price"
                      />
                    ) : null}
                  </span>
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

/**
 * The top of a page, as on the agreed screens: a 28px title, an optional line
 * under it, and a round Back or Close button on pages opened from another page.
 */
export function PageHead({
  title,
  sub,
  back,
  close,
  date,
  action,
  flush = false,
}: {
  /** No space under the header, for pages that space their own sections. */
  flush?: boolean;
  /** Kept for older calls; not shown. */
  kicker?: string;
  title: string;
  sub?: ReactNode;
  /** Where Back goes. */
  back?: string;
  /** Where Close goes. */
  close?: string;
  /** A small line above the title, such as the date. */
  date?: string;
  action?: ReactNode;
}) {
  const to = back ?? close;
  return (
    <header className={flush ? "flex flex-col gap-1.5" : "mb-5 flex flex-col gap-1.5"}>
      <div className="flex items-center gap-3">
        {to ? <BackButton fallback={to} kind={back ? "back" : "close"} /> : null}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {date ? <span className="text-[0.8125rem] font-semibold text-muted">{date}</span> : null}
          <h1 className={to ? "page-title text-2xl" : "page-title"}>{title}</h1>
        </div>
        {action}
      </div>
      {sub ? <p className="text-sm leading-[1.45] text-muted">{sub}</p> : null}
    </header>
  );
}

/**
 * Back and Close return to the screen you came from, like the phone's own
 * back button. Only when the page was opened directly (a link, a fresh load)
 * is there nothing in Pence to go back to, so it goes to `fallback` instead.
 */
function BackButton({ fallback, kind }: { fallback: string; kind: "back" | "close" }) {
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const label = kind === "back" ? "Back" : "Close";
  const icon =
    kind === "back" ? <ChevronLeft className="size-[22px]" strokeWidth={1.9} /> : <X className="size-[22px]" strokeWidth={1.9} />;
  return (
    <Link
      to={fallback}
      className="round-btn"
      aria-label={label}
      onClick={(event) => {
        if (!canGoBack) return;
        event.preventDefault();
        router.history.back();
      }}
    >
      {icon}
    </Link>
  );
}

/** A section heading with an optional link on the right, such as "All". */
export function SectionHead({ title, sub, link }: { title: string; sub?: ReactNode; link?: ReactNode }) {
  return (
    <div className="mb-2.5 flex items-start justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <h2 className="section-title">{title}</h2>
        {sub ? <span className="text-[0.8125rem] text-muted">{sub}</span> : null}
      </div>
      {link ? <div className="-mt-3 shrink-0">{link}</div> : null}
    </div>
  );
}

/** Settings and Home use a round settings button in the top corner. */
export function SettingsButton() {
  return (
    <Link to="/settings" className="round-btn" aria-label="Settings">
      <Settings className="size-[22px]" strokeWidth={1.9} />
    </Link>
  );
}
