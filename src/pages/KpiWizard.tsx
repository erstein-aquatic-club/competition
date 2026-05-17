/**
 * KpiWizard — guided, repeatable assistant to record the 5 strength-test KPIs.
 *
 * Feature "Bilan Muscu → Mésocycle", Chantier B, Phase 6 (§285).
 *
 * Flow
 * ────
 *  1. (coach/admin only) athlete-selection step — pick who is being measured.
 *  2. one step per KPI, in KPI_PROTOCOLS order. Each step shows the full
 *     two-person protocol (steps, partner role, measurement, demo) and the
 *     attempt inputs. A step can be skipped — partial bilans are allowed.
 *  3. recap — every recorded KPI, diffed against the previous measurement.
 *
 * The athlete-mode (swimmer) skips step 1: the athlete is the current user.
 *
 * Focus mode : sets `document.body.dataset.focusMode = "strength"` so the
 * bottom navigation dock is hidden while the wizard is open (AppLayout
 * observes `data-focus-mode`).
 */
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  getAthletes,
  recordKpiMeasurement,
  getLatestKpiMeasurements,
  type RecordKpiInput,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { KPI_PROTOCOLS } from "@/lib/strength/kpiProtocols";
import { bestAttempt } from "@/lib/strength/kpiMeasurement";
import type { StrengthKpiKey, StrengthKpiMeasurement, AthleteSummary } from "@/lib/api/types";

import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, ArrowRight, Check, ClipboardCheck, Users, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import { KpiStepCard, type KpiAttemptsState, parseAttempts } from "@/components/strength/kpi/KpiStepCard";
import { KpiRecap, type KpiRecapEntry } from "@/components/strength/kpi/KpiRecap";
import { KpiSwimmerPicker } from "@/components/strength/kpi/KpiSwimmerPicker";

const PROTOCOLS = Object.values(KPI_PROTOCOLS);
const KPI_KEYS = PROTOCOLS.map((p) => p.key);

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";

/** Per-KPI attempt state, keyed by KPI key. */
type AttemptsByKpi = Record<StrengthKpiKey, KpiAttemptsState>;

const emptyAttempts = (): AttemptsByKpi =>
  Object.fromEntries(
    PROTOCOLS.map((p) => [p.key, { raw: Array(p.attempts).fill("") }]),
  ) as AttemptsByKpi;

type Phase = "select-athlete" | "steps" | "recap";

export default function KpiWizard() {
  const [, navigate] = useLocation();
  const userId = useAuth((s) => s.userId);
  const userName = useAuth((s) => s.user);
  const role = useAuth((s) => s.role);
  const isCoach = role === "coach" || role === "admin";

  // ── Focus mode : hide the bottom dock while the wizard is open ──
  useEffect(() => {
    document.body.dataset.focusMode = "strength";
    return () => {
      if (document.body.dataset.focusMode === "strength") {
        delete document.body.dataset.focusMode;
      }
    };
  }, []);

  // ── Athletes (coach-only — for the selection step) ──
  const { data: athletes = [], isLoading: athletesLoading } = useQuery({
    queryKey: ["athletes"],
    queryFn: () => getAthletes(),
    enabled: isCoach,
    staleTime: 5 * 60_000,
  });

  // ── Wizard state ──
  const [phase, setPhase] = useState<Phase>(isCoach ? "select-athlete" : "steps");
  const [stepIndex, setStepIndex] = useState(0);
  const [selectedAthleteId, setSelectedAthleteId] = useState<number | null>(
    isCoach ? null : userId,
  );
  const [attempts, setAttempts] = useState<AttemptsByKpi>(emptyAttempts);
  const [assistedBy, setAssistedBy] = useState<number | null>(null);
  const [athletePickerOpen, setAthletePickerOpen] = useState(false);
  const [partnerPickerOpen, setPartnerPickerOpen] = useState(false);
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false);
  const [recapEntries, setRecapEntries] = useState<KpiRecapEntry[]>([]);

  // The athlete being measured.
  const athleteId = isCoach ? selectedAthleteId : userId;
  const selectedAthlete = useMemo<AthleteSummary | null>(() => {
    if (!isCoach) {
      return userId != null
        ? { id: userId, display_name: userName ?? "Moi", avatar_url: null }
        : null;
    }
    return athletes.find((a) => a.id === selectedAthleteId) ?? null;
  }, [isCoach, userId, userName, athletes, selectedAthleteId]);

  const athleteName = selectedAthlete?.display_name ?? "ce nageur";

  // ── Previous measurements — fetched up-front so the recap can diff ──
  const { data: latestMeasurements } = useQuery({
    queryKey: ["kpi-latest", athleteId],
    queryFn: () => getLatestKpiMeasurements(athleteId!),
    enabled: athleteId != null,
  });

  // Swimmers available as a measurement partner (everyone with an id).
  const partnerCandidates = useMemo(
    () => athletes.filter((a) => a.id != null),
    [athletes],
  );
  const partner = useMemo(
    () => partnerCandidates.find((a) => a.id === assistedBy) ?? null,
    [partnerCandidates, assistedBy],
  );

  // ── Per-step helpers ──
  const currentProtocol = PROTOCOLS[stepIndex];
  const currentKey = currentProtocol?.key;
  const totalSteps = PROTOCOLS.length;

  const updateAttempt = (kpi: StrengthKpiKey, idx: number, value: string) => {
    // Accept digits, one decimal separator — keep input forgiving but clean.
    const cleaned = value.replace(/[^\d.,]/g, "");
    setAttempts((prev) => {
      const next = [...prev[kpi].raw];
      next[idx] = cleaned;
      return { ...prev, [kpi]: { raw: next } };
    });
  };

  // KPIs that have at least one valid attempt → will be submitted.
  const filledKeys = useMemo(
    () => KPI_KEYS.filter((k) => parseAttempts(attempts[k].raw).length > 0),
    [attempts],
  );
  const currentFilled = currentKey ? filledKeys.includes(currentKey) : false;

  // ── Submission ──
  const submitMutation = useMutation({
    mutationFn: async () => {
      if (athleteId == null || userId == null) {
        throw new Error("Identité non résolue");
      }
      const source: RecordKpiInput["source"] = isCoach
        ? "wizard_coach"
        : "wizard_athlete";
      const results: StrengthKpiMeasurement[] = [];
      for (const key of filledKeys) {
        const protocol = KPI_PROTOCOLS[key];
        const parsed = parseAttempts(attempts[key].raw);
        const recorded = await recordKpiMeasurement({
          athlete_id: athleteId,
          kpi_key: key,
          value: bestAttempt(parsed),
          unit: protocol.unit,
          attempts: parsed,
          measured_by: userId,
          assisted_by: assistedBy,
          source,
        });
        results.push(recorded);
      }
      return results;
    },
    onSuccess: (results) => {
      const entries: KpiRecapEntry[] = results.map((r) => ({
        kpi_key: r.kpi_key,
        value: r.value,
        unit: r.unit,
        previous: latestMeasurements?.[r.kpi_key] ?? null,
      }));
      setRecapEntries(entries);
      setPhase("recap");
      toast.success(
        `${results.length} mesure${results.length > 1 ? "s" : ""} enregistrée${
          results.length > 1 ? "s" : ""
        }`,
      );
    },
    onError: (err: Error) => {
      toast.error("Échec de l'enregistrement", {
        description: err.message || "Réessaie dans un instant.",
      });
    },
  });

  const restart = () => {
    setAttempts(emptyAttempts());
    setAssistedBy(null);
    setRecapEntries([]);
    setStepIndex(0);
    setPhase(isCoach ? "select-athlete" : "steps");
  };

  const closeWizard = () => {
    navigate("/strength");
  };

  const hasAnyInput =
    filledKeys.length > 0 ||
    KPI_KEYS.some((k) => attempts[k].raw.some((v) => v.trim() !== ""));

  const handleExitRequest = () => {
    if (phase === "steps" && hasAnyInput) {
      setExitConfirmOpen(true);
    } else {
      closeWizard();
    }
  };

  /* ════════════════════════════════════════════════════════════
     Shared shell
     ════════════════════════════════════════════════════════════ */
  const TopBar = (
    <div className="sticky top-0 z-20 flex items-center gap-3 border-b bg-background/95 px-4 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] backdrop-blur">
      <button
        type="button"
        onClick={handleExitRequest}
        className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Quitter
      </button>
      <div className="flex flex-1 items-center justify-center gap-1.5">
        <ClipboardCheck className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold tracking-tight">Bilan KPIs</span>
      </div>
      <span className="w-[58px]" aria-hidden />
    </div>
  );

  /* ════════════════════════════════════════════════════════════
     Phase 1 — athlete selection (coach / admin only)
     ════════════════════════════════════════════════════════════ */
  if (phase === "select-athlete") {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-background">
        {TopBar}
        <div className="mx-auto w-full max-w-md flex-1 px-4 py-6">
          <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
            <Users className="h-6 w-6 text-primary" />
          </div>
          <h1 className="mt-3 text-xl font-bold tracking-tight text-foreground">
            Pour quel nageur ?
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sélectionne le nageur dont tu vas mesurer les KPIs de force. Le bilan
            se fait à deux : un nageur teste, un binôme mesure.
          </p>

          <Card
            className={cn(
              "mt-5 flex items-center gap-3 p-3.5",
              !selectedAthlete && "border-dashed",
            )}
          >
            {selectedAthlete ? (
              <>
                <Avatar className="h-11 w-11">
                  {selectedAthlete.avatar_url && (
                    <AvatarImage
                      src={selectedAthlete.avatar_url}
                      alt={selectedAthlete.display_name}
                    />
                  )}
                  <AvatarFallback className="bg-muted text-xs font-semibold">
                    {initials(selectedAthlete.display_name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {selectedAthlete.display_name}
                  </p>
                  <p className="text-[11px] text-muted-foreground">Nageur sélectionné</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 rounded-full"
                  onClick={() => setAthletePickerOpen(true)}
                >
                  Changer
                </Button>
              </>
            ) : (
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
            )}
          </Card>

          {athletesLoading && (
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Chargement des nageurs…
            </p>
          )}
        </div>

        <div className="sticky bottom-0 border-t bg-background/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
          <Button
            className="h-14 w-full rounded-2xl text-base font-bold"
            disabled={selectedAthleteId == null}
            onClick={() => setPhase("steps")}
          >
            Commencer le bilan
            <ArrowRight className="ml-1.5 h-5 w-5" />
          </Button>
        </div>

        <KpiSwimmerPicker
          open={athletePickerOpen}
          onOpenChange={setAthletePickerOpen}
          swimmers={athletes}
          selectedId={selectedAthleteId}
          onSelect={setSelectedAthleteId}
          title="Choisir un nageur"
          description="Le nageur dont tu mesures les KPIs."
        />
      </div>
    );
  }

  /* ════════════════════════════════════════════════════════════
     Phase 3 — recap
     ════════════════════════════════════════════════════════════ */
  if (phase === "recap") {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-background">
        {TopBar}
        <div className="mx-auto w-full max-w-md flex-1 px-4 py-6">
          <KpiRecap
            entries={recapEntries}
            athleteName={athleteName}
            isAthleteSource={!isCoach}
            onRestart={restart}
            onClose={closeWizard}
          />
        </div>
      </div>
    );
  }

  /* ════════════════════════════════════════════════════════════
     Phase 2 — KPI steps
     ════════════════════════════════════════════════════════════ */
  const isLastStep = stepIndex === totalSteps - 1;

  const goNext = () => {
    if (isLastStep) return;
    setStepIndex((i) => Math.min(totalSteps - 1, i + 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const goPrev = () => {
    if (stepIndex === 0) return;
    setStepIndex((i) => Math.max(0, i - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      {TopBar}

      {/* Progress: step dots */}
      <div className="border-b bg-background/95 px-4 py-3">
        <div className="mx-auto flex w-full max-w-md items-center gap-3">
          <span className="shrink-0 text-xs font-bold tabular-nums text-muted-foreground">
            {stepIndex + 1}/{totalSteps}
          </span>
          <div className="flex flex-1 gap-1.5">
            {PROTOCOLS.map((p, i) => {
              const done = filledKeys.includes(p.key);
              const active = i === stepIndex;
              return (
                <span
                  key={p.key}
                  className={cn(
                    "h-1.5 flex-1 rounded-full transition-colors",
                    active
                      ? "bg-primary"
                      : done
                        ? "bg-primary/40"
                        : "bg-muted",
                  )}
                  aria-hidden
                />
              );
            })}
          </div>
          <span className="shrink-0 text-xs font-medium text-muted-foreground">
            {filledKeys.length} saisi{filledKeys.length > 1 ? "s" : ""}
          </span>
        </div>
      </div>

      <div className="mx-auto w-full max-w-md flex-1 px-4 py-5 pb-40">
        {/* Athlete + partner context strip */}
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
            <p className="text-[11px] text-muted-foreground">
              {isCoach ? "Mesuré par le coach" : "Auto-bilan"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setPartnerPickerOpen(true)}
            className={cn(
              "shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors active:scale-[0.97]",
              partner
                ? "border-primary/30 bg-primary/5 text-primary"
                : "border-border bg-card text-muted-foreground hover:bg-muted/50",
            )}
          >
            <UserPlus className="h-3.5 w-3.5" />
            {partner ? partner.display_name : "Accompagné par"}
          </button>
        </div>

        {currentProtocol && (
          <KpiStepCard
            protocol={currentProtocol}
            attempts={attempts[currentProtocol.key]}
            onChangeAttempt={(idx, value) =>
              updateAttempt(currentProtocol.key, idx, value)
            }
          />
        )}
      </div>

      {/* Sticky bottom action bar */}
      <div className="sticky bottom-0 z-20 border-t bg-background/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mx-auto w-full max-w-md space-y-2">
          <div className="flex gap-2.5">
            <Button
              variant="outline"
              className="h-14 flex-1 rounded-2xl font-semibold"
              disabled={stepIndex === 0}
              onClick={goPrev}
            >
              <ArrowLeft className="mr-1 h-4 w-4" />
              Précédent
            </Button>
            {isLastStep ? (
              <Button
                className="h-14 flex-[1.4] rounded-2xl text-base font-bold"
                disabled={filledKeys.length === 0 || submitMutation.isPending}
                onClick={() => submitMutation.mutate()}
              >
                <Check className="mr-1.5 h-5 w-5" />
                {submitMutation.isPending
                  ? "Enregistrement…"
                  : `Enregistrer (${filledKeys.length})`}
              </Button>
            ) : (
              <Button
                className="h-14 flex-[1.4] rounded-2xl text-base font-bold"
                onClick={goNext}
              >
                {currentFilled ? "Suivant" : "Passer ce KPI"}
                <ArrowRight className="ml-1.5 h-5 w-5" />
              </Button>
            )}
          </div>
          {!isLastStep && (
            <p className="text-center text-[11px] text-muted-foreground">
              Un KPI peut être laissé vide — le bilan partiel est accepté.
            </p>
          )}
        </div>
      </div>

      {/* Partner picker */}
      <KpiSwimmerPicker
        open={partnerPickerOpen}
        onOpenChange={setPartnerPickerOpen}
        swimmers={partnerCandidates}
        selectedId={assistedBy}
        onSelect={setAssistedBy}
        title="Accompagné par"
        description="Le binôme qui réalise la mesure (optionnel)."
        allowNone
        noneLabel="Aucun binôme"
      />

      {/* Exit confirmation */}
      <AlertDialog open={exitConfirmOpen} onOpenChange={setExitConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Quitter le bilan ?</AlertDialogTitle>
            <AlertDialogDescription>
              Les mesures saisies ne seront pas enregistrées.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuer le bilan</AlertDialogCancel>
            <AlertDialogAction onClick={closeWizard}>
              <X className="mr-1 h-4 w-4" />
              Quitter
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
