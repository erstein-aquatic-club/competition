import { useQuery } from "@tanstack/react-query";
import { listMyPaceTargets, type PaceTarget } from "@/lib/api/pace-targets";
import type { ParsedObjectiveTarget } from "@/lib/objective-pace-link";

export function findMatchingTarget(
  targets: readonly { id: string; swimmer_account_id: number | null; stroke: string; target_distance_m: number; target_pool_size: string; updated_at: string }[],
  swimmer_account_id: number,
  parsed: ParsedObjectiveTarget | null,
): PaceTarget | null {
  if (!parsed) return null;
  const matches = (targets as PaceTarget[]).filter((t) =>
    t.swimmer_account_id === swimmer_account_id &&
    t.stroke === parsed.stroke &&
    t.target_distance_m === parsed.distance &&
    t.target_pool_size === parsed.pool_size,
  );
  if (matches.length === 0) return null;
  matches.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
  return matches[0];
}

export function useTargetForObjective(args: {
  swimmer_account_id: number | null;
  parsed: ParsedObjectiveTarget | null;
}): { target: PaceTarget | null; isLoading: boolean } {
  const enabled = args.swimmer_account_id != null && args.parsed != null;
  const q = useQuery({
    queryKey: ["pace-targets-for-swimmer", args.swimmer_account_id],
    queryFn: listMyPaceTargets,
    enabled,
    staleTime: 30_000,
  });
  if (!enabled) return { target: null, isLoading: false };
  if (q.isLoading || !q.data) return { target: null, isLoading: q.isLoading };
  return {
    target: findMatchingTarget(q.data, args.swimmer_account_id!, args.parsed),
    isLoading: false,
  };
}
