import React from "react";
import { PaceMatrix } from "./PaceMatrix";
import { normalizeStroke, eventFamily } from "@/lib/paceCalculatorV2";
import { ZONE_COEFFICIENTS, STROKE_ADJUSTMENTS_DEFAULT, type EventFamily, type Zone } from "@/lib/paceData";
import type { Stroke } from "@/lib/paceCalculator";
import type { PoolSize } from "@/lib/poolConversion";

const FAMILIES: EventFamily[] = ["50m", "100m", "200m", "400m", "800m_1500m"];

const DEFAULT_ZONES: Record<EventFamily, Partial<Record<Zone, number>>> = Object.fromEntries(
  FAMILIES.map((f) => {
    const c = ZONE_COEFFICIENTS[f];
    const zones: Partial<Record<Zone, number>> = { V0: c.V0, V1: c.V1, V2: c.V2, V3: c.V3, MAX: c.MAX };
    if (c.V4 !== null) zones.V4 = c.V4;
    return [f, zones];
  }),
) as Record<EventFamily, Partial<Record<Zone, number>>>;

interface Props {
  targetTimeMs: number;
  targetDistance: number;
  stroke: Stroke;
  targetPoolSize: PoolSize;
  swimmerSex: "M" | "F" | null;
  compact?: boolean;
}

export default function PaceMatrixInline({ targetTimeMs, targetDistance, stroke, targetPoolSize, swimmerSex, compact = true }: Props) {
  const strokeV2 = normalizeStroke(stroke);
  const family = eventFamily(targetDistance);
  const v4EnabledForFamily = family === "50m" || family === "100m";

  return (
    <PaceMatrix
      targetTimeMs={targetTimeMs}
      targetDistanceM={targetDistance}
      stroke={strokeV2}
      swimmerSex={swimmerSex}
      targetPool={targetPoolSize}
      zones={DEFAULT_ZONES}
      strokeAdjustments={STROKE_ADJUSTMENTS_DEFAULT}
      v4EnabledForFamily={v4EnabledForFamily}
      compact={compact}
    />
  );
}
