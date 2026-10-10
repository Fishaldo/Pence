import { createFileRoute } from "@tanstack/react-router";
import { BankView } from "@/components/pence/bank";
import { RequireUser } from "@/components/pence/gate";
import { Shell } from "@/components/pence/ui";

export const Route = createFileRoute("/bank")({
  component: BankPage,
});

function BankPage() {
  return (
    <RequireUser>
      <Shell>
        <BankView />
      </Shell>
    </RequireUser>
  );
}
