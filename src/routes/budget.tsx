import { createFileRoute } from "@tanstack/react-router";
import { RequireUser } from "@/components/pence/gate";
import { BudgetView } from "@/components/pence/budget";
import { Shell } from "@/components/pence/ui";

export const Route = createFileRoute("/budget")({
  component: BudgetPage,
});

function BudgetPage() {
  return (
    <RequireUser>
      <Shell>
        <BudgetView />
      </Shell>
    </RequireUser>
  );
}
