import { createFileRoute } from "@tanstack/react-router";
import { RequireUser } from "@/components/pence/gate";
import { Shell } from "@/components/pence/ui";
import { Watchlist } from "@/components/pence/watch";

export const Route = createFileRoute("/watchlist")({
  component: WatchlistPage,
});

function WatchlistPage() {
  return (
    <RequireUser>
      <Shell>
        <Watchlist />
      </Shell>
    </RequireUser>
  );
}
