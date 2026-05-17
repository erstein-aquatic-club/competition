/**
 * KpiRecap — post-submission summary of a wizard run.
 *
 * Lists every KPI that was recorded, each diffed against the previous
 * measurement (captured BEFORE submit). For athlete-sourced runs, shows a
 * note that the coach will review the measurements.
 */
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, TrendingUp, TrendingDown, Minus, Info, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { KPI_PROTOCOLS } from "@/lib/strength/kpiProtocols";
import type { StrengthKpiKey, StrengthKpiMeasurement } from "@/lib/api/types";

export interface KpiRecapEntry {
  kpi_key: StrengthKpiKey;
  value: number;
  unit: string;
  /** Previous measurement for this KPI, or null if this is the first record. */
  previous: StrengthKpiMeasurement | null;
}

export function KpiRecap({
  entries,
  athleteName,
  isAthleteSource,
  onRestart,
  onClose,
}: {
  entries: KpiRecapEntry[];
  athleteName: string;
  isAthleteSource: boolean;
  onRestart: () => void;
  onClose: () => void;
}) {
  return (
    <div className="space-y-5">
      {/* Success header */}
      <div className="flex flex-col items-center pt-2 text-center">
        <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <CheckCircle2 className="h-9 w-9 text-primary" />
        </div>
        <h2 className="text-xl font-bold tracking-tight text-foreground">
          Bilan enregistré
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {entries.length} mesure{entries.length > 1 ? "s" : ""} pour {athleteName}
        </p>
      </div>

      {/* Athlete-source review note */}
      {isAthleteSource && (
        <div className="flex items-start gap-2.5 rounded-xl border border-sky-200/70 bg-sky-50/70 px-3.5 py-3 dark:border-sky-800/50 dark:bg-sky-950/25">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
          <p className="text-sm leading-snug text-sky-900 dark:text-sky-100">
            Ton coach examinera ces mesures et les validera prochainement.
          </p>
        </div>
      )}

      {/* Recorded values */}
      <div className="space-y-2.5">
        {entries.map((entry) => {
          const protocol = KPI_PROTOCOLS[entry.kpi_key];
          const prev = entry.previous?.value ?? null;
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
                {delta != null ? (
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

      {/* Actions */}
      <div className="flex flex-col gap-2 pt-1">
        <Button className="h-12 w-full rounded-2xl text-base font-semibold" onClick={onClose}>
          Terminer
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
