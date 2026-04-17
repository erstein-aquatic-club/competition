import { useState, useMemo, useCallback } from "react";
import { Play, Plus, Minus, X, Search, Users, Trash2 } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Switch } from "../ui/switch";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "../ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../ui/tabs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { WAVE_COLORS, DISTANCE_PRESETS, SPLIT_PRESETS, buildRegisteredSwimmer, buildManualSwimmer } from "../../lib/chrono-types";
import type { ChronoState } from "../../lib/chrono-types";
import type { ChronoAction } from "../../lib/chrono-reducer";
import type { AthleteSummary } from "../../lib/api/types";
import {
  listManualSwimmers,
  createManualSwimmer,
  deleteManualSwimmer,
} from "../../lib/api/coach-manual-swimmers";

interface ChronoSetupProps {
  state: ChronoState;
  dispatch: React.Dispatch<ChronoAction>;
  athletes: AthleteSummary[];
  allAthletes?: AthleteSummary[];
  isMobile?: boolean;
}

export default function ChronoSetup({
  state,
  dispatch,
  athletes,
  allAthletes,
  isMobile = false,
}: ChronoSetupProps) {
  const maxLanes = isMobile ? 3 : 8;
  const maxSwimmersPerLane = isMobile ? 2 : Infinity;
  const maxWaves = isMobile ? 2 : 6;
  const [addLane, setAddLane] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const displayAthletes = showAll && allAthletes ? allAthletes : athletes;

  const assignedKeys = useMemo(
    () => new Set(state.swimmers.map((s) => s.key)),
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
      swimmer: buildRegisteredSwimmer({
        athleteId: a.id,
        displayName: a.display_name,
        avatarUrl: a.avatar_url ?? null,
        wave: 1,
        lane: addLane,
      }),
    });
    setAddLane(null);
    setSearch("");
  };

  const cycleWave = (key: string, currentWave: number) => {
    dispatch({
      type: "SET_WAVE",
      key,
      wave: (currentWave % maxWaves) + 1,
    });
  };

  return (
    <div className="flex flex-col gap-5 p-4">
      {/* ── Title input ─────────────────────────────────── */}
      <Input
        placeholder="Titre de la séance (optionnel)"
        value={state.title}
        onChange={(e) => dispatch({ type: "SET_TITLE", title: e.target.value })}
        maxLength={120}
        className="mb-1"
      />

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
          disabled={state.laneCount >= maxLanes}
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
              const totalSec = waveState?.departureIntervalSec ?? 0;
              const minutes = Math.floor(totalSec / 60);
              const seconds = totalSec % 60;
              const updateInterval = (min: number, sec: number) => {
                dispatch({ type: "SET_WAVE_INTERVAL", wave: w, seconds: min * 60 + sec });
              };
              return (
                <div key={w} className="flex items-center gap-1.5">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold text-white ${c.dot}`}>
                    {c.label}
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={minutes || ""}
                    placeholder="0"
                    onChange={(e) => updateInterval(Number(e.target.value.replace(/\D/g, "")) || 0, seconds)}
                    className="w-8 text-center font-mono text-sm font-bold bg-transparent border-b border-border outline-none focus:border-primary"
                  />
                  <span className="text-xs text-muted-foreground">min</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={seconds || ""}
                    placeholder="0"
                    onChange={(e) => {
                      const val = Number(e.target.value.replace(/\D/g, "")) || 0;
                      updateInterval(minutes, Math.min(59, val));
                    }}
                    className="w-8 text-center font-mono text-sm font-bold bg-transparent border-b border-border outline-none focus:border-primary"
                  />
                  <span className="text-xs text-muted-foreground">sec</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Série / Distance config ─────────────────── */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Series count — FIRST */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Séries :</span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8"
              onClick={() => dispatch({ type: "SET_SERIES_COUNT", count: Math.max(0, state.seriesCount - 1) })}
              disabled={state.seriesCount <= 0}
            ><Minus className="h-3.5 w-3.5" /></Button>
            <input type="text" inputMode="numeric" value={state.seriesCount || ""} placeholder="∞"
              onChange={(e) => dispatch({ type: "SET_SERIES_COUNT", count: Number(e.target.value.replace(/\D/g, "")) || 0 })}
              className="w-10 text-center font-mono text-sm font-bold bg-transparent border-b border-border outline-none focus:border-primary"
            />
            <Button variant="outline" size="icon" className="h-8 w-8"
              onClick={() => dispatch({ type: "SET_SERIES_COUNT", count: state.seriesCount + 1 })}
            ><Plus className="h-3.5 w-3.5" /></Button>
          </div>
        </div>

        <span className="text-muted-foreground">×</span>

        {/* Total distance stepper */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8"
              onClick={() => {
                const prev = [...DISTANCE_PRESETS].reverse().find((d) => d < state.totalDistanceM);
                dispatch({ type: "SET_TOTAL_DISTANCE", meters: prev ?? 0 });
              }}
              disabled={state.totalDistanceM <= 0}
            ><Minus className="h-3.5 w-3.5" /></Button>
            <input type="text" inputMode="numeric" value={state.totalDistanceM || ""} placeholder="—"
              onChange={(e) => dispatch({ type: "SET_TOTAL_DISTANCE", meters: Number(e.target.value.replace(/\D/g, "")) || 0 })}
              className="w-16 text-center font-mono text-sm font-bold bg-transparent border-b border-border outline-none focus:border-primary"
            />
            <span className="text-xs text-muted-foreground">m</span>
            <Button variant="outline" size="icon" className="h-8 w-8"
              onClick={() => {
                const next = DISTANCE_PRESETS.find((d) => d > state.totalDistanceM);
                dispatch({ type: "SET_TOTAL_DISTANCE", meters: next ?? state.totalDistanceM + 100 });
              }}
            ><Plus className="h-3.5 w-3.5" /></Button>
          </div>
        </div>

        {/* Split distance */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">splits à</span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8"
              onClick={() => {
                const prev = [...SPLIT_PRESETS].reverse().find((d) => d < state.splitDistanceM);
                dispatch({ type: "SET_SPLIT_DISTANCE", meters: prev ?? 25 });
              }}
              disabled={state.splitDistanceM <= 25}
            ><Minus className="h-3.5 w-3.5" /></Button>
            <input type="text" inputMode="numeric" value={state.splitDistanceM || ""} placeholder="50"
              onChange={(e) => dispatch({ type: "SET_SPLIT_DISTANCE", meters: Number(e.target.value.replace(/\D/g, "")) || 0 })}
              className="w-14 text-center font-mono text-sm font-bold bg-transparent border-b border-border outline-none focus:border-primary"
            />
            <span className="text-xs text-muted-foreground">m</span>
            <Button variant="outline" size="icon" className="h-8 w-8"
              onClick={() => {
                const next = SPLIT_PRESETS.find((d) => d > state.splitDistanceM);
                dispatch({ type: "SET_SPLIT_DISTANCE", meters: next ?? state.splitDistanceM + 25 });
              }}
            ><Plus className="h-3.5 w-3.5" /></Button>
          </div>
        </div>
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
                        key={s.key}
                        className="relative flex items-center gap-1.5 rounded-md border border-border bg-muted px-2.5 py-1.5 text-sm"
                      >
                        <span className="max-w-[7rem] truncate">
                          {s.displayName}
                        </span>
                        {s.kind === "manual" && (
                          <span className="inline-flex h-4 items-center rounded px-1 text-[9px] font-semibold bg-muted text-muted-foreground">M</span>
                        )}
                        {/* Wave chip — tap to cycle */}
                        <button
                          type="button"
                          onClick={() => cycleWave(s.key, s.wave)}
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
                              key: s.key,
                            })
                          }
                          className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    );
                  })}

                  {/* Add swimmer button — hidden when lane is full on mobile */}
                  {swimmers.length < maxSwimmersPerLane && (
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
                  )}
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
        <SheetContent side="right" className="w-80 sm:w-96 flex flex-col">
          <SheetHeader>
            <SheetTitle>Ajouter un nageur — Ligne {addLane}</SheetTitle>
          </SheetHeader>

          <Tabs defaultValue="club" className="flex-1 flex flex-col overflow-hidden mt-4">
            <TabsList className="grid grid-cols-3 w-full">
              <TabsTrigger value="club">Club</TabsTrigger>
              <TabsTrigger value="manuals">Mes manuels</TabsTrigger>
              <TabsTrigger value="new">Nouveau</TabsTrigger>
            </TabsList>

            <TabsContent value="club" className="flex-1 overflow-y-auto">
              <div className="flex flex-col gap-4 pt-2">
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
                <div className="flex flex-col gap-4">
                  {Array.from(groupedAthletes.entries()).map(
                    ([group, members]) => (
                      <div key={group}>
                        <div className="mb-1 text-xs font-medium text-muted-foreground">
                          {group}
                        </div>
                        <div className="flex flex-col">
                          {members.map((a) => {
                            const isAssigned =
                              a.id != null && assignedKeys.has(`a:${a.id}`);
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
            </TabsContent>

            <TabsContent value="manuals" className="flex-1 overflow-y-auto">
              {addLane !== null && (
                <ManualsTabBody
                  addLane={addLane}
                  onAdded={() => { setAddLane(null); }}
                  dispatch={dispatch}
                />
              )}
            </TabsContent>

            <TabsContent value="new" className="flex-1">
              {addLane !== null && (
                <NewManualTabBody
                  addLane={addLane}
                  onAdded={() => { setAddLane(null); }}
                  dispatch={dispatch}
                />
              )}
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function ManualsTabBody({
  addLane,
  onAdded,
  dispatch,
}: {
  addLane: number;
  onAdded: () => void;
  dispatch: React.Dispatch<ChronoAction>;
}) {
  const queryClient = useQueryClient();
  const { data: manuals = [] } = useQuery({
    queryKey: ["coach_manual_swimmers"],
    queryFn: listManualSwimmers,
  });
  const delMutation = useMutation({
    mutationFn: deleteManualSwimmer,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["coach_manual_swimmers"] }),
  });

  if (manuals.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Aucun nageur mémorisé. Utilisez l'onglet Nouveau.
      </p>
    );
  }
  return (
    <ul className="flex flex-col">
      {manuals.map(m => (
        <li key={m.id} className="flex items-center">
          <button
            type="button"
            onClick={() => {
              dispatch({
                type: "ADD_SWIMMER",
                swimmer: buildManualSwimmer({
                  manualId: crypto.randomUUID(),
                  displayName: m.display_name,
                  lane: addLane,
                }),
              });
              onAdded();
            }}
            className="flex-1 min-h-[44px] px-3 py-2 text-left text-sm hover:bg-muted"
          >
            {m.display_name}
          </button>
          <button
            type="button"
            onClick={() => delMutation.mutate(m.id)}
            className="flex h-9 w-9 items-center justify-center text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </li>
      ))}
    </ul>
  );
}

function NewManualTabBody({
  addLane,
  onAdded,
  dispatch,
}: {
  addLane: number;
  onAdded: () => void;
  dispatch: React.Dispatch<ChronoAction>;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [remember, setRemember] = useState(true);
  const saveMutation = useMutation({
    mutationFn: createManualSwimmer,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["coach_manual_swimmers"] }),
  });

  const submit = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (remember) {
      try { await saveMutation.mutateAsync(trimmed); }
      catch { /* offline: add as volatile */ }
    }
    dispatch({
      type: "ADD_SWIMMER",
      swimmer: buildManualSwimmer({
        manualId: crypto.randomUUID(),
        displayName: trimmed,
        lane: addLane,
      }),
    });
    setName("");
    onAdded();
  }, [name, remember, saveMutation, dispatch, addLane, onAdded]);

  return (
    <div className="flex flex-col gap-3 pt-4">
      <Input
        autoFocus
        value={name}
        placeholder="Prénom Nom"
        onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") submit(); }}
      />
      <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
        <Switch checked={remember} onCheckedChange={setRemember} />
        Mémoriser pour plus tard
      </label>
      <Button disabled={!name.trim()} onClick={submit}>Ajouter</Button>
    </div>
  );
}
