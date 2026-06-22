/**
 * KpiDetailSheet — fiche détail SYNTHÉTIQUE d'un KPI muscu, ouverte au clic
 * depuis la vue « Stats physiques » (§387, §389). Bottom sheet iOS regroupant :
 * score & comparaison population, dernière mesure (essais résumés en une ligne,
 * sans le poids du nageur), mini-historique (Δ vs mesure comparable), et
 * protocole de mesure replié par défaut.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  Info,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronDown,
} from "lucide-react";
import { getKpiHistory } from "@/lib/api";
import { baremeConfidenceFor } from "@/lib/strength/kpiBaremes";
import { KPI_PROTOCOLS } from "@/lib/strength/kpiProtocols";
import {
  populationComparison,
  summarizeAttempts,
  buildKpiHistoryRows,
  formatKpiValue,
} from "@/lib/strength/physicalStats";
import type { RankedKpi } from "@/lib/strength/wrappedStats";
import type { StrengthKpiMeasurement } from "@/lib/api/types";
import { TIER_STYLE, CONFIDENCE_BADGE, ScoreBar } from "./physicalStatsUi";

/** Nombre de mesures affichées dans le mini-historique. */
const HISTORY_LIMIT = 5;

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return format(d, "d MMM yyyy", { locale: fr });
}

export default function KpiDetailSheet({
  kpi,
  measurement,
  athleteId,
  onClose,
}: {
  kpi: RankedKpi | null;
  measurement: StrengthKpiMeasurement | null;
  athleteId: number;
  onClose: () => void;
}) {
  const open = !!kpi;
  const [showProtocol, setShowProtocol] = useState(false);

  // Replie le protocole à chaque changement de KPI (la fiche reste montée).
  useEffect(() => {
    setShowProtocol(false);
  }, [kpi?.key]);

  const { data: history, isLoading } = useQuery({
    queryKey: ["kpi-history", athleteId, kpi?.key],
    queryFn: () => getKpiHistory(athleteId, kpi!.key),
    enabled: open && athleteId > 0 && !!kpi,
    staleTime: 5 * 60 * 1000,
  });

  const protocol = kpi ? KPI_PROTOCOLS[kpi.key] : null;
  const comparison = kpi ? populationComparison(kpi.score) : null;
  const style = kpi ? TIER_STYLE[kpi.band.tier] : null;
  const confidence = kpi ? baremeConfidenceFor(kpi.key) : "solid";
  const attempt = measurement ? summarizeAttempts(measurement) : null;
  const historyRows = useMemo(() => buildKpiHistoryRows(history ?? []), [history]);
  const pendingReview =
    measurement?.source === "wizard_athlete" && measurement?.coach_reviewed === false;

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="bottom" className="max-h-[88vh] overflow-y-auto">
        {kpi && protocol && comparison && style ? (
          <>
            <SheetHeader className="pr-10 text-left">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {kpi.bucket}
              </p>
              <SheetTitle className="text-xl">{protocol.label}</SheetTitle>
            </SheetHeader>

            <div className="mt-4 space-y-4">
              {/* Score & comparaison population — l'essentiel */}
              <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-eyebrow-sm text-muted-foreground">
                      Score vs population
                    </p>
                    <p className={cn("mt-1 text-3xl font-bold tabular-nums leading-none", style.text)}>
                      {Math.round(kpi.score)}
                      <span className="ml-1 text-sm font-medium text-muted-foreground">/ 100</span>
                    </p>
                  </div>
                  <div className="text-right">
                    <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-sm font-bold", style.chip)}>
                      {kpi.score >= 50 ? comparison.topLabel : kpi.band.label}
                    </span>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {comparison.betterThanLabel} de même âge et sexe
                    </p>
                  </div>
                </div>
                <div className="mt-3">
                  <ScoreBar score={kpi.score} tier={kpi.band.tier} />
                </div>
                {confidence !== "solid" ? (
                  <p className="mt-2.5 flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground">
                    <Info className="mt-0.5 h-3 w-3 shrink-0" />
                    Barème <span className="font-semibold text-foreground">{CONFIDENCE_BADGE[confidence]}</span> :
                    score approximatif (réf. non-natation), la mesure brute reste fiable.
                  </p>
                ) : null}
              </div>

              {/* Dernière mesure — compacte, essais en une ligne (sans poids du nageur) */}
              {measurement ? (
                <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-2xl font-bold tabular-nums text-foreground">
                      {formatKpiValue(measurement.value)}
                      <span className="ml-1 text-sm font-medium text-muted-foreground">
                        {measurement.unit}
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {fmtDate(measurement.measured_at)}
                    </span>
                  </div>
                  {attempt ? (
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{attempt.label} :</span>{" "}
                      <span className="tabular-nums">{attempt.value}</span>
                    </p>
                  ) : null}
                  {pendingReview ? (
                    <span className="mt-2 inline-flex items-center rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-700 dark:bg-sky-950/50 dark:text-sky-300">
                      à valider par le coach
                    </span>
                  ) : null}
                  {measurement.notes ? (
                    <p className="mt-2 rounded-xl bg-muted/50 px-3 py-2 text-xs italic text-muted-foreground">
                      « {measurement.notes} »
                    </p>
                  ) : null}
                </div>
              ) : null}

              {/* Mini-historique */}
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-eyebrow-sm text-muted-foreground">
                  Évolution
                </p>
                {isLoading ? (
                  <Skeleton className="h-11 rounded-xl" />
                ) : historyRows.length <= 1 ? (
                  <p className="text-sm text-muted-foreground">
                    {historyRows.length === 1
                      ? "Première mesure — l'évolution apparaîtra au prochain bilan."
                      : "Aucune mesure enregistrée."}
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {historyRows.slice(0, HISTORY_LIMIT).map((row) => {
                      const up = row.deltaVsPrev != null && row.deltaVsPrev > 0;
                      const down = row.deltaVsPrev != null && row.deltaVsPrev < 0;
                      return (
                        <div
                          key={row.id}
                          className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/70 px-3.5 py-2"
                        >
                          <span className="text-xs text-muted-foreground">{fmtDate(row.measuredAt)}</span>
                          <div className="flex items-center gap-2.5">
                            <span className="text-sm font-semibold tabular-nums text-foreground">
                              {formatKpiValue(row.value)} {row.unit}
                            </span>
                            {row.deltaVsPrev != null ? (
                              <span
                                className={cn(
                                  "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums",
                                  up && "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
                                  down && "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300",
                                  !up && !down && "bg-muted text-muted-foreground",
                                )}
                              >
                                {up && <TrendingUp className="h-3 w-3" />}
                                {down && <TrendingDown className="h-3 w-3" />}
                                {!up && !down && <Minus className="h-3 w-3" />}
                                {row.deltaVsPrev > 0 ? "+" : ""}
                                {formatKpiValue(row.deltaVsPrev)}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                    {historyRows.length > HISTORY_LIMIT ? (
                      <p className="pt-0.5 text-center text-[11px] text-muted-foreground">
                        + {historyRows.length - HISTORY_LIMIT} mesure
                        {historyRows.length - HISTORY_LIMIT > 1 ? "s" : ""} plus ancienne
                        {historyRows.length - HISTORY_LIMIT > 1 ? "s" : ""}
                      </p>
                    ) : null}
                  </div>
                )}
              </div>

              {/* Protocole — replié par défaut */}
              <div className="rounded-2xl border border-border/70 bg-background/70">
                <button
                  type="button"
                  onClick={() => setShowProtocol((v) => !v)}
                  aria-expanded={showProtocol}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-2xl"
                >
                  <span className="text-sm font-semibold text-foreground">Voir le protocole</span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                      showProtocol && "rotate-180",
                    )}
                  />
                </button>
                {showProtocol ? (
                  <div className="space-y-3 border-t border-border/60 px-4 py-3">
                    <ol className="space-y-1.5">
                      {protocol.steps.map((step, i) => (
                        <li key={i} className="flex gap-2.5 text-sm text-muted-foreground">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                            {i + 1}
                          </span>
                          <span className="leading-snug">{step}</span>
                        </li>
                      ))}
                    </ol>
                    <p className="rounded-xl bg-muted/40 px-3 py-2 text-[11px] leading-snug text-muted-foreground">
                      <span className="font-semibold text-foreground">Binôme :</span> {protocol.partnerRole}
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
