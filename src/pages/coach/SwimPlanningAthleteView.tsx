/**
 * SwimPlanningAthleteView.tsx — Read-only swimmer view of the swim planning
 * Mirrors the coach view (SwimPlanningDemo) exactly, without editing controls.
 * Chips are tappable to see filière details (description, examples, technicals).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/lib/api";
import type { SwimPlanningSlot, SwimFiliere } from "@/lib/api/types";
import { FILIERES, FILIERE_MAP, FILIERE_STYLES, type FiliereTechnicals } from "@/lib/swimFilieres";
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
import { ChevronDown, ChevronLeft, Link2 } from "lucide-react";

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
  saturday: Date;
  weekNumber: number;
  weekKey: string;
}

function generateWeeks(startMonday: Date, count: number): WeekInfo[] {
  return Array.from({ length: count }, (_, i) => {
    const monday = new Date(startMonday);
    monday.setDate(startMonday.getDate() + i * 7);
    const saturday = new Date(monday);
    saturday.setDate(monday.getDate() + 5);
    return { monday, saturday, weekNumber: getISOWeekNumber(monday), weekKey: monday.toISOString().split("T")[0] };
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

function getWeekMeta(groupId: number, weekKey: string): { weekType?: string; notes?: string } {
  try {
    const raw = localStorage.getItem(`swim-plan-meta-${groupId}-${weekKey}`);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

const INITIAL_WEEK_COUNT = 13;
const LOAD_MORE_COUNT = 4;

const TECHNICAL_LABELS: { key: keyof FiliereTechnicals; label: string; unit: string }[] = [
  { key: "heartRate", label: "Fréq. cardiaque", unit: "bpm" },
  { key: "lactate", label: "Lactates", unit: "mmol/L" },
  { key: "effort", label: "Effort perçu", unit: "/20" },
  { key: "duration", label: "Durée série", unit: "" },
  { key: "distance", label: "Distances", unit: "m" },
  { key: "reps", label: "Répétitions", unit: "" },
  { key: "intensity", label: "Intensité", unit: "" },
  { key: "recovery", label: "Récupération", unit: "" },
  { key: "workType", label: "Travail", unit: "" },
];

/* ═══════════════════════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════════════════════ */

interface SwimPlanningAthleteViewProps {
  open: boolean;
  onClose: () => void;
  groupId: number;
}

export default function SwimPlanningAthleteView({ open, onClose, groupId }: SwimPlanningAthleteViewProps) {
  // ── Week generation (infinite scroll, same as coach) ──
  const startMonday = useMemo(() => getMonday(new Date()), []);
  const [weekCount, setWeekCount] = useState(INITIAL_WEEK_COUNT);
  const weeks = useMemo(() => generateWeeks(startMonday, weekCount), [startMonday, weekCount]);
  const visibleWeekKeys = useMemo(() => weeks.map((w) => w.weekKey), [weeks]);

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) setWeekCount((c) => c + LOAD_MORE_COUNT); },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [open]);

  // ── Slots ──
  const { data: slots = [], isLoading: slotsLoading } = useQuery({
    queryKey: ["swim-planning-slots", groupId, visibleWeekKeys],
    queryFn: () => api.getSwimPlanningSlots({ groupId, weekStarts: visibleWeekKeys }),
    enabled: open && !!groupId && visibleWeekKeys.length > 0,
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
    enabled: open,
    staleTime: 10 * 60_000,
  });

  const dbFiliereMap = useMemo(() => {
    const map = new Map<string, SwimFiliere>();
    for (const f of dbFilieres) map.set(f.id, f);
    return map;
  }, [dbFilieres]);

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
          <div className="max-w-lg mx-auto md:max-w-3xl lg:max-w-4xl h-full flex flex-col">
          {/* ── Header ── */}
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

          {/* ── Timeline (same layout as coach view) ── */}
          <div className="overflow-y-auto flex-1">
            <div className="relative px-4 pt-3 pb-24">
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

                  return (
                    <div key={week.weekKey} className="relative pl-8 mb-2">
                      {/* Timeline dot */}
                      <div className={cn(
                        "absolute left-[11px] top-3.5 h-[9px] w-[9px] rounded-full ring-2 ring-background transition-colors",
                        current ? "bg-primary" : filledCount > 0 ? "bg-emerald-500" : "bg-muted-foreground/25",
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
                                  {DAY_ROWS.map((day) => (
                                    <div
                                      key={day.index}
                                      className="grid grid-cols-[48px_1fr_1fr] gap-1 items-center"
                                    >
                                      <span className="text-[11px] font-medium text-muted-foreground pl-0.5">
                                        {day.label}
                                      </span>
                                      <ReadOnlySlotCell
                                        slot={findSlot(week.weekKey, day.index, "morning")}
                                        onTap={handleChipTap}
                                      />
                                      <ReadOnlySlotCell
                                        slot={findSlot(week.weekKey, day.index, "evening")}
                                        onTap={handleChipTap}
                                      />
                                    </div>
                                  ))}
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

          </div>{/* close max-w wrapper */}

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
                          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 pt-2 pb-1">
                            {TECHNICAL_LABELS.map(({ key, label, unit }) => {
                              const val = selectedFiliereData.technicals[key];
                              return (
                                <div key={key}>
                                  <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/50 mb-0.5">
                                    {label}
                                  </p>
                                  <p className="text-[12px] font-medium text-foreground/85">
                                    {val}
                                    {unit && <span className="text-muted-foreground/40 text-[10px] ml-0.5">{unit}</span>}
                                  </p>
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
