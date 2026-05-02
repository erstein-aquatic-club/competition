import { useMemo, useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Objective, ObjectiveInput, Competition } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import { Plus, Target } from "lucide-react";
import {
  FFN_EVENTS,
  eventLabel,
  formatTime,
  parseTime,
} from "@/lib/objectiveHelpers";
import { ObjectiveCard, ObjectiveGrid } from "@/components/shared/ObjectiveCard";
import { ObjectiveDetailSheet } from "@/components/shared/ObjectiveDetailSheet";
import { setPacePrefill } from "@/lib/pace-prefill-handoff";
import { parseObjectiveForPace, shouldAutoSyncToPaceTarget } from "@/lib/objective-pace-link";
import type { ParsedObjectiveTarget } from "@/lib/objective-pace-link";
import { upsertPaceTarget, listMyPaceTargets, type PaceTarget } from "@/lib/api/pace-targets";
import { findMatchingTarget } from "@/hooks/useTargetForObjective";
import type { QueryClient } from "@tanstack/react-query";

export function handlePaceLinkClick(
  parsed: ParsedObjectiveTarget,
  swimmerAccountId: number,
  target_time_ms: number,
  storage: Storage = (typeof window !== "undefined" ? sessionStorage : ({} as Storage)),
): string {
  setPacePrefill(
    {
      swimmer_account_id: swimmerAccountId,
      stroke: parsed.stroke,
      target_distance_m: parsed.distance,
      target_time_ms,
      target_pool_size: parsed.pool_size,
    },
    storage,
  );
  return "#/coach?section=pace-calculator";
}

export async function autoSyncPaceTarget(
  obj: { event_code?: string | null; pool_length?: number | null; target_time_seconds?: number | null },
  athleteAccountId: number,
  queryClient: QueryClient,
): Promise<void> {
  const parsed = parseObjectiveForPace(obj.event_code, obj.pool_length);
  if (!parsed || obj.target_time_seconds == null) return;
  try {
    await upsertPaceTarget({
      swimmer: { kind: "account", accountId: athleteAccountId },
      stroke: parsed.stroke,
      target_distance_m: parsed.distance,
      target_time_ms: obj.target_time_seconds * 1000,
      target_pool_size: parsed.pool_size,
    });
    void queryClient.invalidateQueries({ queryKey: ["pace-targets"] });
  } catch {
    // silent — pace sync is best-effort
  }
}

// ── Types ───────────────────────────────────────────────────────

interface Props {
  athleteId: number;    // public.users.id (integer)
  athleteName: string;
  authUidError?: boolean;
}

type ObjectiveType = "chrono" | "texte" | "both";

/** Fetch the auth UUID for a public.users integer ID via RPC. */
async function fetchAuthUidForUser(userId: number): Promise<string | null> {
  const { data, error } = await supabase.rpc("get_auth_uid_for_user", {
    p_user_id: userId,
  });
  if (error) {
    console.error("[objectives-tab] Failed to resolve auth UUID:", error.message);
    return null;
  }
  return data as string | null;
}

// ── Objective Form Sheet ────────────────────────────────────────

type ObjectiveFormProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  objective?: Objective | null;
  athleteName: string;
  athleteAuthId: string;
  athleteAccountId: number;
  competitions: Competition[];
};

const ObjectiveFormSheet = ({
  open,
  onOpenChange,
  objective,
  athleteName,
  athleteAuthId,
  athleteAccountId,
  competitions,
}: ObjectiveFormProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEdit = !!objective;

  const [objType, setObjType] = useState<ObjectiveType>("chrono");
  const [eventCode, setEventCode] = useState("");
  const [poolLength, setPoolLength] = useState("25");
  const [targetTime, setTargetTime] = useState("");
  const [text, setText] = useState("");
  const [competitionId, setCompetitionId] = useState<string>("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Pre-fill form when sheet opens
  useEffect(() => {
    if (!open) return;
    if (objective) {
      const hasChrono = !!objective.event_code;
      const hasText = !!objective.text;
      setObjType(hasChrono && hasText ? "both" : hasText ? "texte" : "chrono");
      setEventCode(objective.event_code ?? "");
      setPoolLength(String(objective.pool_length ?? 25));
      setTargetTime(
        objective.target_time_seconds != null
          ? formatTime(objective.target_time_seconds)
          : "",
      );
      setText(objective.text ?? "");
      setCompetitionId(objective.competition_id ?? "");
    } else {
      setObjType("chrono");
      setEventCode("");
      setPoolLength("25");
      setTargetTime("");
      setText("");
      setCompetitionId("");
    }
  }, [open, objective]);

  const createMutation = useMutation({
    mutationFn: (input: ObjectiveInput) => api.createObjective(input),
    onSuccess: (data: Objective) => {
      toast({ title: "Objectif créé" });
      void queryClient.invalidateQueries({ queryKey: ["objectives", athleteAuthId] });
      void autoSyncPaceTarget(data, athleteAccountId, queryClient);
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast({
        title: "Erreur",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (input: Partial<ObjectiveInput>) =>
      api.updateObjective(objective!.id, input),
    onSuccess: (data: Objective) => {
      toast({ title: "Objectif mis à jour" });
      void queryClient.invalidateQueries({ queryKey: ["objectives", athleteAuthId] });
      void autoSyncPaceTarget(data, athleteAccountId, queryClient);
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast({
        title: "Erreur",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteObjective(objective!.id),
    onSuccess: () => {
      toast({ title: "Objectif supprimé" });
      void queryClient.invalidateQueries({ queryKey: ["objectives", athleteAuthId] });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast({
        title: "Erreur",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const showChrono = objType === "chrono" || objType === "both";
  const showText = objType === "texte" || objType === "both";

  const handleSubmit = () => {
    if (showChrono && !eventCode) {
      toast({
        title: "Épreuve requise",
        description: "Veuillez sélectionner une épreuve.",
        variant: "destructive",
      });
      return;
    }
    if (showChrono && targetTime) {
      const parsed = parseTime(targetTime);
      if (parsed === null) {
        toast({
          title: "Format invalide",
          description: "Le temps doit être au format m:ss:cc (ex: 1:05:30)",
          variant: "destructive",
        });
        return;
      }
    }
    if (showText && !text.trim()) {
      toast({
        title: "Texte requis",
        description: "Veuillez saisir un objectif texte.",
        variant: "destructive",
      });
      return;
    }

    const input: ObjectiveInput = {
      athlete_id: athleteAuthId,
      competition_id: competitionId && competitionId !== "none" ? competitionId : null,
      event_code: showChrono ? eventCode : null,
      pool_length: showChrono ? Number(poolLength) : null,
      target_time_seconds: showChrono && targetTime ? parseTime(targetTime) : null,
      text: showText ? text.trim() : null,
    };

    if (isEdit) {
      updateMutation.mutate(input);
    } else {
      createMutation.mutate(input);
    }
  };

  const isPending =
    createMutation.isPending ||
    updateMutation.isPending ||
    deleteMutation.isPending;

  // Filter upcoming competitions for linking
  const upcomingCompetitions = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return competitions.filter(
      (c) => new Date(c.date + "T00:00:00").getTime() >= today.getTime(),
    );
  }, [competitions]);

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-md overflow-y-auto"
        >
          <SheetHeader>
            <SheetTitle>
              {isEdit ? "Modifier l'objectif" : "Nouvel objectif"}
            </SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            {/* Athlete (read-only) */}
            <div className="space-y-2">
              <Label>Nageur</Label>
              <p className="text-sm font-medium">{athleteName}</p>
            </div>

            {/* Type toggle */}
            <div className="space-y-2">
              <Label>Type d'objectif</Label>
              <ToggleGroup
                type="single"
                variant="outline"
                value={objType}
                onValueChange={(val) => {
                  if (val) setObjType(val as ObjectiveType);
                }}
                className="justify-start"
              >
                <ToggleGroupItem value="chrono" className="text-xs">
                  Chrono
                </ToggleGroupItem>
                <ToggleGroupItem value="texte" className="text-xs">
                  Texte
                </ToggleGroupItem>
                <ToggleGroupItem value="both" className="text-xs">
                  Les deux
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            {/* Chrono fields */}
            {showChrono && (
              <>
                <div className="space-y-2">
                  <Label>Épreuve *</Label>
                  <Select value={eventCode} onValueChange={setEventCode}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choisir une épreuve" />
                    </SelectTrigger>
                    <SelectContent>
                      {FFN_EVENTS.map((code) => (
                        <SelectItem key={code} value={code}>
                          {eventLabel(code)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Bassin</Label>
                  <Select value={poolLength} onValueChange={setPoolLength}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="25">25m</SelectItem>
                      <SelectItem value="50">50m</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Temps cible (min:sec:centièmes)</Label>
                  <Input
                    placeholder="Ex : 1:05:30"
                    value={targetTime}
                    onChange={(e) => setTargetTime(e.target.value)}
                  />
                </div>
              </>
            )}

            {/* Text field */}
            {showText && (
              <div className="space-y-2">
                <Label>Objectif texte *</Label>
                <Textarea
                  placeholder="Ex : Améliorer la coulée de dos"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={3}
                  maxLength={1000}
                />
              </div>
            )}

            {/* Competition link */}
            <div className="space-y-2">
              <Label>Lier à une compétition</Label>
              <Select
                value={competitionId}
                onValueChange={setCompetitionId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Aucune" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Aucune</SelectItem>
                  {upcomingCompetitions.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} ({c.date})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Actions */}
            <div className="space-y-2 pt-2">
              <Button
                className="w-full"
                onClick={handleSubmit}
                disabled={isPending}
              >
                {isPending
                  ? "Enregistrement..."
                  : isEdit
                    ? "Enregistrer"
                    : "Créer"}
              </Button>

              {isEdit && (
                <Button
                  variant="outline"
                  className="w-full text-destructive hover:text-destructive"
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={isPending}
                >
                  Supprimer cet objectif
                </Button>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Delete confirmation dialog */}
      <AlertDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer l'objectif</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. L'objectif sera supprimé
              définitivement.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                deleteMutation.mutate();
                setShowDeleteConfirm(false);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

// ObjectiveCard replaced by shared import from @/components/shared/ObjectiveCard

// ── Main Component ──────────────────────────────────────────────

const SwimmerObjectivesTab = ({ athleteId, athleteName, authUidError }: Props) => {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingObj, setEditingObj] = useState<Objective | null>(null);
  const [detailObj, setDetailObj] = useState<Objective | null>(null);
  const [detailMatchingTarget, setDetailMatchingTarget] = useState<PaceTarget | null>(null);

  // Resolve the auth UUID for the athlete
  const { data: athleteAuthId, isLoading: authIdLoading } = useQuery({
    queryKey: ["auth-uid", athleteId],
    queryFn: () => fetchAuthUidForUser(athleteId),
    enabled: !!athleteId,
  });

  // Competitions query
  const { data: competitions = [] } = useQuery({
    queryKey: ["competitions"],
    queryFn: () => api.getCompetitions(),
  });

  // Objectives query
  const { data: objectives = [], isLoading: objectivesLoading } = useQuery({
    queryKey: ["objectives", athleteAuthId],
    queryFn: () => api.getObjectives(athleteAuthId!),
    enabled: !!athleteAuthId,
  });

  // Fetch athlete IUF for performance lookup
  const { data: athleteProfile } = useQuery({
    queryKey: ["profile", athleteId],
    queryFn: () => api.getProfile({ userId: athleteId }),
    enabled: !!athleteId,
  });
  const athleteIuf = athleteProfile?.ffn_iuf ?? null;
  const perfFromDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 360);
    return d.toISOString().slice(0, 10);
  }, []);
  const { data: performances = [] } = useQuery({
    queryKey: ["swimmer-performances-recent", athleteIuf],
    queryFn: () => api.getSwimmerPerformances({ iuf: athleteIuf!, fromDate: perfFromDate }),
    enabled: !!athleteIuf,
  });

  const { data: paceTargets = [], isLoading: paceTargetsLoading } = useQuery({
    queryKey: ["pace-targets"],
    queryFn: listMyPaceTargets,
    staleTime: 30_000,
    enabled: !!athleteId,
  });

  const syncedForAthleteRef = useRef<number | null>(null);

  useEffect(() => {
    if (objectivesLoading || paceTargetsLoading) return;
    if (!athleteId || objectives.length === 0) return;
    if (syncedForAthleteRef.current === athleteId) return;
    syncedForAthleteRef.current = athleteId;

    const missing = objectives.filter((obj) => {
      const parsed = parseObjectiveForPace(obj.event_code, obj.pool_length);
      return shouldAutoSyncToPaceTarget(obj, parsed, paceTargets, athleteId);
    });

    if (missing.length === 0) return;

    void Promise.allSettled(
      missing.map((obj) => {
        const parsed = parseObjectiveForPace(obj.event_code, obj.pool_length);
        if (!parsed || obj.target_time_seconds == null) return Promise.resolve();
        return upsertPaceTarget({
          swimmer: { kind: "account", accountId: athleteId },
          stroke: parsed.stroke,
          target_distance_m: parsed.distance,
          target_time_ms: obj.target_time_seconds * 1000,
          target_pool_size: parsed.pool_size,
        });
      }),
    ).then((results) => {
      const failed = results.filter((r) => r.status === "rejected");
      if (failed.length > 0) {
        console.warn(`[pace-autosync] ${failed.length}/${results.length} upserts failed`);
      }
      void queryClient.invalidateQueries({ queryKey: ["pace-targets"] });
    });
  }, [objectivesLoading, paceTargetsLoading, objectives, paceTargets, athleteId, queryClient]);

  const openDetail = (obj: Objective) => {
    const parsed = parseObjectiveForPace(obj.event_code, obj.pool_length);
    const target = findMatchingTarget(paceTargets, athleteId, parsed);
    setDetailMatchingTarget(target);
    setDetailObj(obj);
  };

  const handleCreate = () => {
    setEditingObj(null);
    setShowForm(true);
  };

  const handleEdit = (obj: Objective) => {
    setEditingObj(obj);
    setShowForm(true);
  };

  const isLoading = authIdLoading;
  const showObjectivesList = !!athleteAuthId && !authIdLoading;

  return (
    <div className="space-y-4">
      {authUidError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-center">
          <p className="text-xs text-destructive">
            Impossible de charger les objectifs. Vérifiez que le nageur a un compte actif.
          </p>
        </div>
      )}
      {/* Add button */}
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={handleCreate}
          disabled={!athleteAuthId}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Ajouter un objectif
        </Button>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-xl border p-3 animate-pulse motion-reduce:animate-none"
            >
              <div className="flex items-center gap-3">
                <div className="h-4 w-40 rounded bg-muted" />
                <div className="ml-auto h-5 w-12 rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Objectives loading */}
      {showObjectivesList && objectivesLoading && (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="rounded-xl border p-3 animate-pulse motion-reduce:animate-none"
            >
              <div className="flex items-center gap-3">
                <div className="h-4 w-32 rounded bg-muted" />
                <div className="ml-auto h-5 w-16 rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {showObjectivesList && !objectivesLoading && objectives.length === 0 && (
        <div className="text-center py-12 space-y-3">
          <Target className="h-10 w-10 text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">
            Aucun objectif défini pour {athleteName}.
          </p>
          <Button variant="outline" size="sm" onClick={handleCreate}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Créer le premier objectif
          </Button>
        </div>
      )}

      {/* Objectives list */}
      {showObjectivesList && !objectivesLoading && objectives.length > 0 && (
        <div className="space-y-2">
          <ObjectiveGrid>
            {objectives.map((obj) => (
              <ObjectiveCard
                key={obj.id}
                objective={obj}
                performances={performances}
                onClick={obj.event_code ? () => openDetail(obj) : () => handleEdit(obj)}
                onEdit={obj.event_code ? () => handleEdit(obj) : undefined}
              />
            ))}
          </ObjectiveGrid>
          <p className="text-[10px] text-muted-foreground/60 italic text-center pt-1">
            Les temps « Actuel » correspondent à la meilleure performance des 360 derniers jours sur l'épreuve.
          </p>
        </div>
      )}

      {/* Form sheet */}
      {athleteAuthId && (
        <ObjectiveFormSheet
          open={showForm}
          onOpenChange={setShowForm}
          objective={editingObj}
          athleteName={athleteName}
          athleteAuthId={athleteAuthId}
          athleteAccountId={athleteId}
          competitions={competitions}
        />
      )}

      <ObjectiveDetailSheet
        open={!!detailObj}
        onOpenChange={(open) => { if (!open) { setDetailObj(null); setDetailMatchingTarget(null); } }}
        objective={detailObj}
        matchingTarget={detailMatchingTarget}
        iuf={athleteIuf}
      />
    </div>
  );
};

export default SwimmerObjectivesTab;
