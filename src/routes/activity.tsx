import { createFileRoute } from "@tanstack/react-router";
import { ActivityView } from "@/components/pence/activity";
import { RequireUser } from "@/components/pence/gate";
import { Shell } from "@/components/pence/ui";

export const Route = createFileRoute("/activity")({
  component: ActivityPage,
});

function ActivityPage() {
  return (
    <RequireUser>
      <Shell>
        <ActivityView />
      </Shell>
    </RequireUser>
  );
}
