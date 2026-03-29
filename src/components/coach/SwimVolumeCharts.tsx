/**
 * SwimVolumeCharts — Stacked bar charts for swim volume analytics.
 *
 * Full mode: 3 views (par nage, par type, par intensite) via segmented tabs.
 * Compact mode: single chart (par nage), smaller height.
 */

import { useState, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Line,
  ComposedChart,
  ResponsiveContainer,
} from "recharts";
import type { WeeklySwimVolume } from "@/lib/swimAnalytics";

// ── Props ────────────────────────────────────────────────────

export interface SwimVolumeChartsProps {
  weeklyVolumes: WeeklySwimVolume[];
  mode?: "compact" | "full";
  onWeeksChange?: (weeks: number) => void;
  selectedWeeks?: number;
}

// ── Color maps ───────────────────────────────────────────────

const STROKE_COLORS: Record<string, string> = {
  NL: "#3b82f6",    // blue-500
  DOS: "#10b981",   // emerald-500
  BR: "#f43f5e",    // rose-500
  PAP: "#8b5cf6",   // violet-500
  QN: "#f59e0b",    // amber-500
  EDU: "#14b8a6",   // teal-500
  MIXTE: "#6b7280", // gray-500
};

const TYPE_COLORS: Record<string, string> = {
  endurance: "#3b82f6", // blue-500
  technique: "#10b981", // emerald-500
  vitesse: "#ef4444",   // red-500
  mixte: "#6b7280",     // gray-500
};

const INTENSITY_COLORS: Record<string, string> = {
  V0: "#93c5fd",   // blue-300
  V1: "#60a5fa",   // blue-400
  V2: "#fbbf24",   // amber-400
  V3: "#f97316",   // orange-500
  Max: "#ef4444",  // red-500
  Prog: "#a78bfa", // purple-400
};

const STROKE_LABELS: Record<string, string> = {
  NL: "Nage libre",
  DOS: "Dos",
  BR: "Brasse",
  PAP: "Papillon",
  QN: "4 nages",
  EDU: "Educatif",
  MIXTE: "Mixte",
};

const TYPE_LABELS: Record<string, string> = {
  endurance: "Endurance",
  technique: "Technique",
  vitesse: "Vitesse",
  mixte: "Mixte",
};

const INTENSITY_LABELS: Record<string, string> = {
  V0: "V0",
  V1: "V1",
  V2: "V2",
  V3: "V3",
  Max: "Max",
  Prog: "Prog",
};

type ViewMode = "nage" | "type" | "intensite";
const WEEK_OPTIONS = [4, 8, 12] as const;

// ── Helpers ──────────────────────────────────────────────────

/** Extract ISO week number from a Monday date string */
function isoWeekLabel(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  // ISO week calculation
  const tmp = new Date(d.getTime());
  tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7));
  const jan4 = new Date(tmp.getFullYear(), 0, 4);
  const weekNum =
    1 +
    Math.round(
      ((tmp.getTime() - jan4.getTime()) / 86_400_000 -
        3 +
        ((jan4.getDay() + 6) % 7)) /
        7,
    );
  return `S${weekNum}`;
}

function formatMeters(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}km`;
  return `${value}m`;
}

/** Collect all unique keys across weekly volumes for a given dimension */
function collectKeys(
  volumes: WeeklySwimVolume[],
  accessor: (v: WeeklySwimVolume) => Record<string, number>,
): string[] {
  const keys = new Set<string>();
  for (const v of volumes) {
    for (const k of Object.keys(accessor(v))) {
      keys.add(k);
    }
  }
  return Array.from(keys);
}

// ── Chart data builders ──────────────────────────────────────

function buildStrokeData(volumes: WeeklySwimVolume[]) {
  const keys = collectKeys(volumes, (v) => v.byStroke);
  const ordered = ["NL", "DOS", "BR", "PAP", "QN", "EDU", "MIXTE"].filter(
    (k) => keys.includes(k),
  );
  const data = volumes.map((v) => ({
    week: isoWeekLabel(v.weekStart),
    total: v.totalMeters,
    ...Object.fromEntries(ordered.map((k) => [k, v.byStroke[k] ?? 0])),
  }));
  return { data, keys: ordered };
}

function buildTypeData(volumes: WeeklySwimVolume[]) {
  const keys = collectKeys(volumes, (v) => v.byType);
  const ordered = ["endurance", "technique", "vitesse", "mixte"].filter((k) =>
    keys.includes(k),
  );
  const data = volumes.map((v) => ({
    week: isoWeekLabel(v.weekStart),
    total: v.totalMeters,
    ...Object.fromEntries(ordered.map((k) => [k, v.byType[k] ?? 0])),
  }));
  return { data, keys: ordered };
}

function buildIntensityData(volumes: WeeklySwimVolume[]) {
  const keys = collectKeys(volumes, (v) => v.byIntensity);
  const ordered = ["V0", "V1", "V2", "V3", "Max", "Prog"].filter((k) =>
    keys.includes(k),
  );
  const data = volumes.map((v) => ({
    week: isoWeekLabel(v.weekStart),
    total: v.totalMeters,
    ...Object.fromEntries(ordered.map((k) => [k, v.byIntensity[k] ?? 0])),
  }));
  return { data, keys: ordered };
}

// ── Custom tooltip ───────────────────────────────────────────

function ChartTooltip({
  active,
  payload,
  label,
  colorMap,
  labelMap,
}: {
  active?: boolean;
  payload?: Array<{ dataKey: string; value: number; color: string }>;
  label?: string;
  colorMap: Record<string, string>;
  labelMap: Record<string, string>;
}) {
  if (!active || !payload?.length) return null;

  const totalEntry = payload.find((p) => p.dataKey === "total");
  const items = payload.filter((p) => p.dataKey !== "total" && p.value > 0);

  return (
    <div className="rounded-lg border bg-card p-2.5 shadow-lg text-xs space-y-1 min-w-[120px]">
      <p className="font-semibold">{label}</p>
      {totalEntry && (
        <div className="flex justify-between gap-4 border-b pb-1 mb-1">
          <span className="text-muted-foreground">Total</span>
          <span className="font-bold tabular-nums">
            {formatMeters(totalEntry.value)}
          </span>
        </div>
      )}
      {items.map((item) => (
        <div key={item.dataKey} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-full shrink-0"
              style={{ backgroundColor: colorMap[item.dataKey] ?? item.color }}
            />
            <span className="text-muted-foreground">
              {labelMap[item.dataKey] ?? item.dataKey}
            </span>
          </span>
          <span className="font-medium tabular-nums">
            {formatMeters(item.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Stacked bar sub-component ────────────────────────────────

function StackedVolumeChart({
  data,
  keys,
  colorMap,
  labelMap,
  height,
}: {
  data: Array<Record<string, unknown>>;
  keys: string[];
  colorMap: Record<string, string>;
  labelMap: Record<string, string>;
  height: number;
}) {
  if (data.length === 0) {
    return (
      <p className="text-xs text-muted-foreground text-center py-8">
        Aucune donnee de volume sur cette periode.
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart
        data={data}
        margin={{ top: 4, right: 4, left: -16, bottom: 0 }}
      >
        <XAxis
          dataKey="week"
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => formatMeters(v)}
        />
        <Tooltip
          content={
            <ChartTooltip colorMap={colorMap} labelMap={labelMap} />
          }
        />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 10, paddingTop: 8 }}
          formatter={(value: string) => labelMap[value] ?? value}
        />
        {keys.map((key) => (
          <Bar
            key={key}
            dataKey={key}
            stackId="volume"
            fill={colorMap[key] ?? "#6b7280"}
            radius={
              key === keys[keys.length - 1]
                ? [3, 3, 0, 0]
                : [0, 0, 0, 0]
            }
          />
        ))}
        <Line
          type="monotone"
          dataKey="total"
          stroke="hsl(var(--foreground))"
          strokeWidth={1.5}
          strokeDasharray="4 3"
          dot={false}
          legendType="none"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ── Main component ───────────────────────────────────────────

export default function SwimVolumeCharts({
  weeklyVolumes,
  mode = "full",
  onWeeksChange,
  selectedWeeks = 8,
}: SwimVolumeChartsProps) {
  const [view, setView] = useState<ViewMode>("nage");

  const strokeChart = useMemo(
    () => buildStrokeData(weeklyVolumes),
    [weeklyVolumes],
  );
  const typeChart = useMemo(
    () => buildTypeData(weeklyVolumes),
    [weeklyVolumes],
  );
  const intensityChart = useMemo(
    () => buildIntensityData(weeklyVolumes),
    [weeklyVolumes],
  );

  const chartHeight = mode === "compact" ? 160 : 220;

  if (mode === "compact") {
    return (
      <StackedVolumeChart
        data={strokeChart.data}
        keys={strokeChart.keys}
        colorMap={STROKE_COLORS}
        labelMap={STROKE_LABELS}
        height={chartHeight}
      />
    );
  }

  return (
    <div className="space-y-3">
      {/* Controls row */}
      <div className="flex items-center justify-between gap-2">
        {/* View tabs */}
        <div className="flex gap-1 rounded-lg border p-0.5">
          {(
            [
              { key: "nage", label: "Nage" },
              { key: "type", label: "Type" },
              { key: "intensite", label: "Intensite" },
            ] as const
          ).map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setView(key)}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
                view === key
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Period selector */}
        {onWeeksChange && (
          <div className="flex gap-1 rounded-lg border p-0.5">
            {WEEK_OPTIONS.map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => onWeeksChange(w)}
                className={`rounded-md px-2 py-1 text-[11px] font-medium transition ${
                  selectedWeeks === w
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {w}s
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Chart */}
      {view === "nage" && (
        <StackedVolumeChart
          data={strokeChart.data}
          keys={strokeChart.keys}
          colorMap={STROKE_COLORS}
          labelMap={STROKE_LABELS}
          height={chartHeight}
        />
      )}
      {view === "type" && (
        <StackedVolumeChart
          data={typeChart.data}
          keys={typeChart.keys}
          colorMap={TYPE_COLORS}
          labelMap={TYPE_LABELS}
          height={chartHeight}
        />
      )}
      {view === "intensite" && (
        <StackedVolumeChart
          data={intensityChart.data}
          keys={intensityChart.keys}
          colorMap={INTENSITY_COLORS}
          labelMap={INTENSITY_LABELS}
          height={chartHeight}
        />
      )}
    </div>
  );
}
