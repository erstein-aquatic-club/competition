/**
 * WellnessTrend — reusable wellness trend chart for coach views.
 *
 * - compact mode: 7 tiny vertical bars (last 7 days of readiness).
 * - full mode: Recharts AreaChart with colored reference bands.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getWellnessRange, computeReadinessScore } from "@/lib/api/wellness";
import type { WellnessCheck } from "@/lib/api/types";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceArea,
  ResponsiveContainer,
} from "recharts";

// ── Helpers ────────────────────────────────────────────────

function readinessColor(score: number): string {
  if (score > 70) return "var(--status-success)";
  if (score >= 40) return "var(--status-warning)";
  return "var(--status-error)";
}

function readinessTailwind(score: number) {
  if (score > 70) return "bg-emerald-500";
  if (score >= 40) return "bg-amber-500";
  return "bg-red-500";
}

function formatDateShort(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoDate(d);
}

// ── Types ──────────────────────────────────────────────────

export interface WellnessTrendProps {
  userId: number;
  days?: number; // default 28
  mode?: "compact" | "full"; // default "compact"
}

// ── Component ──────────────────────────────────────────────

export default function WellnessTrend({
  userId,
  days = 28,
  mode = "compact",
}: WellnessTrendProps) {
  const endDate = useMemo(() => isoDate(new Date()), []);
  const startDate = useMemo(() => daysAgo(days - 1), [days]);

  const { data: checks = [] } = useQuery({
    queryKey: ["wellness-range", userId, startDate, endDate],
    queryFn: () => getWellnessRange(userId, startDate, endDate),
    staleTime: 5 * 60 * 1000,
    enabled: userId > 0,
  });

  if (mode === "compact") {
    return <CompactBars checks={checks} />;
  }

  return <FullChart checks={checks} days={days} />;
}

// ── Compact bars (7 days) ──────────────────────────────────

function CompactBars({ checks }: { checks: WellnessCheck[] }) {
  const byDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of checks) {
      map.set(c.date, c.readiness_score ?? computeReadinessScore(c));
    }
    return map;
  }, [checks]);

  const bars = useMemo(() => {
    const result: Array<{ date: string; score: number | null }> = [];
    for (let i = 6; i >= 0; i--) {
      const d = daysAgo(i);
      result.push({ date: d, score: byDate.get(d) ?? null });
    }
    return result;
  }, [byDate]);

  return (
    <div className="flex items-end gap-[3px]" style={{ width: 56, height: 24 }}>
      {bars.map((b) =>
        b.score != null ? (
          <div
            key={b.date}
            className={`w-[5px] rounded-sm ${readinessTailwind(b.score)}`}
            style={{ height: `${Math.max(12, (b.score / 100) * 100)}%` }}
          />
        ) : (
          <div
            key={b.date}
            className="w-[5px] rounded-full bg-muted"
            style={{ height: 4, alignSelf: "center" }}
          />
        ),
      )}
    </div>
  );
}

// ── Full Recharts chart ────────────────────────────────────

interface ChartPoint {
  date: string;
  label: string;
  readiness: number | null;
  sleep: number | null;
  fatigue: number | null;
  mood: number | null;
  stress: number | null;
  soreness: number | null;
}

function FullChart({ checks, days }: { checks: WellnessCheck[]; days: number }) {
  const data = useMemo<ChartPoint[]>(() => {
    const byDate = new Map<string, WellnessCheck>();
    for (const c of checks) byDate.set(c.date, c);

    const points: ChartPoint[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = daysAgo(i);
      const c = byDate.get(d);
      points.push({
        date: d,
        label: formatDateShort(d),
        readiness: c ? (c.readiness_score ?? computeReadinessScore(c)) : null,
        sleep: c ? c.sleep_quality * 10 : null,
        fatigue: c ? (11 - c.fatigue * 2) * 10 : null,
        mood: c ? c.mood * 10 : null,
        stress: c ? (11 - c.stress * 2) * 10 : null,
        soreness: c ? (11 - c.soreness * 2) * 10 : null,
      });
    }
    return points;
  }, [checks, days]);

  if (data.every((p) => p.readiness == null)) {
    return (
      <p className="text-xs text-muted-foreground text-center py-6">
        Aucune donnée bien-être sur cette période.
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        {/* Reference bands */}
        <ReferenceArea y1={70} y2={100} fill="hsl(var(--status-success))" fillOpacity={0.07} />
        <ReferenceArea y1={40} y2={70} fill="hsl(var(--status-warning))" fillOpacity={0.07} />
        <ReferenceArea y1={0} y2={40} fill="hsl(var(--status-error))" fillOpacity={0.07} />

        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          domain={[0, 100]}
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          axisLine={false}
          tickLine={false}
          ticks={[0, 40, 70, 100]}
        />
        <Tooltip content={<WellnessTooltip />} />
        <Area
          type="monotone"
          dataKey="readiness"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          fill="hsl(var(--primary))"
          fillOpacity={0.12}
          connectNulls
          dot={false}
          activeDot={{ r: 4, fill: "hsl(var(--primary))" }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ── Custom tooltip ─────────────────────────────────────────

function WellnessTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ChartPoint }> }) {
  if (!active || !payload?.[0]) return null;
  const p = payload[0].payload;
  if (p.readiness == null) return null;

  const items = [
    { label: "Readiness", value: p.readiness },
    { label: "Sommeil", value: p.sleep },
    { label: "Fatigue", value: p.fatigue },
    { label: "Humeur", value: p.mood },
    { label: "Stress", value: p.stress },
    { label: "Douleurs", value: p.soreness },
  ];

  return (
    <div className="rounded-lg border bg-card p-2.5 shadow-lg text-xs space-y-1">
      <p className="font-semibold">{p.label}</p>
      {items.map(
        (it) =>
          it.value != null && (
            <div key={it.label} className="flex justify-between gap-4">
              <span className="text-muted-foreground">{it.label}</span>
              <span
                className="font-medium tabular-nums"
                style={{
                  color:
                    it.label === "Readiness"
                      ? `hsl(${readinessColor(it.value)})`
                      : undefined,
                }}
              >
                {it.value}
              </span>
            </div>
          ),
      )}
    </div>
  );
}

// ── Readiness badge (for overview cards) ───────────────────

export function ReadinessBadge({
  score,
  declining,
}: {
  score: number | null;
  declining?: boolean;
}) {
  if (score == null) {
    return (
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
        —
      </span>
    );
  }

  const bg =
    score > 70
      ? "bg-emerald-100 dark:bg-emerald-900/30"
      : score >= 40
        ? "bg-amber-100 dark:bg-amber-900/30"
        : "bg-red-100 dark:bg-red-900/30";
  const text =
    score > 70
      ? "text-emerald-700 dark:text-emerald-400"
      : score >= 40
        ? "text-amber-700 dark:text-amber-400"
        : "text-red-700 dark:text-red-400";

  return (
    <span className="inline-flex items-center gap-0.5">
      <span
        className={`inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded-full px-1 text-[11px] font-bold tabular-nums ${bg} ${text}`}
      >
        {score}
      </span>
      {declining && <span className="text-amber-500 text-xs" title="Tendance en baisse (3j+)">&#9888;</span>}
    </span>
  );
}
