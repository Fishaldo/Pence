import { createFileRoute } from "@tanstack/react-router";
import { RequireUser } from "@/components/pence/gate";
import { Shell } from "@/components/pence/ui";
import { WatchView } from "@/components/pence/watch";

export const Route = createFileRoute("/watch")({
  component: WatchPage,
});

function WatchPage() {
  return (
    <RequireUser>
      <Shell>
        <WatchView />
      </Shell>
    </RequireUser>
  );
}
