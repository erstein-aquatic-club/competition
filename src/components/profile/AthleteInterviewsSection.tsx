import { useState, useRef, useCallback, useMemo } from "react";
import { useQuery, useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getMyInterviews,
  getAthleteObjectives,
  getProfile,
  getSwimmerPerformances,
  updateInterviewAthleteSections,
  submitInterviewToCoach,
  signInterview,
  getPreviousInterview,
  getCompetitions,
  getMyCompetitionIds,
  getTrainingCycles,
  getTrainingWeeks,
  notifications_mark_read_by_filter,
} from "@/lib/api";
import type { Interview, InterviewAthleteInput, Objective, SwimmerPerformance, TrainingWeek } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { ObjectiveCard } from "@/components/shared/ObjectiveCard";
import { weekTypeColor, weekTypeTextColor } from "@/lib/weekTypeColor";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { haptic } from "@/lib/haptic";
import {
  ArrowLeft,
  MessageSquare,
  Send,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  User,
  GraduationCap,
  Trophy,
} from "lucide-react";

type Props = {
  onBack?: () => void;
  embedded?: boolean;
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function fmtShort(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}

function getSunday(mondayIso: string): string {
  const d = new Date(mondayIso + "T00:00:00");
  d.setDate(d.getDate() + 6);
  return d.toISOString().split("T")[0];
}

function isCurrentWeek(mondayIso: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monday = new Date(mondayIso + "T00:00:00");
  const sunday = new Date(mondayIso + "T00:00:00");
  sunday.setDate(sunday.getDate() + 6);
  return today >= monday && today <= sunday;
}

function getMondays(startDate: string, endDate: string): string[] {
  const mondays: string[] = [];
  const start = new Date(startDate + "T00:00:00");
  const end = new Date(endDate + "T00:00:00");
  const current = new Date(start);
  const day = current.getDay();
  const diffToMonday = day === 0 ? 1 : day === 1 ? 0 : 8 - day;
  current.setDate(current.getDate() + diffToMonday);
  while (current <= end) {
    mondays.push(current.toISOString().split("T")[0]);
    current.setDate(current.getDate() + 7);
  }
  return mondays;
}

function daysBetween(dateA: string, dateB: string): number {
  const a = new Date(dateA + "T00:00:00");
  const b = new Date(dateB + "T00:00:00");
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

export default function AthleteInterviewsSection({
  onBack,
  embedded = false,
}: Props) {
  const queryClient = useQueryClient();
  const [submitConfirmId, setSubmitConfirmId] = useState<string | null>(null);
  const [signConfirmId, setSignConfirmId] = useState<string | null>(null);

  // Resolve athlete's own app_user_id from auth
  const { data: authUser } = useQuery({
    queryKey: ["auth-user"],
    queryFn: async () => {
      const { data } = await (await import("@/lib/supabase")).supabase.auth.getUser();
      return data.user;
    },
  });
  const appUserId = (authUser?.app_metadata as any)?.app_user_id as number | undefined;

  const { data: interviews = [], isLoading } = useQuery({
    queryKey: ["my-interviews"],
    queryFn: () => getMyInterviews(),
  });

  const { data: objectives = [] } = useQuery({
    queryKey: ["athlete-objectives"],
    queryFn: () => getAthleteObjectives(),
  });

  // Fetch profile for IUF + performances (360 days)
  const { data: profile } = useQuery({
    queryKey: ["my-profile-iuf"],
    queryFn: () => getProfile({ userId: appUserId }),
    enabled: !!appUserId,
  });
  const iuf = profile?.ffn_iuf ?? null;

  const perfFromDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 360);
    return d.toISOString().slice(0, 10);
  }, []);

  const { data: performances = [] } = useQuery({
    queryKey: ["swimmer-performances-recent", iuf],
    queryFn: () => getSwimmerPerformances({ iuf: iuf!, fromDate: perfFromDate }),
    enabled: !!iuf,
  });

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ["my-interviews"] }),
    [queryClient],
  );

  const saveMut = useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: InterviewAthleteInput;
    }) => updateInterviewAthleteSections(id, input),
    onSuccess: () => {
      toast("Sauvegardé");
      invalidate();
    },
    onError: (e: Error) =>
      toast.error("Erreur", { description: e.message }),
  });

  // §235 — entretien soumis OU signé par l'athlète : on marque lues les notifs
  // `interview` ouvertes (« à compléter » / « à relire »). Non-bloquant.
  const markInterviewNotifsRead = useCallback(async () => {
    if (!appUserId) return;
    try {
      await notifications_mark_read_by_filter({ userId: appUserId, type: "interview" });
    } catch (err) {
      console.warn("[EAC] Failed to mark interview notifications as read:", err);
    }
  }, [appUserId]);

  const submitMut = useMutation({
    mutationFn: async (id: string) => {
      await submitInterviewToCoach(id);
      await markInterviewNotifsRead();
    },
    onSuccess: () => {
      haptic.success();
      toast("Envoyé au coach");
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["profile-notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notifications-home"] });
    },
    onError: (e: Error) =>
      toast.error("Erreur", { description: e.message }),
  });

  const signMut = useMutation({
    mutationFn: async (id: string) => {
      await signInterview(id);
      await markInterviewNotifsRead();
    },
    onSuccess: () => {
      haptic.success();
      toast("Entretien signé");
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["profile-notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notifications-home"] });
    },
    onError: (e: Error) =>
      toast.error("Erreur", { description: e.message }),
  });

  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      {!embedded && (
        <div className="space-y-1">
          <Button variant="ghost" size="sm" className="-ml-2" onClick={onBack}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Retour
          </Button>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">
            Mes entretiens
          </h2>
          <p className="text-sm text-muted-foreground">
            Entretiens individuels avec le coach
          </p>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-xl border p-4 animate-pulse motion-reduce:animate-none"
            >
              <div className="h-4 w-40 rounded bg-muted" />
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && interviews.length === 0 && (
        <div className="text-center py-12 space-y-3">
          <MessageSquare className="h-10 w-10 text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">
            Aucun entretien en cours. Votre coach initiera les entretiens.
          </p>
        </div>
      )}

      {/* Interview cards */}
      {!isLoading &&
        interviews.map((interview) => (
          <InterviewCard
            key={interview.id}
            interview={interview}
            objectives={objectives}
            performances={performances}
            appUserId={appUserId ?? null}
            onSave={(id, input) => saveMut.mutate({ id, input })}
            onSubmit={(id) => setSubmitConfirmId(id)}
            onSign={(id) => setSignConfirmId(id)}
            isSaving={saveMut.isPending}
            isSubmitting={submitMut.isPending}
            isSigning={signMut.isPending}
          />
        ))}

      <AlertDialog open={submitConfirmId !== null} onOpenChange={(open) => { if (!open) setSubmitConfirmId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Envoyer votre préparation au coach ?</AlertDialogTitle>
            <AlertDialogDescription>
              Vous ne pourrez plus modifier cet entretien une fois envoyé.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (submitConfirmId) submitMut.mutate(submitConfirmId);
              setSubmitConfirmId(null);
            }}>
              Envoyer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={signConfirmId !== null} onOpenChange={(open) => { if (!open) setSignConfirmId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Signer cet entretien ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est définitive et engage votre responsabilité.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (signConfirmId) signMut.mutate(signConfirmId);
              setSignConfirmId(null);
            }}>
              Signer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Interview Card ──

function InterviewCard({
  interview,
  objectives,
  performances,
  appUserId,
  onSave,
  onSubmit,
  onSign,
  isSaving,
  isSubmitting,
  isSigning,
}: {
  interview: Interview;
  objectives: Objective[];
  performances: SwimmerPerformance[];
  appUserId: number | null;
  onSave: (id: string, input: InterviewAthleteInput) => void;
  onSubmit: (id: string) => void;
  onSign: (id: string) => void;
  isSaving: boolean;
  isSubmitting: boolean;
  isSigning: boolean;
}) {
  const isDraft = interview.status === "draft_athlete";
  const isDraftCoach = interview.status === "draft_coach";
  const isSent = interview.status === "sent";
  const isSigned = interview.status === "signed";

  // Signed cards collapsed by default, others expanded
  const [expanded, setExpanded] = useState(false);

  // Local form state for draft editing
  const [successes, setSuccesses] = useState(
    interview.athlete_successes ?? "",
  );
  const [difficulties, setDifficulties] = useState(
    interview.athlete_difficulties ?? "",
  );
  const [goals, setGoals] = useState(interview.athlete_goals ?? "");
  const [commitments, setCommitments] = useState(
    interview.athlete_commitments ?? "",
  );
  const [commitmentReview, setCommitmentReview] = useState(
    interview.athlete_commitment_review ?? "",
  );

  // Previous interview for commitment follow-up
  const { data: prevInterview } = useQuery({
    queryKey: ["my-previous-interview", interview.date, interview.id],
    queryFn: () => {
      if (!appUserId) return null;
      return getPreviousInterview(appUserId, interview.date, interview.id);
    },
    enabled: (isDraft || isSent || isSigned || isDraftCoach) && !!appUserId,
  });

  // Track which interview we're saving to avoid cross-card conflicts
  const savingRef = useRef(false);

  const handleBlur = useCallback(() => {
    if (savingRef.current || !isDraft) return;
    savingRef.current = true;
    onSave(interview.id, {
      athlete_successes: successes || null,
      athlete_difficulties: difficulties || null,
      athlete_goals: goals || null,
      athlete_commitments: commitments || null,
      athlete_commitment_review: commitmentReview || null,
    });
    setTimeout(() => {
      savingRef.current = false;
    }, 500);
  }, [interview.id, successes, difficulties, goals, commitments, commitmentReview, onSave, isDraft]);

  // Status badge
  const statusBadge = isDraft ? (
    <Badge className="bg-status-warning-bg text-status-warning border-status-warning/30">
      <Clock className="h-3 w-3 mr-1" />
      À préparer
    </Badge>
  ) : isDraftCoach ? (
    <Badge className="bg-intensity-prog-bg text-intensity-prog border-intensity-prog/30">
      <Clock className="h-3 w-3 mr-1" />
      En préparation
    </Badge>
  ) : isSent ? (
    <Badge className="bg-status-success-bg text-status-success border-status-success/30">
      <CheckCircle2 className="h-3 w-3 mr-1" />
      À signer
    </Badge>
  ) : (
    <Badge variant="secondary">Signé</Badge>
  );

  // Card border highlight for actionable items
  const borderClass = isDraft
    ? "border-status-warning/40 border-l-4"
    : isDraftCoach
      ? "border-intensity-prog/40 border-l-4"
      : isSent
        ? "border-status-success/40 border-l-4"
        : "";

  return (
    <div className={`rounded-xl border bg-card shadow-sm ${borderClass}`}>
      {/* Card header — always visible, toggles expand */}
      <button
        type="button"
        className="w-full flex items-center justify-between p-4 text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm font-semibold">
            {formatDate(interview.date)}
          </span>
          {statusBadge}
          {isSigned && interview.signed_at && (
            <span className="text-xs text-muted-foreground">
              le {formatDate(interview.signed_at.slice(0, 10))}
            </span>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-4 space-y-4">
          {/* ── Draft athlete: editable textareas ── */}
          {isDraft && (
            <>
              {/* Commitment review from previous interview */}
              {prevInterview && (prevInterview.athlete_commitments || prevInterview.coach_actions) && (
                <div className="rounded-xl border bg-muted/30 p-3 space-y-2">
                  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    Bilan des engagements précédents
                  </p>
                  {prevInterview.athlete_commitments && (
                    // audit §238 catégoriel pur — couleur identité nageur (bleu), pas de token status-* adapté
                    <div className="border-l-4 border-blue-400 rounded-r-lg bg-blue-50/50 dark:bg-blue-950/20 p-2 space-y-0.5">
                      <p className="text-[10px] font-semibold text-muted-foreground">Mes engagements</p>
                      <p className="text-xs whitespace-pre-wrap">{prevInterview.athlete_commitments}</p>
                    </div>
                  )}
                  {prevInterview.coach_actions && (
                    // audit §238 catégoriel pur — couleur identité coach (amber), pas de token status-* adapté
                    <div className="border-l-4 border-amber-400 rounded-r-lg bg-amber-50/50 dark:bg-amber-950/20 p-2 space-y-0.5">
                      <p className="text-[10px] font-semibold text-muted-foreground">Actions du coach</p>
                      <p className="text-xs whitespace-pre-wrap">{prevInterview.coach_actions}</p>
                    </div>
                  )}
                  <div className="space-y-1 pt-1">
                    <Label htmlFor={`commitment-review-${interview.id}`} className="text-xs">
                      Comment avez-vous tenu vos engagements ?
                    </Label>
                    <Textarea
                      id={`commitment-review-${interview.id}`}
                      placeholder="Mon bilan sur les engagements pris..."
                      value={commitmentReview}
                      onChange={(e) => setCommitmentReview(e.target.value)}
                      onBlur={handleBlur}
                      rows={3}
                      maxLength={5000}
                    />
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor={`successes-${interview.id}`}>
                  Mes réussites
                </Label>
                <Textarea
                  id={`successes-${interview.id}`}
                  placeholder="Ce dont je suis fier/fière cette saison..."
                  value={successes}
                  onChange={(e) => setSuccesses(e.target.value)}
                  onBlur={handleBlur}
                  rows={3}
                  maxLength={5000}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`difficulties-${interview.id}`}>
                  Mes difficultés
                </Label>
                <Textarea
                  id={`difficulties-${interview.id}`}
                  placeholder="Les points que je souhaite améliorer..."
                  value={difficulties}
                  onChange={(e) => setDifficulties(e.target.value)}
                  onBlur={handleBlur}
                  rows={3}
                  maxLength={5000}
                />
              </div>
              <div className="space-y-2">
                <Label>Mes objectifs</Label>
                {objectives.length > 0 && (
                  <div className="space-y-1.5">
                    {objectives.map((obj) => (
                      <ObjectiveCard key={obj.id} objective={obj} performances={performances} compact />
                    ))}
                  </div>
                )}
                <Textarea
                  id={`goals-${interview.id}`}
                  placeholder="Objectifs supplémentaires ou commentaires..."
                  value={goals}
                  onChange={(e) => setGoals(e.target.value)}
                  onBlur={handleBlur}
                  rows={3}
                  maxLength={5000}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`commitments-${interview.id}`}>
                  Mes engagements
                </Label>
                <Textarea
                  id={`commitments-${interview.id}`}
                  placeholder="Ce que je m'engage à faire..."
                  value={commitments}
                  onChange={(e) => setCommitments(e.target.value)}
                  onBlur={handleBlur}
                  rows={3}
                  maxLength={5000}
                />
              </div>
              {isSaving && (
                <p className="text-xs text-muted-foreground animate-pulse">
                  Sauvegarde...
                </p>
              )}
              <Button
                className="w-full gap-2"
                onClick={() => onSubmit(interview.id)}
                disabled={isSubmitting}
              >
                <Send className="h-4 w-4" />
                {isSubmitting ? "Envoi..." : "Envoyer au coach"}
              </Button>
            </>
          )}

          {/* ── Draft coach: waiting state + previous commitments + planning ── */}
          {isDraftCoach && (
            <>
              <div className="rounded-xl border border-dashed border-intensity-prog/40 bg-intensity-prog-bg/50 p-6 text-center space-y-2">
                <Clock className="h-8 w-8 mx-auto text-intensity-prog" />
                <p className="text-sm font-medium">Entretien envoyé au coach</p>
                <p className="text-xs text-muted-foreground">
                  Votre coach prépare l'entretien. Vous recevrez le compte-rendu complet après l'entretien en présentiel.
                </p>
                {interview.submitted_at && (
                  <p className="text-xs text-muted-foreground">
                    Envoyé le {formatDate(interview.submitted_at.slice(0, 10))}
                  </p>
                )}
              </div>

              {/* Collapsible previous commitments */}
              {prevInterview && (prevInterview.athlete_commitments || prevInterview.coach_actions) && (
                <CollapsiblePreviousCommitments
                  prevInterview={prevInterview}
                  commitmentReview={interview.athlete_commitment_review}
                />
              )}

              {/* Read-only planning */}
              {appUserId && (
                <>
                  <SectionLabel label="Planification" />
                  <ReadOnlyPlanning athleteId={appUserId} interviewDate={interview.date} />
                </>
              )}
            </>
          )}

          {/* ── Sent / Signed: conversational read-only layout ── */}
          {(isSent || isSigned) && (
            <>
              {/* Previous commitments summary — collapsed by default */}
              {prevInterview && (prevInterview.athlete_commitments || prevInterview.coach_actions) && (
                <CollapsiblePreviousCommitments
                  prevInterview={prevInterview}
                  commitmentReview={interview.athlete_commitment_review}
                />
              )}

              {/* Conversational sections */}
              <ConversationalSection
                label="Réussites"
                athleteText={interview.athlete_successes}
                coachText={interview.coach_comment_successes || interview.coach_review}
              />
              <ConversationalSection
                label="Difficultés"
                athleteText={interview.athlete_difficulties}
                coachText={interview.coach_comment_difficulties}
              />
              <div className="space-y-2">
                <SectionLabel label="Objectifs" />
                {objectives.length > 0 && (
                  <div className="space-y-1.5">
                    {objectives.map((obj) => (
                      <ObjectiveCard key={obj.id} objective={obj} performances={performances} compact />
                    ))}
                  </div>
                )}
                <AthleteBlock text={interview.athlete_goals} />
                <CoachBlock text={interview.coach_comment_goals || interview.coach_objectives} />
              </div>

              {/* Read-only planning */}
              {appUserId && (
                <>
                  <SectionLabel label="Planification" />
                  <ReadOnlyPlanning athleteId={appUserId} interviewDate={interview.date} />
                </>
              )}

              {/* Engagements & Actions */}
              <div className="rounded-xl bg-card border shadow-sm p-3 space-y-2">
                <SectionLabel label="Engagements & Actions" />
                <AthleteBlock text={interview.athlete_commitments} label="Mes engagements" />
                <CoachBlock text={interview.coach_actions} label="Actions du coach" />
              </div>

              {/* Sign button for sent interviews */}
              {isSent && (
                <Button
                  className="w-full gap-2"
                  onClick={() => onSign(interview.id)}
                  disabled={isSigning}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {isSigning ? "Signature..." : "Signer l'entretien"}
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Collapsible previous commitments (collapsed by default) ──

function CollapsiblePreviousCommitments({
  prevInterview,
  commitmentReview,
}: {
  prevInterview: Interview;
  commitmentReview?: string | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="w-full flex items-center gap-2 rounded-xl border bg-muted/30 px-3 py-2.5 text-left transition-colors hover:bg-muted/50"
        >
          <ChevronRight
            className={`h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
          />
          <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Rappel engagements précédents
          </span>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-auto">
            {formatDate(prevInterview.date)}
          </Badge>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="rounded-b-xl border border-t-0 bg-muted/30 px-3 pb-3 space-y-2">
          {prevInterview.athlete_commitments && (
            // audit §238 catégoriel pur — couleur identité nageur (bleu), pas de token status-* adapté
            <div className="border-l-4 border-blue-400 rounded-r-lg bg-blue-50/50 dark:bg-blue-950/20 p-2">
              <p className="text-[10px] font-semibold text-muted-foreground">Mes engagements</p>
              <p className="text-xs whitespace-pre-wrap">{prevInterview.athlete_commitments}</p>
            </div>
          )}
          {prevInterview.coach_actions && (
            // audit §238 catégoriel pur — couleur identité coach (amber), pas de token status-* adapté
            <div className="border-l-4 border-amber-400 rounded-r-lg bg-amber-50/50 dark:bg-amber-950/20 p-2">
              <p className="text-[10px] font-semibold text-muted-foreground">Actions du coach</p>
              <p className="text-xs whitespace-pre-wrap">{prevInterview.coach_actions}</p>
            </div>
          )}
          {commitmentReview && (
            // audit §238 catégoriel pur — couleur identité nageur (bilan), pas de token status-* adapté
            <div className="border-l-4 border-blue-400 rounded-r-lg bg-blue-50/80 dark:bg-blue-950/30 p-2">
              <p className="text-[10px] font-semibold text-muted-foreground">Mon bilan</p>
              <p className="text-xs whitespace-pre-wrap">{commitmentReview}</p>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ── Read-only planning (athlete view) ──

function ReadOnlyPlanning({
  athleteId,
  interviewDate,
}: {
  athleteId: number;
  interviewDate: string;
}) {
  const { data: competitions = [] } = useQuery({
    queryKey: ["competitions"],
    queryFn: () => getCompetitions(),
  });

  const { data: assignedIds = [] } = useQuery({
    queryKey: ["my-competition-ids", athleteId],
    queryFn: () => getMyCompetitionIds(athleteId),
  });

  const nextCompetition = useMemo(() => {
    const assignedSet = new Set(assignedIds);
    const upcoming = competitions
      .filter((c) => assignedSet.has(c.id) && c.date >= interviewDate)
      .sort((a, b) => a.date.localeCompare(b.date));
    return upcoming[0] ?? null;
  }, [competitions, assignedIds, interviewDate]);

  const { data: cycles = [] } = useQuery({
    queryKey: ["training-cycles", "athlete", athleteId],
    queryFn: () => getTrainingCycles({ athleteId }),
  });

  const upcomingCompetitions = useMemo(() => {
    const assignedSet = new Set(assignedIds);
    return competitions
      .filter((c) => assignedSet.has(c.id) && c.date >= interviewDate)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [competitions, assignedIds, interviewDate]);

  const cyclesByCompetitionId = useMemo(() => {
    const map = new Map<string, (typeof cycles)[number]>();
    cycles
      .slice()
      .sort((a, b) => (a.end_competition_date ?? "").localeCompare(b.end_competition_date ?? ""))
      .forEach((cycle) => {
        if (cycle.end_competition_id && !map.has(cycle.end_competition_id)) {
          map.set(cycle.end_competition_id, cycle);
        }
      });
    return map;
  }, [cycles]);

  const plannedCycles = useMemo(() => {
    const seen = new Set<string>();
    return upcomingCompetitions
      .map((competition) => cyclesByCompetitionId.get(competition.id) ?? null)
      .filter((cycle): cycle is NonNullable<typeof cycle> => {
        if (!cycle || seen.has(cycle.id)) return false;
        seen.add(cycle.id);
        return true;
      });
  }, [upcomingCompetitions, cyclesByCompetitionId]);

  const weekQueries = useQueries({
    queries: plannedCycles.map((cycle) => ({
      queryKey: ["training-weeks", cycle.id],
      queryFn: () => getTrainingWeeks(cycle.id),
      enabled: !!cycle.id,
    })),
  });

  const weeksByCycleId = useMemo(() => {
    const map = new Map<string, TrainingWeek[]>();
    plannedCycles.forEach((cycle, index) => {
      map.set(cycle.id, (weekQueries[index]?.data as TrainingWeek[] | undefined) ?? []);
    });
    return map;
  }, [plannedCycles, weekQueries]);

  const todayIso = useMemo(() => new Date().toISOString().split("T")[0], []);
  const daysToComp = nextCompetition ? daysBetween(todayIso, nextCompetition.date) : null;

  if (!nextCompetition) {
    return (
      <p className="text-xs text-muted-foreground italic text-center py-2">
        Aucune compétition assignée à venir.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border bg-muted/20 p-3">
        <div className="flex items-center gap-2 text-sm flex-wrap">
          {/* audit §238 catégoriel pur — icône décorative trophée, pas de token status-* adapté */}
          <Trophy className="h-4 w-4 text-amber-500 shrink-0" />
          <span className="font-medium">{upcomingCompetitions.length} échéance{upcomingCompetitions.length > 1 ? "s" : ""} visible{upcomingCompetitions.length > 1 ? "s" : ""}</span>
          <Badge variant="secondary" className="text-[10px]">
            prochaine J-{daysToComp}
          </Badge>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Vision multi-macrocycles depuis l&apos;entretien, jusqu&apos;aux prochaines compétitions assignées.
        </p>
      </div>

      <div className="space-y-3">
        {upcomingCompetitions.map((competition, compIndex) => {
          const cycle = cyclesByCompetitionId.get(competition.id) ?? null;
          const cycleStart = cycle?.start_date ?? cycle?.start_competition_date ?? interviewDate;
          const visibleStart = cycleStart > interviewDate ? cycleStart : interviewDate;
          const visibleMondays = cycle ? getMondays(visibleStart, competition.date) : [];
          const totalMondays = cycle ? getMondays(cycleStart, competition.date) : [];
          const hiddenWeeks = Math.max(totalMondays.length - visibleMondays.length, 0);
          const daysUntil = daysBetween(todayIso, competition.date);
          const cycleWeeks = cycle ? (weeksByCycleId.get(cycle.id) ?? []) : [];
          const weeksByStart = new Map(cycleWeeks.map((week) => [week.week_start, week]));

          return (
            <div key={competition.id} className="rounded-xl border bg-card shadow-sm overflow-hidden">
              <div className="border-b border-border bg-muted/20 px-3 py-2.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold">{competition.name}</span>
                  {compIndex === 0 && (
                    <Badge className="text-[10px] bg-primary/10 text-primary border-primary/20">
                      Prochaine
                    </Badge>
                  )}
                  <Badge variant="secondary" className="text-[10px]">
                    {formatDate(competition.date)}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    J-{daysUntil}
                  </Badge>
                </div>
                {cycle ? (
                  <div className="mt-1 flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{cycle.name}</span>
                    {cycle.start_competition_name && (
                      <span>depuis {cycle.start_competition_name}</span>
                    )}
                    <span>{totalMondays.length} sem.</span>
                    {hiddenWeeks > 0 && <span>{hiddenWeeks} déjà écoulée{hiddenWeeks > 1 ? "s" : ""}</span>}
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Aucun macrocycle créé pour cette échéance.
                  </p>
                )}
              </div>

              {!cycle ? (
                <div className="px-3 py-3 text-xs text-muted-foreground italic">
                  La compétition reste visible pour garder la projection long terme, même sans planification détaillée.
                </div>
              ) : visibleMondays.length === 0 ? (
                <div className="px-3 py-3 text-xs text-muted-foreground italic">
                  Aucune semaine future à afficher sur ce macrocycle.
                </div>
              ) : (
                <div className="px-3 py-3">
                  <div className="relative ml-2 border-l-2 border-border pl-3 space-y-1.5">
                    {visibleMondays.map((monday, idx) => {
                      const week = weeksByStart.get(monday);
                      const isCurrent = isCurrentWeek(monday);
                      const sunday = getSunday(monday);

                      return (
                        <div
                          key={monday}
                          className={`rounded-lg border bg-card px-2.5 py-2 text-xs ${isCurrent ? "ring-2 ring-primary bg-primary/5" : ""}`}
                        >
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`h-2 w-2 rounded-full shrink-0 ${
                                isCurrent ? "bg-primary" : week?.week_type ? "bg-muted-foreground/40" : "bg-muted-foreground/20"
                              }`}
                            />
                            <span className="text-muted-foreground whitespace-nowrap">
                              Sem. {hiddenWeeks + idx + 1}
                            </span>
                            <span className="text-muted-foreground/70 whitespace-nowrap">
                              {fmtShort(monday)} - {fmtShort(sunday)}
                            </span>
                            {week?.week_type && (
                              <Badge
                                className="text-[10px] px-1.5 py-0 border-0 ml-auto"
                                style={{
                                  backgroundColor: weekTypeColor(week.week_type),
                                  color: weekTypeTextColor(week.week_type),
                                }}
                              >
                                {week.week_type}
                              </Badge>
                            )}
                          </div>
                          {week?.notes && (
                            <p className="mt-1 pl-4 text-[11px] text-muted-foreground line-clamp-2">
                              {week.notes}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Conversational section (athlete + coach read-only) ──

function ConversationalSection({
  label,
  athleteText,
  coachText,
}: {
  label: string;
  athleteText?: string | null;
  coachText?: string | null;
}) {
  return (
    <div className="space-y-2">
      <SectionLabel label={label} />
      <AthleteBlock text={athleteText} />
      <CoachBlock text={coachText} />
    </div>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-px flex-1 bg-border" />
      <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

function AthleteBlock({ text, label }: { text?: string | null; label?: string }) {
  // audit §238 catégoriel pur — couleur identité nageur (bleu), pas de token status-* adapté
  return (
    <div className="border-l-4 border-blue-400 rounded-r-lg bg-blue-50/50 dark:bg-blue-950/20 p-2.5 space-y-0.5">
      <div className="flex items-center gap-1.5">
        <User className="h-3 w-3 text-blue-500" />
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          {label ?? "Nageur"}
        </p>
      </div>
      <p className="text-sm whitespace-pre-wrap">
        {text?.trim() || <span className="italic text-muted-foreground">Non renseigné</span>}
      </p>
    </div>
  );
}

function CoachBlock({ text, label }: { text?: string | null; label?: string }) {
  if (!text?.trim()) return null;
  // audit §238 catégoriel pur — couleur identité coach (amber), pas de token status-* adapté
  return (
    <div className="border-l-4 border-amber-400 rounded-r-lg bg-amber-50/50 dark:bg-amber-950/20 p-2.5 space-y-0.5">
      <div className="flex items-center gap-1.5">
        <GraduationCap className="h-3 w-3 text-amber-500" />
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          {label ?? "Coach"}
        </p>
      </div>
      <p className="text-sm whitespace-pre-wrap">{text}</p>
    </div>
  );
}

// ObjectiveRow replaced by shared ObjectiveCard from @/components/shared/ObjectiveCard
