/**
 * MesocycleAdjust — ecran coach d'ajustement d'un mesocycle actif en cours.
 *
 * Le coach choisit un lundi pivot : les semaines avant le pivot sont conservees,
 * les suivantes sont recalculees avec d'eventuels ajustements (jours muscu,
 * facteurs de volume/intensite). « Apercu » ecrit l'etat dans sessionStorage
 * (cle partagee avec la generation) et navigue vers MesocyclePreview, qui
 * applique les facteurs et reutilise la RPC apply (snapshot + table rase).
 *
 * Design : docs/plans/2026-05-28-mesocycle-adjust-design.md
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";

import {
  getActiveMesocycle,
  getAthletes,
  getCurrentMesocyclePhaseInfo,
  getDistanceProfiles,
  getLatestAssessment,
  getStrokeSignatures,
} from "@/lib/api";
import type {
  DistanceKey,
  StrokeKey,
} from "@/lib/strength/mesocycleEngine.types";
import type { PeriodizationCycle } from "@/lib/api/types";
import { composeTemplate } from "@/lib/strength/composeTemplate";
import { useAuth } from "@/lib/auth";
import { getMonday, toISODate } from "@/lib/date";
import { PERIODIZATION_CYCLES } from "@/lib/strength/periodizationCycles";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  AlertTriangle,
  ArrowRight,
  ChevronLeft,
  Info,
  Loader2,
} from "lucide-react";

// ── Tokens (dupliques de MesocyclePreview pour ne pas exporter depuis une page) ─

/** Libelles courts FR des 7 jours, indexes 0=Lun…6=Dim. */
const WEEKDAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

/** Couleur (tonalite Tailwind) par cycle pour la pastille de phase. */
const CYCLE_COLOR: Record<PeriodizationCycle, { dot: string; text: string }> = {
  prepa_generale: { dot: "bg-sky-500", text: "text-sky-700 dark:text-sky-300" },
  force_max: { dot: "bg-rose-500", text: "text-rose-700 dark:text-rose-300" },
  puissance: { dot: "bg-amber-500", text: "text-amber-700 dark:text-amber-300" },
  maintien: { dot: "bg-slate-400", text: "text-slate-700 dark:text-slate-300" },
  affutage: { dot: "bg-violet-500", text: "text-violet-700 dark:text-violet-300" },
  pic: { dot: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-300" },
};

/** Libelle FR d'une nage. */
const STROKE_LABEL_FR: Record<StrokeKey, string> = {
  freestyle: "Crawl",
  butterfly: "Papillon",
  backstroke: "Dos",
  breaststroke: "Brasse",
  medley: "4 nages",
};

/** Libelle FR d'une distance pour l'en-tete de contexte. */
const DISTANCE_LABEL_FR: Record<DistanceKey, string> = {
  "50": "50",
  "100": "100",
  "200": "200",
  "400plus": "400+",
  fond: "Fond",
};

const FR_LONG_DATE = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

// ── Helpers PURS (module-level, exportes pour B6) ─────────────────────────────

/**
 * Lundi STRICTEMENT apres `now` au format ISO 'YYYY-MM-DD' (date locale).
 * Si `now` est deja un lundi, renvoie le lundi suivant (le pivot doit etre futur).
 */
export function nextMonday(now: Date = new Date()): string {
  const monday = getMonday(now);
  monday.setDate(monday.getDate() + 7);
  return toISODate(monday);
}

/**
 * Jeu par defaut de `n` jours muscu (0=Lun…6=Dim), excluant le samedi (5) par
 * doctrine. Cas usuels 2-5 mappes explicitement ; fallback = premiers `n` de
 * [Lun,Mar,Mer,Jeu,Ven,Dim].
 */
export function defaultWeekdays(n: number): number[] {
  const presets: Record<number, number[]> = {
    2: [0, 3],
    3: [0, 2, 4],
    4: [0, 1, 3, 4],
    5: [0, 1, 2, 3, 4],
  };
  return presets[n] ?? [0, 1, 2, 3, 4, 6].slice(0, n);
}

/** Etat du pivot vs le lundi de la semaine courante. */
export function pivotStateOf(
  pivotMonday: string,
  thisMonday: string,
): "past" | "current" | "future" {
  if (pivotMonday < thisMonday) return "past";
  if (pivotMonday === thisMonday) return "current";
  return "future";
}

/**
 * Formate un facteur (0.5–1.5) en delta lisible, ex. 0.8 → "−20 %", 1.0 → "0 %".
 * `unitSuffix` decrit la grandeur multipliee (ex. "series", "%1RM").
 */
export function formatFactorDelta(factor: number, unitSuffix: string): string {
  const pct = Math.round((factor - 1) * 100);
  const sign = pct > 0 ? "+" : pct < 0 ? "−" : "";
  const abs = Math.abs(pct);
  return `${sign}${abs} % (${unitSuffix} ×${factor.toFixed(2)})`;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MesocycleAdjust() {
  const [, params] = useRoute<{ athleteId: string }>(
    "/strength/mesocycle-adjust/:athleteId",
  );
  const [, navigate] = useLocation();

  // C1 — écran réservé au coach/admin : l'ajustement mid-cycle est une décision
  // d'entraîneur (doctrine). Le RPC + la RLS bloquent déjà toute action sur un
  // AUTRE athlète ; ce garde-fou empêche un nageur d'auto-ajuster son propre plan.
  const role = useAuth((s) => s.role);
  const isCoach = role === "coach" || role === "admin";

  const athleteId = params?.athleteId ? Number(params.athleteId) : null;

  // ── Fetches ───────────────────────────────────────────────────────────────
  const {
    data: meso,
    isLoading: mesoLoading,
    isError: mesoError,
  } = useQuery({
    queryKey: ["strength-mesocycle-active", athleteId],
    queryFn: () => getActiveMesocycle(athleteId!),
    enabled: athleteId != null,
  });

  const { data: signatures = [], isLoading: signaturesLoading } = useQuery({
    queryKey: ["strength-stroke-signatures"],
    queryFn: () => getStrokeSignatures(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: profiles = [], isLoading: profilesLoading } = useQuery({
    queryKey: ["strength-distance-profiles"],
    queryFn: () => getDistanceProfiles(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: assessment } = useQuery({
    queryKey: ["strength-assessment-latest", athleteId],
    queryFn: () => getLatestAssessment(athleteId!),
    enabled: athleteId != null,
  });

  const { data: athletes } = useQuery({
    queryKey: ["athletes"],
    queryFn: () => getAthletes(),
    staleTime: 5 * 60 * 1000,
  });

  // ── Derivation nage/distance depuis event_group ('<stroke>_<distance>') ─────
  const { stroke, distance } = useMemo(() => {
    if (!meso) return { stroke: null as StrokeKey | null, distance: null as DistanceKey | null };
    const [strokePart, ...rest] = meso.event_group.split("_");
    return {
      stroke: strokePart as StrokeKey,
      distance: rest.join("_") as DistanceKey,
    };
  }, [meso]);

  const signature = useMemo(
    () => signatures.find((s) => s.stroke_key === stroke) ?? null,
    [signatures, stroke],
  );
  const profile_ = useMemo(
    () =>
      meso
        ? profiles.find((p) => p.distance_key === distance && p.kind === meso.kind) ??
          null
        : null,
    [profiles, distance, meso],
  );

  const template = useMemo(
    () =>
      meso && signature && profile_
        ? composeTemplate(profile_, signature, meso.kind)
        : null,
    [meso, signature, profile_],
  );

  // ── Lundi de depart du meso ─────────────────────────────────────────────────
  // §340 Lot 2 (C3) : on prefere la date EXACTE persistee par la RPC
  // (`start_week_monday`). Repli pour les mesos anterieurs : lundi de la semaine
  // de `generated_at`, TZ-safe — on tronque la composante horaire AVANT le parse
  // local, sinon un timestamp UTC tardif (ex. jeudi 22:30Z = vendredi local)
  // decalait le lundi d'une semaine → `weeksRemaining` faux en fin de cycle.
  const startMonday = useMemo(() => {
    if (!meso) return null;
    if (meso.start_week_monday) return meso.start_week_monday;
    return toISODate(
      getMonday(new Date(`${meso.generated_at.slice(0, 10)}T00:00:00`)),
    );
  }, [meso]);

  // ── Etat du formulaire ──────────────────────────────────────────────────────
  const [pivotMonday, setPivotMonday] = useState<string>(() => nextMonday());
  const [sessionsPerWeek, setSessionsPerWeek] = useState<number>(3);
  const [weekdays, setWeekdays] = useState<number[]>(() => defaultWeekdays(3));
  const [volumeFactor, setVolumeFactor] = useState<number>(1.0);
  const [intensityFactor, setIntensityFactor] = useState<number>(1.0);

  // Initialise sessions/jours depuis le meso UNE SEULE FOIS (a sa premiere
  // disponibilite). Le ref garde-fou evite d'ecraser les editions du coach lors
  // des re-renders / refetch ulterieurs.
  const initedFromMeso = useRef(false);
  useEffect(() => {
    if (meso && !initedFromMeso.current) {
      initedFromMeso.current = true;
      const n = meso.sessions_per_week ?? 3;
      setSessionsPerWeek(n);
      setWeekdays(defaultWeekdays(n));
    }
  }, [meso]);

  // ── Info de phase au pivot (recalcule a chaque changement pivot/template) ────
  const phaseInfo = useMemo(() => {
    if (!template || !startMonday || !meso) return null;
    return getCurrentMesocyclePhaseInfo({
      startMonday,
      totalWeeks: meso.target_week_count,
      template,
      pivotMonday,
    });
  }, [template, startMonday, meso, pivotMonday]);

  // ── Banniere + disabled (pur, testable) ─────────────────────────────────────
  const thisMonday = useMemo(() => toISODate(getMonday(new Date())), []);
  const pivotState = pivotStateOf(pivotMonday, thisMonday);
  const weeksRemaining = phaseInfo?.weeksRemaining ?? 0;
  // phaseKey null avec weeksRemaining > 0 = periodize() a lancé une exception
  // (target_week_count du méso hors plage [Σmin, Σmax] du template actuel).
  const mesoTemplateIncompat =
    phaseInfo !== null && phaseInfo.weeksRemaining > 0 && phaseInfo.phaseKey === null;

  const ready = athleteId != null && !mesoLoading && !!meso && !!template;
  const apercuDisabled =
    pivotState === "past" || weeksRemaining < 1 || mesoTemplateIncompat || !template || !ready;

  // Reutilise le flux d'apercu existant (MesocyclePreview) en ETENDANT le payload
  // sessionStorage avec les champs d'ajustement (adjust/startPhase/facteurs).
  const handleApercu = () => {
    if (apercuDisabled || !meso || !template || !phaseInfo || !phaseInfo.phaseKey)
      return;
    const payload = {
      stroke: stroke as StrokeKey,
      distance: distance as DistanceKey,
      kind: meso.kind,
      targetWeekCount: phaseInfo.weeksRemaining,
      weekdays,
      startDate: pivotMonday,
      athleteId,
      // --- extension ajustement (consommee par MesocyclePreview) ---
      adjust: true,
      startPhase: phaseInfo.phaseKey,
      volumeFactor,
      intensityFactor,
      // §358 — semaines deja entrainees avant le pivot → offset de progression
      // globale, pose sur le nouveau meso apres l'apply (bannière « Semaine X/Total »).
      weekOffset: phaseInfo.weekIndex,
    };
    try {
      window.sessionStorage.setItem(
        "eac_pending_mesocycle_params",
        JSON.stringify(payload),
      );
    } catch {
      // sessionStorage peut etre bloque (private mode) : on navigue quand meme.
    }
    navigate("/strength/mesocycle-preview");
  };

  const handleBack = () =>
    navigate(athleteId != null ? `/coach/swimmer/${athleteId}` : "/strength");

  // Bilan : refaire = navigation simple vers le questionnaire du nageur.
  // Le coach refait le bilan de l'ATHLÈTE ciblé → écran bilan coach (qui sait
  // créer/reprendre un bilan pour cet athlète), pas le questionnaire perso du
  // coach (`/strength/questionnaire`) qui affichait « ton coach doit d'abord… ».
  const handleRefaireBilan = () =>
    athleteId != null && navigate(`/coach/strength-assessment/${athleteId}`);

  const handleRegenerate = () =>
    athleteId != null && navigate(`/coach/mesocycle-generate/${athleteId}`);

  // ── Contexte d'affichage ────────────────────────────────────────────────────
  const athleteName =
    athletes?.find((a) => a.id === athleteId)?.display_name ??
    (athleteId != null ? `Athlète ${athleteId}` : "Athlète");

  const strokeLabel = stroke ? STROKE_LABEL_FR[stroke] ?? stroke : "";
  const distanceLabel = distance ? DISTANCE_LABEL_FR[distance] ?? distance : "";

  const assessmentDate = assessment?.updated_at
    ? FR_LONG_DATE.format(new Date(assessment.updated_at))
    : "—";

  const taxonomyLoading = signaturesLoading || profilesLoading;
  const loading = mesoLoading || (meso != null && taxonomyLoading);

  // ── Rendu (PAS d'early return avant ce point : tous les hooks sont au-dessus) ─
  let body: React.ReactNode;
  if (!isCoach) {
    body = (
      <EmptyState
        message="Réservé aux entraîneurs."
        onBack={handleBack}
      />
    );
  } else if (athleteId == null) {
    body = <EmptyState message="Nageur introuvable." onBack={handleBack} />;
  } else if (loading) {
    body = (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Chargement…
      </div>
    );
  } else if (mesoError || !meso) {
    body = (
      <EmptyState
        message="Aucun mésocycle actif pour ce nageur."
        onBack={handleBack}
      />
    );
  } else if (!template) {
    body = (
      <EmptyState
        message={`Impossible de dériver le template (groupe d'épreuve « ${meso.event_group} »).`}
        onBack={handleBack}
      />
    );
  } else {
    const cycleColor = phaseInfo?.phaseKey ? CYCLE_COLOR[phaseInfo.phaseKey] : null;
    const cycleLabel = phaseInfo?.phaseKey
      ? PERIODIZATION_CYCLES[phaseInfo.phaseKey]?.label ?? phaseInfo.phaseKey
      : "—";

    body = (
      <div className="space-y-5">
        {/* Contexte */}
        <Card>
          <CardContent className="space-y-1.5 pt-5">
            <p className="text-base font-semibold">
              {athleteName}
              <span className="text-muted-foreground">
                {" — "}
                {strokeLabel} {distanceLabel} m
              </span>
            </p>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span
                className={cn(
                  "block h-2.5 w-2.5 shrink-0 rounded-full",
                  cycleColor?.dot ?? "bg-slate-300",
                )}
              />
              <span>
                S{(phaseInfo?.weekIndex ?? 0) + 1} / {meso.target_week_count} ·
                phase{" "}
                <span className={cn("font-medium", cycleColor?.text)}>
                  {cycleLabel}
                </span>
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Banniere — priorité : incompat > aucune semaine > pivot passé > pivot courant. */}
        {mesoTemplateIncompat ? (
          <Banner tone="rose" icon={<AlertTriangle className="h-4 w-4" />}>
            Ce mésocycle ({meso.target_week_count} sem.) est incompatible avec le
            template actuel — régénère-en un nouveau depuis le profil du nageur.
          </Banner>
        ) : weeksRemaining < 1 ? (
          <Banner tone="slate" icon={<Info className="h-4 w-4" />}>
            Il ne reste aucune semaine à recalculer.
          </Banner>
        ) : pivotState === "past" ? (
          <Banner tone="rose" icon={<AlertTriangle className="h-4 w-4" />}>
            Le pivot doit être dans le futur (un lundi à venir).
          </Banner>
        ) : pivotState === "current" ? (
          <Banner tone="amber" icon={<AlertTriangle className="h-4 w-4" />}>
            Tu vas écraser les jours déjà entraînés cette semaine.
          </Banner>
        ) : null}

        {/* Pivot */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Pivot (lundi)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Input
              type="date"
              value={pivotMonday}
              onChange={(e) => {
                const v = e.target.value;
                if (!v) return;
                // Cale la date choisie sur son lundi (le coach peut cliquer un
                // autre jour dans le picker natif).
                setPivotMonday(toISODate(getMonday(new Date(v + "T00:00:00"))));
              }}
              // min-w-0 + max-w-full : empêche le contrôle date natif (iOS) de
              // déborder à droite de la carte (largeur intrinsèque > conteneur).
              className="w-full min-w-0 max-w-full"
            />
            <p className="text-sm text-muted-foreground">
              Les semaines avant le pivot sont conservées ; les suivantes sont
              recalculées.
            </p>
          </CardContent>
        </Card>

        {/* Seances */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Séances par semaine</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <RadioGroup
              className="flex flex-wrap gap-4"
              value={String(sessionsPerWeek)}
              onValueChange={(v) => {
                // C4 — changer le nombre de séances resynchronise les jours cochés
                // (sinon RadioGroup et cases divergent ; le moteur lit weekdays.length).
                const n = Number(v);
                setSessionsPerWeek(n);
                setWeekdays(defaultWeekdays(n));
              }}
            >
              {[2, 3, 4, 5].map((n) => (
                <div key={n} className="flex items-center gap-2">
                  <RadioGroupItem value={String(n)} id={`spw-${n}`} />
                  <Label htmlFor={`spw-${n}`} className="cursor-pointer">
                    {n}
                  </Label>
                </div>
              ))}
            </RadioGroup>

            <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
              {WEEKDAY_LABELS.map((label, idx) => {
                const checked = weekdays.includes(idx);
                return (
                  <label
                    key={idx}
                    htmlFor={`wd-${idx}`}
                    className="flex cursor-pointer items-center gap-1.5 rounded-md border bg-card px-2 py-1.5 text-sm"
                  >
                    <Checkbox
                      id={`wd-${idx}`}
                      checked={checked}
                      onCheckedChange={(c) => {
                        setWeekdays((prev) => {
                          const has = prev.includes(idx);
                          if (c && !has) return [...prev, idx].sort((a, b) => a - b);
                          if (!c && has) return prev.filter((d) => d !== idx);
                          return prev;
                        });
                      }}
                    />
                    <span>{label}</span>
                  </label>
                );
              })}
            </div>

            {weekdays.length !== sessionsPerWeek && (
              <p className="text-xs text-amber-600 dark:text-amber-500">
                {weekdays.length} jour{weekdays.length > 1 ? "s" : ""} coché
                {weekdays.length > 1 ? "s" : ""} — c'est ce nombre qui sera
                utilisé pour générer les séances.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Charge */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Charge</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <FactorRow
              label="Volume"
              factor={volumeFactor}
              unitSuffix="séries"
              onChange={setVolumeFactor}
            />
            <FactorRow
              label="Intensité"
              factor={intensityFactor}
              unitSuffix="%1RM"
              onChange={setIntensityFactor}
            />
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">
                Préréglages
              </p>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex h-auto flex-col gap-0.5 py-1.5"
                  onClick={() => {
                    setVolumeFactor(0.8);
                    setIntensityFactor(0.9);
                  }}
                >
                  <span className="font-medium">Alléger</span>
                  <span className="text-[10px] text-muted-foreground">−20 % vol.</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex h-auto flex-col gap-0.5 py-1.5"
                  onClick={() => {
                    setVolumeFactor(1.0);
                    setIntensityFactor(1.0);
                  }}
                >
                  <span className="font-medium">Standard</span>
                  <span className="text-[10px] text-muted-foreground">inchangé</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex h-auto flex-col gap-0.5 py-1.5"
                  onClick={() => {
                    setVolumeFactor(1.15);
                    setIntensityFactor(1.05);
                  }}
                >
                  <span className="font-medium">Augmenter</span>
                  <span className="text-[10px] text-muted-foreground">+15 % vol.</span>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Bilan */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Bilan courant</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              Réalisé le{" "}
              <span className="font-medium text-foreground">{assessmentDate}</span>
            </p>
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="link"
                className="h-auto p-0"
                onClick={handleRegenerate}
              >
                Régénérer le mésocycle
              </Button>
              <Button
                type="button"
                variant="link"
                className="h-auto p-0 text-muted-foreground"
                onClick={handleRefaireBilan}
              >
                Refaire le bilan
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl p-4 space-y-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Retour"
            onClick={handleBack}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold">Ajuster le mésocycle</h1>
        </div>
        <Button
          type="button"
          onClick={handleApercu}
          disabled={apercuDisabled}
          className="gap-1.5"
        >
          Aperçu
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>

      {body}
    </div>
  );
}

// ── Sous-composants ────────────────────────────────────────────────────────────

function FactorRow({
  label,
  factor,
  unitSuffix,
  onChange,
}: {
  label: string;
  factor: number;
  unitSuffix: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <Label className="text-sm font-medium">{label}</Label>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {formatFactorDelta(factor, unitSuffix)}
        </span>
      </div>
      <Slider
        min={0.5}
        max={1.5}
        step={0.05}
        value={[factor]}
        onValueChange={(v) => onChange(v[0] ?? 1)}
      />
    </div>
  );
}

function Banner({
  tone,
  icon,
  children,
}: {
  tone: "rose" | "amber" | "slate";
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const toneClass =
    tone === "rose"
      ? "border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-800/60 dark:bg-rose-950/30 dark:text-rose-100"
      : tone === "amber"
        ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-100"
        : "border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300";
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-sm",
        toneClass,
      )}
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span className="leading-relaxed">{children}</span>
    </div>
  );
}

function EmptyState({
  message,
  onBack,
}: {
  message: string;
  onBack: () => void;
}) {
  return (
    <Card>
      <CardContent className="space-y-4 py-10 text-center">
        <p className="text-sm text-muted-foreground">{message}</p>
        <Button type="button" variant="outline" onClick={onBack}>
          Retour
        </Button>
      </CardContent>
    </Card>
  );
}
