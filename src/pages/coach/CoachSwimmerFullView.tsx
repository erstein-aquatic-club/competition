import { useState, useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import {
  getProfile,
  getSessions,
  getInterviews,
  getTrainingCycles,
  getObjectives,
  getCompetitions,
  getLatestAssessment,
  getLatestKpiMeasurements,
  getActiveMesocycle,
} from "@/lib/api";
import { nextBilanStep } from "@/lib/strength/bilanProgress";
import { supabase } from "@/lib/supabase";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Activity, ArrowLeft, ArrowRight, BarChart3, Bell, CalendarClock, CalendarRange, ChevronRight, Clock, Dumbbell, FileText, Heart, MessageSquare, Sparkles, Target, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import CoachBreadcrumb from "@/components/shared/CoachBreadcrumb";
import SwimmerFeedbackTab from "./SwimmerFeedbackTab";
import SwimmerObjectivesTab from "./SwimmerObjectivesTab";
import SwimmerPlanningPanel from "./SwimmerPlanningPanel";
import SwimmerInterviewsTab from "./SwimmerInterviewsTab";
import SwimmerSlotsTab from "@/components/coach/SwimmerSlotsTab";
import PlanningWizard from "@/components/coach/PlanningWizard";
import WellnessTrend from "@/components/coach/WellnessTrend";
import TrainingLoadChart from "@/components/coach/TrainingLoadChart";
import SwimVolumeCharts from "@/components/coach/SwimVolumeCharts";
import { useSwimAnalytics } from "@/hooks/useSwimAnalytics";
import AttendancePerformanceChart from "@/components/coach/AttendancePerformanceChart";
import PainHistoryMap from "@/components/coach/PainHistoryMap";
import CoachMesocyclePanel from "@/components/coach/CoachMesocyclePanel";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { useStrengthWrapped } from "@/hooks/useStrengthWrapped";
import { StrengthWrappedRecap } from "@/components/strength/wrapped/StrengthWrappedRecap";
/* ── Helpers ─────────────────────────────────────────────── */

function formatRelative(dateStr: string): string {
  const diff = Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / 86_400_000,
  );
  if (diff === 0) return "aujourd'hui";
  if (diff === 1) return "hier";
  if (diff < 0) return `dans ${-diff}j`;
  return `il y a ${diff}j`;
}

async function fetchAuthUid(userId: number): Promise<string | null> {
  const { data, error } = await supabase.rpc("get_auth_uid_for_user", {
    p_user_id: userId,
  });
  if (error) return null;
  return data as string | null;
}

type CoachSwimmerDetailProps = {
  athleteId?: number | null;
  athleteName?: string | null;
  onBack?: () => void;
};

type CoachSwimmerTab = "resume" | "planning" | "echanges" | "comms";

export default function CoachSwimmerFullView({
  athleteId: athleteIdProp,
  athleteName: athleteNameProp,
  onBack,
}: CoachSwimmerDetailProps = {}) {
  const [, params] = useRoute("/coach/swimmer/:id");
  const [, navigate] = useLocation();
  const { selectedAthleteId, selectedAthleteName } = useAuth();
  const queryClient = useQueryClient();
  // §296 — Deeplink depuis le hub coach (section « Mésocycles muscu actifs »)
  // qui pose un sessionStorage key pour ouvrir directement l'onglet Planning.
  // Consommé une seule fois au mount puis effacé.
  const [activeTab, setActiveTab] = useState<CoachSwimmerTab>(() => {
    if (typeof window === "undefined") return "resume";
    try {
      const initial = window.sessionStorage.getItem(
        "eac_coach_swimmer_initial_tab",
      );
      window.sessionStorage.removeItem("eac_coach_swimmer_initial_tab");
      if (
        initial === "planning" ||
        initial === "echanges" ||
        initial === "comms" ||
        initial === "resume"
      ) {
        return initial;
      }
    } catch {
      // sessionStorage indispo → fallback resume
    }
    return "resume";
  });
  const [swimWeeks, setSwimWeeks] = useState(8);

  const athleteId =
    athleteIdProp ?? (params?.id ? Number(params.id) : selectedAthleteId);
  const athleteName = athleteNameProp ?? selectedAthleteName;

  const { data: profile } = useQuery({
    queryKey: ["profile", athleteId],
    queryFn: () => getProfile({ userId: athleteId }),
    enabled: athleteId != null,
  });

  // ── KPI data for Resume tab ──────────────────────────────
  const staleTime = 5 * 60 * 1000;

  const { data: sessions } = useQuery({
    queryKey: ["sessions", athleteId],
    queryFn: () => getSessions(athleteName ?? "", athleteId),
    enabled: !!athleteId,
    staleTime,
  });

  const { data: interviews } = useQuery({
    queryKey: ["interviews", athleteId],
    queryFn: () => getInterviews(athleteId!),
    enabled: !!athleteId,
    staleTime,
  });

  const { data: cycles } = useQuery({
    queryKey: ["training-cycles", athleteId],
    queryFn: () => getTrainingCycles({ athleteId: athleteId! }),
    enabled: !!athleteId,
    staleTime,
  });

  const { data: athleteAuthId, error: authUidError } = useQuery({
    queryKey: ["auth-uid", athleteId],
    queryFn: () => fetchAuthUid(athleteId!),
    enabled: !!athleteId,
    staleTime,
  });

  const { data: objectives } = useQuery({
    queryKey: ["objectives", athleteAuthId],
    queryFn: () => getObjectives(athleteAuthId!),
    enabled: !!athleteAuthId,
    staleTime,
  });

  const { data: competitions } = useQuery({
    queryKey: ["competitions"],
    queryFn: () => getCompetitions(),
    staleTime,
  });

  // ── Bilan muscu — données pour le CTA "Démarrer / Reprendre" (§A) ──
  const { data: latestAssessment } = useQuery({
    queryKey: ["strength-assessment", athleteId],
    queryFn: () => getLatestAssessment(athleteId!),
    enabled: athleteId != null,
    staleTime,
  });
  const { data: bilanKpis } = useQuery({
    queryKey: ["kpi-latest", athleteId],
    queryFn: () => getLatestKpiMeasurements(athleteId!),
    enabled: athleteId != null,
    staleTime,
  });
  const { data: activeMesocycle } = useQuery({
    queryKey: ["active-mesocycle", athleteId],
    queryFn: () => getActiveMesocycle(athleteId!),
    enabled: athleteId != null,
    staleTime,
  });

  const swimAnalytics = useSwimAnalytics({
    userId: athleteId ?? undefined,
    weeks: swimWeeks,
  });

  // ── Derived KPIs ─────────────────────────────────────────
  const lastFeedbackDate = sessions?.[0]?.date ?? null;
  const avgEngagement = useMemo(() => {
    if (!sessions || sessions.length === 0) return null;
    const recent = sessions.slice(0, 7);
    const vals = recent
      .map((s) => s.engagement)
      .filter((v): v is number => v != null && Number.isFinite(v));
    if (vals.length === 0) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }, [sessions]);

  const interviewCount = interviews?.length ?? 0;
  const lastInterviewDate = interviews?.[0]?.date ?? null;

  const activeCycleName = useMemo(() => {
    if (!cycles || cycles.length === 0) return null;
    const today = new Date().toISOString().slice(0, 10);
    const active = cycles.find((c) => {
      const start = c.start_date ?? c.start_competition_date ?? "";
      const end = c.end_competition_date ?? "";
      return start <= today && end >= today;
    });
    return active?.name ?? cycles[0]?.name ?? null;
  }, [cycles]);

  const objectivesCount = objectives?.length ?? 0;

  // ── Bilan step derivation (§A) ──
  const bilanStatus = latestAssessment?.status ?? null;
  const bilanHasKpis = !!bilanKpis && Object.keys(bilanKpis).length > 0;
  const bilanHasActiveMeso = activeMesocycle != null;
  const bilanStep = nextBilanStep(bilanStatus, bilanHasKpis, bilanHasActiveMeso);
  const bilanNavTarget: string = (() => {
    switch (bilanStep) {
      case "start": return `/coach/strength-assessment/${athleteId}`;
      case "questionnaire": return `/coach/questionnaire/${athleteId}`;
      case "kpis": return `/coach/kpi-wizard/${athleteId}`;
      case "physical": return `/coach/strength-assessment/${athleteId}`;
      case "generate": return `/coach/mesocycle-generate/${athleteId}`;
      case "done": return `/coach/strength-assessment/${athleteId}`;
    }
  })();

  const displayName = profile?.display_name ?? athleteName ?? "Nageur";
  const avatarUrl = profile?.avatar_url ?? null;
  const groupLabel = profile?.group_label ?? null;
  const handleBack = onBack ?? (() => navigate("/coach?section=swimmers"));

  // §325 — DOIT rester AU-DESSUS du `return` anticipé `if (!athleteId)` : sinon
  // ce hook ne tourne pas quand athleteId est falsy, et la bascule null→défini
  // (navigation post-apply vers /coach/swimmer/:id) ajoute un hook → React #310.
  const breadcrumbSegments = useMemo(
    () => [
      { label: 'Nageurs', href: '#/coach?section=swimmers' },
      { label: displayName },
    ],
    [displayName],
  );

  // ── Récap muscu « Wrapped » (§ recap) ───────────────────────────────────────
  // Hooks appelés inconditionnellement, AVANT le early-return `if (!athleteId)`
  // (mémoire §316/§326 — sinon React #310). Le hook tolère athleteId null.
  // { active: false } → visibilité du bouton seulement : ÉVITE la requête history
  // (limit:200) pour CHAQUE nageur que le coach ouvre. L'overlay, monté à
  // l'ouverture, refait le hook en actif → fetch lourd une seule fois, à la demande.
  const wrapped = useStrengthWrapped(athleteId, { active: false });
  const [recapOpen, setRecapOpen] = useState(false);

  if (!athleteId) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        <p>Aucun nageur sélectionné.</p>
        <button type="button" onClick={handleBack} className="mt-2 text-primary underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1">
          Retour
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-4 space-y-4">
      <CoachBreadcrumb segments={breadcrumbSegments} />
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleBack}
          className="h-9 w-9 rounded-xl border border-border bg-card flex items-center justify-center hover:bg-muted transition"
          aria-label="Retour"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="h-10 w-10 rounded-full object-cover border border-border" />
        ) : (
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
            {displayName.charAt(0).toUpperCase()}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold truncate">{displayName}</h1>
          {groupLabel && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {groupLabel}
            </Badge>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as CoachSwimmerTab)}>
        <TabsList className="grid h-auto w-full grid-cols-4 gap-1.5 bg-transparent p-0">
          <TabsTrigger value="resume" className="rounded-xl border bg-card px-2 py-2 text-xs data-[state=active]:border-primary data-[state=active]:bg-primary/5">
            Résumé
          </TabsTrigger>
          <TabsTrigger value="planning" className="rounded-xl border bg-card px-2 py-2 text-xs data-[state=active]:border-primary data-[state=active]:bg-primary/5">
            Planning
          </TabsTrigger>
          <TabsTrigger value="echanges" className="rounded-xl border bg-card px-2 py-2 text-xs data-[state=active]:border-primary data-[state=active]:bg-primary/5">
            Échanges
          </TabsTrigger>
          <TabsTrigger value="comms" className="rounded-xl border bg-card px-2 py-2 text-xs data-[state=active]:border-primary data-[state=active]:bg-primary/5">
            Comms
          </TabsTrigger>
        </TabsList>

        <TabsContent value="resume" className="mt-4 space-y-3">
          <div className="rounded-2xl border bg-card p-4">
            <p className="text-sm font-semibold">Vue rapide</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Accès direct au suivi, aux entretiens et à la planification de {displayName}.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {/* Suivi tile */}
              <button
                type="button"
                onClick={() => setActiveTab("echanges")}
                className="rounded-xl border px-3 py-3 text-left active:bg-muted"
              >
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-blue-500" />
                  <span className="text-sm font-medium">Suivi</span>
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground truncate">
                  {sessions === undefined
                    ? "..."
                    : lastFeedbackDate
                      ? `Dernier : ${formatRelative(lastFeedbackDate)}`
                      : "Aucun ressenti"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {sessions === undefined
                    ? ""
                    : avgEngagement != null
                      ? `Engagement moy. : ${avgEngagement.toFixed(1)}/5`
                      : "—"}
                </p>
              </button>

              {/* Echanges tile */}
              <button
                type="button"
                onClick={() => setActiveTab("echanges")}
                className="rounded-xl border px-3 py-3 text-left active:bg-muted"
              >
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-violet-500" />
                  <span className="text-sm font-medium">Échanges</span>
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground truncate">
                  {interviews === undefined
                    ? "..."
                    : interviewCount > 0
                      ? `${interviewCount} entretien${interviewCount > 1 ? "s" : ""}`
                      : "Aucun entretien"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {interviews === undefined
                    ? ""
                    : lastInterviewDate
                      ? `Dernier : ${formatRelative(lastInterviewDate)}`
                      : "—"}
                </p>
              </button>

              {/* Planif tile */}
              <button
                type="button"
                onClick={() => setActiveTab("planning")}
                className="rounded-xl border px-3 py-3 text-left active:bg-muted"
              >
                <div className="flex items-center gap-2">
                  <CalendarRange className="h-4 w-4 text-emerald-500" />
                  <span className="text-sm font-medium">Planif</span>
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground truncate">
                  {cycles === undefined
                    ? "..."
                    : activeCycleName
                      ? activeCycleName
                      : "Aucun cycle"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {cycles === undefined
                    ? ""
                    : cycles.length > 0
                      ? `${cycles.length} cycle${cycles.length > 1 ? "s" : ""}`
                      : "—"}
                </p>
              </button>

              {/* Objectifs tile */}
              <button
                type="button"
                onClick={() => setActiveTab("planning")}
                className="rounded-xl border px-3 py-3 text-left active:bg-muted"
              >
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-amber-500" />
                  <span className="text-sm font-medium">Objectifs</span>
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground truncate">
                  {objectives === undefined
                    ? "..."
                    : objectivesCount > 0
                      ? `${objectivesCount} objectif${objectivesCount > 1 ? "s" : ""}`
                      : "Aucun objectif"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {objectives === undefined ? "" : "—"}
                </p>
              </button>
            </div>
          </div>

          {/* Rapport mensuel */}
          <Button
            variant="outline"
            className="w-full gap-2 rounded-2xl"
            onClick={() => {
              const now = new Date();
              const m = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
              navigate(`/report/${athleteId}/${m}`);
            }}
          >
            <FileText className="h-4 w-4" />
            Rapport mensuel
          </Button>

          {/* Bien-être section */}
          <div className="rounded-2xl border bg-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <Heart className="h-4 w-4 text-rose-500" />
              <p className="text-sm font-semibold">Bien-être</p>
            </div>
            <WellnessTrend userId={athleteId} days={28} mode="full" />
          </div>

          {/* Douleurs section */}
          <div className="rounded-2xl border bg-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <Activity className="h-4 w-4 text-red-500" />
              <p className="text-sm font-semibold">Douleurs</p>
            </div>
            <PainHistoryMap userId={athleteId} days={28} />
          </div>

          {/* Charge d'entraînement section */}
          <div className="rounded-2xl border bg-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <Activity className="h-4 w-4 text-blue-500" />
              <p className="text-sm font-semibold">Charge d'entraînement</p>
            </div>
            <TrainingLoadChart userId={athleteId} />
          </div>

          {/* Analytics natation section */}
          <div className="rounded-2xl border bg-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="h-4 w-4 text-cyan-500" />
              <p className="text-sm font-semibold">Volume natation</p>
              {swimAnalytics.totalMeters > 0 && (
                <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                  {(swimAnalytics.totalMeters / 1000).toFixed(1)} km total
                </span>
              )}
            </div>
            {swimAnalytics.isLoading ? (
              <p className="text-xs text-muted-foreground text-center py-6">Chargement...</p>
            ) : swimAnalytics.weeklyVolumes.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">
                Aucune donnée de volume sur cette période.
              </p>
            ) : (
              <SwimVolumeCharts
                weeklyVolumes={swimAnalytics.weeklyVolumes}
                mode="full"
                selectedWeeks={swimWeeks}
                onWeeksChange={setSwimWeeks}
              />
            )}
          </div>

          {/* Corrélation présence / performance */}
          <div className="rounded-2xl border bg-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="h-4 w-4 text-violet-500" />
              <p className="text-sm font-semibold">Présence vs Performance</p>
            </div>
            <AttendancePerformanceChart
              groupId={profile?.group_id ?? undefined}
              highlightUserId={athleteId}
            />
          </div>
        </TabsContent>

        <TabsContent value="planning" className="mt-4 space-y-4">
          {!cycles?.length && !objectives?.length ? (
            <PlanningWizard
              athleteId={athleteId}
              athleteAuthId={athleteAuthId ?? null}
              athleteName={displayName}
              groupId={profile?.group_id ?? 0}
              competitions={competitions ?? []}
              onComplete={() => {
                queryClient.invalidateQueries({ queryKey: ["training-cycles", athleteId] });
                queryClient.invalidateQueries({ queryKey: ["objectives", athleteAuthId] });
              }}
            />
          ) : (
            <>
              <Collapsible defaultOpen>
                <CollapsibleTrigger asChild>
                  <button type="button" className="w-full flex items-center gap-2 group">
                    <Target className="h-4 w-4 text-amber-500" />
                    <h2 className="text-sm font-semibold">Objectifs</h2>
                    <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2">
                  <SwimmerObjectivesTab athleteId={athleteId} athleteName={displayName} authUidError={!!authUidError} />
                </CollapsibleContent>
              </Collapsible>

              <Collapsible defaultOpen>
                <CollapsibleTrigger asChild>
                  <button type="button" className="w-full flex items-center gap-2 group">
                    <CalendarClock className="h-4 w-4 text-blue-500" />
                    <h2 className="text-sm font-semibold">Créneaux</h2>
                    <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2">
                  <SwimmerSlotsTab
                    athleteId={athleteId}
                    athleteName={displayName}
                    groupId={profile?.group_id ?? 0}
                  />
                </CollapsibleContent>
              </Collapsible>

              <Collapsible defaultOpen>
                <CollapsibleTrigger asChild>
                  <button type="button" className="w-full flex items-center gap-2 group">
                    <CalendarRange className="h-4 w-4 text-emerald-500" />
                    <h2 className="text-sm font-semibold">Planification natation</h2>
                    <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2">
                  <SwimmerPlanningPanel athleteId={athleteId} />
                </CollapsibleContent>
              </Collapsible>

              {/* §293 — Mésocycle muscu : visibilité coach + action revert */}
              {athleteId != null && (
                <Collapsible defaultOpen>
                  <CollapsibleTrigger asChild>
                    <button type="button" className="w-full flex items-center gap-2 group">
                      <Dumbbell className="h-4 w-4 text-violet-500" />
                      <h2 className="text-sm font-semibold">Mésocycle muscu</h2>
                      <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2 space-y-3">
                    {/* Récap muscu « Wrapped » — bouton discret, visible si données suffisantes */}
                    {wrapped.enabled && (
                      <div className="flex justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1.5 text-muted-foreground"
                          onClick={() => setRecapOpen(true)}
                        >
                          <Sparkles className="h-4 w-4" /> Récap
                        </Button>
                      </div>
                    )}
                    {/* §A — resume-aware bilan CTA */}
                    <button
                      type="button"
                      onClick={() => navigate(bilanNavTarget)}
                      className="w-full flex items-center justify-between gap-2 rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 text-left text-sm font-medium text-violet-800 transition-colors hover:bg-violet-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                    >
                      <span>
                        {bilanStep === "start"
                          ? `Démarrer le bilan de ${displayName}`
                          : bilanStep === "questionnaire"
                          ? `Reprendre — Questionnaire`
                          : bilanStep === "kpis"
                          ? `Reprendre — KPIs`
                          : bilanStep === "physical"
                          ? `Reprendre — Bilan physique`
                          : bilanStep === "generate"
                          ? `Reprendre — Génération`
                          : `Voir le bilan de ${displayName}`}
                      </span>
                      <ArrowRight className="h-4 w-4 shrink-0" />
                    </button>
                    <ErrorBoundary
                      variant="inline"
                      context="CoachMesocyclePanel"
                      resetKeys={[athleteId]}
                      title="Mésocycle indisponible"
                      description="L'affichage du mésocycle a rencontré un problème. Le reste de la fiche reste utilisable."
                    >
                      <CoachMesocyclePanel
                        athleteId={athleteId}
                        athleteName={displayName}
                      />
                    </ErrorBoundary>
                    {recapOpen && athleteId != null && (
                      <StrengthWrappedRecap
                        athleteId={athleteId}
                        open
                        onClose={() => setRecapOpen(false)}
                        viewerContext="coach"
                        displayName={(profile?.display_name ?? '').split(' ')[0] || undefined}
                      />
                    )}
                  </CollapsibleContent>
                </Collapsible>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="echanges" className="mt-4 space-y-4">
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-violet-500" />
              <h2 className="text-sm font-semibold">Entretiens</h2>
            </div>
            <SwimmerInterviewsTab athleteId={athleteId} athleteName={displayName} />
          </section>

          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-500" />
              <h2 className="text-sm font-semibold">Ressentis séances</h2>
            </div>
            <SwimmerFeedbackTab athleteId={athleteId} athleteName={displayName} showProgressAction={false} />
          </section>
        </TabsContent>

        <TabsContent value="comms" className="mt-4 space-y-3">
          <div className="rounded-2xl border bg-card p-4 space-y-3">
            <p className="text-sm font-semibold">Contacter {displayName}</p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => {
                  navigate(`/coach?section=comms&tab=notifications&athleteId=${athleteId}`);
                }}
              >
                <Bell className="mr-1.5 h-3.5 w-3.5" />
                Notification
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => {
                  navigate(`/coach?section=comms&tab=sms&athleteId=${athleteId}`);
                }}
              >
                <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
                SMS
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Le nageur sera pré-sélectionné dans l'écran de communication.
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
