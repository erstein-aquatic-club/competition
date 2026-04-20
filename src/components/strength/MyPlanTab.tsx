import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { StrengthFolder, StrengthSessionTemplate, Competition } from "@/lib/api/types";
import { FolderOpen, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { isCurrentWeek, fmtDD_MM } from "@/components/coach/swim/swimPlanningShared";
import { buildWeekInstances } from "@/lib/strength/strengthPlanWeeks";
import { MyPlanWeekCard } from "./MyPlanWeekCard";
import { MyPlanSessionSheet } from "./MyPlanSessionSheet";
import { useCompetitionsByWeek } from "@/hooks/useCompetitionsByWeek";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface MyPlanTabProps {
  athleteId: number;
  onSelectSession: (session: StrengthSessionTemplate) => void;
}

export function MyPlanTab({ athleteId, onSelectSession }: MyPlanTabProps) {
  const [expandedWeekKey, setExpandedWeekKey] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<{
    session: StrengthSessionTemplate;
    phase: string;
  } | null>(null);
  const [selectedCompetition, setSelectedCompetition] = useState<Competition | null>(null);

  // ── Data loading ────────────────────────────────────────────────────────
  const { data: folders = [], isLoading: foldersLoading } = useQuery({
    queryKey: ["strength_folders", "session", athleteId],
    queryFn: () => api.getStrengthFolders("session", { athleteId }),
  });

  const { data: allSessions = [] } = useQuery({
    queryKey: ["strength_catalog"],
    queryFn: () => api.getStrengthSessions(),
  });

  // ── Hierarchy ───────────────────────────────────────────────────────────
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

  // ── Week instances ──────────────────────────────────────────────────────
  const weekInstances = useMemo(() => {
    const allCycles = rootFolders.flatMap((root) => subFoldersMap.get(root.id) ?? []);
    if (allCycles.length === 0 || rootFolders.length === 0) return [];
    return buildWeekInstances(rootFolders[0], allCycles, sessionsByFolder);
  }, [rootFolders, subFoldersMap, sessionsByFolder]);

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

  // ── Competitions ────────────────────────────────────────────────────────
  const { competitionsByWeek, getDayCompetitions } = useCompetitionsByWeek(athleteId);

  // ── Loading skeleton ────────────────────────────────────────────────────
  if (foldersLoading) {
    return (
      <div className="space-y-3 pt-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="rounded-xl border p-3 h-14 bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  // ── Empty states ────────────────────────────────────────────────────────
  if (rootFolders.length === 0) {
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

  // ── Timeline ────────────────────────────────────────────────────────────
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
            onSelectSession={(session) =>
              setSelectedSession({ session, phase: inst.phase })
            }
            onSelectCompetition={setSelectedCompetition}
          />
        );
      })}

      {/* Session preview sheet */}
      <MyPlanSessionSheet
        session={selectedSession?.session ?? null}
        phase={(selectedSession?.phase as any) ?? null}
        onClose={() => setSelectedSession(null)}
        onLaunch={(session) => {
          setSelectedSession(null);
          onSelectSession(session);
        }}
      />

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
