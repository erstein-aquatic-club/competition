import { Target } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PHASE_STYLES,
  shortPhaseLabel,
  type StrengthPhase,
} from "@/lib/strength/strengthPhaseStyles";
import type { MesocycleStatus } from "@/lib/strength/mesocycleProgress";

interface MyPlanMesocycleBannerProps {
  /** Objectif lisible du cycle (« 50 m crawl »). */
  objective: string;
  /** Famille du plan (« Prépa de saison », « Inter-compétitions »). */
  kindLabel: string;
  weekNumber: number;
  totalWeeks: number;
  status: MesocycleStatus;
  /** Phase de la semaine en cours (`week_type`), ou null hors fenêtre. */
  phaseLabel: string | null;
  /** Couleur de phase (point/teinte). */
  phase: StrengthPhase;
  /** « Généré le … » (V8), ou null. */
  generatedAtLabel: string | null;
}

/**
 * Bandeau « hero » en tête de « Mon plan » muscu (§341 Lot 3, finding V5) :
 * donne au nageur, d'un coup d'œil, SON objectif, OÙ il en est dans le cycle
 * (Semaine X/Y + barre), la phase en cours, et quand le plan a été généré (V8).
 * Présentationnel — toutes les valeurs sont calculées par l'appelant.
 * UI via skill `frontend-design` (langage iOS-aligned de l'app, accent de phase).
 */
export function MyPlanMesocycleBanner({
  objective,
  kindLabel,
  weekNumber,
  totalWeeks,
  status,
  phaseLabel,
  phase,
  generatedAtLabel,
}: MyPlanMesocycleBannerProps) {
  const style = PHASE_STYLES[phase];

  const pct =
    status === "upcoming"
      ? 0
      : Math.min(100, Math.round((weekNumber / Math.max(totalWeeks, 1)) * 100));

  const progressText =
    status === "upcoming"
      ? "Débute bientôt"
      : status === "done"
        ? "Cycle terminé"
        : `Semaine ${weekNumber} / ${totalWeeks}`;

  return (
    <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-card to-muted/40 mb-4">
      {/* Accent de phase (barre gauche) */}
      <div className={cn("absolute inset-y-0 left-0 w-1", style.dot)} aria-hidden />
      {/* Halo doux dans la couleur de phase (haut-droite) */}
      <div
        className={cn(
          "pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full opacity-[0.18] blur-2xl",
          style.dot,
        )}
        aria-hidden
      />

      <div className="relative px-4 py-3.5 pl-5">
        {/* Kicker + chip de phase */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {kindLabel}
          </span>
          {phaseLabel ? (
            <span
              className={cn(
                "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold max-w-[8rem] truncate",
                style.bg,
                style.text,
              )}
              title={phaseLabel}
            >
              {shortPhaseLabel(phaseLabel)}
            </span>
          ) : null}
        </div>

        {/* Objectif (hero) */}
        <div className="mt-1.5 flex items-center gap-2">
          <Target className={cn("h-[18px] w-[18px] shrink-0", style.text)} aria-hidden />
          <h3 className="text-[17px] font-bold leading-tight tracking-tight text-foreground first-letter:uppercase">
            {objective}
          </h3>
        </div>

        {/* Progression dans le cycle */}
        <div className="mt-3">
          <div className="mb-1 flex items-baseline justify-between gap-2 text-[11px]">
            <span className="font-semibold tabular-nums text-foreground">
              {progressText}
            </span>
            {generatedAtLabel ? (
              <span className="text-muted-foreground/70">
                Généré le {generatedAtLabel}
              </span>
            ) : null}
          </div>
          <div
            className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={totalWeeks}
            aria-valuenow={status === "upcoming" ? 0 : weekNumber}
            aria-label={`Progression du cycle : ${progressText}`}
          >
            <div
              className={cn("h-full rounded-full transition-all duration-500", style.dot)}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
