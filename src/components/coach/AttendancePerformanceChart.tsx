/**
 * AttendancePerformanceChart — scatter plot showing correlation between
 * attendance rate and performance improvement for swimmers in a group.
 */

import { useState, useMemo } from "react";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import {
  useAttendancePerformance,
  type AttendancePerformancePoint,
} from "@/hooks/useAttendancePerformance";

// ── Types ────────────────────────────────────────────────────

export interface AttendancePerformanceChartProps {
  groupId?: number;
  highlightUserId?: number; // highlight one swimmer in the scatter
}

type PeriodMonths = 3 | 6 | 12;

// ── Helpers ──────────────────────────────────────────────────

function correlationLabel(r: number): { text: string; className: string } {
  const abs = Math.abs(r);
  if (abs < 0.2) return { text: "Pas de corrélation significative", className: "text-muted-foreground" };
  if (abs < 0.4) return { text: "Corrélation faible", className: "text-amber-500" };
  if (abs < 0.6) return { text: "Corrélation modérée", className: "text-blue-500" };
  return { text: "Corrélation forte", className: "text-emerald-500" };
}

/**
 * Compute linear regression line (y = mx + b) from points.
 */
function linearRegression(points: AttendancePerformancePoint[]): {
  slope: number;
  intercept: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
} | null {
  if (points.length < 2) return null;
  const n = points.length;
  const sumX = points.reduce((s, p) => s + p.attendance, 0);
  const sumY = points.reduce((s, p) => s + p.improvement, 0);
  const sumXY = points.reduce((s, p) => s + p.attendance * p.improvement, 0);
  const sumX2 = points.reduce((s, p) => s + p.attendance * p.attendance, 0);
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return null;
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  const minX = Math.min(...points.map((p) => p.attendance));
  const maxX = Math.max(...points.map((p) => p.attendance));
  return {
    slope,
    intercept,
    x1: minX,
    y1: slope * minX + intercept,
    x2: maxX,
    y2: slope * maxX + intercept,
  };
}

// ── Component ────────────────────────────────────────────────

export default function AttendancePerformanceChart({
  groupId,
  highlightUserId,
}: AttendancePerformanceChartProps) {
  const [months, setMonths] = useState<PeriodMonths>(6);

  const { points, correlation, isLoading } = useAttendancePerformance({
    groupId,
    months,
  });

  // Compute summary stat: avg improvement for swimmers with >80% attendance
  const summary = useMemo(() => {
    const highAttendance = points.filter((p) => p.attendance >= 80);
    const lowAttendance = points.filter((p) => p.attendance < 80);
    if (highAttendance.length === 0) return null;
    const avgHigh =
      highAttendance.reduce((s, p) => s + p.improvement, 0) /
      highAttendance.length;
    const avgLow =
      lowAttendance.length > 0
        ? lowAttendance.reduce((s, p) => s + p.improvement, 0) /
          lowAttendance.length
        : null;
    return { avgHigh, avgLow, countHigh: highAttendance.length };
  }, [points]);

  // Trend line data
  const trendLine = useMemo(() => linearRegression(points), [points]);

  // Separate highlighted point from others
  const { mainPoints, highlightPoint } = useMemo(() => {
    if (!highlightUserId) return { mainPoints: points, highlightPoint: null };
    const hp = points.find((p) => p.userId === highlightUserId) ?? null;
    const mp = points.filter((p) => p.userId !== highlightUserId);
    return { mainPoints: mp, highlightPoint: hp };
  }, [points, highlightUserId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (points.length === 0) {
    return (
      <p className="text-xs text-muted-foreground text-center py-6">
        Pas assez de données sur cette période. Les nageurs doivent avoir des
        performances FFN en début et fin de période.
      </p>
    );
  }

  const corLabel = correlationLabel(correlation);

  return (
    <div className="space-y-3">
      {/* Chart */}
      <ResponsiveContainer width="100%" height={240} className="sm:!h-[300px]">
        <ScatterChart margin={{ top: 8, right: 8, left: -10, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} />
          <XAxis
            type="number"
            dataKey="attendance"
            name="Présence"
            unit="%"
            domain={[0, 100]}
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            axisLine={false}
            tickLine={false}
            label={{
              value: "Présence (%)",
              position: "insideBottom",
              offset: -2,
              style: { fontSize: 10, fill: "hsl(var(--muted-foreground))" },
            }}
          />
          <YAxis
            type="number"
            dataKey="improvement"
            name="Amélioration"
            unit="%"
            reversed
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            axisLine={false}
            tickLine={false}
            label={{
              value: "Temps (% + rapide en haut)",
              angle: -90,
              position: "insideLeft",
              offset: 15,
              style: { fontSize: 9, fill: "hsl(var(--muted-foreground))" },
            }}
          />
          <Tooltip content={<CorrelationTooltip />} />
          <ReferenceLine y={0} stroke="hsl(var(--border))" strokeDasharray="3 3" />

          {/* Main scatter dots */}
          <Scatter
            data={mainPoints}
            fill="hsl(var(--chart-1))"
            fillOpacity={0.7}
            r={5}
          />

          {/* Highlighted swimmer dot */}
          {highlightPoint && (
            <Scatter
              data={[highlightPoint]}
              fill="hsl(var(--primary))"
              fillOpacity={1}
              r={7}
              shape="star"
            />
          )}

          {/* Trend line via two-point scatter with line type */}
          {trendLine && (
            <Scatter
              data={[
                { attendance: trendLine.x1, improvement: trendLine.y1, name: "__trend__" },
                { attendance: trendLine.x2, improvement: trendLine.y2, name: "__trend__" },
              ]}
              fill="none"
              line={{ stroke: "hsl(var(--primary))", strokeWidth: 1.5, strokeDasharray: "6 3" }}
              legendType="none"
              r={0}
            />
          )}
        </ScatterChart>
      </ResponsiveContainer>

      {/* Summary stats */}
      <div className="space-y-1.5">
        {summary && (
          <p className="text-xs text-muted-foreground">
            Les nageurs avec {">"}80% de présence
            <span className="mx-1 font-medium text-foreground">
              ({summary.countHigh} nageur{summary.countHigh > 1 ? "s" : ""})
            </span>
            ont{" "}
            {summary.avgHigh < 0 ? (
              <span className="font-medium text-emerald-600">
                amélioré leurs temps de {Math.abs(summary.avgHigh).toFixed(1)}%
              </span>
            ) : (
              <span className="font-medium text-amber-600">
                vu leurs temps augmenter de {summary.avgHigh.toFixed(1)}%
              </span>
            )}
            {" "}en moyenne.
          </p>
        )}

        <div className="flex items-center justify-between gap-2">
          <p className="text-xs">
            <span className={`font-medium ${corLabel.className}`}>
              {corLabel.text}
            </span>
            <span className="ml-1.5 text-muted-foreground tabular-nums">
              r = {correlation.toFixed(2)}
            </span>
          </p>

          {/* Period selector */}
          <div className="flex rounded-lg border bg-muted/50 p-0.5">
            {([3, 6, 12] as PeriodMonths[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMonths(m)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
                  months === m
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {m} mois
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Custom tooltip ───────────────────────────────────────────

function CorrelationTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: AttendancePerformancePoint }>;
}) {
  if (!active || !payload?.[0]) return null;
  const p = payload[0].payload;
  // Skip trend line ghost points
  if (p.name === "__trend__") return null;

  return (
    <div className="rounded-lg border bg-card p-2.5 shadow-lg text-xs space-y-1">
      <p className="font-semibold">{p.name}</p>
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">Présence</span>
        <span className="font-medium tabular-nums">{p.attendance}%</span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">Amélioration</span>
        <span
          className={`font-medium tabular-nums ${
            p.improvement < 0 ? "text-emerald-500" : p.improvement > 0 ? "text-red-500" : ""
          }`}
        >
          {p.improvement > 0 ? "+" : ""}
          {p.improvement.toFixed(2)}%
        </span>
      </div>
      {p.improvement < 0 && (
        <p className="text-[10px] text-emerald-500">Plus rapide</p>
      )}
      {p.improvement > 0 && (
        <p className="text-[10px] text-red-500">Plus lent</p>
      )}
    </div>
  );
}
