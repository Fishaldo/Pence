import { createFileRoute } from "@tanstack/react-router";
import { CaptureView } from "@/components/pence/capture/capture-view";
import { RequireUser } from "@/components/pence/gate";
import { Shell } from "@/components/pence/ui";

export const Route = createFileRoute("/capture")({
  component: CapturePage,
});

function CapturePage() {
  return (
    <RequireUser>
      <Shell>
        <CaptureView />
      </Shell>
    </RequireUser>
  );
}
