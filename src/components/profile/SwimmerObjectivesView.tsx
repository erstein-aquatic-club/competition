import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Objective, ObjectiveInput } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
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
import { ArrowLeft, Plus, Target } from "lucide-react";
import {
  FFN_EVENTS,
  eventLabel,
  formatTime,
  parseTime,
} from "@/lib/objectiveHelpers";
import { ObjectiveCard, ObjectiveGrid } from "@/components/shared/ObjectiveCard";
import { ObjectiveDetailSheet } from "@/components/shared/ObjectiveDetailSheet";
import { parseObjectiveForPace } from "@/lib/objective-pace-link";
import { listMyPaceTargets, type PaceTarget } from "@/lib/api/pace-targets";
import { findMatchingTarget } from "@/hooks/useTargetForObjective";

type Props = {
  onBack?: () => void;
  embedded?: boolean;
};
type ObjectiveType = "chrono" | "texte" | "both";

export default function SwimmerObjectivesView({ onBack, embedded = false }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [editingObj, setEditingObj] = useState<Objective | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Objective | null>(null);
  const [detailObj, setDetailObj] = useState<Objective | null>(null);
  const [detailMatchingTarget, setDetailMatchingTarget] = useState<PaceTarget | null>(null);

  // Get current auth user UUID
  const { data: authUser } = useQuery({
    queryKey: ["auth-user"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user;
    },
  });
  const authUid = authUser?.id ?? null;

  // Get objectives for current athlete
  const { data: objectives = [], isLoading } = useQuery({
    queryKey: ["athlete-objectives"],
    queryFn: () => api.getAthleteObjectives(),
    enabled: !!authUid,
    staleTime: 5 * 60 * 1000,
  });

  // Get swimmer IUF from profile, then performances (last 360 days) for progress gauge
  const userId = useAuth((s) => s.userId);
  const user = useAuth((s) => s.user);
  const { data: profile } = useQuery({
    queryKey: ["my-profile"],
    queryFn: () => api.getProfile({ displayName: user, userId }),
    enabled: !!userId,
  });
  const iuf = profile?.ffn_iuf ?? null;
  const swimmerAccountId: number | null = profile?.id ?? null;

  const { data: paceTargets = [] } = useQuery({
    queryKey: ["pace-targets-for-swimmer", swimmerAccountId],
    queryFn: listMyPaceTargets,
    enabled: swimmerAccountId != null,
    staleTime: 30_000,
  });

  const perfFromDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 360);
    return d.toISOString().slice(0, 10);
  }, []);
  const { data: performances = [] } = useQuery({
    queryKey: ["swimmer-performances-recent", iuf],
    queryFn: () => api.getSwimmerPerformances({ iuf: iuf!, fromDate: perfFromDate }),
    enabled: !!iuf,
  });

  // Split into coach vs personal
  const coachObjectives = useMemo(
    () => objectives.filter((o) => o.created_by !== authUid),
    [objectives, authUid],
  );
  const personalObjectives = useMemo(
    () => objectives.filter((o) => o.created_by === authUid),
    [objectives, authUid],
  );

  // ── Form state ──
  const [objType, setObjType] = useState<ObjectiveType>("chrono");
  const [eventCode, setEventCode] = useState("");
  const [poolLength, setPoolLength] = useState("25");
  const [targetTime, setTargetTime] = useState("");
  const [text, setText] = useState("");

  const resetForm = () => {
    setObjType("chrono");
    setEventCode("");
    setPoolLength("25");
    setTargetTime("");
    setText("");
  };

  const openCreate = () => {
    setEditingObj(null);
    resetForm();
    setShowForm(true);
  };

  const openEdit = (obj: Objective) => {
    setEditingObj(obj);
    const hasChrono = !!obj.event_code;
    const hasText = !!obj.text;
    setObjType(hasChrono && hasText ? "both" : hasText ? "texte" : "chrono");
    setEventCode(obj.event_code ?? "");
    setPoolLength(String(obj.pool_length ?? 25));
    setTargetTime(
      obj.target_time_seconds != null
        ? formatTime(obj.target_time_seconds)
        : "",
    );
    setText(obj.text ?? "");
    setShowForm(true);
  };

  const openDetail = (obj: Objective) => {
    const parsed = parseObjectiveForPace(obj.event_code, obj.pool_length);
    const target = swimmerAccountId != null
      ? findMatchingTarget(paceTargets, swimmerAccountId, parsed)
      : null;
    setDetailMatchingTarget(target);
    setDetailObj(obj);
  };

  // ── Mutations ──
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["athlete-objectives"] });

  const createMut = useMutation({
    mutationFn: (input: ObjectiveInput) => api.createObjective(input),
    onSuccess: () => {
      toast({ title: "Objectif créé" });
      invalidate();
      setShowForm(false);
    },
    onError: (e: Error) =>
      toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: (input: Partial<ObjectiveInput>) =>
      api.updateObjective(editingObj!.id, input),
    onSuccess: () => {
      toast({ title: "Objectif mis à jour" });
      invalidate();
      setShowForm(false);
    },
    onError: (e: Error) =>
      toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deleteObjective(id),
    onSuccess: () => {
      toast({ title: "Objectif supprimé" });
      invalidate();
      setDeleteTarget(null);
    },
    onError: (e: Error) =>
      toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const showChrono = objType === "chrono" || objType === "both";
  const showText = objType === "texte" || objType === "both";
  const isPending = createMut.isPending || updateMut.isPending;

  const handleSubmit = () => {
    if (showChrono && !eventCode) {
      toast({ title: "Épreuve requise", variant: "destructive" });
      return;
    }
    if (showChrono && targetTime && parseTime(targetTime) === null) {
      toast({
        title: "Format invalide",
        description: "Format : m:ss:cc (ex: 1:05:30)",
        variant: "destructive",
      });
      return;
    }
    if (showText && !text.trim()) {
      toast({ title: "Texte requis", variant: "destructive" });
      return;
    }
    if (!authUid) return;

    const input: ObjectiveInput = {
      athlete_id: authUid,
      event_code: showChrono ? eventCode : null,
      pool_length: showChrono ? Number(poolLength) : null,
      target_time_seconds:
        showChrono && targetTime ? parseTime(targetTime) : null,
      text: showText ? text.trim() : null,
    };

    if (editingObj) {
      updateMut.mutate(input);
    } else {
      createMut.mutate(input);
    }
  };

  return (
    <div className={embedded ? "space-y-3" : "space-y-6 pb-24"}>
      {/* Header */}
      {embedded ? (
        <div className="flex items-center justify-between">
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/70">
            Objectifs
          </h3>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={openCreate}>
            <Plus className="mr-1 h-3 w-3" />
            Ajouter
          </Button>
        </div>
      ) : (
        <div className="space-y-1">
          <Button variant="ghost" size="sm" className="-ml-2" onClick={onBack}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Retour
          </Button>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-display font-semibold uppercase italic text-primary">
                Mon plan
              </h2>
              <p className="text-sm text-muted-foreground">
                Mes objectifs d'entraînement
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={openCreate}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Ajouter
            </Button>
          </div>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="space-y-1.5">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="rounded-lg border p-2.5 animate-pulse motion-reduce:animate-none"
            >
              <div className="h-3.5 w-36 rounded bg-muted" />
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && objectives.length === 0 && (
        <div className="text-center py-8 space-y-2">
          <Target className="h-8 w-8 text-muted-foreground/40 mx-auto" />
          <p className="text-xs text-muted-foreground">
            Aucun objectif pour le moment.
          </p>
          <Button variant="ghost" size="sm" className="text-xs h-7" onClick={openCreate}>
            <Plus className="mr-1 h-3 w-3" />
            Ajouter
          </Button>
        </div>
      )}

      {/* All objectives in a single grid */}
      {(coachObjectives.length > 0 || personalObjectives.length > 0) && (
        <ObjectiveGrid>
          {coachObjectives.map((obj) => (
            <ObjectiveCard
              key={obj.id}
              objective={obj}
              performances={performances}
              showCoachBadge
              onClick={obj.event_code ? () => openDetail(obj) : undefined}
            />
          ))}
          {personalObjectives.map((obj) => (
            <ObjectiveCard
              key={obj.id}
              objective={obj}
              performances={performances}
              onClick={obj.event_code ? () => openDetail(obj) : () => openEdit(obj)}
              onEdit={obj.event_code ? () => openEdit(obj) : undefined}
            />
          ))}
        </ObjectiveGrid>
      )}

      {/* Bottom sheet form */}
      <Sheet open={showForm} onOpenChange={setShowForm}>
        <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              {editingObj ? "Modifier l'objectif" : "Nouvel objectif"}
            </SheetTitle>
            <SheetDescription>
              {editingObj
                ? "Modifiez votre objectif personnel."
                : "Ajoutez un objectif personnel."}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            {/* Type toggle */}
            <div className="space-y-2">
              <Label>Type d'objectif</Label>
              <ToggleGroup
                type="single"
                variant="outline"
                value={objType}
                onValueChange={(v) => {
                  if (v) setObjType(v as ObjectiveType);
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

            <Button
              className="w-full"
              onClick={handleSubmit}
              disabled={isPending}
            >
              {isPending
                ? "Enregistrement..."
                : editingObj
                  ? "Enregistrer"
                  : "Créer"}
            </Button>

            {editingObj && (
              <Button
                variant="ghost"
                className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => {
                  setShowForm(false);
                  setDeleteTarget(editingObj);
                }}
              >
                Supprimer cet objectif
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
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
                if (deleteTarget) deleteMut.mutate(deleteTarget.id);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ObjectiveDetailSheet
        open={!!detailObj}
        onOpenChange={(open) => { if (!open) { setDetailObj(null); setDetailMatchingTarget(null); } }}
        objective={detailObj}
        matchingTarget={detailMatchingTarget}
        iuf={iuf}
      />
    </div>
  );
}
