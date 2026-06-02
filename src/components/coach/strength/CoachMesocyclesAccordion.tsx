/**
 * CoachMesocyclesAccordion — liste accordéon des mésocycles muscu actifs du
 * club (Task 6, refonte écran "Planif Muscu").
 *
 * Cet accordéon DÉPLIE le panel coach en place (au lieu de naviguer vers la
 * fiche nageur). Un seul item ouvert à la fois (single-open) pour éviter de
 * monter N panels lourds simultanément — le `CoachMesocyclePanel` n'est monté
 * que quand son item est ouvert (lazy mount, évite N requêtes au montage).
 *
 * Carte violette, icône Activity, méta mono ligne "event · saison/mini-prépa
 * · N sem · N/sem · généré le dd mois" (l'ancienne section du hub coach a été
 * retirée au profit de cet écran — §364).
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, ChevronDown, Dumbbell } from 'lucide-react';

import { listActiveMesocyclesWithAthletes } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import CoachMesocyclePanel from '@/components/coach/CoachMesocyclePanel';

const FR_DATE = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: 'short',
});

export default function CoachMesocyclesAccordion() {
  const { data: items = [], isLoading } = useQuery({
    queryKey: ['active-mesocycles-coach'],
    queryFn: () => listActiveMesocyclesWithAthletes(),
    staleTime: 60_000,
  });

  // single-open : id de l'item ouvert (string, clé par m.id) ou null.
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <section className="space-y-2.5">
      <div className="flex items-center gap-2">
        <Dumbbell className="h-3.5 w-3.5 text-violet-500" />
        <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
          Mésocycles actifs
        </h2>
        {items.length > 0 && (
          <Badge
            variant="outline"
            className="h-4 border-violet-300 bg-violet-50 px-1.5 text-[9px] font-bold uppercase tracking-wider text-violet-700 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300"
          >
            {items.length}
          </Badge>
        )}
      </div>

      {isLoading ? (
        <ul className="space-y-2">
          {[1, 2].map((i) => (
            <li
              key={i}
              className="rounded-2xl border border-violet-200/80 bg-violet-50/30 px-3.5 py-3 dark:border-violet-900/50 dark:bg-violet-950/20"
            >
              <div className="flex items-center gap-3 animate-pulse motion-reduce:animate-none">
                <div className="h-9 w-9 shrink-0 rounded-xl bg-violet-100 dark:bg-violet-900/40" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="h-3.5 w-32 rounded bg-violet-100 dark:bg-violet-900/40" />
                  <div className="h-2.5 w-48 rounded bg-violet-100/70 dark:bg-violet-900/30" />
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-3.5 py-5 text-center">
          <Activity className="mx-auto mb-2 h-5 w-5 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">
            Aucun mésocycle actif
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((m) => {
            const itemId = String(m.id);
            const isOpen = openId === itemId;
            return (
              <li
                key={m.id}
                className="overflow-hidden rounded-2xl border border-violet-200/80 bg-violet-50/30 dark:border-violet-900/50 dark:bg-violet-950/20"
              >
                <button
                  type="button"
                  onClick={() => setOpenId((cur) => (cur === itemId ? null : itemId))}
                  aria-expanded={isOpen}
                  className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-violet-50/60 active:bg-violet-100/60 dark:hover:bg-violet-950/40"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-900/40">
                    <Activity className="h-4 w-4 text-violet-600 dark:text-violet-300" />
                  </div>
                  <div className="min-w-0 flex-1 leading-tight">
                    <div className="flex items-baseline gap-2">
                      <p className="truncate text-sm font-bold">
                        {m.athlete_name}
                      </p>
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
                      {m.target_week_count} sem · {m.sessions_per_week}/sem ·
                      généré le {FR_DATE.format(new Date(m.generated_at))}
                    </p>
                  </div>
                  <ChevronDown
                    className={cn(
                      'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200',
                      isOpen && 'rotate-180',
                    )}
                  />
                </button>

                {/* Lazy mount : le panel (et ses requêtes) n'est monté que
                    lorsque l'item est ouvert. */}
                {isOpen && (
                  <div className="border-t border-violet-200/70 px-2.5 pb-3 pt-3 dark:border-violet-900/50">
                    <CoachMesocyclePanel
                      athleteId={m.athlete_id}
                      athleteName={m.athlete_name}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
