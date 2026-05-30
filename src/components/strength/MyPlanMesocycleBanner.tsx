import { Sparkles, Target } from "lucide-react";
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
  /** §345 — bouton « Récap » intégré au bandeau (sinon ligne séparée). */
  recapEnabled?: boolean;
  onOpenRecap?: () => void;
}

/**
 * Bandeau « hero » COMPACT en tête de « Mon plan » muscu (§342 V5, condensé
 * §345) : objectif + position du cycle (Semaine X/Y + barre) + phase, sur 2
 * lignes seulement, avec le bouton « Récap » absorbé dans l'en-tête (au lieu
 * d'une ligne dédiée au-dessus). Présentationnel — valeurs calculées par
 * l'appelant. UI via skill `frontend-design`.
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
  recapEnabled = false,
  onOpenRecap,
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

  const metaLine = generatedAtLabel
    ? `${kindLabel} · Généré le ${generatedAtLabel}`
    : kindLabel;

  return (
    <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-card to-muted/40 mb-3">
      {/* Accent de phase (barre gauche) */}
      <div className={cn("absolute inset-y-0 left-0 w-1", style.dot)} aria-hidden />
      {/* Halo doux dans la couleur de phase */}
      <div
        className={cn(
          "pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-[0.16] blur-2xl",
          style.dot,
        )}
        aria-hidden
      />

      <div className="relative px-3.5 py-2.5 pl-4">
        {/* Ligne 1 — objectif · chip phase · Récap */}
        <div className="flex items-center gap-2">
          <Target className={cn("h-4 w-4 shrink-0", style.text)} aria-hidden />
          <h3 className="min-w-0 flex-1 truncate text-[15px] font-bold leading-tight tracking-tight text-foreground first-letter:uppercase">
            {objective}
          </h3>
          {phaseLabel ? (
            <span
              className={cn(
                "inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
                style.bg,
                style.text,
              )}
              title={phaseLabel}
            >
              {shortPhaseLabel(phaseLabel)}
            </span>
          ) : null}
          {recapEnabled && onOpenRecap ? (
            <button
              type="button"
              onClick={onOpenRecap}
              className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Récap
            </button>
          ) : null}
        </div>

        {/* Ligne 2 — barre de progression + position */}
        <div className="mt-2 flex items-center gap-2.5">
          <div
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
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
          <span className="shrink-0 text-[11px] font-semibold tabular-nums text-foreground">
            {progressText}
          </span>
        </div>

        {/* Méta (famille + date de génération) — ligne fine */}
        <p className="mt-1 truncate text-[10px] text-muted-foreground/70">
          {metaLine}
        </p>
      </div>
    </div>
  );
}
