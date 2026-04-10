/**
 * SwimPlanningDemo.tsx — Swim training planner for coaches
 * Vertical timeline of weeks with expandable micro-grids for filiere assignment.
 * Route: /#/coach/swim-planning
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/lib/api";
import type { SwimPlanningSlot, SwimPlanningSlotInput, GroupSummary } from "@/lib/api/types";
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
  Pencil,
  Plus,
  Trash2,
  Waves,
  X,
} from "lucide-react";

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
  saturday: Date;
  weekNumber: number;
  weekKey: string; // "2026-04-06"
}

function generateWeeks(startMonday: Date, count: number): WeekInfo[] {
  return Array.from({ length: count }, (_, i) => {
    const monday = new Date(startMonday);
    monday.setDate(startMonday.getDate() + i * 7);
    const saturday = new Date(monday);
    saturday.setDate(monday.getDate() + 5);
    return {
      monday,
      saturday,
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

  const handleSelectFiliere = (filiereId: string) => {
    if (!filiereSheet || !selectedGroupId) return;
    upsertMutation.mutate({
      group_id: selectedGroupId,
      week_start: filiereSheet.weekKey,
      day_of_week: filiereSheet.dayIndex,
      time_slot: filiereSheet.timeSlot,
      filiere: filiereId,
    });
  };

  const handleDeleteSlot = () => {
    if (!filiereSheet?.existingSlot) return;
    deleteMutation.mutate(filiereSheet.existingSlot.id);
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

            return (
              <WeekCard
                key={week.weekKey}
                week={week}
                isCurrent={current}
                isExpanded={expanded}
                isEditing={editing}
                meta={meta}
                filledCount={filledCount}
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
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh]">
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

            {/* Delete option */}
            {filiereSheet?.existingSlot && (
              <>
                <div className="h-px bg-border my-2" />
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
}: {
  groups: GroupSummary[];
  selectedGroupId: number | null;
  onSelectGroup: (id: number) => void;
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
}

function WeekCard({
  week,
  isCurrent,
  isExpanded,
  isEditing,
  meta,
  filledCount,
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
}: WeekCardProps) {
  const datalistId = `wt-${week.weekKey}`;

  return (
    <div className="relative pl-8 mb-2">
      {/* Timeline dot */}
      <div
        className={cn(
          "absolute left-[11px] top-3.5 h-[9px] w-[9px] rounded-full ring-2 ring-background transition-colors",
          isCurrent ? "bg-primary" : filledCount > 0 ? "bg-emerald-500" : "bg-muted-foreground/25",
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
              {fmtDD_MM(week.saturday)}
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
                    {fmtDD_MM(week.monday)} &ndash; {fmtDD_MM(week.saturday)}
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
                    <span className="text-[10px] text-muted-foreground/60 tabular-nums">
                      {filledCount} fil.
                    </span>
                  )}
                </div>
                {meta.notes && (
                  <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
                    {meta.notes}
                  </p>
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
                    findSlot={findSlot}
                    onCellTap={onCellTap}
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
  findSlot,
  onCellTap,
}: {
  weekKey: string;
  findSlot: (
    weekKey: string,
    dayIndex: number,
    timeSlot: "morning" | "evening",
  ) => SwimPlanningSlot | undefined;
  onCellTap: (dayIndex: number, timeSlot: "morning" | "evening") => void;
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
        {DAY_ROWS.map((day) => (
          <div
            key={day.index}
            className="grid grid-cols-[48px_1fr_1fr] gap-1 items-center"
          >
            <span className="text-[11px] font-medium text-muted-foreground pl-0.5">
              {day.label}
            </span>
            <SlotCell
              slot={findSlot(weekKey, day.index, "morning")}
              onTap={() => onCellTap(day.index, "morning")}
            />
            <SlotCell
              slot={findSlot(weekKey, day.index, "evening")}
              onTap={() => onCellTap(day.index, "evening")}
            />
          </div>
        ))}
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
}: {
  slot: SwimPlanningSlot | undefined;
  onTap: () => void;
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

  return (
    <button
      type="button"
      className={cn(
        "h-9 w-full rounded-lg flex items-center justify-center px-1.5 transition-all active:scale-95",
        style.bg,
      )}
      onClick={onTap}
      aria-label={`Modifier: ${filiere?.short ?? slot.filiere}`}
    >
      <span className={cn("text-[10px] font-semibold truncate leading-tight", style.text)}>
        {filiere?.short ?? slot.filiere}
      </span>
    </button>
  );
}
