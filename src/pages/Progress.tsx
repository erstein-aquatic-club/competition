
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import React, { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { getWellnessRange } from "@/lib/api/wellness";
import type { Competition, WellnessCheck } from "@/lib/api/types";
import { computeTrainingDaysRemaining } from "@/lib/date";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Line,
  ComposedChart,
  Cell,
  PieChart,
  Pie,
  Legend,
  Area,
  AreaChart,
} from "recharts";
import { endOfDay, format, startOfDay, subDays } from "date-fns";
import { useAuth } from "@/lib/auth";
import { scoreToColor } from "@/lib/score";
import { isBodyweight } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { getContrastTextColor } from "@/lib/design-tokens";
import type { LocalStrengthRun, SetLogEntry } from "@/lib/types";
import { motion } from "framer-motion";
import { slideUp } from "@/lib/animations";
import { ChevronDown, TrendingUp, TrendingDown, BarChart3, Trophy, Waves, Dumbbell, HeartPulse } from "lucide-react";
import { InlineBanner } from "@/components/shared/InlineBanner";
import { PageHeader } from "@/components/shared/PageHeader";

// ─── Helper Components ──────────────────────────────────────────────────────

type ProgressBarProps = {
  label: string;
  value: number | null;
  max: number;
  invert?: boolean;
};

export function ProgressBar({ label, value, max, invert = false }: ProgressBarProps) {
  const pct = value !== null ? Math.min(100, (value / max) * 100) : 0;
  const color = scoreToColor(value ?? null, { invert }) ?? "hsl(var(--muted-foreground))";

  return (
    <div className="flex items-center gap-3">
      <span className="w-28 shrink-0 text-xs text-muted-foreground truncate">{label}</span>
      <div className="relative h-2 flex-1 rounded-full bg-muted overflow-hidden">
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ backgroundColor: color }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </div>
      <span className="w-10 text-right text-sm font-mono font-semibold tabular-nums">
        {value !== null ? value.toFixed(1) : "-"}
      </span>
    </div>
  );
}

type HeroKpiProps = {
  value: string;
  unit?: string;
  label: string;
  trend?: number | null;
  trendLabel?: string;
};

function HeroKpi({ value, unit, label, trend, trendLabel }: HeroKpiProps) {
  return (
    <motion.div
      className="flex flex-col items-center gap-0.5 py-2"
      variants={slideUp}
      initial="hidden"
      animate="visible"
    >
      <div className="flex items-baseline gap-1">
        <span className="text-4xl font-mono font-bold tracking-tight">{value}</span>
        {unit && <span className="text-lg font-mono text-muted-foreground">{unit}</span>}
      </div>
      <span className="text-sm text-muted-foreground">{label}</span>
      {trend !== null && trend !== undefined && (
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
            trend >= 0 ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-600"
          }`}
        >
          {trend >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {trend >= 0 ? "+" : ""}{trend.toFixed(0)}%{trendLabel ? ` ${trendLabel}` : ""}
        </span>
      )}
    </motion.div>
  );
}

type MetricPillProps = {
  value: string;
  label?: string;
  colored?: boolean;
  colorValue?: number | null;
  invert?: boolean;
};

function MetricPill({ value, label, colored, colorValue, invert }: MetricPillProps) {
  const base = "rounded-full px-3 py-1 text-sm font-mono";
  if (colored && colorValue !== null && colorValue !== undefined) {
    const bg = scoreToColor(colorValue, { invert }) ?? "hsl(var(--muted-foreground))";
    return (
      <span className={base} style={{ backgroundColor: bg, color: getContrastTextColor(bg) }}>
        {value}
      </span>
    );
  }
  return <span className={`${base} bg-muted text-muted-foreground`}>{value}{label ? ` ${label}` : ""}</span>;
}

function ChartSkeleton() {
  return (
    <div className="space-y-3 animate-pulse motion-reduce:animate-none">
      <div className="h-[180px] w-full rounded-xl bg-muted" />
    </div>
  );
}

function CollapsibleSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg bg-muted/50 px-4 py-3 text-sm font-semibold hover:bg-muted transition-colors">
        {title}
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-4 animate-in fade-in slide-in-from-top-2 motion-reduce:animate-none">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

const tooltipStyle = { borderRadius: "8px", border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" };
const PERIOD_OPTIONS = [
  { value: 7, label: "7j" },
  { value: 30, label: "30j" },
  { value: 365, label: "1 an" },
] as const;

// ─── Main Component ─────────────────────────────────────────────────────────

/** Headless version for embedding inside other pages (no PageHeader). */
export function ProgressContent() {
  return <ProgressInner embedded />;
}

export default function Progress() {
  return <ProgressInner />;
}

function ProgressInner({ embedded = false }: { embedded?: boolean }) {
  const user = useAuth((s) => s.user);
  const userId = useAuth((s) => s.userId);
  const role = useAuth((s) => s.role);
  const selectedAthleteId = useAuth((s) => s.selectedAthleteId);
  const selectedAthleteName = useAuth((s) => s.selectedAthleteName);
  const hasCoachSelection =
    (role === "coach" || role === "admin") &&
    (selectedAthleteId !== null || !!selectedAthleteName);
  const athleteName = hasCoachSelection ? selectedAthleteName : user;
  const athleteId = hasCoachSelection ? selectedAthleteId : userId;
  const athleteKey = athleteId ?? athleteName;
  const [historyStatus] = useState("all");
  const [historyFrom] = useState("");
  const [historyTo] = useState("");
  const [swimPeriodDays, setSwimPeriodDays] = useState(30);
  const [strengthPeriodDays, setStrengthPeriodDays] = useState(30);
  const [healthPeriodDays, setHealthPeriodDays] = useState(30);

  // Reset view state when dock icon is tapped while already on this page
  useEffect(() => {
    const reset = () => {
      setSwimPeriodDays(30);
      setStrengthPeriodDays(30);
      setHealthPeriodDays(30);
    };
    window.addEventListener("nav:reset", reset);
    return () => window.removeEventListener("nav:reset", reset);
  }, []);

  // ─── Queries ────────────────────────────────────────────────────────────────

  const { data: competitions = [] } = useQuery<Competition[]>({
    queryKey: ["competitions"],
    queryFn: () => api.getCompetitions(),
  });

  const { data: myCompetitionIds } = useQuery<string[]>({
    queryKey: ["my-competition-ids", athleteKey],
    queryFn: () => api.getMyCompetitionIds(athleteId),
  });

  const { data: assignments } = useQuery({
    queryKey: ["assignments", athleteKey],
    queryFn: () => api.getAssignments(athleteName!, athleteId),
    enabled: !!athleteName,
  });

  const { data: myAbsences = [] } = useQuery({
    queryKey: ["planned-absences", athleteKey],
    queryFn: () =>
      athleteId
        ? api.getPlannedAbsences({ userId: athleteId })
        : api.getMyPlannedAbsences(),
  });

  const absenceDates = useMemo(() => {
    return new Set(myAbsences.map((a: any) => a.date));
  }, [myAbsences]);

  const { data: sessions, isLoading: isSwimLoading } = useQuery({
    queryKey: ["sessions", athleteKey],
    queryFn: () => api.getSessions(athleteName!, athleteId),
    enabled: !!athleteName,
  });

  const strengthHistoryQuery = useInfiniteQuery({
    queryKey: ["strength_history", athleteKey, "progress", historyStatus, historyFrom, historyTo],
    queryFn: ({ pageParam = 0 }) =>
      api.getStrengthHistory(athleteName!, {
        athleteId,
        limit: 10,
        offset: pageParam,
        order: "desc",
        status: historyStatus === "all" ? undefined : historyStatus,
        from: historyFrom || undefined,
        to: historyTo || undefined,
      }),
    enabled: !!athleteName,
    getNextPageParam: (lastPage) => {
      const nextOffset = lastPage.pagination.offset + lastPage.pagination.limit;
      return nextOffset < lastPage.pagination.total ? nextOffset : undefined;
    },
    initialPageParam: 0,
  });
  const strengthRuns = strengthHistoryQuery.data?.pages.flatMap((page) => page.runs) ?? [];

  const strengthRangeFrom = startOfDay(subDays(new Date(), strengthPeriodDays)).toISOString();
  const strengthRangeTo = endOfDay(new Date()).toISOString();
  const strengthPrevFrom = startOfDay(subDays(new Date(), strengthPeriodDays * 2)).toISOString();
  const strengthPrevTo = startOfDay(subDays(new Date(), strengthPeriodDays)).toISOString();

  const { data: strengthHistorySummary, isLoading: isStrengthSummaryLoading } = useQuery({
    queryKey: ["strength_history_summary", athleteKey, "progress", strengthPeriodDays, strengthRangeFrom, strengthRangeTo],
    queryFn: () =>
      api.getStrengthHistory(athleteName!, {
        athleteId,
        limit: 200,
        order: "desc",
        from: strengthRangeFrom,
        to: strengthRangeTo,
      }),
    enabled: !!athleteName,
  });

  const { data: strengthAggregate, isLoading: isStrengthAggregateLoading } = useQuery({
    queryKey: ["strength_history_aggregate", athleteKey, "progress", strengthPeriodDays, strengthRangeFrom, strengthRangeTo],
    queryFn: () =>
      api.getStrengthHistoryAggregate(athleteName!, {
        athleteId,
        period: "day",
        limit: 200,
        order: "asc",
        from: strengthRangeFrom,
        to: strengthRangeTo,
      }),
    enabled: !!athleteName,
  });

  const { data: strengthPrevAggregate } = useQuery({
    queryKey: ["strength_history_aggregate_prev", athleteKey, "progress", strengthPeriodDays, strengthPrevFrom, strengthPrevTo],
    queryFn: () =>
      api.getStrengthHistoryAggregate(athleteName!, {
        athleteId,
        period: "day",
        limit: 200,
        order: "asc",
        from: strengthPrevFrom,
        to: strengthPrevTo,
      }),
    enabled: !!athleteName,
  });

  const isStrengthLoading = isStrengthSummaryLoading || isStrengthAggregateLoading;

  // ─── Wellness (Santé) query ───────────────────────────────────────────────
  const healthFromISO = format(subDays(new Date(), healthPeriodDays), "yyyy-MM-dd");
  const healthToISO = format(new Date(), "yyyy-MM-dd");
  const { data: wellnessChecks = [], isLoading: isHealthLoading } = useQuery<WellnessCheck[]>({
    queryKey: ["wellness_range", athleteKey, healthFromISO, healthToISO],
    queryFn: () => getWellnessRange(athleteId!, healthFromISO, healthToISO),
    enabled: !!athleteId,
  });
  const strengthRunsPeriod = strengthHistorySummary?.runs ?? [];
  const exerciseSummary = strengthHistorySummary?.exercise_summary ?? [];
  const strengthAggregatePeriods = strengthAggregate?.periods ?? [];
  const strengthPrevPeriods = strengthPrevAggregate?.periods ?? [];

  // ─── Next Competition ─────────────────────────────────────────────────────

  const visibleCompetitions = useMemo(() => {
    if (!myCompetitionIds || myCompetitionIds.length === 0) return competitions;
    return competitions.filter((c) => myCompetitionIds.includes(c.id));
  }, [competitions, myCompetitionIds]);

  const nextCompetition = useMemo(() => {
    const todayISO = new Date().toISOString().slice(0, 10);
    return visibleCompetitions
      .filter((c) => c.date.slice(0, 10) >= todayISO)
      .sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;
  }, [visibleCompetitions]);

  const daysUntilNextComp = useMemo(() => {
    if (!nextCompetition) return null;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const target = new Date(nextCompetition.date.slice(0, 10) + "T00:00:00");
    return Math.round((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  }, [nextCompetition]);

  const presenceDefaults = useMemo(() => {
    const key = `swim-dashboard-v2:${athleteKey}:presenceDefaults`;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) return JSON.parse(raw) as Record<number, { AM?: boolean; PM?: boolean }>;
    } catch { /* ignore */ }
    // Default: all days ON
    const init: Record<number, { AM: boolean; PM: boolean }> = {};
    for (let i = 0; i < 7; i++) init[i] = { AM: true, PM: true };
    return init;
  }, [athleteKey]);

  const trainingDaysRemaining = useMemo(() => {
    if (!nextCompetition) return null;
    return computeTrainingDaysRemaining({
      compDate: nextCompetition.date.slice(0, 10),
      assignments,
      absenceDates,
      presenceDefaults,
    });
  }, [nextCompetition, assignments, absenceDates, presenceDefaults]);

  // ─── Swim Data Processing ──────────────────────────────────────────────────

  const processData = (days: number) => {
    if (!sessions) return [];
    const cutoff = subDays(new Date(), days);
    const filtered = sessions.filter(s => new Date(s.date) >= cutoff).reverse();

    const grouped = new Map();
    filtered.forEach(s => {
      const dateStr = format(new Date(s.date), "dd/MM");
      if (!grouped.has(dateStr)) {
        grouped.set(dateStr, {
          date: dateStr, distance: 0, effort: 0, rpe: 0, performance: 0,
          engagement: 0, fatigue: 0, count: 0, rpeCount: 0,
          performanceCount: 0, engagementCount: 0, fatigueCount: 0,
        });
      }
      const entry = grouped.get(dateStr);
      entry.distance += s.distance;
      entry.effort += s.effort;
      entry.count += 1;
      if (s.rpe !== null && s.rpe !== undefined) { entry.rpe += s.rpe; entry.rpeCount += 1; }
      if (s.performance !== null && s.performance !== undefined) { entry.performance += s.performance; entry.performanceCount += 1; }
      if (s.engagement !== null && s.engagement !== undefined) { entry.engagement += s.engagement; entry.engagementCount += 1; }
      if (s.fatigue !== null && s.fatigue !== undefined) { entry.fatigue += s.fatigue; entry.fatigueCount += 1; }
    });

    return Array.from(grouped.values()).map(item => ({
      ...item,
      effort: Math.round(item.effort / item.count * 10) / 10,
      rpe: item.rpeCount ? Math.round(item.rpe / item.rpeCount * 10) / 10 : null,
      performance: item.performanceCount ? Math.round(item.performance / item.performanceCount * 10) / 10 : null,
      engagement: item.engagementCount ? Math.round(item.engagement / item.engagementCount * 10) / 10 : null,
      fatigue: item.fatigueCount ? Math.round(item.fatigue / item.fatigueCount * 10) / 10 : null,
    }));
  };

  const swimSessionsPeriod = sessions
    ? sessions.filter((session) => new Date(session.date) >= subDays(new Date(), swimPeriodDays))
    : [];
  const swimSessionsCount = swimSessionsPeriod.length;
  const swimSessionsTotals = swimSessionsPeriod.reduce(
    (acc, session) => {
      acc.distance += session.distance;
      acc.duration += session.duration;
      if (session.rpe !== null && session.rpe !== undefined) { acc.rpeSum += session.rpe; acc.rpeCount += 1; }
      if (session.performance !== null && session.performance !== undefined) { acc.performanceSum += session.performance; acc.performanceCount += 1; }
      if (session.engagement !== null && session.engagement !== undefined) { acc.engagementSum += session.engagement; acc.engagementCount += 1; }
      if (session.fatigue !== null && session.fatigue !== undefined) { acc.fatigueSum += session.fatigue; acc.fatigueCount += 1; }
      return acc;
    },
    { distance: 0, duration: 0, rpeSum: 0, rpeCount: 0, performanceSum: 0, performanceCount: 0, engagementSum: 0, engagementCount: 0, fatigueSum: 0, fatigueCount: 0 },
  );
  const swimSessionsAvgRpe = swimSessionsTotals.rpeCount ? swimSessionsTotals.rpeSum / swimSessionsTotals.rpeCount : null;
  const swimSessionsAvgPerformance = swimSessionsTotals.performanceCount ? swimSessionsTotals.performanceSum / swimSessionsTotals.performanceCount : null;
  const swimSessionsAvgEngagement = swimSessionsTotals.engagementCount ? swimSessionsTotals.engagementSum / swimSessionsTotals.engagementCount : null;
  const swimSessionsAvgFatigue = swimSessionsTotals.fatigueCount ? swimSessionsTotals.fatigueSum / swimSessionsTotals.fatigueCount : null;
  const swimSessionsAvgDuration = swimSessionsCount ? swimSessionsTotals.duration / swimSessionsCount : 0;
  const swimSessionsAvgDistance = swimSessionsCount ? swimSessionsTotals.distance / swimSessionsCount : 0;

  const swimData = processData(swimPeriodDays);

  // Trend: compare current period vs previous equal period
  const computeTrend = (currentTotal: number, allSessions: Array<{ date: string; distance?: number }>, periodDays: number, metric: "distance" | "count") => {
    const now = new Date();
    const prevStart = subDays(now, periodDays * 2);
    const prevEnd = subDays(now, periodDays);
    const prev = allSessions.filter((s) => {
      const d = new Date(s.date);
      return d >= prevStart && d < prevEnd;
    });
    const prevTotal = metric === "distance"
      ? prev.reduce((acc, s) => acc + (s.distance ?? 0), 0)
      : prev.length;
    if (prevTotal === 0) return null;
    return ((currentTotal - prevTotal) / prevTotal) * 100;
  };

  const swimVolumeTrend = sessions
    ? computeTrend(swimSessionsTotals.distance, sessions, swimPeriodDays, "distance")
    : null;

  // Stroke breakdown data
  const STROKE_KEYS = ["NL", "DOS", "BR", "PAP", "QN"] as const;
  const STROKE_LABELS: Record<string, string> = { NL: "NL", DOS: "Dos", BR: "Brasse", PAP: "Pap", QN: "4N" };
  const STROKE_COLORS: Record<string, string> = {
    NL: "hsl(210, 80%, 55%)", DOS: "hsl(160, 60%, 45%)", BR: "hsl(35, 85%, 55%)",
    PAP: "hsl(280, 60%, 55%)", QN: "hsl(340, 70%, 55%)",
  };

  const strokeBreakdown = useMemo(() => {
    if (!swimSessionsPeriod.length) return { pie: [], daily: [], hasData: false };
    const totals: Record<string, number> = { NL: 0, DOS: 0, BR: 0, PAP: 0, QN: 0 };
    let hasAny = false;
    const dailyMap = new Map<string, Record<string, number>>();

    for (const s of swimSessionsPeriod) {
      const sd = s.stroke_distances;
      if (!sd) continue;
      const dateStr = format(new Date(s.date), "dd/MM");
      if (!dailyMap.has(dateStr)) dailyMap.set(dateStr, { NL: 0, DOS: 0, BR: 0, PAP: 0, QN: 0 });
      const dayEntry = dailyMap.get(dateStr)!;
      for (const k of STROKE_KEYS) {
        const val = (sd as Record<string, number | undefined>)[k];
        if (val && val > 0) { totals[k] += val; dayEntry[k] += val; hasAny = true; }
      }
    }

    const pie = STROKE_KEYS
      .filter((k) => totals[k] > 0)
      .map((k) => ({ name: STROKE_LABELS[k], value: totals[k], fill: STROKE_COLORS[k] }));
    const daily = Array.from(dailyMap.entries()).map(([date, vals]) => ({ date, ...vals }));
    return { pie, daily, hasData: hasAny };
  }, [swimSessionsPeriod]);

  // ─── Strength Data Processing ─────────────────────────────────────────────

  const getRunRpeValue = (run: LocalStrengthRun) => {
    const logs = Array.isArray(run?.logs) ? run.logs : [];
    const rpeValues: number[] = logs
      .map((log: SetLogEntry) => (log?.rpe !== null && log?.rpe !== undefined ? Number(log.rpe) : null))
      .filter((value: number | null): value is number => value !== null && Number.isFinite(value));
    if (rpeValues.length > 0) {
      return rpeValues.reduce((acc, value) => acc + value, 0) / rpeValues.length;
    }
    const fallback = run?.feeling ?? run?.rpe ?? null;
    const fallbackValue = fallback !== null && fallback !== undefined ? Number(fallback) : null;
    return fallbackValue !== null && Number.isFinite(fallbackValue) ? fallbackValue : null;
  };

  const formatRunRpe = (value: number | null) => {
    if (value === null || value === undefined || Number.isNaN(value)) return "-";
    return value.toFixed(1);
  };

  const strengthData = [...strengthRunsPeriod]
    .sort((a, b) => {
      const aDate = new Date(a.started_at || a.date || a.created_at || 0).getTime();
      const bDate = new Date(b.started_at || b.date || b.created_at || 0).getTime();
      return aDate - bDate;
    })
    .map((run) => ({
      date: format(new Date(run.started_at || run.date || run.created_at || new Date()), "dd/MM"),
      feeling: getRunRpeValue(run),
    }));

  const strengthAggregateData = strengthAggregatePeriods.map((item) => ({
    date: item.period,
    label: format(new Date(item.period), "dd/MM"),
    tonnage: Math.round(item.tonnage ?? 0),
    volume: Math.round(item.volume ?? 0),
  }));

  const strengthTonnagePeriod = strengthAggregatePeriods.reduce((acc, item) => acc + (item.tonnage ?? 0), 0);
  const strengthVolumePeriod = strengthAggregatePeriods.reduce((acc, item) => acc + (item.volume ?? 0), 0);
  const strengthSessionsCount = strengthRunsPeriod.length;
  const strengthRpeValues = strengthRunsPeriod
    .map((run) => getRunRpeValue(run))
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const strengthAvgFeeling = strengthRpeValues.length
    ? strengthRpeValues.reduce((acc, value) => acc + value, 0) / strengthRpeValues.length
    : null;

  const exerciseVolumeData = [...exerciseSummary]
    .map((entry) => ({
      exerciseId: Number(entry.exercise_id),
      name: entry.exercise_name || `Exercice ${entry.exercise_id}`,
      totalSets: Number(entry.total_sets ?? 0),
      totalReps: Number(entry.total_reps ?? 0),
      totalVolume: Number(entry.total_volume ?? 0),
      maxWeight: entry.max_weight !== null && entry.max_weight !== undefined ? Number(entry.max_weight) : null,
      lastPerformedAt: entry.last_performed_at ?? null,
    }))
    .sort((a, b) => b.totalVolume - a.totalVolume);

  const strengthTonnageTrend = (() => {
    if (!strengthAggregatePeriods.length) return null;
    const currentTotal = strengthAggregatePeriods.reduce((acc, i) => acc + (i.tonnage ?? 0), 0);
    const prevTotal = strengthPrevPeriods.reduce((acc, i) => acc + (i.tonnage ?? 0), 0);
    if (prevTotal === 0) return null;
    return ((currentTotal - prevTotal) / prevTotal) * 100;
  })();

  const topExerciseVolume = exerciseVolumeData.slice(0, 8);

  const formatExerciseDate = (dateValue: string | null) => {
    if (!dateValue) return "-";
    const parsed = new Date(dateValue);
    if (Number.isNaN(parsed.getTime())) return "-";
    return format(parsed, "dd/MM/yyyy");
  };

  // ─── Health (Wellness) Data Processing ────────────────────────────────────

  const wellnessSorted = useMemo(
    () => [...wellnessChecks].sort((a, b) => a.date.localeCompare(b.date)),
    [wellnessChecks],
  );

  const healthChartData = useMemo(
    () =>
      wellnessSorted.map((w) => ({
        date: format(new Date(w.date + "T00:00:00"), "dd/MM"),
        readiness: w.readiness_score,
        sleep_quality: w.sleep_quality,
        sleep_hours: w.sleep_hours,
        fatigue: w.fatigue,
        soreness: w.soreness,
        mood: w.mood,
        stress: w.stress,
      })),
    [wellnessSorted],
  );

  const healthAverages = useMemo(() => {
    const n = wellnessSorted.length;
    if (!n) {
      return {
        readiness: null,
        sleep_quality: null,
        sleep_hours: null,
        fatigue: null,
        soreness: null,
        mood: null,
        stress: null,
      };
    }
    const sum = wellnessSorted.reduce(
      (acc, w) => {
        acc.readiness += w.readiness_score ?? 0;
        acc.sleep_quality += w.sleep_quality ?? 0;
        acc.sleep_hours += w.sleep_hours ?? 0;
        acc.fatigue += w.fatigue ?? 0;
        acc.soreness += w.soreness ?? 0;
        acc.mood += w.mood ?? 0;
        acc.stress += w.stress ?? 0;
        return acc;
      },
      { readiness: 0, sleep_quality: 0, sleep_hours: 0, fatigue: 0, soreness: 0, mood: 0, stress: 0 },
    );
    return {
      readiness: sum.readiness / n,
      sleep_quality: sum.sleep_quality / n,
      sleep_hours: sum.sleep_hours / n,
      fatigue: sum.fatigue / n,
      soreness: sum.soreness / n,
      mood: sum.mood / n,
      stress: sum.stress / n,
    };
  }, [wellnessSorted]);

  const healthReadinessTrend = useMemo(() => {
    if (!healthAverages.readiness || !wellnessChecks.length) return null;
    const prevFrom = format(subDays(new Date(), healthPeriodDays * 2), "yyyy-MM-dd");
    const prevTo = healthFromISO;
    const prev = wellnessChecks.filter((w) => w.date >= prevFrom && w.date < prevTo);
    if (!prev.length) return null;
    const prevAvg = prev.reduce((acc, w) => acc + (w.readiness_score ?? 0), 0) / prev.length;
    if (prevAvg === 0) return null;
    return ((healthAverages.readiness - prevAvg) / prevAvg) * 100;
  }, [healthAverages.readiness, wellnessChecks, healthPeriodDays, healthFromISO]);

  const healthChecksCount = wellnessSorted.length;

  // ─── Render ───────────────────────────────────────────────────────────────

  const content = (
    <>
      <Tabs defaultValue="swim" className="w-full">
        <TabsList className="grid h-auto w-full grid-cols-3 gap-1.5 bg-transparent p-0">
          <TabsTrigger
            value="swim"
            className="rounded-xl border bg-card px-2 py-2 text-xs data-[state=active]:border-blue-500 data-[state=active]:bg-blue-500/5 data-[state=active]:text-blue-700 dark:data-[state=active]:text-blue-300"
          >
            <Waves className="mr-1 h-3 w-3" />
            Natation
          </TabsTrigger>
          <TabsTrigger
            value="strength"
            className="rounded-xl border bg-card px-2 py-2 text-xs data-[state=active]:border-amber-500 data-[state=active]:bg-amber-500/5 data-[state=active]:text-amber-700 dark:data-[state=active]:text-amber-300"
          >
            <Dumbbell className="mr-1 h-3 w-3" />
            Musculation
          </TabsTrigger>
          <TabsTrigger
            value="health"
            className="rounded-xl border bg-card px-2 py-2 text-xs data-[state=active]:border-emerald-500 data-[state=active]:bg-emerald-500/5 data-[state=active]:text-emerald-700 dark:data-[state=active]:text-emerald-300"
          >
            <HeartPulse className="mr-1 h-3 w-3" />
            Santé
          </TabsTrigger>
        </TabsList>

        {/* ── Natation ──────────────────────────────────────────────────────── */}

        <TabsContent value="swim" className="space-y-4 mt-4">
          <div className="flex justify-end">
            <div className="flex flex-wrap justify-end gap-2">
              {PERIOD_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setSwimPeriodDays(option.value)}
                  className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    swimPeriodDays === option.value
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/30 hover:text-foreground"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Hero KPI — Volume */}
          <HeroKpi
            value={(swimSessionsTotals.distance / 1000).toFixed(1)}
            unit="km"
            label={`volume sur ${swimPeriodDays} jours`}
            trend={swimVolumeTrend}
            trendLabel="vs période préc."
          />

          {/* Mini metrics pills */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            <MetricPill value={`${swimSessionsCount} séances`} />
            <MetricPill value={`${Math.round(swimSessionsAvgDistance).toLocaleString()}m moy`} />
            <MetricPill value={`${Math.round(swimSessionsAvgDuration)}min moy`} />
          </div>

          {/* Volume curve with gradient */}
          <motion.div variants={slideUp} initial="hidden" animate="visible">
            <Card className="border-0 shadow-none bg-transparent">
              <CardContent className="p-0 h-[140px] w-full">
                {isSwimLoading ? (
                  <ChartSkeleton />
                ) : swimData.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    Aucune donnée disponible.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={swimData}>
                      <defs>
                        <linearGradient id="swimVolumeGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="date" fontSize={10} tickLine={false} axisLine={false} />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        formatter={(value: number) => [`${value.toLocaleString()}m`, "Volume"]}
                      />
                      <Area
                        type="monotone"
                        dataKey="distance"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        fill="url(#swimVolumeGradient)"
                        dot={false}
                        activeDot={{ r: 5, strokeWidth: 2 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Ressentis — horizontal progress bars */}
          <motion.div className="space-y-3" variants={slideUp} initial="hidden" animate="visible">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ressentis moyens</h3>
            <ProgressBar label="Difficulté" value={swimSessionsAvgRpe} max={5} invert />
            <ProgressBar label="Performance" value={swimSessionsAvgPerformance} max={5} />
            <ProgressBar label="Engagement" value={swimSessionsAvgEngagement} max={5} />
            <ProgressBar label="Fatigue" value={swimSessionsAvgFatigue} max={5} invert />
          </motion.div>

          {/* Stroke breakdown — collapsible */}
          {strokeBreakdown.hasData && (
            <CollapsibleSection title={`Répartition par nage (${swimPeriodDays}j)`}>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="h-[280px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={strokeBreakdown.pie}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={90}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      >
                        {strokeBreakdown.pie.map((entry, i) => (
                          <Cell key={`pie-${i}`} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => [`${value.toLocaleString()}m`, "Distance"]} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="h-[280px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={strokeBreakdown.daily}>
                      <XAxis dataKey="date" fontSize={10} tickLine={false} axisLine={false} />
                      <YAxis fontSize={10} tickLine={false} axisLine={false} />
                      <Tooltip />
                      {STROKE_KEYS.map((k) => (
                        <Bar key={k} dataKey={k} stackId="strokes" name={STROKE_LABELS[k]} fill={STROKE_COLORS[k]} radius={0} />
                      ))}
                      <Legend />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </CollapsibleSection>
          )}
        </TabsContent>

        {/* ── Musculation ───────────────────────────────────────────────────── */}

        <TabsContent value="strength" className="space-y-4 mt-4">
          <div className="flex justify-end">
            <div className="flex flex-wrap justify-end gap-2">
              {PERIOD_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setStrengthPeriodDays(option.value)}
                  className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    strengthPeriodDays === option.value
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/30 hover:text-foreground"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Hero KPI — Tonnage */}
          <HeroKpi
            value={Math.round(strengthTonnagePeriod).toLocaleString()}
            unit="kg"
            label={`tonnage sur ${strengthPeriodDays} jours`}
            trend={strengthTonnageTrend}
            trendLabel="vs période préc."
          />

          {/* Mini metrics pills */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            <MetricPill value={`${strengthSessionsCount} séances`} />
            <MetricPill value={`${Math.round(strengthVolumePeriod).toLocaleString()} reps`} />
            <MetricPill
              value={`RPE ${strengthAvgFeeling !== null ? strengthAvgFeeling.toFixed(1) : "-"}/10`}
              colored
              colorValue={strengthAvgFeeling !== null ? strengthAvgFeeling / 2 : null}
              invert
            />
          </div>

          {/* Tonnage & Volume chart */}
          <motion.div variants={slideUp} initial="hidden" animate="visible">
            <Card className="border-0 shadow-none bg-transparent">
              <CardContent className="p-0 h-[140px] w-full">
                {isStrengthLoading ? (
                  <ChartSkeleton />
                ) : strengthAggregateData.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    Aucune donnée disponible.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={strengthAggregateData}>
                      <XAxis dataKey="label" fontSize={10} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Bar dataKey="tonnage" name="Tonnage (kg)" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} opacity={0.7} />
                      <Line type="monotone" dataKey="volume" name="Volume (reps)" stroke="hsl(var(--accent))" strokeWidth={2} dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Feeling chart */}
          <motion.div variants={slideUp} initial="hidden" animate="visible">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Ressenti par séance</h3>
            <div className="h-[130px] w-full">
              {isStrengthLoading ? (
                <ChartSkeleton />
              ) : strengthData.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Aucune donnée disponible.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={strengthData}>
                    <defs>
                      <linearGradient id="strengthFeelingGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--foreground))" stopOpacity={0.15} />
                        <stop offset="100%" stopColor="hsl(var(--foreground))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis domain={[0, 10]} hide />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(value: number) => [value !== null ? value.toFixed(1) : "-", "RPE"]}
                    />
                    <Area
                      type="monotone"
                      dataKey="feeling"
                      stroke="hsl(var(--foreground))"
                      strokeWidth={2}
                      fill="url(#strengthFeelingGradient)"
                      dot={{ r: 4, fill: "hsl(var(--background))", stroke: "hsl(var(--foreground))", strokeWidth: 2 }}
                      activeDot={{ r: 6 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </motion.div>

          {/* Exercise detail — collapsible */}
          <CollapsibleSection title="Détail par exercice">
            <div className="space-y-4">
              <div className="h-[220px] w-full">
                {topExerciseVolume.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    Aucun exercice enregistré.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topExerciseVolume} layout="vertical">
                      <XAxis type="number" fontSize={10} tickLine={false} axisLine={false} />
                      <YAxis type="category" dataKey="name" fontSize={10} tickLine={false} axisLine={false} width={100} />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        formatter={(value: number) => [`${value.toLocaleString()} kg`, "Volume"]}
                      />
                      <Bar dataKey="totalVolume" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="w-full overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Exercice</TableHead>
                      <TableHead className="text-right">Volume</TableHead>
                      <TableHead className="text-right">Max</TableHead>
                      <TableHead className="text-right">Dernier</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {exerciseVolumeData.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                          Aucun exercice enregistré.
                        </TableCell>
                      </TableRow>
                    ) : (
                      exerciseVolumeData.map((entry) => (
                        <TableRow key={entry.exerciseId}>
                          <TableCell className="font-medium text-sm">{entry.name}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{entry.totalVolume.toLocaleString()} kg</TableCell>
                          <TableCell className="text-right font-mono text-sm">{entry.maxWeight !== null ? (isBodyweight(entry.maxWeight) ? "PDC" : `${entry.maxWeight} kg`) : "-"}</TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground">{formatExerciseDate(entry.lastPerformedAt)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </CollapsibleSection>

          {/* Recent history — collapsible */}
          <CollapsibleSection title="Historique récent">
            <div className="space-y-3">
              {strengthRuns.length === 0 && (
                <div className="text-center text-sm text-muted-foreground py-6">
                  Aucun historique disponible.
                </div>
              )}
              {strengthRuns.map((run) => (
                <div key={run.id} className="flex items-center justify-between border-b border-border/40 pb-2 last:border-b-0 last:pb-0">
                  <div>
                    <div className="text-sm font-semibold">
                      {format(new Date(run.started_at || run.date || run.created_at || new Date()), "dd/MM/yyyy")}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {run.status || "Séance"}
                    </div>
                  </div>
                  <div className="text-sm font-mono font-semibold">
                    {formatRunRpe(getRunRpeValue(run))}/10
                  </div>
                </div>
              ))}
              {strengthHistoryQuery.hasNextPage && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => strengthHistoryQuery.fetchNextPage()}
                  disabled={strengthHistoryQuery.isFetchingNextPage}
                >
                  {strengthHistoryQuery.isFetchingNextPage ? "Chargement..." : "Charger plus"}
                </Button>
              )}
            </div>
          </CollapsibleSection>
        </TabsContent>

        {/* ── Santé ─────────────────────────────────────────────────────────── */}

        <TabsContent value="health" className="space-y-4 mt-4">
          <div className="flex justify-end">
            <div className="flex flex-wrap justify-end gap-2">
              {PERIOD_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setHealthPeriodDays(option.value)}
                  className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    healthPeriodDays === option.value
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/30 hover:text-foreground"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Hero KPI — Forme (readiness) */}
          <HeroKpi
            value={healthAverages.readiness !== null ? Math.round(healthAverages.readiness).toString() : "-"}
            unit="/100"
            label={`forme moyenne sur ${healthPeriodDays} jours`}
            trend={healthReadinessTrend}
            trendLabel="vs période préc."
          />

          {/* Mini metrics pills */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            <MetricPill value={`${healthChecksCount} check-ins`} />
            <MetricPill
              value={
                healthAverages.sleep_hours !== null
                  ? `${healthAverages.sleep_hours.toFixed(1)}h sommeil`
                  : "- sommeil"
              }
            />
          </div>

          {/* Courbe readiness */}
          <motion.div variants={slideUp} initial="hidden" animate="visible">
            <Card className="border-0 shadow-none bg-transparent">
              <CardContent className="p-0 h-[160px] w-full">
                {isHealthLoading ? (
                  <ChartSkeleton />
                ) : healthChartData.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    Aucune donnée wellness sur la période.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={healthChartData}>
                      <defs>
                        <linearGradient id="readinessGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(142, 70%, 45%)" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="hsl(142, 70%, 45%)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="date" fontSize={10} tickLine={false} axisLine={false} />
                      <YAxis domain={[0, 100]} fontSize={10} tickLine={false} axisLine={false} width={28} />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        formatter={(value: number) => [`${value}/100`, "Forme"]}
                      />
                      <Area
                        type="monotone"
                        dataKey="readiness"
                        stroke="hsl(142, 70%, 45%)"
                        strokeWidth={2}
                        fill="url(#readinessGradient)"
                        dot={false}
                        activeDot={{ r: 5, strokeWidth: 2 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Moyennes par métrique */}
          <motion.div className="space-y-3" variants={slideUp} initial="hidden" animate="visible">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Moyennes sur la période
            </h3>
            <ProgressBar label="Sommeil (qualité)" value={healthAverages.sleep_quality} max={10} />
            <ProgressBar label="Sommeil (heures)" value={healthAverages.sleep_hours} max={12} />
            <ProgressBar label="Humeur" value={healthAverages.mood} max={10} />
            <ProgressBar label="Fatigue" value={healthAverages.fatigue} max={5} invert />
            <ProgressBar label="Courbatures" value={healthAverages.soreness} max={5} invert />
            <ProgressBar label="Stress" value={healthAverages.stress} max={5} invert />
          </motion.div>

          {/* Détails par métrique — mini charts */}
          {healthChartData.length > 0 && (
            <CollapsibleSection title="Détail par métrique">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {[
                  { key: "sleep_quality", label: "Sommeil (qualité)", color: "hsl(220, 70%, 55%)", max: 10 },
                  { key: "sleep_hours", label: "Sommeil (heures)", color: "hsl(260, 60%, 55%)", max: 12 },
                  { key: "mood", label: "Humeur", color: "hsl(45, 90%, 55%)", max: 10 },
                  { key: "fatigue", label: "Fatigue", color: "hsl(15, 80%, 55%)", max: 5 },
                  { key: "soreness", label: "Courbatures", color: "hsl(0, 75%, 55%)", max: 5 },
                  { key: "stress", label: "Stress", color: "hsl(340, 65%, 55%)", max: 5 },
                ].map((metric) => (
                  <div key={metric.key} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">{metric.label}</span>
                      <span className="text-xs font-mono tabular-nums text-foreground">
                        {(healthAverages[metric.key as keyof typeof healthAverages] ?? 0) !== null
                          ? (healthAverages[metric.key as keyof typeof healthAverages] as number | null)?.toFixed(1)
                          : "-"}
                      </span>
                    </div>
                    <div className="h-[90px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={healthChartData}>
                          <defs>
                            <linearGradient id={`grad-${metric.key}`} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={metric.color} stopOpacity={0.35} />
                              <stop offset="100%" stopColor={metric.color} stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <XAxis dataKey="date" fontSize={9} tickLine={false} axisLine={false} />
                          <YAxis domain={[0, metric.max]} hide />
                          <Tooltip contentStyle={tooltipStyle} />
                          <Area
                            type="monotone"
                            dataKey={metric.key}
                            stroke={metric.color}
                            strokeWidth={2}
                            fill={`url(#grad-${metric.key})`}
                            dot={false}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          )}
        </TabsContent>
      </Tabs>
    </>
  );

  if (embedded) {
    return <div className="space-y-4">{content}</div>;
  }

  return (
    <div className="space-y-4 pb-4">
      <PageHeader
        title="Analyse"
        icon={<BarChart3 className="h-3.5 w-3.5" />}
      />
      {content}
    </div>
  );
}
