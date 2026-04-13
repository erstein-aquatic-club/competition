/**
 * SwimPlanningAthleteView.tsx — Read-only swimmer view of the swim planning
 * Mirrors the coach view (SwimPlanningDemo) exactly, without editing controls.
 * Chips are tappable to see filière details (description, examples, technicals).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { SwimPlanningSlot, SwimFiliere, Competition } from "@/lib/api/types";
import {
  FILIERES,
  FILIERE_MAP,
  FILIERE_STYLES,
  type FiliereTechnicals,
  type FiliereLevels,
} from "@/lib/swimFilieres";
import { weekTypeColor, weekTypeTextColor } from "@/lib/weekTypeColor";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  ChevronDown,
  ChevronLeft,
  Link2,
  Trophy,
  Heart,
  FlaskConical,
  Flame,
  Timer,
  Ruler,
  Repeat2,
  Zap,
  Hourglass,
  Activity,
  type LucideIcon,
} from "lucide-react";

/* ═══════════════════════════════════════════════════════════════════
   Helpers (same as SwimPlanningDemo)
   ═══════════════════════════════════════════════════════════════════ */

function getISOWeekNumber(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
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
  weekKey: string;
}

function generateWeeks(startMonday: Date, count: number): WeekInfo[] {
  return Array.from({ length: count }, (_, i) => {
    const monday = new Date(startMonday);
    monday.setDate(startMonday.getDate() + i * 7);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { monday, sunday, weekNumber: getISOWeekNumber(monday), weekKey: monday.toISOString().split("T")[0] };
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

function getWeekMeta(groupId: number, weekKey: string): { weekType?: string; notes?: string } {
  try {
    const raw = localStorage.getItem(`swim-plan-meta-${groupId}-${weekKey}`);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

const INITIAL_WEEK_COUNT = 13;
const LOAD_MORE_COUNT = 4;

const TECHNICAL_LABELS: {
  key: keyof FiliereTechnicals;
  label: string;
  unit: string;
  icon: LucideIcon;
  full?: boolean;
}[] = [
  { key: "duration", label: "Durée effort", unit: "", icon: Timer },
  { key: "intensity", label: "Intensité", unit: "", icon: Zap },
  { key: "recovery", label: "Récup.", unit: "", icon: Hourglass },
  { key: "reps", label: "Répétitions", unit: "", icon: Repeat2 },
  { key: "distance", label: "Distance", unit: "m", icon: Ruler },
  { key: "effort", label: "Effort perçu", unit: "/20", icon: Flame },
  { key: "heartRate", label: "Fréq. card.", unit: "bpm", icon: Heart },
  { key: "lactate", label: "Lactates", unit: "mmol/L", icon: FlaskConical },
  { key: "workType", label: "Type de travail", unit: "", icon: Activity, full: true },
];

const GAUGE_METRICS: {
  key: keyof FiliereLevels;
  label: string;
  icon: LucideIcon;
  scale: [string, string];
}[] = [
  { key: "intensity", label: "Intensité",    icon: Zap,          scale: ["léger",  "maximal"] },
  { key: "duration",  label: "Durée effort", icon: Timer,        scale: ["court",  "long"] },
  { key: "recovery",  label: "Récup.",       icon: Hourglass,    scale: ["aucune", "complète"] },
  { key: "lactate",   label: "Lactates",     icon: FlaskConical, scale: ["aucun",  "max"] },
];

/**
 * Segmented gauge — 5 pills.  Filled pills use the filière's solid color,
 * empty pills use the filière's translucent track color. Variable (Technique)
 * renders an em dash.
 */
function FiliereGauge({
  value,
  fillClass,
  trackClass,
}: {
  value: number | null;
  fillClass: string;
  trackClass: string;
}) {
  if (value == null) {
    return (
      <div className="flex items-center gap-1" aria-label="variable">
        {Array.from({ length: 5 }).map((_, i) => (
          <span key={i} className={cn("h-1.5 flex-1 rounded-full", trackClass)} />
        ))}
      </div>
    );
  }
  const clamped = Math.max(0, Math.min(5, value));
  return (
    <div className="flex items-center gap-1" role="meter" aria-valuenow={clamped} aria-valuemin={1} aria-valuemax={5}>
      {Array.from({ length: 5 }).map((_, i) => {
        const filled = i < clamped;
        return (
          <motion.span
            key={i}
            initial={{ scaleX: 0, opacity: 0 }}
            animate={{ scaleX: 1, opacity: 1 }}
            transition={{ delay: 0.05 * i, duration: 0.25, ease: "easeOut" }}
            style={{ transformOrigin: "left center" }}
            className={cn(
              "h-1.5 flex-1 rounded-full",
              filled ? fillClass : trackClass,
            )}
          />
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════════════════════ */

interface SwimPlanningAthleteViewProps {
  groupId: number;
  open?: boolean;
  onClose?: () => void;
  embedded?: boolean;
}

export default function SwimPlanningAthleteView({
  groupId,
  open = true,
  onClose,
  embedded = false,
}: SwimPlanningAthleteViewProps) {
  const isVisible = embedded || open;
  const userId = useAuth((s) => s.userId);

  // ── Week generation (infinite scroll, same as coach) ──
  const startMonday = useMemo(() => getMonday(new Date()), []);
  const [weekCount, setWeekCount] = useState(INITIAL_WEEK_COUNT);
  const weeks = useMemo(() => generateWeeks(startMonday, weekCount), [startMonday, weekCount]);
  const visibleWeekKeys = useMemo(() => weeks.map((w) => w.weekKey), [weeks]);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  // Guards against re-entrant infinite loops: when `weekCount` changes the
  // effect below recreates the IntersectionObserver, which fires immediately
  // if the sentinel is still inside the (rootMargin-extended) viewport. That
  // would call setWeekCount again, re-run the effect, and so on — the query
  // key would churn and the view would stay stuck in "loading" forever
  // (especially in embedded mode where the parent is the scroll container).
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    if (!isVisible) return;
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loadingMoreRef.current) {
          loadingMoreRef.current = true;
          setWeekCount((c) => c + LOAD_MORE_COUNT);
          // Release the lock after the next paint so a real scroll can
          // trigger the next page, but a same-frame re-fire from the new
          // observer cannot.
          setTimeout(() => { loadingMoreRef.current = false; }, 600);
        }
      },
      { rootMargin: "100px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [isVisible, weekCount]);

  // ── Slots ──
  // We set a short staleTime so the swimmer picks up coach edits on revisit
  // (the global queryClient uses staleTime: Infinity). Note: we intentionally
  // don't set refetchOnMount/refetchInterval here — combining them with the
  // `enabled` gate was causing the embedded view to render blank on first
  // mount in SuiviPlanification (§109). The next page revisit / focus is
  // sufficient to refresh.
  const { data: slots = [], isLoading: slotsLoading } = useQuery({
    queryKey: ["swim-planning-slots", groupId, visibleWeekKeys],
    queryFn: () => api.getSwimPlanningSlots({ groupId, weekStarts: visibleWeekKeys }),
    enabled: isVisible && !!groupId && visibleWeekKeys.length > 0,
    staleTime: 15_000,
  });

  const slotsByWeek = useMemo(() => {
    const map = new Map<string, SwimPlanningSlot[]>();
    for (const s of slots) {
      const arr = map.get(s.week_start) ?? [];
      arr.push(s);
      map.set(s.week_start, arr);
    }
    return map;
  }, [slots]);

  const findSlot = useCallback(
    (weekKey: string, dayIndex: number, timeSlot: "morning" | "evening"): SwimPlanningSlot | undefined => {
      const weekSlots = slotsByWeek.get(weekKey);
      if (!weekSlots) return undefined;
      return weekSlots.find((s) => s.day_of_week === dayIndex && s.time_slot === timeSlot);
    },
    [slotsByWeek],
  );

  // ── DB filières (description, examples) ──
  const { data: dbFilieres = [] } = useQuery({
    queryKey: ["swim-filieres"],
    queryFn: () => api.getSwimFilieres(),
    enabled: isVisible,
    staleTime: 60_000,
  });

  const dbFiliereMap = useMemo(() => {
    const map = new Map<string, SwimFiliere>();
    for (const f of dbFilieres) map.set(f.id, f);
    return map;
  }, [dbFilieres]);

  // ── Competitions (to provide context for filière training) ──
  const { data: allCompetitions = [] } = useQuery({
    queryKey: ["competitions"],
    queryFn: () => api.getCompetitions(),
    enabled: isVisible,
  });

  const { data: myCompetitionIds } = useQuery({
    queryKey: ["my-competition-ids", userId],
    queryFn: () => api.getMyCompetitionIds(userId),
    enabled: isVisible && !!userId,
  });

  const visibleCompetitions = useMemo(() => {
    if (myCompetitionIds && myCompetitionIds.length > 0) {
      return allCompetitions.filter((c) => myCompetitionIds.includes(c.id));
    }
    return allCompetitions;
  }, [allCompetitions, myCompetitionIds]);

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

  // ── Competition detail sheet ──
  const [selectedCompetition, setSelectedCompetition] = useState<Competition | null>(null);

  // ── Expand state ──
  const [expandedWeekKey, setExpandedWeekKey] = useState<string | null>(null);

  // ── Filière detail sheet ──
  const [selectedFiliere, setSelectedFiliere] = useState<{ filiereId: string; hasSession: boolean } | null>(null);
  const [techOpen, setTechOpen] = useState(false);

  const handleChipTap = (filiereId: string, hasSession: boolean) => {
    setSelectedFiliere({ filiereId, hasSession });
    setTechOpen(false);
  };

  const selectedFiliereData = selectedFiliere ? FILIERE_MAP.get(selectedFiliere.filiereId) : null;
  const selectedFiliereDb = selectedFiliere ? dbFiliereMap.get(selectedFiliere.filiereId) : null;
  const selectedStyle = selectedFiliereData ? FILIERE_STYLES[selectedFiliereData.color] ?? FILIERE_STYLES.sky : FILIERE_STYLES.sky;

  const planningContent = (
    <>
      <div
        className={cn(
          "max-w-lg mx-auto md:max-w-3xl lg:max-w-4xl",
          // Only use the full-height flex layout when rendered as a full-screen
          // overlay. When embedded (e.g. SuiviPlanification tab), the parent has
          // no intrinsic height so `h-full` collapses to 0 and the content
          // disappears until a re-render; let it flow naturally instead.
          !embedded && "h-full flex flex-col",
        )}
      >
        {!embedded && (
          <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-lg border-b">
            <div className="px-4 pt-3 pb-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex items-center justify-center h-10 w-10 -ml-2 rounded-xl active:bg-muted/60 transition-colors"
                  aria-label="Fermer"
                >
                  <ChevronLeft className="h-5 w-5 text-foreground" />
                </button>
                <h1 className="text-lg font-bold tracking-tight text-foreground">
                  Ma planification
                </h1>
              </div>
            </div>
          </div>
        )}

        <div className={cn(!embedded && "overflow-y-auto flex-1")}>
          <div className={cn("relative px-4 pb-24", embedded ? "pt-1" : "pt-3")}>
            {/* Vertical rail */}
            <div className="absolute left-[27px] top-8 bottom-8 w-px bg-border" />

            {slotsLoading && slots.length === 0 ? (
              <div className="space-y-3 pl-8">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="rounded-xl border p-3 animate-pulse motion-reduce:animate-none">
                    <div className="h-4 w-36 rounded bg-muted" />
                    <div className="h-3 w-24 mt-2 rounded bg-muted" />
                  </div>
                ))}
              </div>
            ) : (
              weeks.map((week) => {
                const current = isCurrentWeek(week.weekKey);
                const expanded = expandedWeekKey === week.weekKey;
                const meta = getWeekMeta(groupId, week.weekKey);
                const weekSlots = slotsByWeek.get(week.weekKey) ?? [];
                const filledCount = weekSlots.length;
                const weekCompetitions = competitionsByWeek.get(week.weekKey) ?? [];
                const hasCompetition = weekCompetitions.length > 0;

                return (
                  <div key={week.weekKey} className="relative pl-8 mb-2">
                    {/* Timeline dot */}
                    <div className={cn(
                      "absolute left-[11px] top-3.5 h-[9px] w-[9px] rounded-full ring-2 ring-background transition-colors",
                      hasCompetition
                        ? "bg-amber-500"
                        : current
                          ? "bg-primary"
                          : filledCount > 0
                            ? "bg-emerald-500"
                            : "bg-muted-foreground/25",
                    )} />

                    <div className={cn(
                      "rounded-xl border bg-card transition-all overflow-hidden",
                      current && "ring-2 ring-primary",
                    )}>
                      {/* ── Collapsed header ── */}
                      <button
                        type="button"
                        className="w-full text-left px-3 py-2.5 flex items-center gap-2 min-h-[48px] hover:bg-muted/40 transition-colors active:bg-muted/60"
                        onClick={() => setExpandedWeekKey(expanded ? null : week.weekKey)}
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
                                      setSelectedCompetition(c);
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter" || e.key === " ") {
                                        e.stopPropagation();
                                        setSelectedCompetition(c);
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

                        {/* Chevron */}
                        <motion.span
                          animate={{ rotate: expanded ? 180 : 0 }}
                          transition={{ duration: 0.2 }}
                          className="shrink-0"
                        >
                          <ChevronDown className="h-4 w-4 text-muted-foreground/40" />
                        </motion.span>
                      </button>

                      {/* ── Expanded micro grid (read-only) ── */}
                      <AnimatePresence>
                        {expanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.25, ease: "easeInOut" }}
                            className="overflow-hidden"
                          >
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
                                  const morning = findSlot(week.weekKey, day.index, "morning");
                                  const evening = findSlot(week.weekKey, day.index, "evening");
                                  const dayComps = getDayCompetitions(week.monday, day.index);
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
                                          onClick={() => setSelectedCompetition(primaryComp)}
                                          className="col-span-2 relative h-9 w-full rounded-lg flex items-center gap-1.5 px-2 overflow-hidden
                                                     bg-gradient-to-r from-amber-100 via-amber-50 to-amber-100
                                                     dark:from-amber-900/40 dark:via-amber-900/20 dark:to-amber-900/40
                                                     border border-amber-300/70 dark:border-amber-700/60
                                                     text-amber-900 dark:text-amber-100
                                                     active:scale-[0.98] transition-transform"
                                          aria-label={primaryComp.name}
                                        >
                                          {/* Diagonal stripe accent */}
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
                                          <ReadOnlySlotCell slot={morning} onTap={handleChipTap} />
                                          <ReadOnlySlotCell slot={evening} onTap={handleChipTap} />
                                        </>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                );
              })
            )}

            {/* Sentinel for infinite scroll */}
            <div ref={sentinelRef} className="h-4" />
          </div>
        </div>
      </div>

      {/* ── Filiere Detail Sheet ── */}
      <Sheet open={!!selectedFiliere} onOpenChange={(o) => !o && setSelectedFiliere(null)}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[75dvh] overflow-y-auto">
          <SheetHeader className="pb-0">
            <SheetTitle className="sr-only">{selectedFiliereData?.name ?? "Filière"}</SheetTitle>
            <SheetDescription className="sr-only">Détails de la filière</SheetDescription>
          </SheetHeader>

          {selectedFiliereData && (
            <div className="space-y-4 pb-6">
              {/* Name + dot */}
              <div className="flex items-center gap-2.5">
                <span className={cn("h-3 w-3 rounded-full shrink-0", selectedStyle.dot)} />
                <h3 className="text-[15px] font-semibold text-foreground">{selectedFiliereData.name}</h3>
                {selectedFiliere?.hasSession && (
                  <Link2 className="h-3.5 w-3.5 text-muted-foreground/50 ml-auto" />
                )}
              </div>

              {/* Comparative gauges — quick visual profile */}
              <div
                className={cn(
                  "rounded-2xl border border-border/40 p-3.5 space-y-2.5",
                  "bg-gradient-to-br from-muted/40 to-muted/10",
                )}
              >
                {GAUGE_METRICS.map(({ key, label, icon: Icon, scale }) => {
                  const value = selectedFiliereData.levels[key];
                  return (
                    <div key={key} className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
                      <div className="flex items-center gap-1.5 min-w-[92px]">
                        <Icon className={cn("h-3.5 w-3.5", selectedStyle.text)} strokeWidth={2.5} />
                        <span className="text-[11px] font-semibold text-foreground/85 tracking-tight">
                          {label}
                        </span>
                      </div>
                      <FiliereGauge
                        value={value}
                        fillClass={selectedStyle.fill}
                        trackClass={selectedStyle.track}
                      />
                      <span
                        className={cn(
                          "text-[9px] font-medium uppercase tracking-wider tabular-nums min-w-[54px] text-right",
                          value == null ? "text-muted-foreground/40 italic" : "text-muted-foreground/60",
                        )}
                      >
                        {value == null ? "variable" : value >= 4 ? scale[1] : value <= 2 ? scale[0] : "moyen"}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Description */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 mb-1">
                  Description
                </p>
                <p className="text-[13px] text-foreground/80 leading-relaxed">
                  {selectedFiliereDb?.description || (
                    <span className="text-muted-foreground/40 italic">Pas encore de description</span>
                  )}
                </p>
              </div>

              {/* Examples */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 mb-1">
                  Exemples d'exercices
                </p>
                <p className="text-[13px] text-foreground/80 leading-relaxed whitespace-pre-line">
                  {selectedFiliereDb?.examples || (
                    <span className="text-muted-foreground/40 italic">Pas encore d'exemples</span>
                  )}
                </p>
              </div>

              {/* Divider */}
              <div className="h-px bg-border/50" />

              {/* Technical accordion */}
              <div>
                <button
                  type="button"
                  onClick={() => setTechOpen((p) => !p)}
                  className="flex items-center justify-between w-full py-1 min-h-[44px] active:opacity-70 transition-opacity"
                >
                  <span className="text-[13px] font-medium text-foreground">Détails techniques</span>
                  <motion.span animate={{ rotate: techOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </motion.span>
                </button>

                <AnimatePresence initial={false}>
                  {techOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: "easeInOut" }}
                      className="overflow-hidden"
                    >
                      <div className="grid grid-cols-2 gap-2 pt-2 pb-1">
                        {TECHNICAL_LABELS.map(({ key, label, unit, icon: Icon, full }) => {
                          const val = selectedFiliereData.technicals[key];
                          return (
                            <div
                              key={key}
                              className={cn(
                                "flex items-center gap-2.5 rounded-xl border border-border/40 bg-muted/30 px-2.5 py-2",
                                full && "col-span-2",
                              )}
                            >
                              <div
                                className={cn(
                                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                                  selectedStyle.bg,
                                )}
                              >
                                <Icon className={cn("h-4 w-4", selectedStyle.text)} strokeWidth={2.25} />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/60 leading-tight">
                                  {label}
                                </p>
                                <p className="text-[12px] font-semibold text-foreground leading-tight mt-0.5 truncate">
                                  {val}
                                  {unit && (
                                    <span className="text-muted-foreground/50 text-[10px] font-normal ml-1">
                                      {unit}
                                    </span>
                                  )}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* ── Competition Detail Sheet ── */}
      <Sheet open={!!selectedCompetition} onOpenChange={(o) => !o && setSelectedCompetition(null)}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[70dvh] overflow-y-auto">
          <SheetHeader className="pb-0">
            <SheetTitle className="sr-only">{selectedCompetition?.name ?? "Compétition"}</SheetTitle>
            <SheetDescription className="sr-only">Détails de la compétition</SheetDescription>
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
                  {new Date(selectedCompetition.date.slice(0, 10) + "T00:00:00").toLocaleDateString(
                    "fr-FR",
                    { weekday: "long", day: "2-digit", month: "long", year: "numeric" },
                  )}
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
    </>
  );

  if (embedded) {
    return planningContent;
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 bg-background overflow-hidden"
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 28, stiffness: 300 }}
        >
          {planningContent}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   ReadOnlySlotCell — read-only chip (tap opens filière detail)
   ═══════════════════════════════════════════════════════════════════ */

function ReadOnlySlotCell({
  slot,
  onTap,
}: {
  slot: SwimPlanningSlot | undefined;
  onTap: (filiereId: string, hasSession: boolean) => void;
}) {
  if (!slot) {
    return (
      <div className="h-9 w-full rounded-lg bg-muted/20 dark:bg-muted/10 flex items-center justify-center">
        <span className="text-muted-foreground/20 text-xs">—</span>
      </div>
    );
  }

  const filiere = FILIERE_MAP.get(slot.filiere);
  const color = filiere?.color ?? "sky";
  const style = FILIERE_STYLES[color] ?? FILIERE_STYLES.sky;
  const hasSession = !!slot.session_id;

  return (
    <button
      type="button"
      className={cn(
        "relative h-9 w-full rounded-lg flex items-center justify-center px-1.5 transition-all active:scale-95",
        style.bg,
      )}
      onClick={() => onTap(slot.filiere, hasSession)}
      aria-label={filiere?.name ?? slot.filiere}
    >
      <span className={cn("text-[10px] font-semibold truncate leading-tight", style.text)}>
        {filiere?.short ?? slot.filiere}
      </span>
      {hasSession && (
        <Link2
          className={cn("absolute top-0.5 right-0.5 h-[10px] w-[10px]", style.text, "opacity-60")}
        />
      )}
    </button>
  );
}
