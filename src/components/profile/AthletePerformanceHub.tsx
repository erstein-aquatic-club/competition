import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQueries, useQuery } from "@tanstack/react-query";
import {
  getSwimmerSlots,
  getCompetitions,
  getMyCompetitionIds,
  getTrainingCycles,
  getTrainingWeeks,
} from "@/lib/api";
import type { TrainingWeek } from "@/lib/api";
import { toISODate } from "@/lib/date";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import SwimmerFeedbackTab from "@/pages/coach/SwimmerFeedbackTab";
import AthleteInterviewsSection from "./AthleteInterviewsSection";
import SwimmerObjectivesView from "./SwimmerObjectivesView";
import { weekTypeColor, weekTypeTextColor } from "@/lib/weekTypeColor";
import {
  ArrowLeft,
  CalendarClock,
  CalendarRange,
  ChevronRight,
  Clock,
  ExternalLink,
  MapPin,
  MessageSquare,
  Sparkles,
  Target,
  Trophy,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  athleteId: number;
  athleteName: string;
  groupLabel?: string | null;
  onBack?: () => void;
  defaultTab?: string;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
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
  // §296 — toISODate (local) au lieu de toISOString().split (UTC).
  return toISODate(d);
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
    mondays.push(toISODate(current));
    current.setDate(current.getDate() + 7);
  }
  return mondays;
}

function daysBetween(dateA: string, dateB: string): number {
  const a = new Date(dateA + "T00:00:00");
  const b = new Date(dateB + "T00:00:00");
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

// ── Read-only swimmer slots (athlete view) ─────────────────────

const DAYS_FR = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

function isSwimSlot(slot: { session_type?: "swim" | "strength" | null }): boolean {
  return (slot.session_type ?? "swim") === "swim";
}

function durationLabel(start: string, end: string): string {
  const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  const diff = toMin(end) - toMin(start);
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h${String(m).padStart(2, "0")}`;
}

function AthleteSlots({ athleteId }: { athleteId: number }) {
  const { data: slots = [], isLoading } = useQuery({
    queryKey: ["swimmer-slots", athleteId],
    queryFn: () => getSwimmerSlots(athleteId),
    enabled: !!athleteId,
  });

  const slotsByDay = useMemo(() => {
    const map = new Map<number, typeof slots>();
    for (const s of slots) {
      const arr = map.get(s.day_of_week) ?? [];
      arr.push(s);
      map.set(s.day_of_week, arr);
    }
    return map;
  }, [slots]);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-12 rounded-xl border animate-pulse bg-muted/30" />
        ))}
      </div>
    );
  }

  if (slots.length === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-muted/20 py-6 text-center">
        <p className="text-xs text-muted-foreground">Aucun créneau personnalisé.</p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {[1, 2, 3, 4, 5, 6, 7].map((dow) => {
        const daySlots = slotsByDay.get(dow);
        if (!daySlots || daySlots.length === 0) return null;
        return (
          <div key={dow} className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-0.5">
              {DAYS_FR[dow - 1]}
            </p>
            {daySlots.map((s) => {
              const swim = isSwimSlot(s);
              return (
                <div
                  key={s.id}
                  className="flex rounded-xl border bg-card overflow-hidden"
                >
                  <div className={`w-1 shrink-0 ${swim ? "bg-blue-500" : "bg-amber-400"}`} />
                  <div className="flex-1 px-3 py-2 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold tabular-nums">
                        {(s.start_time as string).slice(0, 5)} – {(s.end_time as string).slice(0, 5)}
                      </span>
                      <span className={`text-xs tabular-nums px-1.5 py-0.5 rounded-md font-medium ${
                        swim
                          ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                          : "bg-amber-400/10 text-amber-600 dark:text-amber-400"
                      }`}>
                        {durationLabel(s.start_time, s.end_time)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="text-xs text-muted-foreground truncate">{s.location}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ── Season planning ─────────────────────────────────────────────

function AthleteSeasonPlanning({ athleteId }: { athleteId: number }) {
  const [, navigate] = useLocation();
  const todayIso = useMemo(() => toISODate(new Date()), []);
  const [openCompetitionIds, setOpenCompetitionIds] = useState<string[]>([]);

  const { data: competitions = [] } = useQuery({
    queryKey: ["competitions"],
    queryFn: () => getCompetitions(),
  });

  const { data: assignedIds = [] } = useQuery({
    queryKey: ["my-competition-ids", athleteId],
    queryFn: () => getMyCompetitionIds(athleteId),
  });

  const { data: cycles = [] } = useQuery({
    queryKey: ["training-cycles", "athlete", athleteId],
    queryFn: () => getTrainingCycles({ athleteId }),
  });

  const upcomingCompetitions = useMemo(() => {
    const assignedSet = new Set(assignedIds);
    return competitions
      .filter((competition) => assignedSet.has(competition.id) && competition.date >= todayIso)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [assignedIds, competitions, todayIso]);

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

  const plannedCycles = useMemo(() => {
    const seen = new Set<string>();
    return upcomingCompetitions
      .map((competition) => cyclesByCompetitionId.get(competition.id) ?? null)
      .filter((cycle): cycle is NonNullable<typeof cycle> => {
        if (!cycle || seen.has(cycle.id)) return false;
        seen.add(cycle.id);
        return true;
      });
  }, [cyclesByCompetitionId, upcomingCompetitions]);

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

  const nextCompetition = upcomingCompetitions[0] ?? null;

  const toggleCompetition = (competitionId: string) => {
    setOpenCompetitionIds((current) =>
      current.includes(competitionId)
        ? current.filter((id) => id !== competitionId)
        : [...current, competitionId],
    );
  };

  if (upcomingCompetitions.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed bg-card/70 px-4 py-8 text-center">
        <CalendarRange className="mx-auto h-10 w-10 text-muted-foreground/60" />
        <p className="mt-3 text-sm font-medium">Aucune échéance à venir.</p>
        <p className="mt-1 text-xs text-muted-foreground">Ton plan apparaîtra ici.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border bg-gradient-to-br from-primary/[0.08] via-background to-amber-500/[0.08] p-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">
            {upcomingCompetitions.length} échéance{upcomingCompetitions.length > 1 ? "s" : ""}
          </span>
          {nextCompetition && (
            <Badge variant="secondary" className="text-[10px] px-2 py-0.5">
              cap J-{daysBetween(todayIso, nextCompetition.date)}
            </Badge>
          )}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Vue de tes prochains cycles.</p>
      </div>

      <div className="space-y-3">
        {upcomingCompetitions.map((competition, compIndex) => {
          const cycle = cyclesByCompetitionId.get(competition.id) ?? null;
          const cycleStart = cycle?.start_date ?? cycle?.start_competition_date ?? todayIso;
          const visibleStart = cycleStart > todayIso ? cycleStart : todayIso;
          const visibleMondays = cycle ? getMondays(visibleStart, competition.date) : [];
          const totalMondays = cycle ? getMondays(cycleStart, competition.date) : [];
          const hiddenWeeks = Math.max(totalMondays.length - visibleMondays.length, 0);
          const cycleWeeks = cycle ? (weeksByCycleId.get(cycle.id) ?? []) : [];
          const weeksByStart = new Map(cycleWeeks.map((week) => [week.week_start, week]));
          const daysUntil = daysBetween(todayIso, competition.date);
          const isOpen = openCompetitionIds.includes(competition.id);

          return (
            <Collapsible
              key={competition.id}
              open={isOpen}
              onOpenChange={() => toggleCompetition(competition.id)}
            >
              <section className="overflow-hidden rounded-3xl border bg-card shadow-sm">
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="w-full border-b border-border bg-muted/20 px-4 py-3 text-left transition-colors hover:bg-muted/30"
                  >
                    <div className="flex items-start gap-3">
                      <ChevronRight
                        className={`mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                          isOpen ? "rotate-90" : ""
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold">{competition.name}</span>
                          {compIndex === 0 && (
                            <Badge className="border-primary/20 bg-primary/10 text-[10px] text-primary">
                              Priorité
                            </Badge>
                          )}
                          <Badge variant="secondary" className="text-[10px]">
                            {formatDate(competition.date)}
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            J-{daysUntil}
                          </Badge>
                          <button
                            type="button"
                            className="ml-auto shrink-0 rounded-lg p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/competition/${competition.id}`);
                            }}
                            aria-label="Voir la compétition"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        {cycle ? (
                          <div className="mt-1 flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">{cycle.name}</span>
                            <span>{totalMondays.length} sem.</span>
                            {hiddenWeeks > 0 && (
                              <span>
                                {hiddenWeeks} sem. passée{hiddenWeeks > 1 ? "s" : ""}
                              </span>
                            )}
                          </div>
                        ) : (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Pas de cycle détaillé.
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                </CollapsibleTrigger>

                <CollapsibleContent>
                  {!cycle ? (
                    <div className="px-4 py-4 text-xs text-muted-foreground italic">
                      L&apos;échéance reste affichée.
                    </div>
                  ) : visibleMondays.length === 0 ? (
                    <div className="px-4 py-4 text-xs text-muted-foreground italic">
                      Pas de semaine à venir.
                    </div>
                  ) : (
                    <div className="px-4 py-4">
                      <div className="relative ml-2 space-y-2 border-l-2 border-border pl-4">
                        {visibleMondays.map((monday, index) => {
                          const week = weeksByStart.get(monday);
                          const current = isCurrentWeek(monday);
                          const sunday = getSunday(monday);

                          return (
                            <div
                              key={monday}
                              className={`rounded-2xl border bg-card px-3 py-2 text-xs ${
                                current ? "ring-2 ring-primary/40 bg-primary/[0.04]" : ""
                              }`}
                            >
                              <div className="flex items-center gap-2 flex-wrap">
                                <span
                                  className={`h-2 w-2 rounded-full shrink-0 ${
                                    current
                                      ? "bg-primary"
                                      : week?.week_type
                                        ? "bg-muted-foreground/40"
                                        : "bg-muted-foreground/20"
                                  }`}
                                />
                                <span className="whitespace-nowrap text-muted-foreground">
                                  Sem. {hiddenWeeks + index + 1}
                                </span>
                                <span className="whitespace-nowrap text-muted-foreground/70">
                                  {fmtShort(monday)} - {fmtShort(sunday)}
                                </span>
                                {week?.week_type && (
                                  <Badge
                                    className="ml-auto border-0 px-1.5 py-0 text-[10px]"
                                    style={{
                                      backgroundColor: weekTypeColor(week.week_type),
                                      color: weekTypeTextColor(week.week_type),
                                    }}
                                  >
                                    {week.week_type}
                                  </Badge>
                                )}
                              </div>
                              {week?.notes && (
                                <p className="mt-1 pl-4 text-[11px] text-muted-foreground line-clamp-2">
                                  {week.notes}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </CollapsibleContent>
              </section>
            </Collapsible>
          );
        })}
      </div>
    </div>
  );
}

export default function AthletePerformanceHub({
  athleteId,
  athleteName,
  groupLabel,
  onBack,
  defaultTab,
}: Props) {
  return (
    <div className="mx-auto max-w-4xl pb-24 space-y-4">
      <div className="rounded-[1.75rem] border bg-gradient-to-br from-primary/[0.12] via-background to-amber-500/[0.08] shadow-sm p-4">
        {onBack && (
          <Button variant="ghost" size="sm" className="-ml-2 mb-2" onClick={onBack}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Retour
          </Button>
        )}
        <div className="flex items-center gap-3">
          <div className="flex shrink-0 items-center justify-center rounded-2xl bg-primary/12 text-primary h-11 w-11">
            <Trophy className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-semibold tracking-tight text-foreground text-xl">
                Mon suivi
              </h1>
              {groupLabel && (
                <Badge variant="secondary" className="text-[10px]">
                  {groupLabel}
                </Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {athleteName}: ton plan d&apos;action, tes entretiens et tes échéances au même endroit.
            </p>
          </div>
        </div>
      </div>

      <Tabs defaultValue={defaultTab || "objectifs"} className="space-y-4">
        <TabsList className="grid h-auto w-full grid-cols-2 sm:grid-cols-4 gap-2 rounded-2xl bg-transparent p-0">
          <TabsTrigger value="objectifs" className="gap-1 rounded-2xl border border-border bg-card px-3 py-2.5 text-xs data-[state=active]:border-primary/30 data-[state=active]:bg-primary/5 data-[state=active]:text-primary">
            <Target className="hidden h-3.5 w-3.5 sm:block" />
            <span className="sm:hidden">Plan d&apos;action</span>
            <span className="hidden sm:inline">Plan d'action</span>
          </TabsTrigger>
          <TabsTrigger value="ressentis" className="gap-1 rounded-2xl border border-border bg-card px-3 py-2.5 text-xs data-[state=active]:border-primary/30 data-[state=active]:bg-primary/5 data-[state=active]:text-primary">
            <Clock className="hidden h-3.5 w-3.5 sm:block" />
            <span>Ressentis</span>
          </TabsTrigger>
          <TabsTrigger value="entretiens" className="gap-1 rounded-2xl border border-border bg-card px-3 py-2.5 text-xs data-[state=active]:border-primary/30 data-[state=active]:bg-primary/5 data-[state=active]:text-primary">
            <MessageSquare className="hidden h-3.5 w-3.5 sm:block" />
            <span>Entretiens</span>
          </TabsTrigger>
          <TabsTrigger value="planification" className="gap-1 rounded-2xl border border-border bg-card px-3 py-2.5 text-xs data-[state=active]:border-primary/30 data-[state=active]:bg-primary/5 data-[state=active]:text-primary">
            <CalendarRange className="hidden h-3.5 w-3.5 sm:block" />
            <span>Planif.</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="objectifs" className="mt-0">
          <SwimmerObjectivesView embedded />
        </TabsContent>

        <TabsContent value="ressentis" className="mt-0">
          <SwimmerFeedbackTab
            athleteId={athleteId}
            athleteName={athleteName}
            showProgressAction={false}
          />
        </TabsContent>

        <TabsContent value="entretiens" className="mt-0">
          <AthleteInterviewsSection embedded />
        </TabsContent>

        <TabsContent value="planification" className="mt-0 space-y-4">
          <Collapsible defaultOpen>
            <CollapsibleTrigger asChild>
              <button type="button" className="w-full flex items-center gap-2 group">
                <CalendarClock className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">Créneaux</h2>
                <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2">
              <AthleteSlots athleteId={athleteId} />
            </CollapsibleContent>
          </Collapsible>

          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <CalendarRange className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Cycle</h2>
            </div>
            <AthleteSeasonPlanning athleteId={athleteId} />
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}
