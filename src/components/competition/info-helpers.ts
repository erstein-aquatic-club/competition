import type { Objective, SwimmerPerformance } from "@/lib/api/types";

export interface ObjectivePerfRow {
  objectiveId: string;
  eventCode: string | null;
  poolLength: number | null;
  targetSeconds: number | null;
  pbSeconds: number | null;
  deltaSeconds: number | null;
  /** Free-text fallback when objective has no parseable target. */
  text: string | null;
}

export function computeObjectivePerfRow(
  objective: Objective,
  perfs: SwimmerPerformance[],
): ObjectivePerfRow {
  const eventCode = objective.event_code ?? null;
  const poolLength = objective.pool_length ?? null;
  const targetSeconds = objective.target_time_seconds ?? null;

  const matching = perfs.filter(
    (p) =>
      p.event_code === eventCode &&
      (poolLength == null || p.pool_length === poolLength),
  );
  const pbSeconds =
    matching.length > 0 ? Math.min(...matching.map((p) => p.time_seconds)) : null;

  const deltaSeconds =
    targetSeconds != null && pbSeconds != null ? pbSeconds - targetSeconds : null;

  return {
    objectiveId: objective.id,
    eventCode,
    poolLength,
    targetSeconds,
    pbSeconds,
    deltaSeconds,
    text: objective.text ?? null,
  };
}
