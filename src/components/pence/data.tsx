import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getProfile, listAlerts, listPlaces, listTransactions } from "@/server/ledger";

export function useLedger() {
  const profile = useQuery({ queryKey: ["profile"], queryFn: () => getProfile() });
  const txs = useQuery({ queryKey: ["txs"], queryFn: () => listTransactions() });
  const alerts = useQuery({ queryKey: ["alerts"], queryFn: () => listAlerts() });
  const places = useQuery({ queryKey: ["places"], queryFn: () => listPlaces() });
  return { profile, txs, alerts, places };
}

export function useRefreshLedger() {
  const client = useQueryClient();
  return async () => {
    await client.invalidateQueries({ queryKey: ["profile"] });
    await client.invalidateQueries({ queryKey: ["txs"] });
    await client.invalidateQueries({ queryKey: ["alerts"] });
    await client.invalidateQueries({ queryKey: ["places"] });
  };
}
