import { createFileRoute } from "@tanstack/react-router";
import { RequireUser } from "@/components/pence/gate";
import { RegularView } from "@/components/pence/regular";
import { Shell } from "@/components/pence/ui";

export const Route = createFileRoute("/regular")({
  component: RegularPage,
});

function RegularPage() {
  return (
    <RequireUser>
      <Shell>
        <RegularView />
      </Shell>
    </RequireUser>
  );
}
