import { useState, useMemo, useCallback, useEffect } from "react";
import { useMyTeam } from "../../hooks/useMyTeam";
import { Play, Plus, Minus, Search, Users, Trash2, BookmarkPlus, Loader2, Pencil, Check, AlertTriangle, ArrowLeftRight, Waves, ChevronRight, ChevronDown } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "../ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { WAVE_COLORS, DISTANCE_PRESETS, SPLIT_PRESETS, buildRegisteredSwimmer, buildManualSwimmer } from "../../lib/chrono-types";
import type { ChronoState } from "../../lib/chrono-types";
import type { ChronoAction } from "../../lib/chrono-reducer";
import type { AthleteSummary } from "../../lib/api/types";
import { deleteManualSwimmer } from "../../lib/api/coach-manual-swimmers";
import { fetchAvatarAsDataUrl } from "../../lib/chrono-avatar-cache";
import { SwimmerAvatar } from "./SwimmerAvatar";

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
  const [activeTab, setActiveTab] = useState<"team" | "club">("team");
  const [justAddedManual, setJustAddedManual] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { manuals, isLoading: manualsLoading } = useMyTeam();
  const delManualMutation = useMutation({
    mutationFn: deleteManualSwimmer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-manual-swimmers"] });
      queryClient.invalidateQueries({ queryKey: ["my-team"] });
    },
  });
  const hasClubTab = !!allAthletes && allAthletes.length > athletes.length;
  const displayAthletes = activeTab === "club" && allAthletes ? allAthletes : athletes;

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

  // Pre-cache avatars to base64 dataURL so the race phase survives offline.
  useEffect(() => {
    const pending = state.swimmers.filter(
      (s) => s.kind === "registered" && s.avatarUrl && !s.avatarUrl.startsWith("data:"),
    );
    if (pending.length === 0) return;
    let cancelled = false;
    (async () => {
      for (const s of pending) {
        const url = s.avatarUrl;
        if (!url) continue;
        const dataUrl = await fetchAvatarAsDataUrl(url);
        if (cancelled || !dataUrl) continue;
        dispatch({ type: "UPDATE_SWIMMER_AVATAR", key: s.key, avatarUrl: dataUrl });
      }
    })();
    return () => { cancelled = true; };
  }, [state.swimmers, dispatch]);

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

  const filteredManuals = useMemo(() => {
    const lower = search.toLowerCase();
    return manuals.filter((m) => m.displayName.toLowerCase().includes(lower));
  }, [manuals, search]);

  /** Count of swimmers currently in the target lane (for limit display). */
  const laneCount = useMemo(
    () => (addLane == null ? 0 : state.swimmers.filter((s) => s.lane === addLane).length),
    [addLane, state.swimmers],
  );
  const laneFull = addLane != null && laneCount >= maxSwimmersPerLane;

  const [advancedOpen, setAdvancedOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem("eac-chrono-advanced-open") === "true";
    } catch {
      return false;
    }
  });

  const toggleAdvanced = useCallback(() => {
    setAdvancedOpen((prev) => {
      const next = !prev;
      try { localStorage.setItem("eac-chrono-advanced-open", String(next)); } catch { /* quota */ }
      return next;
    });
  }, []);

  const advancedSummary = useMemo(() => {
    const parts: string[] = [];
    if (state.seriesCount > 0) parts.push(`${state.seriesCount} série${state.seriesCount > 1 ? "s" : ""}`);
    if (activeWaves.length > 1) parts.push(`${activeWaves.length} vagues`);
    const hasInterval = state.waves.some((w) => w.departureIntervalSec > 0);
    if (hasInterval) parts.push("intervalles");
    return parts.length > 0 ? `· ${parts.join(" · ")}` : "";
  }, [state.seriesCount, activeWaves.length, state.waves]);

  const footerSummary = useMemo(() => {
    const parts: string[] = [];
    if (state.swimmers.length > 0)
      parts.push(`${state.swimmers.length} nageur${state.swimmers.length > 1 ? "s" : ""}`);
    if (state.totalDistanceM > 0) parts.push(`${state.totalDistanceM} m`);
    if (state.splitDistanceM > 0) parts.push(`splits ${state.splitDistanceM} m`);
    if (parts.length === 0) return "Ajoutez des nageurs pour commencer";
    return parts.join(" · ");
  }, [state.swimmers.length, state.totalDistanceM, state.splitDistanceM]);

  // First swimmer in a lane → wave 1, second → wave 2, etc. (capped at maxWaves).
  const computeNextWave = useCallback(
    (lane: number) => {
      const inLane = state.swimmers.filter((s) => s.lane === lane).length;
      return Math.min(inLane + 1, maxWaves);
    },
    [state.swimmers, maxWaves],
  );

  const handleAddSwimmer = (a: AthleteSummary) => {
    if (a.id == null || addLane == null || laneFull) return;
    dispatch({
      type: "ADD_SWIMMER",
      swimmer: buildRegisteredSwimmer({
        athleteId: a.id,
        displayName: a.display_name,
        avatarUrl: a.avatar_url ?? null,
        wave: computeNextWave(addLane),
        lane: addLane,
      }),
    });
    // Keep sheet open for batch-add.
  };

  const handleAddManual = (m: { id: string; manualId?: string; displayName: string }) => {
    if (addLane == null || laneFull) return;
    dispatch({
      type: "ADD_SWIMMER",
      swimmer: buildManualSwimmer({
        manualId: crypto.randomUUID(),
        displayName: m.displayName,
        wave: computeNextWave(addLane),
        lane: addLane,
      }),
    });
    setJustAddedManual(m.id);
    setTimeout(() => setJustAddedManual((curr) => (curr === m.id ? null : curr)), 900);
  };

  const closeAddSheet = () => {
    setAddLane(null);
    setSearch("");
    setActiveTab("team");
  };

  return (
    <div className="flex flex-col gap-5 p-4 pb-24">
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

      {/* ── Programme ─────────────────────────────── */}
      <div className="rounded-lg border border-border bg-card/50 p-3">
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Programme
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <PresetDistanceField
            label="Distance totale"
            value={state.totalDistanceM}
            presets={DISTANCE_PRESETS}
            minValue={0}
            inputWidth="w-16"
            onDecrement={() => {
              const prev = [...DISTANCE_PRESETS].reverse().find((d) => d < state.totalDistanceM);
              dispatch({ type: "SET_TOTAL_DISTANCE", meters: prev ?? 0 });
            }}
            onIncrement={() => {
              const next = DISTANCE_PRESETS.find((d) => d > state.totalDistanceM);
              dispatch({ type: "SET_TOTAL_DISTANCE", meters: next ?? state.totalDistanceM + 100 });
            }}
            onChange={(v) => dispatch({ type: "SET_TOTAL_DISTANCE", meters: v })}
          />
          <PresetDistanceField
            label="Splits tous les"
            value={state.splitDistanceM}
            presets={SPLIT_PRESETS}
            minValue={25}
            inputWidth="w-14"
            onDecrement={() => {
              const prev = [...SPLIT_PRESETS].reverse().find((d) => d < state.splitDistanceM);
              dispatch({ type: "SET_SPLIT_DISTANCE", meters: prev ?? 25 });
            }}
            onIncrement={() => {
              const next = SPLIT_PRESETS.find((d) => d > state.splitDistanceM);
              dispatch({ type: "SET_SPLIT_DISTANCE", meters: next ?? state.splitDistanceM + 25 });
            }}
            onChange={(v) => dispatch({ type: "SET_SPLIT_DISTANCE", meters: v })}
          />
        </div>

        {/* Séparateur + section Avancé */}
        <div className="mt-3 border-t border-border/50 pt-3">
          <button
            type="button"
            onClick={toggleAdvanced}
            className="flex w-full items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            {advancedOpen
              ? <ChevronDown className="h-3.5 w-3.5 shrink-0" />
              : <ChevronRight className="h-3.5 w-3.5 shrink-0" />
            }
            <span>Avancé</span>
            {!advancedOpen && advancedSummary && (
              <span className="text-muted-foreground/60 font-normal">{advancedSummary}</span>
            )}
          </button>

          {advancedOpen && (
            <div className="mt-3 flex flex-col gap-4">
              {/* Séries */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Séries :</span>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon" className="h-10 w-10"
                    onClick={() => dispatch({ type: "SET_SERIES_COUNT", count: Math.max(0, state.seriesCount - 1) })}
                    disabled={state.seriesCount <= 0}
                  ><Minus className="h-3.5 w-3.5" /></Button>
                  <input type="text" inputMode="numeric" value={state.seriesCount || ""} placeholder="∞"
                    onChange={(e) => dispatch({ type: "SET_SERIES_COUNT", count: Number(e.target.value.replace(/\D/g, "")) || 0 })}
                    className="w-10 text-center font-mono text-sm font-bold bg-transparent border-b border-border outline-none focus:border-primary"
                  />
                  <Button variant="outline" size="icon" className="h-10 w-10"
                    onClick={() => dispatch({ type: "SET_SERIES_COUNT", count: state.seriesCount + 1 })}
                  ><Plus className="h-3.5 w-3.5" /></Button>
                </div>
              </div>

              {/* WaveConfigCards */}
              {activeWaves.length > 0 && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm text-muted-foreground">Par vague</span>
                    {(() => {
                      const customCount = state.waves.filter((w) => w.overrides !== null).length;
                      if (customCount === 0) return null;
                      return (
                        <span className="text-[10px] text-muted-foreground/70 italic">
                          {customCount} personnalisée{customCount > 1 ? "s" : ""}
                        </span>
                      );
                    })()}
                  </div>
                  <div className="flex flex-col gap-2">
                    {activeWaves.map((w) => (
                      <WaveConfigCard key={w} wave={w} state={state} dispatch={dispatch} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Lane sections ──────────────────────────── */}
      <div className="flex flex-col gap-3">
        {Array.from({ length: state.laneCount }, (_, i) => i + 1).map((lane) => {
          const swimmers = swimmersByLane(lane);
          const isEmpty = swimmers.length === 0;
          return (
            <div
              key={lane}
              className={`rounded-lg border bg-card p-3 transition-colors ${
                isEmpty ? "border-border/50 bg-card/40" : "border-border"
              }`}
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">
                  Ligne {lane}
                </span>
                {swimmers.length > 0 && (
                  <span className="text-[10px] text-muted-foreground/60 tabular-nums">
                    {swimmers.length} nageur{swimmers.length > 1 ? "s" : ""}
                  </span>
                )}
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

                {isEmpty && (
                  <p className="flex-1 py-1 text-xs italic text-muted-foreground/50 select-none">
                    Vide — appuyez sur + pour ajouter un nageur
                  </p>
                )}

                {swimmers.length < maxSwimmersPerLane && (
                  <button
                    type="button"
                    onClick={() => { setAddLane(lane); setSearch(""); }}
                    className="ml-auto flex h-10 items-center gap-1.5 rounded-md border border-dashed border-border px-3 text-xs text-muted-foreground hover:border-primary/50 hover:bg-muted hover:text-primary transition-colors cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Ajouter
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Ligne count + wave badges ─────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button
          variant="outline"
          size="icon"
          className="h-10 w-10"
          onClick={() => dispatch({ type: "SET_LANE_COUNT", count: state.laneCount - 1 })}
          disabled={state.laneCount <= 1}
        >
          <Minus className="h-4 w-4" />
        </Button>
        <span className="text-sm text-muted-foreground">
          {state.laneCount} ligne{state.laneCount > 1 ? "s" : ""}
        </span>
        <Button
          variant="outline"
          size="icon"
          className="h-10 w-10"
          onClick={() => dispatch({ type: "SET_LANE_COUNT", count: state.laneCount + 1 })}
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

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "team" | "club")} className="flex-1 flex flex-col overflow-hidden mt-4">
            <TabsList className="grid grid-cols-2 w-full h-auto p-1 gap-0.5">
              <TabsTrigger value="team" className="gap-1.5 py-2.5 text-xs">
                <Users className="h-3.5 w-3.5" />
                Mon équipe
              </TabsTrigger>
              <TabsTrigger value="club" className="gap-1.5 py-2.5 text-xs" disabled={!hasClubTab}>
                <Users className="h-3.5 w-3.5" />
                Tout le club
              </TabsTrigger>
            </TabsList>

            {/* Search input — shared across tabs */}
            <div className="relative mt-3">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            <TabsContent value="team" className="flex-1 overflow-y-auto">
              <div className="flex flex-col gap-4 pt-2">
                {/* Manuals section */}
                {manualsLoading ? (
                  <div className="flex items-center justify-center py-4 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                ) : filteredManuals.length > 0 ? (
                  <div>
                    <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <BookmarkPlus className="h-3 w-3" />
                      Mémorisés
                    </div>
                    <ul className="flex flex-col divide-y divide-border/60">
                      {filteredManuals.map((m) => {
                        const pulse = justAddedManual === m.id;
                        return (
                          <li key={m.id} className="flex items-center group">
                            <button
                              type="button"
                              disabled={laneFull}
                              onClick={() => handleAddManual(m)}
                              className={`flex flex-1 min-h-[48px] items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors ${
                                laneFull
                                  ? "cursor-not-allowed text-muted-foreground/40"
                                  : "hover:bg-muted active:bg-muted/60"
                              }`}
                            >
                              <SwimmerAvatar
                                swimmer={{ displayName: m.displayName, avatarUrl: null }}
                                size="sm"
                                className="shrink-0"
                              />
                              <span className="flex-1 truncate">{m.displayName}</span>
                              {pulse && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-green-600 dark:text-green-400 shrink-0 animate-in fade-in slide-in-from-right-1 duration-300">
                                  <Check className="h-3 w-3" />
                                  ajouté
                                </span>
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => m.manualId && delManualMutation.mutate(m.manualId)}
                              disabled={delManualMutation.isPending}
                              className="flex h-11 w-11 shrink-0 items-center justify-center text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors disabled:opacity-40"
                              aria-label={`Supprimer ${m.displayName}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}

                {/* Grouped athlete list (coach's linked accounts) */}
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
                                <SwimmerAvatar
                                  swimmer={{ displayName: a.display_name, avatarUrl: a.avatar_url ?? null }}
                                  size="sm"
                                  className="mr-2 shrink-0"
                                />
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
                  {!manualsLoading && filteredManuals.length === 0 && groupedAthletes.size === 0 && (
                    <div className="flex flex-col items-center gap-3 py-8 px-4 text-center">
                      <p className="text-sm text-muted-foreground">
                        {search ? "Aucun nageur trouvé" : "Aucun nageur dans votre équipe"}
                      </p>
                      {!search && hasClubTab && (
                        <button
                          type="button"
                          onClick={() => setActiveTab("club")}
                          className="text-xs text-primary hover:underline cursor-pointer"
                        >
                          Voir tout le club →
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Manage manuals link */}
                <a
                  href="#/coach?section=swimmers&action=new-manual"
                  className="inline-flex items-center justify-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Gérer mon équipe →
                </a>
              </div>
            </TabsContent>

            <TabsContent value="club" className="flex-1 overflow-y-auto">
              <div className="flex flex-col gap-4 pt-2">
                {/* All-club athlete list */}
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
                                <SwimmerAvatar
                                  swimmer={{ displayName: a.display_name, avatarUrl: a.avatar_url ?? null }}
                                  size="sm"
                                  className="mr-2 shrink-0"
                                />
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
            <Button onClick={closeAddSheet} className="gap-1.5 shrink-0">
              <Check className="h-4 w-4" />
              Terminé
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Sticky footer — résumé + Lancer ── */}
      <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-border bg-background/90 backdrop-blur-sm px-4 py-3 flex items-center justify-between gap-4">
        <p className={`text-sm truncate ${
          state.swimmers.length === 0
            ? "text-muted-foreground/60 italic"
            : "text-muted-foreground"
        }`}>
          {footerSummary}
        </p>
        <Button
          disabled={state.swimmers.length === 0}
          onClick={() => dispatch({ type: "START_RACE" })}
          className="gap-2 shrink-0"
        >
          <Play className="h-4 w-4" />
          Lancer
        </Button>
      </div>
    </div>
  );
}

// ── PresetDistanceField — reusable stepper + chip row for a distance value ──

function PresetDistanceField({
  label,
  value,
  presets,
  minValue,
  suffix = "m",
  inputWidth,
  onDecrement,
  onIncrement,
  onChange,
}: {
  label: string;
  value: number;
  presets: readonly number[];
  minValue: number;
  suffix?: string;
  inputWidth: string;
  onDecrement: () => void;
  onIncrement: () => void;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon" className="h-10 w-10"
          onClick={onDecrement}
          disabled={value <= minValue}
        ><Minus className="h-3.5 w-3.5" /></Button>
        <input
          type="text" inputMode="numeric"
          value={value || ""} placeholder="—"
          onChange={(e) => onChange(Number(e.target.value.replace(/\D/g, "")) || 0)}
          className={`${inputWidth} text-center font-mono text-sm font-bold bg-transparent border-b border-border outline-none focus:border-primary`}
        />
        <span className="text-xs text-muted-foreground">{suffix}</span>
        <Button variant="outline" size="icon" className="h-10 w-10"
          onClick={onIncrement}
        ><Plus className="h-3.5 w-3.5" /></Button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {presets.map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={value === d}
            aria-label={`${label} ${d} ${suffix}`}
            onClick={() => onChange(d)}
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors cursor-pointer ${
              value === d
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {d} {suffix}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── WaveConfigCard — per-wave interval + optional override ──
// Compact by default (chip + interval inputs + Personnaliser button).
// Expands to show seriesCount / totalDistanceM / splitDistanceM overrides.

function WaveConfigCard({
  wave,
  state,
  dispatch,
}: {
  wave: number;
  state: ChronoState;
  dispatch: React.Dispatch<ChronoAction>;
}) {
  const c = WAVE_COLORS[wave - 1];
  const waveState = state.waves.find((ws) => ws.wave === wave);
  if (!waveState) return null;

  const totalSec = waveState.departureIntervalSec;
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  const isCustom = waveState.overrides !== null;

  const updateInterval = (min: number, sec: number) => {
    dispatch({ type: "SET_WAVE_INTERVAL", wave, seconds: min * 60 + sec });
  };

  const activatePersonalize = () => {
    dispatch({
      type: "SET_WAVE_OVERRIDES",
      wave,
      overrides: {
        seriesCount: state.seriesCount,
        totalDistanceM: state.totalDistanceM,
        splitDistanceM: state.splitDistanceM,
      },
    });
  };

  const resetPersonalize = () => {
    dispatch({ type: "SET_WAVE_OVERRIDES", wave, overrides: null });
  };

  return (
    <div
      className={`rounded-lg border p-3 transition-colors ${
        isCustom ? `${c.border} bg-card` : "border-border bg-card/50"
      }`}
    >
      {/* Header row : chip + status + action */}
      <div className="flex items-center gap-2">
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold text-white ${c.dot}`}>
          {c.label}
        </span>
        {isCustom ? (
          <>
            <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${c.bg} ${c.border} ${c.text}`}>
              <Check className="h-2.5 w-2.5" />
              Personnalisée
            </span>
            <button
              type="button"
              onClick={resetPersonalize}
              className="ml-auto text-[11px] text-muted-foreground hover:text-destructive hover:underline transition-colors cursor-pointer"
            >
              Réinitialiser
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={activatePersonalize}
            className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <Pencil className="h-3 w-3" />
            Personnaliser
          </button>
        )}
      </div>

      {/* Interval row — always visible */}
      <div className="mt-2 flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground">Départ toutes les</span>
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

      {/* Override row — visible only when personalized */}
      {isCustom && waveState.overrides && (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border/50 pt-2">
          <WaveOverrideField
            wave={wave}
            field="seriesCount"
            value={waveState.overrides.seriesCount ?? state.seriesCount}
            placeholder="∞"
            width="w-10"
            suffix="×"
            dispatch={dispatch}
          />
          <WaveOverrideField
            wave={wave}
            field="totalDistanceM"
            value={waveState.overrides.totalDistanceM ?? state.totalDistanceM}
            placeholder="—"
            width="w-16"
            suffix="m"
            dispatch={dispatch}
          />
          <span className="text-xs text-muted-foreground">splits à</span>
          <WaveOverrideField
            wave={wave}
            field="splitDistanceM"
            value={waveState.overrides.splitDistanceM ?? state.splitDistanceM}
            placeholder="50"
            width="w-14"
            suffix="m"
            dispatch={dispatch}
          />
        </div>
      )}
    </div>
  );
}

// ── Single override field (unitary SET_WAVE_OVERRIDE_FIELD dispatcher) ──

function WaveOverrideField({
  wave,
  field,
  value,
  placeholder,
  width,
  suffix,
  dispatch,
}: {
  wave: number;
  field: "seriesCount" | "totalDistanceM" | "splitDistanceM";
  value: number;
  placeholder: string;
  width: string;
  suffix: string;
  dispatch: React.Dispatch<ChronoAction>;
}) {
  return (
    <div className="inline-flex items-center gap-1">
      <input
        type="text"
        inputMode="numeric"
        value={value || ""}
        placeholder={placeholder}
        onChange={(e) =>
          dispatch({
            type: "SET_WAVE_OVERRIDE_FIELD",
            wave,
            field,
            value: Number(e.target.value.replace(/\D/g, "")) || 0,
          })
        }
        className={`${width} text-center font-mono text-sm font-bold bg-transparent border-b border-border outline-none focus:border-primary`}
      />
      <span className="text-xs text-muted-foreground">{suffix}</span>
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
        <SwimmerAvatar
          swimmer={{ displayName: swimmer.displayName, avatarUrl: swimmer.avatarUrl }}
          size="xs"
          className="shrink-0"
        />

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
          className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold cursor-pointer hover:opacity-80 transition-opacity ${c.bg} ${c.border} ${c.text}`}
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
