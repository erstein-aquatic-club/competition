import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, Exercise, StrengthCycleType, StrengthSessionItem, StrengthSessionTemplate, StrengthFolder } from "@/lib/api";
import type { StrengthSessionInput } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, Plus, Edit2, Search, Dumbbell, Upload, Loader2, Trash2, FolderPlus, Copy } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
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
import { FolderSection } from "@/components/coach/strength/FolderSection";
import { MoveToFolderPopover } from "@/components/coach/strength/MoveToFolderPopover";
import { CopyToAthleteDialog } from "@/components/coach/strength/CopyToAthleteDialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

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
                value={exercise[pctField] ?? ""}
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
                value={exercise[seriesField] ?? ""}
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
                value={exercise[repsField] ?? ""}
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
                value={exercise[recupField] ?? ""}
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
                value={exercise[recupExField] ?? ""}
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

export default function StrengthCatalog() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);
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
  const [catalogTab, setCatalogTab] = useState<"sessions" | "exercises">("sessions");
  const [enlargedGif, setEnlargedGif] = useState<{ url: string; name: string } | null>(null);
  const [selectedAthleteId, setSelectedAthleteId] = useState<number | null>(null);
  const [copyDialog, setCopyDialog] = useState<{
    mode: "session" | "folder" | "plan";
    sourceId: number;
    sourceLabel: string;
  } | null>(null);

  const handleGifUpload = async (file: File, setter: (url: string) => void) => {
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      toast({ title: "Fichier trop volumineux", description: "La taille maximale est de 10 Mo.", variant: "destructive" });
      return;
    }
    setGifUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "gif";
      const path = `exercises/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("exercise-gifs").upload(path, file, { upsert: false });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("exercise-gifs").getPublicUrl(path);
      setter(urlData.publicUrl);
      toast({ title: "Image uploadée" });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Réessayez.";
      toast({ title: "Erreur d'upload", description: message, variant: "destructive" });
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
    queryFn: () => api.getExercises()
  });

  const { data: sessions, isLoading: isLoadingSessions, error: sessionsError, refetch: refetchSessions } = useQuery({
    queryKey: ["strength_catalog"],
    queryFn: () => api.getStrengthSessions()
  });

  const { data: athletes = [] } = useQuery({
    queryKey: ["athletes"],
    queryFn: () => api.getAthletes(),
  });

  const { data: sessionFolders = [] } = useQuery({
    queryKey: ["strength_folders", "session", selectedAthleteId],
    queryFn: () => api.getStrengthFolders("session",
      selectedAthleteId !== null ? { athleteId: selectedAthleteId } : undefined
    ),
  });

  const { data: exerciseFolders } = useQuery({
    queryKey: ["strength_folders", "exercise"],
    queryFn: () => api.getStrengthFolders("exercise"),
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

  const filteredSessions = useMemo(() => {
    if (!sessions) return [];
    if (!searchQuery.trim()) return sessions;
    const q = searchQuery.toLowerCase();
    return sessions.filter((s) => s.title?.toLowerCase().includes(q));
  }, [sessions, searchQuery]);

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

  // Hierarchy: root folders vs sub-folders (cycles)
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
    mutationFn: (data: Omit<Exercise, "id">) => api.createExercise(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exercises"] });
      setExerciseDialogOpen(false);
      toast({ title: "Exercice ajouté" });
    },
  });

  const createSession = useMutation({
    mutationFn: (data: StrengthSessionInput) => api.createStrengthSession(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["strength_catalog"] });
      setIsCreating(false);
      setNewSession({ title: "", description: "", cycle: "endurance", items: [], folder_id: null });
      toast({ title: "Séance créée avec succès" });
    }
  });

  const updateExercise = useMutation({
    mutationFn: (data: Exercise) => api.updateExercise(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exercises"] });
      queryClient.invalidateQueries({ queryKey: ["strength_catalog"] });
      setExerciseEditOpen(false);
      setEditingExercise(null);
      toast({ title: "Exercice mis à jour" });
    },
  });

  const deleteExercise = useMutation({
    mutationFn: (exerciseId: number) => api.deleteExercise(exerciseId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exercises"] });
      queryClient.invalidateQueries({ queryKey: ["strength_catalog"] });
      setPendingDeleteExercise(null);
      toast({ title: "Exercice supprimé" });
    },
  });

  const deleteSession = useMutation({
    mutationFn: (sessionId: number) => api.deleteStrengthSession(sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["strength_catalog"] });
      setPendingDeleteSession(null);
      toast({ title: "Séance supprimée" });
    },
  });

  const updateSession = useMutation({
    mutationFn: (data: StrengthSessionInput) => api.updateStrengthSession(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["strength_catalog"] });
      setIsCreating(false);
      setEditingSessionId(null);
      setNewSession({ title: "", description: "", cycle: "endurance", items: [], folder_id: null });
      toast({ title: "Séance mise à jour" });
    }
  });

  const persistOrder = useMutation({
    mutationFn: (session: StrengthSessionTemplate) => api.persistStrengthSessionOrder(session),
  });

  const createFolder = useMutation({
    mutationFn: (args: { name: string; type: 'session' | 'exercise'; parentId?: number; athleteId?: number }) =>
      api.createStrengthFolder(args.name, args.type, {
        parentId: args.parentId ?? null,
        athleteId: args.athleteId ?? null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["strength_folders"] });
      toast({ title: "Dossier créé" });
    },
  });

  const renameFolder = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) =>
      api.renameStrengthFolder(id, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["strength_folders"] });
      toast({ title: "Dossier renommé" });
    },
  });

  const deleteFolderMut = useMutation({
    mutationFn: (id: number) => api.deleteStrengthFolder(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["strength_folders"] });
      queryClient.invalidateQueries({ queryKey: ["strength_catalog"] });
      queryClient.invalidateQueries({ queryKey: ["exercises"] });
      toast({ title: "Dossier supprimé" });
    },
  });

  const moveItem = useMutation({
    mutationFn: ({ itemId, folderId, table }: { itemId: number; folderId: number | null; table: 'strength_sessions' | 'dim_exercices' }) =>
      api.moveToFolder(itemId, folderId, table),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["strength_catalog"] });
      queryClient.invalidateQueries({ queryKey: ["exercises"] });
      toast({ title: "Déplacé" });
    },
  });

  const copyMutation = useMutation({
    mutationFn: async ({ mode, sourceId, targetAthleteId }: { mode: string; sourceId: number; targetAthleteId: number }) => {
      if (mode === "session") {
        const targetFolders = await api.getStrengthFolders("session", { athleteId: targetAthleteId });
        const rootFolder = targetFolders.find((f) => f.athlete_id === targetAthleteId && !f.parent_id);
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
      toast({ title: "Copie effectuée" });
      setCopyDialog(null);
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Copie échouée";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    },
  });

  const resetSessionForm = () => {
    setIsCreating(false);
    setEditingSessionId(null);
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
      })) ?? [],
      folder_id: session.folder_id ?? null,
    });
    setIsCreating(true);
  };

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
      <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto pb-safe">
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
              <Label>Illustration (GIF)</Label>
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
                  onClick={() => {
                    const input = document.createElement("input");
                    input.type = "file";
                    input.accept = "image/*,.gif";
                    input.onchange = (e) => {
                      const file = (e.target as HTMLInputElement).files?.[0];
                      if (file) handleGifUpload(file, (url) => setEditingExercise((prev) => prev ? { ...prev, illustration_gif: url } : prev));
                    };
                    input.click();
                  }}
                  aria-label="Uploader une image"
                >
                  {gifUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                </Button>
              </div>
              {editingExercise.illustration_gif && (
                <img src={editingExercise.illustration_gif} alt="Aperçu" className="mt-2 h-20 w-20 rounded-lg object-cover border" />
              )}
            </div>
            {editingExercise.exercise_type !== "warmup" ? (
              <ExerciseCycleTabs
                exercise={editingExercise}
                onChange={(updates) =>
                  setEditingExercise((prev) => (prev ? { ...prev, ...updates } : prev))
                }
              />
            ) : null}
            <div className="flex items-center gap-2">
              <Checkbox
                id="warmup-flag-edit"
                checked={editingExercise.exercise_type === "warmup"}
                onCheckedChange={(checked) =>
                  setEditingExercise({
                    ...editingExercise,
                    exercise_type: checked === true ? "warmup" : "strength",
                  })
                }
              />
              <Label htmlFor="warmup-flag-edit">Exercice d'échauffement (warmup)</Label>
            </div>
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
      <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto pb-safe">
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
            <Label>Illustration (GIF)</Label>
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
                onClick={() => {
                  const input = document.createElement("input");
                  input.type = "file";
                  input.accept = "image/*,.gif";
                  input.onchange = (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (file) handleGifUpload(file, (url) => setNewExercise((prev) => ({ ...prev, illustration_gif: url })));
                  };
                  input.click();
                }}
                aria-label="Uploader une image"
              >
                {gifUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              </Button>
            </div>
            {newExercise.illustration_gif && (
              <img src={newExercise.illustration_gif} alt="Aperçu" className="mt-2 h-20 w-20 rounded-lg object-cover border" />
            )}
          </div>
          {newExercise.exercise_type !== "warmup" ? (
            <ExerciseCycleTabs
              exercise={newExercise}
              onChange={(updates) => setNewExercise((prev) => ({ ...prev, ...updates }))}
            />
          ) : null}
          <div className="flex items-center gap-2">
            <Checkbox
              id="warmup-flag"
              checked={newExercise.exercise_type === "warmup"}
              onCheckedChange={(checked) =>
                setNewExercise({
                  ...newExercise,
                  exercise_type: checked === true ? "warmup" : "strength",
                })
              }
            />
            <Label htmlFor="warmup-flag">Exercice d'échauffement (warmup)</Label>
          </div>
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
        <StrengthSessionBuilder
          session={newSession}
          exercises={exercises ?? []}
          editingSessionId={editingSessionId}
          folders={sessionFolders}
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
          <button
            type="button"
            onClick={() => {
              const name = prompt("Nom du dossier");
              if (name?.trim()) createFolder.mutate({ name: name.trim(), type: catalogTab === "sessions" ? "session" : "exercise" });
            }}
            className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-2 text-xs font-semibold hover:bg-muted"
          >
            <FolderPlus className="h-4 w-4" /> Dossier
          </button>
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
          ) : (
            <button
              type="button"
              onClick={() => setExerciseDialogOpen(true)}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
            >
              <Plus className="h-4 w-4" /> Ajouter
            </button>
          )}
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Tabs */}
        <Tabs value={catalogTab} onValueChange={(v) => setCatalogTab(v as "sessions" | "exercises")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="sessions">Séances</TabsTrigger>
            <TabsTrigger value="exercises">Exercices ({exercises?.length ?? 0})</TabsTrigger>
          </TabsList>

          {/* === SESSIONS TAB === */}
          <TabsContent value="sessions" className="space-y-4 mt-4">
            {/* Athlete filter + Search */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Select
                value={selectedAthleteId === null ? "__common__" : String(selectedAthleteId)}
                onValueChange={(v) => setSelectedAthleteId(v === "__common__" ? null : Number(v))}
              >
                <SelectTrigger className="w-full sm:w-[220px]">
                  <SelectValue placeholder="Bibliothèque commune" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__common__">Bibliothèque commune</SelectItem>
                  {athletes.map((a) => (
                    <SelectItem key={a.id ?? a.display_name} value={String(a.id)}>
                      {a.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex flex-1 items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input
                  className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  placeholder="Rechercher une séance"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-3">
              {/* "Créer un plan" when athlete selected but no folders yet */}
              {selectedAthleteId !== null && rootFolders.length === 0 && (
                <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-4 py-8 text-center">
                  <p className="text-sm text-muted-foreground">Aucun plan pour ce nageur</p>
                  <Button
                    variant="outline"
                    onClick={() => {
                      const athlete = athletes.find((a) => a.id === selectedAthleteId);
                      createFolder.mutate({
                        name: athlete?.display_name ?? "Plan",
                        type: "session",
                        athleteId: selectedAthleteId,
                      });
                    }}
                  >
                    <Plus className="h-4 w-4 mr-2" /> Créer un plan
                  </Button>
                </div>
              )}

              {selectedAthleteId === null ? (
                <>
                  {/* Flat folder list — "Bibliothèque commune" mode */}
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

                  {sessionFolders.map((folder) => {
                    const folderSessions = sessionsByFolder.get(folder.id) ?? [];
                    return (
                      <FolderSection
                        key={folder.id}
                        name={folder.name}
                        count={folderSessions.length}
                        onRename={(newName) => renameFolder.mutate({ id: folder.id, name: newName })}
                        onDelete={() => deleteFolderMut.mutate(folder.id)}
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
                          <div className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                            Dossier vide
                          </div>
                        )}
                      </FolderSection>
                    );
                  })}
                </>
              ) : (
                <>
                  {/* 2-level hierarchy — athlete mode */}
                  {/* Unfiled sessions for this athlete context */}
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

                  {rootFolders.map((root) => {
                    const cycles = subFoldersMap.get(root.id) ?? [];
                    const rootSessions = sessionsByFolder.get(root.id) ?? [];
                    const totalCount = cycles.reduce(
                      (sum, c) => sum + (sessionsByFolder.get(c.id)?.length ?? 0),
                      rootSessions.length,
                    );
                    return (
                      <FolderSection
                        key={root.id}
                        name={root.name}
                        count={totalCount}
                        defaultOpen
                        onRename={(newName) => renameFolder.mutate({ id: root.id, name: newName })}
                        onDelete={() => deleteFolderMut.mutate(root.id)}
                        onCopy={() => setCopyDialog({ mode: "plan", sourceId: selectedAthleteId!, sourceLabel: root.name + " (plan complet)" })}
                      >
                        {/* Sessions directly in root */}
                        {rootSessions.length > 0 && (
                          <SessionListView
                            sessions={rootSessions}
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
                        )}

                        {/* Sub-folders (cycles) */}
                        {cycles.map((cycle) => {
                          const cycleSessions = sessionsByFolder.get(cycle.id) ?? [];
                          return (
                            <FolderSection
                              key={cycle.id}
                              name={cycle.name}
                              count={cycleSessions.length}
                              onRename={(newName) => renameFolder.mutate({ id: cycle.id, name: newName })}
                              onDelete={() => deleteFolderMut.mutate(cycle.id)}
                              onCopy={() => setCopyDialog({ mode: "folder", sourceId: cycle.id, sourceLabel: cycle.name })}
                            >
                              {cycleSessions.length > 0 ? (
                                <SessionListView
                                  sessions={cycleSessions}
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
                              ) : (
                                <div className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                                  Dossier vide
                                </div>
                              )}
                            </FolderSection>
                          );
                        })}

                        {/* Add cycle button */}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="mt-1 text-xs"
                          onClick={() => createFolder.mutate({ name: "Nouveau cycle", type: "session", parentId: root.id })}
                        >
                          <Plus className="h-4 w-4 mr-2" /> Ajouter un cycle
                        </Button>
                      </FolderSection>
                    );
                  })}
                </>
              )}
            </div>
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
                <FolderSection
                  key={folder.id}
                  name={folder.name}
                  count={folderExercises.length}
                  onRename={(newName) => renameFolder.mutate({ id: folder.id, name: newName })}
                  onDelete={() => deleteFolderMut.mutate(folder.id)}
                >
                  {folderExercises.length > 0 ? (
                    <div className="space-y-1">
                      {folderExercises.map(renderExerciseRow)}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                      Dossier vide
                    </div>
                  )}
                </FolderSection>
              );
            })}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
