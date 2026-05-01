import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getMyPaceZonesV2,
  upsertPaceZoneCell,
  deletePaceZoneCell,
  resetMyPaceZonesToDefaults,
  initMyPaceZonesIfMissing,
} from "@/lib/api/pace-zones";
import { ZONE_COEFFICIENTS, type EventFamily, type Zone } from "@/lib/paceData";

export const PACE_ZONES_V2_QUERY_KEY = ["coach-pace-zones-v2"] as const;

/** Exported for unit testing — init idempotente puis fetch. */
export async function paceZonesQueryFn(): Promise<
  Partial<Record<EventFamily, Partial<Record<Zone, number>>>>
> {
  await initMyPaceZonesIfMissing();
  return getMyPaceZonesV2();
}

/** Returns the action to take when toggling V4 for a family. Exported for testing. */
export function computeToggleV4Action(
  family: EventFamily,
  currentZones: Partial<Record<EventFamily, Partial<Record<Zone, number>>>> | undefined,
): { action: "upsert"; k_value: number } | { action: "delete" } | null {
  const hasV4 = currentZones?.[family]?.["V4"] !== undefined;
  if (hasV4) return { action: "delete" };
  const k = ZONE_COEFFICIENTS[family].V4;
  if (k === null) return null;
  return { action: "upsert", k_value: k };
}

export function useCoachPaceZonesV2() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: PACE_ZONES_V2_QUERY_KEY,
    queryFn: paceZonesQueryFn,
    staleTime: Infinity,
  });

  const upsertCellMutation = useMutation({
    mutationFn: upsertPaceZoneCell,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PACE_ZONES_V2_QUERY_KEY }),
  });

  const resetToDefaultsMutation = useMutation({
    mutationFn: resetMyPaceZonesToDefaults,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PACE_ZONES_V2_QUERY_KEY }),
  });

  function toggleV4(family: EventFamily) {
    const decision = computeToggleV4Action(family, query.data);
    if (!decision) return;
    if (decision.action === "upsert") {
      upsertPaceZoneCell({ event_family: family, zone: "V4", k_value: decision.k_value })
        .then(() => queryClient.invalidateQueries({ queryKey: PACE_ZONES_V2_QUERY_KEY }));
    } else {
      deletePaceZoneCell({ event_family: family, zone: "V4" })
        .then(() => queryClient.invalidateQueries({ queryKey: PACE_ZONES_V2_QUERY_KEY }));
    }
  }

  return {
    zones: query.data,
    isLoading: query.isLoading,
    error: query.error,
    upsertCell: upsertCellMutation.mutate,
    resetToDefaults: resetToDefaultsMutation.mutate,
    toggleV4,
  };
}
