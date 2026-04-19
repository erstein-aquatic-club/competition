/**
 * SwimPlanningDemo.tsx — Swim training planner for coaches
 * Vertical timeline of weeks with expandable micro-grids for filiere assignment.
 * Route: /#/coach/swim-planning
 */
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  SwimPlanningSlot,
  GroupSummary,
  SwimSessionTemplate,
  Competition,
  AthleteSummary,
} from "@/lib/api/types";
import type { EffectiveSlot } from "@/lib/swimPlanningMerge";
import { FILIERES, FILIERE_STYLES } from "@/lib/swimFilieres";
import { lazyWithRetry } from "@/lib/lazyWithRetry";
import { useSwimPlanningAthleteMode } from "@/hooks/coach/useSwimPlanningAthleteMode";

const FilieresEditor = lazyWithRetry(() => import("./FilieresEditor"));
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  ArrowLeft,
  Check,
  Eye,
  Link2,
  Search,
  Settings2,
  Trash2,
  Trophy,
  Unlink,
  Users,
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
   Constants
   ═══════════════════════════════════════════════════════════════════ */

const INITIAL_WEEK_COUNT = 13; // current + 12 ahead
const LOAD_MORE_COUNT = 4;

/* ═══════════════════════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════════════════════ */

export default function SwimPlanningDemo() {
  const { toast } = useToast();

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

  // ── Athlete mode: selection + merged slots + week meta + routed writes ──
  const {
    selectedAthleteId,
    setSelectedAthleteId,
    selectedAthlete,
    groupAthletes,
    effectiveSlotsByWeek,
    getEffectiveWeekMeta,
    existingWeekTypes,
    writeSlot,
    deleteSlot,
    writeWeekMeta,
    isPending,
  } = useSwimPlanningAthleteMode({
    selectedGroupId,
    visibleWeekKeys,
    groupSlotsByWeek: slotsByWeek,
  });

  // ── Competitions (context for filière training) ──
  const { data: allCompetitions = [] } = useQuery({
    queryKey: ["competitions"],
    queryFn: () => api.getCompetitions(),
  });

  // In athlete mode, filter to only that athlete's assigned competitions.
  const { data: athleteCompetitionIds = [] } = useQuery({
    queryKey: ["my-competition-ids", selectedAthleteId],
    queryFn: () => api.getMyCompetitionIds(selectedAthleteId),
    enabled: selectedAthleteId != null,
  });

  const visibleCompetitions = useMemo(() => {
    if (selectedAthleteId == null) return allCompetitions;
    return allCompetitions.filter((c) => athleteCompetitionIds.includes(c.id));
  }, [allCompetitions, athleteCompetitionIds, selectedAthleteId]);

  // Group competitions by week key (Monday ISO). Multi-day comps span all weeks they touch.
  const competitionsByWeek = useMemo(() => {
    const map = new Map<string, Competition[]>();
    for (const c of visibleCompetitions) {
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
  }, [visibleCompetitions]);

  const getDayCompetitions = useCallback(
    (weekMonday: Date, dayIndex: number): Competition[] => {
      const d = new Date(weekMonday);
      d.setDate(weekMonday.getDate() + dayIndex);
      d.setHours(0, 0, 0, 0);
      const t = d.getTime();
      return visibleCompetitions.filter((c) => {
        if (!c.date) return false;
        const start = new Date(c.date.slice(0, 10) + "T00:00:00").getTime();
        const end = c.end_date
          ? new Date(c.end_date.slice(0, 10) + "T00:00:00").getTime()
          : start;
        return t >= start && t <= end;
      });
    },
    [visibleCompetitions],
  );

  const [selectedCompetition, setSelectedCompetition] = useState<Competition | null>(null);

  // ── Expanded week ──
  const [expandedWeekKey, setExpandedWeekKey] = useState<string | null>(null);

  // ── Editing week meta ──
  const [editingWeekKey, setEditingWeekKey] = useState<string | null>(null);
  const [editWeekType, setEditWeekType] = useState("");
  const [editWeekNotes, setEditWeekNotes] = useState("");

  const handleStartEditMeta = (weekKey: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!selectedGroupId) return;
    const meta = getEffectiveWeekMeta(weekKey);
    setEditWeekType(meta.week_type ?? "");
    setEditWeekNotes(meta.notes ?? "");
    setEditingWeekKey(weekKey);
  };

  const handleSaveMeta = () => {
    if (!editingWeekKey) return;
    const weekType = editWeekType.trim() || null;
    const notes = editWeekNotes.trim() || null;
    writeWeekMeta(editingWeekKey, weekType, notes, {
      onSuccess: () => setEditingWeekKey(null),
      onError: (err: Error) => {
        toast({
          title: "Erreur",
          description: err.message,
          variant: "destructive",
        });
      },
    });
  };

  const handleCancelEditMeta = () => {
    setEditingWeekKey(null);
  };

  // Bridge the timeline's getWeekMeta(weekKey) signature to the effective
  // (merged) meta from DB.
  const getWeekMetaForTimeline = useCallback(
    (weekKey: string): {
      weekType?: string;
      notes?: string;
      source?: "group" | "athlete" | "none";
    } => {
      const m = getEffectiveWeekMeta(weekKey);
      return {
        weekType: m.week_type ?? undefined,
        notes: m.notes ?? undefined,
        source: m.source,
      };
    },
    [getEffectiveWeekMeta],
  );

  // ── Filiere sheet ──
  const [filiereSheet, setFiliereSheet] = useState<{
    weekKey: string;
    dayIndex: number;
    timeSlot: "morning" | "evening";
    existingSlot?: EffectiveSlot;
  } | null>(null);

  const onWriteError = useCallback(
    (err: Error) => {
      toast({
        title: "Erreur",
        description: err.message,
        variant: "destructive",
      });
    },
    [toast],
  );

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
    if (!filiereSheet) return;
    const sessionId = filiereSheet.existingSlot?.session_id ?? null;
    writeSlot(
      {
        weekKey: filiereSheet.weekKey,
        dayIndex: filiereSheet.dayIndex,
        timeSlot: filiereSheet.timeSlot,
        filiere: filiereId,
        session_id: sessionId,
        existingSlot: filiereSheet.existingSlot,
      },
      {
        onSuccess: () => setFiliereSheet(null),
        onError: onWriteError,
      },
    );
  };

  const handleDeleteSlot = () => {
    const existing = filiereSheet?.existingSlot;
    if (!existing) return;
    deleteSlot(existing, {
      onSuccess: () => setFiliereSheet(null),
      onError: onWriteError,
    });
  };

  const handleLinkSession = (sessionId: number) => {
    if (!sessionPickerSlot) return;
    const existing = findSlot(
      sessionPickerSlot.weekKey,
      sessionPickerSlot.dayIndex,
      sessionPickerSlot.timeSlot,
    );
    if (!existing) return;
    writeSlot(
      {
        weekKey: sessionPickerSlot.weekKey,
        dayIndex: sessionPickerSlot.dayIndex,
        timeSlot: sessionPickerSlot.timeSlot,
        filiere: existing.filiere,
        session_id: String(sessionId),
        existingSlot: existing,
      },
      {
        onSuccess: () => setSessionPickerSlot(null),
        onError: onWriteError,
      },
    );
  };

  const handleUnlinkSession = () => {
    if (!sessionPickerSlot) return;
    const existing = findSlot(
      sessionPickerSlot.weekKey,
      sessionPickerSlot.dayIndex,
      sessionPickerSlot.timeSlot,
    );
    if (!existing) return;
    writeSlot(
      {
        weekKey: sessionPickerSlot.weekKey,
        dayIndex: sessionPickerSlot.dayIndex,
        timeSlot: sessionPickerSlot.timeSlot,
        filiere: existing.filiere,
        session_id: null,
        existingSlot: existing,
      },
      {
        onSuccess: () => setSessionPickerSlot(null),
        onError: onWriteError,
      },
    );
  };

  // ── Find slot for a given cell (effective — inheriting overrides in athlete mode) ──
  const findSlot = useCallback(
    (
      weekKey: string,
      dayIndex: number,
      timeSlot: "morning" | "evening",
    ): EffectiveSlot | undefined => {
      const weekSlots = effectiveSlotsByWeek.get(weekKey);
      if (!weekSlots) return undefined;
      return weekSlots.find(
        (s) => s.day_of_week === dayIndex && s.time_slot === timeSlot,
      );
    },
    [effectiveSlotsByWeek],
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
        groupAthletes={groupAthletes}
        selectedAthleteId={selectedAthleteId}
        selectedAthlete={selectedAthlete}
        onSelectAthlete={setSelectedAthleteId}
        onShowAthleteView={() => setShowAthleteView(true)}
        onShowFiliereEditor={() => setShowFiliereEditor(true)}
      />

      {/* ── Timeline ── */}
      <SwimPlanningTimeline
        mode={selectedAthleteId != null ? "athlete" : "group"}
        showOverrideBadge={selectedAthleteId != null}
        weeks={weeks}
        slotsByWeek={effectiveSlotsByWeek}
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
                  disabled={isPending}
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
                {/* Delete: only in group mode, OR in athlete mode if this cell is an override */}
                {(selectedAthleteId == null ||
                  filiereSheet.existingSlot.overridden === true) && (
                  <button
                    type="button"
                    className="w-full flex items-center gap-3 rounded-xl px-3.5 py-3 text-left transition-all min-h-[48px] text-destructive hover:bg-destructive/10 active:scale-[0.98]"
                    onClick={handleDeleteSlot}
                    disabled={isPending}
                  >
                    <Trash2 className="h-4 w-4 shrink-0" />
                    <span className="text-sm font-medium">
                      {selectedAthleteId != null
                        ? "Supprimer la filière individuelle"
                        : "Supprimer"}
                    </span>
                  </button>
                )}
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
                          disabled={isPending}
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
  groupAthletes = [],
  selectedAthleteId = null,
  selectedAthlete = null,
  onSelectAthlete,
  onShowAthleteView,
  onShowFiliereEditor,
}: {
  groups: GroupSummary[];
  selectedGroupId: number | null;
  onSelectGroup: (id: number) => void;
  groupAthletes?: AthleteSummary[];
  selectedAthleteId?: number | null;
  selectedAthlete?: AthleteSummary | null;
  onSelectAthlete?: (id: number | null) => void;
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

        {/* ── Athlete-mode banner ── */}
        {selectedAthlete && onSelectAthlete && (
          <div
            className="mt-2 flex items-center gap-2.5 rounded-xl border border-amber-200/70 bg-amber-50/70 dark:bg-amber-950/25 dark:border-amber-800/50 pl-2 pr-1.5 py-1.5 relative overflow-hidden"
            role="status"
            aria-live="polite"
          >
            <span
              aria-hidden
              className="absolute left-0 top-0 bottom-0 w-[3px] bg-amber-400/80 dark:bg-amber-500/70"
            />
            <Avatar className="h-7 w-7 ring-1 ring-amber-200/80 dark:ring-amber-800/60">
              {selectedAthlete.avatar_url && (
                <AvatarImage
                  src={selectedAthlete.avatar_url}
                  alt={selectedAthlete.display_name}
                />
              )}
              <AvatarFallback className="text-[10px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-100">
                {selectedAthlete.display_name
                  .split(/\s+/)
                  .map((p) => p[0])
                  .filter(Boolean)
                  .slice(0, 2)
                  .join("")
                  .toUpperCase() || "?"}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 min-w-0 leading-tight">
              <span className="block text-[13px] font-semibold text-amber-900 dark:text-amber-100 truncate">
                {selectedAthlete.display_name}
              </span>
              <span className="block text-[10px] font-medium uppercase tracking-wider text-amber-700/80 dark:text-amber-300/80">
                Plan individuel
              </span>
            </div>

            <button
              type="button"
              onClick={() => onSelectAthlete(null)}
              className="shrink-0 inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-medium text-amber-800 hover:text-amber-900 dark:text-amber-200 dark:hover:text-amber-100 bg-white/60 hover:bg-white dark:bg-amber-900/40 dark:hover:bg-amber-900/60 border border-amber-200/80 dark:border-amber-800/60 transition-colors active:scale-[0.97]"
              aria-label="Retour au plan du groupe"
            >
              <ArrowLeft className="h-3 w-3" />
              Retour plan groupe
            </button>
          </div>
        )}

        {groups.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
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

            {onSelectAthlete && (
              <>
                <span
                  aria-hidden
                  className="hidden sm:block h-4 w-px bg-border/70"
                />
                <Select
                  value={
                    selectedAthleteId ? String(selectedAthleteId) : "__group__"
                  }
                  onValueChange={(v) =>
                    onSelectAthlete(v === "__group__" ? null : Number(v))
                  }
                  disabled={groupAthletes.length === 0}
                >
                  <SelectTrigger
                    className={cn(
                      "w-auto min-w-[180px] h-9 text-sm border-muted-foreground/10",
                      selectedAthleteId
                        ? "bg-amber-50 text-amber-900 border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-100 dark:border-amber-800/60"
                        : "bg-muted/40 text-foreground",
                    )}
                  >
                    <SelectValue placeholder="Plan du groupe" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[60dvh]">
                    <SelectItem value="__group__">
                      <span className="flex items-center gap-2">
                        <Users className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-medium">Plan du groupe</span>
                      </span>
                    </SelectItem>
                    {groupAthletes.length > 0 && (
                      <div className="px-2 pt-1.5 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                        Nageurs du groupe
                      </div>
                    )}
                    {groupAthletes.map((a) =>
                      a.id == null ? null : (
                        <SelectItem key={a.id} value={String(a.id)}>
                          {a.display_name}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export type { WeekInfo };
