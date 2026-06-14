import { useReducer, useEffect, useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import { flush, getPending, subscribe } from "../../lib/chrono-save-queue";
import { useQueryClient } from "@tanstack/react-query";
import {
  chronoReducer,
  createChronoDefaultTitle,
  createInitialChronoState,
} from "../../lib/chrono-reducer";
import type { ChronoState } from "../../lib/chrono-types";
import { useChronoTimer } from "../../hooks/useChronoTimer";
import ChronoSetup from "../../components/chrono/ChronoSetup";
import ChronoRace from "../../components/chrono/ChronoRace";
import ChronoRaceMobile from "../../components/chrono/ChronoRaceMobile";
import ChronoResults from "../../components/chrono/ChronoResults";
import { STORAGE_KEYS } from "../../lib/api/client";
import { setSystemBannersSuppressed } from "../../lib/systemBanners";
import { Button } from "../../components/ui/button";
import { Timer, Smartphone } from "lucide-react";
import type { AthleteSummary } from "../../lib/api/types";

const BACKUP_KEY = STORAGE_KEYS.CHRONO_BACKUP;

/** Mobile limits */
export const MOBILE_LIMITS = {
  maxLanes: 3,
  maxSwimmersPerLane: 2,
  maxWaves: 2,
} as const;

function serializeState(state: ChronoState): string {
  return JSON.stringify({
    ...state,
    raceData: Array.from(state.raceData.entries()),
  });
}

function deserializeState(raw: string): ChronoState | null {
  try {
    const parsed = JSON.parse(raw);
    // Merge with initialChronoState to fill fields added in later versions (title, kind, etc.)
    return { ...createInitialChronoState(), ...parsed, raceData: new Map(parsed.raceData) };
  } catch {
    return null;
  }
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < 768 : false,
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isMobile;
}

interface Props {
  athletes: AthleteSummary[];
  allAthletes?: AthleteSummary[];
}

export default function CoachChronoScreen({ athletes, allAthletes }: Props) {
  const queryClient = useQueryClient();
  const [state, dispatch] = useReducer(chronoReducer, undefined, () => createInitialChronoState());
  const [showRestore, setShowRestore] = useState(false);
  const isMobile = useIsMobile();
  const [pendingCount, setPendingCount] = useState<number>(() => getPending().length);

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

  useEffect(() => {
    const refresh = () => setPendingCount(getPending().length);
    const unsubscribe = subscribe(refresh);
    const onOnline = () => { flush().finally(refresh); };
    window.addEventListener("online", onOnline);
    if (navigator.onLine) flush().finally(refresh);
    return () => {
      unsubscribe();
      window.removeEventListener("online", onOnline);
    };
  }, []);

  const persistTimeoutRef = useRef<number | null>(null);
  const quotaWarnedRef = useRef(false);
  useEffect(() => {
    if (state.swimmers.length === 0) return;
    if (persistTimeoutRef.current) window.clearTimeout(persistTimeoutRef.current);
    persistTimeoutRef.current = window.setTimeout(() => {
      try {
        localStorage.setItem(BACKUP_KEY, serializeState(state));
      } catch {
        // Avatar dataURLs may blow the quota — retry without them
        try {
          const lean = {
            ...state,
            swimmers: state.swimmers.map((s) => ({ ...s, avatarUrl: null })),
          };
          localStorage.setItem(BACKUP_KEY, serializeState(lean));
        } catch {
          localStorage.removeItem(BACKUP_KEY);
          if (!quotaWarnedRef.current) {
            quotaWarnedRef.current = true;
            toast.error("Sauvegarde locale impossible", {
              description: "Quota navigateur dépassé. Exporte régulièrement pour ne rien perdre.",
            });
          }
        }
      }
    }, 500);
    return () => {
      if (persistTimeoutRef.current) window.clearTimeout(persistTimeoutRef.current);
    };
  }, [state]);

  const handleRestore = useCallback(() => {
    try {
      const raw = localStorage.getItem(BACKUP_KEY);
      if (raw) {
        const restored = deserializeState(raw);
        if (restored) dispatch({ type: "RESTORE_STATE", state: restored });
      }
    } catch { /* ignore */ }
    setShowRestore(false);
  }, []);

  const handleDismissRestore = useCallback(() => {
    localStorage.removeItem(BACKUP_KEY);
    setShowRestore(false);
  }, []);

  const handleExportComplete = useCallback(() => {
    localStorage.removeItem(BACKUP_KEY);
    queryClient.invalidateQueries({ queryKey: ["chrono_records"] });
  }, [queryClient]);

  const handleRetryQueue = useCallback(async () => {
    const res = await flush();
    setPendingCount(getPending().length);
    if (res.succeeded > 0) toast.success(`${res.succeeded} sauvegarde${res.succeeded > 1 ? "s" : ""} renvoyée${res.succeeded > 1 ? "s" : ""}`);
    else if (res.failed > 0) toast.error("Renvoi impossible — pas de réseau ?", {
      action: { label: "Réessayer", onClick: () => void handleRetryQueue() },
    });
  }, []);

  const handleSaveDraft = useCallback(() => {
    localStorage.removeItem(BACKUP_KEY);
    queryClient.invalidateQueries({ queryKey: ["chrono_records"] });
    dispatch({
      type: "RESET_FOR_NEW_SERIES",
      title: createChronoDefaultTitle(),
    });
  }, [queryClient]);

  const isRacing = state.phase === "racing";
  const { now, getTimestamp } = useChronoTimer(isRacing);

  // §384 — pendant la course, suppression des bandeaux système (update/offline/
  // push/install) : ils glisseraient du haut sur les en-têtes de vague / GO.
  useEffect(() => {
    if (!isRacing) return;
    setSystemBannersSuppressed(true);
    return () => setSystemBannersSuppressed(false);
  }, [isRacing]);

  return (
    <>
      {/* Race phase uses full width — dedicated vertical layout on mobile (§384) */}
      {state.phase === "racing" && (
        isMobile ? (
          <ChronoRaceMobile state={state} dispatch={dispatch} now={now} getTimestamp={getTimestamp} />
        ) : (
          <ChronoRace state={state} dispatch={dispatch} now={now} getTimestamp={getTimestamp} />
        )
      )}

      {/* Setup & results */}
      {state.phase !== "racing" && (
        <div className={`max-w-6xl mx-auto ${isMobile ? "px-4 pt-2 pb-4" : "p-4"}`}>
          {/* Mobile info banner — slim single line */}
          {isMobile && state.phase === "setup" && (
            <div className="mb-1.5 flex items-center gap-1.5 px-0.5 text-[11px] text-muted-foreground/70">
              <Smartphone className="h-3 w-3 shrink-0" />
              <span className="truncate">Max {MOBILE_LIMITS.maxLanes} lignes · {MOBILE_LIMITS.maxSwimmersPerLane}/ligne · {MOBILE_LIMITS.maxWaves} vagues</span>
            </div>
          )}

          {pendingCount > 0 && (
            <div className="mb-4 rounded-xl border border-amber-400/50 bg-amber-950/60 p-4 flex items-center justify-between gap-4 shadow-lg shadow-amber-900/20">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/20">
                  <Timer className="h-4 w-4 text-amber-400" />
                </div>
                <p className="text-sm font-medium text-amber-100">
                  {pendingCount} sauvegarde{pendingCount > 1 ? "s" : ""} en attente — renvoi auto dès retour réseau
                </p>
              </div>
              <Button
                size="sm"
                className="bg-amber-500 text-amber-950 font-semibold hover:bg-amber-400 shrink-0"
                onClick={handleRetryQueue}
              >
                Réessayer
              </Button>
            </div>
          )}

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
            <ChronoSetup state={state} dispatch={dispatch} athletes={athletes} allAthletes={allAthletes} isMobile={isMobile} />
          )}
          {state.phase === "results" && (
            <ChronoResults state={state} dispatch={dispatch} onExportComplete={handleExportComplete} onSaveDraft={handleSaveDraft} isMobile={isMobile} />
          )}
        </div>
      )}
    </>
  );
}
