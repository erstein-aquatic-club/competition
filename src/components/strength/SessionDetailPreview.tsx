import { useMemo, useState } from "react";
import { StrengthSessionTemplate, StrengthSessionItem, Exercise, Assignment, StrengthCycleType } from "@/lib/api";
import { Button } from "@/components/ui/button";
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
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { ChevronLeft, ChevronDown, Play, RefreshCw, Plus } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import { fadeIn, staggerChildren, listItem } from "@/lib/animations";
import { BottomActionBar, SaveState } from "@/components/shared/BottomActionBar";
import { ExercisePicker } from "@/components/strength/ExercisePicker";
import { cn } from "@/lib/utils";
import type { OneRmEntry } from "@/lib/types";

const cycleColors: Record<string, { dot: string; text: string; bg: string }> = {
  endurance: { dot: "bg-blue-500", text: "text-blue-600 dark:text-blue-400", bg: "bg-blue-500/10" },
  hypertrophie: { dot: "bg-amber-500", text: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10" },
  force: { dot: "bg-red-500", text: "text-red-600 dark:text-red-400", bg: "bg-red-500/10" },
};

const formatStrengthValue = (value?: number | null) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return "—";
  return String(numeric);
};

const formatStrengthSeconds = (value?: number | null) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return "—";
  return `${numeric}s`;
};

interface SessionDetailPreviewProps {
  session: StrengthSessionTemplate;
  assignment: Assignment | null;
  cycleType: StrengthCycleType;
  cycleOptions: Array<{ value: StrengthCycleType; label: string }>;
  exercises: Exercise[];
  oneRMs: OneRmEntry[];
  saveState: SaveState;
  onBack: () => void;
  onLaunch: () => void;
  launchDisabled?: boolean;
  substitutions?: Map<number, { originalIndex: number; exercise: Exercise }>;
  onSubstitute?: (itemIndex: number, exercise: Exercise) => void;
  originalItemCount?: number;
  onAddExercise?: (exercise: Exercise) => void;
}

export function SessionDetailPreview({
  session,
  assignment,
  cycleType,
  cycleOptions,
  exercises,
  oneRMs,
  saveState,
  onBack,
  onLaunch,
  launchDisabled,
  substitutions,
  onSubstitute,
  originalItemCount,
  onAddExercise,
}: SessionDetailPreviewProps) {
  const exerciseLookup = useMemo(() => {
    return new Map(exercises.map((exercise) => [exercise.id, exercise]));
  }, [exercises]);

  const items = session.items ?? [];

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTargetIndex, setPickerTargetIndex] = useState<number | null>(null);
  const [addPickerOpen, setAddPickerOpen] = useState(false);
  const [disclaimerShown, setDisclaimerShown] = useState(false);
  const [disclaimerOpen, setDisclaimerOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  const withDisclaimer = (action: () => void) => {
    if (disclaimerShown) { action(); return; }
    setPendingAction(() => action);
    setDisclaimerOpen(true);
  };

  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const cycleLabel = cycleOptions.find((o) => o.value === cycleType)?.label ?? cycleType;
  const colors = cycleColors[cycleType] ?? cycleColors.endurance;

  return (
    <motion.div
      className="space-y-3 pb-48"
      variants={fadeIn}
      initial="hidden"
      animate="visible"
    >
      {/* ── Header slim ── */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-muted/60 text-muted-foreground transition-colors hover:bg-muted active:scale-95"
          aria-label="Retour"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold tracking-tight truncate leading-tight">{session.title}</h1>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold", colors.bg, colors.text)}>
              <span className={cn("h-1.5 w-1.5 rounded-full", colors.dot)} />
              {cycleLabel}
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {items.length} exercice{items.length > 1 ? "s" : ""}
            </span>
            {assignment?.assigned_date && (
              <>
                <span className="text-muted-foreground/30">·</span>
                <span className="text-xs text-muted-foreground">
                  {format(new Date(assignment.assigned_date), "dd MMM", { locale: fr })}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Description (if any) — kept minimal */}
      {session.description && (
        <p className="text-[13px] text-muted-foreground leading-relaxed px-1">
          {session.description}
        </p>
      )}

      {/* ── Exercise list — inline GIF + expandable details ── */}
      <motion.div className="space-y-1.5" variants={staggerChildren} initial="hidden" animate="visible">
        {items.map((item, index) => {
          const exercise = exerciseLookup.get(item.exercise_id);
          const percentValue = Number(item.percent_1rm);
          const hasPercent = Number.isFinite(percentValue) && percentValue > 0;
          const rm = hasPercent
            ? oneRMs?.find((entry: OneRmEntry) => entry.exercise_id === item.exercise_id)?.weight ?? 0
            : 0;
          const targetWeight = hasPercent ? Math.round(rm * (percentValue / 100)) : 0;
          const chargeLabel = hasPercent
            ? targetWeight > 0
              ? `${targetWeight}kg (${percentValue}%)`
              : `${percentValue}% 1RM`
            : null;
          const notes = item.notes?.trim();
          const setsVal = formatStrengthValue(item.sets);
          const repsVal = formatStrengthValue(item.reps);
          const restVal = formatStrengthSeconds(item.rest_seconds);
          const isExpanded = expandedIndex === index;
          const hasGif = !!exercise?.illustration_gif;

          return (
            <motion.div key={`${item.exercise_id}-${index}`} variants={listItem}>
              <Collapsible
                open={isExpanded}
                onOpenChange={(open) => setExpandedIndex(open ? index : null)}
              >
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "w-full flex items-center gap-2.5 rounded-xl border bg-card px-2.5 py-2 text-left transition-all active:scale-[0.98]",
                      isExpanded
                        ? "border-primary/40 shadow-sm ring-1 ring-primary/10"
                        : "hover:border-primary/30",
                    )}
                  >
                    {/* GIF thumbnail or number fallback */}
                    {hasGif ? (
                      <div className="relative h-11 w-11 shrink-0 rounded-lg overflow-hidden bg-muted/30 border border-border/50">
                        <img
                          src={exercise!.illustration_gif!}
                          alt=""
                          className="h-full w-full object-cover"
                          loading="lazy"
                          decoding="async"
                        />
                        <span className="absolute bottom-0 right-0 flex h-4 w-4 items-center justify-center rounded-tl-md bg-primary text-[9px] font-bold text-primary-foreground">
                          {index + 1}
                        </span>
                      </div>
                    ) : (
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-muted/50">
                        <span className="text-sm font-bold text-muted-foreground">{index + 1}</span>
                      </div>
                    )}

                    {/* Name + inline stats */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="font-semibold text-[13px] truncate leading-tight">
                          {exercise?.nom_exercice ?? item.exercise_name ?? "Exercice"}
                        </p>
                        {substitutions?.has(index) && (
                          <span className="shrink-0 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 px-1 py-px text-[9px] font-bold">Modifié</span>
                        )}
                        {originalItemCount !== undefined && index >= originalItemCount && (
                          <span className="shrink-0 rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 px-1 py-px text-[9px] font-bold">Ajouté</span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground font-medium mt-0.5 tabular-nums">
                        {setsVal}×{repsVal}
                        {chargeLabel && <span className="text-muted-foreground/50"> · </span>}
                        {chargeLabel && <span>{chargeLabel}</span>}
                        <span className="text-muted-foreground/50"> · </span>
                        <span>repos {restVal}</span>
                      </p>
                    </div>

                    {/* Expand chevron */}
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 shrink-0 text-muted-foreground/40 transition-transform duration-200",
                        isExpanded && "rotate-180 text-primary",
                      )}
                    />
                  </button>
                </CollapsibleTrigger>

                {/* ── Expanded details (in-place) ── */}
                <CollapsibleContent>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="mt-1 ml-2 mr-1 rounded-xl border border-border/60 bg-muted/20 overflow-hidden"
                  >
                    {/* GIF — larger view when expanded */}
                    {hasGif && (
                      <div className="bg-muted/10 flex items-center justify-center px-4 pt-3 pb-2">
                        <img
                          src={exercise!.illustration_gif!}
                          alt={exercise?.nom_exercice ?? "Exercice"}
                          className="h-32 w-auto object-contain rounded-lg"
                          loading="lazy"
                          decoding="async"
                        />
                      </div>
                    )}

                    <div className="px-3 pb-3 pt-2 space-y-2">
                      {/* Compact stat chips */}
                      <div className="flex flex-wrap gap-1.5">
                        <span className="inline-flex items-center rounded-md bg-background px-2 py-1 text-xs font-semibold border border-border/50">
                          {setsVal} <span className="text-muted-foreground font-normal ml-1">séries</span>
                        </span>
                        <span className="inline-flex items-center rounded-md bg-background px-2 py-1 text-xs font-semibold border border-border/50">
                          {repsVal} <span className="text-muted-foreground font-normal ml-1">reps</span>
                        </span>
                        <span className="inline-flex items-center rounded-md bg-background px-2 py-1 text-xs font-semibold border border-border/50">
                          {restVal} <span className="text-muted-foreground font-normal ml-1">repos</span>
                        </span>
                        {chargeLabel && (
                          <span className={cn("inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold border border-border/50", colors.bg, colors.text)}>
                            {chargeLabel}
                          </span>
                        )}
                      </div>

                      {/* Notes coach */}
                      {notes && (
                        <p className="text-xs text-muted-foreground leading-relaxed italic">
                          💬 {notes}
                        </p>
                      )}

                      {/* Replace action */}
                      {onSubstitute && (
                        <button
                          type="button"
                          className="flex items-center gap-1.5 text-[11px] font-semibold text-primary hover:text-primary/80 active:scale-95 transition-all pt-0.5"
                          onClick={() => {
                            withDisclaimer(() => {
                              setPickerTargetIndex(index);
                              setPickerOpen(true);
                            });
                          }}
                        >
                          <RefreshCw className="h-3 w-3" />
                          Remplacer cet exercice
                        </button>
                      )}
                    </div>
                  </motion.div>
                </CollapsibleContent>
              </Collapsible>
            </motion.div>
          );
        })}
        {items.length === 0 && (
          <div className="p-6 border-2 border-dashed rounded-xl text-center text-muted-foreground">
            Aucun exercice disponible pour cette séance.
          </div>
        )}
      </motion.div>

      {onAddExercise && (
        <button
          type="button"
          className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-muted-foreground/25 py-2.5 text-xs font-semibold text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors active:scale-[0.98]"
          onClick={() => withDisclaimer(() => setAddPickerOpen(true))}
        >
          <Plus className="h-3.5 w-3.5" />
          Ajouter un exercice
        </button>
      )}

      {onSubstitute && (
        <ExercisePicker
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          exercises={exercises}
          onSelect={(exercise) => {
            if (pickerTargetIndex !== null) onSubstitute(pickerTargetIndex, exercise);
            setPickerTargetIndex(null);
          }}
          title="Remplacer l'exercice"
        />
      )}

      {onAddExercise && (
        <ExercisePicker
          open={addPickerOpen}
          onOpenChange={setAddPickerOpen}
          exercises={exercises}
          onSelect={(exercise) => onAddExercise(exercise)}
          title="Ajouter un exercice"
        />
      )}

      <AlertDialog open={disclaimerOpen} onOpenChange={setDisclaimerOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Attention</AlertDialogTitle>
            <AlertDialogDescription>
              Toute modification se fait sous ta responsabilité. Le coach aura accès à la séance réelle effectuée. Des changements incohérents avec le travail demandé peuvent entraîner des risques de blessure ou une perte de performance.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingAction(null)}>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              setDisclaimerShown(true);
              setDisclaimerOpen(false);
              pendingAction?.();
              setPendingAction(null);
            }}>
              J'ai compris
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bottom action bar */}
      <BottomActionBar saveState={saveState} className="bottom-0">
        <Button
          variant="default"
          className="flex-1 h-14 rounded-xl font-bold text-base shadow-lg"
          onClick={onLaunch}
          disabled={launchDisabled}
        >
          <Play className="h-5 w-5 mr-2" />
          Lancer la séance
        </Button>
      </BottomActionBar>
    </motion.div>
  );
}
