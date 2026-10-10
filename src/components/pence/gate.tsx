import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getProfile } from "@/server/ledger";
import { Onboarding } from "./onboarding";
import { BootScreen } from "./ui";

export function RequireUser({ children }: { children: ReactNode }) {
  const { user, isPending } = useCurrentUserState();
  const profile = useQuery({
    queryKey: ["profile"],
    queryFn: () => getProfile(),
    enabled: !isPending && user != null,
  });

  if (isPending || (user && profile.isPending)) return <BootScreen />;
  if (!user) return <RedirectToSignIn />;
  if (!profile.data?.onboarded) {
    return <Onboarding defaultName={user.displayName ?? ""} />;
  }
  return children;
}
