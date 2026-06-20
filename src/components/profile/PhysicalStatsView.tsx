/**
 * PhysicalStatsView — vue « Stats physiques » du profil nageur (§387).
 *
 * Résume les KPIs muscu mesurés : indice physique global, points forts, axes de
 * progression, et détail par KPI (mesure brute + score + comparaison population
 * « top X % »). Branche le scoring existant (`rankKpis` → barèmes percentiles)
 * sur les dernières mesures du nageur ; toute l'agrégation passe par le module
 * pur `physicalStats.ts`.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import {
  ChevronLeft,
  Activity,
  Flame,
  Target,
  Info,
  Dumbbell,
  Sparkles,
  CheckCircle2,
} from "lucide-react";
import { getLatestKpiMeasurements } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fadeIn } from "@/lib/animations";
import { ageBandFor, baremeConfidenceFor } from "@/lib/strength/kpiBaremes";
import type { BaremeConfidence } from "@/lib/strength/kpiBaremes";
import { rankKpis, type RankedKpi } from "@/lib/strength/wrappedStats";
import {
  buildPhysicalStatsSummary,
  populationComparison,
  formatKpiValue,
} from "@/lib/strength/physicalStats";
import type { StrengthKpiKey, StrengthKpiMeasurement } from "@/lib/api/types";

function ageFromBirthdate(birthdate: string | null | undefined): number | null {
  if (!birthdate) return null;
  const b = new Date(String(birthdate).split("T")[0] + "T00:00:00");
  if (Number.isNaN(b.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
}

/** Couleur de la bande percentile (tier 0 = plus fort → tier 4 = plus faible). */
const TIER_STYLE: Record<number, { bar: string; text: string; chip: string }> = {
  0: { bar: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400", chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" },
  1: { bar: "bg-green-500", text: "text-green-600 dark:text-green-400", chip: "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300" },
  2: { bar: "bg-sky-500", text: "text-sky-600 dark:text-sky-400", chip: "bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300" },
  3: { bar: "bg-amber-500", text: "text-amber-600 dark:text-amber-400", chip: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300" },
  4: { bar: "bg-orange-500", text: "text-orange-600 dark:text-orange-400", chip: "bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300" },
};

const CONFIDENCE_BADGE: Record<Exclude<BaremeConfidence, "solid">, string> = {
  transposed: "indicatif",
  placeholder: "à calibrer",
};

/** Libellé de comparaison population : « top X % » au-dessus de la médiane, sinon la bande qualitative. */
function comparisonLabel(kpi: RankedKpi): string {
  return kpi.score >= 50 ? populationComparison(kpi.score).topLabel : kpi.band.label;
}

function Header({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={onBack}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-background/70 transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Retour"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <h1 className="type-headline">Stats physiques</h1>
    </div>
  );
}

function ScoreBar({ score, tier }: { score: number; tier: number }) {
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

function KpiDetailRow({
  kpi,
  measurement,
}: {
  kpi: RankedKpi;
  measurement: StrengthKpiMeasurement | null;
}) {
  const style = TIER_STYLE[kpi.band.tier];
  const confidence = baremeConfidenceFor(kpi.key);
  const pendingReview =
    measurement?.source === "wizard_athlete" && measurement?.coach_reviewed === false;

  return (
    <div className="rounded-2xl border border-border/70 bg-background/70 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {kpi.bucket}
          </p>
          <p className="truncate text-sm font-semibold text-foreground">{kpi.label}</p>
        </div>
        {measurement ? (
          <div className="shrink-0 text-right">
            <div className="text-base font-bold tabular-nums text-foreground">
              {formatKpiValue(measurement.value)}
              <span className="ml-0.5 text-xs font-medium text-muted-foreground">
                {measurement.unit}
              </span>
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-2.5 flex items-center gap-3">
        <div className="flex-1">
          <ScoreBar score={kpi.score} tier={kpi.band.tier} />
        </div>
        <span className={cn("shrink-0 text-xs font-semibold", style.text)}>
          {comparisonLabel(kpi)}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold", style.chip)}>
          {kpi.band.label}
        </span>
        {confidence !== "solid" ? (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground"
            title="Le score 0-100 dérivé de ce barème est approximatif (référence non-natation) — la mesure brute reste fiable."
          >
            <Info className="h-3 w-3" />
            Barème {CONFIDENCE_BADGE[confidence]}
          </span>
        ) : null}
        {pendingReview ? (
          <span className="inline-flex items-center rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-700 dark:bg-sky-950/50 dark:text-sky-300">
            à valider par le coach
          </span>
        ) : null}
      </div>
    </div>
  );
}

function HighlightList({
  title,
  icon: Icon,
  accent,
  kpis,
  emptyHint,
  useTopLabel,
}: {
  title: string;
  icon: typeof Flame;
  accent: string;
  kpis: RankedKpi[];
  emptyHint: string;
  /** Forces → « top X % » ; axes → bande qualitative. */
  useTopLabel: boolean;
}) {
  return (
    <Card className="overflow-hidden border-primary/15 bg-card shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base uppercase tracking-eyebrow-sm">
          <Icon className={cn("h-4 w-4", accent)} />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {kpis.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyHint}</p>
        ) : (
          kpis.map((kpi) => {
            const style = TIER_STYLE[kpi.band.tier];
            return (
              <div
                key={kpi.key}
                className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-background/70 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {kpi.bucket}
                  </p>
                  <p className="truncate text-sm font-semibold text-foreground">{kpi.label}</p>
                </div>
                <span className={cn("shrink-0 text-sm font-bold", style.text)}>
                  {useTopLabel ? comparisonLabel(kpi) : kpi.band.label}
                </span>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

export default function PhysicalStatsView({
  athleteId,
  sex,
  birthdate,
  onBack,
  onEditProfile,
}: {
  athleteId: number;
  sex: "M" | "F" | null;
  birthdate: string | null;
  onBack: () => void;
  /** Ouvre l'édition du profil (pour compléter sexe / date de naissance). */
  onEditProfile?: () => void;
}) {
  const reduce = useReducedMotion();
  const fadeVariants = reduce ? {} : fadeIn;

  const { data: latest, isLoading } = useQuery({
    queryKey: ["kpi-latest", athleteId],
    queryFn: () => getLatestKpiMeasurements(athleteId),
    enabled: athleteId > 0,
    staleTime: 5 * 60 * 1000,
  });

  const ageBand = useMemo(() => {
    const age = ageFromBirthdate(birthdate);
    return age != null ? ageBandFor(age) : null;
  }, [birthdate]);

  const summary = useMemo(
    () => buildPhysicalStatsSummary(rankKpis(latest ?? {}, { sex, ageBand })),
    [latest, sex, ageBand],
  );

  const profileIncomplete = !sex || !ageBand;
  const measurementByKey = (latest ?? {}) as Partial<
    Record<StrengthKpiKey, StrengthKpiMeasurement | null>
  >;

  return (
    <motion.div
      className="space-y-4 overflow-x-hidden"
      variants={fadeVariants}
      initial="hidden"
      animate="visible"
    >
      <Header onBack={onBack} />

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      ) : profileIncomplete ? (
        <Card className="border-amber-200/70 bg-amber-50/60 dark:border-amber-800/50 dark:bg-amber-950/20">
          <CardContent className="flex flex-col items-start gap-3 py-5">
            <div className="flex items-center gap-2.5">
              <Info className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
              <p className="text-sm font-semibold text-foreground">Profil à compléter</p>
            </div>
            <p className="text-sm text-muted-foreground">
              Renseigne ton <span className="font-medium text-foreground">sexe</span> et ta{" "}
              <span className="font-medium text-foreground">date de naissance</span> pour calculer
              tes stats physiques (les barèmes en dépendent).
            </p>
            {onEditProfile ? (
              <Button variant="outline" size="sm" onClick={onEditProfile}>
                Compléter mon profil
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : summary.measured.length === 0 ? (
        <Card className="border-primary/15 bg-card shadow-sm">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
              <Dumbbell className="h-7 w-7 text-primary" />
            </div>
            <p className="text-sm font-semibold text-foreground">Aucune mesure pour l'instant</p>
            <p className="max-w-xs text-sm text-muted-foreground">
              Tes KPIs muscu (détente, traction lestée, tirage…) apparaîtront ici après ton premier
              bilan avec le coach.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Indice physique global */}
          {summary.globalComparison ? (
            <Card className="overflow-hidden border-primary/15 bg-gradient-to-br from-primary/10 to-card shadow-sm">
              <CardContent className="flex items-center gap-4 py-5">
                <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl bg-background/80 ring-1 ring-primary/20">
                  <span className="text-2xl font-bold tabular-nums leading-none text-primary">
                    {Math.round(summary.globalScore ?? 0)}
                  </span>
                  <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                    / 100
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-eyebrow-sm text-muted-foreground">
                    <Activity className="h-3.5 w-3.5" />
                    Indice physique global
                  </p>
                  <p className="mt-1 text-lg font-bold leading-tight text-foreground">
                    {summary.globalScore != null && summary.globalScore >= 50
                      ? summary.globalComparison.topLabel
                      : "En progression"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {summary.globalComparison.betterThanLabel} des nageur·euses de ton âge et sexe ·
                    moyenne de {summary.measured.length} KPI
                    {summary.measured.length > 1 ? "s" : ""}
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {/* Points forts */}
          <HighlightList
            title="Points forts"
            icon={Flame}
            accent="text-emerald-500"
            kpis={summary.strengths}
            emptyHint="Continue tes bilans pour faire ressortir tes points forts."
            useTopLabel
          />

          {/* Axes de progression */}
          <HighlightList
            title="Axes de progression"
            icon={Target}
            accent="text-orange-500"
            kpis={summary.improvements}
            emptyHint="Aucun point faible marqué — beau profil équilibré !"
            useTopLabel={false}
          />

          {/* Détail des KPIs mesurés */}
          <Card className="overflow-hidden border-primary/15 bg-card shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base uppercase tracking-eyebrow-sm">
                <Sparkles className="h-4 w-4 text-primary" />
                Détail des mesures
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {summary.measured.map((kpi) => (
                <KpiDetailRow
                  key={kpi.key}
                  kpi={kpi}
                  measurement={measurementByKey[kpi.key] ?? null}
                />
              ))}
            </CardContent>
          </Card>

          {/* Note méthodo */}
          <div className="flex items-start gap-2.5 rounded-2xl border bg-muted/40 px-4 py-3">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <p className="text-[11px] leading-snug text-muted-foreground">
              Les comparaisons « top X % » situent tes mesures face à une population de référence du
              même âge et sexe. Les barèmes marqués{" "}
              <span className="font-semibold text-foreground">indicatif</span> sont approximatifs
              (référence non-natation) — la mesure brute, elle, reste fiable et comparable dans le
              temps.
            </p>
          </div>
        </>
      )}
    </motion.div>
  );
}
