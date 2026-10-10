import { createFileRoute } from "@tanstack/react-router";
import { RequireUser } from "@/components/pence/gate";
import { HomeView } from "@/components/pence/home";
import { Shell } from "@/components/pence/ui";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return (
    <RequireUser>
      <Shell>
        <HomeView />
      </Shell>
    </RequireUser>
  );
}
