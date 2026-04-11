import { useState, useMemo, useCallback } from "react";
import { Play, Plus, Minus, X, Search, Users } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Switch } from "../ui/switch";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "../ui/sheet";
import { WAVE_COLORS, DISTANCE_PRESETS, SPLIT_PRESETS } from "../../lib/chrono-types";
import type { ChronoState } from "../../lib/chrono-types";
import type { ChronoAction } from "../../lib/chrono-reducer";
import type { AthleteSummary } from "../../lib/api/types";

interface ChronoSetupProps {
  state: ChronoState;
  dispatch: React.Dispatch<ChronoAction>;
  athletes: AthleteSummary[];
  allAthletes?: AthleteSummary[];
}

export default function ChronoSetup({
  state,
  dispatch,
  athletes,
  allAthletes,
}: ChronoSetupProps) {
  const [addLane, setAddLane] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const displayAthletes = showAll && allAthletes ? allAthletes : athletes;

  const assignedIds = useMemo(
    () => new Set(state.swimmers.map((s) => s.athleteId)),
    [state.swimmers],
  );

  const activeWaves = useMemo(() => {
    const waves = new Set(state.swimmers.map((s) => s.wave));
    return Array.from(waves).sort((a, b) => a - b);
  }, [state.swimmers]);

  const swimmersByLane = useCallback(
    (lane: number) => state.swimmers.filter((s) => s.lane === lane),
    [state.swimmers],
  );

  // Group athletes by group_label for the picker
  const groupedAthletes = useMemo(() => {
    const lowerSearch = search.toLowerCase();
    const filtered = displayAthletes.filter(
      (a) =>
        a.id != null &&
        a.display_name.toLowerCase().includes(lowerSearch),
    );
    const groups = new Map<string, AthleteSummary[]>();
    for (const a of filtered) {
      const label = a.group_label ?? "Sans groupe";
      const list = groups.get(label);
      if (list) list.push(a);
      else groups.set(label, [a]);
    }
    return groups;
  }, [displayAthletes, search]);

  const handleAddSwimmer = (a: AthleteSummary) => {
    if (a.id == null || addLane == null) return;
    dispatch({
      type: "ADD_SWIMMER",
      swimmer: {
        athleteId: a.id,
        displayName: a.display_name,
        avatarUrl: a.avatar_url ?? null,
        wave: 1,
        lane: addLane,
      },
    });
    setAddLane(null);
    setSearch("");
  };

  const cycleWave = (athleteId: number, currentWave: number) => {
    dispatch({
      type: "SET_WAVE",
      athleteId,
      wave: (currentWave % 6) + 1,
    });
  };

  return (
    <div className="flex flex-col gap-5 p-4">
      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Préparation</h2>
        <Button
          size="sm"
          disabled={state.swimmers.length === 0}
          onClick={() => dispatch({ type: "START_RACE" })}
          className="gap-1.5"
        >
          <Play className="h-4 w-4" />
          Lancer
        </Button>
      </div>

      {/* ── Lane count controls + wave dots ─────────────── */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Lignes :</span>
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9"
          onClick={() =>
            dispatch({ type: "SET_LANE_COUNT", count: state.laneCount - 1 })
          }
          disabled={state.laneCount <= 1}
        >
          <Minus className="h-4 w-4" />
        </Button>
        <span className="min-w-[1.5rem] text-center font-medium">
          {state.laneCount}
        </span>
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9"
          onClick={() =>
            dispatch({ type: "SET_LANE_COUNT", count: state.laneCount + 1 })
          }
          disabled={state.laneCount >= 8}
        >
          <Plus className="h-4 w-4" />
        </Button>

        {activeWaves.length > 0 && (
          <div className="ml-auto flex items-center gap-1.5">
            {activeWaves.map((w) => {
              const c = WAVE_COLORS[w - 1];
              return (
                <span
                  key={w}
                  className={`inline-flex h-5 items-center gap-1 rounded-full px-2 text-[11px] font-medium ${c.bg} ${c.text}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
                  {c.label}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Departure intervals per wave ──────────────── */}
      {activeWaves.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-sm text-muted-foreground">Départ toutes les :</span>
          <div className="flex flex-wrap items-center gap-3">
            {activeWaves.map((w) => {
              const c = WAVE_COLORS[w - 1];
              const waveState = state.waves.find((ws) => ws.wave === w);
              const sec = waveState?.departureIntervalSec ?? 0;
              const mm = String(Math.floor(sec / 60)).padStart(2, "0");
              const ss = String(sec % 60).padStart(2, "0");
              return (
                <div key={w} className="flex items-center gap-1.5">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold text-white ${c.dot}`}>
                    {c.label}
                  </span>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={sec > 0 ? `${mm}:${ss}` : ""}
                    placeholder="mm:ss"
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^0-9:]/g, "");
                      let totalSec = 0;
                      if (raw.includes(":")) {
                        const [m, s] = raw.split(":");
                        totalSec = (parseInt(m) || 0) * 60 + (parseInt(s) || 0);
                      } else {
                        const num = parseInt(raw) || 0;
                        if (num > 59) {
                          totalSec = Math.floor(num / 100) * 60 + (num % 100);
                        } else {
                          totalSec = num;
                        }
                      }
                      dispatch({ type: "SET_WAVE_INTERVAL", wave: w, seconds: totalSec });
                    }}
                    className="w-[4.5rem] text-center font-mono text-sm"
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Distance config ──────────────────────────── */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Total distance stepper */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Distance :</span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => {
                const cur = state.totalDistanceM;
                const prev = [...DISTANCE_PRESETS].reverse().find((d) => d < cur);
                dispatch({ type: "SET_TOTAL_DISTANCE", meters: prev ?? 0 });
              }}
              disabled={state.totalDistanceM <= 0}
            >
              <Minus className="h-3.5 w-3.5" />
            </Button>
            <input
              type="text"
              inputMode="numeric"
              value={state.totalDistanceM || ""}
              placeholder="—"
              onChange={(e) => dispatch({ type: "SET_TOTAL_DISTANCE", meters: Number(e.target.value.replace(/\D/g, "")) || 0 })}
              className="w-16 text-center font-mono text-sm font-bold bg-transparent border-b border-border outline-none focus:border-primary"
            />
            <span className="text-xs text-muted-foreground">m</span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => {
                const cur = state.totalDistanceM;
                const next = DISTANCE_PRESETS.find((d) => d > cur);
                dispatch({ type: "SET_TOTAL_DISTANCE", meters: next ?? cur + 100 });
              }}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Split distance stepper */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Splits :</span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => {
                const cur = state.splitDistanceM;
                const prev = [...SPLIT_PRESETS].reverse().find((d) => d < cur);
                dispatch({ type: "SET_SPLIT_DISTANCE", meters: prev ?? 25 });
              }}
              disabled={state.splitDistanceM <= 25}
            >
              <Minus className="h-3.5 w-3.5" />
            </Button>
            <input
              type="text"
              inputMode="numeric"
              value={state.splitDistanceM || ""}
              placeholder="50"
              onChange={(e) => dispatch({ type: "SET_SPLIT_DISTANCE", meters: Number(e.target.value.replace(/\D/g, "")) || 0 })}
              className="w-14 text-center font-mono text-sm font-bold bg-transparent border-b border-border outline-none focus:border-primary"
            />
            <span className="text-xs text-muted-foreground">m</span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => {
                const cur = state.splitDistanceM;
                const next = SPLIT_PRESETS.find((d) => d > cur);
                dispatch({ type: "SET_SPLIT_DISTANCE", meters: next ?? cur + 25 });
              }}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Summary */}
        {state.totalDistanceM > 0 && state.splitDistanceM > 0 && (
          <span className="text-xs text-muted-foreground">
            → {Math.ceil(state.totalDistanceM / state.splitDistanceM)} splits par série
          </span>
        )}
      </div>

      {/* ── Lane sections ──────────────────────────────── */}
      <div className="flex flex-col gap-3">
        {Array.from({ length: state.laneCount }, (_, i) => i + 1).map(
          (lane) => {
            const swimmers = swimmersByLane(lane);
            return (
              <div
                key={lane}
                className="rounded-lg border border-border bg-card p-3"
              >
                <div className="mb-2 text-xs font-medium text-muted-foreground">
                  Ligne {lane}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {swimmers.map((s) => {
                    const c = WAVE_COLORS[s.wave - 1];
                    return (
                      <div
                        key={s.athleteId}
                        className="relative flex items-center gap-1.5 rounded-md border border-border bg-muted px-2.5 py-1.5 text-sm"
                      >
                        <span className="max-w-[7rem] truncate">
                          {s.displayName}
                        </span>
                        {/* Wave chip — tap to cycle */}
                        <button
                          type="button"
                          onClick={() => cycleWave(s.athleteId, s.wave)}
                          className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${c.bg} ${c.border} ${c.text}`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${c.dot}`}
                          />
                          {c.label}
                        </button>
                        {/* Remove button */}
                        <button
                          type="button"
                          onClick={() =>
                            dispatch({
                              type: "REMOVE_SWIMMER",
                              athleteId: s.athleteId,
                            })
                          }
                          className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    );
                  })}

                  {/* Add swimmer button */}
                  <button
                    type="button"
                    onClick={() => {
                      setAddLane(lane);
                      setSearch("");
                    }}
                    className="flex h-11 w-11 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground hover:bg-muted"
                  >
                    <Plus className="h-5 w-5" />
                  </button>
                </div>
              </div>
            );
          },
        )}
      </div>

      {/* ── Add swimmer sheet ──────────────────────────── */}
      <Sheet
        open={addLane !== null}
        onOpenChange={(open) => {
          if (!open) {
            setAddLane(null);
            setSearch("");
          }
        }}
      >
        <SheetContent side="right" className="w-80 sm:w-96">
          <SheetHeader>
            <SheetTitle>Ajouter un nageur — Ligne {addLane}</SheetTitle>
          </SheetHeader>

          <div className="mt-4 flex flex-col gap-4">
            {/* Search input */}
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Club-wide toggle */}
            {allAthletes && allAthletes.length > athletes.length && (
              <label className="flex items-center gap-2 cursor-pointer">
                <Switch checked={showAll} onCheckedChange={setShowAll} />
                <Users className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Tout le club</span>
              </label>
            )}

            {/* Grouped athlete list */}
            <div className="flex flex-col gap-4 overflow-y-auto">
              {Array.from(groupedAthletes.entries()).map(
                ([group, members]) => (
                  <div key={group}>
                    <div className="mb-1 text-xs font-medium text-muted-foreground">
                      {group}
                    </div>
                    <div className="flex flex-col">
                      {members.map((a) => {
                        const isAssigned =
                          a.id != null && assignedIds.has(a.id);
                        return (
                          <button
                            key={a.id}
                            type="button"
                            disabled={isAssigned}
                            onClick={() => handleAddSwimmer(a)}
                            className={`flex min-h-[44px] items-center rounded-md px-3 py-2 text-left text-sm transition-colors ${
                              isAssigned
                                ? "cursor-not-allowed text-muted-foreground/50"
                                : "hover:bg-muted"
                            }`}
                          >
                            {a.display_name}
                            {isAssigned && (
                              <span className="ml-auto text-[10px] text-muted-foreground">
                                déjà assigné
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ),
              )}
              {groupedAthletes.size === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Aucun nageur trouvé
                </p>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
