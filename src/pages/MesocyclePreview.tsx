/**
 * MesocyclePreview — aperçu nageur du mésocycle généré (§293, Phase 5.3).
 *
 * Pipeline :
 *  1. Lit les paramètres depuis sessionStorage["eac_pending_mesocycle_params"]
 *     (posés par /strength/mesocycle-generate). Si absents → retour à l'écran
 *     de génération.
 *  2. Fetch en parallèle : profile (sexe + date de naissance), évaluation,
 *     mesures KPI, template choisi, catalogue d'exercices taggé.
 *  3. Compose `MesocycleInput`, appelle `generateMesocyclePreview` (moteur pur).
 *  4. Affiche : raisonnement auditable (6 scores, priorités, confiance) +
 *     plan détaillé (semaines → cycles → séances → exercices).
 *  5. CTA confirmer → `applyMesocycle` (RPC) → toast + retour /strength.
 *
 * Focus mode (dock masqué) — convention KpiWizard / Questionnaire.
 */
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  applyMesocycle,
  generateMesocyclePreview,
  getLatestAssessment,
  getLatestKpiMeasurements,
  getProfile,
  getStrengthPeriodizationTemplate,
  listCatalogExercisesTagged,
} from "@/lib/api";
import type {
  StrengthBucket,
  StrengthKpiMeasurement,
} from "@/lib/api/types";
import type {
  AllBucket,
  GeneratedMesocycle,
  MesocycleInput,
} from "@/lib/strength/mesocycleEngine.types";
import { ageBandFor } from "@/lib/strength/kpiBaremes";
import { PERIODIZATION_CYCLES } from "@/lib/strength/periodizationCycles";
import { ZONE_LABEL_FR } from "@/lib/strength/zones";
import { ExerciseGifLightbox } from "@/components/strength/ExerciseGifLightbox";
import type { PeriodizationCycle } from "@/lib/api/types";
import { useAuth } from "@/lib/auth";
import { canGenerateMesocycle } from "@/lib/strength/mesocycleGating";

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
} from "lucide-react";

// ── Constants ────────────────────────────────────────────────────────────────

const SESSION_KEY = "eac_pending_mesocycle_params";

interface PendingParams {
  templateId: string;
  eventGroup: string;
  kind: "season" | "inter_competition";
  targetWeekCount: number;
  sessionsPerWeek: number;
  startWeekMonday: string;
}

const BUCKET_LABEL_FR: Record<AllBucket, string> = {
  lower_strength: "Force bas du corps",
  lower_power: "Puissance bas du corps",
  upper_strength: "Force haut du corps",
  upper_power: "Puissance haut du corps",
  mobility: "Mobilité",
  psychology: "Psychologie",
};

const BUCKET_SHORT_FR: Record<AllBucket, string> = {
  lower_strength: "Force bas",
  lower_power: "Puissance bas",
  upper_strength: "Force haut",
  upper_power: "Puissance haut",
  mobility: "Mobilité",
  psychology: "Psycho",
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
      typeof parsed.templateId !== "string" ||
      typeof parsed.targetWeekCount !== "number" ||
      typeof parsed.sessionsPerWeek !== "number" ||
      typeof parsed.startWeekMonday !== "string"
    ) {
      return null;
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

  // ── Fetches en parallèle ─────────────────────────────────────────────────
  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["profile", userId],
    queryFn: () => getProfile({ userId: userId! }),
    enabled: userId != null,
  });

  const { data: assessment, isLoading: assessLoading } = useQuery({
    queryKey: ["strength-assessment-latest", userId],
    queryFn: () => getLatestAssessment(userId!),
    enabled: userId != null,
  });

  const { data: kpiLatest, isLoading: kpiLoading } = useQuery({
    queryKey: ["strength-kpi-latest", userId],
    queryFn: () => getLatestKpiMeasurements(userId!),
    enabled: userId != null,
  });

  const { data: template, isLoading: tplLoading } = useQuery({
    queryKey: ["strength-periodization-template", params?.templateId],
    queryFn: () => getStrengthPeriodizationTemplate(params!.templateId),
    enabled: params != null,
  });

  const {
    data: catalog = [],
    isLoading: catLoading,
    error: catError,
  } = useQuery({
    queryKey: ["strength-catalog-tagged"],
    queryFn: () => listCatalogExercisesTagged(),
    staleTime: 5 * 60 * 1000,
  });

  const allLoading =
    profileLoading || assessLoading || kpiLoading || tplLoading || catLoading;

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
        level: "intermediate",
      },
      template,
      targetWeekCount: params.targetWeekCount,
      sessionsPerWeek: params.sessionsPerWeek,
      exerciseCatalog: catalog,
    };
  }, [params, profile, assessment, template, kpiLatest, catalog, allLoading]);

  const { generated, engineError } = useMemo<{
    generated: GeneratedMesocycle | null;
    engineError: string | null;
  }>(() => {
    if (!input) return { generated: null, engineError: null };
    try {
      return { generated: generateMesocyclePreview(input), engineError: null };
    } catch (err) {
      return {
        generated: null,
        engineError: err instanceof Error ? err.message : "Erreur du moteur",
      };
    }
  }, [input]);

  // ── Mutation apply ───────────────────────────────────────────────────────
  const applyMutation = useMutation({
    mutationFn: async () => {
      if (!input || !generated || !params)
        throw new Error("Données incomplètes pour appliquer le mésocycle.");
      return applyMesocycle(input, generated, params.startWeekMonday);
    },
    onSuccess: (mesocycleId) => {
      // Nettoie le hand-off pour ne pas re-déclencher au prochain visit.
      try {
        window.sessionStorage.removeItem(SESSION_KEY);
      } catch {
        // Ignore : sessionStorage peut être bloqué (private mode).
      }
      queryClient.invalidateQueries({ queryKey: ["strength-mesocycle-active", userId] });
      queryClient.invalidateQueries({ queryKey: ["strength_planning_slot_overrides"] });
      queryClient.invalidateQueries({ queryKey: ["strength_planning_week_overrides"] });
      queryClient.invalidateQueries({ queryKey: ["strength_planning_slots"] });
      toast.success("Mésocycle appliqué", {
        description: `${generated?.totalWeeks ?? "?"} semaines posées sur ta planif muscu. Ton coach a été notifié.`,
      });
      // ID renvoyé par la RPC — utile pour debug, pas pour le routing.
      void mesocycleId;
      navigate("/strength");
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Erreur inconnue";
      toast.error("Impossible d'appliquer le mésocycle", { description: msg });
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

  if (!generated || !template) {
    return <PageSkeleton />;
  }

  return (
    <div className="min-h-dvh bg-muted/30 pb-36">
      <Header
        templateName={template.name}
        totalWeeks={generated.totalWeeks}
        sessionsPerWeek={generated.sessionsPerWeek}
        engineVersion={generated.engineVersion}
        onBack={() => navigate("/strength/mesocycle-generate")}
      />

      <div className="mx-auto max-w-3xl space-y-4 px-4 pt-4">
        <ReasoningPanel
          generated={generated}
          bilanPending={assessment.status === "bilan_pending"}
        />
        <PlanPanel generated={generated} startMondayIso={params.startWeekMonday} />
      </div>

      <CtaBar
        totalWeeks={generated.totalWeeks}
        pending={applyMutation.isPending}
        onConfirm={() => applyMutation.mutate()}
        onCancel={() => navigate("/strength/mesocycle-generate")}
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
}: {
  generated: GeneratedMesocycle;
  bilanPending: boolean;
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
  startMondayIso,
}: {
  generated: GeneratedMesocycle;
  startMondayIso: string;
}) {
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
  return (
    <div className="rounded-xl border bg-background p-3 shadow-sm">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-bold">
          <span className="font-mono text-[10px] font-black tabular-nums text-muted-foreground">
            J{session.sessionNumber}
          </span>
          <span>Séance {session.sessionNumber}</span>
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
        {session.exercises.map((ex, idx) => (
          <li key={idx} className="flex items-start gap-3 py-2">
            <span className="mt-0.5 w-5 shrink-0 font-mono text-[10px] font-black tabular-nums text-muted-foreground">
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
          </li>
        ))}
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
          semaines. Ton coach sera notifié et pourra ajuster.
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
