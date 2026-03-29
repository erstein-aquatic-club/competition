import { useState, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, StrengthCycleType, StrengthSessionTemplate, Assignment } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { ChevronRight, Dumbbell, Search, X } from "lucide-react";
import { CycleSelector } from "@/components/strength/CycleSelector";
import { InProgressCard } from "@/components/strength/InProgressCard";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { cn, stripAccents } from "@/lib/utils";
import { motion } from "framer-motion";
import { staggerChildren } from "@/lib/animations";
import { SaveState } from "@/components/shared/BottomActionBar";

const normalizeStrengthCycle = (value?: string | null): StrengthCycleType => {
  if (value === "endurance" || value === "hypertrophie" || value === "force") {
    return value;
  }
  return "endurance";
};

interface SessionListProps {
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
  onResumeInProgress: (params: {
    assignment: Assignment | null;
    session: StrengthSessionTemplate | null;
    runId: number;
    logs: any[];
    progressPct: number;
  }) => void;
}

type DisplaySession = {
  key: string;
  title: string;
  description: string | null;
  type: "assignment" | "catalog";
  assignedDate?: string;
  session: StrengthSessionTemplate;
  assignment?: Assignment;
  exerciseCount: number;
};


const cardVariant = {
  hidden: { opacity: 0, x: -10 },
  visible: { opacity: 1, x: 0 },
};

export function SessionList({
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
  onResumeInProgress,
}: SessionListProps) {
  const [selectedSessionIndex, setSelectedSessionIndex] = useState<number | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  // Queries
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

  const exerciseLookup = useMemo(() => {
    if (!exercises) return new Map();
    return new Map(exercises.map((exercise) => [exercise.id, exercise]));
  }, [exercises]);

  // Filter strength assignments
  const strengthAssignments = useMemo(() => {
    return (
      assignments?.filter(
        (assignment): assignment is Assignment & { session_type: "strength" } =>
          assignment.session_type === "strength"
      ) || []
    );
  }, [assignments]);

  const activeStrengthAssignments = useMemo(() => {
    return strengthAssignments.filter((assignment) => assignment.status !== "completed");
  }, [strengthAssignments]);

  const inProgressAssignment = useMemo(() => {
    return inProgressRun
      ? activeStrengthAssignments.find((assignment) => assignment.id === inProgressRun.assignment_id) ?? null
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

  // Build display sessions
  const assignedDisplaySessions: DisplaySession[] = useMemo(() => {
    return activeStrengthAssignments.map((assign) => {
      const items = (assign.items ?? []).filter((item): item is any =>
        'exercise_id' in item
      );
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
          items: items,
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

  const filteredDisplaySessions = useMemo(() => {
    const searchValue = stripAccents(searchQuery.trim().toLowerCase());
    const allSessions = [...assignedDisplaySessions, ...catalogDisplaySessions];
    if (!searchValue) return allSessions;
    return allSessions.filter((session) =>
      stripAccents(`${session.title} ${session.description}`.toLowerCase()).includes(searchValue)
    );
  }, [assignedDisplaySessions, catalogDisplaySessions, searchQuery]);

  const handleSessionListKeyDown = useCallback(
    (e: React.KeyboardEvent, currentIndex: number) => {
      const navKeys = ["ArrowUp", "ArrowDown", "Enter"];
      if (!navKeys.includes(e.key)) return;

      e.preventDefault();

      if (e.key === "Enter") {
        const session = filteredDisplaySessions[currentIndex];
        if (session.type === "assignment" && session.assignment) {
          onStartAssignment(session.assignment);
        } else {
          onStartCatalog(session.session);
        }
        return;
      }

      let nextIndex = currentIndex;
      if (e.key === "ArrowUp") nextIndex = Math.max(0, currentIndex - 1);
      if (e.key === "ArrowDown") nextIndex = Math.min(filteredDisplaySessions.length - 1, currentIndex + 1);

      setSelectedSessionIndex(nextIndex);

      setTimeout(() => {
        const cards = document.querySelectorAll('[data-session-card="true"]');
        if (cards[nextIndex]) {
          (cards[nextIndex] as HTMLElement).focus();
        }
      }, 0);
    },
    [filteredDisplaySessions, onStartAssignment, onStartCatalog]
  );

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

  const totalSessions = filteredDisplaySessions.length;
  const showSearch = totalSessions > 4 || searchQuery.length > 0;

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

      {/* ── Section header ── */}
      {totalSessions > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            {totalSessions} séance{totalSessions > 1 ? "s" : ""}
          </span>
          <div className="flex-1 h-px bg-border/40" />
        </div>
      )}

      {/* ── Sessions list ── */}
      {totalSessions > 0 ? (
        <motion.div
          className="space-y-1.5 motion-reduce:animate-none"
          variants={staggerChildren}
          initial="hidden"
          animate="visible"
        >
          {filteredDisplaySessions.map((session, index) => {
            const isFocused =
              selectedSessionIndex === index || (selectedSessionIndex === null && index === 0);
            const isAssignment = session.type === "assignment";
            return (
              <motion.button
                key={session.key}
                type="button"
                tabIndex={isFocused ? 0 : -1}
                data-session-card="true"
                onKeyDown={(e) => handleSessionListKeyDown(e, index)}
                variants={cardVariant}
                className={cn(
                  "group w-full rounded-xl border bg-card text-left transition-all active:scale-[0.98] focus:outline-none motion-reduce:animate-none",
                  isAssignment
                    ? "border-primary/20 hover:border-primary/40"
                    : "hover:border-primary/30",
                  isFocused && "ring-2 ring-primary/40"
                )}
                onClick={() => {
                  if (isAssignment && session.assignment) {
                    onStartAssignment(session.assignment);
                    return;
                  }
                  onStartCatalog(session.session);
                }}
              >
                <div className="flex items-center gap-2.5 px-2.5 py-2">
                  {/* Exercise count badge */}
                  <div className={cn(
                    "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg",
                    isAssignment
                      ? "bg-primary/10 text-primary"
                      : "bg-muted/50 text-muted-foreground"
                  )}>
                    <span className="text-sm font-bold">{session.exerciseCount}</span>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="font-semibold text-[13px] truncate leading-tight">
                        {session.title}
                      </p>
                      {isAssignment && (
                        <span className="shrink-0 inline-flex items-center rounded bg-primary/10 px-1 py-px text-[9px] font-bold uppercase text-primary">
                          Coach
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5 tabular-nums truncate">
                      {session.exerciseCount} ex.
                      {isAssignment && session.assignedDate && (
                        <>
                          <span className="text-muted-foreground/40"> · </span>
                          {format(new Date(session.assignedDate), "dd MMM", { locale: fr })}
                        </>
                      )}
                      {!isAssignment && session.description && (
                        <>
                          <span className="text-muted-foreground/40"> · </span>
                          <span className="truncate">{session.description}</span>
                        </>
                      )}
                    </p>
                  </div>

                  {/* Chevron */}
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/30 transition-transform group-hover:translate-x-0.5" />
                </div>
              </motion.button>
            );
          })}
        </motion.div>
      ) : (
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
