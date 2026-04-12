import { useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  getWellnessRange,
  computeReadinessScore,
  getTrainingCycles,
  getTrainingWeeks,
  getCompetitions,
  getMyCompetitionIds,
  getAthleteObjectives,
  getMyInterviews,
  getSwimmerSlots,
} from "@/lib/api/index";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shared/PageHeader";
import { useLocation } from "wouter";
import {
  Calendar,
  Map,
  TrendingUp,
  ChevronRight,
  Sparkles,
  AlertTriangle,
} from "lucide-react";
import type { Session, Competition, WellnessCheck } from "@/lib/api/types";

// ── Helpers ────────────────────────────────────────────────────

function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function toISODate(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function getWeekBounds(ref: Date = new Date()) {
  const d = new Date(ref);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday start
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { monday, sunday, mondayISO: toISODate(monday), sundayISO: toISODate(sunday) };
}

function daysUntil(dateStr: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function indicatorColor(mode: "hard" | "good", value: number | null | undefined): string {
  const v = Number(value);
  if (!Number.isFinite(v) || v < 1 || v > 5) return "bg-muted text-muted-foreground";
  const effective = mode === "hard" ? 6 - v : v;
  if (effective >= 4) return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400";
  if (effective >= 3) return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400";
  return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
}

const INDICATOR_LABELS = [
  { key: "effort" as const, label: "Diff", mode: "hard" as const },
  { key: "fatigue" as const, label: "Fat", mode: "hard" as const },
  { key: "performance" as const, label: "Perf", mode: "good" as const },
  { key: "engagement" as const, label: "Eng", mode: "good" as const },
];

// ── Component ──────────────────────────────────────────────────

export default function Suivi() {
  const user = useAuth((s) => s.user);
  const userId = useAuth((s) => s.userId);
  const [, navigate] = useLocation();

  const { monday, sunday, mondayISO, sundayISO } = useMemo(() => getWeekBounds(), []);

  // ── Queries ────────────────────────────────────────────────

  // Sessions (all, then filter client-side)
  const { data: allSessions = [], isLoading: loadingSessions } = useQuery({
    queryKey: ["sessions", user, userId],
    queryFn: () => api.getSessions(user!, userId),
    enabled: !!user,
    staleTime: 5 * 60_000,
  });

  // Swimmer slots (expected sessions per week)
  const { data: swimmerSlots = [], isLoading: loadingSlots } = useQuery({
    queryKey: ["swimmer-slots", userId],
    queryFn: () => getSwimmerSlots(userId!),
    enabled: !!userId,
    staleTime: 10 * 60_000,
  });

  // Competitions
  const { data: competitions = [] } = useQuery({
    queryKey: ["competitions"],
    queryFn: () => getCompetitions(),
    staleTime: 10 * 60_000,
  });

  const { data: myCompIds = [] } = useQuery({
    queryKey: ["my-competition-ids", userId],
    queryFn: () => getMyCompetitionIds(userId!),
    enabled: !!userId,
    staleTime: 10 * 60_000,
  });

  // Training cycles
  const { data: cycles = [] } = useQuery({
    queryKey: ["training-cycles", userId],
    queryFn: () => getTrainingCycles({ athleteId: userId! }),
    enabled: !!userId,
    staleTime: 10 * 60_000,
  });

  // Objectives
  const { data: objectives = [] } = useQuery({
    queryKey: ["athlete-objectives"],
    queryFn: () => getAthleteObjectives(),
    enabled: !!user,
    staleTime: 10 * 60_000,
  });

  // Interviews
  const { data: interviews = [] } = useQuery({
    queryKey: ["my-interviews"],
    queryFn: () => getMyInterviews(),
    enabled: !!user,
    staleTime: 10 * 60_000,
  });

  // Wellness (last 30 days for progression card)
  const thirtyDaysAgo = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return toISODate(d);
  }, []);
  const todayISO = useMemo(() => toISODate(new Date()), []);

  const { data: wellnessData = [], isLoading: loadingWellness } = useQuery({
    queryKey: ["wellness-range", userId, thirtyDaysAgo, todayISO],
    queryFn: () => getWellnessRange(userId!, thirtyDaysAgo, todayISO),
    enabled: !!userId,
    staleTime: 5 * 60_000,
  });

  // Training weeks for the active cycle
  const activeCycle = useMemo(() => {
    if (!cycles.length) return null;
    const now = new Date();
    // Find cycle whose end_competition_date is in the future or most recent
    return (
      cycles.find(
        (c) => c.end_competition_date && new Date(c.end_competition_date) >= now,
      ) ?? cycles[0] ?? null
    );
  }, [cycles]);

  const { data: cycleWeeks = [] } = useQuery({
    queryKey: ["training-weeks", activeCycle?.id],
    queryFn: () => getTrainingWeeks(activeCycle!.id),
    enabled: !!activeCycle?.id,
    staleTime: 10 * 60_000,
  });

  // ── Derived data ─────────────────────────────────────────────

  // Week sessions
  const weekSessions = useMemo(
    () =>
      allSessions.filter((s) => {
        const d = s.date ?? (s as any).session_date;
        return d && d >= mondayISO && d <= sundayISO;
      }),
    [allSessions, mondayISO, sundayISO],
  );

  // Expected slots this week (count days with slots that fall within the week)
  const expectedThisWeek = useMemo(() => {
    const todayDow = new Date().getDay(); // 0=Sun, 1=Mon ...
    // swimmerSlots uses 0=Mon convention typically; let's count unique days
    return swimmerSlots.length;
  }, [swimmerSlots]);

  // Sessions without feedback
  const sessionsWithoutFeedback = useMemo(
    () =>
      weekSessions.filter(
        (s) => !s.effort && !s.feeling && !s.rpe && !s.performance,
      ).length,
    [weekSessions],
  );

  // Last 3 sessions this week (most recent first)
  const recentWeekSessions = useMemo(
    () =>
      [...weekSessions]
        .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
        .slice(0, 3),
    [weekSessions],
  );

  // Next competition
  const nextCompetition = useMemo(() => {
    const now = toISODate(new Date());
    const myComps = competitions.filter(
      (c) => myCompIds.includes(c.id) && c.date >= now,
    );
    myComps.sort((a, b) => a.date.localeCompare(b.date));
    return myComps[0] ?? null;
  }, [competitions, myCompIds]);

  const daysToComp = nextCompetition ? daysUntil(nextCompetition.date) : null;

  // Current week in cycle
  const currentWeekInfo = useMemo(() => {
    if (!cycleWeeks.length || !activeCycle) return null;
    const now = toISODate(new Date());
    const sorted = [...cycleWeeks].sort((a, b) =>
      a.week_start.localeCompare(b.week_start),
    );
    let currentIdx = sorted.findIndex((w, i) => {
      const nextStart = sorted[i + 1]?.week_start;
      return w.week_start <= now && (!nextStart || nextStart > now);
    });
    if (currentIdx < 0) currentIdx = sorted.length - 1;
    return {
      weekNum: currentIdx + 1,
      total: sorted.length,
      type: sorted[currentIdx]?.week_type ?? null,
    };
  }, [cycleWeeks, activeCycle]);

  // Count swim vs muscu slots this week
  const slotCounts = useMemo(() => {
    // swimmerSlots represent recurring weekly slots
    // For simplicity, count all active slots
    const swim = swimmerSlots.length;
    return { swim, muscu: 0 }; // muscu slots tracked separately
  }, [swimmerSlots]);

  // Pending interviews
  const pendingInterviews = useMemo(
    () => interviews.filter((i) => i.status === "draft_athlete" || i.status === "sent"),
    [interviews],
  );

  // Objectives reached (those with target_time where current best <= target)
  const objectivesReached = useMemo(
    () => objectives.filter((o) => o.target_time_seconds != null).length, // simplified
    [objectives],
  );

  // Wellness / Readiness for progression card
  const readinessInfo = useMemo(() => {
    if (!wellnessData.length) return null;
    const recent = wellnessData.slice(0, 7); // last 7 days
    const scores = recent
      .map((w) => computeReadinessScore(w))
      .filter((s) => s > 0);
    if (!scores.length) return null;
    const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    return { avg, count: scores.length };
  }, [wellnessData]);

  // Volume last 30 days
  const volumeInfo = useMemo(() => {
    const thirtyAgo = new Date();
    thirtyAgo.setDate(thirtyAgo.getDate() - 30);
    const thirtyAgoISO = toISODate(thirtyAgo);
    const recentSessions = allSessions.filter(
      (s) => (s.date ?? "") >= thirtyAgoISO,
    );
    const totalMeters = recentSessions.reduce(
      (sum, s) => sum + (Number(s.distance) || 0),
      0,
    );
    return {
      meters: totalMeters,
      km: Math.round((totalMeters / 1000) * 10) / 10,
      sessionCount: recentSessions.length,
    };
  }, [allSessions]);

  // ── Loading state ────────────────────────────────────────────

  const isLoading = loadingSessions && loadingSlots;

  if (!user) return null;

  // ── Render ───────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-4xl px-4 pb-28">
      <PageHeader
        title="Mon suivi"
        icon={<Sparkles className="h-3.5 w-3.5" />}
      />

      <div className="mt-4 space-y-4">
        {isLoading ? (
          <>
            <Skeleton className="h-40 rounded-3xl" />
            <Skeleton className="h-36 rounded-3xl" />
            <Skeleton className="h-32 rounded-3xl" />
          </>
        ) : (
          <>
            {/* ── Card: Ma semaine ─────────────────────────────── */}
            <button
              type="button"
              onClick={() => navigate("/suivi/semaine")}
              className="w-full text-left rounded-3xl border bg-card shadow-sm hover:border-primary/20 transition-all cursor-pointer p-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                    <Calendar className="h-4 w-4" />
                  </div>
                  <h2 className="text-base font-semibold">Ma semaine</h2>
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    {weekSessions.length}/{expectedThisWeek} seances
                  </span>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </div>

              {/* Recent sessions with indicators */}
              {recentWeekSessions.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {recentWeekSessions.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center gap-2 text-sm"
                    >
                      <span className="w-20 shrink-0 text-xs text-muted-foreground">
                        {formatSessionDate(s.date)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs">
                        {s.distance
                          ? `${Math.round(Number(s.distance))}m`
                          : s.slot || "Seance"}
                      </span>
                      <div className="flex gap-1">
                        {INDICATOR_LABELS.map((ind) => {
                          const val = (s as any)[ind.key] as
                            | number
                            | null
                            | undefined;
                          return (
                            <span
                              key={ind.key}
                              className={`inline-flex h-5 items-center rounded-md px-1.5 text-[10px] font-medium ${indicatorColor(ind.mode, val)}`}
                            >
                              {ind.label}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">
                  Aucune seance enregistree cette semaine
                </p>
              )}

              {sessionsWithoutFeedback > 0 && (
                <div className="mt-2.5 flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span>
                    {sessionsWithoutFeedback} seance
                    {sessionsWithoutFeedback > 1 ? "s" : ""} sans ressenti
                  </span>
                </div>
              )}
            </button>

            {/* ── Card: Ma saison ──────────────────────────────── */}
            <button
              type="button"
              onClick={() => navigate("/suivi/saison")}
              className="w-full text-left rounded-3xl border bg-card shadow-sm hover:border-primary/20 transition-all cursor-pointer p-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">
                    <Map className="h-4 w-4" />
                  </div>
                  <h2 className="text-base font-semibold">Ma saison</h2>
                  {daysToComp != null && daysToComp >= 0 && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      J-{daysToComp}
                    </span>
                  )}
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </div>

              <div className="mt-3 space-y-1.5 text-sm">
                {/* Cycle progress */}
                {activeCycle && currentWeekInfo ? (
                  <div className="flex items-center gap-2">
                    <span className="truncate text-xs text-foreground">
                      {activeCycle.name}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      Sem {currentWeekInfo.weekNum}/{currentWeekInfo.total}
                      {currentWeekInfo.type
                        ? ` \u00b7 ${currentWeekInfo.type}`
                        : ""}
                    </span>
                    <div className="ml-auto h-1.5 w-16 rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{
                          width: `${Math.min(100, (currentWeekInfo.weekNum / currentWeekInfo.total) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    Aucun cycle en cours
                  </span>
                )}

                {/* Frequency */}
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>
                    🏊 {slotCounts.swim} creneaux/sem
                  </span>
                </div>

                {/* Pending interviews */}
                {pendingInterviews.length > 0 && (
                  <div className="text-xs text-amber-700 dark:text-amber-400">
                    📎 {pendingInterviews.length} entretien
                    {pendingInterviews.length > 1 ? "s" : ""} a preparer
                  </div>
                )}

                {/* Objectives */}
                {objectives.length > 0 && (
                  <div className="text-xs text-muted-foreground">
                    🎯 {objectives.length} objectif
                    {objectives.length > 1 ? "s" : ""}
                  </div>
                )}

                {/* Next competition */}
                {nextCompetition && (
                  <div className="text-xs text-muted-foreground">
                    🏆 {nextCompetition.name}
                    {nextCompetition.location
                      ? ` \u00b7 ${nextCompetition.location}`
                      : ""}
                  </div>
                )}
              </div>
            </button>

            {/* ── Card: Ma progression ─────────────────────────── */}
            <button
              type="button"
              onClick={() => navigate("/suivi/progression")}
              className="w-full text-left rounded-3xl border bg-card shadow-sm hover:border-primary/20 transition-all cursor-pointer p-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                    <TrendingUp className="h-4 w-4" />
                  </div>
                  <h2 className="text-base font-semibold">Ma progression</h2>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </div>

              <div className="mt-3 space-y-1.5 text-sm">
                {/* Readiness */}
                {readinessInfo ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      Readiness 7j
                    </span>
                    <div className="flex h-5 items-center gap-1.5">
                      <div className="h-1.5 w-16 rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full transition-all ${readinessInfo.avg >= 70 ? "bg-emerald-500" : readinessInfo.avg >= 50 ? "bg-amber-500" : "bg-red-500"}`}
                          style={{ width: `${readinessInfo.avg}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium">
                        {readinessInfo.avg}%
                      </span>
                    </div>
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    Pas de donnees bien-etre recentes
                  </span>
                )}

                {/* Volume 30 days */}
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span>
                    🏊 {volumeInfo.km > 0 ? `${volumeInfo.km} km` : "0 km"}{" "}
                    · {volumeInfo.sessionCount} seance
                    {volumeInfo.sessionCount !== 1 ? "s" : ""}
                  </span>
                  <span className="text-[10px]">30 derniers jours</span>
                </div>
              </div>
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Utility ────────────────────────────────────────────────────

function formatSessionDate(dateStr: string | undefined): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr + "T00:00:00");
    const days = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
    return `${days[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
  } catch {
    return dateStr;
  }
}
