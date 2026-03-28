import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ArrowDown, ArrowUp, ChevronDown, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ExercisePickerDrawer } from "./ExercisePickerDrawer";
import type { Exercise, StrengthSessionItem } from "@/lib/api";

interface StrengthExerciseCardProps {
  exercise: StrengthSessionItem;
  exercises: Exercise[];
  exerciseFilter: "all" | "strength" | "warmup";
  index: number;
  totalItems: number;
  onChange: (field: string, value: string | number | null) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

export function StrengthExerciseCard({
  exercise,
  exercises,
  exerciseFilter,
  index,
  totalItems,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
}: StrengthExerciseCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [gifDialogOpen, setGifDialogOpen] = useState(false);

  const filteredExercises = exercises.filter((ex) => {
    if (exerciseFilter === "all") return true;
    return ex.exercise_type === exerciseFilter;
  });

  const currentExercise = exercises.find((ex) => ex.id === exercise.exercise_id);
  const exerciseName = currentExercise?.nom_exercice ?? "Exercice";
  const isWarmup = currentExercise?.exercise_type === "warmup";
  const gifUrl = currentExercise?.illustration_gif;

  return (
    <>
      <Card
        className={cn(
          "rounded-xl border-border transition-all",
          expanded && "ring-1 ring-primary/10 border-primary/40"
        )}
      >
        {/* Collapsed header — always visible */}
        <button
          type="button"
          className="flex w-full items-center gap-2.5 px-2.5 py-2 text-left"
          onClick={() => setExpanded(!expanded)}
        >
          {/* GIF thumbnail or number fallback */}
          {gifUrl ? (
            <div className="relative h-11 w-11 shrink-0 rounded-lg overflow-hidden bg-muted/30 border border-border/50">
              <img
                src={gifUrl}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
                decoding="async"
              />
              <span className="absolute bottom-0 right-0 flex h-4 w-4 items-center justify-center rounded-tl-md bg-muted text-[9px] font-bold text-muted-foreground">
                {index + 1}
              </span>
            </div>
          ) : (
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-muted/50">
              <span className="text-sm font-bold text-muted-foreground">{index + 1}</span>
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-[13px] font-semibold leading-tight">{exerciseName}</span>
              {isWarmup && (
                <span className="shrink-0 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 px-1 py-px text-[9px] font-bold">
                  Échauf.
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
              {exercise.sets}&times;{exercise.reps}
              {exercise.percent_1rm ? <><span className="text-muted-foreground/40"> · </span>{exercise.percent_1rm}% 1RM</> : ""}
              {exercise.rest_seconds ? <><span className="text-muted-foreground/40"> · </span>repos {exercise.rest_seconds}s</> : ""}
            </p>
          </div>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground/40 transition-transform duration-200",
              expanded && "rotate-180 text-primary"
            )}
          />
        </button>

        {/* Expanded content */}
        {expanded && (
          <div className="border-t border-border px-3 pb-3 pt-3 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Séries</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={exercise.sets === 0 ? "" : exercise.sets}
                  onChange={(e) => onChange("sets", e.target.value === "" ? 0 : Number(e.target.value))}
                  className="rounded-xl h-10"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Reps</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={exercise.reps === 0 ? "" : exercise.reps}
                  onChange={(e) => onChange("reps", e.target.value === "" ? 0 : Number(e.target.value))}
                  className="rounded-xl h-10"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">% 1RM</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={exercise.percent_1rm === 0 ? "" : exercise.percent_1rm}
                  onChange={(e) => onChange("percent_1rm", e.target.value === "" ? 0 : Number(e.target.value))}
                  className="rounded-xl h-10"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Repos (s)</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={exercise.rest_seconds === 0 ? "" : exercise.rest_seconds}
                  onChange={(e) => onChange("rest_seconds", e.target.value === "" ? 0 : Number(e.target.value))}
                  className="rounded-xl h-10"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Exercice</Label>
              <ExercisePickerDrawer
                exercises={filteredExercises}
                selectedId={exercise.exercise_id}
                onSelect={(id) => onChange("exercise_id", id)}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Notes</Label>
              <Textarea
                value={exercise.notes ?? ""}
                onChange={(e) => onChange("notes", e.target.value || null)}
                placeholder="Notes optionnelles..."
                className="rounded-xl min-h-[60px]"
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onMoveUp(); }}
                  disabled={index === 0}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-muted disabled:opacity-30"
                  aria-label="Monter"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onMoveDown(); }}
                  disabled={index === totalItems - 1}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-muted disabled:opacity-30"
                  aria-label="Descendre"
                >
                  <ArrowDown className="h-4 w-4" />
                </button>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="inline-flex h-9 items-center gap-2 rounded-full px-3 text-xs font-medium text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Supprimer
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* GIF enlarge dialog */}
      {gifUrl && (
        <Dialog open={gifDialogOpen} onOpenChange={setGifDialogOpen}>
          <DialogContent className="sm:max-w-md p-2">
            <div className="flex flex-col items-center gap-2">
              <img
                src={gifUrl}
                alt={exerciseName}
                className="w-full max-h-[70vh] object-contain rounded-lg"
              />
              <p className="text-sm font-medium text-center">{exerciseName}</p>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
