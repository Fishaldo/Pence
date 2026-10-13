import { createFileRoute } from "@tanstack/react-router";
import { RequireUser } from "@/components/pence/gate";
import { WeekView } from "@/components/pence/week";
import { Shell } from "@/components/pence/ui";

export const Route = createFileRoute("/week")({
  component: WeekPage,
});

function WeekPage() {
  return (
    <RequireUser>
      <Shell>
        <WeekView />
      </Shell>
    </RequireUser>
  );
}
