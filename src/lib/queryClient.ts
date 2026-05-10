import { QueryClient } from "@tanstack/react-query";
import { isTransientError } from "./offlineQueue";

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
