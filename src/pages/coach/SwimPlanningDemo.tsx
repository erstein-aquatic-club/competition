/**
 * SwimPlanningDemo.tsx — Swim training planner for coaches
 * Vertical timeline of weeks with expandable micro-grids for filiere assignment.
 * Route: /#/coach/swim-planning
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/lib/api";
import type { SwimPlanningSlot, SwimPlanningSlotInput, GroupSummary, SwimSessionTemplate, SwimFiliere, Competition } from "@/lib/api/types";
import { FILIERES, FILIERE_MAP, FILIERE_STYLES } from "@/lib/swimFilieres";
import { weekTypeColor, weekTypeTextColor } from "@/lib/weekTypeColor";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  CalendarRange,
  Check,
  ChevronDown,
  ChevronLeft,
  Eye,
  Link2,
  Pencil,
  Plus,
  Search,
  Settings2,
  Trash2,
  Trophy,
  Unlink,
  Waves,
  X,
} from "lucide-react";
import SwimPlanningAthleteView from "./SwimPlanningAthleteView";

/* ═══════════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════════ */

function getISOWeekNumber(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return (
    1 +
    Math.round(
      ((d.getTime() - week1.getTime()) / 86400000 -
        3 +
        ((week1.getDay() + 6) % 7)) /
        7,
    )
  );
}

function getMonday(d: Date): Date {
  const copy = new Date(d);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

interface WeekInfo {
  monday: Date;
  sunday: Date;
  weekNumber: number;
  weekKey: string; // "2026-04-06"
}

function generateWeeks(startMonday: Date, count: number): WeekInfo[] {
  return Array.from({ length: count }, (_, i) => {
    const monday = new Date(startMonday);
    monday.setDate(startMonday.getDate() + i * 7);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return {
      monday,
      sunday,
      weekNumber: getISOWeekNumber(monday),
      weekKey: monday.toISOString().split("T")[0],
    };
  });
}

const DAY_ROWS = [
  { index: 0, label: "Lun" },
  { index: 1, label: "Mar" },
  { index: 2, label: "Mer" },
  { index: 3, label: "Jeu" },
  { index: 4, label: "Ven" },
  { index: 5, label: "Sam" },
  { index: 6, label: "Dim" },
] as const;

function fmtDD_MM(d: Date): string {
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}

function isCurrentWeek(weekKey: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monday = new Date(weekKey + "T00:00:00");
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return today >= monday && today <= sunday;
}

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
      <div className="relative px-4 pt-3">
        {/* Vertical rail */}
        <div className="absolute left-[27px] top-8 bottom-8 w-px bg-border" />

        {slotsLoading && slots.length === 0 ? (
          <div className="space-y-3 pl-8">
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
        ) : (
          weeks.map((week) => {
            const current = isCurrentWeek(week.weekKey);
            const expanded = expandedWeekKey === week.weekKey;
            const editing = editingWeekKey === week.weekKey;
            const meta = selectedGroupId
              ? getWeekMeta(selectedGroupId, week.weekKey)
              : {};
            const weekSlots = slotsByWeek.get(week.weekKey) ?? [];
            const filledCount = weekSlots.length;
            const weekCompetitions = competitionsByWeek.get(week.weekKey) ?? [];

            return (
              <WeekCard
                key={week.weekKey}
                week={week}
                isCurrent={current}
                isExpanded={expanded}
                isEditing={editing}
                meta={meta}
                filledCount={filledCount}
                weekSlots={weekSlots}
                weekCompetitions={weekCompetitions}
                getDayCompetitions={getDayCompetitions}
                onSelectCompetition={setSelectedCompetition}
                editWeekType={editWeekType}
                setEditWeekType={setEditWeekType}
                editWeekNotes={editWeekNotes}
                setEditWeekNotes={setEditWeekNotes}
                existingWeekTypes={existingWeekTypes}
                onToggleExpand={() =>
                  setExpandedWeekKey(expanded ? null : week.weekKey)
                }
                onStartEditMeta={(e) => handleStartEditMeta(week.weekKey, e)}
                onSaveMeta={handleSaveMeta}
                onCancelEditMeta={handleCancelEditMeta}
                findSlot={findSlot}
                onCellTap={(dayIndex, timeSlot) => {
                  const existing = findSlot(week.weekKey, dayIndex, timeSlot);
                  setFiliereSheet({
                    weekKey: week.weekKey,
                    dayIndex,
                    timeSlot,
                    existingSlot: existing,
                  });
                }}
                onLinkTap={(dayIndex, timeSlot) => {
                  const existing = findSlot(week.weekKey, dayIndex, timeSlot);
                  if (!existing) return;
                  setSessionPickerSlot({
                    weekKey: week.weekKey,
                    dayIndex,
                    timeSlot,
                    currentSessionId: existing.session_id,
                  });
                  setSessionSearch("");
                }}
              />
            );
          })
        )}

        {/* Sentinel for infinite scroll */}
        <div ref={sentinelRef} className="h-4" />
      </div>

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

      {/* ── Filiere Editor Overlay ── */}
      <FiliereEditorOverlay
        open={showFiliereEditor}
        onClose={() => setShowFiliereEditor(false)}
      />

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

/* ═══════════════════════════════════════════════════════════════════
   Week Card
   ═══════════════════════════════════════════════════════════════════ */

interface WeekCardProps {
  week: WeekInfo;
  isCurrent: boolean;
  isExpanded: boolean;
  isEditing: boolean;
  meta: { weekType?: string; notes?: string };
  filledCount: number;
  weekSlots: SwimPlanningSlot[];
  weekCompetitions: Competition[];
  getDayCompetitions: (weekMonday: Date, dayIndex: number) => Competition[];
  onSelectCompetition: (c: Competition) => void;
  editWeekType: string;
  setEditWeekType: (v: string) => void;
  editWeekNotes: string;
  setEditWeekNotes: (v: string) => void;
  existingWeekTypes: string[];
  onToggleExpand: () => void;
  onStartEditMeta: (e: React.MouseEvent) => void;
  onSaveMeta: () => void;
  onCancelEditMeta: () => void;
  findSlot: (
    weekKey: string,
    dayIndex: number,
    timeSlot: "morning" | "evening",
  ) => SwimPlanningSlot | undefined;
  onCellTap: (dayIndex: number, timeSlot: "morning" | "evening") => void;
  onLinkTap: (dayIndex: number, timeSlot: "morning" | "evening") => void;
}

function WeekCard({
  week,
  isCurrent,
  isExpanded,
  isEditing,
  meta,
  filledCount,
  weekSlots,
  weekCompetitions,
  getDayCompetitions,
  onSelectCompetition,
  editWeekType,
  setEditWeekType,
  editWeekNotes,
  setEditWeekNotes,
  existingWeekTypes,
  onToggleExpand,
  onStartEditMeta,
  onSaveMeta,
  onCancelEditMeta,
  findSlot,
  onCellTap,
  onLinkTap,
}: WeekCardProps) {
  const hasCompetition = weekCompetitions.length > 0;
  const datalistId = `wt-${week.weekKey}`;

  return (
    <div className="relative pl-8 mb-2">
      {/* Timeline dot */}
      <div
        className={cn(
          "absolute left-[11px] top-3.5 h-[9px] w-[9px] rounded-full ring-2 ring-background transition-colors",
          hasCompetition
            ? "bg-amber-500"
            : isCurrent
              ? "bg-primary"
              : filledCount > 0
                ? "bg-emerald-500"
                : "bg-muted-foreground/25",
        )}
      />

      <div
        className={cn(
          "rounded-xl border bg-card transition-all overflow-hidden",
          isCurrent && "ring-2 ring-primary",
        )}
      >
        {/* ── Editing mode ── */}
        {isEditing ? (
          <div className="p-3 space-y-2.5">
            <div className="text-xs font-medium text-muted-foreground">
              S{week.weekNumber} &middot; {fmtDD_MM(week.monday)} &ndash;{" "}
              {fmtDD_MM(week.sunday)}
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">
                Type de semaine
              </label>
              <Input
                className="h-8 text-sm"
                placeholder="Ex : Foncier, Affutage..."
                list={datalistId}
                value={editWeekType}
                onChange={(e) => setEditWeekType(e.target.value)}
              />
              <datalist id={datalistId}>
                {existingWeekTypes.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">
                Notes
              </label>
              <Textarea
                className="text-sm min-h-[48px] resize-none"
                placeholder="Note optionnelle"
                rows={2}
                value={editWeekNotes}
                onChange={(e) => setEditWeekNotes(e.target.value)}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="ghost"
                size="sm"
                className="h-10 text-xs"
                onClick={onCancelEditMeta}
              >
                <X className="mr-1 h-3 w-3" />
                Annuler
              </Button>
              <Button size="sm" className="h-10 text-xs" onClick={onSaveMeta}>
                <Check className="mr-1 h-3 w-3" />
                Enregistrer
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* ── Collapsed header (always visible) ── */}
            <button
              type="button"
              className="w-full text-left px-3 py-2.5 flex items-center gap-2 min-h-[48px] hover:bg-muted/40 transition-colors active:bg-muted/60"
              onClick={onToggleExpand}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-foreground tabular-nums">
                    S{week.weekNumber}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {fmtDD_MM(week.monday)} &ndash; {fmtDD_MM(week.sunday)}
                  </span>
                  {meta.weekType && (
                    <Badge
                      className="text-[10px] px-1.5 py-0 border-0 shrink-0"
                      style={{
                        backgroundColor: weekTypeColor(meta.weekType),
                        color: weekTypeTextColor(meta.weekType),
                      }}
                    >
                      {meta.weekType}
                    </Badge>
                  )}
                  {filledCount > 0 && (
                    <span className="inline-flex items-center gap-[3px] shrink-0">
                      {/* Mini-dots: ordered Lun matin, Lun soir, Mar matin... */}
                      {DAY_ROWS.flatMap((day) =>
                        (["morning", "evening"] as const).map((ts) => {
                          const slot = weekSlots.find(
                            (s) => s.day_of_week === day.index && s.time_slot === ts,
                          );
                          if (!slot) return null;
                          const f = FILIERE_MAP.get(slot.filiere);
                          const style = FILIERE_STYLES[f?.color ?? "sky"] ?? FILIERE_STYLES.sky;
                          return (
                            <span
                              key={`${day.index}-${ts}`}
                              className={cn("h-[6px] w-[6px] rounded-full shrink-0", style.dot)}
                            />
                          );
                        }),
                      )}
                    </span>
                  )}
                </div>
                {meta.notes && (
                  <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
                    {meta.notes}
                  </p>
                )}
                {hasCompetition && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {weekCompetitions.map((c) => {
                      const d = new Date(c.date.slice(0, 10) + "T00:00:00");
                      return (
                        <span
                          key={c.id}
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectCompetition(c);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.stopPropagation();
                              onSelectCompetition(c);
                            }
                          }}
                          className="inline-flex items-center gap-1 rounded-md border border-amber-300/60 bg-amber-50 dark:bg-amber-900/30 dark:border-amber-700/60 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-200 max-w-full"
                        >
                          <Trophy className="h-3 w-3 shrink-0" />
                          <span className="truncate">{c.name}</span>
                          <span className="tabular-nums text-amber-700/70 dark:text-amber-300/70 shrink-0">
                            {fmtDD_MM(d)}
                          </span>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Edit pencil */}
              <button
                type="button"
                className="p-2 -m-1 rounded-lg hover:bg-muted/60 transition-colors shrink-0"
                onClick={onStartEditMeta}
                aria-label="Modifier la semaine"
              >
                <Pencil className="h-3.5 w-3.5 text-muted-foreground/50" />
              </button>

              {/* Chevron */}
              <motion.span
                animate={{ rotate: isExpanded ? 180 : 0 }}
                transition={{ duration: 0.2 }}
                className="shrink-0"
              >
                <ChevronDown className="h-4 w-4 text-muted-foreground/40" />
              </motion.span>
            </button>

            {/* ── Expanded micro grid ── */}
            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: "easeInOut" }}
                  className="overflow-hidden"
                >
                  <MicroGrid
                    weekKey={week.weekKey}
                    weekMonday={week.monday}
                    findSlot={findSlot}
                    onCellTap={onCellTap}
                    onLinkTap={onLinkTap}
                    getDayCompetitions={getDayCompetitions}
                    onSelectCompetition={onSelectCompetition}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Micro Grid — 6 rows x 2 columns (Matin / Soir)
   ═══════════════════════════════════════════════════════════════════ */

function MicroGrid({
  weekKey,
  weekMonday,
  findSlot,
  onCellTap,
  onLinkTap,
  getDayCompetitions,
  onSelectCompetition,
}: {
  weekKey: string;
  weekMonday: Date;
  findSlot: (
    weekKey: string,
    dayIndex: number,
    timeSlot: "morning" | "evening",
  ) => SwimPlanningSlot | undefined;
  onCellTap: (dayIndex: number, timeSlot: "morning" | "evening") => void;
  onLinkTap: (dayIndex: number, timeSlot: "morning" | "evening") => void;
  getDayCompetitions: (weekMonday: Date, dayIndex: number) => Competition[];
  onSelectCompetition: (c: Competition) => void;
}) {
  return (
    <div className="border-t bg-muted/20">
      {/* Column headers */}
      <div className="grid grid-cols-[48px_1fr_1fr] gap-1 px-3 pt-2 pb-1">
        <span />
        <span className="text-[10px] font-semibold text-muted-foreground text-center uppercase tracking-wider">
          Matin
        </span>
        <span className="text-[10px] font-semibold text-muted-foreground text-center uppercase tracking-wider">
          Soir
        </span>
      </div>

      {/* Day rows */}
      <div className="px-3 pb-3 space-y-1">
        {DAY_ROWS.map((day) => {
          const morning = findSlot(weekKey, day.index, "morning");
          const evening = findSlot(weekKey, day.index, "evening");
          const dayComps = getDayCompetitions(weekMonday, day.index);
          const hasComp = dayComps.length > 0;
          const emptyDay = !morning && !evening;
          const primaryComp = dayComps[0];

          return (
            <div
              key={day.index}
              className={cn(
                "grid grid-cols-[48px_1fr_1fr] gap-1 items-center rounded-lg transition-colors",
                hasComp &&
                  !emptyDay &&
                  "bg-amber-50/60 dark:bg-amber-900/15 ring-1 ring-amber-200/60 dark:ring-amber-800/40 pr-1",
              )}
            >
              <span
                className={cn(
                  "text-[11px] font-medium pl-0.5 flex items-center gap-1",
                  hasComp
                    ? "text-amber-700 dark:text-amber-300 font-semibold"
                    : "text-muted-foreground",
                )}
              >
                {hasComp && <Trophy className="h-3 w-3 shrink-0" />}
                {day.label}
              </span>

              {hasComp && emptyDay ? (
                <button
                  type="button"
                  onClick={() => onSelectCompetition(primaryComp)}
                  className="col-span-2 relative h-9 w-full rounded-lg flex items-center gap-1.5 px-2 overflow-hidden
                             bg-gradient-to-r from-amber-100 via-amber-50 to-amber-100
                             dark:from-amber-900/40 dark:via-amber-900/20 dark:to-amber-900/40
                             border border-amber-300/70 dark:border-amber-700/60
                             text-amber-900 dark:text-amber-100
                             active:scale-[0.98] transition-transform"
                  aria-label={primaryComp.name}
                >
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 opacity-[0.18]
                               bg-[repeating-linear-gradient(45deg,_transparent_0_6px,_currentColor_6px_7px)]"
                  />
                  <Trophy className="relative h-3.5 w-3.5 shrink-0" />
                  <span className="relative text-[10px] font-bold tracking-tight truncate flex-1 text-left">
                    {primaryComp.name}
                  </span>
                  {dayComps.length > 1 && (
                    <span className="relative text-[9px] font-semibold opacity-70 shrink-0">
                      +{dayComps.length - 1}
                    </span>
                  )}
                </button>
              ) : (
                <>
                  <SlotCell
                    slot={morning}
                    onTap={() => onCellTap(day.index, "morning")}
                    onLinkTap={() => onLinkTap(day.index, "morning")}
                  />
                  <SlotCell
                    slot={evening}
                    onTap={() => onCellTap(day.index, "evening")}
                    onLinkTap={() => onLinkTap(day.index, "evening")}
                  />
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Slot Cell — empty (dashed +) or filled (colored chip)
   ═══════════════════════════════════════════════════════════════════ */

function SlotCell({
  slot,
  onTap,
  onLinkTap,
}: {
  slot: SwimPlanningSlot | undefined;
  onTap: () => void;
  onLinkTap: () => void;
}) {
  if (!slot) {
    return (
      <button
        type="button"
        className="h-9 w-full rounded-lg border border-dashed border-muted-foreground/20 flex items-center justify-center hover:border-muted-foreground/40 hover:bg-muted/30 transition-colors active:scale-95"
        onClick={onTap}
        aria-label="Ajouter une filiere"
      >
        <Plus className="h-3.5 w-3.5 text-muted-foreground/40" />
      </button>
    );
  }

  const filiere = FILIERE_MAP.get(slot.filiere);
  const color = filiere?.color ?? "sky";
  const style = FILIERE_STYLES[color] ?? FILIERE_STYLES.sky;
  const hasSession = !!slot.session_id;

  return (
    <div className="flex items-center gap-0.5 h-9 w-full">
      {/* Filière chip — tap to change filière */}
      <button
        type="button"
        className={cn(
          "h-full flex-1 min-w-0 rounded-l-lg flex items-center justify-center px-1.5 transition-all active:scale-[0.97]",
          style.bg,
        )}
        onClick={onTap}
        aria-label={`Modifier: ${filiere?.short ?? slot.filiere}`}
      >
        <span className={cn("text-[10px] font-semibold truncate leading-tight", style.text)}>
          {filiere?.short ?? slot.filiere}
        </span>
      </button>

      {/* Link session button */}
      <button
        type="button"
        className={cn(
          "h-full w-7 shrink-0 rounded-r-lg flex items-center justify-center transition-all active:scale-[0.93]",
          hasSession
            ? cn(style.bg, "border-l border-white/20 dark:border-black/10")
            : "bg-muted/40 border border-dashed border-muted-foreground/15 hover:border-muted-foreground/30",
        )}
        onClick={(e) => {
          e.stopPropagation();
          onLinkTap();
        }}
        aria-label={hasSession ? "Modifier la séance liée" : "Lier une séance"}
      >
        <Link2
          className={cn(
            "h-3 w-3",
            hasSession
              ? cn(style.text, "opacity-80")
              : "text-muted-foreground/35",
          )}
        />
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Filiere Editor — full-screen overlay to edit descriptions/examples
   ═══════════════════════════════════════════════════════════════════ */

function FiliereEditorOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: filieres = [], isLoading } = useQuery({
    queryKey: ["swim-filieres"],
    queryFn: () => api.getSwimFilieres(),
    enabled: open,
    staleTime: 60_000,
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDesc, setEditDesc] = useState("");
  const [editExamples, setEditExamples] = useState("");

  const updateMutation = useMutation({
    mutationFn: (input: { id: string; description: string | null; examples: string | null }) =>
      api.updateSwimFiliere(input),
    onSuccess: () => {
      setEditingId(null);
      void queryClient.invalidateQueries({ queryKey: ["swim-filieres"] });
      toast({ title: "Filière mise à jour" });
    },
    onError: (err: Error) => {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    },
  });

  const handleStartEdit = (f: SwimFiliere) => {
    setEditingId(f.id);
    setEditDesc(f.description ?? "");
    setEditExamples(f.examples ?? "");
  };

  const handleSave = () => {
    if (!editingId) return;
    updateMutation.mutate({
      id: editingId,
      description: editDesc.trim() || null,
      examples: editExamples.trim() || null,
    });
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 bg-background flex flex-col overflow-hidden"
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 28, stiffness: 300 }}
        >
          {/* Header */}
          <div className="shrink-0 bg-background/90 backdrop-blur-xl border-b border-border/50">
            <div className="flex items-center gap-2 px-4 py-3">
              <button
                type="button"
                onClick={onClose}
                className="flex items-center justify-center h-10 w-10 -ml-2 rounded-xl active:bg-muted/60 transition-colors"
                aria-label="Fermer"
              >
                <ChevronLeft className="h-5 w-5 text-foreground" />
              </button>
              <h1 className="text-base font-bold tracking-tight text-foreground">
                Filières de travail
              </h1>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto pb-[calc(env(safe-area-inset-bottom)+4rem)]">
            {isLoading ? (
              <div className="px-4 pt-4 space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="px-4 pt-3 space-y-2">
                <p className="text-[11px] text-muted-foreground/60 mb-3">
                  Personnalise la description et les exemples d'exercices pour chaque filière. Ces informations seront visibles par les nageurs.
                </p>

                {filieres.map((f) => {
                  const constFiliere = FILIERE_MAP.get(f.id);
                  const style = FILIERE_STYLES[f.color] ?? FILIERE_STYLES.sky;
                  const isEditing = editingId === f.id;

                  if (isEditing) {
                    return (
                      <div key={f.id} className={cn("rounded-xl border p-3 space-y-3", "ring-2 ring-primary/30")}>
                        <div className="flex items-center gap-2">
                          <span className={cn("h-3 w-3 rounded-full shrink-0", style.dot)} />
                          <span className="text-sm font-semibold text-foreground">{f.name}</span>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[11px] font-medium text-muted-foreground">Description</label>
                          <Textarea
                            className="text-sm min-h-[60px] resize-none"
                            placeholder="Décris cette filière pour tes nageurs..."
                            rows={3}
                            value={editDesc}
                            onChange={(e) => setEditDesc(e.target.value)}
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[11px] font-medium text-muted-foreground">Exemples d'exercices</label>
                          <Textarea
                            className="text-sm min-h-[80px] resize-none"
                            placeholder="• 8×100m crawl (R:15s)&#10;• 400m technique..."
                            rows={4}
                            value={editExamples}
                            onChange={(e) => setEditExamples(e.target.value)}
                          />
                        </div>

                        <div className="flex gap-2 justify-end">
                          <Button variant="ghost" size="sm" className="h-10 text-xs" onClick={() => setEditingId(null)}>
                            <X className="mr-1 h-3 w-3" />
                            Annuler
                          </Button>
                          <Button size="sm" className="h-10 text-xs" onClick={handleSave} disabled={updateMutation.isPending}>
                            <Check className="mr-1 h-3 w-3" />
                            {updateMutation.isPending ? "..." : "Enregistrer"}
                          </Button>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <button
                      key={f.id}
                      type="button"
                      className="w-full text-left rounded-xl border bg-card px-3 py-2.5 flex items-start gap-2.5 hover:bg-muted/40 transition-colors active:bg-muted/60 min-h-[48px]"
                      onClick={() => handleStartEdit(f)}
                    >
                      <span className={cn("h-3 w-3 rounded-full shrink-0 mt-0.5", style.dot)} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-medium text-foreground">{f.name}</span>
                          {(!f.description && !f.examples) && (
                            <span className="text-[10px] text-muted-foreground/40 italic">non renseigné</span>
                          )}
                        </div>
                        {f.description && (
                          <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{f.description}</p>
                        )}
                      </div>
                      <Pencil className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0 mt-0.5" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
