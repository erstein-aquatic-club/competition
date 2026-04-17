import { useState, useMemo, useCallback, useRef } from "react";
import { Play, Plus, Minus, X, Search, Users, Trash2, UserRound, BookmarkPlus, Loader2, Pencil, Check, AlertTriangle, ArrowLeftRight, Waves } from "lucide-react";
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
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
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
  const [activeTab, setActiveTab] = useState<"club" | "manuals" | "new">("club");
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

  /** Count of swimmers currently in the target lane (for limit display). */
  const laneCount = useMemo(
    () => (addLane == null ? 0 : state.swimmers.filter((s) => s.lane === addLane).length),
    [addLane, state.swimmers],
  );
  const laneFull = addLane != null && laneCount >= maxSwimmersPerLane;

  const handleAddSwimmer = (a: AthleteSummary) => {
    if (a.id == null || addLane == null || laneFull) return;
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
    // Keep sheet open for batch-add.
  };

  const closeAddSheet = () => {
    setAddLane(null);
    setSearch("");
    setActiveTab("club");
  };

  return (
    <div className="flex flex-col gap-5 p-4">
      {/* ── Title input — inline, minimalist, borderless ─ */}
      <label className="group flex items-baseline gap-2 border-b border-border/60 pb-1 focus-within:border-primary/70 transition-colors">
        <Pencil className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60 group-focus-within:text-primary" />
        <input
          type="text"
          placeholder="Titre de la séance"
          value={state.title}
          onChange={(e) => dispatch({ type: "SET_TITLE", title: e.target.value })}
          maxLength={120}
          className="flex-1 bg-transparent text-[15px] font-medium text-foreground placeholder:font-normal placeholder:italic placeholder:text-muted-foreground/60 outline-none"
        />
      </label>

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
                  {swimmers.map((s) => (
                    <SwimmerChip
                      key={s.key}
                      swimmer={s}
                      laneCount={state.laneCount}
                      maxSwimmersPerLane={maxSwimmersPerLane}
                      allSwimmers={state.swimmers}
                      maxWaves={maxWaves}
                      dispatch={dispatch}
                    />
                  ))}

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
          if (!open) closeAddSheet();
        }}
      >
        <SheetContent side="right" className="w-80 sm:w-96 flex flex-col">
          <SheetHeader>
            <SheetTitle className="flex items-baseline gap-2">
              <span>Ligne {addLane}</span>
              <span className="text-xs font-normal text-muted-foreground">
                {laneCount === 0
                  ? "Aucun nageur"
                  : `${laneCount} nageur${laneCount > 1 ? "s" : ""}${
                      maxSwimmersPerLane !== Infinity ? ` / ${maxSwimmersPerLane}` : ""
                    }`}
              </span>
            </SheetTitle>
          </SheetHeader>

          {laneFull && (
            <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>
                Ligne pleine ({maxSwimmersPerLane}). Fermez ce panneau et changez de ligne pour continuer.
              </span>
            </div>
          )}

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "club" | "manuals" | "new")} className="flex-1 flex flex-col overflow-hidden mt-4">
            <TabsList className="grid grid-cols-3 w-full h-auto p-1 gap-0.5">
              <TabsTrigger value="club" className="gap-1.5 py-2.5 text-xs">
                <Users className="h-3.5 w-3.5" />
                Club
              </TabsTrigger>
              <TabsTrigger value="manuals" className="gap-1.5 py-2.5 text-xs">
                <BookmarkPlus className="h-3.5 w-3.5" />
                Mémorisés
              </TabsTrigger>
              <TabsTrigger value="new" className="gap-1.5 py-2.5 text-xs">
                <Plus className="h-3.5 w-3.5" />
                Nouveau
              </TabsTrigger>
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
                            const disabled = isAssigned || laneFull;
                            return (
                              <button
                                key={a.id}
                                type="button"
                                disabled={disabled}
                                onClick={() => handleAddSwimmer(a)}
                                className={`flex min-h-[44px] items-center rounded-md px-3 py-2 text-left text-sm transition-colors ${
                                  disabled
                                    ? "cursor-not-allowed"
                                    : "hover:bg-muted active:bg-muted/60"
                                } ${
                                  isAssigned
                                    ? "text-muted-foreground"
                                    : disabled
                                    ? "text-muted-foreground/50"
                                    : "text-foreground"
                                }`}
                              >
                                <span className="flex-1 truncate">{a.display_name}</span>
                                {isAssigned && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-green-600 dark:text-green-400 shrink-0">
                                    <Check className="h-3 w-3" />
                                    ajouté
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

            <TabsContent value="manuals" className="flex-1 overflow-y-auto mt-3">
              {addLane !== null && (
                <ManualsTabBody
                  addLane={addLane}
                  laneFull={laneFull}
                  onGoToNew={() => setActiveTab("new")}
                  dispatch={dispatch}
                />
              )}
            </TabsContent>

            <TabsContent value="new" className="flex-1 mt-3">
              {addLane !== null && (
                <NewManualTabBody
                  addLane={addLane}
                  laneFull={laneFull}
                  dispatch={dispatch}
                />
              )}
            </TabsContent>
          </Tabs>

          {/* ── Sticky footer — batch-add summary + close ── */}
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3 -mx-6 px-6">
            <p className="text-xs text-muted-foreground">
              {laneCount > 0 ? (
                <>
                  <span className="font-semibold text-foreground tabular-nums">
                    {laneCount}
                  </span>{" "}
                  nageur{laneCount > 1 ? "s" : ""} dans la ligne
                </>
              ) : (
                "Sélectionnez un ou plusieurs nageurs"
              )}
            </p>
            <Button size="sm" onClick={closeAddSheet} className="gap-1.5 shrink-0">
              <Check className="h-4 w-4" />
              Terminé
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function ManualsTabBody({
  addLane,
  laneFull,
  onGoToNew,
  dispatch,
}: {
  addLane: number;
  laneFull: boolean;
  onGoToNew: () => void;
  dispatch: React.Dispatch<ChronoAction>;
}) {
  const queryClient = useQueryClient();
  const { data: manuals = [], isLoading } = useQuery({
    queryKey: ["coach_manual_swimmers"],
    queryFn: listManualSwimmers,
  });
  const delMutation = useMutation({
    mutationFn: deleteManualSwimmer,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["coach_manual_swimmers"] }),
  });
  // Local pulse feedback : which manual was added last (for a brief "✓ ajouté" tag).
  const [justAdded, setJustAdded] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    );
  }

  if (manuals.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 px-4 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <BookmarkPlus className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">Aucun nageur mémorisé</p>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-[240px]">
            Les manuels que vous enregistrez depuis l'onglet <span className="font-medium">Nouveau</span> apparaîtront ici.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onGoToNew} className="gap-1.5 mt-1">
          <Plus className="h-3.5 w-3.5" />
          Créer un manuel
        </Button>
      </div>
    );
  }
  return (
    <ul className="flex flex-col divide-y divide-border/60">
      {manuals.map(m => {
        const pulse = justAdded === m.id;
        return (
          <li key={m.id} className="flex items-center group">
            <button
              type="button"
              disabled={laneFull}
              onClick={() => {
                dispatch({
                  type: "ADD_SWIMMER",
                  swimmer: buildManualSwimmer({
                    manualId: crypto.randomUUID(),
                    displayName: m.display_name,
                    lane: addLane,
                  }),
                });
                setJustAdded(m.id);
                // Reset the "just added" pulse after a beat — purely visual feedback.
                setTimeout(() => setJustAdded((curr) => (curr === m.id ? null : curr)), 900);
              }}
              className={`flex flex-1 min-h-[48px] items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors ${
                laneFull
                  ? "cursor-not-allowed text-muted-foreground/40"
                  : "hover:bg-muted active:bg-muted/60"
              }`}
            >
              <UserRound className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
              <span className="flex-1 truncate">{m.display_name}</span>
              {pulse && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-green-600 dark:text-green-400 shrink-0 animate-in fade-in slide-in-from-right-1 duration-300">
                  <Check className="h-3 w-3" />
                  ajouté
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => delMutation.mutate(m.id)}
              disabled={delMutation.isPending}
              className="flex h-11 w-11 shrink-0 items-center justify-center text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors disabled:opacity-40"
              aria-label={`Supprimer ${m.display_name}`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function NewManualTabBody({
  addLane,
  laneFull,
  dispatch,
}: {
  addLane: number;
  laneFull: boolean;
  dispatch: React.Dispatch<ChronoAction>;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [remember, setRemember] = useState(true);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const saveMutation = useMutation({
    mutationFn: createManualSwimmer,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["coach_manual_swimmers"] }),
  });

  const submit = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed || laneFull) return;
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
    // Batch-add : reset + refocus, keep sheet open.
    setJustAdded(trimmed);
    setName("");
    inputRef.current?.focus();
    setTimeout(() => setJustAdded((curr) => (curr === trimmed ? null : curr)), 1600);
  }, [name, remember, saveMutation, dispatch, addLane, laneFull]);

  const busy = saveMutation.isPending;
  const trimmed = name.trim();
  const disabled = !trimmed || busy || laneFull;

  return (
    <div className="flex flex-col gap-4 pt-2">
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          Nom du nageur
        </label>
        <Input
          ref={inputRef}
          autoFocus
          value={name}
          placeholder="Prénom Nom"
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !disabled) submit(); }}
          disabled={busy}
          className="h-11"
        />
      </div>

      <label className="flex items-start gap-3 rounded-lg border border-border/70 bg-muted/40 p-3 cursor-pointer hover:bg-muted/60 transition-colors">
        <Switch checked={remember} onCheckedChange={setRemember} disabled={busy} className="mt-0.5" />
        <div className="flex-1 space-y-0.5">
          <p className="text-sm font-medium text-foreground">Mémoriser</p>
          <p className="text-[11px] leading-snug text-muted-foreground">
            Retrouvez ce nom dans l'onglet <span className="font-medium">Mémorisés</span> lors de prochaines séances.
          </p>
        </div>
      </label>

      <Button
        disabled={disabled}
        onClick={submit}
        className="h-11 gap-1.5"
      >
        {busy ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Enregistrement…
          </>
        ) : (
          <>
            <Plus className="h-4 w-4" />
            Ajouter à la ligne {addLane}
          </>
        )}
      </Button>

      {justAdded && (
        <div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400 animate-in fade-in slide-in-from-bottom-1 duration-300">
          <Check className="h-3.5 w-3.5" />
          <span>
            <span className="font-semibold">{justAdded}</span> ajouté. Entrez le suivant.
          </span>
        </div>
      )}
    </div>
  );
}

// ── SwimmerChip — tap name to open move/wave/remove menu ────────────

function SwimmerChip({
  swimmer,
  laneCount,
  maxSwimmersPerLane,
  allSwimmers,
  maxWaves,
  dispatch,
}: {
  swimmer: import("../../lib/chrono-types").ChronoSwimmer;
  laneCount: number;
  maxSwimmersPerLane: number;
  allSwimmers: import("../../lib/chrono-types").ChronoSwimmer[];
  maxWaves: number;
  dispatch: React.Dispatch<ChronoAction>;
}) {
  const [open, setOpen] = useState(false);
  const c = WAVE_COLORS[swimmer.wave - 1];
  const isManual = swimmer.kind === "manual";

  const laneFillCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const s of allSwimmers) {
      counts.set(s.lane, (counts.get(s.lane) ?? 0) + 1);
    }
    return counts;
  }, [allSwimmers]);

  const handleMove = (lane: number) => {
    if (lane === swimmer.lane) return;
    dispatch({ type: "MOVE_SWIMMER", key: swimmer.key, lane });
    setOpen(false);
  };

  const handleCycleWave = () => {
    dispatch({
      type: "SET_WAVE",
      key: swimmer.key,
      wave: (swimmer.wave % maxWaves) + 1,
    });
  };

  const handleRemove = () => {
    dispatch({ type: "REMOVE_SWIMMER", key: swimmer.key });
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div
        className={`relative flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm ${
          isManual
            ? "border border-dashed border-border/80 bg-background/40"
            : "border border-border bg-muted"
        }`}
      >
        {isManual && (
          <UserRound className="h-3 w-3 shrink-0 text-muted-foreground/70" aria-hidden />
        )}

        {/* Name = popover trigger */}
        <PopoverTrigger asChild>
          <button
            type="button"
            className="max-w-[8rem] truncate text-left outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
            title="Déplacer, changer de vague, supprimer"
          >
            {swimmer.displayName}
          </button>
        </PopoverTrigger>

        {/* Wave chip — tap to cycle (unchanged for muscle memory) */}
        <button
          type="button"
          onClick={handleCycleWave}
          aria-label={`Vague ${c.label} — changer`}
          className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${c.bg} ${c.border} ${c.text}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
          {c.label}
        </button>
      </div>

      <PopoverContent align="start" side="top" className="w-auto min-w-[14rem] p-3">
        <div className="flex flex-col gap-3">
          {/* Move to lane */}
          <div className="space-y-1.5">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <ArrowLeftRight className="h-3 w-3" />
              Déplacer vers
            </p>
            <div className="flex flex-wrap gap-1.5">
              {Array.from({ length: laneCount }, (_, i) => i + 1).map((lane) => {
                const isCurrent = lane === swimmer.lane;
                const fillOther = (laneFillCounts.get(lane) ?? 0);
                const targetFull = !isCurrent && fillOther >= maxSwimmersPerLane;
                return (
                  <button
                    key={lane}
                    type="button"
                    disabled={isCurrent || targetFull}
                    onClick={() => handleMove(lane)}
                    className={`h-9 min-w-[2.5rem] rounded-md border px-2 text-sm font-semibold tabular-nums transition-colors ${
                      isCurrent
                        ? "border-primary/40 bg-primary/10 text-primary cursor-default"
                        : targetFull
                        ? "border-border/40 bg-muted/40 text-muted-foreground/40 cursor-not-allowed"
                        : "border-border bg-background hover:bg-muted active:bg-muted/70 text-foreground"
                    }`}
                    title={targetFull ? `Ligne ${lane} pleine` : undefined}
                  >
                    {lane}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Wave shortcut */}
          <button
            type="button"
            onClick={() => {
              handleCycleWave();
              // Keep popover open so the coach can cycle multiple times without reopening.
            }}
            className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted transition-colors"
          >
            <span className="flex items-center gap-2">
              <Waves className="h-3.5 w-3.5 text-muted-foreground" />
              Vague suivante
            </span>
            <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${c.bg} ${c.border} ${c.text}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
              {c.label}
            </span>
          </button>

          {/* Remove */}
          <button
            type="button"
            onClick={handleRemove}
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Retirer de la séance
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
