import React, { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  eventFamily,
  computeTMax,
  computeZoneTime,
  computeRaceContextAdjustedTime,
  getDistanceRowsV2,
  turnCreditForShortCourse,
  type StrokeV2,
  type StrokeAdjustmentOverrides,
  type ZoneCoefficientsOverride,
  type RaceContextOptions,
} from "@/lib/paceCalculatorV2";
import type { EventFamily, Zone } from "@/lib/paceData";
import { convertTargetTime, getPoolMajorationMs } from "@/lib/poolConversion";
import type { PoolSize, Sex } from "@/lib/poolConversion";
import type { Stroke } from "@/lib/paceCalculator";

type SingleStroke = "crawl" | "dos" | "brasse" | "papillon";

interface Props {
  targetTimeMs: number;
  targetDistanceM: number;
  stroke: StrokeV2;
  swimmerSex: "M" | "F" | null;
  targetPool: "25m" | "50m";
  zones: Record<EventFamily, Partial<Record<Zone, number>>>;
  strokeAdjustments: Record<SingleStroke, Record<EventFamily, number>>;
  v4EnabledForFamily: boolean;
  compact?: boolean;
}

const STROKE_V2_TO_POOL: Record<StrokeV2, Stroke> = {
  crawl: "NL",
  dos: "Dos",
  brasse: "Brasse",
  papillon: "Pap",
  "4N": "4N",
};

interface ZoneCol {
  zone: Zone;
  label: string;
  headerCls: string;
  cellBold: boolean;
}

function buildCols(family: EventFamily, v4Enabled: boolean): ZoneCol[] {
  const cols: ZoneCol[] = [
    { zone: "V0",  label: "V0",  headerCls: "text-sky-500",    cellBold: false },
    { zone: "V1",  label: "V1",  headerCls: "text-teal-500",   cellBold: false },
    { zone: "V2",  label: "V2",  headerCls: "text-green-500",  cellBold: false },
    { zone: "V3",  label: "V3",  headerCls: "text-amber-500",  cellBold: false },
  ];
  const showV4 = family === "50m" || family === "100m" || v4Enabled;
  if (showV4) {
    cols.push({ zone: "V4", label: "V4", headerCls: "text-orange-500", cellBold: false });
  }
  cols.push({ zone: "MAX", label: "MAX", headerCls: "text-red-500", cellBold: true });
  return cols;
}

function fmtTime(s: number): string {
  if (s < 60) return s.toFixed(1);
  const m = Math.floor(s / 60);
  const rem = (s - m * 60).toFixed(1).padStart(4, "0");
  return `${m}:${rem}`;
}

export function PaceMatrix({
  targetTimeMs,
  targetDistanceM,
  stroke,
  swimmerSex,
  targetPool,
  zones,
  strokeAdjustments,
  v4EnabledForFamily,
  compact = false,
}: Props) {
  const [viewPool, setViewPool] = useState<PoolSize>(targetPool);
  const [raceContext, setRaceContext] = useState<RaceContextOptions>({
    hasStartBlock: true,
    hasTechSuit: true,
  });

  if (stroke === "4N") {
    return (
      <div className="text-sm text-muted-foreground text-center py-6">
        Les épreuves 4 nages utilisent une matrice segmentée.
        Voir le composant Pace4NSegmentMatrix.
      </div>
    );
  }

  const family = eventFamily(targetDistanceM);
  const rows = getDistanceRowsV2(targetDistanceM, stroke);
  const cols = buildCols(family, v4EnabledForFamily);
  const poolStroke = STROKE_V2_TO_POOL[stroke];
  const otherPool: PoolSize = viewPool === "50m" ? "25m" : "50m";

  // Pool conversion: convert the target event time once for the whole matrix
  let effectiveMs = targetTimeMs;
  let conversionApplied = false;
  if (viewPool !== targetPool) {
    const converted = convertTargetTime({
      targetTimeMs,
      fromPool: targetPool,
      toPool: viewPool,
      stroke: poolStroke,
      distanceM: targetDistanceM,
      sex: swimmerSex,
    });
    if (converted !== null) {
      effectiveMs = converted;
      conversionApplied = true;
    }
  }

  // Turn-credit model — the 50 m sprint pace curve is anchored in long course;
  // the 25 m-pool curve locks the first length and banks the pool gain after
  // the wall. See turnCreditForShortCourse / docs/pace-calculator-scenarios.md.
  const isSprintTurnModel = targetDistanceM === 50;
  const lcTargetMs = isSprintTurnModel
    ? convertTargetTime({
        targetTimeMs,
        fromPool: targetPool,
        toPool: "50m",
        stroke: poolStroke,
        distanceM: targetDistanceM,
        sex: swimmerSex,
      }) ?? targetTimeMs
    : targetTimeMs;
  const sprintMajorationMs = isSprintTurnModel
    ? getPoolMajorationMs(poolStroke, targetDistanceM, swimmerSex ?? null) ?? 0
    : 0;

  // Reason why the other-pool toggle button should be disabled
  const toggleDisabledReason = (): string => {
    const probe = convertTargetTime({
      targetTimeMs,
      fromPool: targetPool,
      toPool: otherPool,
      stroke: poolStroke,
      distanceM: targetDistanceM,
      sex: swimmerSex,
    });
    return probe === null ? "Conversion FFN non définie pour cette épreuve" : "";
  };
  const disabledReason = toggleDisabledReason();

  function cellTimeStr(d: number, zone: Zone): string {
    try {
      const tMax = isSprintTurnModel
        ? computeTMax({
            Tobj_s: lcTargetMs / 1000,
            D: targetDistanceM,
            d,
            stroke: stroke as SingleStroke,
            adjustmentOverrides: strokeAdjustments as StrokeAdjustmentOverrides,
          }) -
          turnCreditForShortCourse({
            d,
            D: targetDistanceM,
            poolLengthM: viewPool === "25m" ? 25 : 50,
            majoration_s: sprintMajorationMs / 1000,
          })
        : computeTMax({
            Tobj_s: effectiveMs / 1000,
            D: targetDistanceM,
            d,
            stroke: stroke as SingleStroke,
            adjustmentOverrides: strokeAdjustments as StrokeAdjustmentOverrides,
          });
      const tZone = computeZoneTime({
        tMax_s: tMax,
        zone,
        family,
        coefficientsOverride: zones as ZoneCoefficientsOverride,
      });
      const adjusted = computeRaceContextAdjustedTime({
        time_s: tZone,
        D: targetDistanceM,
        d,
        stroke: stroke as SingleStroke,
        zone,
        sex: swimmerSex,
        context: raceContext,
      });
      return fmtTime(adjusted);
    } catch {
      return "—";
    }
  }

  return (
    <TooltipProvider>
      <div className="space-y-2">
        {!compact && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              {(["50m", "25m"] as const).map((p) => {
                const isActive = viewPool === p;
                const isDisabled = !isActive && disabledReason !== "";
                const btn = (
                  <button
                    key={p}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => !isDisabled && setViewPool(p)}
                    className={[
                      "h-7 rounded px-3 text-[10px] font-semibold uppercase tracking-wider transition-colors",
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
                      <TooltipContent side="top" className="max-w-[240px] text-xs">
                        {disabledReason}
                      </TooltipContent>
                    </Tooltip>
                  );
                }
                return btn;
              })}
              {conversionApplied && (
                <span className="ml-1 text-[9px] uppercase tracking-widest text-muted-foreground/40">
                  converti
                </span>
              )}
            </div>

            <div className="flex items-center gap-3 rounded border border-border/30 bg-muted/20 px-2 py-1">
              <label className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
                <Checkbox
                  checked={raceContext.hasStartBlock}
                  onCheckedChange={(checked) =>
                    setRaceContext((prev) => ({ ...prev, hasStartBlock: checked === true }))
                  }
                  aria-label="Inclure le départ plot"
                  className="h-3.5 w-3.5"
                />
                Départ plot
              </label>
              <label className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
                <Checkbox
                  checked={raceContext.hasTechSuit}
                  onCheckedChange={(checked) =>
                    setRaceContext((prev) => ({ ...prev, hasTechSuit: checked === true }))
                  }
                  aria-label="Inclure la combinaison"
                  className="h-3.5 w-3.5"
                />
                Combinaison
              </label>
            </div>
          </div>
        )}

        {/* Matrix table — table-fixed+w-full distributes columns across available width, no horizontal scroll */}
        <div className="rounded-md border border-border/30 overflow-hidden">
          <table className="w-full table-fixed border-collapse text-left bg-card">
            <thead>
              <tr className="border-b border-border/40 bg-muted/30">
                <th
                  scope="col"
                  className="w-10 py-2 pl-3 pr-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50"
                >
                  m
                </th>
                {cols.map(({ zone, label, headerCls }) => (
                  <th
                    key={zone}
                    scope="col"
                    className={`py-2 px-1 text-[10px] font-bold uppercase tracking-widest ${headerCls} text-right`}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => {
                const isTargetRow = d === targetDistanceM;
                return (
                  <tr
                    key={d}
                    className={[
                      "border-b border-border/20 last:border-0",
                      isTargetRow ? "bg-primary/5" : "",
                    ].join(" ")}
                  >
                    <td
                      className={[
                        "py-2.5 pr-2 text-[12px] tabular-nums font-medium",
                        isTargetRow
                          ? "pl-2 border-l-[3px] border-l-primary text-primary font-bold"
                          : "pl-3 text-muted-foreground/70",
                      ].join(" ")}
                    >
                      {d >= 1000 ? `${d / 1000}k` : d}
                    </td>
                    {cols.map(({ zone, cellBold }) => (
                      <td
                        key={zone}
                        className={[
                          "py-2.5 px-1 font-mono text-[11px] tabular-nums text-right",
                          cellBold
                            ? "font-bold text-foreground"
                            : "text-foreground/80",
                        ].join(" ")}
                      >
                        {cellTimeStr(d, zone)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Disclaimer */}
        <p className="text-[9px] text-muted-foreground/40 text-center leading-tight pt-0.5">
          Modèle non-linéaire v2 (basé sur regles_calcul_allures_natation.docx).
          Coefficients à calibrer par tests individuels — voir §187.
        </p>
      </div>
    </TooltipProvider>
  );
}
