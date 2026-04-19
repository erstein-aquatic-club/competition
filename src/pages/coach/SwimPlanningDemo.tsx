/**
 * SwimPlanningDemo.tsx — Swim training planner for coaches
 * Vertical timeline of weeks with expandable micro-grids for filiere assignment.
 * Route: /#/coach/swim-planning
 */
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { SwimPlanningSlot, SwimPlanningSlotInput, GroupSummary, SwimSessionTemplate, Competition } from "@/lib/api/types";
import type { EffectiveSlot } from "@/lib/swimPlanningMerge";
import { FILIERES, FILIERE_STYLES } from "@/lib/swimFilieres";
import { lazyWithRetry } from "@/lib/lazyWithRetry";

const FilieresEditor = lazyWithRetry(() => import("./FilieresEditor"));
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Check,
  Eye,
  Link2,
  Search,
  Settings2,
  Trash2,
  Trophy,
  Unlink,
  Waves,
} from "lucide-react";
import SwimPlanningAthleteView from "./SwimPlanningAthleteView";
import SwimPlanningTimeline from "@/components/coach/swim/SwimPlanningTimeline";
import {
  DAY_ROWS,
  generateWeeks,
  getMonday,
  type WeekInfo,
} from "@/components/coach/swim/swimPlanningShared";

/* ═══════════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════════ */

/** localStorage meta for week (type + notes) — demo only */
function getWeekMeta(
  groupId: number,
  weekKey: string,
): { weekType?: string; notes?: string } {
  try {
    const raw = localStorage.getItem(`swim-plan-meta-${groupId}-${weekKey}`);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function setWeekMeta(
  groupId: number,
  weekKey: string,
  meta: { weekType?: string; notes?: string },
) {
  localStorage.setItem(
    `swim-plan-meta-${groupId}-${weekKey}`,
    JSON.stringify(meta),
  );
}

const INITIAL_WEEK_COUNT = 13; // current + 12 ahead
const LOAD_MORE_COUNT = 4;

/* ═══════════════════════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════════════════════ */

export default function SwimPlanningDemo() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // ── Group selection ──
  const { data: groups = [], isLoading: groupsLoading } = useQuery({
    queryKey: ["groups"],
    queryFn: () => api.getGroups(),
  });

  // Filter to permanent groups only
  const permanentGroups = useMemo(
    () => groups.filter((g) => !g.is_temporary),
    [groups],
  );

  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [showAthleteView, setShowAthleteView] = useState(false);
  const [showFiliereEditor, setShowFiliereEditor] = useState(false);

  // Auto-select first group
  useEffect(() => {
    if (permanentGroups.length > 0 && selectedGroupId === null) {
      setSelectedGroupId(permanentGroups[0].id);
    }
  }, [permanentGroups, selectedGroupId]);

  // ── Week generation (infinite scroll) ──
  const startMonday = useMemo(() => getMonday(new Date()), []);
  const [weekCount, setWeekCount] = useState(INITIAL_WEEK_COUNT);
  const weeks = useMemo(
    () => generateWeeks(startMonday, weekCount),
    [startMonday, weekCount],
  );
  const visibleWeekKeys = useMemo(() => weeks.map((w) => w.weekKey), [weeks]);

  // Sentinel ref for infinite scroll
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setWeekCount((c) => c + LOAD_MORE_COUNT);
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // ── Swim planning slots ──
  const {
    data: slots = [],
    isLoading: slotsLoading,
  } = useQuery({
    queryKey: ["swim-planning-slots", selectedGroupId, visibleWeekKeys],
    queryFn: () =>
      api.getSwimPlanningSlots({
        groupId: selectedGroupId!,
        weekStarts: visibleWeekKeys,
      }),
    enabled: !!selectedGroupId && visibleWeekKeys.length > 0,
  });

  // Index slots by weekKey for fast lookup
  const slotsByWeek = useMemo(() => {
    const map = new Map<string, SwimPlanningSlot[]>();
    for (const s of slots) {
      const arr = map.get(s.week_start) ?? [];
      arr.push(s);
      map.set(s.week_start, arr);
    }
    return map;
  }, [slots]);

  // ── Competitions (context for filière training) ──
  const { data: allCompetitions = [] } = useQuery({
    queryKey: ["competitions"],
    queryFn: () => api.getCompetitions(),
  });

  // Group competitions by week key (Monday ISO). Multi-day comps span all weeks they touch.
  const competitionsByWeek = useMemo(() => {
    const map = new Map<string, Competition[]>();
    for (const c of allCompetitions) {
      if (!c.date) continue;
      const start = new Date(c.date.slice(0, 10) + "T00:00:00");
      const end = c.end_date
        ? new Date(c.end_date.slice(0, 10) + "T00:00:00")
        : start;
      const cursor = getMonday(start);
      const endMonday = getMonday(end);
      while (cursor.getTime() <= endMonday.getTime()) {
        const key = cursor.toISOString().split("T")[0];
        const arr = map.get(key) ?? [];
        arr.push(c);
        map.set(key, arr);
        cursor.setDate(cursor.getDate() + 7);
      }
    }
    return map;
  }, [allCompetitions]);

  const getDayCompetitions = useCallback(
    (weekMonday: Date, dayIndex: number): Competition[] => {
      const d = new Date(weekMonday);
      d.setDate(weekMonday.getDate() + dayIndex);
      d.setHours(0, 0, 0, 0);
      const t = d.getTime();
      return allCompetitions.filter((c) => {
        if (!c.date) return false;
        const start = new Date(c.date.slice(0, 10) + "T00:00:00").getTime();
        const end = c.end_date
          ? new Date(c.end_date.slice(0, 10) + "T00:00:00").getTime()
          : start;
        return t >= start && t <= end;
      });
    },
    [allCompetitions],
  );

  const [selectedCompetition, setSelectedCompetition] = useState<Competition | null>(null);

  // ── Expanded week ──
  const [expandedWeekKey, setExpandedWeekKey] = useState<string | null>(null);

  // ── Editing week meta ──
  const [editingWeekKey, setEditingWeekKey] = useState<string | null>(null);
  const [editWeekType, setEditWeekType] = useState("");
  const [editWeekNotes, setEditWeekNotes] = useState("");
  // Bump to force re-reads from localStorage
  const [metaVersion, setMetaVersion] = useState(0);

  // Collect existing week types for datalist
  const existingWeekTypes = useMemo(() => {
    if (!selectedGroupId) return [];
    const types = new Set<string>();
    for (const w of weeks) {
      const meta = getWeekMeta(selectedGroupId, w.weekKey);
      if (meta.weekType) types.add(meta.weekType);
    }
    return Array.from(types).sort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weeks, selectedGroupId, metaVersion]);

  const handleStartEditMeta = (weekKey: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!selectedGroupId) return;
    const meta = getWeekMeta(selectedGroupId, weekKey);
    setEditWeekType(meta.weekType ?? "");
    setEditWeekNotes(meta.notes ?? "");
    setEditingWeekKey(weekKey);
  };

  const handleSaveMeta = () => {
    if (!editingWeekKey || !selectedGroupId) return;
    setWeekMeta(selectedGroupId, editingWeekKey, {
      weekType: editWeekType.trim() || undefined,
      notes: editWeekNotes.trim() || undefined,
    });
    setEditingWeekKey(null);
    setMetaVersion((v) => v + 1);
  };

  const handleCancelEditMeta = () => {
    setEditingWeekKey(null);
  };

  // Bridge the timeline's getWeekMeta(weekKey) signature to our (groupId, weekKey) storage
  const getWeekMetaForTimeline = useCallback(
    (weekKey: string): { weekType?: string; notes?: string; source?: "group" | "athlete" | "none" } => {
      if (!selectedGroupId) return {};
      // metaVersion intentionally referenced to re-run memoized consumers after save
      void metaVersion;
      return getWeekMeta(selectedGroupId, weekKey);
    },
    [selectedGroupId, metaVersion],
  );

  // ── Filiere sheet ──
  const [filiereSheet, setFiliereSheet] = useState<{
    weekKey: string;
    dayIndex: number;
    timeSlot: "morning" | "evening";
    existingSlot?: SwimPlanningSlot;
  } | null>(null);

  const upsertMutation = useMutation({
    mutationFn: (input: SwimPlanningSlotInput) =>
      api.upsertSwimPlanningSlot(input),
    onSuccess: () => {
      setFiliereSheet(null);
      void queryClient.invalidateQueries({
        queryKey: ["swim-planning-slots"],
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Erreur",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteSwimPlanningSlot(id),
    onSuccess: () => {
      setFiliereSheet(null);
      void queryClient.invalidateQueries({
        queryKey: ["swim-planning-slots"],
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Erreur",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  // ── Swim catalog (for session linking) ──
  const { data: swimCatalog = [] } = useQuery({
    queryKey: ["swim-catalog"],
    queryFn: () => api.getSwimCatalog(),
    staleTime: 5 * 60_000,
  });

  // Sessions grouped by date (most recent first), already sorted by API
  const catalogByDate = useMemo(() => {
    const groups: { label: string; sessions: SwimSessionTemplate[] }[] = [];
    const map = new Map<string, SwimSessionTemplate[]>();
    for (const s of swimCatalog) {
      if (s.is_archived) continue;
      const dateKey = s.created_at?.split("T")[0] ?? "unknown";
      const arr = map.get(dateKey) ?? [];
      arr.push(s);
      map.set(dateKey, arr);
    }
    for (const [dateKey, sessions] of map) {
      const d = new Date(dateKey + "T00:00:00");
      const label = d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
      groups.push({ label, sessions });
    }
    return groups;
  }, [swimCatalog]);

  // Session picker state
  const [sessionPickerSlot, setSessionPickerSlot] = useState<{
    weekKey: string;
    dayIndex: number;
    timeSlot: "morning" | "evening";
    currentSessionId?: string | null;
  } | null>(null);
  const [sessionSearch, setSessionSearch] = useState("");

  const filteredCatalog = useMemo(() => {
    if (!sessionSearch.trim()) return catalogByDate;
    const q = sessionSearch.toLowerCase();
    return catalogByDate
      .map((g) => ({
        ...g,
        sessions: g.sessions.filter((s) => s.name.toLowerCase().includes(q)),
      }))
      .filter((g) => g.sessions.length > 0);
  }, [catalogByDate, sessionSearch]);

  // Map session IDs to names for display
  const sessionNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of swimCatalog) {
      map.set(String(s.id), s.name);
    }
    return map;
  }, [swimCatalog]);

  const handleSelectFiliere = (filiereId: string) => {
    if (!filiereSheet || !selectedGroupId) return;
    upsertMutation.mutate({
      group_id: selectedGroupId,
      week_start: filiereSheet.weekKey,
      day_of_week: filiereSheet.dayIndex,
      time_slot: filiereSheet.timeSlot,
      filiere: filiereId,
      session_id: filiereSheet.existingSlot?.session_id ?? null,
    });
  };

  const handleDeleteSlot = () => {
    if (!filiereSheet?.existingSlot) return;
    deleteMutation.mutate(filiereSheet.existingSlot.id);
  };

  const handleLinkSession = (sessionId: number) => {
    if (!sessionPickerSlot || !selectedGroupId) return;
    // Find the existing slot to get the filiere
    const existing = findSlot(sessionPickerSlot.weekKey, sessionPickerSlot.dayIndex, sessionPickerSlot.timeSlot);
    if (!existing) return;
    upsertMutation.mutate({
      group_id: selectedGroupId,
      week_start: sessionPickerSlot.weekKey,
      day_of_week: sessionPickerSlot.dayIndex,
      time_slot: sessionPickerSlot.timeSlot,
      filiere: existing.filiere,
      session_id: String(sessionId),
    });
    setSessionPickerSlot(null);
  };

  const handleUnlinkSession = () => {
    if (!sessionPickerSlot || !selectedGroupId) return;
    const existing = findSlot(sessionPickerSlot.weekKey, sessionPickerSlot.dayIndex, sessionPickerSlot.timeSlot);
    if (!existing) return;
    upsertMutation.mutate({
      group_id: selectedGroupId,
      week_start: sessionPickerSlot.weekKey,
      day_of_week: sessionPickerSlot.dayIndex,
      time_slot: sessionPickerSlot.timeSlot,
      filiere: existing.filiere,
      session_id: null,
    });
    setSessionPickerSlot(null);
  };

  // ── Find slot for a given cell ──
  const findSlot = useCallback(
    (
      weekKey: string,
      dayIndex: number,
      timeSlot: "morning" | "evening",
    ): SwimPlanningSlot | undefined => {
      const weekSlots = slotsByWeek.get(weekKey);
      if (!weekSlots) return undefined;
      return weekSlots.find(
        (s) => s.day_of_week === dayIndex && s.time_slot === timeSlot,
      );
    },
    [slotsByWeek],
  );

  // ── Loading / empty states ──

  if (groupsLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-lg border-b px-4 py-3">
          <div className="h-7 w-56 rounded-lg bg-muted animate-pulse" />
          <div className="h-9 w-40 mt-2 rounded-lg bg-muted animate-pulse" />
        </div>
        <div className="px-4 pt-4 space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="rounded-xl border p-3 animate-pulse motion-reduce:animate-none"
            >
              <div className="h-4 w-36 rounded bg-muted" />
              <div className="h-3 w-24 mt-2 rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (permanentGroups.length === 0) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Header groups={[]} selectedGroupId={null} onSelectGroup={() => {}} />
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <div className="h-16 w-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
            <Waves className="h-8 w-8 text-muted-foreground/30" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">
            Aucun groupe disponible
          </p>
          <p className="text-xs text-muted-foreground/60 mt-1.5 max-w-[260px]">
            Crée un groupe dans l'administration pour commencer la
            planification.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* ── Header ── */}
      <Header
        groups={permanentGroups}
        selectedGroupId={selectedGroupId}
        onSelectGroup={setSelectedGroupId}
        onShowAthleteView={() => setShowAthleteView(true)}
        onShowFiliereEditor={() => setShowFiliereEditor(true)}
      />

      {/* ── Timeline ── */}
      <SwimPlanningTimeline
        mode="group"
        weeks={weeks}
        slotsByWeek={slotsByWeek as Map<string, EffectiveSlot[]>}
        competitionsByWeek={competitionsByWeek}
        expandedWeekKey={expandedWeekKey}
        onToggleWeek={(weekKey) =>
          setExpandedWeekKey((current) => (current === weekKey ? null : weekKey))
        }
        getWeekMeta={getWeekMetaForTimeline}
        editingWeekKey={editingWeekKey}
        editWeekType={editWeekType}
        editWeekNotes={editWeekNotes}
        existingWeekTypes={existingWeekTypes}
        onStartEditMeta={handleStartEditMeta}
        onSaveMeta={handleSaveMeta}
        onCancelEditMeta={handleCancelEditMeta}
        onEditTypeChange={setEditWeekType}
        onEditNotesChange={setEditWeekNotes}
        onSlotClick={(weekKey, dayIndex, timeSlot, slot) => {
          // slot is EffectiveSlot | undefined from the timeline; re-find the
          // SwimPlanningSlot from local state so the filiere sheet can edit it.
          const existing = slot
            ? findSlot(weekKey, dayIndex, timeSlot)
            : undefined;
          setFiliereSheet({
            weekKey,
            dayIndex,
            timeSlot,
            existingSlot: existing,
          });
        }}
        onSessionPickerClick={(weekKey, dayIndex, timeSlot, currentSessionId) => {
          const existing = findSlot(weekKey, dayIndex, timeSlot);
          if (!existing) return;
          setSessionPickerSlot({
            weekKey,
            dayIndex,
            timeSlot,
            currentSessionId: currentSessionId ?? existing.session_id,
          });
          setSessionSearch("");
        }}
        onCompetitionClick={setSelectedCompetition}
        getDayCompetitions={getDayCompetitions}
        sessionNameMap={sessionNameMap}
        sentinelRef={sentinelRef}
        isLoading={slotsLoading}
        isEmpty={slots.length === 0}
      />

      {/* ── Filiere bottom sheet ── */}
      <Sheet
        open={!!filiereSheet}
        onOpenChange={(open) => !open && setFiliereSheet(null)}
      >
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[85dvh]">
          <SheetHeader className="pb-2">
            <SheetTitle className="text-base">
              {filiereSheet?.existingSlot
                ? "Modifier la filiere"
                : "Choisir une filiere"}
            </SheetTitle>
            <SheetDescription className="text-xs text-muted-foreground">
              {filiereSheet
                ? `${DAY_ROWS[filiereSheet.dayIndex]?.label ?? ""} ${filiereSheet.timeSlot === "morning" ? "Matin" : "Soir"}`
                : ""}
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-1.5 pt-2 pb-4 overflow-y-auto">
            {FILIERES.map((f) => {
              const style = FILIERE_STYLES[f.color] ?? FILIERE_STYLES.sky;
              const isSelected =
                filiereSheet?.existingSlot?.filiere === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  className={cn(
                    "w-full flex items-center gap-3 rounded-xl px-3.5 py-3 text-left transition-all min-h-[48px]",
                    "active:scale-[0.98]",
                    isSelected
                      ? cn(style.bg, "ring-2 ring-primary/30")
                      : "hover:bg-muted/50",
                  )}
                  onClick={() => handleSelectFiliere(f.id)}
                  disabled={upsertMutation.isPending}
                >
                  <span
                    className={cn(
                      "h-3 w-3 rounded-full shrink-0",
                      style.dot,
                    )}
                  />
                  <span className="flex-1 min-w-0">
                    <span
                      className={cn(
                        "text-sm font-medium block",
                        isSelected ? style.text : "text-foreground",
                      )}
                    >
                      {f.name}
                    </span>
                  </span>
                  {isSelected && (
                    <Check className="h-4 w-4 text-primary shrink-0" />
                  )}
                </button>
              );
            })}

            {/* Link session + Delete options */}
            {filiereSheet?.existingSlot && (
              <>
                <div className="h-px bg-border my-2" />
                <button
                  type="button"
                  className="w-full flex items-center gap-3 rounded-xl px-3.5 py-3 text-left transition-all min-h-[48px] text-primary hover:bg-primary/10 active:scale-[0.98]"
                  onClick={() => {
                    const slot = filiereSheet.existingSlot!;
                    setSessionPickerSlot({
                      weekKey: filiereSheet.weekKey,
                      dayIndex: filiereSheet.dayIndex,
                      timeSlot: filiereSheet.timeSlot,
                      currentSessionId: slot.session_id,
                    });
                    setSessionSearch("");
                    setFiliereSheet(null);
                  }}
                >
                  <Link2 className="h-4 w-4 shrink-0" />
                  <span className="text-sm font-medium">
                    {filiereSheet.existingSlot.session_id ? "Modifier la séance liée" : "Lier une séance"}
                  </span>
                </button>
                <button
                  type="button"
                  className="w-full flex items-center gap-3 rounded-xl px-3.5 py-3 text-left transition-all min-h-[48px] text-destructive hover:bg-destructive/10 active:scale-[0.98]"
                  onClick={handleDeleteSlot}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="h-4 w-4 shrink-0" />
                  <span className="text-sm font-medium">Supprimer</span>
                </button>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Session picker bottom sheet ── */}
      <Sheet
        open={!!sessionPickerSlot}
        onOpenChange={(open) => !open && setSessionPickerSlot(null)}
      >
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[85dvh] flex flex-col">
          <SheetHeader className="pb-2 shrink-0">
            <SheetTitle className="text-base">Lier une séance</SheetTitle>
            <SheetDescription className="text-xs text-muted-foreground">
              Catalogue de séances natation
            </SheetDescription>
          </SheetHeader>

          {/* Search bar */}
          <div className="relative shrink-0 mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
            <Input
              className="pl-9 h-9 text-sm"
              placeholder="Rechercher une séance..."
              value={sessionSearch}
              onChange={(e) => setSessionSearch(e.target.value)}
            />
          </div>

          {/* Session list */}
          <div className="flex-1 overflow-y-auto -mx-1 px-1 pb-4 space-y-4">
            {/* Unlink option */}
            {sessionPickerSlot?.currentSessionId && (
              <button
                type="button"
                className="w-full flex items-center gap-3 rounded-xl px-3.5 py-3 text-left transition-all min-h-[48px] text-destructive hover:bg-destructive/10 active:scale-[0.98] border border-dashed border-destructive/30"
                onClick={handleUnlinkSession}
              >
                <Unlink className="h-4 w-4 shrink-0" />
                <span className="text-sm font-medium">Délier la séance</span>
              </button>
            )}

            {filteredCatalog.length === 0 ? (
              <div className="text-center py-8">
                <Waves className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Aucune séance trouvée</p>
              </div>
            ) : (
              filteredCatalog.map((group) => (
                <div key={group.label}>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 px-1">
                    {group.label}
                  </p>
                  <div className="space-y-1">
                    {group.sessions.map((s) => {
                      const isLinked = sessionPickerSlot?.currentSessionId === String(s.id);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          className={cn(
                            "w-full flex items-center gap-3 rounded-xl px-3.5 py-3 text-left transition-all min-h-[48px] active:scale-[0.98]",
                            isLinked
                              ? "bg-primary/10 ring-2 ring-primary/30"
                              : "hover:bg-muted/50",
                          )}
                          onClick={() => handleLinkSession(s.id)}
                          disabled={upsertMutation.isPending}
                        >
                          <Waves className="h-4 w-4 text-muted-foreground/50 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium block truncate">
                              {s.name}
                            </span>
                            {s.description && (
                              <span className="text-[11px] text-muted-foreground line-clamp-1">
                                {s.description}
                              </span>
                            )}
                          </div>
                          {isLinked && (
                            <Check className="h-4 w-4 text-primary shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Athlete Preview Overlay ── */}
      <SwimPlanningAthleteView
        open={showAthleteView}
        onClose={() => setShowAthleteView(false)}
        groupId={selectedGroupId!}
      />

      {/* ── Filières Editor Overlay (lazy-loaded) ── */}
      {showFiliereEditor && (
        <Suspense fallback={null}>
          <FilieresEditor
            open={showFiliereEditor}
            onClose={() => setShowFiliereEditor(false)}
          />
        </Suspense>
      )}

      {/* ── Competition Detail Sheet ── */}
      <Sheet
        open={!!selectedCompetition}
        onOpenChange={(o) => !o && setSelectedCompetition(null)}
      >
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[70dvh] overflow-y-auto">
          <SheetHeader className="pb-0">
            <SheetTitle className="sr-only">
              {selectedCompetition?.name ?? "Compétition"}
            </SheetTitle>
            <SheetDescription className="sr-only">
              Détails de la compétition
            </SheetDescription>
          </SheetHeader>
          {selectedCompetition && (
            <div className="space-y-4 pb-6">
              <div className="flex items-center gap-2.5">
                <Trophy className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <h3 className="text-[15px] font-semibold text-foreground">
                  {selectedCompetition.name}
                </h3>
              </div>
              <div className="text-[13px] text-foreground/80 space-y-1">
                <div>
                  <span className="text-muted-foreground">Date : </span>
                  {new Date(
                    selectedCompetition.date.slice(0, 10) + "T00:00:00",
                  ).toLocaleDateString("fr-FR", {
                    weekday: "long",
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                  })}
                  {selectedCompetition.end_date &&
                    selectedCompetition.end_date !== selectedCompetition.date && (
                      <>
                        {" → "}
                        {new Date(
                          selectedCompetition.end_date.slice(0, 10) + "T00:00:00",
                        ).toLocaleDateString("fr-FR", {
                          weekday: "long",
                          day: "2-digit",
                          month: "long",
                          year: "numeric",
                        })}
                      </>
                    )}
                </div>
                {selectedCompetition.location && (
                  <div>
                    <span className="text-muted-foreground">Lieu : </span>
                    {selectedCompetition.location}
                  </div>
                )}
              </div>
              {selectedCompetition.description && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 mb-1">
                    Description
                  </p>
                  <p className="text-[13px] text-foreground/80 leading-relaxed whitespace-pre-line">
                    {selectedCompetition.description}
                  </p>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Header
   ═══════════════════════════════════════════════════════════════════ */

function Header({
  groups,
  selectedGroupId,
  onSelectGroup,
  onShowAthleteView,
  onShowFiliereEditor,
}: {
  groups: GroupSummary[];
  selectedGroupId: number | null;
  onSelectGroup: (id: number) => void;
  onShowAthleteView?: () => void;
  onShowFiliereEditor?: () => void;
}) {
  return (
    <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-lg border-b">
      <div className="px-4 pt-3 pb-3">
        <div className="flex items-center gap-2.5">
          <h1 className="text-lg font-bold tracking-tight text-foreground">
            Planification Natation
          </h1>
          <Badge
            variant="secondary"
            className="text-[10px] px-1.5 py-0 font-semibold uppercase tracking-wider bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-0"
          >
            Demo
          </Badge>
          <div className="flex items-center gap-1 ml-auto">
            {onShowFiliereEditor && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={onShowFiliereEditor}
                aria-label="Paramétrer les filières"
              >
                <Settings2 className="h-3.5 w-3.5" />
              </Button>
            )}
            {onShowAthleteView && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={onShowAthleteView}
              >
                <Eye className="h-3.5 w-3.5" />
                Vue nageur
              </Button>
            )}
          </div>
        </div>

        {groups.length > 0 && (
          <div className="mt-2">
            <Select
              value={selectedGroupId?.toString() ?? ""}
              onValueChange={(v) => onSelectGroup(Number(v))}
            >
              <SelectTrigger className="w-auto min-w-[160px] h-9 text-sm bg-muted/40 border-muted-foreground/10">
                <SelectValue placeholder="Choisir un groupe" />
              </SelectTrigger>
              <SelectContent>
                {groups.map((g) => (
                  <SelectItem key={g.id} value={g.id.toString()}>
                    {g.name}
                    {g.member_count != null && (
                      <span className="text-muted-foreground ml-1.5">
                        ({g.member_count})
                      </span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    </div>
  );
}

export type { WeekInfo };
