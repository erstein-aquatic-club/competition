import { useMemo, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueries } from "@tanstack/react-query";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  getSwimPlanningSlots,
  getCompetitions,
  getMyCompetitionIds,
  getTrainingCycles,
  getMyInterviews,
  getAthleteObjectives,
  getProfile,
  getSwimmerPerformances,
  getTrainingWeeks,
} from "@/lib/api";
import type { TrainingWeek, Interview } from "@/lib/api";
import type { SwimPlanningSlot } from "@/lib/api/types";
import { getSwimmerSessions } from "@/lib/api/swimmerSessions";
import { FILIERE_MAP, FILIERE_STYLES } from "@/lib/swimFilieres";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/shared/PageHeader";
import { ObjectiveCard } from "@/components/shared/ObjectiveCard";
import { weekTypeColor, weekTypeTextColor } from "@/lib/weekTypeColor";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CalendarRange,
  ChevronDown,
  ExternalLink,
  MapPin,
  MessageSquare,
  Plus,
  Trophy,
} from "lucide-react";

// ── Helpers ─────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function fmtShort(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}

function getSunday(mondayIso: string): string {
  const d = new Date(mondayIso + "T00:00:00");
  d.setDate(d.getDate() + 6);
  return d.toISOString().split("T")[0];
}

function isCurrentWeek(mondayIso: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monday = new Date(mondayIso + "T00:00:00");
  const sunday = new Date(mondayIso + "T00:00:00");
  sunday.setDate(sunday.getDate() + 6);
  return today >= monday && today <= sunday;
}

function getMondays(startDate: string, endDate: string): string[] {
  const mondays: string[] = [];
  const start = new Date(startDate + "T00:00:00");
  const end = new Date(endDate + "T00:00:00");
  const current = new Date(start);
  const day = current.getDay();
  const diffToMonday = day === 0 ? 1 : day === 1 ? 0 : 8 - day;
  current.setDate(current.getDate() + diffToMonday);
  while (current <= end) {
    mondays.push(current.toISOString().split("T")[0]);
    current.setDate(current.getDate() + 7);
  }
  return mondays;
}

function daysBetween(dateA: string, dateB: string): number {
  const a = new Date(dateA + "T00:00:00");
  const b = new Date(dateB + "T00:00:00");
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function interviewStatusLabel(status: Interview["status"]): string {
  switch (status) {
    case "draft_athlete":
      return "A preparer";
    case "draft_coach":
      return "En attente coach";
    case "sent":
      return "A completer";
    case "signed":
      return "Termine";
    default:
      return status;
  }
}

function interviewStatusColor(status: Interview["status"]): string {
  switch (status) {
    case "draft_athlete":
      return "text-amber-600 bg-amber-500/10";
    case "draft_coach":
      return "text-blue-600 bg-blue-500/10";
    case "sent":
      return "text-primary bg-primary/10";
    case "signed":
      return "text-emerald-600 bg-emerald-500/10";
    default:
      return "text-muted-foreground bg-muted";
  }
}

// ── Filiere micro-grid helpers ──────────────────────────────────

const DAY_ROWS = [
  { index: 0, label: "Lun" },
  { index: 1, label: "Mar" },
  { index: 2, label: "Mer" },
  { index: 3, label: "Jeu" },
  { index: 4, label: "Ven" },
  { index: 5, label: "Sam" },
] as const;

function MiniFiliereDot({ slot }: { slot: SwimPlanningSlot | undefined }) {
  if (!slot) {
    return (
      <div className="h-7 w-full rounded-md bg-muted/20 dark:bg-muted/10 flex items-center justify-center">
        <span className="text-muted-foreground/15 text-[9px]">—</span>
      </div>
    );
  }

  const filiere = FILIERE_MAP.get(slot.filiere);
  const color = filiere?.color ?? "sky";
  const style = FILIERE_STYLES[color] ?? FILIERE_STYLES.sky;

  return (
    <div
      className={cn(
        "h-7 w-full rounded-md flex items-center justify-center px-1",
        style.bg,
      )}
    >
      <span className={cn("text-[9px] font-semibold truncate leading-tight", style.text)}>
        {filiere?.short ?? slot.filiere}
      </span>
    </div>
  );
}

// ── Compact assigned sessions per week ─────────────────────────

const DAY_LABELS_SHORT = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

function getWeekDates(mondayIso: string): string[] {
  const dates: string[] = [];
  const d = new Date(mondayIso + "T00:00:00");
  for (let i = 0; i < 7; i++) {
    dates.push(d.toISOString().split("T")[0]);
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

function WeekAssignedSessions({ monday, userId }: { monday: string; userId: number }) {
  const dates = useMemo(() => getWeekDates(monday), [monday]);

  const { data: swimmerSessionsRaw, isLoading } = useQuery({
    queryKey: ["swimmer-sessions-week", userId, monday],
    queryFn: () =>
      getSwimmerSessions(userId, dates[0], dates[dates.length - 1], false),
    enabled: !!userId && dates.length === 7,
    staleTime: 60_000,
  });

  if (isLoading) return <Skeleton className="h-12 rounded-lg" />;

  // Group assigned sessions per day using the RPC result directly.
  // The RPC already pre-computes title/type so no further hydration needed.
  const sessionsByDate = new Map<
    string,
    Array<{ title: string; type: "swim" | "strength" }>
  >();
  for (const row of swimmerSessionsRaw ?? []) {
    if (row.assignment_id == null) continue;
    const list = sessionsByDate.get(row.scheduled_date) ?? [];
    list.push({
      title: row.assignment_title || "Séance",
      type: row.slot_session_type === "strength" ? "strength" : "swim",
    });
    sessionsByDate.set(row.scheduled_date, list);
  }

  const daysWithSessions: Array<{
    dayLabel: string;
    sessions: Array<{ title: string; type: "swim" | "strength" }>;
  }> = [];
  for (let i = 0; i < dates.length; i++) {
    const sessions = sessionsByDate.get(dates[i]) ?? [];
    if (sessions.length === 0) continue;
    daysWithSessions.push({ dayLabel: DAY_LABELS_SHORT[i], sessions });
  }

  if (daysWithSessions.length === 0) return null;

  return (
    <div className="space-y-1">
      <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/40">
        Séances assignées
      </p>
      <div className="space-y-0.5">
        {daysWithSessions.map((day) => (
          <div key={day.dayLabel} className="flex items-center gap-2">
            <span className="text-[10px] font-medium text-muted-foreground/50 w-7 shrink-0">
              {day.dayLabel}
            </span>
            <div className="flex-1 min-w-0 flex items-center gap-1 flex-wrap">
              {day.sessions.map((s, i) => (
                <span
                  key={`${s.type}-${s.title}-${i}`}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium truncate max-w-[140px]",
                    s.type === "swim"
                      ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                      : "bg-amber-500/10 text-amber-600 dark:text-amber-400",
                  )}
                >
                  <span className={cn(
                    "h-1.5 w-1.5 rounded-full shrink-0",
                    s.type === "swim" ? "bg-blue-500" : "bg-amber-400",
                  )} />
                  {s.title}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Timeline item types ─────────────────────────────────────────

type TimelineItem =
  | { type: "cycle-header"; cycleId: string; cycleName: string; weeksDone: number; weeksTotal: number }
  | { type: "week"; monday: string; weekIndex: number; week: TrainingWeek | undefined; isCurrent: boolean }
  | { type: "competition"; id: string; name: string; date: string; location: string; daysUntil: number }
  | { type: "interview"; interview: Interview };

// ── Filiere micro-grid for expanded week ───────────────────────

function WeekFiliereGrid({ monday, groupId }: { monday: string; groupId: number }) {
  const weekStarts = useMemo(() => [monday], [monday]);

  const { data: slots = [], isLoading } = useQuery({
    queryKey: ["swim-planning-slots-week", groupId, monday],
    queryFn: () => getSwimPlanningSlots({ groupId, weekStarts }),
    enabled: !!groupId,
    staleTime: 60_000,
  });

  const findSlot = useCallback(
    (dayIndex: number, timeSlot: "morning" | "evening"): SwimPlanningSlot | undefined => {
      return slots.find((s) => s.day_of_week === dayIndex && s.time_slot === timeSlot);
    },
    [slots],
  );

  if (isLoading) {
    return <Skeleton className="h-16 rounded-lg" />;
  }

  if (slots.length === 0) return null;

  return (
    <div className="rounded-lg border bg-muted/10 overflow-hidden">
      {/* Column headers */}
      <div className="grid grid-cols-[40px_1fr_1fr] gap-0.5 px-2 pt-1.5 pb-0.5">
        <span />
        <span className="text-[9px] font-semibold text-muted-foreground/50 text-center uppercase tracking-wider">
          Matin
        </span>
        <span className="text-[9px] font-semibold text-muted-foreground/50 text-center uppercase tracking-wider">
          Soir
        </span>
      </div>
      {/* Day rows */}
      <div className="px-2 pb-2 space-y-0.5">
        {DAY_ROWS.map((day) => (
          <div key={day.index} className="grid grid-cols-[40px_1fr_1fr] gap-0.5 items-center">
            <span className="text-[10px] font-medium text-muted-foreground/60">
              {day.label}
            </span>
            <MiniFiliereDot slot={findSlot(day.index, "morning")} />
            <MiniFiliereDot slot={findSlot(day.index, "evening")} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main page ───────────────────────────────────────────────────

export default function SuiviSaison() {
  const [, navigate] = useLocation();
  const userId = useAuth((s) => s.userId);
  const reduce = useReducedMotion();
  const todayIso = useMemo(() => new Date().toISOString().split("T")[0], []);
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set());

  // ── Data fetching ───────────────────────────────────────

  const { data: competitions = [] } = useQuery({
    queryKey: ["competitions"],
    queryFn: () => getCompetitions(),
  });

  const { data: assignedIds = [] } = useQuery({
    queryKey: ["my-competition-ids", userId],
    queryFn: () => getMyCompetitionIds(userId!),
    enabled: !!userId,
  });

  const { data: cycles = [] } = useQuery({
    queryKey: ["training-cycles", "athlete", userId],
    queryFn: () => getTrainingCycles({ athleteId: userId! }),
    enabled: !!userId,
  });

  const { data: interviews = [] } = useQuery({
    queryKey: ["my-interviews"],
    queryFn: () => getMyInterviews(),
  });

  const { data: objectives = [] } = useQuery({
    queryKey: ["athlete-objectives"],
    queryFn: () => getAthleteObjectives(),
  });

  // Fetch profile for IUF + performances + group_id
  const { data: authUser } = useQuery({
    queryKey: ["auth-user"],
    queryFn: async () => {
      const { data } = await (await import("@/lib/supabase")).supabase.auth.getUser();
      return data.user;
    },
  });
  const appUserId = (authUser?.app_metadata as Record<string, unknown>)?.app_user_id as number | undefined;

  const { data: profile } = useQuery({
    queryKey: ["my-profile-iuf"],
    queryFn: () => getProfile({ userId: appUserId }),
    enabled: !!appUserId,
  });
  const iuf = profile?.ffn_iuf ?? null;
  const groupId = profile?.group_id ?? null;

  const perfFromDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 360);
    return d.toISOString().slice(0, 10);
  }, []);

  const { data: performances = [] } = useQuery({
    queryKey: ["swimmer-performances-recent", iuf],
    queryFn: () => getSwimmerPerformances({ iuf: iuf!, fromDate: perfFromDate }),
    enabled: !!iuf,
  });

  // ── Derived data ────────────────────────────────────────

  const upcomingCompetitions = useMemo(() => {
    const assignedSet = new Set(assignedIds);
    return competitions
      .filter((c) => assignedSet.has(c.id) && c.date >= todayIso)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [assignedIds, competitions, todayIso]);

  const nextCompetition = upcomingCompetitions[0] ?? null;

  // Map cycles by end_competition_id
  const cyclesByCompetitionId = useMemo(() => {
    const map = new Map<string, (typeof cycles)[number]>();
    cycles
      .slice()
      .sort((a, b) => (a.end_competition_date ?? "").localeCompare(b.end_competition_date ?? ""))
      .forEach((cycle) => {
        if (cycle.end_competition_id && !map.has(cycle.end_competition_id)) {
          map.set(cycle.end_competition_id, cycle);
        }
      });
    return map;
  }, [cycles]);

  // Filter planned cycles
  const plannedCycles = useMemo(() => {
    const seen = new Set<string>();
    return upcomingCompetitions
      .map((c) => cyclesByCompetitionId.get(c.id) ?? null)
      .filter((cycle): cycle is NonNullable<typeof cycle> => {
        if (!cycle || seen.has(cycle.id)) return false;
        seen.add(cycle.id);
        return true;
      });
  }, [cyclesByCompetitionId, upcomingCompetitions]);

  // Fetch weeks for all planned cycles
  const weekQueries = useQueries({
    queries: plannedCycles.map((cycle) => ({
      queryKey: ["training-weeks", cycle.id],
      queryFn: () => getTrainingWeeks(cycle.id),
      enabled: !!cycle.id,
    })),
  });

  const weeksByCycleId = useMemo(() => {
    const map = new Map<string, TrainingWeek[]>();
    plannedCycles.forEach((cycle, index) => {
      map.set(cycle.id, (weekQueries[index]?.data as TrainingWeek[] | undefined) ?? []);
    });
    return map;
  }, [plannedCycles, weekQueries]);

  // ── Build unified timeline ──────────────────────────────

  const timelineItems = useMemo(() => {
    const items: TimelineItem[] = [];

    // For each upcoming competition with a cycle, build timeline
    for (const comp of upcomingCompetitions) {
      const cycle = cyclesByCompetitionId.get(comp.id);
      if (!cycle) {
        // Competition without cycle — just show event
        items.push({
          type: "competition",
          id: comp.id,
          name: comp.name,
          date: comp.date,
          location: comp.location ?? "",
          daysUntil: daysBetween(todayIso, comp.date),
        });
        continue;
      }

      const cycleStart = cycle.start_date ?? cycle.start_competition_date ?? todayIso;
      const allMondays = getMondays(cycleStart, comp.date);
      const cycleWeeks = weeksByCycleId.get(cycle.id) ?? [];
      const weeksByStart = new Map(cycleWeeks.map((w) => [w.week_start, w]));

      // Count completed weeks (before today)
      const weeksDone = allMondays.filter((m) => m < todayIso).length;

      // Cycle header
      items.push({
        type: "cycle-header",
        cycleId: cycle.id,
        cycleName: cycle.name,
        weeksDone,
        weeksTotal: allMondays.length,
      });

      // Interleave weeks and events
      // Collect interviews within this cycle's date range
      const cycleEnd = comp.date;
      const relevantInterviews = interviews.filter(
        (iv) => iv.date >= cycleStart && iv.date <= cycleEnd,
      );

      // Build a combined list sorted by date
      type Sortable = { date: string; item: TimelineItem };
      const sortables: Sortable[] = [];

      allMondays.forEach((monday, idx) => {
        const week = weeksByStart.get(monday);
        const current = isCurrentWeek(monday);
        // Only show future and current weeks (+ 2 past weeks for context)
        const isPast = monday < todayIso && !current;
        const pastWeeks = allMondays.filter((m) => m < todayIso && !isCurrentWeek(m)).length;
        const pastIndex = allMondays.filter((m) => m < monday && m < todayIso).length;
        if (isPast && pastIndex < pastWeeks - 2) return;

        sortables.push({
          date: monday,
          item: {
            type: "week",
            monday,
            weekIndex: idx + 1,
            week,
            isCurrent: current,
          },
        });
      });

      relevantInterviews.forEach((iv) => {
        sortables.push({
          date: iv.date,
          item: { type: "interview", interview: iv },
        });
      });

      sortables.sort((a, b) => a.date.localeCompare(b.date));

      for (const s of sortables) {
        items.push(s.item);
      }

      // Competition event at end
      items.push({
        type: "competition",
        id: comp.id,
        name: comp.name,
        date: comp.date,
        location: comp.location ?? "",
        daysUntil: daysBetween(todayIso, comp.date),
      });
    }

    // Add standalone interviews not covered by any cycle
    const cycleInterviewIds = new Set<string>();
    for (const item of items) {
      if (item.type === "interview") cycleInterviewIds.add(item.interview.id);
    }
    const standaloneInterviews = interviews.filter(
      (iv) => !cycleInterviewIds.has(iv.id) && iv.date >= todayIso,
    );
    for (const iv of standaloneInterviews) {
      items.push({ type: "interview", interview: iv });
    }

    return items;
  }, [upcomingCompetitions, cyclesByCompetitionId, weeksByCycleId, interviews, todayIso]);

  // ── Actions ─────────────────────────────────────────────

  const toggleWeek = useCallback((monday: string) => {
    setExpandedWeeks((prev) => {
      const next = new Set(prev);
      if (next.has(monday)) next.delete(monday);
      else next.add(monday);
      return next;
    });
  }, []);

  // ── Render ──────────────────────────────────────────────

  const isLoading = !userId;

  return (
    <div className="mx-auto max-w-4xl px-4 pb-24">
      <h1 className="sr-only">Suivi de saison</h1>
      {/* Sticky header */}
      <PageHeader
        title="Ma saison"
        icon={<CalendarRange className="h-3.5 w-3.5" />}
        backHref="/suivi"
        backLabel="Mon suivi"
        action={
          nextCompetition ? (
            <Badge className="border-primary/20 bg-primary/10 text-primary text-[11px] px-2 py-1">
              J-{daysBetween(todayIso, nextCompetition.date)}
            </Badge>
          ) : undefined
        }
      />

      <div className="space-y-5 pt-3">
        {/* ── Objectives ────────────────────────────────────── */}
        {objectives.length > 0 && (
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Objectifs
              </h2>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-[11px] text-primary"
                onClick={() => navigate("/suivi/objectifs")}
              >
                <Plus className="h-3 w-3" />
                Ajouter
              </Button>
            </div>
            <div className="space-y-1.5">
              {objectives.map((obj) => (
                <ObjectiveCard
                  key={obj.id}
                  objective={obj}
                  performances={performances}
                  compact
                />
              ))}
            </div>
          </section>
        )}

        {/* ── Empty state / Timeline ─────────────────────── */}
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-14 rounded-2xl" />
            <Skeleton className="h-10 rounded-xl" />
            <Skeleton className="h-10 rounded-xl" />
            <Skeleton className="h-10 rounded-xl" />
          </div>
        ) : timelineItems.length === 0 ? (
          <div className="rounded-3xl border border-dashed bg-card/70 px-4 py-10 text-center">
            <CalendarRange className="mx-auto h-10 w-10 text-muted-foreground/60" />
            <p className="mt-3 text-sm font-medium">Aucune echeance a venir</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Ton plan de saison apparaitra ici quand ton coach aura programme tes cycles.
            </p>
          </div>
        ) : (
          /* ── Timeline ──────────────────────────────────── */
          <div className="relative px-0 pt-3 pb-24">
            {/* Vertical rail */}
            <div className="absolute left-[27px] top-8 bottom-8 w-px bg-border" />

            {timelineItems.map((item, idx) => {
              if (item.type === "cycle-header") {
                return (
                  <div key={`cycle-${item.cycleId}`} className="relative pl-8 mb-2">
                    {/* Cycle dot */}
                    <div className="absolute left-[11px] top-1/2 -translate-y-1/2 h-3 w-3 rounded-full bg-primary ring-2 ring-background" />
                    <div className="rounded-2xl border bg-card/90 px-3.5 py-2.5 shadow-sm">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold">{item.cycleName}</span>
                        <Badge variant="secondary" className="text-[10px]">
                          Sem {item.weeksDone}/{item.weeksTotal}
                        </Badge>
                      </div>
                      {/* Progress bar */}
                      <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary/70 transition-all duration-500"
                          style={{ width: `${item.weeksTotal > 0 ? (item.weeksDone / item.weeksTotal) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              }

              if (item.type === "week") {
                const isExpanded = expandedWeeks.has(item.monday);
                const sunday = getSunday(item.monday);
                const isPast = item.monday < todayIso && !item.isCurrent;

                return (
                  <div key={`week-${item.monday}`} className="relative pl-8 mb-2">
                    {/* Week dot */}
                    <div className={cn(
                      "absolute left-[11px] top-3.5 h-[9px] w-[9px] rounded-full ring-2 ring-background transition-colors",
                      item.isCurrent ? "bg-primary" : isPast ? "bg-muted-foreground/25" : "bg-muted-foreground/25",
                    )} />

                    <div className={cn(
                      "rounded-xl border bg-card overflow-hidden transition-all",
                      item.isCurrent && "ring-2 ring-primary",
                    )}>
                      {/* Week header button */}
                      <button
                        type="button"
                        className="w-full text-left px-3 py-2.5 flex items-center gap-2 min-h-[44px] hover:bg-muted/40 transition-colors active:bg-muted/60"
                        onClick={() => toggleWeek(item.monday)}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-foreground tabular-nums">
                              Sem. {item.weekIndex}
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                              {fmtShort(item.monday)} &ndash; {fmtShort(sunday)}
                            </span>
                            {item.week?.week_type && (
                              <Badge
                                className="ml-auto border-0 px-1.5 py-0 text-[10px]"
                                style={{
                                  backgroundColor: weekTypeColor(item.week.week_type),
                                  color: weekTypeTextColor(item.week.week_type),
                                }}
                              >
                                {item.week.week_type}
                              </Badge>
                            )}
                            {item.isCurrent && (
                              <Badge className="border-primary/20 bg-primary/10 text-[10px] text-primary px-1.5 py-0">
                                Cette semaine
                              </Badge>
                            )}
                          </div>
                          {item.week?.notes && (
                            <p className="mt-1 text-[11px] text-muted-foreground line-clamp-2">
                              {item.week.notes}
                            </p>
                          )}
                        </div>

                        {/* Chevron with rotation animation */}
                        <motion.span
                          animate={{ rotate: isExpanded ? 180 : 0 }}
                          transition={reduce ? { duration: 0 } : { duration: 0.2 }}
                          className="shrink-0"
                        >
                          <ChevronDown className="h-4 w-4 text-muted-foreground/40" />
                        </motion.span>
                      </button>

                      {/* Expanded content with AnimatePresence */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={reduce ? false : { height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
                            transition={reduce ? { duration: 0 } : { duration: 0.25, ease: "easeInOut" }}
                            className="overflow-hidden"
                          >
                            <div className="border-t px-3 py-2.5 space-y-2.5">
                              {/* Filiere micro-grid (natation) */}
                              {groupId && (
                                <WeekFiliereGrid monday={item.monday} groupId={groupId} />
                              )}
                              {/* Assigned sessions (natation + muscu) */}
                              {userId && (
                                <WeekAssignedSessions monday={item.monday} userId={userId} />
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                );
              }

              if (item.type === "competition") {
                return (
                  <div key={`comp-${item.id}-${idx}`} className="relative pl-8 mb-2">
                    {/* Competition dot */}
                    <div className="absolute left-[11px] top-1/2 -translate-y-1/2 h-3 w-3 rounded-full bg-amber-500 ring-2 ring-background" />
                    <button
                      type="button"
                      className="w-full text-left rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/10 via-primary/5 to-amber-500/10 px-3.5 py-3 shadow-sm transition-all hover:shadow-md active:scale-[0.98]"
                      onClick={() => navigate(`/competition/${item.id}`)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Trophy className="h-3.5 w-3.5 text-primary shrink-0" />
                            <span className="text-sm font-semibold">{item.name}</span>
                          </div>
                          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{formatDate(item.date)}</span>
                            {item.location && (
                              <>
                                <span>-</span>
                                <MapPin className="h-3 w-3 shrink-0" />
                                <span className="truncate">{item.location}</span>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Badge variant="outline" className="text-[10px] font-semibold">
                            J-{item.daysUntil}
                          </Badge>
                          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                      </div>
                    </button>
                  </div>
                );
              }

              if (item.type === "interview") {
                const iv = item.interview;
                const needsAction = iv.status === "draft_athlete" || iv.status === "sent";

                return (
                  <div key={`iv-${iv.id}`} className="relative pl-8 mb-2">
                    {/* Interview dot */}
                    <div className="absolute left-[11px] top-1/2 -translate-y-1/2 h-[9px] w-[9px] rounded-full bg-blue-500 ring-2 ring-background" />
                    <div className="rounded-xl border-l-4 border-l-blue-500 border border-border bg-card px-3 py-2.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <MessageSquare className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                        <span className="text-xs font-semibold">Entretien</span>
                        <span className="text-[11px] text-muted-foreground">{formatDate(iv.date)}</span>
                        <Badge className={`text-[10px] px-1.5 py-0 ml-auto border-0 ${interviewStatusColor(iv.status)}`}>
                          {interviewStatusLabel(iv.status)}
                        </Badge>
                      </div>
                      {needsAction && (
                        <p className="mt-1 text-[11px] text-amber-600 font-medium">
                          Action requise de ta part
                        </p>
                      )}
                    </div>
                  </div>
                );
              }

              return null;
            })}
          </div>
        )}
      </div>
    </div>
  );
}
