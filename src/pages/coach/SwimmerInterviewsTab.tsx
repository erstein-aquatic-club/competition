import { useCallback, useMemo, useRef, useState } from "react";
import { useQuery, useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getCompetitions,
  getMyCompetitionIds,
  getTrainingCycles,
  getTrainingWeeks,
  createTrainingCycle,
  bulkUpsertTrainingWeeks,
  upsertTrainingWeek,
  getPreviousInterview,
  updateInterviewCoachSections,
  sendInterviewToAthlete,
  deleteInterview,
  getObjectives,
  getProfile,
  getSwimmerPerformances,
  getInterviews,
  createInterview,
  type Interview,
  type InterviewStatus,
  type InterviewCoachInput,
  type Objective,
  type TrainingWeek,
  type TrainingWeekInput,
  type SwimmerPerformance,
} from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Plus,
  Trash2,
  Send,
  Clock,
  MessageSquare,
  Smartphone,
  User,
  GraduationCap,
  Trophy,
  ChevronDown,
  ChevronRight,
  ChevronUp,
} from "lucide-react";
import {
  eventLabel,
  formatTime,
} from "@/lib/objectiveHelpers";
import { ObjectiveCard } from "@/components/shared/ObjectiveCard";
import { weekTypeColor, weekTypeTextColor } from "@/lib/weekTypeColor";
import { buildSmsUri, canOpenSmsApp } from "@/lib/smsUtils";

// ── Types ───────────────────────────────────────────────────────

interface Props {
  athleteId: number;
  athleteName: string;
}

// ── Helpers ─────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
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

const STATUS_CONFIG: Record<InterviewStatus, { label: string; variant: "default" | "secondary" | "outline" | "destructive"; className: string }> = {
  draft_athlete: {
    label: "En attente nageur",
    variant: "secondary",
    className: "bg-status-warning-bg text-status-warning border-status-warning/30",
  },
  draft_coach: {
    label: "Préparation coach",
    variant: "secondary",
    className: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border-blue-200 dark:border-blue-800",
  },
  sent: {
    label: "Envoyé",
    variant: "secondary",
    className: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 border-green-200 dark:border-green-800",
  },
  signed: {
    label: "Signé",
    variant: "secondary",
    className: "bg-slate-100 text-slate-600 dark:bg-slate-800/40 dark:text-slate-300 border-slate-200 dark:border-slate-700",
  },
};

function getStatusBadge(status: InterviewStatus) {
  const config = STATUS_CONFIG[status];
  return (
    <Badge variant={config.variant} className={`text-[10px] px-1.5 py-0 ${config.className}`}>
      {config.label}
    </Badge>
  );
}

async function fetchAuthUidForUser(userId: number): Promise<string | null> {
  const { data, error } = await supabase.rpc("get_auth_uid_for_user", {
    p_user_id: userId,
  });
  if (error) {
    console.error("[interviews-tab] Failed to resolve auth UUID:", error.message);
    return null;
  }
  return data as string | null;
}

// ── Section Cards ───────────────────────────────────────────────

const AthleteSection = ({ label, text }: { label: string; text?: string | null }) => (
  <div className="border-l-4 border-blue-400 rounded-r-lg bg-blue-50/50 dark:bg-blue-950/20 p-3 space-y-1">
    <div className="flex items-center gap-1.5">
      <User className="h-3.5 w-3.5 text-blue-500" />
      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
    </div>
    <p className="text-sm whitespace-pre-wrap">
      {text?.trim() || <span className="italic text-muted-foreground">Non renseigné</span>}
    </p>
  </div>
);

const CoachSectionReadOnly = ({ label, text }: { label: string; text?: string | null }) => (
  <div className="border-l-4 border-amber-400 rounded-r-lg bg-amber-50/50 dark:bg-amber-950/20 p-3 space-y-1">
    <div className="flex items-center gap-1.5">
      <GraduationCap className="h-3.5 w-3.5 text-amber-500" />
      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
    </div>
    <p className="text-sm whitespace-pre-wrap">
      {text?.trim() || <span className="italic text-muted-foreground">Non renseigné</span>}
    </p>
  </div>
);

const CoachSectionEditable = ({
  label,
  value,
  onChange,
  onBlur,
  placeholder,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  rows?: number;
}) => (
  <div className="border-l-4 border-amber-400 rounded-r-lg bg-amber-50/50 dark:bg-amber-950/20 p-3 space-y-1.5">
    <div className="flex items-center gap-1.5">
      <GraduationCap className="h-3.5 w-3.5 text-amber-500" />
      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
    </div>
    <Textarea
      className="bg-white dark:bg-background"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      rows={rows}
      maxLength={5000}
    />
  </div>
);

const SectionDivider = ({ label }: { label: string }) => (
  <div className="flex items-center gap-2 pt-3">
    <div className="h-px flex-1 bg-border" />
    <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</span>
    <div className="h-px flex-1 bg-border" />
  </div>
);

// ── Objective Row (with best perf + delta) ──────────────────────

// ObjectiveRow replaced by shared ObjectiveCard

const CollapsiblePreviousCommitments = ({
  prevInterview,
  commitmentReview,
}: {
  prevInterview: Interview;
  commitmentReview?: string | null;
}) => {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="w-full flex items-center gap-2 rounded-xl border bg-muted/30 px-3 py-2.5 text-left transition-colors hover:bg-muted/50"
        >
          <ChevronRight
            className={`h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
          />
          <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Rappel engagements précédents
          </span>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-auto">
            {formatDate(prevInterview.date)}
          </Badge>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="rounded-b-xl border border-t-0 bg-muted/30 px-3 pb-3 space-y-2">
          {prevInterview.athlete_commitments && (
            <div className="border-l-4 border-blue-400 rounded-r-lg bg-blue-50/50 dark:bg-blue-950/20 p-2">
              <p className="text-[10px] font-semibold text-muted-foreground">Engagements nageur</p>
              <p className="text-xs whitespace-pre-wrap">{prevInterview.athlete_commitments}</p>
            </div>
          )}
          {prevInterview.coach_actions && (
            <div className="border-l-4 border-amber-400 rounded-r-lg bg-amber-50/50 dark:bg-amber-950/20 p-2">
              <p className="text-[10px] font-semibold text-muted-foreground">Actions coach</p>
              <p className="text-xs whitespace-pre-wrap">{prevInterview.coach_actions}</p>
            </div>
          )}
          {commitmentReview && (
            <div className="border-l-4 border-blue-400 rounded-r-lg bg-blue-50/80 dark:bg-blue-950/30 p-2">
              <p className="text-[10px] font-semibold text-muted-foreground">Bilan du nageur</p>
              <p className="text-xs whitespace-pre-wrap">{commitmentReview}</p>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

// ── Inline Planning Section ─────────────────────────────────────

const InlinePlanning = ({
  athleteId,
  interviewDate,
}: {
  athleteId: number;
  interviewDate: string;
}) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: competitions = [] } = useQuery({
    queryKey: ["competitions"],
    queryFn: () => getCompetitions(),
  });

  const { data: assignedIds = [] } = useQuery({
    queryKey: ["my-competition-ids", athleteId],
    queryFn: () => getMyCompetitionIds(athleteId),
  });

  const assignedCompetitions = useMemo(() => {
    const assignedSet = new Set(assignedIds);
    return competitions
      .filter((competition) => assignedSet.has(competition.id))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [competitions, assignedIds]);

  const upcomingCompetitions = useMemo(
    () => assignedCompetitions.filter((competition) => competition.date >= interviewDate),
    [assignedCompetitions, interviewDate],
  );

  const { data: cycles = [] } = useQuery({
    queryKey: ["training-cycles", "athlete", athleteId],
    queryFn: () => getTrainingCycles({ athleteId }),
  });

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
  }, [upcomingCompetitions, cyclesByCompetitionId]);

  const weekQueries = useQueries({
    queries: plannedCycles.map((cycle) => ({
      queryKey: ["training-weeks", cycle.id],
      queryFn: () => getTrainingWeeks(cycle.id),
      enabled: !!cycle.id,
    })),
  });

  const [editingWeekKey, setEditingWeekKey] = useState<string | null>(null);
  const [editWeekType, setEditWeekType] = useState("");

  const weeksByCycleId = useMemo(() => {
    const map = new Map<string, TrainingWeek[]>();
    plannedCycles.forEach((cycle, index) => {
      map.set(cycle.id, (weekQueries[index]?.data as TrainingWeek[] | undefined) ?? []);
    });
    return map;
  }, [plannedCycles, weekQueries]);

  const existingWeekTypes = useMemo(() => {
    const types = new Set<string>();
    weeksByCycleId.forEach((weeks) => {
      weeks.forEach((week) => {
        if (week.week_type) types.add(week.week_type);
      });
    });
    return Array.from(types).sort();
  }, [weeksByCycleId]);

  const nextCompetition = upcomingCompetitions[0] ?? null;
  const todayIso = useMemo(() => new Date().toISOString().split("T")[0], []);
  const daysToComp = nextCompetition ? daysBetween(todayIso, nextCompetition.date) : null;

  const createCycleMutation = useMutation({
    mutationFn: async (competitionId: string) => {
      const endCompetition = assignedCompetitions.find((competition) => competition.id === competitionId);
      if (!endCompetition) throw new Error("Pas de compétition");
      const endIndex = assignedCompetitions.findIndex((competition) => competition.id === competitionId);
      const startCompetition = endIndex > 0 ? assignedCompetitions[endIndex - 1] : null;
      const startAnchor = startCompetition?.date ?? interviewDate;

      const cycle = await createTrainingCycle({
        athlete_id: athleteId,
        group_id: null,
        start_competition_id: startCompetition?.id ?? null,
        start_date: startCompetition ? null : interviewDate,
        end_competition_id: endCompetition.id,
        name: `Préparation ${endCompetition.name}`,
      });

      const mondays = getMondays(startAnchor, endCompetition.date);
      if (mondays.length > 0) {
        await bulkUpsertTrainingWeeks(
          mondays.map((monday) => ({ cycle_id: cycle.id, week_start: monday })),
        );
      }
      return cycle;
    },
    onSuccess: () => {
      toast({ title: "Planification créée" });
      void queryClient.invalidateQueries({ queryKey: ["training-cycles"] });
      void queryClient.invalidateQueries({ queryKey: ["training-weeks"] });
    },
    onError: (err: Error) => {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    },
  });

  const upsertWeekMutation = useMutation({
    mutationFn: (input: TrainingWeekInput) => upsertTrainingWeek(input),
    onSuccess: () => {
      setEditingWeekKey(null);
      void queryClient.invalidateQueries({ queryKey: ["training-weeks"] });
      toast({ title: "Semaine planifiée" });
    },
    onError: (err: Error) => {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    },
  });

  if (!nextCompetition) {
    return (
      <div className="text-center py-4">
        <p className="text-xs text-muted-foreground italic">
          Aucune compétition assignée à venir — planification non disponible.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border bg-muted/20 p-3">
        <div className="flex items-center gap-2 text-sm flex-wrap">
          <Trophy className="h-4 w-4 text-amber-500 shrink-0" />
          <span className="font-medium">{upcomingCompetitions.length} échéance{upcomingCompetitions.length > 1 ? "s" : ""} à planifier</span>
          {daysToComp != null && (
            <Badge variant="secondary" className="text-[10px]">
              prochaine J-{daysToComp}
            </Badge>
          )}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Une carte par compétition cible pour construire et piloter plusieurs macrocycles à l&apos;avance.
        </p>
      </div>

      <div className="space-y-3">
        {upcomingCompetitions.map((competition, compIndex) => {
          const cycle = cyclesByCompetitionId.get(competition.id) ?? null;
          const cycleWeeks = cycle ? (weeksByCycleId.get(cycle.id) ?? []) : [];
          const weeksByStart = new Map(cycleWeeks.map((week) => [week.week_start, week]));
          const cycleStart = cycle?.start_date ?? cycle?.start_competition_date ?? interviewDate;
          const visibleStart = cycleStart > interviewDate ? cycleStart : interviewDate;
          const visibleMondays = cycle ? getMondays(visibleStart, competition.date) : [];
          const totalMondays = cycle ? getMondays(cycleStart, competition.date) : [];
          const hiddenWeeks = Math.max(totalMondays.length - visibleMondays.length, 0);
          const daysUntil = daysBetween(todayIso, competition.date);

          return (
            <div key={competition.id} className="rounded-xl border bg-card shadow-sm overflow-hidden">
              <div className="border-b border-border bg-muted/20 px-3 py-2.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold">{competition.name}</span>
                  {compIndex === 0 && (
                    <Badge className="text-[10px] bg-primary/10 text-primary border-primary/20">
                      Priorité
                    </Badge>
                  )}
                  <Badge variant="secondary" className="text-[10px]">
                    {formatDate(competition.date)}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    J-{daysUntil}
                  </Badge>
                </div>
                {cycle ? (
                  <div className="mt-1 flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{cycle.name}</span>
                    {cycle.start_competition_name && <span>depuis {cycle.start_competition_name}</span>}
                    <span>{totalMondays.length} sem.</span>
                    {hiddenWeeks > 0 && <span>{hiddenWeeks} déjà passées</span>}
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Aucun macrocycle créé pour cette échéance.
                  </p>
                )}
              </div>

              {!cycle ? (
                <div className="px-3 py-3 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Créez un macrocycle dédié pour donner de la visibilité long terme sur cette cible.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs"
                    onClick={() => createCycleMutation.mutate(competition.id)}
                    disabled={createCycleMutation.isPending}
                  >
                    {createCycleMutation.isPending ? "Création..." : "Créer ce macrocycle"}
                  </Button>
                </div>
              ) : visibleMondays.length === 0 ? (
                <div className="px-3 py-3 text-xs text-muted-foreground italic">
                  Aucune semaine future à afficher sur ce macrocycle.
                </div>
              ) : (
                <div className="px-3 py-3">
                  <div className="relative ml-2 border-l-2 border-border pl-3 space-y-1.5">
                    {visibleMondays.map((monday, idx) => {
                      const week = weeksByStart.get(monday);
                      const isCurrent = isCurrentWeek(monday);
                      const sunday = getSunday(monday);
                      const editKey = `${cycle.id}:${monday}`;
                      const isEditing = editingWeekKey === editKey;
                      const datalistId = `inline-week-${cycle.id}-${monday}`;

                      if (isEditing) {
                        return (
                          <div
                            key={monday}
                            className={`rounded-lg border bg-card p-2 space-y-1.5 ${isCurrent ? "ring-2 ring-primary" : ""}`}
                          >
                            <div className="text-xs text-muted-foreground">
                              Sem. {hiddenWeeks + idx + 1} ({fmtShort(monday)} - {fmtShort(sunday)})
                            </div>
                            <Input
                              className="h-7 text-sm"
                              placeholder="Foncier, Techni., Affûtage..."
                              list={datalistId}
                              value={editWeekType}
                              onChange={(e) => setEditWeekType(e.target.value)}
                            />
                            <datalist id={datalistId}>
                              {existingWeekTypes.map((t) => <option key={t} value={t} />)}
                            </datalist>
                            <div className="flex gap-2 justify-end">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-xs px-2"
                                onClick={() => setEditingWeekKey(null)}
                              >
                                Annuler
                              </Button>
                              <Button
                                size="sm"
                                className="h-6 text-xs px-2"
                                onClick={() => {
                                  upsertWeekMutation.mutate({
                                    cycle_id: cycle.id,
                                    week_start: monday,
                                    week_type: editWeekType.trim() || null,
                                    notes: week?.notes ?? null,
                                  });
                                }}
                                disabled={upsertWeekMutation.isPending}
                              >
                                OK
                              </Button>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <button
                          key={monday}
                          type="button"
                          className={`w-full text-left rounded-lg border bg-card px-2.5 py-2 text-xs transition-colors hover:bg-muted/50 ${
                            isCurrent ? "ring-2 ring-primary bg-primary/5" : ""
                          }`}
                          onClick={() => {
                            setEditingWeekKey(editKey);
                            setEditWeekType(week?.week_type ?? "");
                          }}
                        >
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`h-2 w-2 rounded-full shrink-0 ${
                                isCurrent ? "bg-primary" : week?.week_type ? "bg-muted-foreground/40" : "bg-muted-foreground/20"
                              }`}
                            />
                            <span className="text-muted-foreground whitespace-nowrap">
                              Sem. {hiddenWeeks + idx + 1}
                            </span>
                            <span className="text-muted-foreground/70 whitespace-nowrap">
                              {fmtShort(monday)} - {fmtShort(sunday)}
                            </span>
                            {week?.week_type && (
                              <Badge
                                className="text-[10px] px-1.5 py-0 border-0 ml-auto"
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
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ── Coach Interview Card ────────────────────────────────────────

const CoachInterviewCard = ({
  interview,
  athleteId,
  athleteName,
  athletePhone,
  objectives,
  performances,
}: {
  interview: Interview;
  athleteId: number;
  athleteName: string;
  athletePhone: string | null;
  objectives: Objective[];
  performances: SwimmerPerformance[];
}) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);

  // Coach form state — per-section comments
  const [coachCommentSuccesses, setCoachCommentSuccesses] = useState(interview.coach_comment_successes ?? "");
  const [coachCommentDifficulties, setCoachCommentDifficulties] = useState(interview.coach_comment_difficulties ?? "");
  const [coachCommentGoals, setCoachCommentGoals] = useState(interview.coach_comment_goals ?? "");
  // Legacy fields (kept for backward compat with old interviews)
  const coachReview = interview.coach_review ?? "";
  const coachObjectives = interview.coach_objectives ?? "";
  const [coachActions, setCoachActions] = useState(interview.coach_actions ?? "");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showSendConfirm, setShowSendConfirm] = useState(false);
  const [showSmsPrompt, setShowSmsPrompt] = useState(false);
  const savingRef = useRef(false);

  // Previous interview
  const { data: prevInterview } = useQuery({
    queryKey: ["previous-interview", athleteId, interview.date, interview.id],
    queryFn: () => getPreviousInterview(athleteId, interview.date, interview.id),
    enabled: !!interview.date,
  });

  // ── Mutations ──
  const buildCoachInput = useCallback((): InterviewCoachInput => ({
    coach_comment_successes: coachCommentSuccesses.trim() || null,
    coach_comment_difficulties: coachCommentDifficulties.trim() || null,
    coach_comment_goals: coachCommentGoals.trim() || null,
    coach_review: coachReview.trim() || null,
    coach_objectives: coachObjectives.trim() || null,
    coach_actions: coachActions.trim() || null,
  }), [
    coachActions,
    coachCommentDifficulties,
    coachCommentGoals,
    coachCommentSuccesses,
    coachObjectives,
    coachReview,
  ]);

  const hasDraftChanges = useCallback(() => {
    const next = buildCoachInput();
    return (
      (interview.coach_comment_successes ?? null) !== next.coach_comment_successes ||
      (interview.coach_comment_difficulties ?? null) !== next.coach_comment_difficulties ||
      (interview.coach_comment_goals ?? null) !== next.coach_comment_goals ||
      (interview.coach_review ?? null) !== next.coach_review ||
      (interview.coach_objectives ?? null) !== next.coach_objectives ||
      (interview.coach_actions ?? null) !== next.coach_actions
    );
  }, [buildCoachInput, interview]);

  const saveMutation = useMutation({
    mutationFn: (input: InterviewCoachInput) => updateInterviewCoachSections(interview.id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["interviews", athleteId] });
      toast({ title: "Sections coach enregistrées" });
    },
    onError: (err: Error) => {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    },
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      await updateInterviewCoachSections(interview.id, buildCoachInput());
      return sendInterviewToAthlete(interview.id);
    },
    onSuccess: () => {
      toast({ title: "Entretien envoyé au nageur" });
      void queryClient.invalidateQueries({ queryKey: ["interviews", athleteId] });
      setShowSmsPrompt(true);
    },
    onError: (err: Error) => {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    },
  });

  const handleSendSms = () => {
    if (!athletePhone) return;
    const firstName = athleteName.split(" ")[0];
    const body = `Bonjour ${firstName}, ton entretien est disponible. Consulte-le ici : https://erstein-aquatic-club.github.io/competition/#/profile`;
    const uri = buildSmsUri([athletePhone], body);

    if (canOpenSmsApp()) {
      window.location.href = uri;
    } else {
      navigator.clipboard.writeText(`${athletePhone}\n${body}`).then(() => {
        toast({ title: "Copié", description: "Numéro et message copiés dans le presse-papiers." });
      }).catch(() => {
        toast({ title: "Erreur", description: "Impossible de copier.", variant: "destructive" });
      });
    }
    setShowSmsPrompt(false);
  };

  const deleteMutation = useMutation({
    mutationFn: () => deleteInterview(interview.id),
    onSuccess: () => {
      toast({ title: "Entretien supprimé" });
      void queryClient.invalidateQueries({ queryKey: ["interviews", athleteId] });
    },
    onError: (err: Error) => {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    },
  });

  const isPending = saveMutation.isPending || sendMutation.isPending || deleteMutation.isPending;
  const status = interview.status;
  const borderClass = status === "draft_athlete"
    ? "border-status-warning border-l-4"
    : status === "draft_coach"
      ? "border-blue-300 dark:border-blue-700 border-l-4"
      : status === "sent"
        ? "border-status-success border-l-4"
        : "";

  const handleAutoSave = useCallback(() => {
    if (status !== "draft_coach" || savingRef.current || isPending || !hasDraftChanges()) return;
    savingRef.current = true;
    saveMutation.mutate(buildCoachInput());
    window.setTimeout(() => {
      savingRef.current = false;
    }, 500);
  }, [buildCoachInput, hasDraftChanges, isPending, saveMutation, status]);

  return (
    <>
      <div className={`rounded-xl border bg-card shadow-sm ${borderClass}`}>
        <button
          type="button"
          className="w-full flex items-center justify-between p-4 text-left"
          onClick={() => setExpanded((v) => !v)}
        >
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-semibold">{formatDate(interview.date)}</span>
            {getStatusBadge(status)}
            {status === "signed" && interview.signed_at && (
              <span className="text-xs text-muted-foreground">
                le {formatDate(interview.signed_at.slice(0, 10))}
              </span>
            )}
          </div>
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
        </button>

        <div className="px-4 pb-2">
          <InterviewStatusBar status={status} />
        </div>

        {expanded && (
          <div className="px-4 pb-4 space-y-5">
            {status === "draft_athlete" && (
              <div className="rounded-xl border border-dashed border-status-warning/50 bg-status-warning-bg p-6 text-center space-y-2">
                <Clock className="h-8 w-8 mx-auto text-status-warning" />
                <p className="text-sm font-medium">En attente de la préparation du nageur</p>
                <p className="text-xs text-muted-foreground">
                  Le contenu n&apos;est pas encore visible. Le nageur doit d&apos;abord remplir ses sections.
                </p>
              </div>
            )}

            {status === "draft_coach" && (
              <>
                {prevInterview && (
                  <CollapsiblePreviousCommitments
                    prevInterview={prevInterview}
                    commitmentReview={interview.athlete_commitment_review}
                  />
                )}

                <SectionDivider label="Réussites" />
                <AthleteSection label="Nageur" text={interview.athlete_successes} />
                <CoachSectionEditable
                  label="Coach"
                  value={coachCommentSuccesses}
                  onChange={setCoachCommentSuccesses}
                  onBlur={handleAutoSave}
                  placeholder="Votre commentaire sur les réussites..."
                />

                <SectionDivider label="Difficultés" />
                <AthleteSection label="Nageur" text={interview.athlete_difficulties} />
                <CoachSectionEditable
                  label="Coach"
                  value={coachCommentDifficulties}
                  onChange={setCoachCommentDifficulties}
                  onBlur={handleAutoSave}
                  placeholder="Votre commentaire sur les difficultés..."
                />

                <SectionDivider label="Objectifs" />
                {objectives.length > 0 && (
                  <div className="space-y-1.5">
                    {objectives.map((obj) => (
                      <ObjectiveCard key={obj.id} objective={obj} performances={performances} compact />
                    ))}
                  </div>
                )}
                <AthleteSection label="Nageur" text={interview.athlete_goals} />
                <CoachSectionEditable
                  label="Coach"
                  value={coachCommentGoals}
                  onChange={setCoachCommentGoals}
                  onBlur={handleAutoSave}
                  placeholder="Objectifs complémentaires, commentaires..."
                />

                <SectionDivider label="Planification" />
                <InlinePlanning athleteId={athleteId} interviewDate={interview.date} />

                <SectionDivider label="Engagements & Actions" />
                <div className="rounded-xl bg-card border shadow-sm p-4 space-y-3">
                  <AthleteSection label="Engagements du nageur" text={interview.athlete_commitments} />
                  <CoachSectionEditable
                    label="Actions du coach"
                    value={coachActions}
                    onChange={setCoachActions}
                    onBlur={handleAutoSave}
                    placeholder="Actions concrètes, points de suivi..."
                  />
                </div>

                <div className="text-xs text-muted-foreground">
                  {saveMutation.isPending ? "Sauvegarde..." : "Sauvegarde automatique a la sortie d'un champ."}
                </div>
              </>
            )}

            {(status === "sent" || status === "signed") && (
              <>
                {prevInterview && (
                  <CollapsiblePreviousCommitments
                    prevInterview={prevInterview}
                    commitmentReview={interview.athlete_commitment_review}
                  />
                )}

                <SectionDivider label="Réussites" />
                <AthleteSection label="Nageur" text={interview.athlete_successes} />
                <CoachSectionReadOnly label="Coach" text={interview.coach_comment_successes || interview.coach_review} />

                <SectionDivider label="Difficultés" />
                <AthleteSection label="Nageur" text={interview.athlete_difficulties} />
                <CoachSectionReadOnly label="Coach" text={interview.coach_comment_difficulties} />

                <SectionDivider label="Objectifs" />
                {objectives.length > 0 && (
                  <div className="space-y-1.5">
                    {objectives.map((obj) => (
                      <ObjectiveCard key={obj.id} objective={obj} performances={performances} compact />
                    ))}
                  </div>
                )}
                <AthleteSection label="Nageur" text={interview.athlete_goals} />
                <CoachSectionReadOnly label="Coach" text={interview.coach_comment_goals || interview.coach_objectives} />

                <SectionDivider label="Planification" />
                <InlinePlanning athleteId={athleteId} interviewDate={interview.date} />

                <SectionDivider label="Engagements & Actions" />
                <div className="rounded-xl bg-card border shadow-sm p-4 space-y-3">
                  <AthleteSection label="Engagements du nageur" text={interview.athlete_commitments} />
                  <CoachSectionReadOnly label="Actions du coach" text={interview.coach_actions} />
                </div>
              </>
            )}

            <div className="space-y-2 pt-2 border-t">
              {status === "draft_coach" && (
                <Button
                  className="w-full"
                  onClick={() => setShowSendConfirm(true)}
                  disabled={isPending}
                >
                  <Send className="mr-1.5 h-3.5 w-3.5" />
                  Envoyer au nageur
                </Button>
              )}
              <Button
                variant="outline"
                className="w-full text-destructive hover:text-destructive"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={isPending}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Supprimer
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer l'entretien</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. L'entretien du {interview.date ? formatDate(interview.date) : ""} sera supprimé définitivement.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                deleteMutation.mutate();
                setShowDeleteConfirm(false);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Send confirmation */}
      <AlertDialog open={showSendConfirm} onOpenChange={setShowSendConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Envoyer au nageur</AlertDialogTitle>
            <AlertDialogDescription>
              L'entretien sera envoyé au nageur pour consultation. Les sections coach seront enregistrées automatiquement.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                sendMutation.mutate();
                setShowSendConfirm(false);
              }}
            >
              <Send className="mr-1.5 h-3.5 w-3.5" />
              Envoyer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* SMS prompt after sending */}
      <AlertDialog open={showSmsPrompt} onOpenChange={setShowSmsPrompt}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Entretien envoyé</AlertDialogTitle>
            <AlertDialogDescription>
              {athletePhone ? (
                <>L'entretien a bien été envoyé à <strong>{athleteName}</strong>. Voulez-vous le notifier par SMS ?</>
              ) : (
                <>L'entretien a bien été envoyé à <strong>{athleteName}</strong>. Aucun numéro de téléphone enregistré pour ce nageur.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Plus tard</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSendSms}
              disabled={!athletePhone}
            >
              <Smartphone className="mr-1.5 h-3.5 w-3.5" />
              Envoyer le SMS
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

// ── Interview Status Timeline ───────────────────────────────────

const INTERVIEW_PHASES: { key: InterviewStatus; label: string; icon: typeof Clock }[] = [
  { key: "draft_athlete", label: "Nageur", icon: User },
  { key: "draft_coach", label: "Coach", icon: GraduationCap },
  { key: "sent", label: "Envoyé", icon: Send },
  { key: "signed", label: "Signé", icon: Trophy },
];

function InterviewStatusBar({ status }: { status: InterviewStatus }) {
  const currentIndex = INTERVIEW_PHASES.findIndex((p) => p.key === status);
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {INTERVIEW_PHASES.map((phase, i) => {
        const Icon = phase.icon;
        const isDone = i < currentIndex;
        const isCurrent = i === currentIndex;
        const isTerminal = isCurrent && i === INTERVIEW_PHASES.length - 1;
        return (
          <div key={phase.key} className="flex items-center gap-1">
            {i > 0 && (
              <div className={`h-0.5 w-3 rounded ${isDone || isTerminal ? "bg-status-success" : "bg-muted"}`} />
            )}
            <div className={`flex h-6 items-center gap-1 rounded-full px-2 text-[10px] font-medium ${
              isTerminal || isDone
                ? "bg-status-success-bg text-status-success"
                : isCurrent
                  ? "bg-primary/10 text-primary"
                  : "bg-muted text-muted-foreground"
            }`}>
              <Icon className="h-3 w-3" />
              {phase.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────

const SwimmerInterviewsTab = ({ athleteId, athleteName }: Props) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Resolve auth UUID (for objective context)
  const { data: athleteAuthId } = useQuery({
    queryKey: ["auth-uid", athleteId],
    queryFn: () => fetchAuthUidForUser(athleteId),
    enabled: !!athleteId,
  });

  const { data: objectives = [] } = useQuery({
    queryKey: ["objectives", athleteAuthId],
    queryFn: () => getObjectives(athleteAuthId!),
    enabled: !!athleteAuthId,
  });

  const { data: athleteProfile } = useQuery({
    queryKey: ["athlete-profile", athleteId],
    queryFn: () => getProfile({ userId: athleteId }),
    enabled: !!athleteId,
  });
  const athleteIuf = athleteProfile?.ffn_iuf ?? null;
  const athletePhone = athleteProfile?.phone ?? null;

  const perfFromDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 360);
    return d.toISOString().slice(0, 10);
  }, []);

  const { data: performances = [] } = useQuery({
    queryKey: ["swimmer-performances-recent", athleteIuf],
    queryFn: () => getSwimmerPerformances({ iuf: athleteIuf!, fromDate: perfFromDate }),
    enabled: !!athleteIuf,
  });

  // Interviews
  const { data: interviews = [], isLoading } = useQuery({
    queryKey: ["interviews", athleteId],
    queryFn: () => getInterviews(athleteId),
    enabled: !!athleteId,
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: () =>
      createInterview({ athlete_id: athleteId }),
    onSuccess: () => {
      toast({ title: "Entretien créé" });
      void queryClient.invalidateQueries({ queryKey: ["interviews", athleteId] });
    },
    onError: (err: Error) => {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    },
  });

  // Loading
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-xl border p-3 animate-pulse motion-reduce:animate-none"
          >
            <div className="flex items-center gap-3">
              <div className="h-4 w-24 rounded bg-muted" />
              <div className="ml-auto h-5 w-20 rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Empty state
  if (interviews.length === 0) {
    return (
      <div className="text-center py-12 space-y-3">
        <MessageSquare className="h-10 w-10 text-muted-foreground mx-auto" />
        <p className="text-sm text-muted-foreground">
          Aucun entretien pour {athleteName}.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          {createMutation.isPending ? "Création..." : "Nouvel entretien"}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Entretiens</h3>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            {interviews.length}
          </Badge>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          {createMutation.isPending ? "Création..." : "Nouvel entretien"}
        </Button>
      </div>

      {/* List */}
      <div className="space-y-2">
        {interviews.map((interview) => (
          <CoachInterviewCard
            key={interview.id}
            interview={interview}
            athleteId={athleteId}
            athleteName={athleteName}
            athletePhone={athletePhone}
            objectives={objectives}
            performances={performances}
          />
        ))}
      </div>
    </div>
  );
};

export default SwimmerInterviewsTab;
