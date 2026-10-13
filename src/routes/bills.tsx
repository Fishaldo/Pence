import { createFileRoute } from "@tanstack/react-router";
import { RequireUser } from "@/components/pence/gate";
import { BillsView } from "@/components/pence/bills";
import { Shell } from "@/components/pence/ui";

export const Route = createFileRoute("/bills")({
  component: BillsPage,
});

function BillsPage() {
  return (
    <RequireUser>
      <Shell>
        <BillsView />
      </Shell>
    </RequireUser>
  );
}
