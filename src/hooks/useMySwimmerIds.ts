import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

/**
 * Returns the set of swimmer IDs assigned to the current coach.
 * For admins, returns null (meaning "show all").
 */
export function useMySwimmerIds() {
  const role = useAuth((s) => s.role);
  const userId = useAuth((s) => s.userId);
  const isCoach = role === 'coach';
  const isAdmin = role === 'admin';

  const { data: mySwimmerIds, isLoading } = useQuery({
    queryKey: ['my-swimmer-ids', userId],
    queryFn: () => api.getMySwimmers(),
    enabled: isCoach && userId != null,
    staleTime: 30_000,
  });

  if (isAdmin) return { swimmerIds: null as Set<number> | null, isLoading: false };

  return {
    swimmerIds: mySwimmerIds ? new Set(mySwimmerIds) : new Set<number>(),
    isLoading,
  };
}

/**
 * Filter an athlete list by the coach's assigned swimmers.
 * If swimmerIds is null (admin), returns all athletes.
 */
export function filterByAssignment<T extends { id: number | null }>(
  athletes: T[],
  swimmerIds: Set<number> | null,
): T[] {
  if (swimmerIds === null) return athletes;
  return athletes.filter((a) => a.id != null && swimmerIds.has(a.id));
}
