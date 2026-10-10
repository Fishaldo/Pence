import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getProfile, listAlerts, listPlaces, listTransactions } from "@/server/ledger";
import { forYou, forYouWide } from "@/server/for-you";

export function useLedger() {
  const profile = useQuery({ queryKey: ["profile"], queryFn: () => getProfile() });
  const txs = useQuery({ queryKey: ["txs"], queryFn: () => listTransactions() });
  const alerts = useQuery({ queryKey: ["alerts"], queryFn: () => listAlerts() });
  const places = useQuery({ queryKey: ["places"], queryFn: () => listPlaces() });
  return { profile, txs, alerts, places };
}

/** What Pence has learned about this person, with deals from public deal boards. */
export function useForYou() {
  return useQuery({ queryKey: ["forYou"], queryFn: () => forYou(), staleTime: 5 * 60_000 });
}

/** The slower, wider web search for the same habits. Only runs where it is asked for. */
export function useForYouWide(enabled: boolean) {
  return useQuery({
    queryKey: ["forYouWide"],
    queryFn: () => forYouWide(),
    enabled,
    staleTime: 30 * 60_000,
    retry: 0,
  });
}

export function useRefreshLedger() {
  const client = useQueryClient();
  return async () => {
    await client.invalidateQueries({ queryKey: ["profile"] });
    await client.invalidateQueries({ queryKey: ["txs"] });
    await client.invalidateQueries({ queryKey: ["alerts"] });
    await client.invalidateQueries({ queryKey: ["places"] });
    await client.invalidateQueries({ queryKey: ["forYou"] });
    await client.invalidateQueries({ queryKey: ["forYouWide"] });
  };
}
