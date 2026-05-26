/**
 * ExercisePrioritySelector (§320) — contrôle coach de `selection_priority`.
 *
 * Pilote l'ordre de sélection d'un exercice dans son seau lors de la génération
 * du mésocycle (`selectExercises` trie sur `selection_priority` décroissant en
 * premier — cf. §319). Plus haut = pioché d'abord (staple) ; 0 = normal ;
 * négatif = évité (reste au catalogue mais relégué).
 *
 * UX : saisie numérique fine (ordonnancement entre deux staples) + pastilles
 * d'accès rapide + badge de palier lisible. Aligné sur le style des autres
 * champs du dialog catalogue.
 */
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Palier lisible dérivé de la valeur numérique. */
function tierFor(v: number): { label: string; className: string } {
  if (v >= 50) return { label: "⭐ Prioritaire", className: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300" };
  if (v > 0) return { label: "Préféré", className: "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300" };
  if (v < 0) return { label: "À éviter", className: "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300" };
  return { label: "Normal", className: "border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300" };
}

const QUICK_SET = [
  { label: "Prioritaire", value: 100 },
  { label: "Préféré", value: 50 },
  { label: "Normal", value: 0 },
  { label: "À éviter", value: -10 },
] as const;

export function ExercisePrioritySelector({
  value,
  onChange,
}: {
  value: number;
  onChange: (next: number) => void;
}) {
  const tier = tierFor(value);
  return (
    <div className="space-y-2">
      <Label htmlFor="exercise-selection-priority">Priorité de sélection</Label>
      <div className="flex items-center gap-2">
        <Input
          id="exercise-selection-priority"
          type="number"
          step={10}
          value={value}
          onChange={(e) => onChange(Number.isFinite(e.target.valueAsNumber) ? Math.round(e.target.valueAsNumber) : 0)}
          className="w-24"
        />
        <span
          className={cn(
            "inline-flex h-6 items-center rounded-full border px-2 text-xs font-semibold",
            tier.className,
          )}
        >
          {tier.label}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {QUICK_SET.map((q) => (
          <button
            key={q.value}
            type="button"
            onClick={() => onChange(q.value)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
              value === q.value
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-transparent text-muted-foreground hover:bg-muted",
            )}
          >
            {q.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Plus élevé = pioché en premier dans son seau lors de la génération du mésocycle (avant
        is_core/niveau). 0 = normal, négatif = évité (l'exercice reste au catalogue).
      </p>
    </div>
  );
}
