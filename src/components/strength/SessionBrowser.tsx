import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, StrengthCycleType, StrengthSessionTemplate, Assignment } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Dumbbell, Search, X } from "lucide-react";
import { stripAccents } from "@/lib/utils";
import { CycleSelector } from "@/components/strength/CycleSelector";
import { InProgressCard } from "@/components/strength/InProgressCard";
import { UnfiledSessionList, DisplaySession } from "@/components/strength/UnfiledSessionList";
import { CommonFolderList } from "@/components/strength/CommonFolderList";
import { TeamPlansSection } from "@/components/strength/TeamPlansSection";
import { SaveState } from "@/components/shared/BottomActionBar";

const normalizeStrengthCycle = (value?: string | null): StrengthCycleType => {
  if (value === "endurance" || value === "hypertrophie" || value === "force") {
    return value;
  }
  return "endurance";
};

interface SessionBrowserProps {
  user: string | null;
  userId: number | null;
  athleteName: string | null;
  athleteId: number | null;
  athleteKey: number | string | null;
  cycleType: StrengthCycleType;
  searchQuery: string;
  isLoading: boolean;
  setSaveState: (state: SaveState) => void;
  onCycleChange: (cycle: StrengthCycleType) => void;
  onSearchChange: (query: string) => void;
  onStartAssignment: (assignment: Assignment) => void;
  onStartCatalog: (session: StrengthSessionTemplate) => void;
  onStartPlanSession: (session: StrengthSessionTemplate) => void;
  onResumeInProgress: (params: {
    assignment: Assignment | null;
    session: StrengthSessionTemplate | null;
    runId: number;
    logs: any[];
    progressPct: number;
  }) => void;
}

export function SessionBrowser({
  user,
  userId,
  athleteName,
  athleteId,
  athleteKey,
  cycleType,
  searchQuery,
  isLoading,
  setSaveState,
  onCycleChange,
  onSearchChange,
  onStartAssignment,
  onStartCatalog,
  onStartPlanSession,
  onResumeInProgress,
}: SessionBrowserProps) {
  // ── Queries ──────────────────────────────────────────────────────────
  const { data: assignments } = useQuery({
    queryKey: ["assignments", user, "strength"],
    queryFn: () => api.getAssignments(user!, userId, { assignmentType: "strength" }),
    enabled: !!user,
  });

  const { data: strengthCatalog } = useQuery({
    queryKey: ["strength_catalog"],
    queryFn: () => api.getStrengthSessions(),
  });

  const { data: exercises } = useQuery({
    queryKey: ["exercises"],
    queryFn: () => api.getExercises(),
  });

  const inProgressRunQuery = useQuery({
    queryKey: ["strength_run_in_progress", athleteKey],
    queryFn: () =>
      api.getStrengthHistory(athleteName!, {
        limit: 1,
        offset: 0,
        order: "desc",
        status: "in_progress",
        athleteId: athleteId,
      }),
    enabled: !!athleteName,
  });

  const inProgressRun = inProgressRunQuery.data?.runs?.[0] ?? null;

  // Global folders (athlete_id IS NULL) — fetch all then filter client-side
  const { data: allGlobalFolders = [] } = useQuery({
    queryKey: ["strength_folders_global_all"],
    queryFn: async () => {
      const all = await api.getStrengthFolders("session");
      return all.filter((f) => !f.athlete_id);
    },
  });

  // ── Exercise lookup ──────────────────────────────────────────────────
  const _exerciseLookup = useMemo(() => {
    if (!exercises) return new Map();
    return new Map(exercises.map((exercise) => [exercise.id, exercise]));
  }, [exercises]);

  // ── Strength assignments ─────────────────────────────────────────────
  const strengthAssignments = useMemo(() => {
    return (
      assignments?.filter(
        (assignment): assignment is Assignment & { session_type: "strength" } =>
          assignment.session_type === "strength",
      ) || []
    );
  }, [assignments]);

  const activeStrengthAssignments = useMemo(() => {
    return strengthAssignments.filter((assignment) => assignment.status !== "completed");
  }, [strengthAssignments]);

  // ── In-progress resolution ───────────────────────────────────────────
  const inProgressAssignment = useMemo(() => {
    return inProgressRun
      ? activeStrengthAssignments.find((a) => a.id === inProgressRun.assignment_id) ?? null
      : null;
  }, [inProgressRun, activeStrengthAssignments]);

  const inProgressSession = useMemo(() => {
    return inProgressRun && !inProgressAssignment
      ? strengthCatalog?.find((s) => s.id === inProgressRun.session_id) ?? null
      : null;
  }, [inProgressRun, inProgressAssignment, strengthCatalog]);

  const canResumeInProgress =
    (Boolean(inProgressAssignment?.items?.length) || Boolean(inProgressSession?.items?.length)) &&
    !(inProgressRun?.status === "completed" || (inProgressRun?.progress_pct ?? 0) >= 100);

  // ── Build display sessions ───────────────────────────────────────────
  const assignedDisplaySessions: DisplaySession[] = useMemo(() => {
    return activeStrengthAssignments.map((assign) => {
      const items = (assign.items ?? []).filter((item): item is any => "exercise_id" in item);
      return {
        key: `assignment-${assign.id}`,
        title: assign.title,
        description: assign.description,
        type: "assignment" as const,
        assignedDate: assign.assigned_date,
        session: {
          id: assign.session_id,
          title: assign.title,
          description: assign.description,
          cycle: normalizeStrengthCycle(assign.cycle),
          items,
        },
        assignment: assign,
        exerciseCount: items.length,
      };
    });
  }, [activeStrengthAssignments]);

  const catalogDisplaySessions: DisplaySession[] = useMemo(() => {
    return (strengthCatalog ?? []).map((session) => ({
      key: `catalog-${session.id}`,
      title: session.title,
      description: session.description,
      type: "catalog" as const,
      session: { ...session, cycle: cycleType },
      exerciseCount: session.items?.length ?? 0,
    }));
  }, [strengthCatalog, cycleType]);

  // ── Unfiled sessions (not in any global folder) ──────────────────────
  const globalFolderIds = useMemo(
    () => new Set(allGlobalFolders.map((f) => f.id)),
    [allGlobalFolders],
  );

  const unfiledCatalogSessions = useMemo(() => {
    return catalogDisplaySessions.filter((ds) => {
      const folderId = ds.session.folder_id;
      return folderId == null || !globalFolderIds.has(folderId);
    });
  }, [catalogDisplaySessions, globalFolderIds]);

  const unfiledSessions = useMemo(() => {
    return [...assignedDisplaySessions, ...unfiledCatalogSessions];
  }, [assignedDisplaySessions, unfiledCatalogSessions]);

  // ── Search filter ────────────────────────────────────────────────────
  const searchValue = stripAccents(searchQuery.trim().toLowerCase());
  const isSearching = searchValue.length > 0;

  const filteredUnfiledSessions = useMemo(() => {
    if (!isSearching) return unfiledSessions;
    return unfiledSessions.filter((s) =>
      stripAccents(`${s.title} ${s.description ?? ""}`.toLowerCase()).includes(searchValue),
    );
  }, [unfiledSessions, isSearching, searchValue]);

  // ── Loading skeleton ─────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-3 pt-2">
        <div className="grid grid-cols-3 gap-1.5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 rounded-xl bg-muted/50 animate-pulse" />
          ))}
        </div>
        <div className="space-y-1.5">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-2.5 rounded-xl border bg-card px-2.5 py-2">
              <div className="h-11 w-11 rounded-lg bg-muted animate-pulse" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 w-3/5 rounded bg-muted animate-pulse" />
                <div className="h-2.5 w-2/5 rounded bg-muted animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const totalUnfiled = filteredUnfiledSessions.length;
  const showSearch = unfiledSessions.length > 4 || searchQuery.length > 0;

  return (
    <div className="space-y-3 animate-in fade-in motion-reduce:animate-none">
      {/* ── Cycle selector ── */}
      <CycleSelector cycleType={cycleType} onCycleChange={onCycleChange} />

      {/* ── In-progress session ── */}
      {inProgressRun && (
        <InProgressCard
          inProgressRun={inProgressRun}
          inProgressAssignment={inProgressAssignment}
          inProgressSession={inProgressSession}
          canResumeInProgress={canResumeInProgress}
          user={user}
          athleteKey={athleteKey}
          setSaveState={setSaveState}
          onResumeInProgress={onResumeInProgress}
        />
      )}

      {/* ── Search ── */}
      {showSearch && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50 pointer-events-none" />
          <Input
            placeholder="Rechercher…"
            className="h-9 rounded-xl bg-muted/30 pl-8 pr-8 border-0 text-[13px] focus-visible:ring-2 focus-visible:ring-primary/30"
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            aria-label="Rechercher une séance"
          />
          {searchQuery && (
            <button
              type="button"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-muted-foreground transition"
              onClick={() => onSearchChange("")}
              aria-label="Effacer la recherche"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {/* ── Unfiled sessions ── */}
      <UnfiledSessionList
        sessions={filteredUnfiledSessions}
        onStartAssignment={onStartAssignment}
        onStartCatalog={onStartCatalog}
      />

      {/* ── Global folders (hidden during search) ── */}
      {!isSearching && (
        <CommonFolderList
          folders={allGlobalFolders}
          allSessions={strengthCatalog ?? []}
          onStartCatalog={onStartCatalog}
        />
      )}

      {/* ── Team plans (hidden during search) ── */}
      {!isSearching && athleteId && (
        <TeamPlansSection
          currentAthleteId={athleteId}
          onSelectSession={onStartPlanSession}
        />
      )}

      {/* ── Empty state ── */}
      {isSearching && totalUnfiled === 0 && (
        <div className="flex flex-col items-center justify-center py-14 text-center">
          <Dumbbell className="h-8 w-8 mb-3 text-muted-foreground/25" />
          <p className="text-sm font-medium text-muted-foreground">Aucune séance trouvée</p>
          <p className="text-[11px] text-muted-foreground/50 mt-1 max-w-[220px]">
            Changez de cycle ou modifiez votre recherche.
          </p>
        </div>
      )}
    </div>
  );
}
