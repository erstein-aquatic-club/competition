import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { notifications_list } from "@/lib/api/notifications";

/**
 * §244 — Compte de notifications non lues pour la bottom nav.
 * Utilise notifications_list avec status="unread" pour filtrage serveur-side.
 * Polling 60s, refresh on focus.
 */
export function useUnreadCount() {
  const userId = useAuth((s) => s.userId);
  const { data } = useQuery({
    queryKey: ["unread-count", userId],
    queryFn: async () => {
      if (!userId) return 0;
      const result = await notifications_list({
        targetUserId: userId,
        status: "unread",
        limit: 200,
      });
      return result.pagination.total;
    },
    enabled: !!userId,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
  return data ?? 0;
}
