import type { ChronoState } from "../../lib/chrono-types";
import type { ChronoAction } from "../../lib/chrono-reducer";
import { WAVE_COLORS, resolveWaveConfig } from "../../lib/chrono-types";
import { groupSwimmersByWave } from "../../lib/chrono-race-layout";
import { CHRONO_PRECISION } from "../../hooks/useChronoTimer";
import { SwimmerCard, WaveHeaderCell } from "./ChronoRace";
import { Button } from "../../components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../../components/ui/alert-dialog";
import { Info, Square } from "lucide-react";

interface ChronoRaceMobileProps {
  state: ChronoState;
  dispatch: React.Dispatch<ChronoAction>;
  now: number;
  getTimestamp: () => number;
}

// ── Mobile race view (§384) ─────────────────────────────────────────
// Phones can't fit the Lane × Wave matrix (horizontal scroll, cards ≥ 280px).
// Instead we render a single vertical column grouped by wave — the timing
// unit. Each wave section has a sticky header (GO button → recovery + status)
// so the launch / recovery countdown stays reachable while scrolling its
// swimmers. Full feature parity with the desktop card (splits / undo / stop /
// pace / distance / next rep) via the shared SwimmerCard + WaveHeaderCell.
//
// No orientation lock (portrait one-handed at poolside is the ergonomic case).

export default function ChronoRaceMobile({
  state,
  dispatch,
  now,
  getTimestamp,
}: ChronoRaceMobileProps) {
  const globalConfig = {
    seriesCount: state.seriesCount,
    totalDistanceM: state.totalDistanceM,
    splitDistanceM: state.splitDistanceM,
  };
  const groups = groupSwimmersByWave(state.swimmers);

  return (
    // Full-bleed : break out of the AppLayout max-w-6xl container.
    <div className="flex min-h-dvh flex-col bg-background w-screen relative left-[calc(50%-50vw)] -my-4">
      {/* ── Sticky top bar — precision + terminate ── */}
      <div className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-border bg-background/95 backdrop-blur-sm px-3 py-1.5">
        <div
          className="flex items-center gap-1 text-[10px] font-medium text-amber-700 dark:text-amber-300"
          title={CHRONO_PRECISION.tooltip}
        >
          <Info className="h-3 w-3 text-amber-600 dark:text-amber-400 shrink-0" />
          <span className="tabular-nums">{CHRONO_PRECISION.precision}</span>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="destructive"
              size="sm"
              className="h-9 gap-1.5 whitespace-nowrap font-bold px-3 shadow-sm"
            >
              <Square className="h-4 w-4 fill-current" />
              Terminer
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Terminer la série ?</AlertDialogTitle>
              <AlertDialogDescription>
                Tous les chronos seront arrêtés.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => dispatch({ type: "STOP_RACE", timestamp: getTimestamp() })}
              >
                Confirmer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* ── Wave sections ── */}
      <div className="flex-1 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {groups.length === 0 ? (
          <p className="text-center py-8 text-sm text-muted-foreground">
            Aucun nageur dans la série.
          </p>
        ) : (
          groups.map((group) => {
            const waveState = state.waves.find((w) => w.wave === group.wave);
            if (!waveState) return null;
            const wc = WAVE_COLORS[group.wave - 1] ?? WAVE_COLORS[0];
            const resolved = resolveWaveConfig({ ...globalConfig, waves: state.waves }, group.wave);
            return (
              <section key={group.wave} className="border-b border-border/60 last:border-b-0">
                {/* Sticky wave header : label + GO/recovery/status control */}
                <div className="sticky top-[45px] z-20 bg-background/95 backdrop-blur-sm px-3 pt-2 pb-2.5 border-b border-border/40">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold text-white ${wc.dot}`}
                    >
                      Vague {wc.label}
                    </span>
                    <span className="text-[11px] tabular-nums text-muted-foreground">
                      {group.swimmers.length} nageur{group.swimmers.length > 1 ? "s" : ""}
                    </span>
                  </div>
                  <WaveHeaderCell
                    wave={waveState}
                    now={now}
                    dispatch={dispatch}
                    getTimestamp={getTimestamp}
                    resolvedConfig={resolved}
                  />
                </div>

                {/* Swimmer cards — one per lane, full width */}
                <div className="flex flex-col gap-2 px-3 py-2.5">
                  {group.swimmers.map((s) => {
                    const race = state.raceData.get(s.key);
                    return (
                      <SwimmerCard
                        key={s.key}
                        swimmerKey={s.key}
                        displayName={s.displayName}
                        avatarUrl={s.avatarUrl}
                        wave={s.wave}
                        waveStartedAt={waveState.startedAt}
                        currentSplits={
                          race ? race.splitsByRep[race.splitsByRep.length - 1] : []
                        }
                        swimmerStoppedAt={race?.stoppedAt ?? null}
                        splitDistanceM={resolved.splitDistanceM}
                        totalDistanceM={resolved.totalDistanceM}
                        now={now}
                        dispatch={dispatch}
                        getTimestamp={getTimestamp}
                        laneLabel={s.lane}
                      />
                    );
                  })}
                </div>
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}
