import { createFileRoute } from "@tanstack/react-router";
import { OffersView } from "@/components/pence/offers";
import { RequireUser } from "@/components/pence/gate";
import { Shell } from "@/components/pence/ui";

export const Route = createFileRoute("/offers")({
  component: OffersPage,
});

function OffersPage() {
  return (
    <RequireUser>
      <Shell>
        <OffersView />
      </Shell>
    </RequireUser>
  );
}
