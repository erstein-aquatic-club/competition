/**
 * SwimPlanningAthleteView.tsx — Read-only "swimmer view" overlay
 * Vertical timeline (MyPlanTab style) showing 3 weeks of swim planning.
 * Compact, ergonomic, mobile-first.
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ChevronDown, ChevronLeft, Link2 } from "lucide-react";

/* ═══════════════════════════════════════════════════════════════════
   Helpers
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
  { index: 0, label: "Lun", short: "L" },
  { index: 1, label: "Mar", short: "M" },
  { index: 2, label: "Mer", short: "M" },
  { index: 3, label: "Jeu", short: "J" },
  { index: 4, label: "Ven", short: "V" },
  { index: 5, label: "Sam", short: "S" },
] as const;

const DAY_COLORS = [
  "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  "bg-violet-500/15 text-violet-700 dark:text-violet-400",
  "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  "bg-rose-500/15 text-rose-600 dark:text-rose-400",
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

const WEEK_COUNT = 3;

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
  const startMonday = useMemo(() => getMonday(new Date()), []);
  const weeks = useMemo(() => generateWeeks(startMonday, WEEK_COUNT), [startMonday]);
  const weekStarts = useMemo(() => weeks.map((w) => w.weekKey), [weeks]);

  const { data: slots = [], isLoading: slotsLoading } = useQuery({
    queryKey: ["swim-planning-slots", groupId, weekStarts],
    queryFn: () => api.getSwimPlanningSlots({ groupId, weekStarts }),
    enabled: open && !!groupId && weekStarts.length > 0,
  });

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

  const slotsByWeek = useMemo(() => {
    const map = new Map<string, SwimPlanningSlot[]>();
    for (const s of slots) {
      const arr = map.get(s.week_start) ?? [];
      arr.push(s);
      map.set(s.week_start, arr);
    }
    return map;
  }, [slots]);

  // Bottom sheet state
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
          className="fixed inset-0 z-50 bg-background"
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 28, stiffness: 300 }}
        >
          {/* ── Header ── */}
          <div className="sticky top-0 z-10 bg-background/90 backdrop-blur-xl border-b border-border/50">
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
                Ma planification
              </h1>
            </div>
          </div>

          {/* ── Timeline ── */}
          <div className="overflow-y-auto h-[calc(100dvh-52px)]">
            {slotsLoading ? (
              <div className="px-4 pt-4 space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="space-y-2">
                    <div className="h-4 w-40 rounded bg-muted animate-pulse" />
                    <div className="h-12 w-full rounded-xl bg-muted animate-pulse" />
                    <div className="h-12 w-full rounded-xl bg-muted animate-pulse" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="relative px-4 pt-3 pb-16">
                {/* Vertical rail */}
                <div className="absolute left-[27px] top-8 bottom-8 w-px bg-border" />

                {weeks.map((week, weekIdx) => {
                  const current = isCurrentWeek(week.weekKey);
                  const meta = getWeekMeta(groupId, week.weekKey);
                  const weekSlots = slotsByWeek.get(week.weekKey) ?? [];
                  const slotMap = new Map<string, SwimPlanningSlot>();
                  for (const s of weekSlots) slotMap.set(`${s.day_of_week}-${s.time_slot}`, s);

                  return (
                    <motion.div
                      key={week.weekKey}
                      className="relative pl-8 mb-5"
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: weekIdx * 0.06, duration: 0.3 }}
                    >
                      {/* Timeline dot */}
                      <div className={cn(
                        "absolute left-[11px] top-1 h-[9px] w-[9px] rounded-full ring-2 ring-background",
                        current ? "bg-primary" : weekSlots.length > 0 ? "bg-emerald-500" : "bg-muted-foreground/25",
                      )} />

                      {/* Week header */}
                      <div className="mb-2">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold tracking-wide uppercase",
                            current
                              ? "bg-primary/15 text-primary"
                              : "bg-muted text-muted-foreground",
                          )}>
                            S{week.weekNumber}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {fmtDD_MM(week.monday)} – {fmtDD_MM(week.saturday)}
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
                        </div>
                        {meta.notes && (
                          <p className="text-[11px] text-muted-foreground/70 mt-0.5 italic line-clamp-1">
                            {meta.notes}
                          </p>
                        )}
                      </div>

                      {/* Day rows — grid with Matin/Soir columns */}
                      <div className={cn(
                        "rounded-xl border-l-[3px] overflow-hidden bg-card",
                        current ? "border-l-primary" : "border-l-border",
                      )}>
                        {/* Column headers */}
                        <div className="grid grid-cols-[40px_1fr_1fr] gap-1 px-2.5 pt-2 pb-1">
                          <div />
                          <span className="text-[9px] font-semibold text-muted-foreground/50 uppercase tracking-wider text-center">
                            Matin
                          </span>
                          <span className="text-[9px] font-semibold text-muted-foreground/50 uppercase tracking-wider text-center">
                            Soir
                          </span>
                        </div>

                        {/* Day rows */}
                        <div className="px-2.5 pb-2 space-y-1">
                          {DAY_ROWS.map((day) => {
                            const morning = slotMap.get(`${day.index}-morning`);
                            const evening = slotMap.get(`${day.index}-evening`);
                            if (!morning && !evening) return null;

                            return (
                              <div
                                key={day.index}
                                className="grid grid-cols-[40px_1fr_1fr] gap-1 items-center"
                              >
                                {/* Day badge */}
                                <span className={cn(
                                  "inline-flex items-center justify-center rounded-md px-1 py-0.5 text-[10px] font-bold",
                                  DAY_COLORS[day.index],
                                )}>
                                  {day.label}
                                </span>

                                {/* Morning cell */}
                                {morning ? (
                                  <FiliereChip slot={morning} onTap={handleChipTap} />
                                ) : (
                                  <div className="h-[28px] rounded-lg bg-muted/20 flex items-center justify-center">
                                    <span className="text-muted-foreground/20 text-[10px]">—</span>
                                  </div>
                                )}

                                {/* Evening cell */}
                                {evening ? (
                                  <FiliereChip slot={evening} onTap={handleChipTap} />
                                ) : (
                                  <div className="h-[28px] rounded-lg bg-muted/20 flex items-center justify-center">
                                    <span className="text-muted-foreground/20 text-[10px]">—</span>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* Empty week */}
                        {weekSlots.length === 0 && (
                          <div className="px-3 py-3">
                            <p className="text-[11px] text-muted-foreground/40 italic">
                              Pas de séances planifiées
                            </p>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  );
                })}

                {/* End dot */}
                <div className="relative pl-8">
                  <div className="absolute left-[11px] top-1 h-[9px] w-[9px] rounded-full bg-muted-foreground/20 ring-2 ring-background" />
                  <p className="text-[11px] text-muted-foreground/40 font-medium">Fin de la planification</p>
                </div>
              </div>
            )}
          </div>

          {/* ── Filiere Detail Sheet ── */}
          <Sheet open={!!selectedFiliere} onOpenChange={(o) => !o && setSelectedFiliere(null)}>
            <SheetContent side="bottom" className="rounded-t-2xl max-h-[75vh] overflow-y-auto">
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
   Filiere Chip — inline colored tag (read-only, tappable)
   ═══════════════════════════════════════════════════════════════════ */

function FiliereChip({
  slot,
  onTap,
}: {
  slot: SwimPlanningSlot;
  onTap: (filiereId: string, hasSession: boolean) => void;
}) {
  const filiere = FILIERE_MAP.get(slot.filiere);
  const style = filiere ? FILIERE_STYLES[filiere.color] ?? FILIERE_STYLES.sky : FILIERE_STYLES.sky;
  const hasSession = !!slot.session_id;

  return (
    <button
      type="button"
      onClick={() => onTap(slot.filiere, hasSession)}
      className={cn(
        "inline-flex items-center gap-1 rounded-lg px-2 py-1 min-h-[28px] transition-all active:scale-[0.96]",
        style.bg,
      )}
    >
      <span className={cn("text-[10px] font-semibold truncate leading-tight", style.text)}>
        {filiere?.short ?? slot.filiere}
      </span>
      {hasSession && (
        <Link2 className={cn("h-[10px] w-[10px] shrink-0 opacity-50", style.text)} />
      )}
    </button>
  );
}
