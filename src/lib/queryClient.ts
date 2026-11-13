import { QueryClient } from "@tanstack/react-query";
import { isTransientError } from "./offlineQueue";
import { isStrengthPlanQueryKey, STRENGTH_PLAN_QUERY_PREFIXES } from "./strengthPlanFreshness";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchInterval: false,
      refetchOnWindowFocus: false, // PWA : évite refetch massif au retour avant-plan
      refetchOnReconnect: true,
      refetchOnMount: false, // cache frais suffit — évite refetch sur chaque navigation
      staleTime: 10 * 60 * 1000, // 10 min — data métier semaine/saison, rare updates
      gcTime: 60 * 60 * 1000, // 60 min — maximise cache offline PWA
      // §244 — retry uniquement sur erreurs transient (réseau / timeout / 5xx).
      // Backoff exponentiel 1s/2s/4s, max 2 retries (3 tentatives au total).
      // Évite de spammer un endpoint qui renvoie 4xx ou une erreur métier.
      retry: (failureCount, error) => failureCount < 2 && isTransientError(error),
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 4000),
      networkMode: "always", // PWA : tentative même offline, fallback localStorage gère le reste
    },
    mutations: {
      retry: false,
      networkMode: "always",
    },
  },
});

/**
 * New strength plans must not wait for the default 10-minute business cache.
 * All plan views fetch on mount/focus/reconnect, even when cached data exists.
 */
for (const prefix of STRENGTH_PLAN_QUERY_PREFIXES) {
  queryClient.setQueryDefaults([prefix], {
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
  });
}

/** Refresh all variants of the strength-planning cache after any publication,
 * coach edit, realtime event or foreground resume. Active queries refetch now;
 * inactive ones are marked stale and will refetch on their next mount. */
export function invalidateStrengthPlanningQueries(
  client: QueryClient = queryClient,
): Promise<void> {
  return client.invalidateQueries({
    predicate: (query) => isStrengthPlanQueryKey(query.queryKey),
    refetchType: "active",
  });
}
