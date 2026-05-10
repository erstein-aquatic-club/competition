import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, ShieldAlert, Activity, Target, Trophy, ClipboardList, CheckSquare, MessageSquare, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { getSwimmerBriefing, type SwimmerBriefing, type SwimmerBriefingPerf, type SwimmerBriefingObjective } from '@/lib/api/coach-quickview';
import QuickViewAttendanceDialog from './QuickViewAttendanceDialog';
import QuickViewCommentDialog from './QuickViewCommentDialog';
import QuickViewAssignDrawer from './QuickViewAssignDrawer';
import SwimmerFormBadge from '@/components/coach/swimmer-kpis/SwimmerFormBadge';
import LoadMini from '@/components/coach/swimmer-kpis/LoadMini';
import PainHistoryMap from '@/components/coach/PainHistoryMap';
import { ObjectiveCard, ObjectiveGrid } from '@/components/shared/ObjectiveCard';
import type { Objective } from '@/lib/api/types';

/* ── helpers ──────────────────────────────────────────────────────── */

function formatSeconds(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  const secStr = sec.toFixed(2).padStart(5, '0');
  return m > 0 ? `${m}:${secStr}` : `${secStr}s`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

/* ── PerfCard ─────────────────────────────────────────────────────── */

function PerfCard({ perf }: { perf: SwimmerBriefingPerf }) {
  return (
    <div className="shrink-0 w-28 rounded-xl border bg-muted/30 p-2.5">
      <p className="text-[10px] text-muted-foreground">{formatDate(perf.competition_date)}</p>
      <p className="text-xs font-semibold mt-0.5">{perf.event_code}</p>
      <p className="text-base font-bold mt-1">{formatSeconds(perf.time_seconds)}</p>
      {perf.competition_name && (
        <p className="text-[9px] text-muted-foreground mt-0.5 truncate">{perf.competition_name}</p>
      )}
    </div>
  );
}

/* ── SessionTodayBlock ────────────────────────────────────────────── */

function SessionTodayBlock({
  session,
  onAttendance,
  onComment,
  onAssign,
}: {
  session: SwimmerBriefing['today_session'];
  onAttendance: () => void;
  onComment: () => void;
  onAssign: () => void;
}) {
  if (!session) {
    return (
      <div className="mx-4 mb-3 rounded-2xl border bg-muted/20 p-4 text-center">
        <Calendar className="mx-auto h-8 w-8 text-muted-foreground/40 mb-2" />
        <p className="text-sm text-muted-foreground">Pas de séance planifiée aujourd'hui.</p>
      </div>
    );
  }

  if (!session.session_name) {
    return (
      <div className="mx-4 mb-3 rounded-2xl border-2 border-dashed border-primary/30 bg-primary/5 p-4 text-center">
        <ClipboardList className="mx-auto h-8 w-8 text-primary/40 mb-2" />
        <p className="text-sm font-medium text-primary/80 mb-3">Créneau prévu — aucune séance assignée</p>
        <Button size="sm" variant="outline" onClick={onAssign} className="border-primary/30 text-primary">
          Assigner une séance
        </Button>
      </div>
    );
  }

  const distKm = session.total_distance ? (session.total_distance / 1000).toFixed(1) : null;

  return (
    <div className="mx-4 mb-3 rounded-2xl border-2 border-primary/20 bg-primary/5 p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold text-primary">Séance d'aujourd'hui</p>
        </div>
        {session.time_slot && (
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-primary text-primary-foreground capitalize">
            {session.time_slot}
          </span>
        )}
      </div>
      <p className="text-sm font-semibold mb-1">
        {session.session_name}{distKm ? ` — ${distKm} km` : ''}
      </p>
      {session.session_description && (
        <p className="text-xs text-muted-foreground line-clamp-3">{session.session_description}</p>
      )}
    </div>
  );
}

/* ── QuickViewContent (exported for tests) ────────────────────────── */

export type QuickViewContentProps = {
  briefing: SwimmerBriefing;
  onBack: () => void;
  onAttendance: () => void;
  onComment: () => void;
  onAssign: () => void;
};

function toObjective(o: SwimmerBriefingObjective): Objective {
  return { id: o.id, athlete_id: '', competition_ids: [], event_code: o.event_code ?? null, target_time_seconds: o.target_time_seconds ?? null, text: o.text ?? null, pool_length: null };
}

export function QuickViewContent({ briefing, onBack, onAttendance, onComment, onAssign }: QuickViewContentProps) {
  const { profile, load_summary, objectives_short, recent_perfs, today_session } = briefing;
  const initial = profile.display_name.charAt(0).toUpperCase();
  const hasStickyFooter = !!today_session?.session_name;

  return (
    <div className="relative flex flex-col min-h-full">
      {/* ── Header ───────────────────────────────────── */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="h-9 w-9 rounded-xl border border-border bg-card flex items-center justify-center shrink-0"
            aria-label="Retour"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium text-muted-foreground">Nageurs ›</p>
            <h1 className="text-base font-bold truncate">{profile.display_name}</h1>
          </div>
        </div>
      </div>

      {/* ── Amber ribbon ─────────────────────────────── */}
      <div className="mx-4 mt-1 mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 flex items-center gap-2">
        <div className="h-7 w-7 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
          <ShieldAlert className="h-4 w-4 text-amber-700" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-amber-900">Mode coach secondaire</p>
          <p className="text-[11px] text-amber-800/80 leading-tight">Ce nageur n'est pas dans vos prises en charge.</p>
        </div>
      </div>

      {/* ── Identity card ────────────────────────────── */}
      <div className="mx-4 mb-3 rounded-2xl border bg-card p-4">
        <div className="flex items-center gap-3">
          <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center text-lg font-bold text-primary shrink-0">
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold truncate">{profile.display_name}</p>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              {profile.group_name && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                  {profile.group_name}
                </span>
              )}
              {(profile.age || profile.sex) && (
                <span className="text-[11px] text-muted-foreground">
                  {[profile.age ? `${profile.age} ans` : null, profile.sex ?? null].filter(Boolean).join(' • ')}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Forme 7j ─────────────────────────────────── */}
      <div className="mx-4 mb-3 rounded-2xl border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">Forme (7 derniers jours)</p>
        </div>
        <SwimmerFormBadge userId={profile.id} />
      </div>

      {/* ── Douleurs ─────────────────────────────────── */}
      <div className="mx-4 mb-3 rounded-2xl border bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Activity className="h-4 w-4 text-rose-500" />
          <p className="text-sm font-semibold">Douleurs (7 derniers jours)</p>
        </div>
        <PainHistoryMap userId={profile.id} days={7} />
      </div>

      {/* ── Charge récente ───────────────────────────── */}
      <div className="mx-4 mb-3 rounded-2xl border bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Activity className="h-4 w-4 text-blue-500" />
          <p className="text-sm font-semibold">Charge récente</p>
        </div>
        <LoadMini load={load_summary} />
      </div>

      {/* ── Objectifs ────────────────────────────────── */}
      {objectives_short.length > 0 && (
        <div className="mx-4 mb-3 rounded-2xl border bg-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Target className="h-4 w-4 text-amber-500" />
            <p className="text-sm font-semibold">Objectifs en cours</p>
          </div>
          <ObjectiveGrid>
            {objectives_short.map(o => (
              <ObjectiveCard
                key={o.id}
                objective={toObjective(o)}
                performances={recent_perfs.map(p => ({ event_code: p.event_code, pool_length: p.pool_length, time_seconds: p.time_seconds, competition_date: p.competition_date }))}
              />
            ))}
          </ObjectiveGrid>
        </div>
      )}

      {/* ── Perfs récentes ───────────────────────────── */}
      {recent_perfs.length > 0 && (
        <div className="mx-4 mb-3 rounded-2xl border bg-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Trophy className="h-4 w-4 text-yellow-500" />
            <p className="text-sm font-semibold">Perfs récentes</p>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {recent_perfs.map((p, i) => <PerfCard key={i} perf={p} />)}
          </div>
        </div>
      )}

      {/* ── Séance du jour ───────────────────────────── */}
      <SessionTodayBlock
        session={today_session}
        onAttendance={onAttendance}
        onComment={onComment}
        onAssign={onAssign}
      />

      {/* ── Spacer for sticky footer ──────────────────── */}
      {hasStickyFooter && <div className="h-28" />}

      {/* ── Sticky footer (session present only) ─────── */}
      {hasStickyFooter && (
        <div className="sticky bottom-0 px-4 pt-3 pb-5 bg-gradient-to-t from-background via-background/95 to-background/0 border-t border-border/50">
          <p className="text-[10px] text-muted-foreground text-center mb-2 leading-tight">
            Vos saisies seront visibles par le titulaire et attribuées à vous.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm" className="rounded-xl py-2.5 flex items-center gap-1.5" onClick={onAttendance}>
              <CheckSquare className="h-3.5 w-3.5" /> Présence
            </Button>
            <Button size="sm" className="rounded-xl py-2.5 flex items-center gap-1.5" onClick={onComment}>
              <MessageSquare className="h-3.5 w-3.5" /> Commenter
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Page wrapper ─────────────────────────────────────────────────── */

type Props = {
  athleteId?: number | null;
  athleteName?: string | null;
  onBack?: () => void;
};

export default function CoachSwimmerQuickView({ athleteId: athleteIdProp, onBack }: Props = {}) {
  const [, navigate] = useLocation();
  const { selectedAthleteId } = useAuth();
  const { toast } = useToast();
  const athleteId = athleteIdProp ?? selectedAthleteId;

  const [attendanceOpen, setAttendanceOpen] = useState(false);
  const [commentOpen, setCommentOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);

  const handleBack = onBack ?? (() => navigate('/coach?section=swimmers'));

  const { data: briefing, isLoading, error, refetch } = useQuery({
    queryKey: ['coach-quickview-briefing', athleteId],
    queryFn: () => getSwimmerBriefing(athleteId!),
    enabled: athleteId != null,
    staleTime: 2 * 60 * 1000,
  });

  if (!athleteId) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        <p>Aucun nageur sélectionné.</p>
        <button type="button" onClick={handleBack} className="mt-2 text-primary underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1">Retour</button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-4 space-y-3">
        <Skeleton className="h-10 w-3/4" />
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
      </div>
    );
  }

  if (error || !briefing) {
    toast({ title: 'Erreur', description: 'Impossible de charger les données du nageur.', variant: 'destructive' });
    return (
      <div className="p-4 text-center text-muted-foreground">
        <p>Erreur de chargement.</p>
        <button type="button" onClick={() => refetch()} className="mt-2 text-primary underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1">Réessayer</button>
      </div>
    );
  }

  return (
    <>
      <QuickViewContent
        briefing={briefing}
        onBack={handleBack}
        onAttendance={() => setAttendanceOpen(true)}
        onComment={() => setCommentOpen(true)}
        onAssign={() => setAssignOpen(true)}
      />
      {briefing.today_session && (
        <QuickViewAttendanceDialog
          open={attendanceOpen}
          onOpenChange={setAttendanceOpen}
          dimSessionId={briefing.today_session.assignment_id}
          athleteId={athleteId}
          onSuccess={() => {}}
        />
      )}
      {briefing.today_session && (
        <QuickViewCommentDialog
          open={commentOpen}
          onOpenChange={setCommentOpen}
          dimSessionId={briefing.today_session.assignment_id}
          athleteId={athleteId}
          onSuccess={() => {}}
        />
      )}
      {briefing.today_session && (
        <QuickViewAssignDrawer
          open={assignOpen}
          onOpenChange={setAssignOpen}
          slotId={briefing.today_session.assignment_id}
          athleteId={athleteId}
          timeSlot={briefing.today_session.time_slot}
          onSuccess={() => {}}
        />
      )}
    </>
  );
}
