import { Link, useRouterState } from "@tanstack/react-router";
import {
  BellRing,
  Calendar,
  House,
  PieChart,
  Plus,
  Settings,
  Tag,
} from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { formatGBP } from "@/lib/spend/model";
import { useLedger, useWatches } from "./data";

export function Mark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "grid size-11 place-items-center rounded-lg bg-forest font-display text-2xl text-foam",
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
          <p className="font-display text-4xl">Pence</p>
          <p className="mt-1 text-sm text-muted">See where it went.</p>
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
  { to: "/plan", label: "Plan", icon: Calendar },
  { to: "/capture", label: "Add", icon: Plus },
  { to: "/insights", label: "Insights", icon: PieChart },
  { to: "/offers", label: "Offers", icon: Tag },
] as const;

export function Shell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { profile } = useLedger();
  const watches = useWatches();
  const income = profile.data?.monthlyIncomePence ?? 0;
  const priceFound = (watches.data ?? []).some((item) => item.status === "found");

  return (
    <div className="min-h-dvh bg-paper text-ink">
      <div className="mx-auto flex min-h-dvh max-w-6xl">
        <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line bg-card px-4 py-6 md:flex">
          <Link to="/" className="flex items-center gap-3 px-2">
            <Mark className="size-10 text-xl" />
            <span className="font-display text-2xl">Pence</span>
          </Link>
          <nav className="mt-8 flex flex-1 flex-col gap-1" aria-label="Primary">
            {NAV.map((item) => {
              const active = path === item.to;
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex h-11 items-center gap-3 rounded-md px-3 text-sm",
                    active ? "bg-mist font-medium text-forest-deep" : "text-ink hover:bg-sand",
                  )}
                >
                  <Icon className="size-4" strokeWidth={1.75} />
                  <span className="flex-1">{item.label}</span>
                </Link>
              );
            })}
            <Link
              to="/watch"
              className={cn(
                "flex h-11 items-center gap-3 rounded-md px-3 text-sm",
                path === "/watch" ? "bg-mist font-medium text-forest-deep" : "text-ink hover:bg-sand",
              )}
            >
              <BellRing className="size-4" strokeWidth={1.75} />
              <span className="flex-1">Price watch</span>
              {priceFound ? <span className="size-2.5 rounded-full bg-clay" aria-label="Pence found a price" /> : null}
            </Link>
          </nav>
          <Link
            to="/settings"
            className="mt-4 flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted hover:bg-sand hover:text-ink"
          >
            <Settings className="size-4" strokeWidth={1.75} />
            <span>
              Take-home
              <span className="mt-0.5 block font-medium text-ink tabular-nums">
                {income > 0 ? `${formatGBP(income)} / mo` : "Add pay"}
              </span>
            </span>
          </Link>
        </aside>
        <div className="min-w-0 flex-1">
          <main className="mx-auto w-full max-w-3xl px-4 pt-6 pb-28 md:px-8 md:pb-12">{children}</main>
        </div>
      </div>
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/95 backdrop-blur md:hidden"
        aria-label="Primary"
      >
        <ul className="mx-auto grid max-w-lg grid-cols-5 px-1 pt-1 pb-[max(0.4rem,env(safe-area-inset-bottom))]">
          {NAV.map((item) => {
            const active = path === item.to;
            const Icon = item.icon;
            const add = item.to === "/capture";
            return (
              <li key={item.to} className="flex justify-center">
                <Link
                  to={item.to}
                  className={cn(
                    "flex min-h-12 min-w-12 flex-col items-center justify-center gap-0.5 text-[11px]",
                    add && "-mt-5",
                    active ? "text-forest" : "text-muted",
                  )}
                >
                  <span
                    className={cn(
                      "relative grid place-items-center",
                      add
                        ? "size-14 rounded-full bg-forest text-foam"
                        : "size-6",
                    )}
                  >
                    <Icon className={add ? "size-6" : "size-5"} strokeWidth={1.75} />
                    {item.to === "/offers" && priceFound ? (
                      <span
                        className="absolute -top-0.5 -right-1 size-2.5 rounded-full bg-clay ring-2 ring-card"
                        aria-label="Pence found a price"
                      />
                    ) : null}
                  </span>
                  {add ? null : item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

export function PageHead({
  kicker,
  title,
  action,
}: {
  kicker?: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-6 flex items-end justify-between gap-4">
      <div>
        {kicker ? (
          <p className="text-xs tracking-[0.16em] text-muted uppercase">{kicker}</p>
        ) : null}
        <h1 className="font-display text-4xl leading-none">{title}</h1>
      </div>
      {action}
    </header>
  );
}
