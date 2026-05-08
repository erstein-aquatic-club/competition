import React, { useEffect, useDeferredValue, useMemo, useState } from "react";
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  type Assignment,
  SwimSessionItem,
  SwimSessionTemplate,
  getAssignmentsForCoach,
  migrateLocalStorageArchive,
  createSwimSession,
  deleteSwimSession,
  archiveSwimSession,
  moveSwimSession,
} from "@/lib/api";
import type { SwimSessionInput, SwimPayloadFields } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { SwimSessionTimeline } from "@/components/swim/SwimSessionTimeline";
import { SessionListView } from "@/components/coach/shared/SessionListView";
import { SwimSessionBuilder } from "@/components/coach/swim/SwimSessionBuilder";
import { AlertCircle, Archive, FolderOpen, FolderPlus, Home, Layers, Loader2, Plus, Route, Search, Timer, Trash2, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useBeforeUnload } from "@/hooks/use-before-unload";
import { useAuth } from "@/lib/auth";
import { formatSwimSessionDefaultTitle } from "@/lib/date";
import { calculateSwimTotalDistance } from "@/lib/swimSessionUtils";
import { normalizeIntensityValue, normalizeEquipmentValue } from "@/lib/swimTextParser";
import type { SwimBlock, SwimExercise } from "@/lib/swimTextParser";
import { generateShareToken, getSwimCatalogFolders, createSwimCatalogFolder, deleteSwimCatalogFolder, renameSwimCatalogFolder, getSwimSessionsPaginated } from "@/lib/api/swim";
import type { SwimLibraryEntryContext } from "./swimLibraryEntryContext";

interface SwimSessionDraft {
  id: number | null;
  name: string;
  description: string;
  estimatedDuration: number;
  folder: string | null;
  blocks: SwimBlock[];
}

const buildItemsFromBlocks = (blocks: SwimBlock[]): SwimSessionItem[] => {
  let orderIndex = 0;
  return blocks.flatMap((block, blockIndex) =>
    block.exercises.map((exercise, exerciseIndex) => {
      const rawPayload = {
        block_title: block.title,
        block_description: block.description || null,
        block_order: blockIndex,
        block_repetitions: block.repetitions ?? null,
        block_modalities: block.modalities || null,
        block_equipment: block.equipment ?? [],
        exercise_repetitions: exercise.repetitions ?? null,
        exercise_rest: exercise.rest ?? null,
        exercise_rest_type: exercise.restType ?? "rest",
        exercise_stroke: exercise.stroke || null,
        exercise_stroke_type: exercise.strokeType || null,
        exercise_intensity: exercise.intensity ? normalizeIntensityValue(exercise.intensity) : null,
        exercise_modalities: exercise.modalities || null,
        exercise_equipment: exercise.equipment ?? [],
        exercise_order: exerciseIndex,
      };
      const exerciseLabel =
        exercise.repetitions && exercise.distance
          ? `${exercise.repetitions}x${exercise.distance}m`
          : exercise.distance
            ? `${exercise.distance}m`
            : null;
      return {
        ordre: orderIndex++,
        label: exerciseLabel,
        distance: exercise.distance ?? null,
        duration: null,
        intensity: exercise.intensity ? normalizeIntensityValue(exercise.intensity) : null,
        notes: exercise.modalities || null,
        raw_payload: rawPayload,
      } as SwimSessionItem;
    }),
  );
};

const buildBlocksFromItems = (items: SwimSessionItem[] = []): SwimBlock[] => {
  const blocksMap = new Map<string, SwimBlock & { order: number; exerciseOrder: Map<number, SwimExercise> }>();
  items.forEach((item) => {
    const payload = (item.raw_payload as SwimPayloadFields) ?? {};
    const blockTitle = payload.block_title || payload.section || "Bloc";
    const blockOrder = Number(payload.block_order ?? 0);
    const blockKey = `${blockOrder}-${blockTitle}`;
    const blockEquipmentRaw = payload.block_equipment ?? payload.equipment ?? [];
    const blockEquipment = (Array.isArray(blockEquipmentRaw) ? blockEquipmentRaw : String(blockEquipmentRaw).split(","))
      .map((entry) => String(entry))
      .map((entry) => normalizeEquipmentValue(entry))
      .filter(Boolean);
    if (!blocksMap.has(blockKey)) {
      blocksMap.set(blockKey, {
        title: blockTitle,
        repetitions: payload.block_repetitions ?? null,
        description: payload.block_description ?? "",
        modalities: payload.block_modalities ?? payload.modalities ?? "",
        equipment: blockEquipment,
        exercises: [],
        order: Number.isFinite(blockOrder) ? blockOrder : 0,
        exerciseOrder: new Map<number, SwimExercise>(),
      });
    }
    const block = blocksMap.get(blockKey)!;
    const exerciseOrder = Number(payload.exercise_order ?? item.ordre ?? block.exercises.length);
    const normalizedIntensity = normalizeIntensityValue(payload.exercise_intensity ?? item.intensity ?? "V1");
    block.exerciseOrder.set(exerciseOrder, {
      repetitions: payload.exercise_repetitions ?? null,
      distance: item.distance ?? null,
      rest: payload.exercise_rest ?? null,
      restType: (payload.exercise_rest_type as "departure" | "rest") ?? "rest",
      stroke: payload.exercise_stroke ?? payload.stroke ?? "crawl",
      strokeType: payload.exercise_stroke_type ?? (payload.stroke_type as string) ?? "nc",
      intensity: normalizedIntensity,
      modalities: payload.exercise_modalities ?? item.notes ?? "",
      equipment: Array.isArray(payload.exercise_equipment)
        ? payload.exercise_equipment.map((entry: string) => normalizeEquipmentValue(entry))
        : [],
    });
  });

  return Array.from(blocksMap.values())
    .sort((a, b) => a.order - b.order)
    .map((block) => ({
      title: block.title,
      repetitions: block.repetitions,
      description: block.description,
      modalities: block.modalities,
      equipment: block.equipment,
      exercises: Array.from(block.exerciseOrder.entries())
        .sort(([a], [b]) => a - b)
        .map(([, exercise]) => exercise),
    }));
};

const countBlocks = (items: SwimSessionItem[] = []) => {
  const keys = new Set(
    items.map((item) => {
      const raw = item.raw_payload as Record<string, unknown> | null;
      return raw?.block_title || raw?.section || "Bloc";
    }),
  );
  return keys.size;
};

const ARCHIVED_SWIM_SESSIONS_KEY = "swim_catalog_archived_ids";
const ARCHIVE_MIGRATED_KEY = "swim_catalog_archive_migrated";

export const canDeleteSwimCatalog = (sessionId: number, assignments: Assignment[] | null) => {
  if (assignments === null) return false;
  return !assignments.some(
    (assignment) => assignment.session_type === "swim" && assignment.session_id === sessionId,
  );
};

const getFolderDisplayName = (folderPath: string, parentFolder: string | null) => {
  if (parentFolder === null) return folderPath;
  return folderPath.slice(parentFolder.length + 1);
};

function formatSlotDateLabel(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
  });
}

function buildSlotLabel(context: SwimLibraryEntryContext["slot"]): string {
  return `${context.startTime.slice(0, 5)} · ${context.location}`;
}

function buildContextualSessionTitle(context: SwimLibraryEntryContext["slot"]): string {
  return `Séance du ${formatSlotDateLabel(context.scheduledDate)} - ${buildSlotLabel(context)}`;
}

type SwimCatalogProps = {
  entryContext?: SwimLibraryEntryContext | null;
  onEntryContextConsumed?: () => void;
};

export default function SwimCatalog({
  entryContext = null,
  onEntryContextConsumed,
}: SwimCatalogProps = {}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const userId = useAuth((s) => s.userId);
  const role = useAuth((s) => s.role);
  const [isCreating, setIsCreating] = useState(entryContext?.mode === "create");
  useBeforeUnload(isCreating);
  const [selectedSession, setSelectedSession] = useState<SwimSessionTemplate | null>(null);
  const [pendingDeleteSession, setPendingDeleteSession] = useState<SwimSessionTemplate | null>(null);
  const [pendingArchiveSession, setPendingArchiveSession] = useState<SwimSessionTemplate | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);

  // Folder navigation
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [showArchive, setShowArchive] = useState(false);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [pendingMoveSession, setPendingMoveSession] = useState<SwimSessionTemplate | null>(null);

  const createEmptySession = (
    context?: SwimLibraryEntryContext | null,
    folderOverride: string | null = currentFolder,
  ): SwimSessionDraft => ({
    id: null,
    name:
      context?.mode === "create"
        ? buildContextualSessionTitle(context.slot)
        : formatSwimSessionDefaultTitle(new Date()),
    description: "",
    estimatedDuration: 0,
    folder: folderOverride,
    blocks: [],
  });

  const [newSession, setNewSession] = useState<SwimSessionDraft>(() =>
    createEmptySession(entryContext?.mode === "create" ? entryContext : null),
  );

  const SWIM_PAGE_SIZE = 20;
  const {
    data: sessionPages,
    isLoading: sessionsLoading,
    error: sessionsError,
    refetch: refetchSessions,
    fetchNextPage: fetchNextSwimPage,
    hasNextPage: hasNextSwimPage,
    isFetchingNextPage: isFetchingNextSwimPage,
  } = useInfiniteQuery({
    queryKey: ["swim_catalog_paginated", deferredSearchQuery, currentFolder],
    queryFn: ({ pageParam = 0 }) =>
      getSwimSessionsPaginated({
        offset: pageParam,
        limit: SWIM_PAGE_SIZE,
        search: deferredSearchQuery || undefined,
        folder: currentFolder ?? undefined,
      }),
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.sessions.length < SWIM_PAGE_SIZE) return undefined;
      const loaded = allPages.reduce((sum, p) => sum + p.sessions.length, 0);
      return loaded < lastPage.total ? loaded : undefined;
    },
    initialPageParam: 0,
  });
  const sessions = sessionPages?.pages.flatMap((p) => p.sessions) ?? [];

  const { data: assignments, isLoading: assignmentsLoading, isError: assignmentsError, error: assignmentsErrorObj, refetch: refetchAssignments } = useQuery({
    queryKey: ["coach-assignments"],
    queryFn: () => getAssignmentsForCoach(),
    enabled: role === "coach" || role === "admin",
  });

  const { data: dbFolders } = useQuery({
    queryKey: ["swim_catalog_folders"],
    queryFn: getSwimCatalogFolders,
  });

  const createFolderMutation = useMutation({
    mutationFn: (path: string) => createSwimCatalogFolder(path),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["swim_catalog_folders"] }),
  });

  const deleteFolderMutation = useMutation({
    mutationFn: (path: string) => deleteSwimCatalogFolder(path),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["swim_catalog_folders"] });
      queryClient.invalidateQueries({ queryKey: ["swim_catalog_paginated"] });
      queryClient.invalidateQueries({ queryKey: ["swim_catalog"] });
      setCurrentFolder(null);
    },
  });

  // One-time migration: localStorage archived IDs → database is_archived
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(ARCHIVE_MIGRATED_KEY)) return;

    const raw = window.localStorage.getItem(ARCHIVED_SWIM_SESSIONS_KEY);
    if (!raw) {
      window.localStorage.setItem(ARCHIVE_MIGRATED_KEY, "true");
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const ids = parsed.map(Number).filter(Number.isFinite);
        migrateLocalStorageArchive(ids).then(() => {
          window.localStorage.removeItem(ARCHIVED_SWIM_SESSIONS_KEY);
          window.localStorage.setItem(ARCHIVE_MIGRATED_KEY, "true");
          queryClient.invalidateQueries({ queryKey: ["swim_catalog_paginated"] });
          queryClient.invalidateQueries({ queryKey: ["swim_catalog"] });
        }).catch(() => {
          // Will retry next load
        });
      } else {
        window.localStorage.removeItem(ARCHIVED_SWIM_SESSIONS_KEY);
        window.localStorage.setItem(ARCHIVE_MIGRATED_KEY, "true");
      }
    } catch {
      window.localStorage.removeItem(ARCHIVED_SWIM_SESSIONS_KEY);
      window.localStorage.setItem(ARCHIVE_MIGRATED_KEY, "true");
    }
  }, [queryClient]);

  // Derive folder structure from sessions + persisted DB folders
  const allFolders = useMemo(() => {
    const folderSet = new Set<string>();
    // Folders derived from session paths
    (sessions ?? []).forEach((s) => {
      if (s.folder) {
        const parts = s.folder.split("/");
        for (let i = 1; i <= parts.length; i++) {
          folderSet.add(parts.slice(0, i).join("/"));
        }
      }
    });
    // Persisted empty folders from DB
    (dbFolders ?? []).forEach((f) => {
      const parts = f.path.split("/");
      for (let i = 1; i <= parts.length; i++) {
        folderSet.add(parts.slice(0, i).join("/"));
      }
    });
    return Array.from(folderSet).sort();
  }, [sessions, dbFolders]);

  // Sub-folders of current folder
  const currentSubFolders = useMemo(() => {
    const prefix = currentFolder ? currentFolder + "/" : "";
    const subFolders = new Set<string>();
    allFolders.forEach((f) => {
      if (currentFolder === null) {
        if (!f.includes("/")) subFolders.add(f);
      } else if (f.startsWith(prefix)) {
        const remainder = f.slice(prefix.length);
        if (remainder && !remainder.includes("/")) {
          subFolders.add(f);
        }
      }
    });
    return Array.from(subFolders).sort();
  }, [allFolders, currentFolder]);

  // Session counts per sub-folder
  const folderSessionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    (sessions ?? []).filter((s) => !s.is_archived).forEach((s) => {
      if (s.folder) {
        currentSubFolders.forEach((sub) => {
          if (s.folder === sub || s.folder!.startsWith(sub + "/")) {
            counts[sub] = (counts[sub] ?? 0) + 1;
          }
        });
      }
    });
    return counts;
  }, [sessions, currentSubFolders]);

  const archivedCount = useMemo(
    () => (sessions ?? []).filter((s) => s.is_archived).length,
    [sessions],
  );

  // Filtered sessions — search & folder are already handled by the paginated RPC;
  // archive filter is still applied client-side.
  const visibleSessions = useMemo(() => {
    let filtered = sessions ?? [];

    if (showArchive) {
      filtered = filtered.filter((s) => s.is_archived);
    } else {
      filtered = filtered.filter((s) => !s.is_archived);
    }

    return filtered;
  }, [sessions, showArchive]);

  const createSession = useMutation({
    mutationFn: (data: SwimSessionInput) => createSwimSession(data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["swim_catalog_paginated"] });
      queryClient.invalidateQueries({ queryKey: ["swim_catalog"] });
      setIsCreating(false);
      setNewSession(createEmptySession());
      toast({
        title: variables?.id ? "Séance natation mise à jour" : "Séance natation créée",
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Erreur",
        description: err.message || "Impossible d'enregistrer la séance.",
        variant: "destructive",
      });
    },
  });

  const deleteSession = useMutation({
    mutationFn: (sessionId: number) => deleteSwimSession(sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["swim_catalog_paginated"] });
      queryClient.invalidateQueries({ queryKey: ["swim_catalog"] });
      setPendingDeleteSession(null);
      toast({ title: "Séance supprimée" });
    },
    onError: () => {
      toast({
        title: "Suppression impossible",
        description: "Cette séance est utilisée dans une assignation.",
        variant: "destructive",
      });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: ({ sessionId, archived }: { sessionId: number; archived: boolean }) =>
      archiveSwimSession(sessionId, archived),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["swim_catalog_paginated"] });
      queryClient.invalidateQueries({ queryKey: ["swim_catalog"] });
      setPendingArchiveSession(null);
      toast({
        title: variables.archived ? "Séance archivée" : "Séance restaurée",
      });
    },
  });

  const moveMutation = useMutation({
    mutationFn: ({ sessionId, folder }: { sessionId: number; folder: string | null }) =>
      moveSwimSession(sessionId, folder),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["swim_catalog_paginated"] });
      queryClient.invalidateQueries({ queryKey: ["swim_catalog"] });
      setPendingMoveSession(null);
      toast({ title: "Séance déplacée" });
    },
  });

  const handleSave = () => {
    if (!newSession.name.trim()) {
      toast({
        title: "Titre requis",
        description: "Ajoutez un nom de séance avant d'enregistrer.",
        variant: "destructive",
      });
      return;
    }
    createSession.mutate({
      id: newSession.id ?? undefined,
      name: newSession.name,
      description: newSession.description,
      estimated_duration: newSession.estimatedDuration || null,
      folder: newSession.folder ?? currentFolder,
      items: buildItemsFromBlocks(newSession.blocks),
      created_by: userId ?? null,
    });
  };

  const handleCancel = () => {
    setIsCreating(false);
    setNewSession(createEmptySession());
  };

  const handleEdit = (session: SwimSessionTemplate) => {
    setNewSession({
      id: session.id ?? null,
      name: session.name ?? formatSwimSessionDefaultTitle(new Date()),
      description: session.description ?? "",
      estimatedDuration: Number((session as { estimated_duration?: number }).estimated_duration ?? 0),
      folder: session.folder ?? null,
      blocks: buildBlocksFromItems(session.items ?? []),
    });
    setIsCreating(true);
  };

  useEffect(() => {
    if (!entryContext) return;

    if (entryContext.mode === "create") {
      setShowArchive(false);
      setCurrentFolder(null);
      setSelectedSession(null);
      setNewSession(createEmptySession(entryContext, null));
      setIsCreating(true);
      onEntryContextConsumed?.();
      return;
    }

    if (!sessions) return;

    const sessionToEdit = sessions.find(
      (session) => session.id === entryContext.swimCatalogId,
    );

    if (!sessionToEdit) {
      toast({
        title: "Séance introuvable",
        description: "La séance liée à ce créneau n'est plus disponible.",
        variant: "destructive",
      });
      onEntryContextConsumed?.();
      return;
    }

    setShowArchive(false);
    setCurrentFolder(sessionToEdit.folder ?? null);
    handleEdit(sessionToEdit);
    onEntryContextConsumed?.();
  }, [
    entryContext,
    sessions,
    onEntryContextConsumed,
    toast,
  ]);

  const handleArchive = (session: SwimSessionTemplate) => {
    setPendingArchiveSession(session);
  };

  const handleArchiveConfirm = () => {
    if (!pendingArchiveSession) return;
    archiveMutation.mutate({ sessionId: pendingArchiveSession.id, archived: true });
  };

  const handleRestore = (session: SwimSessionTemplate) => {
    archiveMutation.mutate({ sessionId: session.id, archived: false });
  };

  const handleDelete = (session: SwimSessionTemplate) => {
    setPendingDeleteSession(session);
  };

  const handleDeleteConfirm = () => {
    if (!pendingDeleteSession) return;
    deleteSession.mutate(pendingDeleteSession.id);
  };

  const handleCreateFolder = () => {
    const trimmed = newFolderName.trim();
    if (!trimmed) return;
    const path = currentFolder ? `${currentFolder}/${trimmed}` : trimmed;
    createFolderMutation.mutate(path, {
      onSuccess: () => setCurrentFolder(path),
    });
    setShowCreateFolder(false);
    setNewFolderName("");
  };

  const handleMoveToFolder = (folder: string | null) => {
    if (!pendingMoveSession) return;
    if (folder !== null && !allFolders.includes(folder)) {
      toast({
        title: "Dossier introuvable",
        description: "Ce dossier a été supprimé entre-temps. Rafraîchissez la page.",
        variant: "destructive",
      });
      setPendingMoveSession(null);
      return;
    }
    moveMutation.mutate({ sessionId: pendingMoveSession.id, folder });
  };

  /** Parse "Séance du DD/MM - Créneau" or "Séance du DD/MM/YYYY - Créneau" into structured parts */
  const parseSessionTitle = (name: string) => {
    const match = name.match(/^Séance du (\d{2}\/\d{2}(?:\/\d{4})?) - (.+)$/);
    if (match) return { date: match[1], creneau: match[2] };
    return null;
  };

  const renderTitle = (session: SwimSessionTemplate) => {
    const parsed = parseSessionTitle(session.name);
    if (!parsed) return session.name;
    return (
      <span className="flex items-baseline gap-1.5">
        <span>{parsed.date}</span>
        <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {parsed.creneau}
        </span>
      </span>
    );
  };

  const renderMetrics = (session: SwimSessionTemplate) => {
    const totalDistance = calculateSwimTotalDistance(session.items ?? []);
    const blockCount = countBlocks(session.items ?? []);
    return (
      <>
        <span className="inline-flex items-center gap-1">
          <Route className="h-3 w-3" />
          {totalDistance > 0 ? `${totalDistance}m` : "—"}
        </span>
        <span className="inline-flex items-center gap-1">
          <Layers className="h-3 w-3" />
          {blockCount} bloc{blockCount > 1 ? "s" : ""}
        </span>
      </>
    );
  };

  if (isCreating) {
    return (
      <SwimSessionBuilder
        session={newSession}
        onSessionChange={setNewSession}
        onSave={handleSave}
        onCancel={handleCancel}
        userId={userId}
        isSaving={createSession.isPending}
      />
    );
  }

  if (sessionsLoading || assignmentsLoading) {
    return (
      <div>
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <Skeleton className="h-5 w-16 mb-1" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="h-9 w-24 rounded-full" />
        </div>

        <div className="p-4">
          <Skeleton className="h-10 w-full rounded-2xl mb-4" />
          <SessionListView
            sessions={[]}
            isLoading={true}
            renderTitle={() => ""}
            renderMetrics={() => null}
            onPreview={() => {}}
            onEdit={() => {}}
            onArchive={() => {}}
            onDelete={() => {}}
            canDelete={() => false}
          />
        </div>
      </div>
    );
  }

  if (sessionsError) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h3 className="font-semibold">Impossible de charger les données</h3>
        <p className="text-sm text-muted-foreground mt-2">
          {sessionsError instanceof Error ? sessionsError.message : "Une erreur s'est produite"}
        </p>
        <Button variant="default" onClick={() => refetchSessions()} className="mt-4 h-12 md:h-10">
          Réessayer
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <div className="text-base font-semibold">Coach</div>
          <div className="text-xs text-muted-foreground">Création</div>
        </div>
        {!showArchive && (
          <button
            type="button"
            onClick={() => {
              setNewSession(createEmptySession());
              setIsCreating(true);
            }}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
          >
            <Plus className="h-4 w-4" /> Nouvelle
          </button>
        )}
      </div>

      <div className="p-4">
        {/* Breadcrumb navigation */}
        {(currentFolder !== null || showArchive) && (
          <Breadcrumb className="mb-3">
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink
                  className="cursor-pointer py-2 px-1"
                  onClick={() => { setCurrentFolder(null); setShowArchive(false); }}
                >
                  <Home className="h-4 w-4" />
                </BreadcrumbLink>
              </BreadcrumbItem>
              {showArchive ? (
                <>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage>Archives</BreadcrumbPage>
                  </BreadcrumbItem>
                </>
              ) : (
                currentFolder?.split("/").map((part, index, parts) => (
                  <React.Fragment key={index}>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      {index === parts.length - 1 ? (
                        <BreadcrumbPage>{part}</BreadcrumbPage>
                      ) : (
                        <BreadcrumbLink
                          className="cursor-pointer py-2 px-1"
                          onClick={() => setCurrentFolder(parts.slice(0, index + 1).join("/"))}
                        >
                          {part}
                        </BreadcrumbLink>
                      )}
                    </BreadcrumbItem>
                  </React.Fragment>
                ))
              )}
            </BreadcrumbList>
          </Breadcrumb>
        )}

        {/* Search */}
        <div className="flex items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="relative flex-1">
            <input
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground pr-7"
              placeholder="Rechercher une séance"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-0 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                aria-label="Effacer la recherche"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Folder chips + Archive link */}
        {!showArchive && (
          <div className="mt-3 flex flex-wrap gap-2">
            {currentSubFolders.map((folderPath) => (
              <button
                key={folderPath}
                type="button"
                onClick={() => setCurrentFolder(folderPath)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
              >
                <FolderOpen className="h-4 w-4 text-muted-foreground" />
                {getFolderDisplayName(folderPath, currentFolder)}
                <span className="text-xs text-muted-foreground">
                  ({folderSessionCounts[folderPath] ?? 0})
                </span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => setShowCreateFolder(true)}
              disabled={createFolderMutation.isPending}
              className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {createFolderMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderPlus className="h-4 w-4" />}
              Nouveau dossier
            </button>
            {currentFolder !== null && visibleSessions.length === 0 && currentSubFolders.length === 0 && (
              <button
                type="button"
                onClick={() => deleteFolderMutation.mutate(currentFolder)}
                disabled={deleteFolderMutation.isPending}
                className="inline-flex items-center gap-1.5 rounded-xl border border-destructive/30 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleteFolderMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {deleteFolderMutation.isPending ? "Suppression..." : "Supprimer ce dossier"}
              </button>
            )}
            {currentFolder === null && archivedCount > 0 && (
              <button
                type="button"
                onClick={() => setShowArchive(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-muted/50 px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted transition-colors"
              >
                <Archive className="h-4 w-4" />
                Archives
                <span className="text-xs">({archivedCount})</span>
              </button>
            )}
          </div>
        )}

        {assignmentsError && (
          <div className="mt-4 flex flex-col items-center rounded-lg border border-destructive/20 bg-destructive/10 p-4">
            <AlertCircle className="h-8 w-8 text-destructive mb-2" />
            <p className="text-sm text-destructive font-semibold">Impossible de charger les assignations</p>
            <p className="text-xs text-destructive/80 mt-1">
              {assignmentsErrorObj instanceof Error ? assignmentsErrorObj.message : "Une erreur s'est produite"}
            </p>
            <Button variant="outline" size="sm" onClick={() => refetchAssignments()} className="mt-2 h-10">
              Réessayer
            </Button>
          </div>
        )}

        <div className="mt-4">
          {showArchive && !sessionsLoading && visibleSessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Archive className="h-10 w-10 mb-3 opacity-40" />
              <p className="text-sm">Aucune séance archivée</p>
            </div>
          ) : (
          <SessionListView
            sessions={visibleSessions}
            isLoading={sessionsLoading}
            error={sessionsError}
            renderTitle={renderTitle}
            renderMetrics={renderMetrics}
            onPreview={setSelectedSession}
            onEdit={handleEdit}
            onArchive={showArchive ? handleRestore : handleArchive}
            onDelete={handleDelete}
            canDelete={(sessionId) => canDeleteSwimCatalog(sessionId, assignments ?? null)}
            isDeleting={deleteSession.isPending}
            onMove={showArchive ? undefined : (session) => setPendingMoveSession(session)}
            buildSharePayload={
              showArchive
                ? undefined
                : async (session: SwimSessionTemplate) => {
                    const token = await generateShareToken(session.id);
                    const url = `${window.location.origin}${window.location.pathname}#/s/${token}`;
                    return { url, title: session.name };
                  }
            }
            archiveMode={showArchive ? "restore" : "archive"}
          />
          )}
          {hasNextSwimPage && (
            <Button
              variant="outline"
              className="w-full mt-4"
              onClick={() => fetchNextSwimPage()}
              disabled={isFetchingNextSwimPage}
            >
              {isFetchingNextSwimPage ? "Chargement..." : "Charger plus"}
            </Button>
          )}
        </div>

        <div className="h-8" />
      </div>

      {/* Preview dialog */}
      <Dialog
        open={Boolean(selectedSession)}
        onOpenChange={(open) => {
          if (!open) setSelectedSession(null);
        }}
      >
        <DialogContent className="max-w-4xl">
          <div className="pb-2">
            <span className="text-lg font-semibold tracking-tight">
              {selectedSession?.name}
            </span>
          </div>
          <SwimSessionTimeline
            title={selectedSession?.name ?? ""}
            description={selectedSession?.description ?? undefined}
            items={selectedSession?.items}
          />
        </DialogContent>
      </Dialog>

      {/* Create folder dialog */}
      <Dialog open={showCreateFolder} onOpenChange={setShowCreateFolder}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouveau dossier</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Nom du dossier"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleCreateFolder(); }}
              className="rounded-2xl"
            />
            {newFolderName.trim() && (
              <p className="text-xs text-muted-foreground">
                Chemin : {currentFolder ? `${currentFolder}/${newFolderName.trim()}` : newFolderName.trim()}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setShowCreateFolder(false); setNewFolderName(""); }}>
                Annuler
              </Button>
              <Button onClick={handleCreateFolder} disabled={!newFolderName.trim()}>
                Créer
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Move to folder dialog */}
      <Dialog
        open={Boolean(pendingMoveSession)}
        onOpenChange={(open) => { if (!open) setPendingMoveSession(null); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Déplacer « {pendingMoveSession?.name} »</DialogTitle>
          </DialogHeader>
          <div className="space-y-1">
            <button
              type="button"
              onClick={() => handleMoveToFolder(null)}
              className={`w-full rounded-xl px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-muted ${
                !pendingMoveSession?.folder ? "bg-muted text-foreground" : "text-muted-foreground"
              }`}
            >
              <Home className="mr-2 inline h-4 w-4" />
              Racine
            </button>
            {allFolders.map((folder) => (
              <button
                key={folder}
                type="button"
                onClick={() => handleMoveToFolder(folder)}
                className={`w-full rounded-xl px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-muted ${
                  pendingMoveSession?.folder === folder ? "bg-muted text-foreground" : "text-muted-foreground"
                }`}
              >
                <FolderOpen className="mr-2 inline h-4 w-4" />
                {folder}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Archive confirmation dialog */}
      <AlertDialog
        open={Boolean(pendingArchiveSession)}
        onOpenChange={(open) => {
          if (!open) setPendingArchiveSession(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archiver la séance ?</AlertDialogTitle>
            <AlertDialogDescription>
              La séance sera déplacée dans les archives. Vous pourrez la restaurer à tout moment.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleArchiveConfirm}>
              Archiver
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation dialog */}
      <AlertDialog
        open={Boolean(pendingDeleteSession)}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteSession(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer la séance ?</AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                if (!pendingDeleteSession || !assignments) {
                  return "Cette action est définitive. La séance sera supprimée du catalogue.";
                }
                const assignedCount = assignments.filter(
                  (a) => a.session_type === "swim" && a.session_id === pendingDeleteSession.id
                ).length;
                if (assignedCount > 0) {
                  return `Cette séance est assignée à ${assignedCount} créneau${assignedCount > 1 ? "x" : ""}. La suppression annulera ces assignations. Continuer ?`;
                }
                return "Cette action est définitive. La séance sera supprimée du catalogue.";
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm}>
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
