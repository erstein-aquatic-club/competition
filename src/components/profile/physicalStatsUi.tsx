/**
 * Bouts d'UI partagés par la vue « Stats physiques » (§387) et sa fiche détail
 * (`KpiDetailSheet`). Isolés ici pour éviter un cycle d'import entre les deux
 * composants (chacun importe ces helpers, aucun n'importe l'autre).
 */
import { cn } from "@/lib/utils";
import { populationComparison } from "@/lib/strength/physicalStats";
import type { BaremeConfidence } from "@/lib/strength/kpiBaremes";
import type { RankedKpi } from "@/lib/strength/wrappedStats";

/** Couleur de la bande percentile (tier 0 = plus fort → tier 4 = plus faible). */
export const TIER_STYLE: Record<number, { bar: string; text: string; chip: string }> = {
  0: { bar: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400", chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" },
  1: { bar: "bg-green-500", text: "text-green-600 dark:text-green-400", chip: "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300" },
  2: { bar: "bg-sky-500", text: "text-sky-600 dark:text-sky-400", chip: "bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300" },
  3: { bar: "bg-amber-500", text: "text-amber-600 dark:text-amber-400", chip: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300" },
  4: { bar: "bg-orange-500", text: "text-orange-600 dark:text-orange-400", chip: "bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300" },
};

export const CONFIDENCE_BADGE: Record<Exclude<BaremeConfidence, "solid">, string> = {
  transposed: "indicatif",
  placeholder: "à calibrer",
};

/** « top X % » au-dessus de la médiane, sinon la bande qualitative (un « top 80 % » serait trompeur). */
export function comparisonLabel(kpi: RankedKpi): string {
  return kpi.score >= 50 ? populationComparison(kpi.score).topLabel : kpi.band.label;
}

export function ScoreBar({ score, tier }: { score: number; tier: number }) {
  const pct = Math.min(100, Math.max(0, score));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={cn("h-full rounded-full transition-all", TIER_STYLE[tier].bar)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
