import { useReducer, useEffect, useState, useCallback } from "react";
import { chronoReducer, initialChronoState } from "../../lib/chrono-reducer";
import type { ChronoAction } from "../../lib/chrono-reducer";
import type { ChronoState } from "../../lib/chrono-types";
import { useChronoTimer } from "../../hooks/useChronoTimer";
import ChronoSetup from "../../components/chrono/ChronoSetup";
import ChronoRace from "../../components/chrono/ChronoRace";
import ChronoResults from "../../components/chrono/ChronoResults";
import { STORAGE_KEYS } from "../../lib/api/client";
import { Button } from "../../components/ui/button";
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
}

export default function CoachChronoScreen({ athletes }: Props) {
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
    <div className="max-w-6xl mx-auto p-4">
      {showRestore && (
        <div className="mb-4 rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4 flex items-center justify-between gap-4">
          <p className="text-sm text-yellow-200">
            Une série en cours a été retrouvée. Reprendre ?
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleDismissRestore}>
              Non, ignorer
            </Button>
            <Button size="sm" onClick={handleRestore}>
              Reprendre
            </Button>
          </div>
        </div>
      )}

      {state.phase === "setup" && (
        <ChronoSetup state={state} dispatch={dispatch} athletes={athletes} />
      )}
      {state.phase === "racing" && (
        <ChronoRace state={state} dispatch={dispatch} now={now} getTimestamp={getTimestamp} />
      )}
      {state.phase === "results" && (
        <ChronoResults state={state} dispatch={dispatch} onExportComplete={handleExportComplete} />
      )}
    </div>
  );
}
