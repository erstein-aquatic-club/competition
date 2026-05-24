/**
 * StrengthQuestionnaire — swimmer self-report filled BEFORE the coach's
 * physical assessment. Part of the "Bilan Muscu → Mésocycle" feature
 * (Chantier B, Phase 7, §286).
 *
 * Flow
 * ────
 *  On mount, `getLatestAssessment(athleteId)` resolves one of three states:
 *
 *   1. status === 'questionnaire_pending'  → editable questionnaire form.
 *   2. status === 'bilan_pending'|'completed' → read-only "déjà rempli"
 *      done-state (the questionnaire is already submitted — no re-edit).
 *   3. no assessment at all → empty state: a bilan must be initiated by
 *      the coach first. Expected in the current build (coach-side creation
 *      is a later phase).
 *
 *  The form has four sections, one shadcn Card each, mapped to the
 *  `StrengthQuestionnaire` type:
 *   1. Douleurs        — body-zone pain (reuses WellnessForm's BodyHeatMap).
 *   2. Historique      — free-text injury history.
 *   3. Mobilité        — 1-5 self-rated feel.
 *   4. Psychologie     — three 1-5 scales (confiance, motivation, stress).
 *
 *  Submit performs two sequenced writes via a single React Query mutation.
 *  They are NOT atomic — the order is deliberate:
 *   1. upsertPainReports(athleteId, today, pain) → mirrors the declared
 *      pain into pain_reports for today. May throw (network) — if it does,
 *      the assessment is still `questionnaire_pending`, so a retry works.
 *   2. updateAssessmentQuestionnaire(id, q) → the commit-like final step:
 *      it flips status to `bilan_pending`. Done last on purpose, so a
 *      mid-submit failure never strands the screen in a non-retryable
 *      done-state with the pain mirror silently lost.
 *  On success the screen transitions to the read-only done-state.
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
  updateAssessmentQuestionnaire,
  upsertPainReports,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type {
  StrengthAssessment,
  StrengthQuestionnaire as StrengthQuestionnaireType,
} from "@/lib/api/types";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  Bandage,
  Check,
  ClipboardList,
  CircleSlash2,
  HeartPulse,
  Activity,
  Send,
  Smile,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { BodyHeatMap } from "@/components/wellness/BodyHeatMap";
import { ScaleField } from "@/components/strength/questionnaire/ScaleField";

/** Local date as YYYY-MM-DD (pain_reports keys on a calendar date). */
function todayISODate(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export default function StrengthQuestionnaire() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const userId = useAuth((s) => s.userId);
  const role = useAuth((s) => s.role);
  const isCoach = role === "coach" || role === "admin";

  // Route /coach/questionnaire/:athleteId → bilan accompagné (le coach saisit
  // AVEC le nageur) ; route /strength/questionnaire → le nageur lui-même.
  const routeParams = useParams<{ athleteId?: string }>();
  const targetAthleteId =
    routeParams.athleteId != null ? Number(routeParams.athleteId) : null;
  const effectiveAthleteId =
    isCoach && targetAthleteId != null ? targetAthleteId : userId;
  const isCoachMode = effectiveAthleteId !== userId;

  // Garde de rôle : un nageur ne peut pas cibler un autre nageur.
  useEffect(() => {
    if (targetAthleteId != null && !isCoach) navigate("/strength");
  }, [targetAthleteId, isCoach, navigate]);

  // Nom du nageur ciblé (mode coach) — en-tête de cible.
  const { data: rosterAthletes } = useQuery({
    queryKey: ["athletes"],
    queryFn: () => getAthletes(),
    enabled: isCoachMode,
    staleTime: 5 * 60_000,
  });
  const targetName =
    rosterAthletes?.find((a) => a.id === effectiveAthleteId)?.display_name ??
    null;

  // ── Focus mode : hide the bottom dock while the screen is open ──
  useEffect(() => {
    document.body.dataset.focusMode = "strength";
    return () => {
      if (document.body.dataset.focusMode === "strength") {
        delete document.body.dataset.focusMode;
      }
    };
  }, []);

  // ── Load the latest assessment for the current swimmer ──
  const {
    data: assessment,
    isLoading,
    isError,
  } = useQuery<StrengthAssessment | null>({
    queryKey: ["strength-assessment", effectiveAthleteId],
    queryFn: () => getLatestAssessment(effectiveAthleteId!),
    enabled: effectiveAthleteId != null,
  });

  // ── Form state ──
  // Pain zones keyed body_zone → intensity 1-3 (BodyHeatMap's shape).
  const [painZones, setPainZones] = useState<Record<string, number>>({});
  const [injuryHistory, setInjuryHistory] = useState("");
  const [mobilityFeel, setMobilityFeel] = useState(0);
  const [confidence, setConfidence] = useState(0);
  const [motivation, setMotivation] = useState(0);
  const [stress, setStress] = useState(0);

  // ── Status routing ──
  const status = assessment?.status ?? null;
  const isEditable = status === "questionnaire_pending";
  // The submit mutation flips the assessment to bilan_pending; until the
  // query refetch settles we keep the done-state visible regardless.
  const [submittedLocally, setSubmittedLocally] = useState(false);
  const isDone =
    submittedLocally || status === "bilan_pending" || status === "completed";

  // En mode coach (bilan accompagné), on revient au fil conducteur du bilan
  // (cible conservée) plutôt qu'à la fiche nageur — §302.
  const closeScreen = () =>
    navigate(
      isCoachMode
        ? `/coach/strength-assessment/${effectiveAthleteId}`
        : "/strength",
    );

  // ── Submission ──
  // psychology scales are all required (1-5) ; mobility too. Pain and the
  // injury-history textarea are optional — a swimmer with no pain submits
  // an empty array, which `upsertPainReports` handles (delete-then-noop).
  const allRated =
    mobilityFeel >= 1 && confidence >= 1 && motivation >= 1 && stress >= 1;

  const painEntries = useMemo(
    () =>
      Object.entries(painZones).map(([body_zone, intensity]) => ({
        body_zone,
        intensity,
      })),
    [painZones],
  );

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (assessment == null || effectiveAthleteId == null) {
        throw new Error("Bilan ou identité non résolu");
      }
      const questionnaire: StrengthQuestionnaireType = {
        pain: painEntries,
        injury_history: injuryHistory.trim(),
        mobility_feel: mobilityFeel,
        psychology: { confidence, motivation, stress },
        filled_at: new Date().toISOString(),
      };
      // 1. Mirror the declared pain into pain_reports for today so the
      //    coach's wellness/pain views stay consistent. Done FIRST: if it
      //    throws, the assessment is still `questionnaire_pending`, so a
      //    retry genuinely works (the screen stays editable).
      await upsertPainReports(effectiveAthleteId, todayISODate(), painEntries);
      // 2. Persist the questionnaire — the commit-like final step: it flips
      //    status to `bilan_pending`. Done LAST on purpose, so a failed
      //    pain write above never strands the screen in a non-retryable
      //    done-state with the pain mirror lost.
      await updateAssessmentQuestionnaire(assessment.id, questionnaire);
    },
    onSuccess: async () => {
      setSubmittedLocally(true);
      toast.success("Questionnaire envoyé", {
        description: isCoachMode
          ? "Tu peux maintenant noter le bilan physique."
          : "Ton coach peut maintenant réaliser le bilan physique.",
      });
      if (effectiveAthleteId != null) {
        await queryClient.invalidateQueries({
          queryKey: ["strength-assessment", effectiveAthleteId],
        });
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    onError: (err: Error) => {
      toast.error("Échec de l'envoi", {
        description: err.message || "Réessaie dans un instant.",
      });
    },
  });

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
        <ClipboardList className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold tracking-tight">
          Questionnaire bilan
        </span>
      </div>
      <span className="w-[58px]" aria-hidden />
    </div>
  );

  /* ════════════════════════════════════════════════════════════
     Loading
     ════════════════════════════════════════════════════════════ */
  if (userId == null || isLoading) {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-background">
        {TopBar}
        <div className="mx-auto w-full max-w-md flex-1 space-y-4 px-4 py-6">
          <Skeleton className="h-7 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  /* ════════════════════════════════════════════════════════════
     Done — questionnaire already submitted (read-only)
     ──────────────────────────────────────────────────────────
     Checked BEFORE the error branch on purpose: after a successful
     submit, `submittedLocally` is true ; if the follow-up refetch then
     fails (network blip), the user must still see the done-state, not
     the "impossible de charger" error screen for work that succeeded.
     ════════════════════════════════════════════════════════════ */
  if (isDone) {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-background">
        {TopBar}
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-4 py-10 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <Check className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-lg font-bold tracking-tight text-foreground">
            {isCoachMode ? "Questionnaire enregistré" : "Questionnaire déjà rempli"}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {isCoachMode
              ? `Le questionnaire de ${targetName ?? "ce nageur"} est enregistré. Enchaîne sur la notation du bilan physique.`
              : "Ton auto-évaluation a bien été enregistrée. Ton coach réalisera le bilan physique lors de la prochaine séance."}
          </p>
          {isCoachMode ? (
            <div className="mt-5 flex flex-col gap-2">
              <Button
                className="rounded-xl"
                onClick={() =>
                  navigate(`/coach/strength-assessment/${effectiveAthleteId}`)
                }
              >
                Noter le bilan physique
              </Button>
              <Button
                variant="outline"
                className="rounded-xl"
                onClick={() =>
                  navigate(`/coach/kpi-wizard/${effectiveAthleteId}`)
                }
              >
                Mesurer les KPIs
              </Button>
            </div>
          ) : (
            <Button className="mt-5 rounded-xl" onClick={closeScreen}>
              Retour à la muscu
            </Button>
          )}
        </div>
      </div>
    );
  }

  /* ════════════════════════════════════════════════════════════
     Error
     ════════════════════════════════════════════════════════════ */
  if (isError) {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-background">
        {TopBar}
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-4 py-10 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10">
            <CircleSlash2 className="h-7 w-7 text-destructive" />
          </div>
          <h1 className="text-lg font-bold tracking-tight text-foreground">
            Impossible de charger le bilan
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Une erreur réseau est survenue. Réessaie dans un instant.
          </p>
          <Button
            variant="outline"
            className="mt-5 rounded-xl"
            onClick={() =>
              queryClient.invalidateQueries({
                queryKey: ["strength-assessment", userId],
              })
            }
          >
            Réessayer
          </Button>
        </div>
      </div>
    );
  }

  /* ════════════════════════════════════════════════════════════
     Empty — no assessment ; the coach must initiate one first
     ════════════════════════════════════════════════════════════ */
  if (assessment == null) {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-background">
        {TopBar}
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-4 py-10 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
            <ClipboardList className="h-7 w-7 text-muted-foreground" />
          </div>
          <h1 className="text-lg font-bold tracking-tight text-foreground">
            Aucun bilan en attente
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Ton coach doit d'abord initier un bilan muscu. Tu pourras alors
            remplir ce questionnaire avant l'évaluation physique.
          </p>
          <Button
            variant="outline"
            className="mt-5 rounded-xl"
            onClick={closeScreen}
          >
            Retour à la muscu
          </Button>
        </div>
      </div>
    );
  }

  /* ════════════════════════════════════════════════════════════
     Editable questionnaire form  (status === 'questionnaire_pending')
     ════════════════════════════════════════════════════════════ */
  // Defensive: an unknown status falls through to a calm message rather
  // than a half-rendered form.
  if (!isEditable) {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-background">
        {TopBar}
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-4 py-10 text-center">
          <p className="text-sm text-muted-foreground">
            Ce bilan n'est pas au stade du questionnaire.
          </p>
          <Button
            variant="outline"
            className="mt-5 rounded-xl"
            onClick={closeScreen}
          >
            Retour
          </Button>
        </div>
      </div>
    );
  }

  const painCount = Object.keys(painZones).length;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      {TopBar}

      <div className="mx-auto w-full max-w-md flex-1 space-y-4 px-4 py-5 pb-32">
        {isCoachMode && (
          <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5 text-sm">
            <Users className="h-4 w-4 shrink-0 text-primary" />
            <span className="text-muted-foreground">
              Bilan rempli avec&nbsp;
              <span className="font-semibold text-foreground">
                {targetName ?? "ce nageur"}
              </span>
            </span>
          </div>
        )}
        {/* Intro */}
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            Avant ton bilan muscu
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Quelques questions sur ton ressenti. Sois honnête — ça aide ton
            coach à adapter ton programme. Ça prend 2 minutes.
          </p>
        </div>

        {/* ── Section 1 — Douleurs ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Bandage className="h-4 w-4 text-primary" />
              Douleurs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-center text-[11px] text-muted-foreground">
              Touche les zones douloureuses (1x = légère, 2x = modérée, 3x =
              forte). Laisse vide si tu n'as aucune douleur.
            </p>
            <BodyHeatMap
              selectedZones={painZones}
              onChange={setPainZones}
              mode="edit"
            />
            {painCount === 0 && (
              <p className="mt-3 text-center text-xs font-medium text-muted-foreground">
                Aucune zone signalée
              </p>
            )}
          </CardContent>
        </Card>

        {/* ── Section 2 — Historique de blessures ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <HeartPulse className="h-4 w-4 text-primary" />
              Historique de blessures
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-2 text-xs text-muted-foreground">
              Blessures passées, opérations, zones fragiles à connaître
              (optionnel).
            </p>
            <Textarea
              value={injuryHistory}
              onChange={(e) => setInjuryHistory(e.target.value)}
              placeholder="Ex : entorse cheville droite en 2024, épaule sensible après les séries de papillon…"
              rows={4}
              maxLength={1000}
              className="resize-none text-sm"
            />
          </CardContent>
        </Card>

        {/* ── Section 3 — Ressenti de mobilité ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4 text-primary" />
              Ressenti de mobilité
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScaleField
              label="À quel point te sens-tu souple et mobile ?"
              value={mobilityFeel}
              onChange={setMobilityFeel}
              labelLow="Très raide"
              labelHigh="Très souple"
            />
          </CardContent>
        </Card>

        {/* ── Section 4 — Psychologie ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Smile className="h-4 w-4 text-primary" />
              Psychologie
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <ScaleField
              label="Confiance en toi"
              value={confidence}
              onChange={setConfidence}
              labelLow="Faible"
              labelHigh="Solide"
            />
            <ScaleField
              label="Motivation"
              value={motivation}
              onChange={setMotivation}
              labelLow="En berne"
              labelHigh="À fond"
            />
            <ScaleField
              label="Gestion du stress"
              value={stress}
              onChange={setStress}
              labelLow="Débordé(e)"
              labelHigh="Très serein(e)"
            />
          </CardContent>
        </Card>
      </div>

      {/* Sticky submit bar */}
      <div className="sticky bottom-0 z-20 border-t bg-background/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mx-auto w-full max-w-md space-y-2">
          <Button
            className="h-14 w-full rounded-2xl text-base font-bold"
            disabled={!allRated || submitMutation.isPending}
            onClick={() => submitMutation.mutate()}
          >
            <Send className="mr-1.5 h-5 w-5" />
            {submitMutation.isPending
              ? "Envoi…"
              : "Envoyer le questionnaire"}
          </Button>
          {!allRated && (
            <p className="text-center text-[11px] text-muted-foreground">
              Renseigne la mobilité et les 3 échelles de psychologie pour
              envoyer.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
