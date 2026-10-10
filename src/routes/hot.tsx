import { createFileRoute } from "@tanstack/react-router";
import { RequireUser } from "@/components/pence/gate";
import { HotView } from "@/components/pence/hot";
import { Shell } from "@/components/pence/ui";

export const Route = createFileRoute("/hot")({
  component: HotPage,
});

function HotPage() {
  return (
    <RequireUser>
      <Shell>
        <HotView />
      </Shell>
    </RequireUser>
  );
}
