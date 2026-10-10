import { createFileRoute } from "@tanstack/react-router";
import { AlertsView } from "@/components/pence/alerts";
import { RequireUser } from "@/components/pence/gate";
import { Shell } from "@/components/pence/ui";

export const Route = createFileRoute("/alerts")({
  component: AlertsPage,
});

function AlertsPage() {
  return (
    <RequireUser>
      <Shell>
        <AlertsView />
      </Shell>
    </RequireUser>
  );
}
