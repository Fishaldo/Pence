import { createFileRoute, redirect } from "@tanstack/react-router";

// Budget lives on Plan now, next to "Plan a spend". Old links still land on it.
export const Route = createFileRoute("/budget")({
  beforeLoad: () => {
    throw redirect({ to: "/plan", hash: "budget", replace: true });
  },
});
