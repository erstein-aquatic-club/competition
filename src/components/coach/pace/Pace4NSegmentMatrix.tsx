import React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  eventFamily,
  compute4NSegment,
  compute4NCumulative,
  computeZoneTime,
  computeRaceContextAdjustedTime,
  type StrokeAdjustmentOverrides,
  type ZoneCoefficientsOverride,
  type RaceContextOptions,
} from "@/lib/paceCalculatorV2";
import { fmtTime } from "@/lib/formatTime";
import { SEGMENTS_4N, type EventFamily, type Zone } from "@/lib/paceData";

type SingleStroke = "crawl" | "dos" | "brasse" | "papillon";
type SegStroke = "papillon" | "dos" | "brasse" | "crawl";

interface Props {
  targetTimeMs: number;
  targetDistanceM: 200 | 400;
  swimmerSex?: "M" | "F" | null;
  targetPool?: "25m" | "50m";
  zones: Record<EventFamily, Partial<Record<Zone, number>>>;
  strokeAdjustments: Record<SingleStroke, Record<EventFamily, number>>;
}

const STROKE_META: Record<SegStroke, { label: string; headerBg: string; headerText: string; borderColor: string; rowBg: string }> = {
  papillon: {
    label: "Papillon",
    headerBg: "bg-stroke-pap/10",
    headerText: "text-stroke-pap",
    borderColor: "border-stroke-pap/40",
    rowBg: "bg-stroke-pap/5",
  },
  dos: {
    label: "Dos",
    headerBg: "bg-stroke-dos/10",
    headerText: "text-stroke-dos",
    borderColor: "border-stroke-dos/40",
    rowBg: "bg-stroke-dos/5",
  },
  brasse: {
    label: "Brasse",
    headerBg: "bg-stroke-br/10",
    headerText: "text-stroke-br",
    borderColor: "border-stroke-br/40",
    rowBg: "bg-stroke-br/5",
  },
  crawl: {
    label: "Crawl",
    headerBg: "bg-stroke-nl/10",
    headerText: "text-stroke-nl",
    borderColor: "border-stroke-nl/40",
    rowBg: "bg-stroke-nl/5",
  },
};

const ZONE_COLS: { zone: Zone; label: string; hCls: string; bold: boolean }[] = [
  { zone: "V0",  label: "V0",  hCls: "text-intensity-prog", bold: false },
  { zone: "V1",  label: "V1",  hCls: "text-intensity-1",    bold: false },
  { zone: "V2",  label: "V2",  hCls: "text-intensity-2",    bold: false },
  { zone: "V3",  label: "V3",  hCls: "text-intensity-3",    bold: false },
  { zone: "V4",  label: "V4",  hCls: "text-intensity-4",    bold: false },
  { zone: "MAX", label: "MAX", hCls: "text-intensity-5",    bold: true  },
];

export function Pace4NSegmentMatrix({
  targetTimeMs,
  targetDistanceM,
  swimmerSex,
  zones,
  strokeAdjustments,
}: Props) {
  const [raceContext, setRaceContext] = React.useState<RaceContextOptions>({
    hasStartBlock: true,
    hasTechSuit: true,
  });
  const Tobj_4N_s = targetTimeMs / 1000;
  const mode = targetDistanceM === 200 ? "200" : "400";
  const segments = SEGMENTS_4N[mode];
  const segDist = targetDistanceM === 200 ? 50 : 100;
  const halfDist = segDist / 2;
  const subRows = [halfDist, segDist];
  const family = eventFamily(segDist);

  const cumDistances = targetDistanceM === 200
    ? [50, 100, 150, 200]
    : [100, 200, 300, 400];

  // Stroke segment labels for cumulative section
  const segLabels = targetDistanceM === 200
    ? ["Pap", "Pap+Dos", "Pap+Dos+Br", "Total"]
    : ["Pap", "Pap+Dos", "Pap+Dos+Br", "Total"];

  function segmentTMax(segStroke: SegStroke, d: number): number {
    return compute4NSegment({
      Tobj_4N_s,
      mode,
      segment_stroke: segStroke,
      d_internal: d,
      adjustmentOverrides: strokeAdjustments as StrokeAdjustmentOverrides,
    });
  }

  function cellTime(segStroke: SegStroke, d: number, zone: Zone): string {
    try {
      const tMax = segmentTMax(segStroke, d);
      const tZone = computeZoneTime({
        tMax_s: tMax,
        zone,
        family,
        coefficientsOverride: zones as ZoneCoefficientsOverride,
      });
      const adjusted = computeRaceContextAdjustedTime({
        time_s: tZone,
        D: segDist,
        d,
        stroke: segStroke,
        zone,
        sex: swimmerSex,
        context: raceContext,
      });
      return fmtTime(adjusted, zone === "MAX" ? 2 : 1);
    } catch {
      return "—";
    }
  }

  function cumulTime(dCumul: number): string {
    try {
      const t = compute4NCumulative({ Tobj_4N_s, mode, d_cumulative: dCumul });
      const adjusted = computeRaceContextAdjustedTime({
        time_s: t,
        D: targetDistanceM,
        d: dCumul,
        stroke: "crawl",
        zone: "MAX",
        sex: swimmerSex,
        context: raceContext,
      });
      return fmtTime(adjusted);
    } catch {
      return "—";
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
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

      {/* Segment sub-matrices */}
      {segments.map((seg) => {
        const stroke = seg.stroke as SegStroke;
        const meta = STROKE_META[stroke];
        const segFullTime = (() => {
          try { return fmtTime(segmentTMax(stroke, segDist)); }
          catch { return "—"; }
        })();

        return (
          <div
            key={stroke}
            className={`rounded-md border ${meta.borderColor} overflow-hidden`}
          >
            {/* Segment header */}
            <div className={`flex items-center gap-2 px-3 py-2 ${meta.headerBg} border-b ${meta.borderColor}`}>
              <span className={`text-[11px] font-bold uppercase tracking-widest ${meta.headerText}`}>
                {meta.label}
              </span>
              <span className="text-[10px] text-muted-foreground/60 font-medium">
                {segDist}m
              </span>
              <span className={`ml-auto font-mono text-[11px] font-semibold ${meta.headerText} tabular-nums`}>
                {segFullTime}
              </span>
            </div>

            {/* Sub-matrix */}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left min-w-[280px]">
                <thead>
                  <tr className="border-b border-border/20 bg-muted/20">
                    <th
                      scope="col"
                      className="sticky left-0 z-10 bg-muted/20 py-1.5 pr-2 pl-3 text-[9px] font-medium uppercase tracking-widest text-muted-foreground/50 min-w-[36px]"
                    >
                      m
                    </th>
                    {ZONE_COLS.map(({ zone, label, hCls }) => (
                      <th
                        key={zone}
                        scope="col"
                        className={`py-1.5 px-2 text-[9px] font-bold uppercase tracking-widest ${hCls} text-right min-w-[48px]`}
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {subRows.map((d) => {
                    const isFullSeg = d === segDist;
                    return (
                      <tr
                        key={d}
                        className={[
                          "border-b border-border/15 last:border-0",
                          isFullSeg ? meta.rowBg : "",
                        ].join(" ")}
                      >
                        <td
                          className={[
                            "sticky left-0 z-10 py-2 pr-2 pl-3 text-[10px] tabular-nums min-h-[32px]",
                            isFullSeg
                              ? `${meta.rowBg} font-semibold ${meta.headerText}`
                              : "bg-background text-muted-foreground/70",
                          ].join(" ")}
                        >
                          {d}
                        </td>
                        {ZONE_COLS.map(({ zone, bold }) => (
                          <td
                            key={zone}
                            className={[
                              "py-2 px-2 font-mono text-[12px] tabular-nums text-right",
                              bold
                                ? "font-bold text-foreground"
                                : "text-foreground/80",
                            ].join(" ")}
                          >
                            {cellTime(stroke, d, zone)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {/* Cumulative recap */}
      <div className="rounded-md border border-border/40 bg-muted/30 overflow-hidden">
        <div className="px-3 py-2 border-b border-border/30">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
            Temps cumulés — tMAX course
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left min-w-[220px]">
            <thead>
              <tr className="border-b border-border/20">
                <th scope="col" className="py-1.5 pl-3 pr-2 text-[9px] font-medium uppercase tracking-widest text-muted-foreground/50 min-w-[80px]">
                  Distance
                </th>
                <th scope="col" className="py-1.5 px-2 text-[9px] font-medium uppercase tracking-widest text-muted-foreground/50 text-right min-w-[72px]">
                  tMAX
                </th>
              </tr>
            </thead>
            <tbody>
              {cumDistances.map((d, i) => (
                <tr key={d} className="border-b border-border/15 last:border-0">
                  <td className="py-2 pl-3 pr-2 text-[11px] text-muted-foreground/80">
                    <span className="tabular-nums font-medium">{d}m</span>
                    {" "}
                    <span className="text-[9px] text-muted-foreground/40">
                      ({segLabels[i]})
                    </span>
                  </td>
                  <td className="py-2 px-2 font-mono text-[13px] tabular-nums text-right font-semibold text-foreground">
                    {cumulTime(d)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Disclaimer */}
      <p className="text-[9px] text-muted-foreground/40 text-center leading-tight pt-0.5">
        Modèle non-linéaire v2 (basé sur regles_calcul_allures_natation.docx).
        Coefficients à calibrer par tests individuels — voir §187.
      </p>
    </div>
  );
}
