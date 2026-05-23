import { Suspense, useEffect, useMemo, useState } from "react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { lazyWithRetry } from "@/lib/lazyWithRetry";
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  type Exercise,
  type StrengthCycleType,
  type StrengthSessionItem,
  type StrengthSessionTemplate,
  getExercises,
  getAthletes,
  getStrengthFolders,
  createExercise as createExerciseApi,
  createStrengthSession,
  assignments_create,
  updateExercise as updateExerciseApi,
  deleteExercise as deleteExerciseApi,
  deleteStrengthSession,
  updateStrengthSession,
  persistStrengthSessionOrder,
  createStrengthFolder,
  renameStrengthFolder,
  deleteStrengthFolder,
  moveToFolder,
  duplicateStrengthSession,
  duplicateFolder,
  duplicateAthletePlan,
  getStrengthSessionsPaginated,
  getStrengthSessionForEdit,
} from "@/lib/api";
import type { AthleteSummary } from "@/lib/api/types";
import type { StrengthSessionInput } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { INTENSITY_METRICS, type IntensityMetric } from "@/lib/strength/intensityMetrics";
import { AlertCircle, Plus, Edit2, Search, Dumbbell, Camera, Loader2, Trash2, FolderPlus, Copy, MoreHorizontal, Pencil, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { useDelayedLoading } from "@/hooks/useDelayedLoading";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StrengthSessionBuilder } from "@/components/coach/strength/StrengthSessionBuilder";
import { SessionListView } from "@/components/coach/shared/SessionListView";
import { FolderCard } from "@/components/shared/FolderCard";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { MoveToFolderPopover } from "@/components/coach/strength/MoveToFolderPopover";
// Lazy-loaded children : ne sont rendus qu'à l'ouverture de modals/sheets
// ou via un onglet (TabsContent). Évite ~1100 LOC dans le bundle initial du wrapper.
const CopyToAthleteDialog = lazyWithRetry(
  () => import("@/components/coach/strength/CopyToAthleteDialog"),
);
// §276.1 — AthletePlansTab legacy import retiré (plus exposé via biblio).
// Le composant reste sur disque mais n'est référencé nulle part au runtime.
const TrainingPlansBrowser = lazyWithRetry(
  () => import("@/components/coach/strength/TrainingPlansBrowser"),
);
const MediaSourceSheet = lazyWithRetry(
  () => import("@/components/coach/strength/MediaSourceSheet"),
);

type ExerciseDraft = Omit<Exercise, "id"> & {
  id?: number;
  description?: string | null;
  illustration_gif?: string | null;
};

const cycleTabs = [
  { key: "endurance", label: "Endurance", fieldSuffix: "endurance" },
  { key: "hypertrophie", label: "Hypertrophie", fieldSuffix: "hypertrophie" },
  { key: "force", label: "Force", fieldSuffix: "force" },
] as const;

const normalizeStrengthCycle = (value?: string | null): StrengthCycleType => {
  if (value === "endurance" || value === "hypertrophie" || value === "force") {
    return value;
  }
  return "endurance";
};

const ExerciseCycleTabs = ({
  exercise,
  onChange,
  disabled = false,
}: {
  exercise: ExerciseDraft;
  onChange: (updates: Partial<ExerciseDraft>) => void;
  disabled?: boolean;
}) => (
  <Tabs defaultValue="endurance" className="w-full">
    <TabsList className="grid w-full grid-cols-3">
      {cycleTabs.map((tab) => (
        <TabsTrigger key={tab.key} value={tab.key}>
          {tab.label}
        </TabsTrigger>
      ))}
    </TabsList>
    {cycleTabs.map((tab) => {
      const pctField = `pct_1rm_${tab.fieldSuffix}` as keyof ExerciseDraft;
      const seriesField = `Nb_series_${tab.fieldSuffix}` as keyof ExerciseDraft;
      const repsField = `Nb_reps_${tab.fieldSuffix}` as keyof ExerciseDraft;
      const recupField = `recup_${tab.fieldSuffix}` as keyof ExerciseDraft;
      const recupExField = `recup_exercices_${tab.fieldSuffix}` as keyof ExerciseDraft;
      return (
        <TabsContent
          key={tab.key}
          value={tab.key}
          className={`space-y-3 rounded-lg border p-3 ${disabled ? "opacity-60" : ""}`}
        >
          <p className="text-sm font-semibold">{tab.label}</p>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label>% 1RM</Label>
              <Input
                type="number"
                value={(exercise[pctField] as number | null | undefined) ?? ""}
                disabled={disabled}
                onChange={(e) =>
                  onChange({ [pctField]: e.target.value === "" ? null : Number(e.target.value) } as Partial<ExerciseDraft>)
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Nb séries</Label>
              <Input
                type="number"
                value={(exercise[seriesField] as number | null | undefined) ?? ""}
                disabled={disabled}
                onChange={(e) =>
                  onChange({ [seriesField]: e.target.value === "" ? null : Number(e.target.value) } as Partial<ExerciseDraft>)
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Nb reps</Label>
              <Input
                type="number"
                value={(exercise[repsField] as number | null | undefined) ?? ""}
                disabled={disabled}
                onChange={(e) =>
                  onChange({ [repsField]: e.target.value === "" ? null : Number(e.target.value) } as Partial<ExerciseDraft>)
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Récup. séries (s)</Label>
              <Input
                type="number"
                value={(exercise[recupField] as number | null | undefined) ?? ""}
                disabled={disabled}
                onChange={(e) =>
                  onChange({ [recupField]: e.target.value === "" ? null : Number(e.target.value) } as Partial<ExerciseDraft>)
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Récup. exercices (s)</Label>
              <Input
                type="number"
                value={(exercise[recupExField] as number | null | undefined) ?? ""}
                disabled={disabled}
                onChange={(e) =>
                  onChange({ [recupExField]: e.target.value === "" ? null : Number(e.target.value) } as Partial<ExerciseDraft>)
                }
              />
            </div>
          </div>
        </TabsContent>
      );
    })}
  </Tabs>
);

const defaultExerciseValues = {
  pct_1rm_endurance: 60,
  pct_1rm_hypertrophie: 75,
  pct_1rm_force: 85,
  Nb_series_endurance: 4,
  Nb_series_hypertrophie: 3,
  Nb_series_force: 3,
  Nb_reps_endurance: 16,
  Nb_reps_hypertrophie: 8,
  Nb_reps_force: 3,
  recup_endurance: 120,
  recup_hypertrophie: 200,
  recup_force: 300,
  recup_exercices_endurance: 300,
  recup_exercices_hypertrophie: 400,
  recup_exercices_force: 500,
};

const resolveExerciseNumber = (value?: number | null) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

export const createStrengthItemFromExercise = (
  exercise: Exercise,
  cycle: StrengthCycleType,
  orderIndex: number,
  existing?: StrengthSessionItem,
): StrengthSessionItem => {
  const cycleSuffix = cycle === "force" ? "force" : cycle === "hypertrophie" ? "hypertrophie" : "endurance";
  const setsField = `Nb_series_${cycleSuffix}` as const;
  const repsField = `Nb_reps_${cycleSuffix}` as const;
  const percentField = `pct_1rm_${cycleSuffix}` as const;
  const restField = `recup_${cycleSuffix}` as const;
  return {
    exercise_id: exercise.id,
    order_index: orderIndex,
    sets: resolveExerciseNumber(exercise[setsField]),
    reps: resolveExerciseNumber(exercise[repsField]),
    rest_seconds: resolveExerciseNumber(exercise[restField]),
    percent_1rm: resolveExerciseNumber(exercise[percentField]),
    cycle_type: cycle,
    notes: existing?.notes ?? "",
  };
};

const createDefaultExercise = (): ExerciseDraft => ({
  nom_exercice: "",
  description: null,
  illustration_gif: null,
  exercise_type: "strength",
  warmup_reps: null,
  warmup_duration: null,
  ...defaultExerciseValues,
});

const WarmupFields = ({
  exercise,
  warmupMode,
  onChange,
  onWarmupModeChange,
  idPrefix,
}: {
  exercise: ExerciseDraft;
  warmupMode: "reps" | "duration";
  onChange: (updates: Partial<ExerciseDraft>) => void;
  onWarmupModeChange: (mode: "reps" | "duration") => void;
  idPrefix: string;
}) => {
  return (
    <div className="space-y-3 rounded-lg border p-3">
      <p className="text-sm font-semibold">Paramètres d'échauffement</p>
      <RadioGroup
        value={warmupMode}
        onValueChange={(value) => {
          const mode = value === "duration" ? "duration" : "reps";
          onWarmupModeChange(mode);
          if (value === "duration") {
            onChange({
              warmup_reps: null,
              warmup_duration: exercise.warmup_duration ?? 0,
            });
          } else {
            onChange({
              warmup_duration: null,
              warmup_reps: exercise.warmup_reps ?? 0,
            });
          }
        }}
        className="grid gap-2"
      >
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="reps" id={`${idPrefix}-warmup-reps`} />
          <Label htmlFor={`${idPrefix}-warmup-reps`}>Nombre de répétitions</Label>
        </div>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="duration" id={`${idPrefix}-warmup-duration`} />
          <Label htmlFor={`${idPrefix}-warmup-duration`}>Durée (secondes)</Label>
        </div>
      </RadioGroup>
      {warmupMode === "duration" ? (
        <div className="space-y-2">
          <Label>Durée (s)</Label>
          <Input
            type="number"
            value={exercise.warmup_duration ?? ""}
            onChange={(e) =>
              onChange({
                warmup_duration: e.target.value === "" ? null : Number(e.target.value),
              })
            }
          />
        </div>
      ) : (
        <div className="space-y-2">
          <Label>Nombre de répétitions</Label>
          <Input
            type="number"
            value={exercise.warmup_reps ?? ""}
            onChange={(e) =>
              onChange({
                warmup_reps: e.target.value === "" ? null : Number(e.target.value),
              })
            }
          />
        </div>
      )}
    </div>
  );
};

function FolderDropdown({
  name,
  onRename,
  onDelete,
}: {
  name: string;
  onRename: (newName: string) => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-muted"
          aria-label="Actions dossier"
        >
          <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem onClick={() => {
          const newName = window.prompt("Renommer le dossier", name);
          if (newName?.trim() && newName.trim() !== name) {
            onRename(newName.trim());
          }
        }}>
          <Pencil className="h-4 w-4" />
          Renommer
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
          <Trash2 className="h-4 w-4" />
          Supprimer
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AssignAthleteSelect({
  athletes,
  value,
  onChange,
}: {
  athletes: AthleteSummary[];
  value: number | null;
  onChange: (id: number | null) => void;
}) {
  return (
    <Select
      value={value != null ? String(value) : ""}
      onValueChange={(v) => onChange(v ? Number(v) : null)}
    >
      <SelectTrigger>
        <SelectValue placeholder="Choisir un nageur" />
      </SelectTrigger>
      <SelectContent>
        {athletes.filter((a) => a.id != null).map((a) => (
          <SelectItem key={a.id} value={String(a.id)}>
            {a.display_name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default function StrengthCatalog() {
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);
  const [planCreationContext, setPlanCreationContext] = useState<{
    athleteName: string;
    cycleName: string;
  } | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<number | null>(null);
  const [exerciseDialogOpen, setExerciseDialogOpen] = useState(false);
  const [exerciseEditOpen, setExerciseEditOpen] = useState(false);
  const [editingExercise, setEditingExercise] = useState<ExerciseDraft | null>(null);
  const [pendingDeleteSession, setPendingDeleteSession] = useState<StrengthSessionTemplate | null>(null);
  const [pendingDeleteExercise, setPendingDeleteExercise] = useState<Exercise | null>(null);
  const [newWarmupMode, setNewWarmupMode] = useState<"reps" | "duration">("reps");
  const [editWarmupMode, setEditWarmupMode] = useState<"reps" | "duration">("reps");
  const [gifUploading, setGifUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 200);
  const [catalogTab, setCatalogTab] = useState<"sessions" | "plans" | "exercises">("sessions");
  const [planSelectedAthleteId, setPlanSelectedAthleteId] = useState<number | null>(null);
  const [enlargedGif, setEnlargedGif] = useState<{ url: string; name: string } | null>(null);
  const [mediaSheetTarget, setMediaSheetTarget] = useState<"edit" | "create" | null>(null);
  const [copyDialog, setCopyDialog] = useState<{
    mode: "session" | "folder" | "plan";
    sourceId: number;
    sourceLabel: string;
  } | null>(null);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assignTargetAthleteId, setAssignTargetAthleteId] = useState<number | null>(null);
  const [assignAfterSaveId, setAssignAfterSaveId] = useState<number | null>(null);
  const [showCreateFolderDialog, setShowCreateFolderDialog] = useState(false);
  const [newStrengthFolderName, setNewStrengthFolderName] = useState("");

  const handleGifUpload = async (media: File | Blob, isGif: boolean, setter: (url: string) => void) => {
    const maxSize = 10 * 1024 * 1024;
    if (media.size > maxSize) {
      toast.error("Fichier trop volumineux", { description: "La taille maximale est de 10 Mo." });
      return;
    }
    setGifUploading(true);
    try {
      const ext = isGif ? "gif" : (media instanceof File ? (media.name.split(".").pop() ?? "gif") : "gif");
      const path = `exercises/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("exercise-gifs").upload(path, media, { upsert: false });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("exercise-gifs").getPublicUrl(path);
      setter(urlData.publicUrl);
      toast("Illustration uploadée");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Réessayez.";
      toast.error("Erreur d'upload", { description: message });
    } finally {
      setGifUploading(false);
    }
  };

  const [newSession, setNewSession] = useState<{
    title: string;
    description: string;
    cycle: StrengthCycleType;
    items: StrengthSessionItem[];
    folder_id?: number | null;
  }>({
    title: "",
    description: "",
    cycle: "endurance",
    items: [],
    folder_id: null,
  });

  const [newExercise, setNewExercise] = useState<ExerciseDraft>({
    ...createDefaultExercise(),
  });

  useEffect(() => {
    if (editingExercise) {
      setEditWarmupMode(editingExercise.warmup_duration != null ? "duration" : "reps");
    }
  }, [editingExercise]);

  const { data: exercises, isLoading: isLoadingExercises, error: exercisesError, refetch: refetchExercises } = useQuery({
    queryKey: ["exercises"],
    queryFn: () => getExercises()
  });

  const STRENGTH_PAGE_SIZE = 20;
  const {
    data: sessionPages,
    isLoading: isLoadingSessions,
    error: sessionsError,
    refetch: refetchSessions,
    fetchNextPage: fetchNextStrengthPage,
    hasNextPage: hasNextStrengthPage,
    isFetchingNextPage: isFetchingNextStrengthPage,
  } = useInfiniteQuery({
    queryKey: ["strength_catalog_paginated", debouncedSearchQuery],
    queryFn: ({ pageParam = 0 }) =>
      getStrengthSessionsPaginated({
        offset: pageParam,
        limit: STRENGTH_PAGE_SIZE,
        search: debouncedSearchQuery || undefined,
      }),
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.sessions.length < STRENGTH_PAGE_SIZE) return undefined;
      const loaded = allPages.reduce((sum, p) => sum + p.sessions.length, 0);
      return loaded < lastPage.total ? loaded : undefined;
    },
    initialPageParam: 0,
  });
  const sessions = sessionPages?.pages.flatMap((p) => p.sessions) ?? [];

  const { showSlowToast: showCatalogSlowToast } = useDelayedLoading(isLoadingExercises || isLoadingSessions);
  useEffect(() => {
    if (showCatalogSlowToast) {
      toast("Ça prend du temps…", { description: "Le chargement du catalogue musculation prend plus de temps que prévu." });
    }
  }, [showCatalogSlowToast]);

  const { data: athletes = [] } = useQuery({
    queryKey: ["athletes"],
    queryFn: () => getAthletes(),
  });

  const { data: sessionFolders = [] } = useQuery({
    queryKey: ["strength_folders", "session", null],
    queryFn: () => getStrengthFolders("session", { athleteId: null }),
  });

  const { data: exerciseFolders } = useQuery({
    queryKey: ["strength_folders", "exercise"],
    queryFn: () => getStrengthFolders("exercise"),
  });

  const renderSessionMetrics = (session: StrengthSessionTemplate) => {
    const totalSets = session.items?.reduce((sum, item) => sum + (item.sets || 0), 0) ?? 0;
    return (
      <>
        <span className="capitalize">{session.cycle}</span>
        <span>·</span>
        <span>{session.items?.length ?? 0} exos</span>
        <span>·</span>
        <span>{totalSets} séries</span>
      </>
    );
  };

  // Search filtering is now handled server-side by the paginated RPC
  const filteredSessions = sessions;

  const unfiledSessions = filteredSessions.filter((s) => !s.folder_id);

  const sessionsByFolder = useMemo(() => {
    const map = new Map<number, typeof filteredSessions>();
    for (const s of filteredSessions) {
      if (s.folder_id) {
        const arr = map.get(s.folder_id) ?? [];
        arr.push(s);
        map.set(s.folder_id, arr);
      }
    }
    return map;
  }, [filteredSessions]);

  const unfiledExercises = useMemo(() =>
    (exercises ?? []).filter((ex) => !ex.folder_id),
    [exercises]
  );

  const exercisesByFolder = useMemo(() => {
    const map = new Map<number, Exercise[]>();
    for (const ex of (exercises ?? [])) {
      if (ex.folder_id) {
        const arr = map.get(ex.folder_id) ?? [];
        arr.push(ex);
        map.set(ex.folder_id, arr);
      }
    }
    return map;
  }, [exercises]);

  const createExercise = useMutation({
    mutationFn: (data: Omit<Exercise, "id">) => createExerciseApi(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exercises"] });
      setExerciseDialogOpen(false);
      toast("Exercice ajouté");
    },
  });

  const createSession = useMutation({
    mutationFn: (data: StrengthSessionInput) => createStrengthSession(data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["strength_catalog_paginated"] });
      queryClient.invalidateQueries({ queryKey: ["strength_catalog"] });
      setIsCreating(false);
      setNewSession({ title: "", description: "", cycle: "endurance", items: [], folder_id: null });
      const afterSaveId = assignAfterSaveId;
      if (afterSaveId != null) {
        setAssignAfterSaveId(null);
        const sessionId = (data as { id?: number })?.id;
        if (sessionId) {
          assignments_create({
            session_type: "strength",
            session_id: sessionId,
            target_user_id: afterSaveId,
          }).then(() => {
            toast("Séance créée et assignée");
          }).catch((err: Error) => {
            toast.error("Séance créée mais non assignée", { description: err.message });
          });
        } else {
          toast("Séance créée avec succès");
        }
      } else {
        toast("Séance créée avec succès");
      }
    },
    onError: () => {
      setAssignAfterSaveId(null);
    }
  });

  const updateExercise = useMutation({
    mutationFn: (data: Exercise) => updateExerciseApi(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exercises"] });
      queryClient.invalidateQueries({ queryKey: ["strength_catalog_paginated"] });
      queryClient.invalidateQueries({ queryKey: ["strength_catalog"] });
      setExerciseEditOpen(false);
      setEditingExercise(null);
      toast("Exercice mis à jour");
    },
  });

  const deleteExercise = useMutation({
    mutationFn: (exerciseId: number) => deleteExerciseApi(exerciseId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exercises"] });
      queryClient.invalidateQueries({ queryKey: ["strength_catalog_paginated"] });
      queryClient.invalidateQueries({ queryKey: ["strength_catalog"] });
      setPendingDeleteExercise(null);
      toast("Exercice supprimé");
    },
  });

  const deleteSession = useMutation({
    mutationFn: (sessionId: number) => deleteStrengthSession(sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["strength_catalog_paginated"] });
      queryClient.invalidateQueries({ queryKey: ["strength_catalog"] });
      setPendingDeleteSession(null);
      toast("Séance supprimée");
    },
  });

  const updateSession = useMutation({
    mutationFn: (data: StrengthSessionInput) => updateStrengthSession(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["strength_catalog_paginated"] });
      queryClient.invalidateQueries({ queryKey: ["strength_catalog"] });
      // §300 Part 2 — une séance de mésocycle peut avoir été éditée via deeplink
      // depuis la planif : rafraîchit les vues planif/mésocycle (coach + nageur).
      queryClient.invalidateQueries({ queryKey: ["strength_planning_slot_overrides"] });
      queryClient.invalidateQueries({ queryKey: ["mesocycle-sessions-content"] });
      setIsCreating(false);
      setEditingSessionId(null);
      setNewSession({ title: "", description: "", cycle: "endurance", items: [], folder_id: null });
      toast("Séance mise à jour");
    }
  });

  const persistOrder = useMutation({
    mutationFn: (session: StrengthSessionTemplate) => persistStrengthSessionOrder(session),
  });

  const createFolder = useMutation({
    mutationFn: (args: { name: string; type: 'session' | 'exercise'; parentId?: number; athleteId?: number }) =>
      createStrengthFolder(args.name, args.type, {
        parentId: args.parentId ?? null,
        athleteId: args.athleteId ?? null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["strength_folders"] });
      toast("Dossier créé");
    },
  });

  const renameFolder = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) =>
      renameStrengthFolder(id, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["strength_folders"] });
      toast("Dossier renommé");
    },
  });

  const deleteFolderMut = useMutation({
    mutationFn: (id: number) => deleteStrengthFolder(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["strength_folders"] });
      queryClient.invalidateQueries({ queryKey: ["strength_catalog_paginated"] });
      queryClient.invalidateQueries({ queryKey: ["strength_catalog"] });
      queryClient.invalidateQueries({ queryKey: ["exercises"] });
      toast("Dossier supprimé");
    },
  });

  const moveItem = useMutation({
    mutationFn: ({ itemId, folderId, table }: { itemId: number; folderId: number | null; table: 'strength_sessions' | 'dim_exercices' }) =>
      moveToFolder(itemId, folderId, table),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["strength_catalog_paginated"] });
      queryClient.invalidateQueries({ queryKey: ["strength_catalog"] });
      queryClient.invalidateQueries({ queryKey: ["exercises"] });
      toast("Déplacé");
    },
  });

  const copyMutation = useMutation({
    mutationFn: async ({ mode, sourceId, targetAthleteId }: { mode: string; sourceId: number; targetAthleteId: number }) => {
      if (mode === "session") {
        const targetFolders = await getStrengthFolders("session", { athleteId: targetAthleteId });
        const rootFolder = targetFolders.find((f) => f.athlete_id === targetAthleteId && !f.parent_id);
        let targetFolderId: number | null = null;
        if (rootFolder) {
          const subs = targetFolders.filter((f) => f.parent_id === rootFolder.id);
          targetFolderId = subs[0]?.id ?? rootFolder.id;
        }
        await duplicateStrengthSession(sourceId, targetFolderId);
      } else if (mode === "folder") {
        await duplicateFolder(sourceId, targetAthleteId, null);
      } else if (mode === "plan") {
        await duplicateAthletePlan(sourceId, targetAthleteId);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["strength_folders"] });
      queryClient.invalidateQueries({ queryKey: ["strength_catalog_paginated"] });
      queryClient.invalidateQueries({ queryKey: ["strength_catalog"] });
      toast("Copie effectuée");
      setCopyDialog(null);
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Copie échouée";
      toast.error("Erreur", { description: message });
    },
  });

  const resetSessionForm = () => {
    setIsCreating(false);
    setEditingSessionId(null);
    setPlanCreationContext(null);
    setNewSession({ title: "", description: "", cycle: "endurance", items: [], folder_id: null });
  };

  const startEditSession = (session: StrengthSessionTemplate) => {
    setEditingSessionId(session.id);
    setNewSession({
      title: session.title ?? "",
      description: session.description ?? "",
      cycle: normalizeStrengthCycle(session.cycle),
      items: session.items?.map((item) => ({
        exercise_id: item.exercise_id,
        order_index: item.order_index ?? 0,
        sets: item.sets,
        reps: item.reps,
        rest_seconds: item.rest_seconds,
        percent_1rm: item.percent_1rm,
        cycle_type: item.cycle_type,
        notes: item.notes ?? "",
        target_intensity: item.target_intensity ?? null,
        // §300 — conserve le raw_payload (mesocycle_id…) pour le round-trip à la
        // sauvegarde ; absent pour les séances hors mésocycle (→ null).
        raw_payload: item.raw_payload ?? null,
      })) ?? [],
      folder_id: session.folder_id ?? null,
    });
    setIsCreating(true);
  };

  // §300 Part 2 — Deeplink d'édition déposé par la planif coach : ouvre une
  // séance par id (y compris une séance générée `[Méso …]`, exclue de la liste
  // mais éditable par id). Chargée avec son `raw_payload` → la sauvegarde le
  // préserve (cf. reconcileMesocyclePayloads). Consommé une seule fois.
  useEffect(() => {
    const KEY = "eac_coach_edit_strength_session";
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return;
    sessionStorage.removeItem(KEY);
    const id = Number(raw);
    if (!Number.isFinite(id)) return;
    let cancelled = false;
    (async () => {
      try {
        const loaded = await getStrengthSessionForEdit(id);
        if (cancelled) return;
        if (loaded) startEditSession(loaded);
        else toast.error("Séance introuvable pour l'édition.");
      } catch {
        if (!cancelled) toast.error("Impossible de charger la séance à éditer.");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startEditExercise = (exercise: Exercise) => {
    setEditingExercise(exercise);
    setExerciseEditOpen(true);
  };

  const handleSaveSession = () => {
    const sessionPayload = { ...newSession, items: updateOrderIndexes(newSession.items) };
    if (editingSessionId) {
      updateSession.mutate({ ...sessionPayload, id: editingSessionId });
    } else {
      createSession.mutate(sessionPayload);
    }
  };

  const handleSaveAndAssign = () => {
    if (!newSession.title.trim()) {
      toast.error("Titre requis", { description: "Ajoutez un nom de séance avant d'assigner." });
      return;
    }
    setAssignDialogOpen(true);
  };

  const handleConfirmAssign = () => {
    if (assignTargetAthleteId == null) return;
    if (editingSessionId) {
      // Mode édition : assigner directement sans recréer
      assignments_create({
        session_type: "strength",
        session_id: editingSessionId,
        target_user_id: assignTargetAthleteId,
      }).then(() => {
        toast("Séance assignée");
      }).catch((err: Error) => {
        toast.error("Erreur d'assignation", { description: err.message });
      });
      setAssignDialogOpen(false);
      setAssignTargetAthleteId(null);
    } else {
      setAssignAfterSaveId(assignTargetAthleteId);
      setAssignDialogOpen(false);
      setAssignTargetAthleteId(null);
      handleSaveSession();
    }
  };

  const updateOrderIndexes = (items: StrengthSessionItem[]) =>
    items.map((item, index) => ({ ...item, order_index: index }));

  const addItem = () => {
    const fallbackExercise = exercises?.[0];
    setNewSession(prev => ({
      ...prev,
      items: [
        ...prev.items,
        fallbackExercise
          ? createStrengthItemFromExercise(fallbackExercise, prev.cycle, prev.items.length)
          : {
              exercise_id: 1,
              order_index: prev.items.length,
              sets: 0,
              reps: 0,
              rest_seconds: 0,
              percent_1rm: 0,
            },
      ]
    }));
  };

  const updateItem = (index: number, field: string, value: string | number | null) => {
    const items = [...newSession.items];
    if (field === "exercise_id") {
      const exercise = exercises?.find((entry) => entry.id === value);
      if (exercise) {
        items[index] = createStrengthItemFromExercise(
          exercise,
          newSession.cycle,
          items[index].order_index ?? index,
          items[index],
        );
      } else {
        items[index] = { ...items[index], exercise_id: Number(value) };
      }
    } else {
      items[index] = { ...items[index], [field]: value };
    }
    setNewSession({ ...newSession, items });
  };

  const removeItem = (index: number) => {
    const items = updateOrderIndexes(newSession.items.filter((_, i) => i !== index));
    setNewSession({ ...newSession, items });
  };

  const reorderItems = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    const items = [...newSession.items];
    const [moved] = items.splice(fromIndex, 1);
    items.splice(toIndex, 0, moved);
    const updatedItems = updateOrderIndexes(items);
    setNewSession({ ...newSession, items: updatedItems });
    if (editingSessionId) {
      persistOrder.mutate({
        id: editingSessionId,
        title: newSession.title,
        description: newSession.description,
        cycle: newSession.cycle,
        items: updatedItems,
      });
    }
  };

  const exerciseEditDialog = (
    <Dialog open={exerciseEditOpen} onOpenChange={setExerciseEditOpen}>
      <DialogContent className="sm:max-w-3xl max-h-[85dvh] overflow-y-auto pb-safe">
        <DialogHeader>
          <DialogTitle>Modifier l'exercice</DialogTitle>
        </DialogHeader>
        {editingExercise && (
          <div className="space-y-4">
            {editingExercise.exercise_type === "warmup" ? (
              <WarmupFields
                exercise={editingExercise}
                warmupMode={editWarmupMode}
                onChange={(updates) =>
                  setEditingExercise((prev) => (prev ? { ...prev, ...updates } : prev))
                }
                onWarmupModeChange={setEditWarmupMode}
                idPrefix="edit"
              />
            ) : null}
            <div className="space-y-2">
              <Label>Nom</Label>
              <Input
                value={editingExercise.nom_exercice}
                onChange={(e) =>
                  setEditingExercise({ ...editingExercise, nom_exercice: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={editingExercise.description ?? ""}
                onChange={(e) =>
                  setEditingExercise({
                    ...editingExercise,
                    description: e.target.value === "" ? null : e.target.value,
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Illustration</Label>
              <div className="flex gap-2">
                <Input
                  value={editingExercise.illustration_gif ?? ""}
                  onChange={(e) =>
                    setEditingExercise({
                      ...editingExercise,
                      illustration_gif: e.target.value === "" ? null : e.target.value,
                    })
                  }
                  placeholder="https://..."
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  disabled={gifUploading}
                  onClick={() => setMediaSheetTarget("edit")}
                  aria-label="Ajouter une illustration"
                >
                  {gifUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                </Button>
              </div>
              {editingExercise.illustration_gif && (
                <img src={editingExercise.illustration_gif} alt="Aperçu" className="mt-2 h-20 w-20 rounded-lg object-cover border" />
              )}
            </div>
            {editingExercise.exercise_type !== "warmup" ? (
              <div className="space-y-2">
                <Label>Métrique d'intensité</Label>
                <Select
                  value={editingExercise.intensity_metric ?? "weight_kg"}
                  onValueChange={(v) => {
                    const metric = v as IntensityMetric;
                    setEditingExercise((prev) =>
                      prev
                        ? {
                            ...prev,
                            intensity_metric: metric,
                            // §298 — métriques non-poids : pas de %1RM ni PDC
                            ...(metric !== "weight_kg"
                              ? {
                                  is_bodyweight: false,
                                  pct_1rm_endurance: null,
                                  pct_1rm_hypertrophie: null,
                                  pct_1rm_force: null,
                                }
                              : {}),
                          }
                        : prev
                    );
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(INTENSITY_METRICS) as IntensityMetric[]).map((m) => (
                      <SelectItem key={m} value={m}>
                        {INTENSITY_METRICS[m].selectLabel}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            {editingExercise.exercise_type !== "warmup" ? (
              <fieldset
                disabled={(editingExercise.intensity_metric ?? "weight_kg") !== "weight_kg"}
                className={
                  (editingExercise.intensity_metric ?? "weight_kg") !== "weight_kg" ? "opacity-50" : ""
                }
              >
                <ExerciseCycleTabs
                  exercise={editingExercise}
                  onChange={(updates) =>
                    setEditingExercise((prev) => (prev ? { ...prev, ...updates } : prev))
                  }
                />
                {(editingExercise.intensity_metric ?? "weight_kg") !== "weight_kg" && (
                  <p className="text-xs text-muted-foreground">
                    Les % 1RM ne s'appliquent pas à cette métrique.
                  </p>
                )}
              </fieldset>
            ) : null}
            <div className="flex items-center gap-2">
              <Checkbox
                id="warmup-flag-edit"
                checked={editingExercise.exercise_type === "warmup"}
                onCheckedChange={(checked) => {
                  const isWarmup = checked === true;
                  setEditingExercise({
                    ...editingExercise,
                    exercise_type: isWarmup ? "warmup" : "strength",
                    ...(isWarmup
                      ? {}
                      : { warmup_reps: null, warmup_duration: null }),
                  });
                }}
              />
              <Label htmlFor="warmup-flag-edit">Exercice d'échauffement (warmup)</Label>
            </div>
            {(editingExercise.intensity_metric ?? "weight_kg") === "weight_kg" && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="bodyweight-flag-edit"
                  checked={editingExercise.is_bodyweight === true}
                  onCheckedChange={(checked) => {
                    const isBw = checked === true;
                    setEditingExercise({
                      ...editingExercise,
                      is_bodyweight: isBw,
                      // Reset les % 1RM si l'exo passe en PDC (cohérence)
                      ...(isBw
                        ? {
                            pct_1rm_endurance: null,
                            pct_1rm_hypertrophie: null,
                            pct_1rm_force: null,
                          }
                        : {}),
                    });
                  }}
                />
                <Label htmlFor="bodyweight-flag-edit">
                  Exercice au poids de corps (pas de 1RM)
                </Label>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setExerciseEditOpen(false);
                  setEditingExercise(null);
                }}
                className="h-10"
              >
                Annuler
              </Button>
              <Button
                variant="default"
                onClick={() => {
                  if (!editingExercise?.id) return;
                  updateExercise.mutate(editingExercise as Exercise);
                }}
                disabled={!editingExercise.nom_exercice.trim()}
                className="h-10"
              >
                Enregistrer
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );

  const exerciseCreateDialog = (
    <Dialog open={exerciseDialogOpen} onOpenChange={setExerciseDialogOpen}>
      <DialogContent className="sm:max-w-3xl max-h-[85dvh] overflow-y-auto pb-safe">
        <DialogHeader>
          <DialogTitle>Créer un exercice</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {newExercise.exercise_type === "warmup" ? (
            <WarmupFields
              exercise={newExercise}
              warmupMode={newWarmupMode}
              onChange={(updates) => setNewExercise((prev) => ({ ...prev, ...updates }))}
              onWarmupModeChange={setNewWarmupMode}
              idPrefix="create"
            />
          ) : null}
          <div className="space-y-2">
            <Label>Nom</Label>
            <Input
              value={newExercise.nom_exercice}
              onChange={(e) => setNewExercise({ ...newExercise, nom_exercice: e.target.value })}
              placeholder="ex: Rotations Élastique"
            />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={newExercise.description ?? ""}
              onChange={(e) =>
                setNewExercise({
                  ...newExercise,
                  description: e.target.value === "" ? null : e.target.value,
                })
              }
              placeholder="Détails, consignes..."
            />
          </div>
          <div className="space-y-2">
            <Label>Illustration</Label>
            <div className="flex gap-2">
              <Input
                value={newExercise.illustration_gif ?? ""}
                onChange={(e) =>
                  setNewExercise({
                    ...newExercise,
                    illustration_gif: e.target.value === "" ? null : e.target.value,
                  })
                }
                placeholder="https://..."
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={gifUploading}
                onClick={() => setMediaSheetTarget("create")}
                aria-label="Ajouter une illustration"
              >
                {gifUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              </Button>
            </div>
            {newExercise.illustration_gif && (
              <img src={newExercise.illustration_gif} alt="Aperçu" className="mt-2 h-20 w-20 rounded-lg object-cover border" />
            )}
          </div>
          {newExercise.exercise_type !== "warmup" ? (
            <div className="space-y-2">
              <Label>Métrique d'intensité</Label>
              <Select
                value={newExercise.intensity_metric ?? "weight_kg"}
                onValueChange={(v) => {
                  const metric = v as IntensityMetric;
                  setNewExercise((prev) => ({
                    ...prev,
                    intensity_metric: metric,
                    // §298 — métriques non-poids : pas de %1RM ni PDC
                    ...(metric !== "weight_kg"
                      ? {
                          is_bodyweight: false,
                          pct_1rm_endurance: null,
                          pct_1rm_hypertrophie: null,
                          pct_1rm_force: null,
                        }
                      : {}),
                  }));
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(INTENSITY_METRICS) as IntensityMetric[]).map((m) => (
                    <SelectItem key={m} value={m}>
                      {INTENSITY_METRICS[m].selectLabel}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          {newExercise.exercise_type !== "warmup" ? (
            <fieldset
              disabled={(newExercise.intensity_metric ?? "weight_kg") !== "weight_kg"}
              className={
                (newExercise.intensity_metric ?? "weight_kg") !== "weight_kg" ? "opacity-50" : ""
              }
            >
              <ExerciseCycleTabs
                exercise={newExercise}
                onChange={(updates) => setNewExercise((prev) => ({ ...prev, ...updates }))}
              />
              {(newExercise.intensity_metric ?? "weight_kg") !== "weight_kg" && (
                <p className="text-xs text-muted-foreground">
                  Les % 1RM ne s'appliquent pas à cette métrique.
                </p>
              )}
            </fieldset>
          ) : null}
          <div className="flex items-center gap-2">
            <Checkbox
              id="warmup-flag"
              checked={newExercise.exercise_type === "warmup"}
              onCheckedChange={(checked) => {
                const isWarmup = checked === true;
                setNewExercise({
                  ...newExercise,
                  exercise_type: isWarmup ? "warmup" : "strength",
                  ...(isWarmup
                    ? {}
                    : { warmup_reps: null, warmup_duration: null }),
                });
              }}
            />
            <Label htmlFor="warmup-flag">Exercice d'échauffement (warmup)</Label>
          </div>
          {(newExercise.intensity_metric ?? "weight_kg") === "weight_kg" && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="bodyweight-flag-create"
                checked={newExercise.is_bodyweight === true}
                onCheckedChange={(checked) => {
                  const isBw = checked === true;
                  setNewExercise({
                    ...newExercise,
                    is_bodyweight: isBw,
                    ...(isBw
                      ? {
                          pct_1rm_endurance: null,
                          pct_1rm_hypertrophie: null,
                          pct_1rm_force: null,
                        }
                      : {}),
                  });
                }}
              />
              <Label htmlFor="bodyweight-flag-create">
                Exercice au poids de corps (pas de 1RM)
              </Label>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setExerciseDialogOpen(false)} className="h-10">
              Annuler
            </Button>
            <Button
              variant="default"
              onClick={() => createExercise.mutate(newExercise)}
              disabled={!newExercise.nom_exercice.trim()}
              className="h-10"
            >
              Enregistrer
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );

  const deleteSessionDialog = (
    <AlertDialog
      open={Boolean(pendingDeleteSession)}
      onOpenChange={(open) => {
        if (!open) {
          setPendingDeleteSession(null);
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Supprimer la séance ?</AlertDialogTitle>
          <AlertDialogDescription>
            Cette action est définitive. La séance "{pendingDeleteSession?.title}" sera supprimée.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (pendingDeleteSession?.id) {
                deleteSession.mutate(pendingDeleteSession.id);
              }
            }}
          >
            Supprimer
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  const deleteExerciseDialog = (
    <AlertDialog
      open={Boolean(pendingDeleteExercise)}
      onOpenChange={(open) => {
        if (!open) {
          setPendingDeleteExercise(null);
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Supprimer l'exercice ?</AlertDialogTitle>
          <AlertDialogDescription>
            Cette action est définitive. L'exercice "{pendingDeleteExercise?.nom_exercice}" sera supprimé.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (pendingDeleteExercise?.id) {
                deleteExercise.mutate(pendingDeleteExercise.id);
              }
            }}
          >
            Supprimer
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  if (isCreating) {
    return (
      <>
        {exerciseCreateDialog}
        {exerciseEditDialog}
        {deleteSessionDialog}
        {deleteExerciseDialog}
        {planCreationContext && (
          <div className="px-4 pt-4 pb-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <button
                onClick={resetSessionForm}
                className="hover:text-foreground transition-colors"
              >
                &larr; Plans
              </button>
              <span>/</span>
              <span className="font-medium text-foreground">{planCreationContext.athleteName}</span>
              <span>/</span>
              <span className="font-medium text-foreground">{planCreationContext.cycleName}</span>
            </div>
          </div>
        )}
        <StrengthSessionBuilder
          session={newSession}
          exercises={exercises ?? []}
          editingSessionId={editingSessionId}
          folders={planCreationContext ? undefined : sessionFolders}
          onSessionChange={setNewSession}
          onCycleChange={(cycle) => {
            const items = newSession.items.map((item, i) => {
              const exercise = exercises?.find((ex) => ex.id === item.exercise_id);
              if (exercise) {
                return createStrengthItemFromExercise(exercise, cycle, i, item);
              }
              return { ...item, cycle_type: cycle };
            });
            setNewSession({ ...newSession, cycle, items });
          }}
          onSave={handleSaveSession}
          onCancel={resetSessionForm}
          onAddItem={addItem}
          onUpdateItem={updateItem}
          onRemoveItem={removeItem}
          onReorderItems={reorderItems}
          onExerciseDialogOpen={() => setExerciseDialogOpen(true)}
          isSaving={createSession.isPending || updateSession.isPending}
          onSaveAndAssign={planCreationContext ? undefined : handleSaveAndAssign}
        />
      </>
    );
  }

  // Keep loading state for exercises only
  if (isLoadingExercises) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-10 w-full rounded-2xl" />
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (exercisesError) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h3 className="font-semibold">Impossible de charger les données</h3>
        <p className="text-sm text-muted-foreground mt-2">
          {exercisesError instanceof Error ? exercisesError.message : "Une erreur s'est produite"}
        </p>
        <Button variant="default" onClick={() => refetchExercises()} className="mt-4 h-12 md:h-10">
          Réessayer
        </Button>
      </div>
    );
  }

  const renderExerciseRow = (exercise: Exercise) => (
    <div
      key={exercise.id}
      className="flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-muted/50"
    >
      {exercise.illustration_gif ? (
        <button
          type="button"
          className="shrink-0 rounded-lg overflow-hidden border border-border bg-muted"
          onClick={() => setEnlargedGif({ url: exercise.illustration_gif!, name: exercise.nom_exercice })}
        >
          <img
            src={exercise.illustration_gif}
            alt={exercise.nom_exercice}
            className="h-10 w-10 object-cover"
            loading="lazy"
            decoding="async"
          />
        </button>
      ) : (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Dumbbell className="h-4 w-4 text-muted-foreground" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{exercise.nom_exercice}</div>
        <div className="text-xs text-muted-foreground">
          {exercise.exercise_type === "warmup" ? "Échauffement" : "Séries de travail"}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <MoveToFolderPopover
          folders={exerciseFolders ?? []}
          currentFolderId={exercise.folder_id}
          onMove={(folderId) => moveItem.mutate({ itemId: exercise.id, folderId, table: "dim_exercices" })}
        />
        <button
          type="button"
          onClick={() => startEditExercise(exercise)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-muted"
          aria-label="Modifier"
        >
          <Edit2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setPendingDeleteExercise(exercise)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-destructive hover:bg-destructive/10"
          aria-label="Supprimer"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );

  return (
    <div>
      {exerciseCreateDialog}
      {exerciseEditDialog}
      {deleteSessionDialog}
      {deleteExerciseDialog}

      {copyDialog && (
        <Suspense fallback={null}>
          <CopyToAthleteDialog
          open={!!copyDialog}
          onOpenChange={(open: boolean) => !open && setCopyDialog(null)}
          athletes={athletes}
          mode={copyDialog.mode}
          sourceLabel={copyDialog.sourceLabel}
          loading={copyMutation.isPending}
          onConfirm={(targetAthleteId: number) =>
            copyMutation.mutate({
              mode: copyDialog.mode,
              sourceId: copyDialog.sourceId,
              targetAthleteId,
            })
          }
        />
        </Suspense>
      )}

      {/* GIF enlarge overlay */}
      {enlargedGif && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={() => setEnlargedGif(null)}
        >
          <div className="relative max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <img
              src={enlargedGif.url}
              alt={enlargedGif.name}
              className="w-full max-h-[80vh] object-contain rounded-2xl"
            />
            <p className="mt-2 text-sm font-medium text-center text-white">{enlargedGif.name}</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <div className="text-base font-semibold">Musculation</div>
          <div className="text-xs text-muted-foreground">Catalogue</div>
        </div>
        <div className="flex items-center gap-2">
          {catalogTab !== "plans" && (
            <button
              type="button"
              onClick={() => setShowCreateFolderDialog(true)}
              className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-2 text-xs font-semibold hover:bg-muted"
            >
              <FolderPlus className="h-4 w-4" /> Dossier
            </button>
          )}
          {catalogTab === "sessions" ? (
            <button
              type="button"
              onClick={() => {
                setEditingSessionId(null);
                setNewSession({ title: "", description: "", cycle: "endurance", items: [], folder_id: null });
                setIsCreating(true);
              }}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
            >
              <Plus className="h-4 w-4" /> Nouvelle
            </button>
          ) : catalogTab === "exercises" ? (
            <button
              type="button"
              onClick={() => setExerciseDialogOpen(true)}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
            >
              <Plus className="h-4 w-4" /> Ajouter
            </button>
          ) : null}
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Tabs */}
        <Tabs value={catalogTab} onValueChange={(v) => setCatalogTab(v as "sessions" | "plans" | "exercises")}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="sessions" className="text-xs sm:text-sm px-1">S&eacute;ances</TabsTrigger>
            <TabsTrigger value="plans" className="text-xs sm:text-sm px-1">Plans</TabsTrigger>
            <TabsTrigger value="exercises" className="text-xs sm:text-sm px-1">Exercices</TabsTrigger>
          </TabsList>

          {/* === SESSIONS TAB (common library only) === */}
          <TabsContent value="sessions" className="space-y-4 mt-4">
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
                    className="absolute right-0 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    aria-label="Effacer la recherche"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-3">
              {/* Unfiled sessions */}
              <SessionListView
                sessions={unfiledSessions}
                isLoading={isLoadingSessions}
                error={sessionsError}
                renderTitle={(session) => session.title ?? "Sans titre"}
                renderMetrics={renderSessionMetrics}
                renderExtraActions={(session) => (
                  <>
                    <MoveToFolderPopover
                      folders={sessionFolders}
                      currentFolderId={session.folder_id}
                      onMove={(folderId) => moveItem.mutate({ itemId: session.id, folderId, table: "strength_sessions" })}
                    />
                    <button
                      type="button"
                      onClick={() => setCopyDialog({ mode: "session", sourceId: session.id, sourceLabel: session.title ?? "Sans titre" })}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-muted"
                      aria-label="Copier vers un nageur"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                  </>
                )}
                onPreview={(session) => startEditSession(session)}
                onEdit={(session) => startEditSession(session)}
                onDelete={(session) => setPendingDeleteSession(session)}
                canDelete={() => true}
                isDeleting={deleteSession.isPending}
              />

              {/* Folders */}
              {sessionFolders.map((folder) => {
                const folderSessions = sessionsByFolder.get(folder.id) ?? [];
                return (
                  <FolderCard
                    key={folder.id}
                    name={folder.name}
                    count={folderSessions.length}
                    actions={
                      <FolderDropdown
                        name={folder.name}
                        onRename={(newName) => renameFolder.mutate({ id: folder.id, name: newName })}
                        onDelete={() => deleteFolderMut.mutate(folder.id)}
                      />
                    }
                  >
                    {folderSessions.length > 0 ? (
                      <SessionListView
                        sessions={folderSessions}
                        renderTitle={(session) => session.title ?? "Sans titre"}
                        renderMetrics={renderSessionMetrics}
                        renderExtraActions={(session) => (
                          <MoveToFolderPopover
                            folders={sessionFolders}
                            currentFolderId={session.folder_id}
                            onMove={(folderId) => moveItem.mutate({ itemId: session.id, folderId, table: "strength_sessions" })}
                          />
                        )}
                        onPreview={(session) => startEditSession(session)}
                        onEdit={(session) => startEditSession(session)}
                        onDelete={(session) => setPendingDeleteSession(session)}
                        canDelete={() => true}
                        isDeleting={deleteSession.isPending}
                      />
                    ) : (
                      <EmptyState compact title="Dossier vide" />
                    )}
                  </FolderCard>
                );
              })}

              {hasNextStrengthPage && (
                <Button
                  variant="outline"
                  className="w-full mt-4"
                  onClick={() => fetchNextStrengthPage()}
                  disabled={isFetchingNextStrengthPage}
                >
                  {isFetchingNextStrengthPage ? "Chargement..." : "Charger plus"}
                </Button>
              )}
            </div>
          </TabsContent>

          {/* === PLANS TAB — TrainingPlansBrowser (§275.4) === */}
          {/* §276.1 — sub-toggle "Plans nageurs" supprimé. AthletePlansTab
              legacy reste consommé par MyPlanTab (fallback Phase 1) pour les
              nageurs sans application active, mais n'est plus exposé via biblio. */}
          <TabsContent value="plans" className="mt-4">
            <Suspense fallback={null}>
              <TrainingPlansBrowser />
            </Suspense>
          </TabsContent>

          {/* === EXERCISES TAB === */}
          <TabsContent value="exercises" className="space-y-3 mt-4">
            {/* Unfiled exercises */}
            <div className="space-y-1">
              {unfiledExercises.map(renderExerciseRow)}
            </div>

            {/* Exercise folders */}
            {exerciseFolders?.map((folder) => {
              const folderExercises = exercisesByFolder.get(folder.id) ?? [];
              return (
                <FolderCard
                  key={folder.id}
                  name={folder.name}
                  count={folderExercises.length}
                  actions={
                    <FolderDropdown
                      name={folder.name}
                      onRename={(newName) => renameFolder.mutate({ id: folder.id, name: newName })}
                      onDelete={() => deleteFolderMut.mutate(folder.id)}
                    />
                  }
                >
                  {folderExercises.length > 0 ? (
                    <div className="space-y-1">
                      {folderExercises.map(renderExerciseRow)}
                    </div>
                  ) : (
                    <EmptyState compact title="Dossier vide" />
                  )}
                </FolderCard>
              );
            })}
          </TabsContent>
        </Tabs>
      </div>

      {mediaSheetTarget !== null && (
        <Suspense fallback={null}>
          <MediaSourceSheet
            open={mediaSheetTarget !== null}
            onOpenChange={(v: boolean) => { if (!v) setMediaSheetTarget(null); }}
            onMediaReady={(media: Blob | File, isGif: boolean) => {
              if (mediaSheetTarget === "edit") {
                handleGifUpload(media, isGif, (url: string) =>
                  setEditingExercise((prev) => prev ? { ...prev, illustration_gif: url } : prev)
                );
              } else if (mediaSheetTarget === "create") {
                handleGifUpload(media, isGif, (url: string) =>
                  setNewExercise((prev) => ({ ...prev, illustration_gif: url }))
                );
              }
              setMediaSheetTarget(null);
            }}
          />
        </Suspense>
      )}

      <Dialog open={showCreateFolderDialog} onOpenChange={setShowCreateFolderDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouveau dossier</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Nom du dossier"
              value={newStrengthFolderName}
              onChange={(e) => setNewStrengthFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newStrengthFolderName.trim()) {
                  createFolder.mutate({
                    name: newStrengthFolderName.trim(),
                    type: catalogTab === "sessions" ? "session" : "exercise",
                  });
                  setShowCreateFolderDialog(false);
                  setNewStrengthFolderName("");
                }
              }}
              autoFocus
              className="rounded-2xl"
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowCreateFolderDialog(false);
                  setNewStrengthFolderName("");
                }}
              >
                Annuler
              </Button>
              <Button
                onClick={() => {
                  if (!newStrengthFolderName.trim()) return;
                  createFolder.mutate({
                    name: newStrengthFolderName.trim(),
                    type: catalogTab === "sessions" ? "session" : "exercise",
                  });
                  setShowCreateFolderDialog(false);
                  setNewStrengthFolderName("");
                }}
                disabled={!newStrengthFolderName.trim()}
              >
                Créer
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assigner à un nageur</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-3">
            La séance sera enregistrée puis assignée à ce nageur.
          </p>
          <AssignAthleteSelect
            athletes={athletes}
            value={assignTargetAthleteId}
            onChange={setAssignTargetAthleteId}
          />
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => { setAssignDialogOpen(false); setAssignTargetAthleteId(null); }}>
              Annuler
            </Button>
            <Button onClick={handleConfirmAssign} disabled={assignTargetAthleteId == null}>
              Enreg. &amp; assigner
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
