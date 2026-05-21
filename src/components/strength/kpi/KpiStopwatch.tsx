/**
 * KpiStopwatch — chrono temps de vol intégré pour le KPI détente verticale.
 *
 * State machine 3 états dérivés de `value` + état interne `running` :
 *   • IDLE     (value === null, !running) → bouton « Démarrer essai N+1 »
 *   • RUNNING  (!value, running)          → readout live + bouton ⏹ Arrêter
 *   • STOPPED  (value !== null)           → valeur figée + ↺ Refaire
 *
 * Mesure via `performance.now()` (précision sub-ms), readout live à ~60 fps
 * via `requestAnimationFrame`. Format de sortie : `'0.52'` (string 2 décimales)
 * — exactement le même format que les inputs texte de l'ancien composant,
 * compat directe avec `parseAttempts` + `verticalJumpResult`.
 *
 * Haptique : `navigator.vibrate(50)` au start, `[0, 50, 50, 50]` au stop
 * (no-op si API indisponible).
 *
 * Design : recipe « précision instrument » — chaque état a une couleur dominante
 * (primary idle, rose running, emerald stopped), readout monospace en hero
 * typographique. Cf. §295.
 */
import { useEffect, useRef, useState } from 'react';
import { Play, Square, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Formate un temps en secondes (`number`) → string à 2 décimales, clampé à 0. */
export function formatStopwatchSeconds(s: number): string {
  return Math.max(0, s).toFixed(2);
}

export interface KpiStopwatchProps {
  /** Index 0-based de l'essai (utilisé pour l'aria-label « essai N+1 »). */
  index: number;
  /** Valeur figée (`'0.52'`) si l'essai a déjà été mesuré, `null` si idle. */
  value: string | null;
  /** Callback déclenché au Stop avec le temps formaté (`'0.52'`). */
  onStop: (seconds: string) => void;
  /** Callback déclenché au clic « ↺ Refaire » — le slot doit être reset. */
  onReset: () => void;
}

export function KpiStopwatch({
  index,
  value,
  onStop,
  onReset,
}: KpiStopwatchProps) {
  const [running, setRunning] = useState(false);
  const [liveSeconds, setLiveSeconds] = useState(0);
  const tStartRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  // Cleanup rAF à l'unmount
  useEffect(
    () => () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  const tick = () => {
    if (tStartRef.current == null) return;
    setLiveSeconds((performance.now() - tStartRef.current) / 1000);
    rafRef.current = requestAnimationFrame(tick);
  };

  const start = () => {
    tStartRef.current = performance.now();
    setLiveSeconds(0);
    setRunning(true);
    rafRef.current = requestAnimationFrame(tick);
    navigator.vibrate?.(50);
  };

  const stop = () => {
    if (tStartRef.current == null) return;
    const elapsed = (performance.now() - tStartRef.current) / 1000;
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    setRunning(false);
    tStartRef.current = null;
    onStop(formatStopwatchSeconds(elapsed));
    navigator.vibrate?.([0, 50, 50, 50]);
  };

  // ── STOPPED ────────────────────────────────────────────────────────────
  if (value != null && !running) {
    return (
      <div
        className={cn(
          'relative flex min-h-[88px] items-center justify-between gap-3',
          'rounded-3xl border border-emerald-500/30 bg-emerald-50 px-5 py-4',
          'dark:border-emerald-400/30 dark:bg-emerald-950/40',
        )}
      >
        <span
          className={cn(
            'absolute -top-2 left-5 rounded-full bg-emerald-600 px-2.5 py-0.5',
            'text-[10px] font-bold uppercase tracking-[0.14em] text-white shadow-sm',
            'dark:bg-emerald-500',
          )}
        >
          Essai {index + 1}
        </span>
        <div className="flex items-baseline gap-1">
          <span
            aria-live="polite"
            className="font-mono text-4xl font-black leading-none tracking-tight tabular-nums text-emerald-700 dark:text-emerald-300"
          >
            {value}
          </span>
          <span className="text-lg font-semibold text-emerald-700/70 dark:text-emerald-300/70">
            s
          </span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onReset}
          className="shrink-0 gap-1.5 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-900/60 dark:hover:text-emerald-200"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Refaire
        </Button>
      </div>
    );
  }

  // ── RUNNING ────────────────────────────────────────────────────────────
  if (running) {
    return (
      <button
        type="button"
        onClick={stop}
        aria-label={`Arrêter le chronomètre — essai ${index + 1}`}
        className={cn(
          'group relative w-full overflow-hidden rounded-3xl border-2 border-rose-500',
          'bg-rose-500 px-4 py-7 min-h-32 ring-4 ring-rose-500/30',
          'transition-all duration-150 hover:bg-rose-600 active:scale-[0.98]',
          'focus-visible:outline-none focus-visible:ring-rose-500/50',
          'dark:bg-rose-600 dark:hover:bg-rose-500',
          'animate-[pulse_1.4s_ease-in-out_infinite]',
        )}
      >
        <div className="flex flex-col items-center justify-center gap-3">
          <div className="leading-none">
            <span
              aria-live="polite"
              className="font-mono text-6xl font-black tracking-tighter tabular-nums text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.25)]"
            >
              {formatStopwatchSeconds(liveSeconds)}
            </span>
            <span className="ml-1 text-2xl font-bold text-white/80">s</span>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-white backdrop-blur-sm ring-1 ring-inset ring-white/20">
            <Square className="h-3.5 w-3.5 fill-current" />
            Arrêter
          </span>
        </div>
      </button>
    );
  }

  // ── IDLE ───────────────────────────────────────────────────────────────
  return (
    <button
      type="button"
      onClick={start}
      aria-label={`Démarrer le chronomètre — essai ${index + 1}`}
      className={cn(
        'group relative w-full overflow-hidden rounded-3xl border-2 border-dashed border-primary/30',
        'bg-card px-4 py-7 min-h-32 transition-all duration-200',
        'hover:border-primary/60 hover:bg-primary/5',
        'active:scale-[0.98] active:bg-primary/10',
        'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/30',
      )}
    >
      <div className="flex flex-col items-center justify-center gap-3">
        <div className="leading-none">
          <span className="font-mono text-4xl font-black tracking-tight tabular-nums text-muted-foreground/40">
            0.00
          </span>
          <span className="ml-0.5 text-xl font-medium text-muted-foreground/40">
            s
          </span>
        </div>
        <span className="inline-flex items-center gap-2.5 rounded-full bg-primary px-5 py-2 text-sm font-bold uppercase tracking-[0.14em] text-primary-foreground shadow-sm transition-transform group-hover:scale-105">
          <Play className="h-4 w-4 fill-current" />
          Démarrer essai {index + 1}
        </span>
      </div>
    </button>
  );
}
