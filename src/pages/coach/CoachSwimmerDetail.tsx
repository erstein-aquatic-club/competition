import { Suspense } from 'react';
import { useRoute } from 'wouter';
import { useAuth } from '@/lib/auth';
import { lazyWithRetry } from '@/lib/lazyWithRetry';
import { useMySwimmerIds } from '@/hooks/useMySwimmerIds';

const CoachSwimmerFullView  = lazyWithRetry(() => import('./CoachSwimmerFullView'));
const CoachSwimmerQuickView = lazyWithRetry(() => import('./CoachSwimmerQuickView'));

type Props = {
  athleteId?: number | null;
  athleteName?: string | null;
  onBack?: () => void;
};

export default function CoachSwimmerDetail(props: Props = {}) {
  const [, params] = useRoute('/coach/swimmer/:id');
  const { selectedAthleteId, role } = useAuth();
  const athleteId = props.athleteId ?? (params?.id ? Number(params.id) : selectedAthleteId);

  const { swimmerIds } = useMySwimmerIds();
  const hasAccess = swimmerIds === null || (athleteId != null && swimmerIds.has(athleteId));

  const Inner = role === 'coach' && !hasAccess
    ? CoachSwimmerQuickView
    : CoachSwimmerFullView;

  return (
    <Suspense fallback={<div className="p-8 text-sm text-muted-foreground">Chargement…</div>}>
      <Inner {...props} />
    </Suspense>
  );
}
