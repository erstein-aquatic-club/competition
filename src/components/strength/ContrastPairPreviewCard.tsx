import { ArrowDown, Timer, Repeat2, RefreshCw } from "lucide-react";
import type { StrengthSessionItem } from "@/lib/api/types";
import { getContrastPair } from "@/lib/strength/contrast";
import { formatWork } from "@/lib/strength/prescriptionDisplay";
import { TrainingIntentBadge } from "./TrainingIntentBadge";
import { cn } from "@/lib/utils";

export const formatContrastSeconds = (seconds: number): string => {
  if (seconds === 0) return "sans pause";
  if (seconds < 60) return `${seconds} s`;
  if (seconds % 60 === 0) return `${seconds / 60} min`;
  return `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
};

interface PairRowProps {
  letter: "A" | "B";
  item: StrengthSessionItem;
  name: string;
  image?: string | null;
  detailed: boolean;
  onReplace?: () => void;
}

function PairRow({ letter, item, name, image, detailed, onReplace }: PairRowProps) {
  const force = letter === "A";
  const rawInstruction = item.raw_payload?.source_instructions;
  const instruction = (item.notes?.trim() || (typeof rawInstruction === "string" ? rawInstruction : "")).trim();

  return (
    <div className="px-3 py-2.5 sm:px-4">
      <div className="flex items-start gap-2.5">
        <div className={cn(
          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-black",
          force ? "bg-rose-500/10 text-rose-700 dark:text-rose-300" : "bg-sky-500/10 text-sky-700 dark:text-sky-300",
        )} aria-label={force ? "Exercice A" : "Exercice B"}>{letter}</div>
        {image && (
          <img src={image} alt="" loading="lazy" decoding="async"
            className="h-11 w-11 shrink-0 rounded-lg border border-border/60 bg-muted object-cover" />
        )}
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-[13px] font-semibold leading-tight text-foreground">{name}</p>
            <TrainingIntentBadge item={item} exerciseName={name} />
          </div>
          <p className="text-[11px] font-medium text-muted-foreground tabular-nums">{formatWork(item)}</p>
          {detailed && instruction && (
            <details className="group/details">
              <summary className="cursor-pointer text-[11px] font-medium text-primary">Voir la consigne</summary>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground whitespace-pre-line">{instruction}</p>
            </details>
          )}
        </div>
        {onReplace && (
          <button type="button" onClick={onReplace}
            aria-label={`Remplacer ${name}`}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">
            <RefreshCw className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Deux exercices forment une seule unité visuelle. Les vrais items restent
 * distincts en base pour préserver charges, séries, historique et substitutions.
 */
export function ContrastPairPreviewCard({
  first, second, firstName, secondName,
  firstImage, secondImage, detailed = false,
  onReplaceFirst, onReplaceSecond,
}: {
  first: StrengthSessionItem;
  second: StrengthSessionItem;
  firstName?: string | null;
  secondName?: string | null;
  firstImage?: string | null;
  secondImage?: string | null;
  detailed?: boolean;
  onReplaceFirst?: () => void;
  onReplaceSecond?: () => void;
}) {
  const pair = getContrastPair(first);
  if (!pair) return null;
  const before = pair.rest_before_power_seconds;
  return (
    <section aria-label="Bloc de contraste force puissance"
      className="overflow-hidden rounded-2xl border border-primary/20 bg-card shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-primary/10 bg-primary/5 px-3 py-2 sm:px-4">
        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-primary">
          <Repeat2 className="h-3.5 w-3.5" />
          Contraste force / puissance
        </div>
        <span className="shrink-0 rounded-full bg-background px-2 py-0.5 text-[11px] font-semibold tabular-nums text-foreground">
          {first.sets} tours
        </span>
      </div>

      <PairRow letter="A" item={first} name={firstName || first.exercise_name || "Exercice de force"}
        image={firstImage} detailed={detailed} onReplace={onReplaceFirst} />

      <div className="flex items-center gap-2 border-y border-border/50 bg-muted/30 px-4 py-1.5">
        <ArrowDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="text-[11px] font-semibold text-muted-foreground">
          {before > 0 ? `Récupération ${formatContrastSeconds(before)} avant B` : "Enchaîner B sans pause"}
        </span>
      </div>

      <PairRow letter="B" item={second} name={secondName || second.exercise_name || "Exercice de puissance"}
        image={secondImage} detailed={detailed} onReplace={onReplaceSecond} />

      <div className="flex items-center gap-2 border-t border-border/50 bg-muted/50 px-3 py-2 sm:px-4">
        <Timer className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="flex-1 text-xs font-semibold text-foreground">
          Après B : {formatContrastSeconds(pair.rest_seconds)} de récupération
        </span>
        <span className="text-[10px] text-muted-foreground">puis tour suivant</span>
      </div>
    </section>
  );
}
