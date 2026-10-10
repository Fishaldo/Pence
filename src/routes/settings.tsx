import { createFileRoute } from "@tanstack/react-router";
import { RequireUser } from "@/components/pence/gate";
import { SettingsView } from "@/components/pence/settings";
import { Shell } from "@/components/pence/ui";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <RequireUser>
      <Shell>
        <SettingsView />
      </Shell>
    </RequireUser>
  );
}
