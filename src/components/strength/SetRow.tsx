import { memo } from "react";
import { Check, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StrengthSessionItem } from "@/lib/api/types";
import type { Exercise } from "@/lib/api/types";

const formatStrengthValue = (value?: number | null) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return "—";
  }
  return String(numeric);
};

export interface SetRowProps {
  item: StrengthSessionItem;
  index: number;
  exercise: Exercise | undefined;
  loggedSets: number;
  isActive: boolean;
  hasPr: boolean;
}

function SetRowImpl({ item, index, exercise, loggedSets, isActive, hasPr }: SetRowProps) {
  const isDone = loggedSets >= (item.sets ?? 0);

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors",
        isActive && "border-primary bg-primary/5",
        isDone && !isActive && "opacity-50",
      )}
    >
      <div
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
          isDone ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
        )}
      >
        {isDone ? <Check className="h-3.5 w-3.5" /> : index + 1}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">
          {exercise?.nom_exercice ?? item.exercise_name}
        </p>
        <p className="text-xs text-muted-foreground">
          {formatStrengthValue(item.sets)}×{formatStrengthValue(item.reps)}
        </p>
      </div>
      {hasPr && <Trophy className="h-3.5 w-3.5 shrink-0 text-amber-500" />}
      <span className="text-xs font-mono font-semibold text-muted-foreground shrink-0">
        {loggedSets}/{formatStrengthValue(item.sets)}
      </span>
    </div>
  );
}

export const SetRow = memo(SetRowImpl, (prev, next) =>
  prev.loggedSets === next.loggedSets &&
  prev.isActive === next.isActive &&
  prev.hasPr === next.hasPr &&
  prev.index === next.index &&
  prev.item === next.item &&
  prev.exercise === next.exercise,
);
