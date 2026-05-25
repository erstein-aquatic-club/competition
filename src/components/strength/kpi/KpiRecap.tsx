/**
 * KpiRecap — post-submission summary of a wizard run.
 *
 * Lists every KPI that was recorded, each diffed against the previous
 * measurement (captured BEFORE submit). For athlete-sourced runs, shows a
 * note that the coach will review the measurements. When part of the submit
 * failed, surfaces a retry affordance scoped to the failed KPIs only.
 */
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  Minus,
  Info,
  Sparkles,
  AlertTriangle,
  HelpCircle,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { KPI_PROTOCOLS } from "@/lib/strength/kpiProtocols";
import { baremeConfidenceFor } from "@/lib/strength/kpiBaremes";
import type { BaremeConfidence } from "@/lib/strength/kpiBaremes";
import type { StrengthKpiKey, StrengthKpiMeasurement } from "@/lib/api/types";

/**
 * Présentation de la fiabilité du barème par KPI (§301 T3). On ne badge QUE les
 * barèmes non sourcés natation (`transposed` / `placeholder`) — un barème
 * `solid` n'a pas besoin d'avertissement. Le message clé : la **mesure brute
 * reste fiable**, c'est le **score 0-100 dérivé** qui est approximatif.
 */
const BAREME_BADGE: Record<
  Exclude<BaremeConfidence, "solid">,
  { label: string; className: string }
> = {
  transposed: {
    label: "indicatif",
    className:
      "bg-muted text-muted-foreground",
  },
  placeholder: {
    label: "à calibrer",
    className:
      "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
  },
};

export interface KpiRecapEntry {
  kpi_key: StrengthKpiKey;
  value: number;
  unit: string;
  /**
   * Previous measurement for diffing:
   *  - a measurement → diff against it,
   *  - `null`        → known-absent, genuine first measurement,
   *  - `undefined`   → baseline unknown (history query failed) — no badge.
   */
  previous: StrengthKpiMeasurement | null | undefined;
}

export function KpiRecap({
  entries,
  athleteName,
  isAthleteSource,
  failedCount = 0,
  baselineUnavailable = false,
  isRetrying = false,
  onRetry,
  onRestart,
  onClose,
  closeLabel = "Terminer",
}: {
  entries: KpiRecapEntry[];
  athleteName: string;
  isAthleteSource: boolean;
  /** Number of KPIs that failed to persist on the last submit. */
  failedCount?: number;
  /** True when the previous-measurement history could not be loaded. */
  baselineUnavailable?: boolean;
  /** True while a retry of the failed KPIs is in flight. */
  isRetrying?: boolean;
  /** Re-submit the failed KPIs only. Required when `failedCount > 0`. */
  onRetry?: () => void;
  onRestart: () => void;
  onClose: () => void;
  /** Overrides the default "Terminer" label on the primary close action. */
  closeLabel?: string;
}) {
  const hasFailures = failedCount > 0;

  return (
    <div className="space-y-5">
      {/* Header — reflects whether the run fully succeeded */}
      <div className="flex flex-col items-center pt-2 text-center">
        <div
          className={cn(
            "mb-3 flex h-16 w-16 items-center justify-center rounded-full",
            hasFailures ? "bg-amber-100 dark:bg-amber-950/40" : "bg-primary/10",
          )}
        >
          {hasFailures ? (
            <AlertTriangle className="h-9 w-9 text-amber-600 dark:text-amber-400" />
          ) : (
            <CheckCircle2 className="h-9 w-9 text-primary" />
          )}
        </div>
        <h2 className="text-xl font-bold tracking-tight text-foreground">
          {hasFailures ? "Bilan partiellement enregistré" : "Bilan enregistré"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {entries.length} mesure{entries.length > 1 ? "s" : ""} pour {athleteName}
        </p>
      </div>

      {/* Partial-failure banner with a retry scoped to the failed KPIs */}
      {hasFailures && (
        <div className="flex flex-col gap-2.5 rounded-xl border border-amber-200/70 bg-amber-50/70 px-3.5 py-3 dark:border-amber-800/50 dark:bg-amber-950/25">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <p className="text-sm leading-snug text-amber-900 dark:text-amber-100">
              {failedCount === 1
                ? "Un KPI n'a pas pu être enregistré. Réessaie pour l'envoyer à nouveau."
                : `${failedCount} KPIs n'ont pas pu être enregistrés. Réessaie pour les envoyer à nouveau.`}
            </p>
          </div>
          {onRetry && (
            <Button
              variant="outline"
              className="h-10 w-full rounded-xl border-amber-300 font-semibold text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-100 dark:hover:bg-amber-900/40"
              onClick={onRetry}
              disabled={isRetrying}
            >
              <RotateCcw
                className={cn("mr-1.5 h-4 w-4", isRetrying && "animate-spin")}
              />
              {isRetrying ? "Envoi en cours…" : "Réessayer"}
            </Button>
          )}
        </div>
      )}

      {/* Athlete-source review note */}
      {isAthleteSource && (
        <div className="flex items-start gap-2.5 rounded-xl border border-sky-200/70 bg-sky-50/70 px-3.5 py-3 dark:border-sky-800/50 dark:bg-sky-950/25">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
          <p className="text-sm leading-snug text-sky-900 dark:text-sky-100">
            Ton coach examinera ces mesures et les validera prochainement.
          </p>
        </div>
      )}

      {/* Baseline-unavailable note — the previous-measurement history failed
          to load, so no progression diff can be shown for this run. */}
      {baselineUnavailable && (
        <div className="flex items-start gap-2.5 rounded-xl border border-border bg-muted/40 px-3.5 py-3">
          <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-sm leading-snug text-muted-foreground">
            Historique indisponible — impossible de comparer aux mesures
            précédentes pour le moment.
          </p>
        </div>
      )}

      {/* Recorded values */}
      <div className="space-y-2.5">
        {entries.map((entry) => {
          const protocol = KPI_PROTOCOLS[entry.kpi_key];
          // `undefined` previous → baseline unknown → show no badge at all.
          // `null` → known first measurement. A measurement → real diff.
          const baselineKnown = entry.previous !== undefined;
          // A previous measurement is only comparable when it used the same
          // unit — `vertical_jump` moved from cm to W/kg in §293, so an older
          // cm row must not be diffed against a new W/kg one.
          const comparablePrev =
            entry.previous && entry.previous.unit === entry.unit
              ? entry.previous
              : null;
          const prev = comparablePrev ? comparablePrev.value : null;
          const delta = prev != null ? entry.value - prev : null;
          const improved = delta != null && delta > 0;
          const declined = delta != null && delta < 0;

          return (
            <Card key={entry.kpi_key} className="flex items-center gap-3 p-3.5">
              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {protocol.bucket}
                </span>
                <p className="truncate text-sm font-semibold text-foreground">
                  {protocol.label}
                </p>
                {(() => {
                  const confidence = baremeConfidenceFor(entry.kpi_key);
                  if (confidence === "solid") return null;
                  const badge = BAREME_BADGE[confidence];
                  return (
                    <span
                      className={cn(
                        "mt-1 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                        badge.className,
                      )}
                      title="Le score 0-100 dérivé de ce barème est approximatif (référence non-natation) — la mesure brute reste fiable."
                    >
                      <Info className="h-3 w-3" />
                      Barème {badge.label}
                    </span>
                  );
                })()}
                {prev != null && (
                  <p className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
                    Précédent : {prev} {entry.unit}
                  </p>
                )}
              </div>

              <div className="shrink-0 text-right">
                <div className="text-lg font-bold tabular-nums text-foreground">
                  {entry.value}
                  <span className="ml-0.5 text-xs font-medium text-muted-foreground">
                    {entry.unit}
                  </span>
                </div>
                {!baselineKnown ? null : delta != null ? (
                  <div
                    className={cn(
                      "mt-0.5 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums",
                      improved &&
                        "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
                      declined &&
                        "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300",
                      !improved &&
                        !declined &&
                        "bg-muted text-muted-foreground",
                    )}
                  >
                    {improved && <TrendingUp className="h-3 w-3" />}
                    {declined && <TrendingDown className="h-3 w-3" />}
                    {!improved && !declined && <Minus className="h-3 w-3" />}
                    {delta > 0 ? "+" : ""}
                    {Number(delta.toFixed(1))} {entry.unit}
                  </div>
                ) : (
                  <div className="mt-0.5 inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] font-bold text-primary">
                    <Sparkles className="h-3 w-3" />
                    1ère mesure
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Note barèmes — n'apparaît que si un KPI mesuré n'est pas sur barème solide */}
      {entries.some((e) => baremeConfidenceFor(e.kpi_key) !== "solid") && (
        <div className="flex items-start gap-2.5 rounded-xl border bg-muted/40 px-3.5 py-2.5">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <p className="text-[11px] leading-snug text-muted-foreground">
            <span className="font-semibold text-foreground">Barème indicatif / à calibrer :</span>{" "}
            le score 0-100 calculé à partir de ces mesures sera approximatif
            (référence non-natation). La mesure brute, elle, reste fiable et
            comparable dans le temps.
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col gap-2 pt-1">
        <Button className="h-12 w-full rounded-2xl text-base font-semibold" onClick={onClose}>
          {closeLabel}
        </Button>
        <Button
          variant="outline"
          className="h-12 w-full rounded-2xl text-base font-semibold"
          onClick={onRestart}
        >
          Nouveau bilan
        </Button>
      </div>
    </div>
  );
}
