/**
 * MesocyclePreview — aperçu nageur du mésocycle généré (§293, Phase 5.3).
 *
 * Pipeline :
 *  1. Lit les paramètres depuis sessionStorage["eac_pending_mesocycle_params"]
 *     (posés par /strength/mesocycle-generate). Si absents → retour à l'écran
 *     de génération.
 *  2. Fetch en parallèle : profile (sexe + date de naissance), évaluation,
 *     mesures KPI, taxonomie nage × distance (signatures + profils, §305),
 *     catalogue d'exercices taggé. Le template est composé localement via
 *     `composeTemplate(profile, signature, kind)` — plus de fetch par id.
 *  3. Compose `MesocycleInput` (jour-aware §307 : `weekdays` + `primerWeekdays`,
 *     `sessionsPerWeek` dérivé de `weekdays.length`), appelle
 *     `generateMesocyclePreview` (moteur pur).
 *  4. Affiche : raisonnement auditable (6 scores, priorités, confiance) +
 *     plan détaillé (semaines → cycles → séances avec jour + rôle → exercices).
 *  5. CTA confirmer → `applyMesocycle(input, generated, startDate)` (RPC) →
 *     toast + retour /strength.
 *
 * Focus mode (dock masqué) — convention KpiWizard / Questionnaire.
 */
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  applyMesocycle,
  setMesocycleWeekOffset,
  getActiveMesocycle,
  getAthletes,
  generateMesocyclePreview,
  getLatestAssessment,
  getLatestKpiMeasurements,
  getProfile,
  getStrengthAthleteSettings,
  getStrokeSignatures,
  getDistanceProfiles,
  listCatalogExercisesTagged,
  getCommonWarmupRoutine,
  getActivationRoutine,
} from "@/lib/api";
import type {
  StrengthBucket,
  StrengthKpiMeasurement,
} from "@/lib/api/types";
import type {
  AllBucket,
  DistanceKey,
  GeneratedMesocycle,
  MesocycleInput,
  SessionRole,
  StrokeKey,
} from "@/lib/strength/mesocycleEngine.types";
import { composeTemplate } from "@/lib/strength/composeTemplate";
import { applyAdjustmentFactors } from "@/lib/strength/adjustmentFactors";
import { getMonday, toISODate } from "@/lib/date";
import { ageBandFor } from "@/lib/strength/kpiBaremes";
import { PERIODIZATION_CYCLES } from "@/lib/strength/periodizationCycles";
import { ZONE_LABEL_FR } from "@/lib/strength/zones";
import { BLOCK_STYLES } from "@/lib/strength/blockStyles";
import { warmupSectionLabel, correctiveChipLabel } from "@/lib/strength/warmupLabels";
import { ExerciseGifLightbox } from "@/components/strength/ExerciseGifLightbox";
import type { PeriodizationCycle } from "@/lib/api/types";
import { useAuth } from "@/lib/auth";
import {
  canGenerateMesocycle,
  applyLikelySucceededDespiteError,
} from "@/lib/strength/mesocycleGating";
import { hasUnderLeveledProfile } from "@/lib/strength/strengthProfileMismatch";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Layers,
  Loader2,
  RefreshCw,
  Sparkles,
  Target,
} from "lucide-react";

// ── Constants ────────────────────────────────────────────────────────────────

const SESSION_KEY = "eac_pending_mesocycle_params";

interface PendingParams {
  stroke: StrokeKey;
  distance: DistanceKey;
  kind: "season" | "inter_competition";
  targetWeekCount: number;
  /** Jours muscu cochés (0=Lun…6=Dim). sessions/sem = length. §307. */
  weekdays: number[];
  /** Sous-ensemble de weekdays désignés amorce SNC (volume réduit). Absent → {0,3} ∩ weekdays. */
  primerWeekdays?: number[];
  /** Date de départ réelle (ISO YYYY-MM-DD), 1re semaine partielle possible. §307. */
  startDate: string;
  /** Nageur ciblé (mode coach). Absent/égal à la session → mode nageur. */
  athleteId?: number | null;
  /** Mode ajustement mi-cycle (meso-adjust) : facteurs charge + phase de depart. */
  adjust?: boolean;
  startPhase?: PeriodizationCycle | null;
  volumeFactor?: number;
  intensityFactor?: number;
  /** §358 — semaines déjà faites avant le pivot, posées sur le méso après l'apply. */
  weekOffset?: number;
  /** Mode coach : génération pour le compte d'un nageur (route /coach/mesocycle-generate/:id). */
  coachMode?: boolean;
}

/**
 * C2 — cible de navigation « Retour » / « Modifier les paramètres » depuis
 * l'aperçu. En mode ajustement mid-cycle (§338), on revient à l'écran
 * d'ajustement du nageur ciblé ; en mode coach (§371), à l'écran de génération
 * coach pour ne pas perdre le contexte ; sinon à l'écran de génération nageur.
 * Repli sûr sur génération nageur si l'athlète cible manque.
 */
export function mesocyclePreviewBackTarget(
  params: Pick<PendingParams, "adjust" | "athleteId" | "coachMode"> | null,
): string {
  if (params?.adjust && params.athleteId != null) {
    return `/strength/mesocycle-adjust/${params.athleteId}`;
  }
  if (params?.coachMode && params.athleteId != null) {
    return `/coach/mesocycle-generate/${params.athleteId}`;
  }
  return "/strength/mesocycle-generate";
}

const BUCKET_LABEL_FR: Record<AllBucket, string> = {
  lower_strength: "Force bas du corps",
  lower_power: "Puissance bas du corps",
  upper_strength: "Force haut du corps",
  upper_power: "Puissance haut du corps",
  mobility: "Mobilité",
  psychology: "Psychologie",
  // §R5 — tronc/gainage : socle permanent, non scoré (cf. design R5 §2).
  core: "Tronc / gainage",
};

const BUCKET_SHORT_FR: Record<AllBucket, string> = {
  lower_strength: "Force bas",
  lower_power: "Puissance bas",
  upper_strength: "Force haut",
  upper_power: "Puissance haut",
  mobility: "Mobilité",
  psychology: "Psycho",
  core: "Tronc",
};

/** Libellés courts FR des 7 jours, indexés 0=Lun…6=Dim. §307. */
const WEEKDAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

/** Style + label d'un badge de rôle de séance (jour-aware §307). */
const ROLE_BADGE: Record<SessionRole, { label: string; className: string }> = {
  amorce_pap: {
    label: "Amorce SNC",
    className:
      "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  },
  developpement: {
    label: "Développement",
    className:
      "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300",
  },
  mobilite_corrective: {
    label: "Correctif",
    className:
      "border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300",
  },
};

/** Couleur (tonalité Tailwind) par cycle pour le pastille de phase. */
const CYCLE_COLOR: Record<PeriodizationCycle, {
  dot: string;
  ring: string;
  text: string;
  bg: string;
}> = {
  prepa_generale: {
    dot: "bg-sky-500",
    ring: "ring-sky-200 dark:ring-sky-900/50",
    text: "text-sky-700 dark:text-sky-300",
    bg: "bg-sky-50 dark:bg-sky-950/30",
  },
  force_max: {
    dot: "bg-rose-500",
    ring: "ring-rose-200 dark:ring-rose-900/50",
    text: "text-rose-700 dark:text-rose-300",
    bg: "bg-rose-50 dark:bg-rose-950/30",
  },
  puissance: {
    dot: "bg-amber-500",
    ring: "ring-amber-200 dark:ring-amber-900/50",
    text: "text-amber-700 dark:text-amber-300",
    bg: "bg-amber-50 dark:bg-amber-950/30",
  },
  maintien: {
    dot: "bg-slate-400",
    ring: "ring-slate-200 dark:ring-slate-700/50",
    text: "text-slate-700 dark:text-slate-300",
    bg: "bg-slate-50 dark:bg-slate-950/30",
  },
  affutage: {
    dot: "bg-violet-500",
    ring: "ring-violet-200 dark:ring-violet-900/50",
    text: "text-violet-700 dark:text-violet-300",
    bg: "bg-violet-50 dark:bg-violet-950/30",
  },
  pic: {
    dot: "bg-emerald-500",
    ring: "ring-emerald-200 dark:ring-emerald-900/50",
    text: "text-emerald-700 dark:text-emerald-300",
    bg: "bg-emerald-50 dark:bg-emerald-950/30",
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function ageFromBirthdate(birthdateIso: string, now: Date = new Date()): number {
  const birth = new Date(birthdateIso + "T00:00:00");
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age;
}

function loadPendingParams(): PendingParams | null {
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingParams;
    if (
      typeof parsed.stroke !== "string" ||
      typeof parsed.distance !== "string" ||
      typeof parsed.kind !== "string" ||
      typeof parsed.targetWeekCount !== "number" ||
      !Array.isArray(parsed.weekdays) ||
      parsed.weekdays.length === 0 ||
      !parsed.weekdays.every((d) => typeof d === "number") ||
      typeof parsed.startDate !== "string"
    ) {
      return null;
    }
    // Mode ajustement : valider les champs additionnels (un payload adjust
    // malforme ne doit pas s'appliquer a moitie).
    if (parsed.adjust === true) {
      if (
        typeof parsed.startPhase !== "string" ||
        typeof parsed.volumeFactor !== "number" ||
        !Number.isFinite(parsed.volumeFactor) ||
        parsed.volumeFactor <= 0 ||
        typeof parsed.intensityFactor !== "number" ||
        !Number.isFinite(parsed.intensityFactor) ||
        parsed.intensityFactor <= 0
      ) {
        return null;
      }
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Aplatit `Record<KpiKey, Measurement|null>` en `Measurement[]` (non-null). */
function flattenLatestKpi(
  byKey: Record<string, StrengthKpiMeasurement | null> | undefined,
): StrengthKpiMeasurement[] {
  if (!byKey) return [];
  return Object.values(byKey).filter(
    (m): m is StrengthKpiMeasurement => m !== null,
  );
}

/** Facteur (0.5–1.5) → delta lisible signe, ex. 0.8 → "−20 %", 1.0 → "0 %". */
function formatPctDelta(factor: number): string {
  const pct = Math.round((factor - 1) * 100);
  const sign = pct > 0 ? "+" : pct < 0 ? "−" : "";
  return `${sign}${Math.abs(pct)} %`;
}

const FR_LONG_DATE = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
});
function fmtShortDate(iso: string): string {
  return FR_LONG_DATE.format(new Date(iso + "T00:00:00"));
}

/** Date de chaque semaine = startMonday + (weekNumber - 1) * 7j (format court). */
function weekDateLabel(startMondayIso: string, weekNumber: number): string {
  const d = new Date(startMondayIso + "T00:00:00");
  d.setDate(d.getDate() + (weekNumber - 1) * 7);
  return fmtShortDate(d.toISOString().slice(0, 10));
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function MesocyclePreview() {
  const userId = useAuth((s) => s.userId);
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  // Focus mode (dock du bas masqué)
  useEffect(() => {
    document.body.dataset.focusMode = "strength";
    return () => {
      delete document.body.dataset.focusMode;
    };
  }, []);

  // ── Paramètres hand-off (lus une seule fois au mount) ────────────────────
  const [params, setParams] = useState<PendingParams | null>(() =>
    typeof window !== "undefined" ? loadPendingParams() : null,
  );

  useEffect(() => {
    if (!params) {
      toast.error("Configure d'abord les paramètres du mésocycle.");
      navigate("/strength/mesocycle-generate");
    }
  }, [params, navigate]);

  // ── Cible effective : nageur ciblé par le payload (mode coach) ou soi ─────
  const role = useAuth((s) => s.role);
  const isCoach = role === "coach" || role === "admin";
  const targetAthleteId = params?.athleteId ?? null;
  const effectiveAthleteId =
    isCoach && targetAthleteId != null ? targetAthleteId : userId;
  const isCoachMode = effectiveAthleteId !== userId;

  // ── Fetches en parallèle ─────────────────────────────────────────────────
  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["profile", effectiveAthleteId],
    queryFn: () => getProfile({ userId: effectiveAthleteId! }),
    enabled: effectiveAthleteId != null,
  });

  const { data: assessment, isLoading: assessLoading } = useQuery({
    queryKey: ["strength-assessment-latest", effectiveAthleteId],
    queryFn: () => getLatestAssessment(effectiveAthleteId!),
    enabled: effectiveAthleteId != null,
  });

  const { data: kpiLatest, isLoading: kpiLoading } = useQuery({
    queryKey: ["strength-kpi-latest", effectiveAthleteId],
    queryFn: () => getLatestKpiMeasurements(effectiveAthleteId!),
    enabled: effectiveAthleteId != null,
  });

  // Réglages muscu coach (niveau de pratique G3 + tier de performance G1).
  // Null si pas de ligne / Supabase off → défauts applicatifs côté input.
  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ["strength-athlete-settings", effectiveAthleteId],
    queryFn: () => getStrengthAthleteSettings(effectiveAthleteId!),
    enabled: effectiveAthleteId != null,
  });

  // Audit 2026-05-26 (§308 ↔ édition) — un mésocycle actif existe-t-il déjà ?
  // Si oui, confirmer cet aperçu REMPLACE le plan en cours à partir de la date
  // de départ (purge §308) → les ajustements manuels du coach sur cette fenêtre
  // sont perdus (récupérables par « Annuler »). On le signale explicitement.
  const { data: existingActiveMesocycle } = useQuery({
    queryKey: ["strength-mesocycle-active", effectiveAthleteId],
    queryFn: () => getActiveMesocycle(effectiveAthleteId!),
    enabled: effectiveAthleteId != null,
  });

  // Nom du nageur ciblé (mode coach) — en-tête de cible non ambigu.
  const { data: previewAthletes } = useQuery({
    queryKey: ["athletes"],
    queryFn: () => getAthletes(),
    enabled: isCoachMode,
    staleTime: 5 * 60_000,
  });
  const targetName =
    previewAthletes?.find((a) => a.id === effectiveAthleteId)?.display_name ??
    null;

  // Taxonomie nage × distance (§305) : on compose le template localement à
  // partir d'une nage (signature) + une distance/famille (profil) plutôt que
  // de fetcher un template unique par id.
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

  const signature = useMemo(
    () =>
      params
        ? signatures.find((s) => s.stroke_key === params.stroke) ?? null
        : null,
    [signatures, params?.stroke],
  );
  const profile_ = useMemo(
    () =>
      params
        ? profiles.find(
            (p) => p.distance_key === params.distance && p.kind === params.kind,
          ) ?? null
        : null,
    [profiles, params?.distance, params?.kind],
  );

  const template = useMemo(
    // `params!` est sûr : signature/profile_ ne sont truthy que si params != null
    // (les deux lookups renvoient null tant que params est null).
    () =>
      signature && profile_ ? composeTemplate(profile_, signature, params!.kind) : null,
    [signature, profile_, params?.kind],
  );

  const {
    data: catalog = [],
    isLoading: catLoading,
    error: catError,
  } = useQuery({
    queryKey: ["strength-catalog-tagged"],
    queryFn: () => listCatalogExercisesTagged(),
    staleTime: 5 * 60 * 1000,
  });

  // §351 — routine articulaire commune (Bloc 1) injectée dans le MesocycleInput.
  const { data: commonWarmupRoutine = [], isLoading: warmupLoading } = useQuery({
    queryKey: ["strength-warmup-common"],
    queryFn: () => getCommonWarmupRoutine(),
    staleTime: 5 * 60 * 1000,
  });

  // §352 — routine d'activation (Bloc 3) injectée dans le MesocycleInput.
  const { data: activationRoutine = {}, isLoading: activationLoading } = useQuery({
    queryKey: ["strength-warmup-activation"],
    queryFn: () => getActivationRoutine(),
    staleTime: 5 * 60 * 1000,
  });

  const allLoading =
    profileLoading ||
    assessLoading ||
    kpiLoading ||
    settingsLoading ||
    signaturesLoading ||
    profilesLoading ||
    catLoading ||
    warmupLoading ||
    activationLoading;

  // ── Composition de MesocycleInput + run du moteur ────────────────────────
  const input = useMemo<MesocycleInput | null>(() => {
    if (!params || !profile || !assessment || !template || allLoading) return null;
    if (!profile.birthdate || (profile.sex !== "M" && profile.sex !== "F")) {
      return null;
    }
    const age = ageFromBirthdate(profile.birthdate);
    const ageBand = ageBandFor(age);
    if (ageBand == null) return null;
    return {
      assessment: {
        id: assessment.id,
        athlete_id: assessment.athlete_id,
        questionnaire: assessment.questionnaire,
        physical_tests: assessment.physical_tests,
      },
      kpiMeasurements: flattenLatestKpi(kpiLatest),
      athlete: {
        sex: profile.sex,
        ageBand,
        level: settings?.practice_level ?? "intermediate",
        performanceTier: settings?.performance_tier ?? "club",
      },
      template,
      targetWeekCount: params.targetWeekCount,
      // meso-adjust : reprise mi-cycle en phase de depart (null = mode generation).
      startPhase: params.startPhase ?? null,
      // §307 — sessions/sem dérivé des jours cochés ; jour-aware via weekdays.
      sessionsPerWeek: params.weekdays.length,
      weekdays: params.weekdays,
      primerWeekdays: params.primerWeekdays ?? params.weekdays.filter((d) => d === 0 || d === 3),
      exerciseCatalog: catalog,
      commonWarmupRoutine,
      activationRoutine,
    };
  }, [params, profile, assessment, template, kpiLatest, settings, catalog, commonWarmupRoutine, activationRoutine, allLoading]);

  const { generated, engineError } = useMemo<{
    generated: GeneratedMesocycle | null;
    engineError: string | null;
  }>(() => {
    if (!input) return { generated: null, engineError: null };
    try {
      let g = generateMesocyclePreview(input);
      // meso-adjust : applique les facteurs charge APRES generation (post-process pur).
      if (params?.adjust) {
        g = applyAdjustmentFactors(
          g,
          params.volumeFactor ?? 1,
          params.intensityFactor ?? 1,
        );
      }
      return { generated: g, engineError: null };
    } catch (err) {
      return {
        generated: null,
        engineError: err instanceof Error ? err.message : "Erreur du moteur",
      };
    }
  }, [input, params]);

  // ── Mutation apply ───────────────────────────────────────────────────────
  // Effets de bord post-application réussie (réutilisés par onSuccess ET par la
  // récupération onError #5 : apply abouti côté serveur malgré une erreur réseau).
  const finishApplied = (description: string) => {
    try {
      window.sessionStorage.removeItem(SESSION_KEY);
    } catch {
      // Ignore : sessionStorage peut être bloqué (private mode).
    }
    queryClient.invalidateQueries({ queryKey: ["strength-mesocycle-active", effectiveAthleteId] });
    queryClient.invalidateQueries({ queryKey: ["strength_planning_slot_overrides"] });
    queryClient.invalidateQueries({ queryKey: ["strength_planning_week_overrides"] });
    queryClient.invalidateQueries({ queryKey: ["strength_planning_slots"] });
    toast.success("Mésocycle appliqué", { description });
    // Mode coach → retour à la fiche nageur (onglet Planning) ; sinon /strength.
    navigate(isCoachMode ? `/coach/swimmer/${effectiveAthleteId}` : "/strength");
  };

  const applyMutation = useMutation({
    // #5 (audit 2026-05-26) — on horodate le départ pour distinguer, en cas
    // d'erreur réseau, un apply qui a abouti côté serveur (méso créé pendant la
    // tentative) d'un échec franc.
    onMutate: () => ({ startedAt: Date.now() }),
    mutationFn: async () => {
      if (!input || !generated || !params)
        throw new Error("Données incomplètes pour appliquer le mésocycle.");
      // §307 — on transmet la date de départ réelle (la RPC dérive le lundi et
      // gère la 1re semaine partielle).
      return applyMesocycle(input, generated, params.startDate);
    },
    onSuccess: async (newMesoId: string) => {
      // §358 — ajustement mi-cycle : pose l'offset de progression globale sur le
      // nouveau méso (semaines déjà faites avant le pivot). Posé AVANT finishApplied
      // (qui invalide la query du méso actif → la bannière lit l'offset à jour).
      // Échec toléré : offset reste 0 → numérotation locale (dégradation gracieuse).
      const offset = params?.weekOffset ?? 0;
      if (params?.adjust && offset > 0 && typeof newMesoId === "string") {
        try {
          await setMesocycleWeekOffset(newMesoId, offset);
        } catch {
          /* best-effort */
        }
      }
      finishApplied(
        // §326 — plus de notification émise (broadcast supprimé) : on ne promet
        // donc plus « a été notifié ».
        isCoachMode
          ? `${generated?.totalWeeks ?? "?"} semaines posées sur la planif de ${targetName ?? "ce nageur"}.`
          : `${generated?.totalWeeks ?? "?"} semaines posées sur ta planif muscu.`,
      );
    },
    onError: async (err: unknown, _vars, context) => {
      // #5 — garde double-apply : si la RPC a réussi côté serveur mais que le
      // client a time-out, un méso actif créé PENDANT la tentative existe. On le
      // re-lit et, le cas échéant, on traite comme un succès plutôt que d'inviter
      // à recommencer (ce qui empilerait un méso superseded en doublon).
      if (effectiveAthleteId != null && context?.startedAt != null) {
        try {
          const active = await getActiveMesocycle(effectiveAthleteId);
          if (applyLikelySucceededDespiteError(context.startedAt, active?.created_at)) {
            finishApplied(
              "Le réseau a coupé pendant l'envoi, mais le plan a bien été enregistré. Vérifie ta planif.",
            );
            return;
          }
        } catch {
          // Re-lecture impossible (toujours hors-ligne) → on retombe sur l'erreur.
        }
      }
      const msg = err instanceof Error ? err.message : "Erreur inconnue";
      toast.error("Impossible d'appliquer le mésocycle", {
        description: `${msg} — vérifie ta connexion, puis réessaie.`,
      });
    },
  });

  // ── États bloquants ──────────────────────────────────────────────────────
  if (allLoading) return <PageSkeleton />;

  if (!params) return null; // useEffect navigate déjà déclenché

  if (profile && (!profile.birthdate || (profile.sex !== "M" && profile.sex !== "F"))) {
    return <ProfileIncompleteScreen />;
  }

  if (!assessment || !canGenerateMesocycle(assessment.status)) {
    return <AssessmentRequiredScreen />;
  }

  if (engineError) {
    return <EngineErrorScreen message={engineError} />;
  }

  // Catalogue en erreur ou vide → moteur produit des séances sans exercices.
  // On expose l'erreur explicitement plutôt que d'afficher un plan creux.
  if (catError) {
    return (
      <EngineErrorScreen
        message={`Catalogue d'exercices indisponible : ${
          catError instanceof Error ? catError.message : "erreur réseau"
        }`}
      />
    );
  }
  if (!catLoading && catalog.length === 0) {
    return (
      <EngineErrorScreen message="Aucun exercice taggé trouvé dans le catalogue. Préviens ton coach pour qu'il vérifie le seedage de dim_exercices." />
    );
  }

  // Combinaison nage/distance non résolue alors que le chargement est terminé :
  // tables de taxonomie vides, Supabase offline (getStrokeSignatures/Profiles
  // renvoient [] sans erreur), ou payload sessionStorage périmé après reseed.
  // → état d'erreur récupérable (CTA vers la génération) plutôt qu'un skeleton
  //   permanent (template null ⇒ input/generated null mais allLoading déjà false).
  if (!signature || !profile_) {
    return (
      <EngineErrorScreen message="Combinaison nage/distance introuvable — relance la génération" />
    );
  }

  if (!input || !generated || !template) {
    return <PageSkeleton />;
  }

  // C2 + C5 — quitter l'aperçu (retour/annuler) : purge le payload (abandon
  // explicite) puis revient à l'écran amont correct (ajustement vs génération).
  const handleLeavePreview = () => {
    try {
      window.sessionStorage.removeItem(SESSION_KEY);
    } catch {
      // Ignore : sessionStorage peut être bloqué (private mode).
    }
    navigate(mesocyclePreviewBackTarget(params));
  };

  return (
    <div className="min-h-dvh bg-muted/30 pb-36">
      <Header
        templateName={template.name}
        totalWeeks={generated.totalWeeks}
        sessionsPerWeek={generated.sessionsPerWeek}
        engineVersion={generated.engineVersion}
        onBack={handleLeavePreview}
      />

      <div className="mx-auto max-w-3xl space-y-4 px-4 pt-4">
        {params.adjust && (
          <div className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm dark:border-amber-800/60 dark:bg-amber-950/30">
            <RefreshCw className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span className="text-amber-900 dark:text-amber-100">
              Ajustement mi-cycle — volume{" "}
              <span className="font-semibold tabular-nums">
                {formatPctDelta(params.volumeFactor ?? 1)}
              </span>
              , intensité{" "}
              <span className="font-semibold tabular-nums">
                {formatPctDelta(params.intensityFactor ?? 1)}
              </span>
              {params.startPhase && (
                <>
                  , reprise en phase{" "}
                  <span className="font-semibold">
                    {PERIODIZATION_CYCLES[params.startPhase]?.label ??
                      params.startPhase}
                  </span>
                </>
              )}
            </span>
          </div>
        )}
        {isCoachMode && (
          <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5 text-sm">
            <Target className="h-4 w-4 shrink-0 text-primary" />
            <span className="text-muted-foreground">
              Aperçu pour&nbsp;
              <span className="font-semibold text-foreground">
                {targetName ?? "ce nageur"}
              </span>
            </span>
          </div>
        )}
        <ReasoningPanel
          generated={generated}
          bilanPending={assessment.status === "bilan_pending"}
          normesContext={{
            ageBand: input.athlete.ageBand,
            level: input.athlete.level,
            performanceTier: input.athlete.performanceTier,
          }}
          replacePlan={
            existingActiveMesocycle
              ? {
                  eventGroup: existingActiveMesocycle.event_group,
                  kind: existingActiveMesocycle.kind,
                  weeks: existingActiveMesocycle.target_week_count,
                  startDateIso: params.startDate,
                  isCoach: isCoachMode,
                }
              : null
          }
        />
        <PlanPanel generated={generated} startDateIso={params.startDate} />
      </div>

      <CtaBar
        totalWeeks={generated.totalWeeks}
        pending={applyMutation.isPending}
        onConfirm={() => applyMutation.mutate()}
        onCancel={handleLeavePreview}
      />
    </div>
  );
}

// ── Header ───────────────────────────────────────────────────────────────────

function Header({
  templateName,
  totalWeeks,
  sessionsPerWeek,
  engineVersion,
  onBack,
}: {
  templateName: string;
  totalWeeks: number;
  sessionsPerWeek: number;
  engineVersion: string;
  onBack: () => void;
}) {
  return (
    <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Retour"
          className="flex h-9 w-9 items-center justify-center rounded-lg border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-600 dark:text-violet-400">
            Bilan Muscu
          </p>
          <h1 className="truncate text-base font-bold leading-tight">
            Aperçu du mésocycle
          </h1>
        </div>
        <Badge
          variant="outline"
          className="hidden gap-1 border-border bg-card font-mono text-[10px] tabular-nums sm:flex"
        >
          <Sparkles className="h-2.5 w-2.5" />
          v{engineVersion}
        </Badge>
      </div>
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-3 gap-y-1 px-4 pb-3 text-[11px] text-muted-foreground">
        <span className="font-semibold text-foreground">{templateName}</span>
        <Separator orientation="vertical" className="hidden h-3 sm:block" />
        <span>
          <span className="tabular-nums font-bold text-foreground">{totalWeeks}</span> semaines
        </span>
        <Separator orientation="vertical" className="hidden h-3 sm:block" />
        <span>
          <span className="tabular-nums font-bold text-foreground">{sessionsPerWeek}</span> séances/sem.
        </span>
      </div>
    </header>
  );
}

// ── Reasoning panel ──────────────────────────────────────────────────────────

function ReasoningPanel({
  generated,
  bilanPending,
  normesContext,
  replacePlan,
}: {
  generated: GeneratedMesocycle;
  bilanPending: boolean;
  normesContext: {
    ageBand: MesocycleInput["athlete"]["ageBand"];
    level: MesocycleInput["athlete"]["level"];
    performanceTier: MesocycleInput["athlete"]["performanceTier"];
  };
  /** Audit 2026-05-26 (§308) — plan actif qui sera remplacé par cet apply,
   *  ou `null` si aucun (1re génération). */
  replacePlan: {
    eventGroup: string;
    kind: string;
    weeks: number;
    startDateIso: string;
    isCoach: boolean;
  } | null;
}) {
  const [open, setOpen] = useState(true);
  const reasoning = generated.reasoning;
  const buckets: AllBucket[] = [
    "lower_strength",
    "lower_power",
    "upper_strength",
    "upper_power",
    "mobility",
    "psychology",
  ];

  return (
    <Card className="overflow-hidden rounded-2xl border border-slate-300/60 bg-slate-50/40 dark:border-slate-800/80 dark:bg-slate-950/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-slate-100/50 dark:hover:bg-slate-900/30"
        aria-expanded={open}
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900">
            <Activity className="h-4 w-4" />
          </div>
          <div className="min-w-0 leading-tight">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-600 dark:text-slate-400">
              Raisonnement auditable
            </p>
            <h2 className="text-sm font-bold">Pourquoi ce plan ?</h2>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ConfidenceIndicator value={reasoning.dataConfidence} />
          {open ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {open && (
        <div className="space-y-4 border-t border-slate-200 px-4 py-4 dark:border-slate-800">
          {/* Score bars */}
          <div>
            <h3 className="mb-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
              Scores des 6 seaux
            </h3>
            <ul className="space-y-1.5">
              {buckets.map((b) => (
                <li key={b}>
                  <BucketScoreRow bucket={b} value={reasoning.bucketScores[b]} />
                </li>
              ))}
            </ul>
          </div>

          <Separator className="bg-slate-200 dark:bg-slate-800" />

          {/* Top priorities */}
          <div>
            <h3 className="mb-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
              Top 3 priorités
            </h3>
            <ol className="space-y-2">
              {reasoning.bucketPriorities.slice(0, 3).map((p) => (
                <li
                  key={p.bucket}
                  className="flex gap-3 rounded-xl border border-slate-200 bg-card p-2.5 dark:border-slate-800"
                >
                  <span
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-md font-mono text-[10px] font-black tabular-nums",
                      p.overrideApplied
                        ? "bg-rose-600 text-white"
                        : "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900",
                    )}
                  >
                    {String(p.rank).padStart(2, "0")}
                  </span>
                  <div className="min-w-0 flex-1 leading-tight">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold">
                        {BUCKET_LABEL_FR[p.bucket]}
                      </span>
                      {p.overrideApplied && (
                        <Badge
                          variant="outline"
                          className="h-4 border-rose-400 bg-rose-50 px-1 text-[9px] font-black uppercase tracking-wider text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300"
                        >
                          Override
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                      {p.rationale}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {/* Notes additionnelles */}
          {replacePlan && (
            <NoteStrip
              tone="amber"
              icon={<RefreshCw className="h-4 w-4" />}
              title="Remplace le plan en cours"
              body={`${replacePlan.isCoach ? "Ce nageur a" : "Tu as"} déjà un mésocycle actif (${replacePlan.eventGroup} · ${replacePlan.kind === "season" ? "Saison" : "Mini-prépa"}, ${replacePlan.weeks} sem.). Confirmer le remplace à partir du ${fmtShortDate(replacePlan.startDateIso)} — les ajustements manuels de cette période seront perdus (récupérables via « Annuler le mésocycle »). Les séances déjà passées avant cette date sont conservées.`}
            />
          )}
          {reasoning.psychFlag && (
            <NoteStrip
              tone="amber"
              icon={<AlertCircle className="h-4 w-4" />}
              title="Score psychologie bas"
              body="Pense à parler à ton coach — soutien recommandé pendant ce cycle."
            />
          )}
          {reasoning.activeContraindications.length > 0 && (
            <NoteStrip
              tone="rose"
              icon={<RefreshCw className="h-4 w-4" />}
              title="Substitutions actives"
              body={`Zones évitées : ${reasoning.activeContraindications.map((z) => ZONE_LABEL_FR[z] ?? z).join(", ")}.`}
            />
          )}
          {bilanPending && (
            <NoteStrip
              tone="amber"
              icon={<AlertCircle className="h-4 w-4" />}
              title="Bilan physique coach non encore réalisé"
              body="Le score Mobilité est conservateur et la confiance des données est réduite. Ton coach pourra l'enrichir ensuite."
            />
          )}
          {hasUnderLeveledProfile(
            normesContext.level,
            normesContext.performanceTier,
          ) && (
            <NoteStrip
              tone="amber"
              icon={<AlertCircle className="h-4 w-4" />}
              title="Profil sous-calibré pour ce niveau"
              body={`Tier « ${normesContext.performanceTier} » mais pratique « ${normesContext.level} » : les exercices avancés (tractions lestées, haltérophilie, pliométrie avancée) ne sont pas débloqués. Ajuste le niveau de pratique dans « Profil muscu ».`}
            />
          )}

          {/* Footer contexte des normes (G1+G3 : tier + niveau résolus) */}
          <div className="rounded-xl border border-slate-200 bg-slate-100/60 px-3 py-2 text-[11px] text-slate-700 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300">
            <span className="font-bold">Normes :</span>{" "}
            <span className="font-mono">{normesContext.ageBand}</span>
            {" · niveau "}
            <span className="font-mono">{normesContext.level}</span>
            {" · tier "}
            <span className="font-mono">{normesContext.performanceTier}</span>
          </div>

          {/* Footer barème confidence */}
          <div className="rounded-xl border border-slate-200 bg-slate-100/60 px-3 py-2 text-[11px] text-slate-700 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300">
            <span className="font-bold">Fiabilité des barèmes :</span>{" "}
            <span className="font-mono">{reasoning.lowestBaremeConfidence}</span>{" "}
            <span className="text-muted-foreground">
              (= confiance la plus basse parmi les KPI consultés)
            </span>
          </div>
        </div>
      )}
    </Card>
  );
}

function BucketScoreRow({
  bucket,
  value,
}: {
  bucket: AllBucket;
  value: number | null;
}) {
  const v = value ?? 0;
  const color =
    value === null
      ? "bg-slate-300 dark:bg-slate-700"
      : v < 40
        ? "bg-rose-500"
        : v < 70
          ? "bg-amber-500"
          : "bg-emerald-500";
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-[110px] shrink-0 text-[11px] font-semibold text-foreground/90">
        {BUCKET_SHORT_FR[bucket]}
      </div>
      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-slate-200/60 dark:bg-slate-800/60">
        {value === null ? (
          <div
            className="h-full w-full opacity-50"
            style={{
              backgroundImage:
                "repeating-linear-gradient(45deg, currentColor 0 2px, transparent 2px 5px)",
              color: "rgb(148 163 184)",
            }}
          />
        ) : (
          <div
            className={cn("h-full transition-all", color)}
            style={{ width: `${Math.max(2, Math.min(100, v))}%` }}
          />
        )}
      </div>
      <div className="w-12 shrink-0 text-right font-mono text-[11px] font-bold tabular-nums">
        {value === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          Math.round(v)
        )}
      </div>
    </div>
  );
}

function ConfidenceIndicator({
  value,
}: {
  value: "low" | "partial" | "full";
}) {
  const filled = value === "full" ? 3 : value === "partial" ? 2 : 1;
  const tone =
    value === "full"
      ? "bg-emerald-500"
      : value === "partial"
        ? "bg-amber-500"
        : "bg-rose-500";
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex gap-0.5">
        {[1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn(
              "h-2 w-1.5 rounded-sm",
              i <= filled ? tone : "bg-slate-300 dark:bg-slate-700",
            )}
          />
        ))}
      </div>
      <span className="hidden text-[10px] font-bold uppercase tracking-wider text-muted-foreground sm:inline">
        {value}
      </span>
    </div>
  );
}

function NoteStrip({
  tone,
  icon,
  title,
  body,
}: {
  tone: "amber" | "rose";
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  const toneClass =
    tone === "amber"
      ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-100"
      : "border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-800/60 dark:bg-rose-950/30 dark:text-rose-100";
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-xl border px-3 py-2.5",
        toneClass,
      )}
    >
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div className="min-w-0 leading-tight">
        <p className="text-xs font-bold">{title}</p>
        <p className="mt-0.5 text-[11px] leading-relaxed opacity-90">{body}</p>
      </div>
    </div>
  );
}

// ── Plan panel ───────────────────────────────────────────────────────────────

function PlanPanel({
  generated,
  startDateIso,
}: {
  generated: GeneratedMesocycle;
  /** Date de départ réelle (peut tomber en milieu de semaine). §307. */
  startDateIso: string;
}) {
  // §307 — les libellés de semaine sont ancrés sur le lundi de la semaine de
  // départ (la date de départ pouvant tomber en milieu de semaine).
  const startMondayIso = useMemo(
    () => toISODate(getMonday(new Date(startDateIso + "T00:00:00"))),
    [startDateIso],
  );

  // Par défaut : TOUT REPLIÉ. La vue est dense (5-23 semaines × 2-5 séances ×
  // 3-5 exercices) — le repli laisse la timeline lisible, l'utilisateur ouvre
  // ce qu'il veut auditer. Bouton "Tout déplier" toujours disponible.
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const toggleWeek = (n: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <div className="min-w-0 leading-tight">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-600 dark:text-violet-400">
            Plan auditable
          </p>
          <h2 className="flex items-center gap-2 text-sm font-bold">
            <Layers className="h-4 w-4 text-violet-600 dark:text-violet-400" />
            Plan détaillé
          </h2>
        </div>
        <button
          type="button"
          onClick={() => {
            if (expanded.size === generated.weeks.length) setExpanded(new Set([1]));
            else setExpanded(new Set(generated.weeks.map((w) => w.weekNumber)));
          }}
          className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground"
        >
          {expanded.size === generated.weeks.length ? "Tout replier" : "Tout déplier"}
        </button>
      </div>

      <ol className="space-y-2.5" id="plan-weeks">
        {generated.weeks.map((week) => {
          const c = CYCLE_COLOR[week.cycle];
          const cycleLabel =
            PERIODIZATION_CYCLES[week.cycle]?.label ?? week.cycle;
          const isOpen = expanded.has(week.weekNumber);
          const dateStart = weekDateLabel(startMondayIso, week.weekNumber);
          return (
            <li
              key={week.weekNumber}
              id={`week-${week.weekNumber}`}
              className="overflow-hidden rounded-2xl border bg-card"
            >
              <button
                type="button"
                onClick={() => toggleWeek(week.weekNumber)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
                aria-expanded={isOpen}
              >
                <span
                  className={cn(
                    "block h-3 w-3 shrink-0 rounded-full ring-4",
                    c.dot,
                    c.ring,
                  )}
                />
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-[10px] font-black tabular-nums tracking-wider text-muted-foreground">
                      S{String(week.weekNumber).padStart(2, "0")}
                    </span>
                    <span className="text-sm font-bold">{cycleLabel}</span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Démarre le lundi {dateStart} ·{" "}
                    <span className="tabular-nums">{week.sessions.length}</span>{" "}
                    séances
                  </p>
                </div>
                <div className="shrink-0">
                  {isOpen ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              </button>

              {isOpen && (
                <div className={cn("border-t px-2 py-2 sm:px-3", c.bg)}>
                  <div className="space-y-2.5">
                    {week.sessions.map((s) => (
                      <SessionCard
                        key={s.sessionNumber}
                        session={s}
                        cycleColor={c}
                      />
                    ))}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function SessionCard({
  session,
  cycleColor,
}: {
  session: GeneratedMesocycle["weeks"][number]["sessions"][number];
  cycleColor: (typeof CYCLE_COLOR)[PeriodizationCycle];
}) {
  const dayLabel = WEEKDAY_LABELS[session.weekday] ?? `J${session.sessionNumber}`;
  const roleBadge = ROLE_BADGE[session.role];
  return (
    <div className="rounded-xl border bg-background p-3 shadow-sm">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-bold">
          <span className="font-mono text-[10px] font-black uppercase tracking-wider text-muted-foreground">
            {dayLabel}
          </span>
          <Badge
            variant="outline"
            className={cn(
              "h-5 px-1.5 text-[9px] font-black uppercase tracking-wider",
              roleBadge.className,
            )}
          >
            {roleBadge.label}
          </Badge>
        </h3>
        <div className="flex flex-wrap items-center justify-end gap-1">
          {session.buckets.map((b) => (
            <Badge
              key={b}
              variant="outline"
              className={cn(
                "h-5 px-1.5 text-[9px] font-black uppercase tracking-wider",
                b === "mobility"
                  ? "border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                  : cn(cycleColor.bg, cycleColor.text, "border-current/30"),
              )}
            >
              {BUCKET_SHORT_FR[b as AllBucket]}
            </Badge>
          ))}
        </div>
      </div>

      <ul className="divide-y divide-border/60">
        {session.exercises.map((ex, idx) => {
          // §351 — eyebrow de sous-section quand on change de bloc d'échauffement
          // (common → corrective) ou qu'on passe au travail principal.
          const prevKind = idx > 0 ? session.exercises[idx - 1].warmupKind : undefined;
          const sectionLabel =
            ex.warmupKind && ex.warmupKind !== prevKind
              ? warmupSectionLabel(ex.warmupKind)
              : !ex.warmupKind && prevKind
                ? "Séance"
                : null;
          const isWarmupItem = !!ex.warmupKind;
          const chip =
            ex.warmupKind === "corrective"
              ? correctiveChipLabel(ex.correctiveAxis, ex.correctiveSide)
              : null;
          return (
          <li key={idx} className="block py-0">
          {sectionLabel && (
            <div className="flex items-center gap-2 pt-2.5 pb-1">
              <span
                className={cn(
                  "text-[9px] font-black uppercase tracking-wider",
                  isWarmupItem ? BLOCK_STYLES.warmup.text : "text-muted-foreground",
                )}
              >
                {sectionLabel}
              </span>
              <div
                className={cn(
                  "h-px flex-1",
                  isWarmupItem ? BLOCK_STYLES.warmup.divider : "bg-border/60",
                )}
              />
            </div>
          )}
          <div
            className={cn(
              "flex items-start gap-3 py-2 rounded-lg",
              isWarmupItem && cn(BLOCK_STYLES.warmup.bg, "px-2"),
            )}
          >
            <span className={cn(
              "mt-0.5 w-5 shrink-0 font-mono text-[10px] font-black tabular-nums",
              isWarmupItem ? BLOCK_STYLES.warmup.textMuted : "text-muted-foreground",
            )}>
              {String(idx + 1).padStart(2, "0")}
            </span>
            <ExerciseGifLightbox
              src={ex.illustrationGif}
              alt={ex.nomExercice}
              size="sm"
              className="mt-0.5"
            />
            <div className="min-w-0 flex-1 leading-tight">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-sm font-semibold">{ex.nomExercice}</span>
                <Badge
                  variant="outline"
                  className="h-4 px-1 text-[9px] font-bold uppercase tracking-wider text-muted-foreground"
                >
                  {BUCKET_SHORT_FR[ex.bucket as AllBucket]}
                </Badge>
                {chip && (
                  <Badge
                    variant="outline"
                    className={cn(
                      "h-4 px-1 text-[9px] font-bold tracking-wide normal-case",
                      BLOCK_STYLES.warmup.badge,
                    )}
                  >
                    {chip}
                  </Badge>
                )}
                {ex.isCore && (
                  <Badge
                    variant="outline"
                    className="h-4 border-violet-300 bg-violet-50 px-1 text-[9px] font-bold uppercase tracking-wider text-violet-700 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300"
                  >
                    core
                  </Badge>
                )}
                {ex.substituted && (
                  <Badge
                    variant="outline"
                    className="h-4 border-orange-300 bg-orange-50 px-1 text-[9px] font-bold uppercase tracking-wider text-orange-700 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-300"
                  >
                    remplace #{ex.originalExerciseId}
                  </Badge>
                )}
              </div>
              {ex.intention && (
                <p className="mt-0.5 text-[11px] italic leading-relaxed text-muted-foreground">
                  {ex.intention}
                </p>
              )}
            </div>
            <div className="shrink-0 text-right">
              <p className="font-mono text-[12px] font-bold tabular-nums">
                {ex.sets} × {ex.reps}
                {ex.intensityPct1rm != null && (
                  <span className="text-muted-foreground">
                    {" @ "}
                    {ex.intensityPct1rm}%
                  </span>
                )}
              </p>
              <p className="font-mono text-[10px] tabular-nums text-muted-foreground">
                {ex.restSeconds}s
              </p>
            </div>
          </div>
          </li>
          );
        })}
      </ul>
    </div>
  );
}

// ── CTA bar ──────────────────────────────────────────────────────────────────

function CtaBar({
  totalWeeks,
  pending,
  onConfirm,
  onCancel,
}: {
  totalWeeks: number;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto max-w-3xl px-4 py-3">
        <p className="mb-2 text-[11px] leading-relaxed text-muted-foreground">
          Confirme l'application sur ta planif muscu pour les{" "}
          <span className="tabular-nums font-bold">{totalWeeks}</span> prochaines
          semaines. Ton coach pourra la consulter et l'ajuster.
        </p>
        {/*
         * Stacke vertical sur mobile (flex-col-reverse → CTA primaire au-dessus
         * du secondaire, plus accessible). Row sur sm+.
         * Le bouton primaire raccourci ("Confirmer" sans "& appliquer") évite
         * l'overflow sur les viewports étroits.
         */}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={onCancel}
            className="w-full text-xs sm:w-auto"
          >
            Modifier les paramètres
          </Button>
          <Button
            type="button"
            disabled={pending}
            onClick={onConfirm}
            className="flex h-12 w-full items-center justify-center gap-2 bg-violet-600 px-4 text-base font-semibold text-white shadow-lg hover:bg-violet-700 disabled:opacity-60 dark:bg-violet-500 dark:hover:bg-violet-400 sm:ml-auto sm:w-auto sm:px-5"
          >
            {pending ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Application…
              </>
            ) : (
              <>
                <CheckCircle2 className="h-5 w-5" />
                Confirmer
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Skeletons + error screens ────────────────────────────────────────────────

function PageSkeleton() {
  return (
    <div className="min-h-dvh bg-muted/30 pb-24">
      <div className="border-b bg-background px-4 py-3">
        <div className="mx-auto h-9 max-w-3xl animate-pulse rounded bg-muted" />
      </div>
      <div className="mx-auto max-w-3xl space-y-3 px-4 pt-4">
        <div className="h-48 animate-pulse rounded-2xl bg-muted" />
        <div className="h-32 animate-pulse rounded-2xl bg-muted" />
        <div className="h-32 animate-pulse rounded-2xl bg-muted" />
      </div>
    </div>
  );
}

function ErrorScreen({
  title,
  body,
  primary,
}: {
  title: string;
  body: string;
  primary: { label: string; onClick: () => void };
}) {
  const [, navigate] = useLocation();
  return (
    <div className="min-h-dvh bg-muted/30">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <button
            type="button"
            onClick={() => navigate("/strength")}
            aria-label="Retour"
            className="flex h-9 w-9 items-center justify-center rounded-lg border bg-card text-muted-foreground hover:bg-muted"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h1 className="text-base font-bold">Aperçu indisponible</h1>
        </div>
      </header>
      <div className="mx-auto max-w-2xl px-4 pt-8">
        <Card className="border-rose-300 bg-rose-50 p-6 text-center dark:border-rose-800/60 dark:bg-rose-950/40">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-600 text-white dark:bg-rose-500">
            <AlertCircle className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-bold text-rose-900 dark:text-rose-100">
            {title}
          </h2>
          <p className="mx-auto mt-1.5 max-w-[360px] text-sm leading-relaxed text-rose-700 dark:text-rose-300">
            {body}
          </p>
          <Button
            type="button"
            onClick={primary.onClick}
            className="mt-5 bg-rose-600 text-white hover:bg-rose-700 dark:bg-rose-500 dark:hover:bg-rose-400"
          >
            {primary.label}
          </Button>
        </Card>
      </div>
    </div>
  );
}

function ProfileIncompleteScreen() {
  const [, navigate] = useLocation();
  return (
    <ErrorScreen
      title="Profil incomplet"
      body="Renseigne ta date de naissance et ton sexe dans ton profil — ces infos sont nécessaires pour calibrer les barèmes du moteur."
      primary={{ label: "Compléter mon profil", onClick: () => navigate("/profile") }}
    />
  );
}

function AssessmentRequiredScreen() {
  const [, navigate] = useLocation();
  return (
    <ErrorScreen
      title="Bilan muscu non complété"
      body="Le mésocycle se construit à partir de tes scores de bilan. Va d'abord remplir ton bilan."
      primary={{
        label: "Aller au bilan",
        onClick: () => navigate("/strength/questionnaire"),
      }}
    />
  );
}

function EngineErrorScreen({ message }: { message: string }) {
  const [, navigate] = useLocation();
  return (
    <ErrorScreen
      title="Le moteur ne peut pas générer ce mésocycle"
      body={`${message}. Ajuste les paramètres (durée, épreuve, famille) puis réessaie.`}
      primary={{
        label: "Modifier les paramètres",
        onClick: () => navigate("/strength/mesocycle-generate"),
      }}
    />
  );
}

// Type guards / sanity
void (null as unknown as StrengthBucket | undefined);
