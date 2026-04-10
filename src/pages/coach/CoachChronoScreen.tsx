import { useReducer, useEffect, useState, useCallback } from "react";
import { chronoReducer, initialChronoState } from "../../lib/chrono-reducer";
import type { ChronoState } from "../../lib/chrono-types";
import { useChronoTimer } from "../../hooks/useChronoTimer";
import ChronoSetup from "../../components/chrono/ChronoSetup";
import ChronoRace from "../../components/chrono/ChronoRace";
import ChronoResults from "../../components/chrono/ChronoResults";
import { STORAGE_KEYS } from "../../lib/api/client";
import { Button } from "../../components/ui/button";
import { Timer } from "lucide-react";
import type { AthleteSummary } from "../../lib/api/types";

const BACKUP_KEY = STORAGE_KEYS.CHRONO_BACKUP;

/** Serialize ChronoState for localStorage (Map → array) */
function serializeState(state: ChronoState): string {
  return JSON.stringify({
    ...state,
    raceData: Array.from(state.raceData.entries()),
  });
}

/** Deserialize ChronoState from localStorage (array → Map) */
function deserializeState(raw: string): ChronoState | null {
  try {
    const parsed = JSON.parse(raw);
    return {
      ...parsed,
      raceData: new Map(parsed.raceData),
    };
  } catch {
    return null;
  }
}

interface Props {
  athletes: AthleteSummary[];
  allAthletes?: AthleteSummary[];
}

export default function CoachChronoScreen({ athletes, allAthletes }: Props) {
  const [state, dispatch] = useReducer(chronoReducer, initialChronoState);
  const [showRestore, setShowRestore] = useState(false);

  // Check for backup on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(BACKUP_KEY);
      if (raw) {
        const restored = deserializeState(raw);
        if (restored && restored.swimmers.length > 0) {
          setShowRestore(true);
        } else {
          localStorage.removeItem(BACKUP_KEY);
        }
      }
    } catch {
      localStorage.removeItem(BACKUP_KEY);
    }
  }, []);

  // Save to localStorage on state changes (skip empty setup)
  useEffect(() => {
    if (state.swimmers.length > 0) {
      try {
        localStorage.setItem(BACKUP_KEY, serializeState(state));
      } catch { /* ignore */ }
    }
  }, [state]);

  const handleRestore = useCallback(() => {
    try {
      const raw = localStorage.getItem(BACKUP_KEY);
      if (raw) {
        const restored = deserializeState(raw);
        if (restored) {
          dispatch({ type: "RESTORE_STATE", state: restored });
        }
      }
    } catch { /* ignore */ }
    setShowRestore(false);
  }, []);

  const handleDismissRestore = useCallback(() => {
    localStorage.removeItem(BACKUP_KEY);
    setShowRestore(false);
  }, []);

  // Clear backup after successful export
  const handleExportComplete = useCallback(() => {
    localStorage.removeItem(BACKUP_KEY);
  }, []);

  const isRacing = state.phase === "racing" && state.waves.some((w) => w.startedAt && !w.stopped);
  const { now, getTimestamp } = useChronoTimer(isRacing);

  return (
    <>
      {/* Mobile guard — chrono is tablet/desktop only */}
      <div className="flex flex-col items-center justify-center gap-3 p-8 text-center md:hidden" style={{ minHeight: "50vh" }}>
        <Timer className="h-10 w-10 text-muted-foreground" />
        <p className="text-lg font-semibold">Chrono non disponible sur mobile</p>
        <p className="text-sm text-muted-foreground">
          Utilisez une tablette ou un ordinateur pour accéder au chronomètre.
        </p>
      </div>

      <div className="hidden md:block max-w-6xl mx-auto p-4">
      {showRestore && (
        <div className="mb-4 rounded-xl border border-amber-400/50 bg-amber-950/60 p-4 flex items-center justify-between gap-4 shadow-lg shadow-amber-900/20">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/20">
              <Timer className="h-4 w-4 text-amber-400" />
            </div>
            <p className="text-sm font-medium text-amber-100">
              Une série en cours a été retrouvée. Reprendre ?
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="ghost" size="sm" className="text-amber-300/70 hover:text-amber-100 hover:bg-amber-900/40" onClick={handleDismissRestore}>
              Ignorer
            </Button>
            <Button size="sm" className="bg-amber-500 text-amber-950 font-semibold hover:bg-amber-400" onClick={handleRestore}>
              Reprendre
            </Button>
          </div>
        </div>
      )}

      {state.phase === "setup" && (
        <ChronoSetup state={state} dispatch={dispatch} athletes={athletes} allAthletes={allAthletes} />
      )}
      {state.phase === "racing" && (
        <ChronoRace state={state} dispatch={dispatch} now={now} getTimestamp={getTimestamp} />
      )}
      {state.phase === "results" && (
        <ChronoResults state={state} dispatch={dispatch} onExportComplete={handleExportComplete} />
      )}
      </div>
    </>
  );
}
