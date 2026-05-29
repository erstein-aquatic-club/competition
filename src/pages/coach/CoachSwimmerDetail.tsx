import { Suspense } from 'react';
import { useRoute } from 'wouter';
import { useAuth } from '@/lib/auth';
import { lazyWithRetry } from '@/lib/lazyWithRetry';
import { useMySwimmerIds } from '@/hooks/useMySwimmerIds';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';

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

  // Boundary local récupérable : un throw dans la fiche nageur (ou son
  // sous-arbre : onglet Planning, panneau mésocycle, recap…) ne doit PAS
  // écran-blanchir tout le shell de l'app via le boundary global d'App.tsx.
  // `resetKeys={[athleteId]}` → naviguer vers un autre nageur récupère seul.
  return (
    <ErrorBoundary
      variant="inline"
      context="CoachSwimmerDetail"
      resetKeys={[athleteId]}
      title="Impossible d'afficher ce nageur"
      description="L'affichage de la fiche a rencontré un problème. Réessaie, ou reviens à la liste des nageurs."
    >
      <Suspense fallback={<div className="p-8 text-sm text-muted-foreground">Chargement…</div>}>
        <Inner {...props} />
      </Suspense>
    </ErrorBoundary>
  );
}
