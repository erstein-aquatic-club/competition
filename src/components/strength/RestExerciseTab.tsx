import React from "react";
import { Dumbbell, StickyNote } from "lucide-react";
import type { Exercise, StrengthSessionItem } from "@/lib/api/types";

export interface RestExerciseTabProps {
  exercise: Exercise | null;
  block: StrengthSessionItem | null;
  targetWeight: number;
  muscleTags: string[];
  note: string | null | undefined;
  isTransition: boolean;
}

const formatVal = (v?: number | null) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? String(n) : "—";
};

export function RestExerciseTab({
  exercise,
  block,
  targetWeight,
  muscleTags,
  note,
  isTransition,
}: RestExerciseTabProps) {
  const label = isTransition ? "Prochain exercice" : "Exercice en cours";

  return (
    <div className="flex flex-col gap-3 overflow-y-auto pb-6">
      {/* Contextual label */}
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 text-center">
        {label}
      </p>

      {/* GIF illustration */}
      <div className="flex justify-center">
        {exercise?.illustration_gif ? (
          <div className="h-[170px] w-full max-w-[260px] overflow-hidden rounded-2xl border border-border/50 shadow-sm">
            <img
              src={exercise.illustration_gif}
              alt={exercise.nom_exercice}
              className="h-full w-full object-cover"
              loading="eager"
              decoding="async"
            />
          </div>
        ) : (
          <div className="flex h-[170px] w-full max-w-[260px] items-center justify-center rounded-2xl border border-dashed border-border/50 bg-muted/30">
            <Dumbbell className="h-10 w-10 text-muted-foreground/40" />
          </div>
        )}
      </div>

      {/* Exercise name */}
      <p className="text-center font-bold text-base tracking-tight">
        {exercise?.nom_exercice ?? "—"}
      </p>

      {/* Prescription — pill style */}
      <div className="flex items-center justify-center gap-2 text-sm">
        <span className="rounded-full bg-primary/10 px-3 py-0.5 font-semibold text-primary text-xs tabular-nums">
          {formatVal(block?.sets)} × {formatVal(block?.reps)}
        </span>
        {block?.percent_1rm ? (
          <span className="rounded-full bg-muted px-3 py-0.5 text-xs tabular-nums text-muted-foreground">
            {formatVal(block.percent_1rm)}% 1RM
          </span>
        ) : null}
        {targetWeight > 0 ? (
          <span className="rounded-full bg-muted px-3 py-0.5 text-xs tabular-nums text-muted-foreground">
            {targetWeight} kg
          </span>
        ) : null}
      </div>

      {/* Muscle tags */}
      {muscleTags.length > 0 && (
        <div className="flex flex-wrap justify-center gap-1.5">
          {muscleTags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-border/50 px-2.5 py-0.5 text-[11px] text-muted-foreground"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Coach notes */}
      {note ? (
        <div className="rounded-2xl bg-card border border-border/50 p-3.5 flex gap-2.5 items-start shadow-sm">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <StickyNote className="h-3.5 w-3.5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-1">Note coach</p>
            <p className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed">{note}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default RestExerciseTab;
