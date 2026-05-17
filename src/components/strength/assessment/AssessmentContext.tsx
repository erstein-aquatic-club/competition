/**
 * AssessmentContext — read-only recap the coach reads BEFORE scoring a
 * "Bilan Muscu" (§287, Chantier B, Phase 8).
 *
 * Renders two reference blocks, each a shadcn Card:
 *  1. The swimmer's self-questionnaire (declared pain, injury history,
 *     mobility feel, psychology) — rendered read-only. Pain uses the
 *     shared BodyHeatMap in `view` mode.
 *  2. The latest KPI measurements — read-only, labelled via KPI_PROTOCOLS.
 *
 * Pure presentational component: no data fetching, no mutation. The screen
 * passes already-loaded data in.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Bandage,
  HeartPulse,
  Activity,
  Smile,
  Gauge,
  ClipboardList,
} from "lucide-react";
import { BodyHeatMap } from "@/components/wellness/BodyHeatMap";
import { BODY_ZONES } from "@/components/wellness/BodySvg";
import { KPI_PROTOCOLS } from "@/lib/strength/kpiProtocols";
import type {
  StrengthQuestionnaire,
  StrengthKpiMeasurement,
  StrengthKpiKey,
} from "@/lib/api/types";

const KPI_KEYS = Object.keys(KPI_PROTOCOLS) as StrengthKpiKey[];

/** Human label for a body-zone id ("left_shoulder" → "Épaule G"). */
function zoneLabel(id: string): string {
  return BODY_ZONES.find((z) => z.id === id)?.label ?? id;
}

/** 1-3 intensity → French word. */
function intensityWord(n: number): string {
  return n >= 3 ? "forte" : n === 2 ? "modérée" : "légère";
}

/** Read-only "stat" line: label left, scaled bar + value right. */
function ScaleStat({
  label,
  value,
  max = 5,
}: {
  label: string;
  value: number;
  max?: number;
}) {
  const pct = max > 0 ? Math.round((Math.max(0, value) / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-32 shrink-0 text-xs text-muted-foreground">
        {label}
      </span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-10 shrink-0 text-right text-xs font-bold tabular-nums text-foreground">
        {value > 0 ? `${value}/${max}` : "—"}
      </span>
    </div>
  );
}

export function AssessmentContext({
  questionnaire,
  kpis,
}: {
  /** The swimmer's submitted questionnaire — null if somehow absent. */
  questionnaire: StrengthQuestionnaire | null;
  /** Latest KPI value per key — null entries = never measured. */
  kpis: Record<StrengthKpiKey, StrengthKpiMeasurement | null> | undefined;
}) {
  const painZones: Record<string, number> = {};
  for (const p of questionnaire?.pain ?? []) painZones[p.body_zone] = p.intensity;
  const painCount = Object.keys(painZones).length;
  const measuredKpis = KPI_KEYS.filter((k) => kpis?.[k] != null);

  return (
    <div className="space-y-4">
      {/* ── Questionnaire nageur ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardList className="h-4 w-4 text-primary" />
            Questionnaire du nageur
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {questionnaire == null ? (
            <p className="text-sm text-muted-foreground">
              Le questionnaire du nageur n'est pas disponible.
            </p>
          ) : (
            <>
              {/* Douleurs déclarées */}
              <div className="space-y-2">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <Bandage className="h-3.5 w-3.5 text-primary" />
                  Douleurs déclarées
                </p>
                {painCount === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Aucune douleur signalée.
                  </p>
                ) : (
                  <>
                    <BodyHeatMap
                      selectedZones={{}}
                      onChange={() => {}}
                      mode="view"
                      viewData={painZones}
                    />
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(painZones).map(([zone, intensity]) => (
                        <Badge
                          key={zone}
                          variant="secondary"
                          className="font-normal"
                        >
                          {zoneLabel(zone)} · {intensityWord(intensity)}
                        </Badge>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Historique de blessures */}
              <div className="space-y-1.5">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <HeartPulse className="h-3.5 w-3.5 text-primary" />
                  Historique de blessures
                </p>
                <p className="whitespace-pre-wrap rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                  {questionnaire.injury_history?.trim() ||
                    "Aucun historique renseigné."}
                </p>
              </div>

              {/* Ressenti de mobilité */}
              <div className="space-y-2">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <Activity className="h-3.5 w-3.5 text-primary" />
                  Ressenti de mobilité
                </p>
                <ScaleStat
                  label="Souplesse perçue"
                  value={questionnaire.mobility_feel}
                />
              </div>

              {/* Psychologie */}
              <div className="space-y-2">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <Smile className="h-3.5 w-3.5 text-primary" />
                  Psychologie
                </p>
                <div className="space-y-2">
                  <ScaleStat
                    label="Confiance"
                    value={questionnaire.psychology.confidence}
                  />
                  <ScaleStat
                    label="Motivation"
                    value={questionnaire.psychology.motivation}
                  />
                  <ScaleStat
                    label="Gestion du stress"
                    value={questionnaire.psychology.stress}
                  />
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── KPIs de force ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Gauge className="h-4 w-4 text-primary" />
            KPIs de force
          </CardTitle>
        </CardHeader>
        <CardContent>
          {measuredKpis.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucun KPI de force enregistré pour ce nageur.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {measuredKpis.map((k) => {
                const m = kpis![k]!;
                const protocol = KPI_PROTOCOLS[k];
                return (
                  <li
                    key={k}
                    className="flex items-baseline justify-between gap-3 py-2 first:pt-0 last:pb-0"
                  >
                    <span className="min-w-0 truncate text-sm text-foreground">
                      {protocol.label}
                    </span>
                    <span className="shrink-0 text-sm font-bold tabular-nums text-foreground">
                      {m.value}
                      <span className="ml-0.5 text-xs font-medium text-muted-foreground">
                        {m.unit}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
