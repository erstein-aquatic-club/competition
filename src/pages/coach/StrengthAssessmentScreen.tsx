/**
 * StrengthAssessmentScreen — coach screen to record the mobility &
 * movement-quality scores that complete a swimmer's "Bilan Muscu".
 *
 * Feature "Bilan Muscu → Mésocycle", Chantier B, Phase 8 (§287).
 *
 * Flow
 * ────
 *  1. (coach / admin only) athlete-selection step — pick who is assessed.
 *     Reuses the exact KpiWizard pattern: `getAthletes()` + KpiSwimmerPicker.
 *  2. once an athlete is picked, `getLatestAssessment(athleteId)` resolves
 *     one of four branches:
 *
 *      • no assessment, or latest is `completed`
 *          → "Démarrer un bilan" CTA. createAssessment({athlete_id,coach_id})
 *            inserts a fresh row in `questionnaire_pending`.
 *      • `questionnaire_pending`
 *          → waiting state: the swimmer has not filled their self-report
 *            yet — the coach cannot score.
 *      • `bilan_pending`
 *          → the scoring form (6× 0-3 scores) + the read-only context
 *            (swimmer questionnaire + latest KPIs).
 *      • `completed`
 *          → handled like "no assessment" : a new bilan can be started.
 *
 *  Submit builds the `StrengthPhysicalTests` object and calls
 *  `updateAssessmentPhysicalTests(id, …)` which flips status to `completed`.
 *
 * Focus mode : sets `document.body.dataset.focusMode = "strength"` so the
 * bottom navigation dock is hidden — same convention as KpiWizard.
 */
import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getAthletes,
  getLatestAssessment,
  createAssessment,
  updateAssessmentPhysicalTests,
  getLatestKpiMeasurements,
  getPreviousCompletedPhysicalTests,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type {
  StrengthAssessment,
  StrengthPhysicalTests,
  AthleteSummary,
} from "@/lib/api/types";

import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleSlash2,
  ClipboardCheck,
  Dumbbell,
  Hourglass,
  Send,
  StretchHorizontal,
  Users,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import { KpiSwimmerPicker } from "@/components/strength/kpi/KpiSwimmerPicker";
import { initials } from "@/components/strength/kpi/kpiHelpers";
import { AssessmentContext } from "@/components/strength/assessment/AssessmentContext";
import { AssessmentScoreField } from "@/components/strength/assessment/AssessmentScoreField";
import { BilanProgress, type BilanStep } from "@/components/strength/assessment/BilanProgress";
import { computeBilanProgress } from "@/lib/strength/bilanProgress";
import {
  MOBILITY_SCORES,
  MOVEMENT_SCORES,
  SCORE_LEGEND,
  SCORE_UNSET,
  type AssessmentScoreItem,
  type MobilityScoreKey,
  type MovementScoreKey,
} from "@/components/strength/assessment/assessmentScores";

const ALL_SCORES: AssessmentScoreItem[] = [...MOBILITY_SCORES, ...MOVEMENT_SCORES];

/** Every score key, mobility + movement. */
type ScoreKey = MobilityScoreKey | MovementScoreKey;

/** Per-score-key state. Sentinel SCORE_UNSET = not yet picked. */
type ScoreState = Record<ScoreKey, number>;

const emptyScores = (): ScoreState =>
  Object.fromEntries(
    ALL_SCORES.map((s) => [s.key, SCORE_UNSET]),
  ) as ScoreState;

/**
 * Centered single-message state (loading-free), reused by several screen
 * branches. Module-scope on purpose: declaring it inside the screen
 * component would make React see a fresh component *type* each render and
 * remount the whole subtree.
 */
function CenteredState({
  icon,
  tone = "muted",
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  tone?: "muted" | "primary" | "destructive";
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-4 py-10 text-center">
      <div
        className={cn(
          "mb-4 flex h-14 w-14 items-center justify-center rounded-2xl",
          tone === "primary" && "bg-primary/10 text-primary",
          tone === "destructive" && "bg-destructive/10 text-destructive",
          tone === "muted" && "bg-muted text-muted-foreground",
        )}
      >
        {icon}
      </div>
      <h1 className="text-lg font-bold tracking-tight text-foreground">
        {title}
      </h1>
      <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>
      {children}
    </div>
  );
}

export default function StrengthAssessmentScreen() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const userId = useAuth((s) => s.userId);
  const role = useAuth((s) => s.role);
  const isCoach = role === "coach" || role === "admin";

  // ── Focus mode : hide the bottom dock while the screen is open ──
  useEffect(() => {
    document.body.dataset.focusMode = "strength";
    return () => {
      if (document.body.dataset.focusMode === "strength") {
        delete document.body.dataset.focusMode;
      }
    };
  }, []);

  // ── Athletes roster (coach-only screen — always needed) ──
  const { data: athletes = [], isLoading: athletesLoading } = useQuery({
    queryKey: ["athletes"],
    queryFn: () => getAthletes(),
    staleTime: 5 * 60_000,
  });

  // Route /coach/strength-assessment/:athleteId → cible pré-sélectionnée (fil
  // conducteur coach §302) : la cible persiste entre les étapes et au retour
  // du wizard KPI. /coach/strength-assessment (sans param) → sélection libre.
  const routeParams = useParams<{ athleteId?: string }>();
  const paramAthleteId =
    routeParams.athleteId != null ? Number(routeParams.athleteId) : null;

  // ── Screen state ──
  const [selectedAthleteId, setSelectedAthleteId] = useState<number | null>(
    paramAthleteId,
  );
  const [athletePickerOpen, setAthletePickerOpen] = useState(false);
  const [scores, setScores] = useState<ScoreState>(emptyScores);
  // Set true on a successful submit so the done-state shows immediately,
  // even before the assessment query refetch settles.
  const [submittedLocally, setSubmittedLocally] = useState(false);

  const selectedAthlete = useMemo<AthleteSummary | null>(
    () => athletes.find((a) => a.id === selectedAthleteId) ?? null,
    [athletes, selectedAthleteId],
  );
  const athleteName = selectedAthlete?.display_name ?? "ce nageur";

  // ── Latest assessment for the selected athlete ──
  const {
    data: assessment,
    isLoading: assessmentLoading,
    isError: assessmentError,
  } = useQuery<StrengthAssessment | null>({
    queryKey: ["strength-assessment", selectedAthleteId],
    queryFn: () => getLatestAssessment(selectedAthleteId!),
    enabled: selectedAthleteId != null,
  });

  const status = assessment?.status ?? null;
  // A `completed` (or absent) assessment means "start a new bilan".
  const canStartNew = assessment == null || status === "completed";
  const isScoring = status === "bilan_pending" && !submittedLocally;

  // ── Latest KPIs — read-only context shown in the scoring branch ──
  // Gated purely on the athlete being selected, NOT on `isScoring`: gating
  // on derived status would silently empty the KPI block under the coach
  // if the assessment refetch settles to a non-`bilan_pending` status
  // mid-scoring. One extra small fetch on the start/waiting branches is an
  // acceptable trade for that robustness (matches KpiWizard).
  const { data: kpis } = useQuery({
    queryKey: ["kpi-latest", selectedAthleteId],
    queryFn: () => getLatestKpiMeasurements(selectedAthleteId!),
    enabled: selectedAthleteId != null,
  });

  // ── Notation mobilité/mouvement du dernier bilan COMPLÉTÉ — pour la
  // comparaison dans le temps (§301 T5). Exclut le bilan en cours.
  const { data: prevPhysical } = useQuery({
    queryKey: ["assessment-prev-physical", selectedAthleteId, assessment?.id],
    queryFn: () =>
      getPreviousCompletedPhysicalTests(selectedAthleteId!, assessment?.id),
    enabled: selectedAthleteId != null,
  });

  /** Note du bilan précédent pour un axe (null si aucun bilan antérieur). */
  const prevScoreFor = (item: AssessmentScoreItem): number | null => {
    if (!prevPhysical) return null;
    const group = prevPhysical[item.group] as
      | Record<string, number>
      | undefined;
    const v = group?.[item.key];
    return typeof v === "number" ? v : null;
  };

  // Reset the form whenever the athlete or the assessment identity changes —
  // a stale half-filled form must never leak across swimmers.
  useEffect(() => {
    setScores(emptyScores());
    setSubmittedLocally(false);
  }, [selectedAthleteId, assessment?.id]);

  const allScored = ALL_SCORES.every((s) => scores[s.key] >= 0);

  // ── Mutations ──
  const createMutation = useMutation({
    mutationFn: async () => {
      if (selectedAthleteId == null) {
        throw new Error("Aucun nageur sélectionné");
      }
      return createAssessment({
        athlete_id: selectedAthleteId,
        coach_id: userId ?? null,
      });
    },
    onSuccess: async () => {
      toast.success("Bilan démarré", {
        description: "Le nageur peut maintenant remplir son questionnaire.",
      });
      // refetch (not invalidate) so the NEXT render already sees the new
      // assessment and leaves the start-CTA branch. `createAssessment`
      // inserts unconditionally; with a mere invalidate the enabled
      // "Démarrer" button stays rendered until the refetch settles, so a
      // fast double-tap would insert two `questionnaire_pending` rows for
      // the same athlete. Awaiting the refetch closes that race (same
      // pattern as KpiWizard.restart(), see its "I2" comment).
      await queryClient.refetchQueries({
        queryKey: ["strength-assessment", selectedAthleteId],
      });
    },
    onError: (err: Error) => {
      toast.error("Impossible de démarrer le bilan", {
        description: err.message || "Réessaie dans un instant.",
      });
    },
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (assessment == null) throw new Error("Bilan non résolu");
      const physicalTests: StrengthPhysicalTests = {
        mobility: {
          shoulder_flexion: scores.shoulder_flexion,
          t_spine: scores.t_spine,
          hip: scores.hip,
        },
        movement: {
          scapula_control: scores.scapula_control,
          trunk_neck_alignment: scores.trunk_neck_alignment,
          hip_hinge: scores.hip_hinge,
        },
        filled_at: new Date().toISOString(),
      };
      await updateAssessmentPhysicalTests(assessment.id, physicalTests);
    },
    onSuccess: async () => {
      setSubmittedLocally(true);
      toast.success("Bilan enregistré", {
        description: `Le bilan muscu de ${athleteName} est complété.`,
      });
      await queryClient.invalidateQueries({
        queryKey: ["strength-assessment", selectedAthleteId],
      });
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    onError: (err: Error) => {
      toast.error("Échec de l'enregistrement", {
        description: err.message || "Réessaie dans un instant.",
      });
    },
  });

  const closeScreen = () => navigate("/coach");

  /* ════════════════════════════════════════════════════════════
     Shared shell
     ════════════════════════════════════════════════════════════ */
  const TopBar = (
    <div className="sticky top-0 z-20 flex items-center gap-3 border-b bg-background/95 px-4 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] backdrop-blur">
      <button
        type="button"
        onClick={closeScreen}
        className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Retour
      </button>
      <div className="flex flex-1 items-center justify-center gap-1.5">
        <ClipboardCheck className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold tracking-tight">
          Bilan physique
        </span>
      </div>
      <span className="w-[58px]" aria-hidden />
    </div>
  );

  /* ════════════════════════════════════════════════════════════
     Access guard — coach / admin only
     ════════════════════════════════════════════════════════════ */
  if (!isCoach) {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-background">
        {TopBar}
        <CenteredState
          icon={<CircleSlash2 className="h-7 w-7" />}
          tone="destructive"
          title="Accès réservé"
          description="Seul un coach peut réaliser un bilan physique."
        >
          <Button
            variant="outline"
            className="mt-5 rounded-xl"
            onClick={() => navigate("/")}
          >
            Retour à l'accueil
          </Button>
        </CenteredState>
      </div>
    );
  }

  /* ════════════════════════════════════════════════════════════
     Phase 1 — athlete selection
     ════════════════════════════════════════════════════════════ */
  if (selectedAthleteId == null) {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-background">
        {TopBar}
        <div className="mx-auto w-full max-w-md flex-1 px-4 py-6">
          <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
            <Users className="h-6 w-6 text-primary" />
          </div>
          <h1 className="mt-3 text-xl font-bold tracking-tight text-foreground">
            Quel nageur évalues-tu ?
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sélectionne le nageur dont tu vas réaliser le bilan physique
            (mobilité et qualité de mouvement).
          </p>

          <Card className="mt-5 flex items-center gap-3 border-dashed p-3.5">
            <button
              type="button"
              onClick={() => setAthletePickerOpen(true)}
              className="flex w-full items-center gap-3 text-left"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted">
                <UserPlus className="h-5 w-5 text-muted-foreground" />
              </span>
              <span className="text-sm font-medium text-muted-foreground">
                Choisir un nageur…
              </span>
            </button>
          </Card>

          {athletesLoading && (
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Chargement des nageurs…
            </p>
          )}
        </div>

        <KpiSwimmerPicker
          open={athletePickerOpen}
          onOpenChange={setAthletePickerOpen}
          swimmers={athletes}
          selectedId={selectedAthleteId}
          onSelect={setSelectedAthleteId}
          title="Choisir un nageur"
          description="Le nageur dont tu réalises le bilan physique."
        />
      </div>
    );
  }

  /* ── Athlete context strip — shared by every post-selection branch ── */
  const AthleteStrip = (
    <div className="mb-5 flex items-center gap-2.5 rounded-2xl border bg-muted/30 p-2.5">
      <Avatar className="h-9 w-9 shrink-0">
        {selectedAthlete?.avatar_url && (
          <AvatarImage src={selectedAthlete.avatar_url} alt={athleteName} />
        )}
        <AvatarFallback className="bg-muted text-[11px] font-semibold">
          {initials(athleteName)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-sm font-semibold text-foreground">
          {athleteName}
        </p>
        <p className="text-[11px] text-muted-foreground">Bilan muscu</p>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="shrink-0 rounded-full"
        onClick={() => {
          setSelectedAthleteId(null);
          navigate("/coach/strength-assessment");
        }}
      >
        Changer
      </Button>
    </div>
  );

  /* ── Fil conducteur — 3 étapes du bilan, navigation cible conservée (§302) ── */
  const hasKpis = !!kpis && Object.keys(kpis).length > 0;
  const progress = computeBilanProgress(status, hasKpis);
  const bilanSteps: BilanStep[] = [
    {
      key: "questionnaire",
      label: "Questionnaire",
      state: progress.questionnaire,
      // Actionnable seulement tant qu'il n'est pas rempli (remplir avec le nageur).
      onTap:
        progress.questionnaire === "current" && selectedAthleteId != null
          ? () => navigate(`/coach/questionnaire/${selectedAthleteId}`)
          : undefined,
    },
    {
      key: "kpis",
      label: "KPIs",
      state: progress.kpis,
      // Toujours (re)mesurable.
      onTap:
        selectedAthleteId != null
          ? () => navigate(`/coach/kpi-wizard/${selectedAthleteId}`)
          : undefined,
    },
    {
      key: "physical",
      label: "Bilan physique",
      state: progress.physical,
    },
  ];
  const BilanProgressStrip = <BilanProgress steps={bilanSteps} />;

  /* ════════════════════════════════════════════════════════════
     Loading the assessment
     ════════════════════════════════════════════════════════════ */
  if (assessmentLoading) {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-background">
        {TopBar}
        <div className="mx-auto w-full max-w-md flex-1 space-y-4 px-4 py-6">
          {AthleteStrip}
          <Skeleton className="h-7 w-2/3" />
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  /* ════════════════════════════════════════════════════════════
     Error loading the assessment
     ════════════════════════════════════════════════════════════ */
  if (assessmentError) {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-background">
        {TopBar}
        <div className="mx-auto w-full max-w-md flex-1 px-4 py-6">
          {AthleteStrip}
        </div>
        <CenteredState
          icon={<CircleSlash2 className="h-7 w-7" />}
          tone="destructive"
          title="Impossible de charger le bilan"
          description="Une erreur réseau est survenue. Réessaie dans un instant."
        >
          <Button
            variant="outline"
            className="mt-5 rounded-xl"
            onClick={() =>
              queryClient.invalidateQueries({
                queryKey: ["strength-assessment", selectedAthleteId],
              })
            }
          >
            Réessayer
          </Button>
        </CenteredState>
      </div>
    );
  }

  /* ════════════════════════════════════════════════════════════
     Done — bilan just submitted (read-only confirmation)
     ════════════════════════════════════════════════════════════ */
  if (submittedLocally) {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-background">
        {TopBar}
        <CenteredState
          icon={<Check className="h-7 w-7" />}
          tone="primary"
          title="Bilan complété"
          description={`Le bilan muscu de ${athleteName} est enregistré. Le mésocycle pourra être généré à partir de ces données.`}
        >
          <div className="mt-5 flex flex-col gap-2">
            <Button
              className="rounded-xl"
              onClick={() =>
                navigate(`/coach/mesocycle-generate/${selectedAthleteId}`)
              }
            >
              Générer le mésocycle
            </Button>
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => {
              setSelectedAthleteId(null);
              navigate("/coach/strength-assessment");
            }}
            >
              Évaluer un autre nageur
            </Button>
            <Button
              variant="ghost"
              className="rounded-xl"
              onClick={closeScreen}
            >
              Retour
            </Button>
          </div>
        </CenteredState>
      </div>
    );
  }

  /* ════════════════════════════════════════════════════════════
     Branch — no assessment OR latest completed → start a new bilan
     ════════════════════════════════════════════════════════════ */
  if (canStartNew) {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-background">
        {TopBar}
        <div className="mx-auto w-full max-w-md flex-1 px-4 py-6">
          {AthleteStrip}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Dumbbell className="h-4 w-4 text-primary" />
                {status === "completed"
                  ? "Démarrer un nouveau bilan"
                  : "Démarrer un bilan"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {status === "completed"
                  ? `Le précédent bilan de ${athleteName} est complété. Démarre un nouveau bilan pour relancer le cycle.`
                  : `Aucun bilan en cours pour ${athleteName}. Démarre un bilan : le nageur sera invité à remplir son questionnaire avant que tu réalises l'évaluation physique.`}
              </p>
              <ol className="space-y-2 rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground">
                <li className="flex gap-2">
                  <span className="font-bold text-primary">1.</span>
                  Tu démarres le bilan.
                </li>
                <li className="flex gap-2">
                  <span className="font-bold text-primary">2.</span>
                  Le nageur remplit son questionnaire (douleurs, ressenti).
                </li>
                <li className="flex gap-2">
                  <span className="font-bold text-primary">3.</span>
                  Tu notes la mobilité et la qualité de mouvement.
                </li>
              </ol>
            </CardContent>
          </Card>
        </div>

        <div className="sticky bottom-0 border-t bg-background/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
          <div className="mx-auto w-full max-w-md">
            <Button
              className="h-14 w-full rounded-2xl text-base font-bold"
              disabled={createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? (
                "Démarrage…"
              ) : (
                <>
                  Démarrer un bilan
                  <ArrowRight className="ml-1.5 h-5 w-5" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  /* ════════════════════════════════════════════════════════════
     Branch — questionnaire_pending → waiting on the swimmer
     ════════════════════════════════════════════════════════════ */
  if (status === "questionnaire_pending") {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-background">
        {TopBar}
        <div className="mx-auto w-full max-w-md space-y-4 px-4 pt-6">
          {AthleteStrip}
          {BilanProgressStrip}
        </div>
        <CenteredState
          icon={<Hourglass className="h-7 w-7" />}
          tone="muted"
          title="En attente du questionnaire nageur"
          description={`${athleteName} n'a pas encore rempli son auto-évaluation. Remplis-le avec lui, ou enchaîne sur les KPIs en attendant.`}
        >
          <div className="mt-5 flex flex-col gap-2">
            <Button
              className="rounded-xl"
              onClick={() =>
                navigate(`/coach/questionnaire/${selectedAthleteId}`)
              }
            >
              Remplir avec le nageur
            </Button>
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() =>
                navigate(`/coach/kpi-wizard/${selectedAthleteId}`)
              }
            >
              Mesurer les KPIs
            </Button>
            <Button
              variant="ghost"
              className="rounded-xl"
              onClick={() => {
                setSelectedAthleteId(null);
                navigate("/coach/strength-assessment");
              }}
            >
              Évaluer un autre nageur
            </Button>
          </div>
        </CenteredState>
      </div>
    );
  }

  /* ════════════════════════════════════════════════════════════
     Defensive — an unexpected status falls through to a calm message
     ════════════════════════════════════════════════════════════ */
  if (!isScoring) {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-background">
        {TopBar}
        <CenteredState
          icon={<CircleSlash2 className="h-7 w-7" />}
          tone="muted"
          title="Bilan indisponible"
          description="Ce bilan n'est pas au stade de l'évaluation physique."
        >
          <Button
            variant="outline"
            className="mt-5 rounded-xl"
            onClick={() => {
              setSelectedAthleteId(null);
              navigate("/coach/strength-assessment");
            }}
          >
            Choisir un autre nageur
          </Button>
        </CenteredState>
      </div>
    );
  }

  /* ════════════════════════════════════════════════════════════
     Branch — bilan_pending → scoring form + read-only context
     ════════════════════════════════════════════════════════════ */
  const scoredCount = ALL_SCORES.filter((s) => scores[s.key] >= 0).length;

  const renderScoreGroup = (
    title: string,
    icon: React.ReactNode,
    items: AssessmentScoreItem[],
  ) => (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {items.map((item) => (
          <AssessmentScoreField
            key={item.key}
            item={item}
            value={scores[item.key]}
            previous={prevScoreFor(item)}
            onChange={(v) =>
              setScores((prev) => ({ ...prev, [item.key]: v }))
            }
          />
        ))}
      </CardContent>
    </Card>
  );

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      {TopBar}

      <div className="mx-auto w-full max-w-md flex-1 space-y-4 px-4 py-5 pb-32">
        {AthleteStrip}
        {BilanProgressStrip}

        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            Bilan physique
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Note la mobilité et la qualité de mouvement de {athleteName}.
            Appuie-toi sur son questionnaire et ses KPIs ci-dessous.
            {prevPhysical
              ? " La note du dernier bilan est rappelée à côté de chaque axe."
              : ""}
          </p>
        </div>

        {/* Read-only context — swimmer questionnaire + latest KPIs */}
        <AssessmentContext
          questionnaire={assessment?.questionnaire ?? null}
          kpis={kpis}
        />

        {/* 0-3 scale legend */}
        <div className="rounded-xl border bg-muted/30 p-3">
          <p className="mb-2 text-xs font-semibold text-foreground">
            Échelle de notation (0 à 3)
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {SCORE_LEGEND.map((l) => (
              <div
                key={l.value}
                className="flex items-center gap-2 text-[11px] text-muted-foreground"
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-primary/10 text-[11px] font-bold text-primary">
                  {l.value}
                </span>
                {l.label}
              </div>
            ))}
          </div>
        </div>

        {/* Scoring — Mobilité */}
        {renderScoreGroup(
          "Mobilité",
          <StretchHorizontal className="h-4 w-4 text-primary" />,
          MOBILITY_SCORES,
        )}

        {/* Scoring — Mouvement */}
        {renderScoreGroup(
          "Qualité de mouvement",
          <Dumbbell className="h-4 w-4 text-primary" />,
          MOVEMENT_SCORES,
        )}
      </div>

      {/* Sticky submit bar */}
      <div className="sticky bottom-0 z-20 border-t bg-background/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mx-auto w-full max-w-md space-y-2">
          <Button
            className="h-14 w-full rounded-2xl text-base font-bold"
            disabled={!allScored || submitMutation.isPending}
            aria-describedby={!allScored ? "assessment-submit-hint" : undefined}
            onClick={() => submitMutation.mutate()}
          >
            <Send className="mr-1.5 h-5 w-5" />
            {submitMutation.isPending
              ? "Enregistrement…"
              : "Enregistrer le bilan"}
          </Button>
          {!allScored && (
            <p
              id="assessment-submit-hint"
              aria-live="polite"
              className="text-center text-[11px] text-muted-foreground"
            >
              Note les 6 critères ({scoredCount}/6) pour enregistrer.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
