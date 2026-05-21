/**
 * StrengthPlanningScreen.tsx — Read-only preview of an athlete's (or group's)
 * weekly strength plan, derived from `training_plan_applications` (§276.3).
 *
 * §276 simplification : ce composant n'édite plus de slots. Il sert
 * uniquement à montrer au coach comment le plan d'entraînement appliqué
 * s'affichera côté nageur. L'édition d'un plan se fait dans biblio > Plans
 * (TrainingPlansBrowser), et l'application via le dialog "Appliquer".
 *
 * Mode groupe (pas de nageur sélectionné) : affiche le plan appliqué au
 * groupe via `training_plan_applications.target_group_id`.
 * Mode nageur : applications direct + via groupes (helper
 * `getTrainingPlanApplicationsForUser`).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getGroups,
  getStrengthSessions,
  getCompetitions,
  getMyCompetitionIds,
  getAthletes,
  getTrainingPlanApplicationsForUser,
  getTrainingPlanApplicationsForGroup,
  getTrainingPlanSessionsForPlans,
} from "@/lib/api";
import type {
  StrengthSessionTemplate,
  Competition,
  AthleteSummary,
  GroupSummary,
} from "@/lib/api/types";
import {
  derivePlanByWeekDay,
  type DerivedCell,
} from "@/lib/strength/derivePlanByWeekDay";
import StrengthPlanningTimeline from "@/components/coach/strength/StrengthPlanningTimeline";
import {
  generateWeeks,
  getMonday,
} from "@/components/coach/swim/swimPlanningShared";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { toISODate } from "@/lib/date";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  ArrowLeft,
  Dumbbell,
  Eye,
  Trophy,
  Users,
} from "lucide-react";

const INITIAL_WEEK_COUNT = 13;
const LOAD_MORE_COUNT = 4;

export default function StrengthPlanningScreen() {
  // ── Groups & selection ──
  const { data: groups = [], isLoading: groupsLoading } = useQuery({
    queryKey: ["groups"],
    queryFn: () => getGroups(),
  });
  const permanentGroups = useMemo(
    () => groups.filter((g) => !g.is_temporary),
    [groups],
  );

  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  useEffect(() => {
    if (permanentGroups.length > 0 && selectedGroupId === null) {
      setSelectedGroupId(permanentGroups[0].id);
    }
  }, [permanentGroups, selectedGroupId]);

  // ── Athlete selection (URL hash sync) ──
  const [selectedAthleteId, setSelectedAthleteId] = useState<number | null>(
    () => {
      const params = new URLSearchParams(
        window.location.hash.split("?")[1] ?? "",
      );
      const raw = params.get("athlete");
      const n = raw ? Number(raw) : NaN;
      return Number.isFinite(n) && n > 0 ? n : null;
    },
  );

  useEffect(() => {
    const [path, qs] = window.location.hash.split("?");
    const params = new URLSearchParams(qs ?? "");
    if (selectedAthleteId) {
      params.set("athlete", String(selectedAthleteId));
    } else {
      params.delete("athlete");
    }
    const next = params.toString();
    const nextHash = next ? `${path}?${next}` : path;
    if (nextHash !== window.location.hash) {
      window.history.replaceState(null, "", nextHash);
    }
  }, [selectedAthleteId]);

  // ── Athletes (filtered to selected group + coach self-injection) ──
  const { data: allAthletes = [] } = useQuery({
    queryKey: ["athletes"],
    queryFn: () => getAthletes(),
    staleTime: 5 * 60_000,
  });
  const coachUserId = useAuth((s) => s.userId);
  const coachUserName = useAuth((s) => s.user);
  const coachRole = useAuth((s) => s.role);
  const coachSelfAthlete = useMemo<AthleteSummary | null>(() => {
    if (coachRole !== "coach" && coachRole !== "admin") return null;
    if (coachUserId == null || !coachUserName) return null;
    return {
      id: coachUserId,
      display_name: `${coachUserName} (moi)`,
      email: null,
      group_id: null,
      group_label: null,
      ffn_iuf: null,
      avatar_url: null,
    };
  }, [coachRole, coachUserId, coachUserName]);

  const groupAthletes = useMemo(() => {
    const filtered = allAthletes.filter(
      (a) => a.id != null && a.group_id === selectedGroupId,
    );
    if (!coachSelfAthlete) return filtered;
    if (filtered.some((a) => a.id === coachSelfAthlete.id)) return filtered;
    return [coachSelfAthlete, ...filtered];
  }, [allAthletes, selectedGroupId, coachSelfAthlete]);

  const selectedAthlete = useMemo(
    () => groupAthletes.find((a) => a.id === selectedAthleteId) ?? null,
    [groupAthletes, selectedAthleteId],
  );

  useEffect(() => {
    if (selectedAthleteId == null) return;
    if (allAthletes.length === 0) return;
    const stillInGroup = groupAthletes.some(
      (a) => a.id === selectedAthleteId,
    );
    if (!stillInGroup) setSelectedAthleteId(null);
  }, [allAthletes, groupAthletes, selectedAthleteId, selectedGroupId]);

  // ── Week generation (infinite scroll) ──
  const startMonday = useMemo(() => getMonday(new Date()), []);
  const [weekCount, setWeekCount] = useState(INITIAL_WEEK_COUNT);
  const weeks = useMemo(
    () => generateWeeks(startMonday, weekCount),
    [startMonday, weekCount],
  );
  const visibleWeekKeys = useMemo(() => weeks.map((w) => w.weekKey), [weeks]);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadingMoreRef = useRef(false);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loadingMoreRef.current) {
          loadingMoreRef.current = true;
          setWeekCount((c) => c + LOAD_MORE_COUNT);
          setTimeout(() => {
            loadingMoreRef.current = false;
          }, 300);
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // ── Session templates catalog ──
  const { data: sessionTemplates = [] } = useQuery({
    queryKey: ["strength-sessions"],
    queryFn: () => getStrengthSessions(),
    staleTime: 5 * 60_000,
  });
  const sessionTemplatesById = useMemo(() => {
    const map = new Map<number, StrengthSessionTemplate>();
    for (const t of sessionTemplates) map.set(t.id, t);
    return map;
  }, [sessionTemplates]);

  // ── Training plan applications : athlete mode OR group mode ──
  const { data: athleteApplications = [] } = useQuery({
    queryKey: ["training_plan_applications", "for-user", selectedAthleteId],
    queryFn: () =>
      getTrainingPlanApplicationsForUser({
        userId: selectedAthleteId!,
        discipline: "strength",
      }),
    enabled: selectedAthleteId != null,
  });

  const { data: groupApplications = [] } = useQuery({
    queryKey: ["training_plan_applications", "for-group", selectedGroupId],
    queryFn: () =>
      getTrainingPlanApplicationsForGroup({
        groupId: selectedGroupId!,
        discipline: "strength",
      }),
    enabled: selectedGroupId != null && selectedAthleteId == null,
  });

  const activeApplications = selectedAthleteId != null
    ? athleteApplications
    : groupApplications;

  const applicationPlanIds = useMemo(
    () => Array.from(new Set(activeApplications.map((a) => a.plan_id))),
    [activeApplications],
  );
  const { data: applicationPlanSessions = [], isLoading: planSessionsLoading } = useQuery({
    queryKey: ["training_plan_sessions", "for-plans", applicationPlanIds],
    queryFn: () => getTrainingPlanSessionsForPlans(applicationPlanIds),
    enabled: applicationPlanIds.length > 0,
  });

  // ── Derive per-week/day map of inherited sessions ──
  const derivedPlanCells: Map<string, Map<number, DerivedCell>> = useMemo(
    () =>
      derivePlanByWeekDay({
        weekKeys: visibleWeekKeys,
        applications: activeApplications,
        sessions: applicationPlanSessions,
      }),
    [visibleWeekKeys, activeApplications, applicationPlanSessions],
  );

  const athletePlanByWeekDay = useMemo(() => {
    const map = new Map<string, Map<number, StrengthSessionTemplate>>();
    for (const [weekKey, dayMap] of derivedPlanCells) {
      const dayResult = new Map<number, StrengthSessionTemplate>();
      for (const [dayIndex, cell] of dayMap) {
        const tplId = cell.session.session_template_id;
        if (tplId == null) continue;
        const tpl = sessionTemplatesById.get(tplId);
        if (tpl) dayResult.set(dayIndex, tpl);
      }
      if (dayResult.size > 0) map.set(weekKey, dayResult);
    }
    return map;
  }, [derivedPlanCells, sessionTemplatesById]);

  // ── Competitions (context) ──
  const { data: allCompetitions = [] } = useQuery({
    queryKey: ["competitions"],
    queryFn: () => getCompetitions(),
  });
  const { data: athleteCompetitionIds = [] } = useQuery({
    queryKey: ["my-competition-ids", selectedAthleteId],
    queryFn: () => getMyCompetitionIds(selectedAthleteId),
    enabled: selectedAthleteId != null,
  });
  const visibleCompetitions = useMemo(() => {
    if (selectedAthleteId == null) return allCompetitions;
    return allCompetitions.filter((c) =>
      athleteCompetitionIds.includes(c.id),
    );
  }, [allCompetitions, athleteCompetitionIds, selectedAthleteId]);

  const competitionsByWeek = useMemo(() => {
    const map = new Map<string, Competition[]>();
    for (const c of visibleCompetitions) {
      if (!c.date) continue;
      const start = new Date(c.date.slice(0, 10) + "T00:00:00");
      const end = c.end_date
        ? new Date(c.end_date.slice(0, 10) + "T00:00:00")
        : start;
      const cursor = getMonday(start);
      const endMonday = getMonday(end);
      while (cursor.getTime() <= endMonday.getTime()) {
        // §296 — toISODate (local) au lieu de toISOString().split (UTC).
        const key = toISODate(cursor);
        const arr = map.get(key) ?? [];
        arr.push(c);
        map.set(key, arr);
        cursor.setDate(cursor.getDate() + 7);
      }
    }
    return map;
  }, [visibleCompetitions]);

  const getDayCompetitions = useCallback(
    (weekMonday: Date, dayIndex: number): Competition[] => {
      const d = new Date(weekMonday);
      d.setDate(weekMonday.getDate() + dayIndex);
      d.setHours(0, 0, 0, 0);
      const t = d.getTime();
      return visibleCompetitions.filter((c) => {
        if (!c.date) return false;
        const start = new Date(c.date.slice(0, 10) + "T00:00:00").getTime();
        const end = c.end_date
          ? new Date(c.end_date.slice(0, 10) + "T00:00:00").getTime()
          : start;
        return t >= start && t <= end;
      });
    },
    [visibleCompetitions],
  );

  const [selectedCompetition, setSelectedCompetition] = useState<Competition | null>(null);
  const [expandedWeekKey, setExpandedWeekKey] = useState<string | null>(null);

  // No-op tap handler — cells with a from-plan session now show a hover/click
  // preview popover inline (SessionPreviewPopover in StrengthPlanningTimeline).
  // Cells without a session don't react (read-only mode).
  const handleSlotTap = useCallback(() => {}, []);

  // ── Loading & empty states ──
  if (groupsLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-lg border-b px-4 py-3">
          <div className="h-7 w-56 rounded-lg bg-muted animate-pulse" />
          <div className="h-9 w-40 mt-2 rounded-lg bg-muted animate-pulse" />
        </div>
        <div className="px-4 pt-4 space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="rounded-xl border p-3 animate-pulse motion-reduce:animate-none"
            >
              <div className="h-4 w-36 rounded bg-muted" />
              <div className="h-3 w-24 mt-2 rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (permanentGroups.length === 0) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Header
          groups={[]}
          selectedGroupId={null}
          onSelectGroup={() => {}}
          activeApplicationCount={0}
        />
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <div className="h-16 w-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
            <Dumbbell className="h-8 w-8 text-muted-foreground/30" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">
            Aucun groupe disponible
          </p>
          <p className="text-xs text-muted-foreground/60 mt-1.5 max-w-[260px]">
            Crée un groupe dans l'administration pour visualiser un plan
            d'entraînement muscu.
          </p>
        </div>
      </div>
    );
  }

  const isEmpty = athletePlanByWeekDay.size === 0;

  return (
    <div className="min-h-screen bg-background pb-24">
      <Header
        groups={permanentGroups}
        selectedGroupId={selectedGroupId}
        onSelectGroup={setSelectedGroupId}
        groupAthletes={groupAthletes}
        selectedAthleteId={selectedAthleteId}
        selectedAthlete={selectedAthlete}
        onSelectAthlete={setSelectedAthleteId}
        activeApplicationCount={activeApplications.length}
      />

      {isEmpty && !planSessionsLoading && (
        <div className="px-4 pt-4">
          <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 text-center">
            <Eye className="h-6 w-6 mx-auto mb-2 text-muted-foreground/40" />
            <p className="text-sm font-medium text-foreground">
              Aucun plan appliqué pour {selectedAthlete?.display_name ?? (selectedAthleteId == null ? "ce groupe" : "ce nageur")}.
            </p>
            <p className="text-xs text-muted-foreground mt-1.5 max-w-[320px] mx-auto">
              Va dans Biblio &gt; Plans pour créer un plan, puis utilise le bouton
              « Appliquer » pour l'assigner à {selectedAthleteId == null ? "un groupe" : "ce nageur"}.
            </p>
          </div>
        </div>
      )}

      <StrengthPlanningTimeline
        weeks={weeks}
        effectiveSlotsByWeek={new Map()}
        getEffectiveWeekMeta={() => ({ week_type: null, notes: null, source: "none" })}
        sessionTemplatesById={sessionTemplatesById}
        competitionsByWeek={competitionsByWeek}
        getDayCompetitions={getDayCompetitions}
        expandedWeekKey={expandedWeekKey}
        onToggleExpand={(weekKey) =>
          setExpandedWeekKey((current) => (current === weekKey ? null : weekKey))
        }
        onSlotTap={handleSlotTap}
        onWeekMetaTap={() => {}}
        onCompetitionTap={setSelectedCompetition}
        editingWeekKey={null}
        editWeekType=""
        editWeekNotes=""
        existingWeekTypes={[]}
        onSaveMeta={() => {}}
        onCancelEditMeta={() => {}}
        onEditTypeChange={() => {}}
        onEditNotesChange={() => {}}
        showOverrideBadge={false}
        athletePlanByWeekDay={athletePlanByWeekDay}
        sentinelRef={sentinelRef}
        isLoading={planSessionsLoading}
        isEmpty={isEmpty}
        readOnly
      />

      {/* Competition Detail Sheet */}
      <Sheet
        open={!!selectedCompetition}
        onOpenChange={(o) => !o && setSelectedCompetition(null)}
      >
        <SheetContent
          side="bottom"
          className="rounded-t-2xl max-h-[70dvh] overflow-y-auto"
        >
          <SheetHeader className="pb-0">
            <SheetTitle className="sr-only">
              {selectedCompetition?.name ?? "Compétition"}
            </SheetTitle>
            <SheetDescription className="sr-only">
              Détails de la compétition
            </SheetDescription>
          </SheetHeader>
          {selectedCompetition && (
            <div className="space-y-4 pb-6">
              <div className="flex items-center gap-2.5">
                <Trophy className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <h3 className="text-[15px] font-semibold text-foreground">
                  {selectedCompetition.name}
                </h3>
              </div>
              <div className="text-[13px] text-foreground/80 space-y-1">
                <div>
                  <span className="text-muted-foreground">Date : </span>
                  {new Date(
                    selectedCompetition.date.slice(0, 10) + "T00:00:00",
                  ).toLocaleDateString("fr-FR", {
                    weekday: "long",
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                  })}
                  {selectedCompetition.end_date &&
                    selectedCompetition.end_date !== selectedCompetition.date && (
                      <>
                        {" → "}
                        {new Date(
                          selectedCompetition.end_date.slice(0, 10) + "T00:00:00",
                        ).toLocaleDateString("fr-FR", {
                          weekday: "long",
                          day: "2-digit",
                          month: "long",
                          year: "numeric",
                        })}
                      </>
                    )}
                </div>
                {selectedCompetition.location && (
                  <div>
                    <span className="text-muted-foreground">Lieu : </span>
                    {selectedCompetition.location}
                  </div>
                )}
              </div>
              {selectedCompetition.description && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 mb-1">
                    Description
                  </p>
                  <p className="text-[13px] text-foreground/80 leading-relaxed whitespace-pre-line">
                    {selectedCompetition.description}
                  </p>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Header — group + athlete selection + preview badge
   ═══════════════════════════════════════════════════════════════════ */

function Header({
  groups,
  selectedGroupId,
  onSelectGroup,
  groupAthletes = [],
  selectedAthleteId = null,
  selectedAthlete = null,
  onSelectAthlete,
  activeApplicationCount,
}: {
  groups: GroupSummary[];
  selectedGroupId: number | null;
  onSelectGroup: (id: number) => void;
  groupAthletes?: AthleteSummary[];
  selectedAthleteId?: number | null;
  selectedAthlete?: AthleteSummary | null;
  onSelectAthlete?: (id: number | null) => void;
  activeApplicationCount: number;
}) {
  return (
    <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-lg border-b">
      <div className="px-4 pt-3 pb-3">
        <div className="flex items-center gap-2.5 flex-wrap">
          <Eye className="h-4 w-4 text-primary shrink-0" />
          <h1 className="text-lg font-bold tracking-tight text-foreground">
            Aperçu plan muscu
          </h1>
          {activeApplicationCount > 0 && (
            <Badge variant="secondary" className="text-[10px]">
              {activeApplicationCount} plan{activeApplicationCount > 1 ? "s" : ""}
            </Badge>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground mt-1">
          Lecture seule — pour éditer un plan, va dans Biblio &gt; Plans.
        </p>

        {selectedAthlete && onSelectAthlete && (
          <div
            className="mt-2 flex items-center gap-2.5 rounded-xl border border-amber-200/70 bg-amber-50/70 dark:bg-amber-950/25 dark:border-amber-800/50 pl-2 pr-1.5 py-1.5 relative overflow-hidden"
            role="status"
            aria-live="polite"
          >
            <span
              aria-hidden
              className="absolute left-0 top-0 bottom-0 w-[3px] bg-amber-400/80 dark:bg-amber-500/70"
            />
            <Avatar className="h-7 w-7 ring-1 ring-amber-200/80 dark:ring-amber-800/60">
              {selectedAthlete.avatar_url && (
                <AvatarImage
                  src={selectedAthlete.avatar_url}
                  alt={selectedAthlete.display_name}
                />
              )}
              <AvatarFallback className="text-[10px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-100">
                {selectedAthlete.display_name
                  .split(/\s+/)
                  .map((p) => p[0])
                  .filter(Boolean)
                  .slice(0, 2)
                  .join("")
                  .toUpperCase() || "?"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0 leading-tight">
              <span className="block text-[13px] font-semibold text-amber-900 dark:text-amber-100 truncate">
                {selectedAthlete.display_name}
              </span>
              <span className="block text-[10px] font-medium uppercase tracking-wider text-amber-700/80 dark:text-amber-300/80">
                Aperçu individuel
              </span>
            </div>
            <button
              type="button"
              onClick={() => onSelectAthlete(null)}
              className="shrink-0 inline-flex items-center gap-1.5 h-9 min-h-9 px-3 rounded-full text-xs font-semibold text-amber-800 hover:text-amber-900 dark:text-amber-200 dark:hover:text-amber-100 bg-white/80 hover:bg-white dark:bg-amber-900/40 dark:hover:bg-amber-900/60 border border-amber-300/80 dark:border-amber-800/60 shadow-sm transition-colors active:scale-[0.97]"
              aria-label="Retour à l'aperçu groupe"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Aperçu groupe
            </button>
          </div>
        )}

        {groups.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Select
              value={selectedGroupId?.toString() ?? ""}
              onValueChange={(v) => onSelectGroup(Number(v))}
            >
              <SelectTrigger className="w-auto min-w-[160px] h-9 text-sm bg-muted/40 border-muted-foreground/10">
                <SelectValue placeholder="Choisir un groupe" />
              </SelectTrigger>
              <SelectContent>
                {groups.map((g) => (
                  <SelectItem key={g.id} value={g.id.toString()}>
                    {g.name}
                    {g.member_count != null && (
                      <span className="text-muted-foreground ml-1.5">
                        ({g.member_count})
                      </span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {onSelectAthlete && (
              <>
                <span aria-hidden className="hidden sm:block h-4 w-px bg-border/70" />
                <Select
                  value={selectedAthleteId ? String(selectedAthleteId) : "__group__"}
                  onValueChange={(v) =>
                    onSelectAthlete(v === "__group__" ? null : Number(v))
                  }
                  disabled={groupAthletes.length === 0}
                >
                  <SelectTrigger
                    className={cn(
                      "w-auto min-w-[180px] h-9 text-sm border-muted-foreground/10",
                      selectedAthleteId
                        ? "bg-amber-50 text-amber-900 border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-100 dark:border-amber-800/60"
                        : "bg-muted/40 text-foreground",
                    )}
                  >
                    <SelectValue placeholder="Aperçu groupe" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[60dvh]">
                    <SelectItem value="__group__">
                      <span className="flex items-center gap-2">
                        <Users className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-medium">Aperçu groupe</span>
                      </span>
                    </SelectItem>
                    {groupAthletes.length > 0 && (
                      <div className="px-2 pt-1.5 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                        Nageurs du groupe
                      </div>
                    )}
                    {groupAthletes.map((a) =>
                      a.id == null ? null : (
                        <SelectItem key={a.id} value={String(a.id)}>
                          {a.display_name}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

