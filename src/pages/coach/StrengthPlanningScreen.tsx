/**
 * StrengthPlanningScreen.tsx — Strength training planner for coaches
 * Vertical timeline of weeks with expandable micro-grids for session assignment.
 * Route: /#/coach/strength-planning
 *
 * Mirror of SwimPlanningDemo.tsx (Phase 3 §158).
 * Main differences:
 * - No filière concept — session template is the primary content.
 * - Picker: lists strength_session_templates (from getStrengthSessions).
 * - Sheet détail: show session items + notes + actions.
 * - No FilièresEditor overlay.
 * - 7 day rows (uses shared DAY_ROWS from swimPlanningShared which already has 7).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useQuery } from "@tanstack/react-query";
import {
  getGroups,
  getStrengthFolders,
  getStrengthPlanningSlots,
  getStrengthSessions,
  getCompetitions,
  getMyCompetitionIds,
} from "@/lib/api";
import type {
  StrengthFolder,
  StrengthSessionTemplate,
  Competition,
  AthleteSummary,
  GroupSummary,
} from "@/lib/api/types";
import type { EffectiveStrengthSlot } from "@/lib/strengthPlanningMerge";
import type { StrengthPlanningSlot } from "@/lib/api/types";
import { detectPhase, PHASE_STYLES } from "@/lib/strength/strengthPhaseStyles";
import { useStrengthPlanningAthleteMode } from "@/hooks/coach/useStrengthPlanningAthleteMode";
import StrengthPlanningTimeline from "@/components/coach/strength/StrengthPlanningTimeline";
import {
  generateWeeks,
  getMonday,
  DAY_ROWS,
  type WeekInfo,
} from "@/components/coach/swim/swimPlanningShared";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  ArrowLeft,
  Dumbbell,
  Search,
  Trash2,
  Trophy,
  Users,
} from "lucide-react";

/* ═══════════════════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════════════════ */

const INITIAL_WEEK_COUNT = 13; // current + 12 ahead
const LOAD_MORE_COUNT = 4;

/* ═══════════════════════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════════════════════ */

export default function StrengthPlanningScreen() {
  // ── Group selection ──
  const { data: groups = [], isLoading: groupsLoading } = useQuery({
    queryKey: ["groups"],
    queryFn: () => getGroups(),
  });

  // Filter to permanent groups only
  const permanentGroups = useMemo(
    () => groups.filter((g) => !g.is_temporary),
    [groups],
  );

  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);

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
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loadingMoreRef.current) {
          loadingMoreRef.current = true;
          setWeekCount((c) => c + LOAD_MORE_COUNT);
          setTimeout(() => {
            loadingMoreRef.current = false;
          }, 300);
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // ── Strength planning slots ──
  const {
    data: slots = [],
    isLoading: slotsLoading,
  } = useQuery({
    queryKey: ["strength-planning-slots", selectedGroupId, visibleWeekKeys],
    queryFn: () =>
      getStrengthPlanningSlots({
        groupId: selectedGroupId!,
        weekStarts: visibleWeekKeys,
      }),
    enabled: !!selectedGroupId && visibleWeekKeys.length > 0,
  });

  // Index slots by weekKey for fast lookup
  const slotsByWeek = useMemo(() => {
    const map = new Map<string, StrengthPlanningSlot[]>();
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
  } = useStrengthPlanningAthleteMode({
    selectedGroupId,
    visibleWeekKeys,
    groupSlotsByWeek: slotsByWeek,
  });

  // ── Session templates catalog ──
  const { data: sessionTemplates = [] } = useQuery({
    queryKey: ["strength-sessions"],
    queryFn: () => getStrengthSessions(),
    staleTime: 5 * 60_000,
  });

  // Map id → template for fast lookup in timeline
  const sessionTemplatesById = useMemo(() => {
    const map = new Map<number, StrengthSessionTemplate>();
    for (const t of sessionTemplates) {
      map.set(t.id, t);
    }
    return map;
  }, [sessionTemplates]);

  // ── Athlete biblio plan folders (cycles) — feeds the picker in athlete mode ──
  const { data: athletePlanFolders = [] } = useQuery({
    queryKey: ["strength_folders", "session", selectedAthleteId],
    queryFn: () =>
      getStrengthFolders("session", { athleteId: selectedAthleteId! }),
    enabled: selectedAthleteId != null,
  });

  // ── Competitions (context for planning) ──
  const { data: allCompetitions = [] } = useQuery({
    queryKey: ["competitions"],
    queryFn: () => getCompetitions(),
  });

  // In athlete mode, filter to only that athlete's assigned competitions.
  const { data: athleteCompetitionIds = [] } = useQuery({
    queryKey: ["my-competition-ids", selectedAthleteId],
    queryFn: () => getMyCompetitionIds(selectedAthleteId),
    enabled: selectedAthleteId != null,
  });

  const visibleCompetitions = useMemo(() => {
    if (selectedAthleteId == null) return allCompetitions;
    return allCompetitions.filter((c) => athleteCompetitionIds.includes(c.id));
  }, [allCompetitions, athleteCompetitionIds, selectedAthleteId]);

  // Group competitions by week key
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
        toast.error("Erreur", { description: err.message });
      },
    });
  };

  const handleCancelEditMeta = () => {
    setEditingWeekKey(null);
  };

  // ── Slot picker state (one slot per day — always writes "morning") ──
  const [picker, setPicker] = useState<{
    weekKey: string;
    dayIndex: number;
    existing: EffectiveStrengthSlot | null;
  } | null>(null);
  const [pickerSearch, setPickerSearch] = useState("");
  const debouncedPickerSearch = useDebouncedValue(pickerSearch, 200);

  // ── Detail sheet state (tap case pleine) ──
  const [detailSlot, setDetailSlot] = useState<EffectiveStrengthSlot | null>(null);
  const [detailWeekKey, setDetailWeekKey] = useState<string | null>(null);
  const [detailDayIndex, setDetailDayIndex] = useState<number | null>(null);
  const [detailNotes, setDetailNotes] = useState("");

  // Open detail sheet or picker depending on whether cell is filled
  const handleSlotTap = useCallback(
    (
      weekKey: string,
      dayIndex: number,
      slot: EffectiveStrengthSlot | null,
    ) => {
      if (!selectedGroupId) return;
      if (slot) {
        setDetailSlot(slot);
        setDetailWeekKey(weekKey);
        setDetailDayIndex(dayIndex);
        setDetailNotes(slot.notes ?? "");
      } else {
        setPicker({ weekKey, dayIndex, existing: null });
        setPickerSearch("");
      }
    },
    [selectedGroupId],
  );

  const onWriteError = useCallback(
    (err: Error) => {
      toast.error("Erreur", { description: err.message });
    },
    [toast],
  );

  // ── Session search & grouping ──
  // In athlete mode, sessions from the athlete's biblio plan are surfaced
  // first (grouped by cycle), with the rest of the catalog below as
  // "Catalogue général". In group mode, fall back to a single flat list.
  const catalogGrouped = useMemo(() => {
    const inPlanIds = new Set<number>();
    const groups: { label: string; sessions: StrengthSessionTemplate[] }[] = [];

    if (selectedAthleteId != null && athletePlanFolders.length > 0) {
      const rootFolders = athletePlanFolders.filter((f) => !f.parent_id);
      const subFoldersByRoot = new Map<number, StrengthFolder[]>();
      for (const f of athletePlanFolders) {
        if (f.parent_id != null) {
          const arr = subFoldersByRoot.get(f.parent_id) ?? [];
          arr.push(f);
          subFoldersByRoot.set(f.parent_id, arr);
        }
      }
      const folderSessions = new Map<number, StrengthSessionTemplate[]>();
      for (const t of sessionTemplates) {
        if (!t.items || t.items.length === 0) continue;
        if (t.folder_id == null) continue;
        const arr = folderSessions.get(t.folder_id) ?? [];
        arr.push(t);
        folderSessions.set(t.folder_id, arr);
      }
      for (const root of rootFolders) {
        const cycles = subFoldersByRoot.get(root.id) ?? [];
        for (const cycle of cycles) {
          const sessions = folderSessions.get(cycle.id) ?? [];
          if (sessions.length === 0) continue;
          groups.push({ label: cycle.name, sessions });
          for (const s of sessions) inPlanIds.add(s.id);
        }
        const rootSessions = folderSessions.get(root.id) ?? [];
        if (rootSessions.length > 0) {
          groups.push({ label: `${root.name} — non classé`, sessions: rootSessions });
          for (const s of rootSessions) inPlanIds.add(s.id);
        }
      }
    }

    // Everything else → general catalog
    const generalSessions: StrengthSessionTemplate[] = [];
    for (const t of sessionTemplates) {
      if (!t.items || t.items.length === 0) continue;
      if (inPlanIds.has(t.id)) continue;
      generalSessions.push(t);
    }
    if (generalSessions.length > 0) {
      groups.push({
        label: groups.length > 0 ? "Catalogue général" : "Séances",
        sessions: generalSessions,
      });
    }
    return groups;
  }, [sessionTemplates, selectedAthleteId, athletePlanFolders]);

  const filteredCatalog = useMemo(() => {
    if (!debouncedPickerSearch.trim()) return catalogGrouped;
    const q = debouncedPickerSearch.toLowerCase();
    return catalogGrouped
      .map((g) => ({
        ...g,
        sessions: g.sessions.filter(
          (s) =>
            (s.title ?? "").toLowerCase().includes(q) ||
            (s.name ?? "").toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.sessions.length > 0);
  }, [catalogGrouped, debouncedPickerSearch]);

  // Day-of-week prefix matching ("Lun", "Mardi", etc. in the session title)
  // → highlight suggested sessions for the currently-targeted day. Works
  // both for the create flow (picker) and the change-session flow (detail).
  const dayPickerPrefixes = ["lun", "mar", "mer", "jeu", "ven", "sam", "dim"];
  const targetDayIndex = picker?.dayIndex ?? detailDayIndex ?? null;
  const isDaySuggested = useCallback(
    (s: StrengthSessionTemplate): boolean => {
      if (targetDayIndex == null) return false;
      const prefix = dayPickerPrefixes[targetDayIndex];
      if (!prefix) return false;
      const title = (s.title ?? s.name ?? "").trim().toLowerCase();
      return title.startsWith(prefix);
    },
    // dayPickerPrefixes is a stable inline const — no need to add as dep
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [targetDayIndex],
  );

  const handlePickSession = (templateId: number) => {
    if (!picker) return;
    writeSlot(
      {
        weekKey: picker.weekKey,
        dayIndex: picker.dayIndex,
        timeSlot: "morning",
        session_template_id: templateId,
        notes: null,
      },
      {
        onSuccess: () => setPicker(null),
        onError: onWriteError,
      },
    );
  };

  // Editing an existing slot: preserve its original time_slot (could be a
  // legacy "evening" row) so the update targets the right DB record.
  const handleChangeSession = (templateId: number) => {
    if (!detailSlot || !detailWeekKey || detailDayIndex == null) return;
    writeSlot(
      {
        weekKey: detailWeekKey,
        dayIndex: detailDayIndex,
        timeSlot: detailSlot.time_slot,
        session_template_id: templateId,
        notes: detailSlot.notes,
        existingSlot: detailSlot,
      },
      {
        onSuccess: () => {
          setPicker(null);
          setDetailSlot(null);
        },
        onError: onWriteError,
      },
    );
  };

  const handleSaveNotes = () => {
    if (!detailSlot || !detailWeekKey || detailDayIndex == null) return;
    const tplId = detailSlot.session_template_id;
    writeSlot(
      {
        weekKey: detailWeekKey,
        dayIndex: detailDayIndex,
        timeSlot: detailSlot.time_slot,
        session_template_id: tplId,
        notes: detailNotes.trim() || null,
        existingSlot: detailSlot,
      },
      {
        onSuccess: () => setDetailSlot(null),
        onError: onWriteError,
      },
    );
  };

  const handleDetachSession = () => {
    if (!detailSlot || !detailWeekKey || detailDayIndex == null) return;
    writeSlot(
      {
        weekKey: detailWeekKey,
        dayIndex: detailDayIndex,
        timeSlot: detailSlot.time_slot,
        session_template_id: null,
        notes: null,
        existingSlot: detailSlot,
      },
      {
        onSuccess: () => setDetailSlot(null),
        onError: onWriteError,
      },
    );
  };

  const handleDeleteSlot = () => {
    if (!detailSlot) return;
    deleteSlot(detailSlot, {
      onSuccess: () => setDetailSlot(null),
      onError: onWriteError,
    });
  };

  // ── State to re-open picker from detail sheet ──
  const [changeSessionMode, setChangeSessionMode] = useState(false);

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
        <Header
          groups={[]}
          selectedGroupId={null}
          onSelectGroup={() => {}}
        />
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <div className="h-16 w-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
            <Dumbbell className="h-8 w-8 text-muted-foreground/30" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">
            Aucun groupe disponible
          </p>
          <p className="text-xs text-muted-foreground/60 mt-1.5 max-w-[260px]">
            Crée un groupe dans l'administration pour commencer la
            planification muscu.
          </p>
        </div>
      </div>
    );
  }

  // Template used in detail sheet
  const detailTemplate = detailSlot?.session_template_id
    ? sessionTemplatesById.get(detailSlot.session_template_id)
    : null;

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
      />

      {/* ── Timeline ── */}
      <StrengthPlanningTimeline
        weeks={weeks}
        effectiveSlotsByWeek={effectiveSlotsByWeek}
        getEffectiveWeekMeta={getEffectiveWeekMeta}
        sessionTemplatesById={sessionTemplatesById}
        competitionsByWeek={competitionsByWeek}
        getDayCompetitions={getDayCompetitions}
        expandedWeekKey={expandedWeekKey}
        onToggleExpand={(weekKey) =>
          setExpandedWeekKey((current) => (current === weekKey ? null : weekKey))
        }
        onSlotTap={handleSlotTap}
        onWeekMetaTap={handleStartEditMeta}
        onCompetitionTap={setSelectedCompetition}
        editingWeekKey={editingWeekKey}
        editWeekType={editWeekType}
        editWeekNotes={editWeekNotes}
        existingWeekTypes={existingWeekTypes}
        onSaveMeta={handleSaveMeta}
        onCancelEditMeta={handleCancelEditMeta}
        onEditTypeChange={setEditWeekType}
        onEditNotesChange={setEditWeekNotes}
        showOverrideBadge={selectedAthleteId != null}
        sentinelRef={sentinelRef}
        isLoading={slotsLoading}
        isEmpty={slots.length === 0}
      />

      {/* ── Picker session template bottom sheet ── */}
      <Sheet
        open={!!picker || changeSessionMode}
        onOpenChange={(open) => {
          if (!open) {
            setPicker(null);
            setChangeSessionMode(false);
          }
        }}
      >
        <SheetContent
          side="bottom"
          className="rounded-t-2xl max-h-[85dvh] flex flex-col"
        >
          <SheetHeader className="pb-2 shrink-0">
            <SheetTitle className="text-base">Choisir une séance</SheetTitle>
            <SheetDescription className="text-xs text-muted-foreground">
              {picker
                ? (DAY_ROWS[picker.dayIndex]?.label ?? "")
                : "Changer la séance assignée"}
            </SheetDescription>
          </SheetHeader>

          {/* Search bar */}
          <div className="relative shrink-0 mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
            <Input
              className="pl-9 h-9 text-sm"
              placeholder="Rechercher une séance..."
              value={pickerSearch}
              onChange={(e) => setPickerSearch(e.target.value)}
            />
          </div>

          {/* Session list */}
          <div className="flex-1 overflow-y-auto -mx-1 px-1 pb-4 space-y-4">
            {filteredCatalog.length === 0 ? (
              <div className="text-center py-8">
                <Dumbbell className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  Aucune séance trouvée
                </p>
              </div>
            ) : (
              filteredCatalog.map((group, gi) => (
                <div key={gi}>
                  {filteredCatalog.length > 1 && (
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 px-1">
                      {group.label}
                    </p>
                  )}
                  <div className="space-y-1">
                    {group.sessions.map((s) => {
                      const phase = detectPhase(s.title ?? s.name ?? "");
                      const style = PHASE_STYLES[phase] ?? PHASE_STYLES.force;
                      const itemCount = s.items?.length ?? 0;
                      const currentId = changeSessionMode
                        ? detailSlot?.session_template_id
                        : picker?.existing?.session_template_id;
                      const isSelected = currentId === s.id;
                      const suggested = isDaySuggested(s);

                      return (
                        <button
                          key={s.id}
                          type="button"
                          className={cn(
                            "w-full flex items-center gap-3 rounded-xl px-3.5 py-3 text-left transition-all min-h-[48px] active:scale-[0.98]",
                            isSelected
                              ? cn(style.bg, "ring-2 ring-primary/30")
                              : suggested
                                ? cn(style.bg, "ring-1 ring-primary/20")
                                : "hover:bg-muted/50",
                          )}
                          onClick={() => {
                            if (changeSessionMode) {
                              handleChangeSession(s.id);
                            } else {
                              handlePickSession(s.id);
                            }
                          }}
                          disabled={isPending}
                        >
                          <span
                            className={cn("h-2.5 w-2.5 rounded-full shrink-0", style.dot)}
                          />
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium block truncate">
                              {s.title ?? s.name}
                            </span>
                            {s.description && (
                              <span className="text-[11px] text-muted-foreground line-clamp-1">
                                {s.description}
                              </span>
                            )}
                          </div>
                          {suggested && (
                            <Badge
                              variant="outline"
                              className="text-[10px] shrink-0 border-primary/40 text-primary"
                            >
                              Suggéré
                            </Badge>
                          )}
                          {itemCount > 0 && (
                            <Badge
                              variant="secondary"
                              className="text-[10px] shrink-0"
                            >
                              {itemCount} ex.
                            </Badge>
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

      {/* ── Detail session sheet ── */}
      <Sheet
        open={!!detailSlot && !changeSessionMode}
        onOpenChange={(open) => !open && setDetailSlot(null)}
      >
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[85dvh] flex flex-col">
          <SheetHeader className="pb-2 shrink-0">
            <SheetTitle className="text-base">
              {detailTemplate?.title ?? detailTemplate?.name ?? "Séance"}
            </SheetTitle>
            <SheetDescription className="text-xs text-muted-foreground">
              {detailWeekKey && detailDayIndex != null
                ? `S${weeks.find((w) => w.weekKey === detailWeekKey)?.weekNumber ?? ""} — ${DAY_ROWS[detailDayIndex]?.label ?? ""}`
                : ""}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto pb-4 space-y-4">
            {/* Phase badge + exercise count */}
            {detailTemplate && (
              <div className="flex items-center gap-2">
                {(() => {
                  const phase = detectPhase(
                    detailTemplate.title ?? detailTemplate.name ?? "",
                  );
                  const style = PHASE_STYLES[phase] ?? PHASE_STYLES.force;
                  return (
                    <>
                      <Badge
                        className={cn(
                          "text-[11px] px-2 py-0.5 border-0",
                          style.bg,
                          style.text,
                        )}
                      >
                        {phase}
                      </Badge>
                      {(detailTemplate.items?.length ?? 0) > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {detailTemplate.items!.length} exercices
                        </span>
                      )}
                    </>
                  );
                })()}
                {detailSlot?.overridden && (
                  <Badge
                    variant="outline"
                    className="text-[11px] px-2 py-0.5 border-primary/50 text-primary"
                  >
                    Perso
                  </Badge>
                )}
              </div>
            )}

            {/* Exercise list (max 10 visible) */}
            {detailTemplate?.items && detailTemplate.items.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                  Exercices
                </p>
                {detailTemplate.items.slice(0, 10).map((item, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 py-1.5 border-b border-border/40 last:border-0"
                  >
                    <span className="text-[11px] text-muted-foreground tabular-nums w-5 shrink-0">
                      {i + 1}.
                    </span>
                    <span className="text-[13px] text-foreground flex-1 truncate">
                      {item.exercise_name ?? `Exercice ${i + 1}`}
                    </span>
                    <span className="text-[11px] text-muted-foreground shrink-0">
                      {item.sets}×{item.reps}
                    </span>
                  </div>
                ))}
                {detailTemplate.items.length > 10 && (
                  <p className="text-[11px] text-muted-foreground text-center pt-1">
                    +{detailTemplate.items.length - 10} autres exercices
                  </p>
                )}
              </div>
            )}

            {/* Notes */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Notes (optionnel)
              </label>
              <Textarea
                className="text-sm min-h-[64px] resize-none"
                placeholder="Notes pour cette séance..."
                value={detailNotes}
                onChange={(e) => setDetailNotes(e.target.value)}
              />
              {detailNotes !== (detailSlot?.notes ?? "") && (
                <Button
                  size="sm"
                  className="w-full h-9 text-xs"
                  onClick={handleSaveNotes}
                  disabled={isPending}
                >
                  Enregistrer les notes
                </Button>
              )}
            </div>

            {/* Actions */}
            <div className="space-y-1.5 pt-1">
              <div className="h-px bg-border" />
              <button
                type="button"
                className="w-full flex items-center gap-3 rounded-xl px-3.5 py-3 text-left transition-all min-h-[48px] text-primary hover:bg-primary/10 active:scale-[0.98]"
                onClick={() => {
                  setChangeSessionMode(true);
                  setPickerSearch("");
                }}
              >
                <Dumbbell className="h-4 w-4 shrink-0" />
                <span className="text-sm font-medium">Changer de séance</span>
              </button>

              {/* Détacher : only in group mode, OR if override */}
              {(selectedAthleteId == null ||
                detailSlot?.overridden === true) && (
                <>
                  <button
                    type="button"
                    className="w-full flex items-center gap-3 rounded-xl px-3.5 py-3 text-left transition-all min-h-[48px] text-muted-foreground hover:bg-muted/50 active:scale-[0.98]"
                    onClick={handleDetachSession}
                    disabled={isPending}
                  >
                    <Trash2 className="h-4 w-4 shrink-0" />
                    <span className="text-sm font-medium">
                      Détacher la séance
                    </span>
                  </button>

                  <button
                    type="button"
                    className="w-full flex items-center gap-3 rounded-xl px-3.5 py-3 text-left transition-all min-h-[48px] text-destructive hover:bg-destructive/10 active:scale-[0.98]"
                    onClick={handleDeleteSlot}
                    disabled={isPending}
                  >
                    <Trash2 className="h-4 w-4 shrink-0" />
                    <span className="text-sm font-medium">
                      {selectedAthleteId != null
                        ? "Supprimer la séance individuelle"
                        : "Supprimer le slot"}
                    </span>
                  </button>
                </>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Competition Detail Sheet ── */}
      <Sheet
        open={!!selectedCompetition}
        onOpenChange={(o) => !o && setSelectedCompetition(null)}
      >
        <SheetContent
          side="bottom"
          className="rounded-t-2xl max-h-[70dvh] overflow-y-auto"
        >
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
                    selectedCompetition.end_date !==
                      selectedCompetition.date && (
                      <>
                        {" → "}
                        {new Date(
                          selectedCompetition.end_date.slice(0, 10) +
                            "T00:00:00",
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
}: {
  groups: GroupSummary[];
  selectedGroupId: number | null;
  onSelectGroup: (id: number) => void;
  groupAthletes?: AthleteSummary[];
  selectedAthleteId?: number | null;
  selectedAthlete?: AthleteSummary | null;
  onSelectAthlete?: (id: number | null) => void;
}) {
  return (
    <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-lg border-b">
      <div className="px-4 pt-3 pb-3">
        <div className="flex items-center gap-2.5">
          <Dumbbell className="h-4 w-4 text-primary shrink-0" />
          <h1 className="text-lg font-bold tracking-tight text-foreground">
            Planification Musculation
          </h1>
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
              className="shrink-0 inline-flex items-center gap-1.5 h-9 min-h-9 px-3 rounded-full text-xs font-semibold text-amber-800 hover:text-amber-900 dark:text-amber-200 dark:hover:text-amber-100 bg-white/80 hover:bg-white dark:bg-amber-900/40 dark:hover:bg-amber-900/60 border border-amber-300/80 dark:border-amber-800/60 shadow-sm transition-colors active:scale-[0.97]"
              aria-label="Retour au plan du groupe"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Retour au plan groupe
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
                    selectedAthleteId
                      ? String(selectedAthleteId)
                      : "__group__"
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
