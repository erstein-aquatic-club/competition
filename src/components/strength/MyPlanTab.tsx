import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { StrengthFolder, StrengthSessionTemplate, Competition } from "@/lib/api/types";
import { FolderOpen, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { isCurrentWeek, fmtDD_MM, getMonday, getISOWeekNumber } from "@/components/coach/swim/swimPlanningShared";
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
import { detectPhase } from "@/lib/strength/strengthPhaseStyles";

/** Number of future weeks to display from current week */
const PLAN_WEEK_COUNT = 12;

/** Build ISO date strings for the next N weeks from today's Monday */
function buildWeekStarts(count: number): string[] {
  const monday = getMonday(new Date());
  const starts: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i * 7);
    starts.push(d.toISOString().split("T")[0]);
  }
  return starts;
}

interface MyPlanTabProps {
  athleteId: number;
  onSelectSession: (session: StrengthSessionTemplate) => void;
}

export function MyPlanTab({ athleteId, onSelectSession }: MyPlanTabProps) {
  const [expandedWeekKey, setExpandedWeekKey] = useState<string | null>(null);
  const [selectedCompetition, setSelectedCompetition] = useState<Competition | null>(null);

  // Stable week starts for the next 12 weeks
  const weekStarts = useMemo(() => buildWeekStarts(PLAN_WEEK_COUNT), []);

  // ── Profile (to get group_id) ───────────────────────────────────────────────
  const { data: profile } = useQuery({
    queryKey: ["profile", athleteId],
    queryFn: () => api.getProfile({ userId: athleteId }),
    staleTime: 5 * 60 * 1000,
  });
  const groupId = profile?.group_id ?? null;

  // ── Phase 2: Strength planning slots ────────────────────────────────────────
  const { data: groupSlots = [] } = useQuery({
    queryKey: ["strength_planning_slots", groupId, weekStarts],
    queryFn: () =>
      groupId
        ? api.getStrengthPlanningSlots({ groupId, weekStarts })
        : Promise.resolve([]),
    enabled: groupId != null,
  });

  const { data: athleteOverrides = [] } = useQuery({
    queryKey: ["strength_planning_slot_overrides", athleteId, weekStarts],
    queryFn: () =>
      api.getStrengthPlanningSlotOverrides({ athleteId, weekStarts }),
  });

  // Merge: athlete overrides take precedence over group slots
  const effectiveSlots = useMemo(
    () => mergeStrengthSlots(groupSlots, athleteOverrides),
    [groupSlots, athleteOverrides],
  );

  // ── Phase 1 fallback data (cycles-based) ────────────────────────────────────
  const { data: folders = [], isLoading: foldersLoading } = useQuery({
    queryKey: ["strength_folders", "session", athleteId],
    queryFn: () => api.getStrengthFolders("session", { athleteId }),
  });

  const { data: allSessions = [] } = useQuery({
    queryKey: ["strength_catalog"],
    queryFn: () => api.getStrengthSessions(),
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

  // ── Determine which source to use ──────────────────────────────────────────
  // Use Phase 2 BDD slots if any effective slots exist.
  // Fall back to Phase 1 cycle parsing only if no BDD slots but cycles exist.
  const usePhase2 = effectiveSlots.length > 0;
  const useFallback = !usePhase2 && rootFolders.length > 0;

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

      instances.push({
        week: { monday, sunday, weekNumber, weekKey: weekStart },
        cycleId: 0, // no cycle for Phase 2
        cycleName: "",
        cycleShortLabel: `S${weekNumber}`,
        phase: detectPhase(""),
        phaseName: "",
        dateRangeLabel: null,
        sessions,
      });
    }
    return instances;
  }, [usePhase2, effectiveSlots, weekStarts, sessionsById]);

  // ── Phase 1 fallback: build WeekInstances from cycles ─────────────────────
  const fallbackWeekInstances = useMemo((): WeekInstance[] => {
    if (!useFallback) return [];
    const allCycles = rootFolders.flatMap((root) => subFoldersMap.get(root.id) ?? []);
    if (allCycles.length === 0) return [];
    const all = buildWeekInstances(rootFolders[0], allCycles, sessionsByFolder);
    const todayMondayKey = getMonday(new Date()).toISOString().split("T")[0];
    return all.filter((inst) => inst.week.weekKey >= todayMondayKey);
  }, [useFallback, rootFolders, subFoldersMap, sessionsByFolder]);

  // ── Final week instances ────────────────────────────────────────────────────
  const weekInstances = usePhase2 ? phase2WeekInstances : fallbackWeekInstances;

  // Auto-open current week on first render
  useEffect(() => {
    if (weekInstances.length > 0 && expandedWeekKey === null) {
      const current = weekInstances.find((inst) => isCurrentWeek(inst.week.weekKey));
      setExpandedWeekKey(
        current?.week.weekKey ?? weekInstances[weekInstances.length - 1].week.weekKey,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekInstances.length]);

  // ── Competitions ────────────────────────────────────────────────────────────
  const { competitionsByWeek, getDayCompetitions } = useCompetitionsByWeek(athleteId);

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
  // No Phase 2 slots AND no Phase 1 cycles → show "aucun plan"
  if (!usePhase2 && rootFolders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <FolderOpen className="h-10 w-10 mb-4 text-muted-foreground/30" />
        <p className="text-sm font-medium text-muted-foreground">Aucun plan personnalisé</p>
        <p className="text-xs text-muted-foreground/60 mt-1.5 max-w-[240px]">
          Ton coach peut créer un plan d'entraînement depuis le catalogue musculation.
        </p>
      </div>
    );
  }

  if (weekInstances.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Les séances de ce plan n'ont pas encore d'exercices configurés.
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Demande à ton coach de compléter ta planification.
        </p>
      </div>
    );
  }

  // ── Timeline ────────────────────────────────────────────────────────────────
  return (
    <div className="relative pt-1 pb-4">
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
    </div>
  );
}
