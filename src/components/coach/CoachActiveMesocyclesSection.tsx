/**
 * CoachActiveMesocyclesSection — bandeau visible sur le hub coach (`CoachHome`)
 * qui liste les nageurs ayant un mésocycle muscu **actif** dans le club.
 *
 * Pourquoi (§296, bug 3) : avant ce composant, le coach n'avait aucun point
 * d'entrée évident pour voir les mésocycles générés par ses nageurs. Le
 * `CoachMesocyclePanel` est wired dans la fiche nageur (onglet Planning)
 * mais reste invisible tant qu'on ne navigue pas vers ce nageur. Cette
 * section rend cette information visible AU TOP du hub coach, avec un tap
 * direct vers la fiche concernée (onglet Planning ouvert d'office via
 * sessionStorage deeplink).
 *
 * Comportement :
 *   • Section invisible si 0 mésocycle actif (zéro bruit pour le coach
 *     dont l'équipe n'utilise pas encore la feature).
 *   • Sinon : carte par nageur avec nom + event + durée + date génération,
 *     tap → /coach/swimmer/:id (onglet Planning ouvert automatiquement).
 */
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Activity, ChevronRight, Dumbbell } from 'lucide-react';
import { listActiveMesocyclesWithAthletes } from '@/lib/api';
import { Badge } from '@/components/ui/badge';

/** Key sessionStorage consommée par `CoachSwimmerFullView` au mount pour
 *  initialiser l'onglet directement sur "Planning". */
export const COACH_SWIMMER_INITIAL_TAB_KEY = 'eac_coach_swimmer_initial_tab';

const FR_DATE = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: 'short',
});

export default function CoachActiveMesocyclesSection() {
  const [, navigate] = useLocation();
  const { data: items = [], isLoading } = useQuery({
    queryKey: ['active-mesocycles-coach'],
    queryFn: () => listActiveMesocyclesWithAthletes(),
    staleTime: 60_000,
  });

  // Section invisible si pas de données ou pendant le loading initial
  if (isLoading || items.length === 0) return null;

  const handleTap = (athleteId: number) => {
    // Deeplink : le détail nageur ouvrira directement l'onglet "Planning"
    // (consommé une fois puis effacé par CoachSwimmerFullView).
    try {
      window.sessionStorage.setItem(COACH_SWIMMER_INITIAL_TAB_KEY, 'planning');
    } catch {
      // sessionStorage indispo (très rare) → fallback : onglet Résumé,
      // le coach cliquera Planning lui-même.
    }
    navigate(`/coach/swimmer/${athleteId}`);
  };

  return (
    <section className="space-y-2.5">
      <div className="flex items-center gap-2">
        <Dumbbell className="h-3.5 w-3.5 text-violet-500" />
        <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
          Mésocycles muscu actifs
        </h2>
        <Badge
          variant="outline"
          className="h-4 border-violet-300 bg-violet-50 px-1.5 text-[9px] font-bold uppercase tracking-wider text-violet-700 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300"
        >
          {items.length}
        </Badge>
      </div>

      <ul className="space-y-2">
        {items.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              onClick={() => handleTap(m.athlete_id)}
              className="flex w-full items-center gap-3 rounded-2xl border border-violet-200/80 bg-violet-50/30 px-3.5 py-3 text-left transition-colors hover:bg-violet-50/60 active:bg-violet-100/60 dark:border-violet-900/50 dark:bg-violet-950/20 dark:hover:bg-violet-950/40"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-900/40">
                <Activity className="h-4 w-4 text-violet-600 dark:text-violet-300" />
              </div>
              <div className="min-w-0 flex-1 leading-tight">
                <div className="flex items-baseline gap-2">
                  <p className="truncate text-sm font-bold">{m.athlete_name}</p>
                  <Badge
                    variant="outline"
                    className="h-4 border-emerald-300 bg-emerald-50 px-1 text-[9px] font-bold uppercase tracking-wider text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                  >
                    active
                  </Badge>
                </div>
                <p className="mt-0.5 truncate font-mono text-[10px] tabular-nums text-muted-foreground">
                  {m.event_group} ·{' '}
                  {m.kind === 'season' ? 'saison' : 'mini-prépa'} ·{' '}
                  {m.target_week_count} sem ·{' '}
                  {m.sessions_per_week}/sem · généré le{' '}
                  {FR_DATE.format(new Date(m.generated_at))}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
