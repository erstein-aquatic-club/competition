import { useMemo, useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AthleteSummary, StrengthFolder, StrengthSessionTemplate } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  CalendarPlus,
  Copy,
  Dumbbell,
  Edit2,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CopyToAthleteDialog } from "./CopyToAthleteDialog";
import { AddSessionSheet } from "./AddSessionSheet";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/shared/EmptyState";

/* ---------- colour palette for cycle left borders ---------- */
const CYCLE_COLORS = [
  "bg-red-500",
  "bg-orange-500",
  "bg-blue-500",
  "bg-green-500",
  "bg-violet-500",
  "bg-amber-500",
];

/* ---------- helpers ---------- */
function getInitials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function nameToColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = [
    "bg-red-500/15 text-red-700",
    "bg-orange-500/15 text-orange-700",
    "bg-blue-500/15 text-blue-700",
    "bg-green-500/15 text-green-700",
    "bg-violet-500/15 text-violet-700",
    "bg-amber-500/15 text-amber-700",
    "bg-pink-500/15 text-pink-700",
    "bg-teal-500/15 text-teal-700",
  ];
  return colors[Math.abs(hash) % colors.length];
}

/* ================================================================
   AthletePlansTab — entry point
   ================================================================ */
interface AthletePlansTabProps {
  athletes: AthleteSummary[];
  selectedAthleteId?: number | null;
  onSelectedAthleteChange?: (id: number | null) => void;
  onStartCreateSession: (folderId: number | null, context?: { athleteName: string; cycleName: string }) => void;
  onStartEditSession: (session: StrengthSessionTemplate, context?: { athleteName: string; cycleName: string }) => void;
  onDeleteSession: (session: StrengthSessionTemplate) => void;
}

export function AthletePlansTab({
  athletes,
  selectedAthleteId: controlledAthleteId,
  onSelectedAthleteChange,
  onStartCreateSession,
  onStartEditSession,
  onDeleteSession,
}: AthletePlansTabProps) {
  const [internalAthleteId, setInternalAthleteId] = useState<number | null>(null);
  const selectedAthleteId = controlledAthleteId !== undefined ? controlledAthleteId : internalAthleteId;
  const setSelectedAthleteId = (id: number | null) => {
    setInternalAthleteId(id);
    onSelectedAthleteChange?.(id);
  };
  const [athleteSearch, setAthleteSearch] = useState("");

  /* Count sessions per athlete across all their folders */
  const { data: allFolders = [] } = useQuery({
    queryKey: ["strength_folders", "session", "all_athletes"],
    queryFn: () => api.getStrengthFolders("session"),
  });

  const athleteFolderIds = useMemo(() => {
    // Build root-to-athlete mapping
    const rootToAthlete = new Map<number, number>();
    for (const f of allFolders) {
      if (f.athlete_id) rootToAthlete.set(f.id, f.athlete_id);
    }
    // Collect ALL folder ids per athlete (root + sub-folders via parent_id)
    const map = new Map<number, number[]>();
    for (const f of allFolders) {
      const athleteId = f.athlete_id ?? (f.parent_id ? rootToAthlete.get(f.parent_id) : null);
      if (athleteId) {
        const arr = map.get(athleteId) ?? [];
        arr.push(f.id);
        map.set(athleteId, arr);
      }
    }
    return map;
  }, [allFolders]);

  const { data: allSessions = [] } = useQuery({
    queryKey: ["strength_catalog"],
    queryFn: () => api.getStrengthSessions(),
  });

  const sessionCountByAthlete = useMemo(() => {
    const map = new Map<number, number>();
    for (const [athleteId, folderIds] of athleteFolderIds.entries()) {
      const folderSet = new Set(folderIds);
      const count = allSessions.filter((s) => s.folder_id && folderSet.has(s.folder_id)).length;
      map.set(athleteId, count);
    }
    return map;
  }, [athleteFolderIds, allSessions]);

  const selectedAthlete = athletes.find((a) => a.id === selectedAthleteId);

  if (selectedAthleteId !== null && selectedAthlete) {
    return (
      <AthletePlanDetail
        athleteId={selectedAthleteId}
        athleteName={selectedAthlete.display_name}
        athletes={athletes}
        onBack={() => setSelectedAthleteId(null)}
        onStartCreateSession={onStartCreateSession}
        onStartEditSession={onStartEditSession}
        onDeleteSession={onDeleteSession}
      />
    );
  }

  const filtered = athletes.filter(
    (a) =>
      a.id != null &&
      (!athleteSearch.trim() ||
        a.display_name.toLowerCase().includes(athleteSearch.toLowerCase())),
  );

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="flex items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          placeholder="Rechercher un nageur..."
          value={athleteSearch}
          onChange={(e) => setAthleteSearch(e.target.value)}
        />
      </div>

      {/* Athlete grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <Users className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">Aucun nageur trouvé</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {filtered.map((athlete) => {
            const count = sessionCountByAthlete.get(athlete.id!) ?? 0;
            const initials = getInitials(athlete.display_name);
            const colorClass = nameToColor(athlete.display_name);
            return (
              <button
                key={athlete.id}
                onClick={() => setSelectedAthleteId(athlete.id!)}
                className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-4 hover:border-primary/40 hover:shadow-sm transition-all text-center"
              >
                <div
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold",
                    colorClass,
                  )}
                >
                  {initials}
                </div>
                <p className="text-sm font-medium truncate w-full">{athlete.display_name}</p>
                {count > 0 ? (
                  <span className="text-xs text-muted-foreground">
                    {count} séance{count > 1 ? "s" : ""}
                  </span>
                ) : athleteFolderIds.has(athlete.id!) ? (
                  <span className="text-xs text-muted-foreground/60">Plan vide</span>
                ) : (
                  <span className="text-xs text-muted-foreground/60">Aucun plan</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ================================================================
   AthletePlanDetail — detail view per athlete
   ================================================================ */
interface AthletePlanDetailProps {
  athleteId: number;
  athleteName: string;
  athletes: AthleteSummary[];
  onBack: () => void;
  onStartCreateSession: (folderId: number | null, context?: { athleteName: string; cycleName: string }) => void;
  onStartEditSession: (session: StrengthSessionTemplate, context?: { athleteName: string; cycleName: string }) => void;
  onDeleteSession: (session: StrengthSessionTemplate) => void;
}

function AthletePlanDetail({
  athleteId,
  athleteName,
  athletes,
  onBack,
  onStartCreateSession,
  onStartEditSession,
  onDeleteSession,
}: AthletePlanDetailProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  /* ----- queries ----- */
  const { data: sessionFolders = [] } = useQuery({
    queryKey: ["strength_folders", "session", athleteId],
    queryFn: () => api.getStrengthFolders("session", { athleteId }),
  });

  const { data: allSessions = [] } = useQuery({
    queryKey: ["strength_catalog"],
    queryFn: () => api.getStrengthSessions(),
  });

  const rootFolders = useMemo(
    () => sessionFolders.filter((f) => !f.parent_id),
    [sessionFolders],
  );

  const subFoldersMap = useMemo(() => {
    const map = new Map<number, StrengthFolder[]>();
    for (const f of sessionFolders) {
      if (f.parent_id) {
        const arr = map.get(f.parent_id) ?? [];
        arr.push(f);
        map.set(f.parent_id, arr);
      }
    }
    return map;
  }, [sessionFolders]);

  const sessionsByFolder = useMemo(() => {
    const map = new Map<number, StrengthSessionTemplate[]>();
    for (const s of allSessions) {
      if (s.folder_id) {
        const arr = map.get(s.folder_id) ?? [];
        arr.push(s);
        map.set(s.folder_id, arr);
      }
    }
    return map;
  }, [allSessions]);

  /* ----- mutations ----- */
  const createFolder = useMutation({
    mutationFn: (args: { name: string; parentId?: number; athleteId?: number }) =>
      api.createStrengthFolder(args.name, "session", {
        parentId: args.parentId ?? null,
        athleteId: args.athleteId ?? null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["strength_folders"] });
      toast({ title: "Cycle créé" });
    },
  });

  const renameFolder = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) =>
      api.renameStrengthFolder(id, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["strength_folders"] });
      toast({ title: "Renommé" });
    },
  });

  const deleteFolderMut = useMutation({
    mutationFn: (id: number) => api.deleteStrengthFolder(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["strength_folders"] });
      queryClient.invalidateQueries({ queryKey: ["strength_catalog"] });
      queryClient.invalidateQueries({ queryKey: ["strength_catalog_paginated"] });
      toast({ title: "Cycle supprimé" });
    },
  });

  const [addSessionTarget, setAddSessionTarget] = useState<{
    folderId: number;
    cycleName: string;
    dayPrefix?: string;
  } | null>(null);

  const [copyDialog, setCopyDialog] = useState<{
    mode: "session" | "folder" | "plan";
    sourceId: number;
    sourceLabel: string;
  } | null>(null);

  const copyMutation = useMutation({
    mutationFn: async ({
      mode,
      sourceId,
      targetAthleteId,
    }: {
      mode: string;
      sourceId: number;
      targetAthleteId: number;
    }) => {
      if (mode === "session") {
        const targetFolders = await api.getStrengthFolders("session", {
          athleteId: targetAthleteId,
        });
        const rootFolder = targetFolders.find(
          (f) => f.athlete_id === targetAthleteId && !f.parent_id,
        );
        let targetFolderId: number | null = null;
        if (rootFolder) {
          const subs = targetFolders.filter((f) => f.parent_id === rootFolder.id);
          targetFolderId = subs[0]?.id ?? rootFolder.id;
        }
        await api.duplicateStrengthSession(sourceId, targetFolderId);
      } else if (mode === "folder") {
        await api.duplicateFolder(sourceId, targetAthleteId, null);
      } else if (mode === "plan") {
        await api.duplicateAthletePlan(sourceId, targetAthleteId);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["strength_folders"] });
      queryClient.invalidateQueries({ queryKey: ["strength_catalog"] });
      queryClient.invalidateQueries({ queryKey: ["strength_catalog_paginated"] });
      toast({ title: "Copie effectuée" });
      setCopyDialog(null);
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Copie échouée";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    },
  });

  const assignMutation = useMutation({
    mutationFn: async (sessionId: number) => {
      const today = new Date().toISOString().slice(0, 10);
      return api.assignments_create({
        assignment_type: "strength",
        session_id: sessionId,
        target_user_id: athleteId,
        scheduled_date: today,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assignments"] });
      toast({ title: "Séance assignée pour aujourd’hui" });
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Erreur";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    },
  });

  /* ----- render ----- */
  return (
    <div className="space-y-4">
      {/* Copy dialog */}
      {copyDialog && (
        <CopyToAthleteDialog
          open={!!copyDialog}
          onOpenChange={(open) => !open && setCopyDialog(null)}
          athletes={athletes}
          mode={copyDialog.mode}
          sourceLabel={copyDialog.sourceLabel}
          loading={copyMutation.isPending}
          onConfirm={(targetAthleteId) =>
            copyMutation.mutate({
              mode: copyDialog.mode,
              sourceId: copyDialog.sourceId,
              targetAthleteId,
            })
          }
        />
      )}

      {/* Breadcrumb */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        <span>Plans nageurs</span>
        <span className="text-muted-foreground/60">/</span>
        <span className="font-medium text-foreground">{athleteName}</span>
      </button>

      {/* Action bar */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="default"
          onClick={() => {
            if (rootFolders.length > 0) {
              createFolder.mutate({
                name: "Nouveau cycle",
                parentId: rootFolders[0].id,
              });
            } else {
              /* Create root plan folder first, then a cycle inside */
              createFolder.mutate({
                name: athleteName,
                athleteId,
              });
            }
          }}
        >
          <Plus className="h-4 w-4 mr-1.5" />
          Ajouter un cycle
        </Button>
        {rootFolders.length > 0 && (
          <Button
            variant="outline"
            size="default"
            onClick={() =>
              setCopyDialog({
                mode: "plan",
                sourceId: athleteId,
                sourceLabel: athleteName + " (plan complet)",
              })
            }
          >
            <Copy className="h-4 w-4 mr-1.5" />
            Copier le plan vers...
          </Button>
        )}
      </div>

      {/* No plan state */}
      {rootFolders.length === 0 && (
        <EmptyState
          compact
          icon={<Dumbbell />}
          title="Aucun plan pour ce nageur"
          cta={
            <Button
              variant="outline"
              onClick={() =>
                createFolder.mutate({
                  name: athleteName,
                  athleteId,
                })
              }
            >
              <Plus className="h-4 w-4 mr-2" />
              Créer un plan
            </Button>
          }
        />
      )}

      {/* Root folders / plans */}
      {rootFolders.map((root) => {
        const cycles = subFoldersMap.get(root.id) ?? [];
        const rootSessions = sessionsByFolder.get(root.id) ?? [];
        const totalCount = cycles.reduce(
          (sum, c) => sum + (sessionsByFolder.get(c.id)?.length ?? 0),
          rootSessions.length,
        );

        return (
          <div key={root.id} className="space-y-3">
            {/* Root plan header (if multiple roots, show name) */}
            {rootFolders.length > 1 && (
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <span>{root.name}</span>
                <span className="text-xs text-muted-foreground">({totalCount} séances)</span>
              </div>
            )}

            {/* Cycles */}
            {cycles.map((cycle, idx) => {
              const cycleSessions = sessionsByFolder.get(cycle.id) ?? [];
              const color = CYCLE_COLORS[idx % CYCLE_COLORS.length];
              return (
                <CycleCard
                  key={cycle.id}
                  cycle={cycle}
                  sessions={cycleSessions}
                  color={color}
                  onRename={(name) => renameFolder.mutate({ id: cycle.id, name })}
                  onDelete={() => deleteFolderMut.mutate(cycle.id)}
                  onCopy={() =>
                    setCopyDialog({
                      mode: "folder",
                      sourceId: cycle.id,
                      sourceLabel: cycle.name,
                    })
                  }
                  onAddSession={(dayPrefix) => setAddSessionTarget({ folderId: cycle.id, cycleName: cycle.name, dayPrefix })}
                  onEditSession={(s) => onStartEditSession(s, { athleteName, cycleName: cycle.name })}
                  onDeleteSession={onDeleteSession}
                  onCopySession={(s) =>
                    setCopyDialog({
                      mode: "session",
                      sourceId: s.id,
                      sourceLabel: s.title ?? "Sans titre",
                    })
                  }
                  onAssignSession={(s) => assignMutation.mutate(s.id)}
                  assignPending={assignMutation.isPending}
                />
              );
            })}

            {/* Sessions directly in root (no cycle) */}
            {rootSessions.length > 0 && (
              <div className="rounded-xl border border-border overflow-hidden">
                <div className="flex items-center gap-3 bg-muted/30 px-4 py-3">
                  <div className="w-1 h-6 rounded-full bg-gray-400" />
                  <span className="text-sm font-semibold flex-1">Non classé</span>
                  <span className="text-xs text-muted-foreground">
                    {rootSessions.length} séance{rootSessions.length > 1 ? "s" : ""}
                  </span>
                </div>
                <div className="divide-y divide-border">
                  {rootSessions.map((s) => (
                    <SessionRow
                      key={s.id}
                      session={s}
                      onEdit={() => onStartEditSession(s, { athleteName, cycleName: "Non classé" })}
                      onDelete={() => onDeleteSession(s)}
                      onCopy={() =>
                        setCopyDialog({
                          mode: "session",
                          sourceId: s.id,
                          sourceLabel: s.title ?? "Sans titre",
                        })
                      }
                      onAssign={() => assignMutation.mutate(s.id)}
                      assignPending={assignMutation.isPending}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Add cycle button within this root */}
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() =>
                createFolder.mutate({ name: "Nouveau cycle", parentId: root.id })
              }
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Ajouter un cycle
            </Button>
          </div>
        );
      })}

      {/* Add session picker sheet */}
      {addSessionTarget && (
        <AddSessionSheet
          open={!!addSessionTarget}
          onOpenChange={(open) => !open && setAddSessionTarget(null)}
          targetFolderId={addSessionTarget.folderId}
          cycleName={addSessionTarget.cycleName}
          athleteName={athleteName}
          dayPrefix={addSessionTarget.dayPrefix}
          onCreateNew={() => {
            onStartCreateSession(addSessionTarget.folderId, {
              athleteName,
              cycleName: addSessionTarget.cycleName,
            });
            setAddSessionTarget(null);
          }}
        />
      )}
    </div>
  );
}

/* ── Day slot definitions ── */
const WEEK_DAYS: { key: string; label: string; full: string; color: string }[] = [
  { key: "lun", label: "Lun", full: "Lundi", color: "bg-sky-500/15 text-sky-700" },
  { key: "mar", label: "Mar", full: "Mardi", color: "bg-emerald-500/15 text-emerald-700" },
  { key: "mer", label: "Mer", full: "Mercredi", color: "bg-amber-500/15 text-amber-700" },
  { key: "jeu", label: "Jeu", full: "Jeudi", color: "bg-violet-500/15 text-violet-700" },
  { key: "ven", label: "Ven", full: "Vendredi", color: "bg-orange-500/15 text-orange-700" },
  { key: "sam", label: "Sam", full: "Samedi", color: "bg-rose-500/15 text-rose-700" },
];

function matchDay(title: string | undefined | null): string | null {
  if (!title) return null;
  const t = title.trim().toLowerCase();
  for (const d of WEEK_DAYS) {
    if (t.startsWith(d.key)) return d.key;
  }
  return null;
}

function stripDayPrefix(title: string): string {
  return title.replace(/^(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s*[—–\-:]\s*/i, "").trim();
}

/* ================================================================
   CycleCard — day-slot based schedule view
   ================================================================ */
interface CycleCardProps {
  cycle: StrengthFolder;
  sessions: StrengthSessionTemplate[];
  color: string;
  onRename: (name: string) => void;
  onDelete: () => void;
  onCopy: () => void;
  onAddSession: (dayPrefix?: string) => void;
  onEditSession: (s: StrengthSessionTemplate) => void;
  onDeleteSession: (s: StrengthSessionTemplate) => void;
  onCopySession: (s: StrengthSessionTemplate) => void;
  onAssignSession: (s: StrengthSessionTemplate) => void;
  assignPending: boolean;
}

function CycleCard({
  cycle,
  sessions,
  color,
  onRename,
  onDelete,
  onCopy,
  onAddSession,
  onEditSession,
  onDeleteSession,
  onCopySession,
  onAssignSession,
  assignPending,
}: CycleCardProps) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(cycle.name);
  const [menuOpen, setMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commitRename = () => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== cycle.name) {
      onRename(trimmed);
    } else {
      setEditName(cycle.name);
    }
    setEditing(false);
  };

  // Map sessions to day slots
  const sessionsByDay = new Map<string, StrengthSessionTemplate>();
  const unslotted: StrengthSessionTemplate[] = [];
  for (const s of sessions) {
    const day = matchDay(s.title ?? s.name);
    if (day) {
      sessionsByDay.set(day, s);
    } else {
      unslotted.push(s);
    }
  }

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      {/* Cycle header */}
      <div className="flex items-center gap-3 bg-muted/30 px-4 py-3">
        <div className={cn("w-1 h-6 rounded-full", color)} />
        {editing ? (
          <Input
            ref={inputRef}
            className="h-7 text-sm rounded-lg flex-1"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") {
                setEditName(cycle.name);
                setEditing(false);
              }
            }}
            onBlur={commitRename}
          />
        ) : (
          <span className="text-sm font-semibold flex-1 truncate">{cycle.name}</span>
        )}
        {!editing && (
          <span className="text-xs text-muted-foreground">
            {sessions.length} séance{sessions.length !== 1 ? "s" : ""}
          </span>
        )}
        <Popover open={menuOpen} onOpenChange={setMenuOpen}>
          <PopoverTrigger asChild>
            <button className="h-8 w-8 shrink-0 inline-flex items-center justify-center rounded-full hover:bg-muted">
              <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-44 p-1">
            <button
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
              onClick={() => {
                setMenuOpen(false);
                setEditName(cycle.name);
                setEditing(true);
              }}
            >
              <Pencil className="h-4 w-4" />
              Renommer
            </button>
            <button
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
              onClick={() => {
                setMenuOpen(false);
                onCopy();
              }}
            >
              <Copy className="h-4 w-4" />
              Copier vers...
            </button>
            <button
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-destructive hover:bg-muted"
              onClick={() => {
                setMenuOpen(false);
                onDelete();
              }}
            >
              <Trash2 className="h-4 w-4" />
              Supprimer
            </button>
          </PopoverContent>
        </Popover>
      </div>

      {/* Day slots */}
      <div className="divide-y divide-border/50">
        {WEEK_DAYS.map((day) => {
          const session = sessionsByDay.get(day.key);
          return (
            <div key={day.key} className="flex items-center gap-2.5 px-3 py-2 min-h-[44px]">
              <span className={cn(
                "inline-flex items-center justify-center rounded-md px-1.5 py-0.5 text-[10px] font-bold shrink-0 w-[32px]",
                day.color,
              )}>
                {day.label}
              </span>
              {session ? (
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <button
                    type="button"
                    onClick={() => onEditSession(session)}
                    className="text-[13px] font-medium flex-1 truncate text-left hover:underline"
                  >
                    {stripDayPrefix(session.title ?? session.name ?? "Sans titre")}
                  </button>
                  <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                    {session.items?.length ?? 0} ex.
                  </span>
                  <button
                    type="button"
                    onClick={() => onAssignSession(session)}
                    disabled={assignPending}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full hover:bg-muted text-green-600 shrink-0"
                    aria-label="Assigner"
                  >
                    {assignPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <CalendarPlus className="h-3 w-3" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteSession(session)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full text-destructive hover:bg-destructive/10 shrink-0"
                    aria-label="Supprimer"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => onAddSession(day.full)}
                  className="flex items-center gap-1.5 text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                >
                  <Plus className="h-3 w-3" />
                  <span>Ajouter</span>
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Unslotted sessions (no day prefix) */}
      {unslotted.length > 0 && (
        <div className="border-t border-border divide-y divide-border/50">
          {unslotted.map((s) => (
            <SessionRow
              key={s.id}
              session={s}
              onEdit={() => onEditSession(s)}
              onDelete={() => onDeleteSession(s)}
              onCopy={() => onCopySession(s)}
              onAssign={() => onAssignSession(s)}
              assignPending={assignPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- day-of-week badge extraction ---------- */
const DAY_PATTERNS: [RegExp, string, string][] = [
  [/^lun/i, "Lun", "bg-blue-500/15 text-blue-700"],
  [/^mar/i, "Mar", "bg-green-500/15 text-green-700"],
  [/^mer/i, "Mer", "bg-amber-500/15 text-amber-700"],
  [/^jeu/i, "Jeu", "bg-violet-500/15 text-violet-700"],
  [/^ven/i, "Ven", "bg-orange-500/15 text-orange-700"],
  [/^sam/i, "Sam", "bg-red-500/15 text-red-700"],
  [/^dim/i, "Dim", "bg-gray-500/15 text-gray-700"],
];

function extractDayBadge(title: string | undefined | null): { label: string; color: string } | null {
  if (!title) return null;
  const trimmed = title.trim();
  for (const [pattern, label, color] of DAY_PATTERNS) {
    if (pattern.test(trimmed)) return { label, color };
  }
  return null;
}

/* ================================================================
   SessionRow — compact session row inside a cycle card
   ================================================================ */
interface SessionRowProps {
  session: StrengthSessionTemplate;
  onEdit: () => void;
  onDelete: () => void;
  onCopy: () => void;
  onAssign: () => void;
  assignPending: boolean;
}

function SessionRow({ session, onEdit, onDelete, onCopy, onAssign, assignPending }: SessionRowProps) {
  const itemCount = session.items?.length ?? 0;
  const dayBadge = extractDayBadge(session.title);

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/20 group">
      {dayBadge ? (
        <span className={cn("inline-flex items-center justify-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold shrink-0 w-8", dayBadge.color)}>
          {dayBadge.label}
        </span>
      ) : (
        <Dumbbell className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      )}
      <button
        type="button"
        onClick={onEdit}
        className="text-sm flex-1 truncate text-left hover:underline"
      >
        {session.title ?? "Sans titre"}
      </button>
      <span className="text-xs text-muted-foreground shrink-0">{itemCount} ex.</span>
      <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex h-7 w-7 items-center justify-center rounded-full hover:bg-muted"
          aria-label="Modifier"
        >
          <Edit2 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onAssign}
          disabled={assignPending}
          className="inline-flex h-7 w-7 items-center justify-center rounded-full hover:bg-muted text-green-600"
          aria-label="Assigner pour aujourd'hui"
          title="Assigner pour aujourd'hui"
        >
          {assignPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <CalendarPlus className="h-3.5 w-3.5" />
          )}
        </button>
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex h-7 w-7 items-center justify-center rounded-full hover:bg-muted"
          aria-label="Copier vers un nageur"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="inline-flex h-7 w-7 items-center justify-center rounded-full text-destructive hover:bg-destructive/10"
          aria-label="Supprimer"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export default AthletePlansTab;
