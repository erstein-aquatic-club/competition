import React from "react";
import {
  pacePer100m,
  zoneTime,
  formatPaceTime,
  getDistanceRows,
} from "../../../lib/paceCalculator";
import type { Stroke, ZoneConfig } from "../../../lib/paceCalculator";

interface Props {
  targetTimeMs: number;
  targetDistanceM: number;
  stroke: Stroke;
  zones: ZoneConfig;
}

const ZONE_COLS = [
  { key: "v0_pct" as const, label: "V0", colorClass: "text-intensity-1" },
  { key: "v1_pct" as const, label: "V1", colorClass: "text-intensity-2" },
  { key: "v2_pct" as const, label: "V2", colorClass: "text-intensity-3" },
  { key: "v3_pct" as const, label: "V3", colorClass: "text-intensity-4" },
  { key: "max_pct" as const, label: "Max", colorClass: "text-intensity-5" },
] as const;

export function PaceMatrix({ targetTimeMs, targetDistanceM, stroke, zones }: Props) {
  const rows = getDistanceRows(targetDistanceM, stroke);

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-xs uppercase tracking-widest text-muted-foreground/50">
        Combinaison nage/distance non gérée
      </div>
    );
  }

  const pace = pacePer100m(targetTimeMs, targetDistanceM);

  return (
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
  );
}
