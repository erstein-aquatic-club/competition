import { useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { getSessions } from "@/lib/api";
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
  Target,
  CalendarRange,
  TrendingUp,
  MessageSquare,
  ChevronRight,
  Sparkles,
} from "lucide-react";

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
    queryFn: () => getSessions(user!, userId),
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

  // Pending interviews (need swimmer action)
  const pendingInterviews = useMemo(
    () => interviews.filter((i) => i.status === "draft_athlete" || i.status === "sent"),
    [interviews],
  );

  // Next upcoming interview (any status, future date)
  const nextInterview = useMemo(() => {
    const now = toISODate(new Date());
    const upcoming = interviews
      .filter((i) => i.date >= now)
      .sort((a, b) => a.date.localeCompare(b.date));
    return upcoming[0] ?? null;
  }, [interviews]);

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

      <div className="mt-4 space-y-3">
        {isLoading ? (
          <>
            <Skeleton className="h-[68px] rounded-2xl" />
            <Skeleton className="h-[68px] rounded-2xl" />
            <Skeleton className="h-[68px] rounded-2xl" />
            <Skeleton className="h-[68px] rounded-2xl" />
          </>
        ) : (
          <>
            {/* ── Card: Mes objectifs ─────────────────────────── */}
            <button
              type="button"
              onClick={() => navigate("/suivi/objectifs")}
              className="w-full text-left rounded-2xl border bg-card p-4 hover:border-primary/20 transition-all active:scale-[0.98]"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
                    <Target className="h-4 w-4" />
                  </div>
                  <h2 className="text-sm font-semibold">Mes objectifs</h2>
                  {daysToComp != null && daysToComp >= 0 && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      J-{daysToComp}
                    </span>
                  )}
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
              </div>
              <p className="mt-1.5 pl-[46px] text-xs text-muted-foreground truncate">
                {objectives.length > 0
                  ? `${objectives.length} objectif${objectives.length > 1 ? "s" : ""}${objectivesReached > 0 ? ` · ${objectivesReached} suivi${objectivesReached > 1 ? "s" : ""}` : ""}${nextCompetition ? ` · Prochaine échéance ${new Date(nextCompetition.date + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}` : ""}`
                  : nextCompetition
                    ? `Prochaine échéance : ${nextCompetition.name} le ${new Date(nextCompetition.date + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}`
                    : "Définis tes objectifs et retrouve tes prochaines échéances"}
              </p>
            </button>

            {/* ── Card: Ma semaine ─────────────────────────────── */}
            <button
              type="button"
              onClick={() => navigate("/suivi/semaine")}
              className="w-full text-left rounded-2xl border bg-card p-4 hover:border-primary/20 transition-all active:scale-[0.98]"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                    <Calendar className="h-4 w-4" />
                  </div>
                  <h2 className="text-sm font-semibold">Ma semaine</h2>
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    {weekSessions.length}/{expectedThisWeek}
                  </span>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
              </div>
              {sessionsWithoutFeedback > 0 && (
                <p className="mt-1.5 pl-[46px] text-xs text-amber-600 dark:text-amber-400 truncate">
                  {sessionsWithoutFeedback} seance{sessionsWithoutFeedback > 1 ? "s" : ""} sans ressenti
                </p>
              )}
            </button>

            {/* ── Card: Ma planification ──────────────────────── */}
            <button
              type="button"
              onClick={() => navigate("/suivi/saison")}
              className="w-full text-left rounded-2xl border bg-card p-4 hover:border-primary/20 transition-all active:scale-[0.98]"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400">
                    <CalendarRange className="h-4 w-4" />
                  </div>
                  <h2 className="text-sm font-semibold">Ma planification</h2>
                  {daysToComp != null && daysToComp >= 0 && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      J-{daysToComp}
                    </span>
                  )}
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
              </div>
              <p className="mt-1.5 pl-[46px] text-xs text-muted-foreground truncate">
                {activeCycle && currentWeekInfo
                  ? `${activeCycle.name} \u00b7 Sem ${currentWeekInfo.weekNum}/${currentWeekInfo.total}${currentWeekInfo.type ? ` \u00b7 ${currentWeekInfo.type}` : ""}${slotCounts.swim > 0 ? ` \u00b7 ${slotCounts.swim} créneau${slotCounts.swim > 1 ? "x" : ""} natation` : ""}`
                  : "Natation et musculation planifiées par ton coach"}
              </p>
            </button>

            {/* ── Card: Ma progression ─────────────────────────── */}
            <button
              type="button"
              onClick={() => navigate("/suivi/progression")}
              className="w-full text-left rounded-2xl border bg-card p-4 hover:border-primary/20 transition-all active:scale-[0.98]"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
                    <TrendingUp className="h-4 w-4" />
                  </div>
                  <h2 className="text-sm font-semibold">Ma progression</h2>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
              </div>
              <p className="mt-1.5 pl-[46px] text-xs text-muted-foreground truncate">
                {readinessInfo || volumeInfo.km > 0
                  ? `${readinessInfo ? `Readiness ${readinessInfo.avg}%` : ""}${readinessInfo && volumeInfo.km > 0 ? " \u00b7 " : ""}${volumeInfo.km > 0 ? `${volumeInfo.km} km (30j)` : ""}`
                  : "Pas encore de donnees"}
              </p>
            </button>

            {/* ── Card: Mes entretiens ────────────────────────────── */}
            <button
              type="button"
              onClick={() => navigate("/suivi/entretiens")}
              className="w-full text-left rounded-2xl border bg-card p-4 hover:border-primary/20 transition-all active:scale-[0.98]"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-100 text-sky-600 dark:bg-sky-900/30 dark:text-sky-400">
                    <MessageSquare className="h-4 w-4" />
                  </div>
                  <h2 className="text-sm font-semibold">Mes entretiens</h2>
                  {pendingInterviews.length > 0 && (
                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                      {pendingInterviews.length} en attente
                    </span>
                  )}
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
              </div>
              <p className="mt-1.5 pl-[46px] text-xs text-muted-foreground truncate">
                {nextInterview
                  ? `Prochain : ${new Date(nextInterview.date + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}`
                  : interviews.length > 0
                    ? `${interviews.length} entretien${interviews.length > 1 ? "s" : ""} au total`
                    : "Aucun entretien pour le moment"}
              </p>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
