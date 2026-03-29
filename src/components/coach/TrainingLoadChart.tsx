/**
 * TrainingLoadChart — detailed training load chart for the coach swimmer detail page.
 *
 * Shows stacked bars (swim + strength) with ACWR line overlay,
 * optimal zone reference area, and alert based on current ACWR value.
 */

import { useState, useMemo } from "react";
import { useTrainingLoad } from "@/hooks/useTrainingLoad";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceArea,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { computeACWR, computeAcuteLoad, computeChronicLoad } from "@/lib/trainingLoadHelpers";

// ── Types ─────────────────────────────────────────────────

export interface TrainingLoadChartProps {
  userId: number;
  days?: number; // default 28, toggle 56
}

interface ChartPoint {
  date: string;
  label: string;
  swimLoad: number;
  strengthLoad: number;
  totalLoad: number;
  acwr: number | null;
}

// ── Helpers ───────────────────────────────────────────────

function formatDateDD_MM(iso: string): string {
  const parts = iso.split("-");
  if (parts.length < 3) return iso;
  return `${parts[2]}/${parts[1]}`;
}

function acwrLabel(acwr: number | null): { text: string; className: string } {
  if (acwr === null) return { text: "Données insuffisantes", className: "text-muted-foreground" };
  if (acwr > 1.5) return { text: "Risque de surcharge", className: "text-red-500" };
  if (acwr < 0.6) return { text: "Sous-entraînement", className: "text-amber-500" };
  if (acwr >= 0.8 && acwr <= 1.3) return { text: "Zone optimale", className: "text-emerald-500" };
  return { text: "Charge modérée", className: "text-muted-foreground" };
}

function acwrIcon(acwr: number | null): string {
  if (acwr === null) return "";
  if (acwr > 1.5 || acwr < 0.6) return "\u26a0\ufe0f ";
  if (acwr >= 0.8 && acwr <= 1.3) return "\u2705 ";
  return "";
}

// ── Component ─────────────────────────────────────────────

export default function TrainingLoadChart({
  userId,
  days: defaultDays = 28,
}: TrainingLoadChartProps) {
  const [period, setPeriod] = useState<28 | 56>(defaultDays === 56 ? 56 : 28);

  const { dailyLoads, acwr, isLoading } = useTrainingLoad({
    userId,
    days: period,
  });

  // Compute rolling ACWR for each day to draw the line
  const chartData = useMemo<ChartPoint[]>(() => {
    return dailyLoads.map((d, i) => {
      // Compute ACWR at this point using all loads up to this day
      const slice = dailyLoads.slice(0, i + 1);
      const srpeValues = slice
        .filter((s) => s.totalLoad > 0)
        .map((s) => ({ date: s.date, srpe: s.totalLoad }));
      const acute = computeAcuteLoad(srpeValues);
      const chronic = computeChronicLoad(srpeValues);
      const dayAcwr = computeACWR(acute, chronic);

      return {
        date: d.date,
        label: formatDateDD_MM(d.date),
        swimLoad: d.swimLoad,
        strengthLoad: d.strengthLoad,
        totalLoad: d.totalLoad,
        acwr: dayAcwr,
      };
    });
  }, [dailyLoads]);

  const maxLoad = useMemo(() => {
    const max = Math.max(...chartData.map((d) => d.totalLoad), 1);
    return Math.ceil(max * 1.1); // 10% headroom
  }, [chartData]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (chartData.length === 0 || chartData.every((d) => d.totalLoad === 0)) {
    return (
      <p className="text-xs text-muted-foreground text-center py-6">
        Aucune donnée de charge sur cette période.
      </p>
    );
  }

  const alert = acwrLabel(acwr);
  const icon = acwrIcon(acwr);

  return (
    <div className="space-y-3">
      {/* Chart */}
      <ResponsiveContainer width="100%" height={200} className="sm:!h-[280px]">
        <ComposedChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} vertical={false} />

          {/* Optimal ACWR zone (0.8-1.3) on right axis */}
          <ReferenceArea
            yAxisId="acwr"
            y1={0.8}
            y2={1.3}
            fill="hsl(142 71% 45%)"
            fillOpacity={0.08}
          />

          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />

          {/* Left Y axis: load */}
          <YAxis
            yAxisId="load"
            domain={[0, maxLoad]}
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            axisLine={false}
            tickLine={false}
          />

          {/* Right Y axis: ACWR */}
          <YAxis
            yAxisId="acwr"
            orientation="right"
            domain={[0, 2.5]}
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            axisLine={false}
            tickLine={false}
            ticks={[0, 0.8, 1.3, 2, 2.5]}
          />

          <Tooltip content={<LoadTooltip />} />

          {/* Stacked bars */}
          <Bar
            yAxisId="load"
            dataKey="swimLoad"
            stackId="load"
            fill="hsl(var(--chart-1))"
            fillOpacity={0.8}
            radius={[0, 0, 0, 0]}
            name="Natation"
          />
          <Bar
            yAxisId="load"
            dataKey="strengthLoad"
            stackId="load"
            fill="hsl(var(--chart-3))"
            fillOpacity={0.8}
            radius={[2, 2, 0, 0]}
            name="Musculation"
          />

          {/* ACWR line */}
          <Line
            yAxisId="acwr"
            type="monotone"
            dataKey="acwr"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3, fill: "hsl(var(--primary))" }}
            connectNulls
            name="ACWR"
          />
        </ComposedChart>
      </ResponsiveContainer>

      {/* Alert + period toggle */}
      <div className="flex items-center justify-between gap-2">
        <p className={`text-xs font-medium ${alert.className}`}>
          {icon}{alert.text}
          {acwr !== null && (
            <span className="ml-1 text-muted-foreground font-normal">
              (ACWR : {acwr.toFixed(2)})
            </span>
          )}
        </p>

        <div className="flex rounded-lg border bg-muted/50 p-0.5">
          <button
            type="button"
            onClick={() => setPeriod(28)}
            className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
              period === 28
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            4 sem
          </button>
          <button
            type="button"
            onClick={() => setPeriod(56)}
            className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
              period === 56
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            8 sem
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Custom tooltip ────────────────────────────────────────

function LoadTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartPoint }>;
}) {
  if (!active || !payload?.[0]) return null;
  const p = payload[0].payload;

  const zone = acwrLabel(p.acwr);

  return (
    <div className="rounded-lg border bg-card p-2.5 shadow-lg text-xs space-y-1">
      <p className="font-semibold">{formatDateDD_MM(p.date)}</p>
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">Natation</span>
        <span className="font-medium tabular-nums" style={{ color: "hsl(var(--chart-1))" }}>
          {Math.round(p.swimLoad)}
        </span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">Musculation</span>
        <span className="font-medium tabular-nums" style={{ color: "hsl(var(--chart-3))" }}>
          {Math.round(p.strengthLoad)}
        </span>
      </div>
      <div className="flex justify-between gap-4 border-t pt-1">
        <span className="text-muted-foreground">Total</span>
        <span className="font-medium tabular-nums">{Math.round(p.totalLoad)}</span>
      </div>
      {p.acwr !== null && (
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">ACWR</span>
          <span className={`font-medium tabular-nums ${zone.className}`}>
            {p.acwr.toFixed(2)}
          </span>
        </div>
      )}
      {p.acwr !== null && (
        <p className={`text-[10px] ${zone.className}`}>{zone.text}</p>
      )}
    </div>
  );
}
