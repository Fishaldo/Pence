import { createFileRoute } from "@tanstack/react-router";
import { RequireUser } from "@/components/pence/gate";
import { InsightsView } from "@/components/pence/insights";
import { Shell } from "@/components/pence/ui";

export const Route = createFileRoute("/insights")({
  component: InsightsPage,
});

function InsightsPage() {
  return (
    <RequireUser>
      <Shell>
        <InsightsView />
      </Shell>
    </RequireUser>
  );
}
