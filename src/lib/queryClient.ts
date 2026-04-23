import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchInterval: false,
      refetchOnWindowFocus: false, // PWA : évite refetch massif au retour avant-plan
      refetchOnReconnect: true,
      refetchOnMount: false, // cache frais suffit — évite refetch sur chaque navigation
      staleTime: 10 * 60 * 1000, // 10 min — data métier semaine/saison, rare updates
      gcTime: 60 * 60 * 1000, // 60 min — maximise cache offline PWA
      retry: 1,
      networkMode: "always", // PWA : tentative même offline, fallback localStorage gère le reste
    },
    mutations: {
      retry: false,
      networkMode: "always",
    },
  },
});
