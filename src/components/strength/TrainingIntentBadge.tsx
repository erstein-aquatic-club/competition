import type { StrengthSessionItem } from "@/lib/api/types";
import { getTrainingIntent, TRAINING_INTENTS } from "@/lib/strength/contrast";
import { cn } from "@/lib/utils";

export function TrainingIntentBadge({ item, exerciseName, showCue = false }: {
  item: StrengthSessionItem | null | undefined;
  exerciseName?: string | null;
  showCue?: boolean;
}) {
  const intent = getTrainingIntent(item, exerciseName);
  if (!intent) return null;
  const { label, cue, classes } = TRAINING_INTENTS[intent];
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className={cn("inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-bold", classes)}>{label}</span>
      {showCue && <span className="text-xs text-muted-foreground">{cue}</span>}
    </span>
  );
}
