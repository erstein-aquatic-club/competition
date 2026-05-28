import { memo, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getActiveMesocycle,
  getProfile,
  getStrengthPlanningSlots,
  getStrengthPlanningSlotOverrides,
  getStrengthPlanningWeekOverrides,
  getStrengthFolders,
  getStrengthSessions,
  getTrainingPlanApplicationsForUser,
  getTrainingPlanSessionsForPlans,
} from "@/lib/api";
import type { StrengthFolder, StrengthSessionTemplate, Competition } from "@/lib/api/types";
import { FolderOpen, Trophy, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useStrengthWrapped } from "@/hooks/useStrengthWrapped";
import { StrengthWrappedRecap } from "@/components/strength/wrapped/StrengthWrappedRecap";
import { isCurrentWeek, fmtDD_MM, getMonday, getISOWeekNumber } from "@/components/coach/swim/swimPlanningShared";
import { toISODate } from "@/lib/date";
import { buildWeekInstances } from "@/lib/strength/strengthPlanWeeks";
import type { WeekInstance } from "@/lib/strength/strengthPlanWeeks";
import { MyPlanWeekCard } from "./MyPlanWeekCard";
import { useCompetitionsByWeek } from "@/hooks/useCompetitionsByWeek";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { mergeStrengthSlots } from "@/lib/strengthPlanningMerge";
import { derivePlanByWeekDay, type DerivedCell } from "@/lib/strength/derivePlanByWeekDay";
import { detectPhase } from "@/lib/strength/strengthPhaseStyles";

/** Number of future weeks to display from current week */
const PLAN_WEEK_COUNT = 12;

/** Build ISO date strings for the next N weeks from today's Monday.
 *
 * §296 — utilise `toISODate` (local YYYY-MM-DD) PAS `toISOString().split("T")[0]`
 * (qui convertit en UTC → en heure d'été Paris, "2026-05-18 00:00 +02" devient
 * "2026-05-17T22:00:00Z" → split donne "2026-05-17" qui ne match pas la DB).
 * Ce shift faisait silencieusement échouer la query `.in('week_start', ...)`
 * → athleteOverrides vide → MyPlanTab affichait Phase 3 (training_plan)
 * au lieu des slot_overrides du mésocycle. */
function buildWeekStarts(count: number): string[] {
  const monday = getMonday(new Date());
  const starts: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i * 7);
    starts.push(toISODate(d));
  }
  return starts;
}

interface MyPlanTabProps {
  athleteId: number;
  onSelectSession: (session: StrengthSessionTemplate) => void;
  /** Optional: launch the session directly into focus mode (skip reader).
   *  Used by the day-J "Démarrer maintenant" CTA and by the handoff from
   *  the Dashboard drawer (eac_pending_strength_focus_slot_id). */
  onLaunchSessionDirect?: (session: StrengthSessionTemplate) => void;
}

function MyPlanTabImpl({ athleteId, onSelectSession, onLaunchSessionDirect }: MyPlanTabProps) {
  const [expandedWeekKey, setExpandedWeekKey] = useState<string | null>(null);
  const [selectedCompetition, setSelectedCompetition] = useState<Competition | null>(null);

  // ── Récap muscu « Wrapped » (§ recap) ───────────────────────────────────────
  // Hooks appelés inconditionnellement, AVANT tout early-return (mémoire §316/§326
  // — un hook sous un return conditionnel = React #310).
  const wrapped = useStrengthWrapped(athleteId);
  const [recapOpen, setRecapOpen] = useState(false);

  // Stable week starts for the next 12 weeks
  const weekStarts = useMemo(() => buildWeekStarts(PLAN_WEEK_COUNT), []);

  // ── Profile (to get group_id) ───────────────────────────────────────────────
  const { data: profile } = useQuery({
    queryKey: ["profile", athleteId],
    queryFn: () => getProfile({ userId: athleteId }),
    staleTime: 5 * 60 * 1000,
  });
  const groupId = profile?.group_id ?? null;

  // ── Phase 3 (§275.7) : training_plan applications targeting the athlete ───
  // Highest priority source: a coach-applied training plan supplies the
  // weekly sessions via training_plan_sessions, materialized in this view.
  const { data: planApplications = [] } = useQuery({
    queryKey: ["training_plan_applications", "for-user", athleteId],
    queryFn: () =>
      getTrainingPlanApplicationsForUser({
        userId: athleteId,
        discipline: "strength",
      }),
  });

  const applicationPlanIds = useMemo(
    () => Array.from(new Set(planApplications.map((a) => a.plan_id))),
    [planApplications],
  );

  const { data: applicationPlanSessions = [] } = useQuery({
    queryKey: ["training_plan_sessions", "for-plans", applicationPlanIds],
    queryFn: () => getTrainingPlanSessionsForPlans(applicationPlanIds),
    enabled: applicationPlanIds.length > 0,
  });

  // ── Phase 2: Strength planning slots ────────────────────────────────────────
  const { data: groupSlots = [] } = useQuery({
    queryKey: ["strength_planning_slots", groupId, weekStarts],
    queryFn: () =>
      groupId
        ? getStrengthPlanningSlots({ groupId, weekStarts })
        : Promise.resolve([]),
    enabled: groupId != null,
  });

  const { data: athleteOverrides = [] } = useQuery({
    queryKey: ["strength_planning_slot_overrides", athleteId, weekStarts],
    queryFn: () =>
      getStrengthPlanningSlotOverrides({ athleteId, weekStarts }),
  });

  // §293 — week_type posé par la RPC apply_strength_mesocycle (label du cycle
  // de périodisation : "Force max", "Pic", …). Sert à colorer la timeline en
  // Phase 2 par phase d'entraînement.
  const { data: athleteWeekOverrides = [] } = useQuery({
    queryKey: ["strength_planning_week_overrides", athleteId, weekStarts],
    queryFn: () =>
      getStrengthPlanningWeekOverrides({ athleteId, weekStarts }),
  });
  const weekTypeByStart = useMemo(() => {
    const m = new Map<string, string>();
    for (const w of athleteWeekOverrides) {
      if (w.week_type) m.set(w.week_start, w.week_type);
    }
    return m;
  }, [athleteWeekOverrides]);

  // Merge: athlete overrides take precedence over group slots
  const effectiveSlots = useMemo(
    () => mergeStrengthSlots(groupSlots, athleteOverrides),
    [groupSlots, athleteOverrides],
  );

  // ── Phase 1 fallback data (cycles-based) ────────────────────────────────────
  const { data: folders = [], isLoading: foldersLoading } = useQuery({
    queryKey: ["strength_folders", "session", athleteId],
    queryFn: () => getStrengthFolders("session", { athleteId }),
  });

  const { data: allSessions = [] } = useQuery({
    queryKey: ["strength_catalog"],
    queryFn: () => getStrengthSessions(),
  });

  // ── Hierarchy for Phase 1 fallback ─────────────────────────────────────────
  const rootFolders = useMemo(() => folders.filter((f) => !f.parent_id), [folders]);

  const subFoldersMap = useMemo(() => {
    const map = new Map<number, StrengthFolder[]>();
    for (const f of folders) {
      if (f.parent_id) {
        const arr = map.get(f.parent_id) ?? [];
        arr.push(f);
        map.set(f.parent_id, arr);
      }
    }
    return map;
  }, [folders]);

  const sessionsByFolder = useMemo(() => {
    const folderIdSet = new Set(folders.map((f) => f.id));
    const map = new Map<number, StrengthSessionTemplate[]>();
    for (const s of allSessions) {
      if (s.folder_id && folderIdSet.has(s.folder_id)) {
        if ((s.items?.length ?? 0) === 0) continue;
        const arr = map.get(s.folder_id) ?? [];
        arr.push(s);
        map.set(s.folder_id, arr);
      }
    }
    return map;
  }, [folders, allSessions]);

  // ── Sessions lookup map (id → StrengthSessionTemplate) ─────────────────────
  const sessionsById = useMemo(() => {
    const map = new Map<number, StrengthSessionTemplate>();
    for (const s of allSessions) {
      map.set(s.id, s);
    }
    return map;
  }, [allSessions]);

  // ── Phase 3 (§275.7) — derive sessions per visible week from applications ──
  const phase3Derived = useMemo<Map<string, Map<number, DerivedCell>>>(() => {
    if (planApplications.length === 0) return new Map();
    return derivePlanByWeekDay({
      weekKeys: weekStarts,
      applications: planApplications,
      sessions: applicationPlanSessions,
    });
  }, [planApplications, applicationPlanSessions, weekStarts]);

  // §296 — Si l'athlète a un mésocycle muscu actif, ses slot_overrides (Phase
  // 2) doivent gagner sur le training_plan_application (Phase 3) — sémantique :
  // un mésocycle posé = override personnalisé récent qui DOIT s'afficher.
  // Sans mésocycle actif, on garde la cascade historique (Phase 3 > Phase 2).
  const { data: activeMesocycle } = useQuery({
    queryKey: ["strength-mesocycle-active", athleteId],
    queryFn: () => getActiveMesocycle(athleteId),
  });
  const hasActiveMesocycle = activeMesocycle != null;

  // ── Determine which source to use ──────────────────────────────────────────
  // Priority (post-§296) :
  //   • si mésocycle actif → Phase 2 (overrides) > Phase 3 > Phase 1
  //   • sinon              → Phase 3 (applications) > Phase 2 > Phase 1
  const usePhase2 =
    (hasActiveMesocycle && effectiveSlots.length > 0) ||
    (phase3Derived.size === 0 && effectiveSlots.length > 0);
  const usePhase3 = !usePhase2 && phase3Derived.size > 0;
  const useFallback = !usePhase2 && !usePhase3 && rootFolders.length > 0;

  // ── Phase 3: Build WeekInstances from derived plan cells ──────────────────
  const phase3WeekInstances = useMemo((): WeekInstance[] => {
    if (!usePhase3) return [];
    const instances: WeekInstance[] = [];
    const DAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
    for (const weekStart of weekStarts) {
      const dayMap = phase3Derived.get(weekStart);
      if (!dayMap || dayMap.size === 0) continue;

      const monday = new Date(weekStart + "T00:00:00");
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      const weekNumber = getISOWeekNumber(monday);

      // Pick the plan name from the first cell of the week (all cells share
      // the same plan in our resolver — newest application wins).
      const firstCell = dayMap.values().next().value as
        | { planName: string; relativeWeek: number }
        | undefined;
      const planName = firstCell?.planName ?? "";
      const relativeWeek = firstCell?.relativeWeek ?? null;

      const sessions = Array.from(dayMap.entries())
        .map(([dayIndex, cell]) => {
          const tplId = cell.session.session_template_id;
          if (tplId == null) return null;
          const session = sessionsById.get(tplId);
          if (!session) return null;
          const cleanTitle = (session.title ?? session.name ?? "")
            .replace(
              /^(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s*[—–\-:]\s*/i,
              "",
            )
            .trim();
          return {
            dayIndex,
            dayLabel: DAY_LABELS[dayIndex] ?? null,
            session,
            cleanTitle,
          };
        })
        .filter((s): s is NonNullable<typeof s> => s !== null)
        .sort((a, b) => a.dayIndex - b.dayIndex);

      if (sessions.length === 0) continue;

      instances.push({
        week: { monday, sunday, weekNumber, weekKey: weekStart },
        cycleId: 0, // no cycle concept in Phase 3
        cycleName: planName,
        cycleShortLabel: relativeWeek != null ? `S${weekNumber}` : `S${weekNumber}`,
        phase: detectPhase(planName),
        phaseName: planName,
        dateRangeLabel: null,
        sessions,
      });
    }
    return instances;
  }, [usePhase3, phase3Derived, weekStarts, sessionsById]);

  // ── Phase 2: Build WeekInstances from effective slots ──────────────────────
  const phase2WeekInstances = useMemo((): WeekInstance[] => {
    if (!usePhase2) return [];

    // Group effective slots by week_start
    const byWeek = new Map<string, typeof effectiveSlots>();
    for (const slot of effectiveSlots) {
      const arr = byWeek.get(slot.week_start) ?? [];
      arr.push(slot);
      byWeek.set(slot.week_start, arr);
    }

    const instances: WeekInstance[] = [];
    for (const weekStart of weekStarts) {
      const slots = byWeek.get(weekStart) ?? [];
      if (slots.length === 0) continue;

      const monday = new Date(weekStart + "T00:00:00");
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      const weekNumber = getISOWeekNumber(monday);

      // Build WeekSession entries from slots that have a session_template_id
      const sessions = slots
        .filter((slot) => slot.session_template_id != null)
        .map((slot) => {
          const session = sessionsById.get(slot.session_template_id!);
          if (!session) return null;
          const DAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
          const dayLabel = DAY_LABELS[slot.day_of_week] ?? null;
          const cleanTitle = (session.title ?? session.name ?? "").replace(
            /^(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s*[—–\-:]\s*/i,
            "",
          ).trim();
          return {
            dayIndex: slot.day_of_week,
            dayLabel,
            session,
            cleanTitle,
          };
        })
        .filter((s): s is NonNullable<typeof s> => s !== null)
        .sort((a, b) => a.dayIndex - b.dayIndex);

      // §293 — si un week_override a posé un week_type (label cycle du
      // mésocycle généré), on le surface comme nom de cycle/phase pour que la
      // timeline affiche « Force max » / « Pic » plutôt qu'un libellé vide.
      const weekType = weekTypeByStart.get(weekStart) ?? "";
      instances.push({
        week: { monday, sunday, weekNumber, weekKey: weekStart },
        cycleId: 0, // no cycle for Phase 2
        cycleName: weekType,
        cycleShortLabel: `S${weekNumber}`,
        phase: detectPhase(weekType),
        phaseName: weekType,
        dateRangeLabel: null,
        sessions,
      });
    }
    return instances;
  }, [usePhase2, effectiveSlots, weekStarts, sessionsById, weekTypeByStart]);

  // ── Phase 1 fallback: build WeekInstances from cycles ─────────────────────
  const fallbackWeekInstances = useMemo((): WeekInstance[] => {
    if (!useFallback) return [];
    const allCycles = rootFolders.flatMap((root) => subFoldersMap.get(root.id) ?? []);
    if (allCycles.length === 0) return [];
    const all = buildWeekInstances(rootFolders[0], allCycles, sessionsByFolder);
    const todayMondayKey = toISODate(getMonday(new Date()));
    return all.filter((inst) => inst.week.weekKey >= todayMondayKey);
  }, [useFallback, rootFolders, subFoldersMap, sessionsByFolder]);

  // ── Final week instances ────────────────────────────────────────────────────
  const weekInstances = usePhase3
    ? phase3WeekInstances
    : usePhase2
      ? phase2WeekInstances
      : fallbackWeekInstances;

  // §296 — Auto-open priorité : si un mésocycle actif existe, ouvrir la
  // PREMIÈRE semaine du mésocycle (le plan que le nageur vient de générer
  // mérite la visibilité maximale). Sinon, semaine en cours comme avant.
  const firstMesoWeekKey = useMemo(() => {
    if (!hasActiveMesocycle) return null;
    for (const o of athleteOverrides) {
      if (typeof o.notes === "string" && o.notes.startsWith("Mésocycle ")) {
        return o.week_start;
      }
    }
    return null;
  }, [hasActiveMesocycle, athleteOverrides]);

  useEffect(() => {
    if (weekInstances.length > 0 && expandedWeekKey === null) {
      // 1) Si meso actif → première semaine du méso (si présente dans la timeline)
      if (firstMesoWeekKey) {
        const mesoInst = weekInstances.find(
          (inst) => inst.week.weekKey === firstMesoWeekKey,
        );
        if (mesoInst) {
          setExpandedWeekKey(mesoInst.week.weekKey);
          return;
        }
      }
      // 2) Sinon, semaine en cours
      const current = weekInstances.find((inst) => isCurrentWeek(inst.week.weekKey));
      setExpandedWeekKey(
        current?.week.weekKey ?? weekInstances[weekInstances.length - 1].week.weekKey,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekInstances.length, firstMesoWeekKey]);

  // Handoff from Dashboard day drawer: when the swimmer tapped a muscu card
  // there, the slot id was stashed in sessionStorage. As soon as the slot
  // catalog + session catalog are both loaded, resolve and launch directly
  // into focus mode. The sessionStorage entry is consumed exactly once.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!onLaunchSessionDirect) return;
    const pendingSlotId = window.sessionStorage.getItem(
      "eac_pending_strength_focus_slot_id",
    );
    if (!pendingSlotId) return;
    if (!effectiveSlots.length || sessionsById.size === 0) return; // wait for data
    window.sessionStorage.removeItem("eac_pending_strength_focus_slot_id");
    const slot = effectiveSlots.find((s) => s.id === pendingSlotId);
    if (!slot?.session_template_id) return;
    const session = sessionsById.get(slot.session_template_id);
    if (!session) return;
    onLaunchSessionDirect(session);
  }, [effectiveSlots, sessionsById, onLaunchSessionDirect]);

  // ── Competitions ────────────────────────────────────────────────────────────
  const { competitionsByWeek, getDayCompetitions } = useCompetitionsByWeek(athleteId);

  // ── Récap : bouton discret + overlay (DRY, réutilisés dans les 3 états réels) ──
  const recapButton = wrapped.enabled ? (
    <div className="flex justify-end -mt-1 mb-1">
      <Button
        variant="ghost"
        size="sm"
        className="gap-1.5 text-muted-foreground"
        onClick={() => setRecapOpen(true)}
      >
        <Sparkles className="h-4 w-4" /> Récap
      </Button>
    </div>
  ) : null;

  const recapOverlay = (
    <StrengthWrappedRecap
      athleteId={athleteId}
      open={recapOpen}
      onClose={() => setRecapOpen(false)}
      viewerContext="self"
    />
  );

  // ── Loading skeleton ────────────────────────────────────────────────────────
  if (foldersLoading) {
    return (
      <div className="space-y-3 pt-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="rounded-xl border p-3 h-14 bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  // ── Empty states ────────────────────────────────────────────────────────────
  // No Phase 3 applications AND no Phase 2 slots AND no Phase 1 cycles → show "aucun plan"
  if (!usePhase3 && !usePhase2 && rootFolders.length === 0) {
    return (
      <div>
        {recapButton}
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <FolderOpen className="h-10 w-10 mb-4 text-muted-foreground/30" />
          <p className="text-sm font-medium text-muted-foreground">Aucun plan personnalisé</p>
          <p className="text-xs text-muted-foreground/60 mt-1.5 max-w-[240px]">
            Ton coach peut créer un plan d'entraînement depuis le catalogue musculation.
          </p>
        </div>
        {recapOverlay}
      </div>
    );
  }

  if (weekInstances.length === 0) {
    return (
      <div>
        {recapButton}
        <div className="rounded-xl border border-dashed p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Les séances de ce plan n'ont pas encore d'exercices configurés.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Demande à ton coach de compléter ta planification.
          </p>
        </div>
        {recapOverlay}
      </div>
    );
  }

  // ── Timeline ────────────────────────────────────────────────────────────────
  return (
    <div className="relative pt-1 pb-4">
      {recapButton}
      {/* Vertical timeline rail */}
      <div className="absolute left-[27px] top-8 bottom-8 w-px bg-border" />

      {weekInstances.map((inst) => {
        const weekCompetitions = competitionsByWeek.get(inst.week.weekKey) ?? [];
        return (
          <MyPlanWeekCard
            key={`${inst.cycleId}-${inst.week.weekKey}`}
            instance={inst}
            isCurrent={isCurrentWeek(inst.week.weekKey)}
            isExpanded={expandedWeekKey === inst.week.weekKey}
            onToggleExpand={() =>
              setExpandedWeekKey((k) =>
                k === inst.week.weekKey ? null : inst.week.weekKey,
              )
            }
            competitions={weekCompetitions}
            getDayCompetitions={(monday, dayIndex) => getDayCompetitions(monday, dayIndex)}
            onSelectSession={onSelectSession}
            onSelectCompetition={setSelectedCompetition}
          />
        );
      })}

      {/* Competition info sheet */}
      {selectedCompetition && (
        <Sheet
          open={!!selectedCompetition}
          onOpenChange={(open) => !open && setSelectedCompetition(null)}
        >
          <SheetContent side="bottom" className="rounded-t-2xl">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2 text-base">
                <Trophy className="h-4 w-4 text-amber-500 shrink-0" />
                {selectedCompetition.name}
              </SheetTitle>
            </SheetHeader>
            <div className="space-y-1.5 pt-2 pb-4 text-sm text-muted-foreground">
              {selectedCompetition.date && (
                <p>
                  <span className="font-medium text-foreground">Date : </span>
                  {fmtDD_MM(new Date(selectedCompetition.date + "T00:00:00"))}
                  {selectedCompetition.end_date &&
                    selectedCompetition.end_date !== selectedCompetition.date && (
                      <span>
                        {" – "}
                        {fmtDD_MM(new Date(selectedCompetition.end_date + "T00:00:00"))}
                      </span>
                    )}
                </p>
              )}
              {selectedCompetition.location && (
                <p>
                  <span className={cn("font-medium text-foreground")}>Lieu : </span>
                  {selectedCompetition.location}
                </p>
              )}
              {selectedCompetition.description && (
                <p className="text-xs mt-2">{selectedCompetition.description}</p>
              )}
            </div>
          </SheetContent>
        </Sheet>
      )}

      {recapOverlay}
    </div>
  );
}

export const MyPlanTab = memo(MyPlanTabImpl);
