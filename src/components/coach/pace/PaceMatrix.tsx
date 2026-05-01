import React, { useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  pacePer100m,
  zoneTime,
  formatPaceTime,
  getDistanceRows,
} from "../../../lib/paceCalculator";
import type { Stroke, ZoneConfig } from "../../../lib/paceCalculator";
import {
  convertTargetTime,
  FFN_DISCLAIMER,
} from "../../../lib/poolConversion";
import type { PoolSize, Sex } from "../../../lib/poolConversion";

interface Props {
  targetTimeMs: number;
  targetDistanceM: number;
  stroke: Stroke;
  zones: ZoneConfig;
  swimmerSex?: Sex | null;
  targetPool?: PoolSize;
}

const ZONE_COLS = [
  { key: "v0_pct" as const, label: "V0", colorClass: "text-intensity-1" },
  { key: "v1_pct" as const, label: "V1", colorClass: "text-intensity-2" },
  { key: "v2_pct" as const, label: "V2", colorClass: "text-intensity-3" },
  { key: "v3_pct" as const, label: "V3", colorClass: "text-intensity-4" },
  { key: "max_pct" as const, label: "Max", colorClass: "text-intensity-5" },
] as const;

function disabledReason(
  stroke: Stroke,
  distanceM: number,
  sex: Sex | null | undefined,
): string {
  if (!sex) return "Conversion 25m↔50m indisponible — sexe du nageur non renseigné";
  const probe = convertTargetTime({
    targetTimeMs: 60_000, fromPool: "50m", toPool: "25m",
    stroke, distanceM, sex,
  });
  if (probe === null) return "Conversion FFN non définie pour cette épreuve";
  return "";
}

export function PaceMatrix({
  targetTimeMs,
  targetDistanceM,
  stroke,
  zones,
  swimmerSex,
  targetPool = "50m",
}: Props) {
  const [viewPool, setViewPool] = useState<PoolSize>(targetPool);
  const rows = getDistanceRows(targetDistanceM, stroke);

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-xs uppercase tracking-widest text-muted-foreground/50">
        Combinaison nage/distance non gérée
      </div>
    );
  }

  // Compute effective time for the viewed pool.
  let effectiveTimeMs = targetTimeMs;
  let conversionFailed = false;
  if (viewPool !== targetPool) {
    const converted = convertTargetTime({
      targetTimeMs,
      fromPool: targetPool,
      toPool: viewPool,
      stroke,
      distanceM: targetDistanceM,
      sex: swimmerSex,
    });
    if (converted === null) {
      conversionFailed = true;
      // Fall back to original — but toggle should have been disabled; defensive
    } else {
      effectiveTimeMs = converted;
    }
  }

  const pace = pacePer100m(effectiveTimeMs, targetDistanceM);
  const otherPool: PoolSize = viewPool === "50m" ? "25m" : "50m";
  const reason = disabledReason(stroke, targetDistanceM, swimmerSex);
  const otherDisabled = reason !== "";

  return (
    <TooltipProvider>
      <div className="space-y-1">
        {/* Bassin toggle */}
        <div className="flex items-center gap-1">
          {(["50m", "25m"] as const).map((p) => {
            const isActive  = viewPool === p;
            const isDisabled = !isActive && otherDisabled;
            const btn = (
              <button
                key={p}
                type="button"
                disabled={isDisabled}
                onClick={() => !isDisabled && setViewPool(p)}
                className={[
                  "h-6 rounded px-2.5 text-[10px] font-semibold uppercase tracking-wider transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : isDisabled
                    ? "cursor-not-allowed border border-dashed border-border/40 text-muted-foreground/30"
                    : "border border-input text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                ].join(" ")}
              >
                {p}
              </button>
            );

            if (isDisabled) {
              return (
                <Tooltip key={p}>
                  <TooltipTrigger asChild>{btn}</TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[220px] text-xs">
                    {reason}
                  </TooltipContent>
                </Tooltip>
              );
            }
            return btn;
          })}
          {viewPool !== targetPool && !conversionFailed && (
            <span className="ml-1 text-[9px] uppercase tracking-widest text-muted-foreground/40">
              converti
            </span>
          )}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-border/40">
                <th
                  scope="col"
                  className="sticky left-0 z-10 bg-background py-2 pr-3 text-[10px] font-medium uppercase tracking-widest text-muted-foreground/60 min-w-[48px]"
                >
                  m
                </th>
                {ZONE_COLS.map(({ label, colorClass }) => (
                  <th
                    key={label}
                    scope="col"
                    className={`py-2 px-3 text-[10px] font-semibold uppercase tracking-widest ${colorClass} text-right whitespace-nowrap min-w-[64px]`}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((dist, i) => (
                <tr
                  key={dist}
                  className={`border-b border-border/20 ${i % 2 === 0 ? "" : "bg-muted/20"}`}
                >
                  <td className="sticky left-0 z-10 bg-background py-[9px] pr-3 text-[11px] font-medium tabular-nums text-muted-foreground/70 min-h-[36px]">
                    {dist % 1000 === 0 ? `${dist / 1000}k` : dist}
                  </td>
                  {ZONE_COLS.map(({ key, label }) => (
                    <td
                      key={label}
                      className="py-[9px] px-3 font-mono text-[13px] tabular-nums text-right text-foreground"
                    >
                      {formatPaceTime(zoneTime(dist, pace, zones[key]))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* FFN disclaimer */}
        <p className="text-[9px] text-muted-foreground/40 text-center pt-0.5">
          {FFN_DISCLAIMER}
        </p>
      </div>
    </TooltipProvider>
  );
}
