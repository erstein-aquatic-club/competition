/**
 * SwimPlanningAthleteView.tsx — Read-only "swimmer view" overlay
 * Shows 3 weeks of swim planning (current + 2 next) in a clean, athlete-facing layout.
 * Opened from the coach planning page via a preview button.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/lib/api";
import type { SwimPlanningSlot, SwimFiliere } from "@/lib/api/types";
import { FILIERES, FILIERE_MAP, FILIERE_STYLES, type FiliereTechnicals } from "@/lib/swimFilieres";
import { weekTypeColor, weekTypeTextColor } from "@/lib/weekTypeColor";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ChevronDown, ChevronLeft, Link2, X } from "lucide-react";

/* ═══════════════════════════════════════════════════════════════════
   Helpers (duplicated from SwimPlanningDemo for isolation)
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
  weekKey: string;
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

const WEEK_COUNT = 3;

/** Technical parameter labels */
const TECHNICAL_LABELS: { key: keyof FiliereTechnicals; label: string; icon: string }[] = [
  { key: "heartRate", label: "Freq. cardiaque", icon: "bpm" },
  { key: "lactate", label: "Lactates", icon: "mmol/L" },
  { key: "effort", label: "Perception effort", icon: "/20" },
  { key: "duration", label: "Duree serie", icon: "" },
  { key: "distance", label: "Distances", icon: "m" },
  { key: "reps", label: "Repetitions", icon: "" },
  { key: "intensity", label: "Intensite", icon: "" },
  { key: "recovery", label: "Recuperation", icon: "" },
  { key: "workType", label: "Formes de travail", icon: "" },
];

/* ═══════════════════════════════════════════════════════════════════
   Props
   ═══════════════════════════════════════════════════════════════════ */

interface SwimPlanningAthleteViewProps {
  open: boolean;
  onClose: () => void;
  groupId: number;
}

/* ═══════════════════════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════════════════════ */

export default function SwimPlanningAthleteView({
  open,
  onClose,
  groupId,
}: SwimPlanningAthleteViewProps) {
  // Generate 3 weeks starting from current week
  const startMonday = useMemo(() => getMonday(new Date()), []);
  const weeks = useMemo(() => generateWeeks(startMonday, WEEK_COUNT), [startMonday]);
  const weekStarts = useMemo(() => weeks.map((w) => w.weekKey), [weeks]);

  // Fetch slots
  const { data: slots = [], isLoading: slotsLoading } = useQuery({
    queryKey: ["swim-planning-slots-athlete", groupId, weekStarts],
    queryFn: () => api.getSwimPlanningSlots({ groupId, weekStarts }),
    enabled: open && !!groupId && weekStarts.length > 0,
  });

  // Fetch DB filiere descriptions
  const { data: dbFilieres = [] } = useQuery({
    queryKey: ["swim-filieres"],
    queryFn: () => api.getSwimFilieres(),
    enabled: open,
    staleTime: 10 * 60_000,
  });

  // Index DB filieres by ID
  const dbFiliereMap = useMemo(() => {
    const map = new Map<string, SwimFiliere>();
    for (const f of dbFilieres) map.set(f.id, f);
    return map;
  }, [dbFilieres]);

  // Index slots by week
  const slotsByWeek = useMemo(() => {
    const map = new Map<string, SwimPlanningSlot[]>();
    for (const s of slots) {
      const arr = map.get(s.week_start) ?? [];
      arr.push(s);
      map.set(s.week_start, arr);
    }
    return map;
  }, [slots]);

  // Bottom sheet for filiere detail
  const [selectedFiliere, setSelectedFiliere] = useState<{
    filiereId: string;
    hasSession: boolean;
  } | null>(null);

  // Technical accordion state
  const [techOpen, setTechOpen] = useState(false);

  const handleChipTap = (filiereId: string, hasSession: boolean) => {
    setSelectedFiliere({ filiereId, hasSession });
    setTechOpen(false);
  };

  const handleCloseSheet = () => {
    setSelectedFiliere(null);
    setTechOpen(false);
  };

  // Find filiere data
  const selectedFiliereData = selectedFiliere
    ? FILIERE_MAP.get(selectedFiliere.filiereId)
    : null;
  const selectedFiliereDb = selectedFiliere
    ? dbFiliereMap.get(selectedFiliere.filiereId)
    : null;
  const selectedStyle = selectedFiliereData
    ? FILIERE_STYLES[selectedFiliereData.color] ?? FILIERE_STYLES.sky
    : FILIERE_STYLES.sky;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 bg-background"
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 28, stiffness: 300 }}
        >
          {/* ── Sticky Header ── */}
          <div className="sticky top-0 z-10 bg-background/90 backdrop-blur-xl border-b border-border/50">
            <div className="flex items-center gap-3 px-4 py-3">
              <button
                type="button"
                onClick={onClose}
                className="flex items-center justify-center h-11 w-11 -ml-2 rounded-xl active:bg-muted/60 transition-colors"
                aria-label="Fermer"
              >
                <ChevronLeft className="h-5 w-5 text-foreground" />
              </button>
              <div className="flex-1 min-w-0">
                <h1 className="text-[17px] font-semibold tracking-tight text-foreground">
                  Ma planification
                </h1>
              </div>
            </div>
          </div>

          {/* ── Content ── */}
          <div className="overflow-y-auto h-[calc(100dvh-56px)] pb-12">
            {slotsLoading ? (
              <div className="px-5 pt-5 space-y-5">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="rounded-2xl border border-border/50 p-4 space-y-3 animate-pulse">
                    <div className="h-4 w-44 rounded-lg bg-muted" />
                    <div className="grid grid-cols-[48px_1fr_1fr] gap-1.5">
                      {Array.from({ length: 18 }).map((_, j) => (
                        <div key={j} className="h-9 rounded-lg bg-muted/60" />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-5 pt-5 space-y-5">
                {weeks.map((week, weekIdx) => {
                  const current = isCurrentWeek(week.weekKey);
                  const meta = getWeekMeta(groupId, week.weekKey);
                  const weekSlots = slotsByWeek.get(week.weekKey) ?? [];

                  return (
                    <motion.div
                      key={week.weekKey}
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: weekIdx * 0.08, duration: 0.35 }}
                    >
                      <WeekSection
                        week={week}
                        isCurrent={current}
                        meta={meta}
                        weekSlots={weekSlots}
                        onChipTap={handleChipTap}
                      />
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Filiere Detail Bottom Sheet ── */}
          <Sheet open={!!selectedFiliere} onOpenChange={(open) => !open && handleCloseSheet()}>
            <SheetContent side="bottom" className="rounded-t-2xl max-h-[80vh] overflow-y-auto">
              <SheetHeader className="pb-1">
                <SheetTitle className="sr-only">
                  {selectedFiliereData?.name ?? "Filiere"}
                </SheetTitle>
                <SheetDescription className="sr-only">
                  Details de la filiere
                </SheetDescription>
              </SheetHeader>

              {selectedFiliereData && (
                <div className="space-y-5 pb-6">
                  {/* Section A: name + description + examples */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2.5">
                      <div className={cn("h-3 w-3 rounded-full shrink-0", selectedStyle.dot)} />
                      <h3 className="text-base font-semibold text-foreground">
                        {selectedFiliereData.name}
                      </h3>
                      {selectedFiliere?.hasSession && (
                        <Link2 className="h-3.5 w-3.5 text-muted-foreground/60 ml-auto" />
                      )}
                    </div>

                    <div className="space-y-2 pl-[22px]">
                      <div>
                        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70 mb-0.5">
                          Description
                        </p>
                        <p className="text-sm text-foreground/80 leading-relaxed">
                          {selectedFiliereDb?.description || (
                            <span className="text-muted-foreground/50 italic">
                              Pas de description
                            </span>
                          )}
                        </p>
                      </div>

                      <div>
                        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70 mb-0.5">
                          Exemples
                        </p>
                        <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-line">
                          {selectedFiliereDb?.examples || (
                            <span className="text-muted-foreground/50 italic">
                              Pas d'exemples
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Divider */}
                  <div className="h-px bg-border/50" />

                  {/* Section B: Technical accordion */}
                  <div>
                    <button
                      type="button"
                      onClick={() => setTechOpen((prev) => !prev)}
                      className="flex items-center justify-between w-full py-2 active:opacity-70 transition-opacity min-h-[44px]"
                    >
                      <span className="text-sm font-medium text-foreground">
                        Details techniques
                      </span>
                      <motion.span
                        animate={{ rotate: techOpen ? 180 : 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      </motion.span>
                    </button>

                    <AnimatePresence initial={false}>
                      {techOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.25, ease: "easeInOut" }}
                          className="overflow-hidden"
                        >
                          <div className="grid grid-cols-2 gap-x-4 gap-y-3 pt-2 pb-1">
                            {TECHNICAL_LABELS.map(({ key, label, icon }) => {
                              const value = selectedFiliereData.technicals[key];
                              return (
                                <div key={key} className="min-w-0">
                                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60 mb-0.5 truncate">
                                    {label}
                                  </p>
                                  <p className="text-[13px] font-medium text-foreground/90">
                                    {value}
                                    {icon && (
                                      <span className="text-muted-foreground/50 text-[10px] ml-0.5">
                                        {icon}
                                      </span>
                                    )}
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
   Week Section
   ═══════════════════════════════════════════════════════════════════ */

function WeekSection({
  week,
  isCurrent,
  meta,
  weekSlots,
  onChipTap,
}: {
  week: WeekInfo;
  isCurrent: boolean;
  meta: { weekType?: string; notes?: string };
  weekSlots: SwimPlanningSlot[];
  onChipTap: (filiereId: string, hasSession: boolean) => void;
}) {
  // Build lookup for fast cell access
  const slotLookup = useMemo(() => {
    const map = new Map<string, SwimPlanningSlot>();
    for (const s of weekSlots) {
      map.set(`${s.day_of_week}-${s.time_slot}`, s);
    }
    return map;
  }, [weekSlots]);

  return (
    <div
      className={cn(
        "rounded-2xl border overflow-hidden transition-colors",
        isCurrent
          ? "border-primary/30 bg-primary/[0.03] dark:bg-primary/[0.06]"
          : "border-border/50 bg-card/50",
      )}
    >
      {/* Week header */}
      <div
        className={cn(
          "px-4 py-3 flex items-center gap-2 flex-wrap",
          isCurrent && "bg-primary/[0.04] dark:bg-primary/[0.08]",
        )}
      >
        <span
          className={cn(
            "text-sm font-semibold",
            isCurrent ? "text-primary" : "text-foreground",
          )}
        >
          S{week.weekNumber}
        </span>
        <span className="text-xs text-muted-foreground">
          {fmtDD_MM(week.monday)} – {fmtDD_MM(week.saturday)}
        </span>
        {meta.weekType && (
          <Badge
            variant="secondary"
            className="text-[10px] px-1.5 py-0 font-medium border-0 ml-auto"
            style={{
              backgroundColor: weekTypeColor(meta.weekType),
              color: weekTypeTextColor(meta.weekType),
            }}
          >
            {meta.weekType}
          </Badge>
        )}
        {isCurrent && !meta.weekType && (
          <Badge
            variant="secondary"
            className="text-[10px] px-1.5 py-0 font-medium border-0 bg-primary/10 text-primary ml-auto"
          >
            Semaine en cours
          </Badge>
        )}
      </div>

      {/* Notes if any */}
      {meta.notes && (
        <div className="px-4 pb-2 -mt-1">
          <p className="text-[11px] text-muted-foreground leading-snug italic">
            {meta.notes}
          </p>
        </div>
      )}

      {/* Grid: Day labels + Morning + Evening */}
      <div className="px-3 pb-3">
        {/* Column headers */}
        <div className="grid grid-cols-[48px_1fr_1fr] gap-1.5 mb-1.5">
          <div />
          <div className="text-center">
            <span className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">
              Matin
            </span>
          </div>
          <div className="text-center">
            <span className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">
              Soir
            </span>
          </div>
        </div>

        {/* Day rows */}
        {DAY_ROWS.map(({ index: dayIndex, label }) => (
          <div
            key={dayIndex}
            className="grid grid-cols-[48px_1fr_1fr] gap-1.5 mb-1"
          >
            {/* Day label */}
            <div className="flex items-center justify-center h-10">
              <span className="text-xs font-medium text-muted-foreground/70">
                {label}
              </span>
            </div>

            {/* Morning cell */}
            <FiliereCell
              slot={slotLookup.get(`${dayIndex}-morning`)}
              onTap={onChipTap}
            />

            {/* Evening cell */}
            <FiliereCell
              slot={slotLookup.get(`${dayIndex}-evening`)}
              onTap={onChipTap}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Filiere Cell (single chip or empty)
   ═══════════════════════════════════════════════════════════════════ */

function FiliereCell({
  slot,
  onTap,
}: {
  slot?: SwimPlanningSlot;
  onTap: (filiereId: string, hasSession: boolean) => void;
}) {
  if (!slot) {
    return (
      <div className="flex items-center justify-center h-10 rounded-xl bg-muted/30 dark:bg-muted/10">
        <span className="text-muted-foreground/25 text-xs">—</span>
      </div>
    );
  }

  const filiere = FILIERE_MAP.get(slot.filiere);
  const style = filiere
    ? FILIERE_STYLES[filiere.color] ?? FILIERE_STYLES.sky
    : FILIERE_STYLES.sky;
  const hasSession = !!slot.session_id;

  return (
    <button
      type="button"
      onClick={() => onTap(slot.filiere, hasSession)}
      className={cn(
        "flex items-center justify-center gap-1 h-10 rounded-xl px-2 transition-all",
        "active:scale-[0.96] active:opacity-80",
        style.bg,
        "min-h-[44px]",
      )}
    >
      <span className={cn("text-[11px] font-semibold truncate leading-tight", style.text)}>
        {filiere?.short ?? slot.filiere}
      </span>
      {hasSession && (
        <Link2 className={cn("h-3 w-3 shrink-0 opacity-60", style.text)} />
      )}
    </button>
  );
}
