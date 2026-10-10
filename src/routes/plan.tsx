import { createFileRoute } from "@tanstack/react-router";
import { PlanView } from "@/components/pence/plan";
import { RequireUser } from "@/components/pence/gate";
import { Shell } from "@/components/pence/ui";

export const Route = createFileRoute("/plan")({
  component: PlanPage,
});

function PlanPage() {
  return (
    <RequireUser>
      <Shell>
        <PlanView />
      </Shell>
    </RequireUser>
  );
}
