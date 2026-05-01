import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getMyStrokeAdjustments,
  upsertStrokeAdjustment,
  resetMyStrokeAdjustments,
  type StrokeAdjustmentRow,
} from "@/lib/api/pace-stroke-adjustments";
import { STROKE_ADJUSTMENTS_DEFAULT, type EventFamily } from "@/lib/paceData";

type SingleStroke = "crawl" | "dos" | "brasse" | "papillon";

export const STROKE_ADJUSTMENTS_QUERY_KEY = ["coach-stroke-adjustments"] as const;

/** Exported for unit testing — overlays DB rows on top of doc defaults. */
export function mergeStrokeAdjustments(
  overrides: StrokeAdjustmentRow[],
): Record<SingleStroke, Record<EventFamily, number>> {
  const result: Record<SingleStroke, Record<EventFamily, number>> = {
    crawl:    { ...STROKE_ADJUSTMENTS_DEFAULT.crawl },
    dos:      { ...STROKE_ADJUSTMENTS_DEFAULT.dos },
    brasse:   { ...STROKE_ADJUSTMENTS_DEFAULT.brasse },
    papillon: { ...STROKE_ADJUSTMENTS_DEFAULT.papillon },
  };
  for (const row of overrides) {
    result[row.stroke][row.event_family] = row.m_value;
  }
  return result;
}

export function useCoachStrokeAdjustments() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: STROKE_ADJUSTMENTS_QUERY_KEY,
    queryFn: getMyStrokeAdjustments,
    staleTime: Infinity,
  });

  const overrides: StrokeAdjustmentRow[] = query.data ?? [];
  const adjustments = mergeStrokeAdjustments(overrides);

  const upsertOneMutation = useMutation({
    mutationFn: upsertStrokeAdjustment,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: STROKE_ADJUSTMENTS_QUERY_KEY }),
  });

  const resetAllMutation = useMutation({
    mutationFn: resetMyStrokeAdjustments,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: STROKE_ADJUSTMENTS_QUERY_KEY }),
  });

  return {
    adjustments,
    overrides,
    isLoading: query.isLoading,
    error: query.error,
    upsertOne: upsertOneMutation.mutate,
    resetAll: resetAllMutation.mutate,
  };
}
