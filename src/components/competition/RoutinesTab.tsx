import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  getCompetitionRaces,
  getRaceRoutines,
  getRoutineTemplates,
  setRaceRoutine,
  removeRaceRoutine,
  deleteRoutineTemplate,
  createRoutineTemplate,
} from "@/lib/api";
import type { CompetitionRace, RoutineTemplate, RoutineStepInput } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { toast } from "sonner";
import { eventLabel } from "@/lib/objectiveHelpers";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Repeat, Clock, Plus, Trash2, X, Check } from "lucide-react";

/* ── Props ──────────────────────────────────────────────── */

interface RoutinesTabProps {
  competitionId: string;
}

/* ── Helpers ─────────────────────────────────────────────── */

function formatDayLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
}

function formatTime(time: string): string {
  const [h, m] = time.split(":");
  return `${h}h${m}`;
}

function formatOffset(minutes: number): string {
  if (minutes === 0) return "0min";
  const sign = minutes < 0 ? "-" : "+";
  return `${sign}${Math.abs(minutes)}min`;
}

/* ── Main component ────────────────────────────────────── */

export default function RoutinesTab({ competitionId }: RoutinesTabProps) {
  const [pickerRaceId, setPickerRaceId] = useState<string | null>(null);
  const [createSheetOpen, setCreateSheetOpen] = useState(false);

  /* ── Queries ──────────────────────────────────────────── */

  const { data: races = [], isLoading: loadingRaces } = useQuery({
    queryKey: ["competition-races", competitionId],
    queryFn: () => getCompetitionRaces(competitionId),
  });

  const { data: raceRoutines = [], isLoading: loadingRoutines } = useQuery({
    queryKey: ["race-routines", competitionId],
    queryFn: () => getRaceRoutines(competitionId),
  });

  const { data: templates = [], isLoading: loadingTemplates } = useQuery({
    queryKey: ["routine-templates"],
    queryFn: () => getRoutineTemplates(),
  });

  /* ── Derived lookups ──────────────────────────────────── */

  const routineByRaceId = useMemo(() => {
    const map = new Map<string, string>();
    for (const rr of raceRoutines) map.set(rr.race_id, rr.routine_id);
    return map;
  }, [raceRoutines]);

  const templateById = useMemo(() => {
    const map = new Map<string, RoutineTemplate>();
    for (const t of templates) map.set(t.id, t);
    return map;
  }, [templates]);

  /* ── Mutations ────────────────────────────────────────── */

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["race-routines", competitionId] });
    queryClient.invalidateQueries({ queryKey: ["routine-templates"] });
  };

  const setRoutineMutation = useMutation({
    mutationFn: ({ raceId, routineId }: { raceId: string; routineId: string }) =>
      setRaceRoutine(raceId, routineId),
    onSuccess: () => {
      invalidateAll();
      toast("Routine assignee");
      setPickerRaceId(null);
    },
    onError: (e: Error) =>
      toast.error("Erreur", { description: e.message }),
  });

  const removeRoutineMutation = useMutation({
    mutationFn: (raceId: string) => removeRaceRoutine(raceId),
    onSuccess: () => {
      invalidateAll();
      toast("Routine retiree");
    },
    onError: (e: Error) =>
      toast.error("Erreur", { description: e.message }),
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: (id: string) => deleteRoutineTemplate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["routine-templates"] });
      queryClient.invalidateQueries({ queryKey: ["race-routines", competitionId] });
      toast("Template supprime");
    },
    onError: () => toast.error("Erreur"),
  });

  /* ── Loading state ────────────────────────────────────── */

  if (loadingRaces || loadingRoutines || loadingTemplates) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  /* ── Empty state — no races yet ────────────────────────── */

  if (races.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-border bg-card/60 p-6 text-center">
        <Repeat className="mx-auto h-8 w-8 text-muted-foreground/40" />
        <p className="mt-3 text-sm font-medium">Aucune course</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Ajoute d'abord des courses dans l'onglet Courses
        </p>
      </div>
    );
  }

  /* ── Race cards ────────────────────────────────────────── */

  return (
    <>
      <div className="space-y-3">
        {races.map((race) => {
          const routineId = routineByRaceId.get(race.id);
          const template = routineId ? templateById.get(routineId) : null;
          return (
            <RaceRoutineCard
              key={race.id}
              race={race}
              template={template ?? null}
              onAssign={() => setPickerRaceId(race.id)}
              onChange={() => setPickerRaceId(race.id)}
              onRemove={() => removeRoutineMutation.mutate(race.id)}
              removing={removeRoutineMutation.isPending}
            />
          );
        })}

        {/* Template management */}
        <button
          type="button"
          onClick={() => setCreateSheetOpen(true)}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-blue-500/30 bg-blue-500/5 px-3 py-3 text-xs font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-500/10 transition"
        >
          <Plus className="h-3.5 w-3.5" />
          Creer un template de routine
        </button>
      </div>

      {/* ── Picker Sheet ─────────────────────────────────── */}
      <Sheet open={!!pickerRaceId} onOpenChange={(v) => !v && setPickerRaceId(null)}>
        <SheetContent side="right" className="flex flex-col overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Choisir une routine</SheetTitle>
            <SheetDescription>
              Selectionne un template de routine pour cette course.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-4 flex-1 space-y-2">
            {templates.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-4 text-center">
                <p className="text-sm text-muted-foreground">
                  Aucun template disponible
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setPickerRaceId(null);
                    setCreateSheetOpen(true);
                  }}
                  className="mt-2 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Creer un template
                </button>
              </div>
            ) : (
              templates.map((tmpl) => (
                <div
                  key={tmpl.id}
                  className="flex items-center justify-between rounded-2xl border bg-card px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{tmpl.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {tmpl.steps?.length ?? 0} etape{(tmpl.steps?.length ?? 0) !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        if (pickerRaceId) {
                          setRoutineMutation.mutate({ raceId: pickerRaceId, routineId: tmpl.id });
                        }
                      }}
                      disabled={setRoutineMutation.isPending}
                      className="rounded-xl bg-blue-500/10 px-3 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-500/20 transition"
                    >
                      Appliquer
                    </button>
                    <DeleteTemplateButton
                      onConfirm={() => deleteTemplateMutation.mutate(tmpl.id)}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Create Template Sheet ────────────────────────── */}
      <CreateRoutineSheet open={createSheetOpen} onOpenChange={setCreateSheetOpen} />
    </>
  );
}

/* ── Race Routine Card ─────────────────────────────────── */

function RaceRoutineCard({
  race,
  template,
  onAssign,
  onChange,
  onRemove,
  removing,
}: {
  race: CompetitionRace;
  template: RoutineTemplate | null;
  onAssign: () => void;
  onChange: () => void;
  onRemove: () => void;
  removing: boolean;
}) {
  const steps = template?.steps ?? [];

  return (
    <div className="rounded-2xl border bg-card overflow-hidden">
      {/* Header */}
      <div className="border-b border-border/60 px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold truncate">
                {eventLabel(race.event_code)}
              </p>
              {race.race_type === "finale" && (
                <span className="shrink-0 rounded-md bg-orange-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-orange-600 dark:text-orange-400">
                  {race.final_letter ? `Finale ${race.final_letter}` : "Finale"}
                </span>
              )}
            </div>
            <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
              <span>{formatDayLabel(race.race_day)}</span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {race.start_time ? formatTime(race.start_time) : "Heure à définir"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="px-3 py-2.5">
        {template ? (
          <>
            {/* Assigned routine */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Repeat className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                <span className="text-sm font-medium truncate">{template.name}</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={onChange}
                  className="rounded-lg bg-blue-500/10 px-2 py-1 text-[11px] font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-500/20 transition"
                >
                  Changer
                </button>
                <button
                  type="button"
                  onClick={onRemove}
                  disabled={removing}
                  className="rounded-lg bg-red-500/10 px-2 py-1 text-[11px] font-medium text-red-600 dark:text-red-400 hover:bg-red-500/20 transition"
                >
                  Retirer
                </button>
              </div>
            </div>

            {/* Steps list */}
            {steps.length > 0 && (
              <div className="mt-2.5 space-y-1.5">
                {steps.map((step) => (
                  <div
                    key={step.id}
                    className="flex items-center gap-2.5"
                  >
                    <span className="rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 px-2 py-0.5 text-[11px] font-mono shrink-0">
                      {formatOffset(step.offset_minutes)}
                    </span>
                    <span className="text-xs text-foreground">{step.label}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          /* No routine assigned */
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Aucune routine</span>
            <button
              type="button"
              onClick={onAssign}
              className="rounded-xl bg-blue-500/10 px-3 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-500/20 transition"
            >
              Assigner
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Create Routine Template Sheet ──────────────────────── */

function CreateRoutineSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [steps, setSteps] = useState<Array<{ offset: string; label: string }>>([
    { offset: "-60", label: "" },
  ]);

  const createMutation = useMutation({
    mutationFn: ({ n, s }: { n: string; s: RoutineStepInput[] }) =>
      createRoutineTemplate(n, s),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["routine-templates"] });
      toast("Template cree");
      setName("");
      setSteps([{ offset: "-60", label: "" }]);
      onOpenChange(false);
    },
    onError: () => toast.error("Erreur"),
  });

  function addStep() {
    setSteps((prev) => [...prev, { offset: "-30", label: "" }]);
  }

  function removeStep(idx: number) {
    setSteps((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateStep(idx: number, field: "offset" | "label", value: string) {
    setSteps((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s)),
    );
  }

  function handleSave() {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    const validSteps: RoutineStepInput[] = steps
      .filter((s) => s.label.trim())
      .map((s, i) => ({
        offset_minutes: parseInt(s.offset, 10) || 0,
        label: s.label.trim(),
        sort_order: i,
      }));
    createMutation.mutate({ n: trimmedName, s: validSteps });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Nouvelle routine</SheetTitle>
          <SheetDescription>
            Cree un template de routine pre-course reutilisable.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 flex-1 space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Nom</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex : Routine sprint"
              className="w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/40"
            />
          </div>

          {/* Steps */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Etapes</label>
            <div className="space-y-2">
              {steps.map((step, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <div className="relative w-20 shrink-0">
                    <input
                      type="number"
                      value={step.offset}
                      onChange={(e) => updateStep(idx, "offset", e.target.value)}
                      className="w-full rounded-xl border bg-background pl-3 pr-8 py-2 text-sm text-center font-mono outline-none focus:ring-2 focus:ring-blue-500/40 appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      placeholder="-60"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">
                      min
                    </span>
                  </div>
                  <input
                    type="text"
                    value={step.label}
                    onChange={(e) => updateStep(idx, "label", e.target.value)}
                    placeholder="Ex : Echauffement sec"
                    className="flex-1 rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/40"
                  />
                  {steps.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeStep(idx)}
                      className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition shrink-0"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addStep}
              className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline mt-1"
            >
              <Plus className="h-3 w-3" />
              Ajouter une etape
            </button>
          </div>
        </div>

        {/* Save */}
        <div className="mt-4 pt-4 border-t">
          <button
            type="button"
            onClick={handleSave}
            disabled={!name.trim() || createMutation.isPending}
            className="w-full rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50 transition"
          >
            {createMutation.isPending ? "Sauvegarde..." : "Sauvegarder"}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ── Delete Template Button ──────────────────────────────── */

function DeleteTemplateButton({ onConfirm }: { onConfirm: () => void }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button
          type="button"
          className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Supprimer ce template ?</AlertDialogTitle>
          <AlertDialogDescription>
            Cette action est irreversible. Le template et ses etapes seront definitivement supprimes.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Supprimer
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
