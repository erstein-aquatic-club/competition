import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getPlannedAbsences,
  getSwimmerSlots,
  hasCustomSlots,
  getTrainingSlotsForGroup,
  initSwimmerSlots,
  resetSwimmerSlots,
  deleteSwimmerSlot,
  createSwimmerSlot,
  updateSwimmerSlot,
} from "@/lib/api";
import type { SwimmerTrainingSlot, SwimmerTrainingSlotInput } from "@/lib/api/types";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Link2, Plus, RotateCcw, Trash2, Clock, MapPin, Ban, ChevronLeft, ChevronRight } from "lucide-react";

const DAYS_FR = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const DAYS_SHORT = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

/** Convert "HH:MM" or "HH:MM:SS" to minutes since midnight */
function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/** Duration label (e.g. "1h30", "45min") */
function durationLabel(start: string, end: string): string {
  const diff = timeToMinutes(end) - timeToMinutes(start);
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h${String(m).padStart(2, "0")}`;
}

/** True if slot is a swimming session (vs PPG/muscu) — based on explicit session_type */
function isSwimSlot(slot: { session_type?: "swim" | "strength" | null }): boolean {
  return (slot.session_type ?? "swim") === "swim";
}

type Props = {
  athleteId: number;
  athleteName: string;
  groupId: number;
};

export default function SwimmerSlotsTab({ athleteId, athleteName, groupId }: Props) {
  const { userId } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  // ── Week offset (0 = current week, +1 = next, etc.) ──
  const [weekOffset, setWeekOffset] = useState(0);

  const weekRange = useMemo(() => {
    const now = new Date();
    const jsDay = now.getDay(); // 0=Sun
    const mondayOffset = jsDay === 0 ? -6 : 1 - jsDay;
    const monday = new Date(now);
    monday.setDate(now.getDate() + mondayOffset + weekOffset * 7);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    return { from: fmt(monday), to: fmt(sunday), monday, sunday };
  }, [weekOffset]);

  const { data: absences = [] } = useQuery({
    queryKey: ["planned-absences", athleteId, weekRange.from],
    queryFn: () => getPlannedAbsences({ userId: athleteId, from: weekRange.from, to: weekRange.to }),
  });

  // Map day_of_week (1=Mon) → absence for the current week
  const absenceByDay = useMemo(() => {
    const map = new Map<number, { date: string; reason?: string | null }>();
    for (const a of absences) {
      const d = new Date(a.date + "T00:00:00");
      const jsDay = d.getDay(); // 0=Sun
      const dow = jsDay === 0 ? 7 : jsDay;
      map.set(dow, { date: a.date, reason: a.reason });
    }
    return map;
  }, [absences]);

  // ── Queries ─────────────────────────────────────
  const { data: customSlots, isLoading } = useQuery({
    queryKey: ["swimmer-slots", athleteId],
    queryFn: () => getSwimmerSlots(athleteId),
  });

  const { data: hasCustom } = useQuery({
    queryKey: ["swimmer-slots-exists", athleteId],
    queryFn: () => hasCustomSlots(athleteId),
  });

  const { data: groupSlots = [] } = useQuery({
    queryKey: ["training-slots", "group", groupId],
    queryFn: () => getTrainingSlotsForGroup(groupId),
  });

  const hasPersonalSlots = hasCustom === true;
  const displaySlots = hasPersonalSlots ? (customSlots ?? []) : [];

  // ── Mutations ───────────────────────────────────
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["swimmer-slots", athleteId] });
    qc.invalidateQueries({ queryKey: ["swimmer-slots-exists", athleteId] });
  };

  const initMut = useMutation({
    mutationFn: () => initSwimmerSlots(athleteId, groupId, userId!),
    onSuccess: () => { invalidate(); toast({ title: "Planning personnalisé créé" }); },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const resetMut = useMutation({
    mutationFn: () => resetSwimmerSlots(athleteId, groupId, userId!),
    onSuccess: () => { invalidate(); toast({ title: "Planning réinitialisé" }); },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (slotId: string) => deleteSwimmerSlot(slotId),
    onSuccess: () => { invalidate(); toast({ title: "Créneau supprimé" }); },
  });

  const createMut = useMutation({
    mutationFn: (input: SwimmerTrainingSlotInput) => createSwimmerSlot(input, userId!),
    onSuccess: () => { invalidate(); toast({ title: "Créneau ajouté" }); },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: ({ slotId, input }: { slotId: string; input: Partial<SwimmerTrainingSlotInput> }) =>
      updateSwimmerSlot(slotId, input),
    onSuccess: () => { invalidate(); toast({ title: "Créneau modifié" }); },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  // ── Sheet state for add/edit ────────────────────
  const [editSlot, setEditSlot] = useState<SwimmerTrainingSlot | null>(null);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // ── Selected day (1=Mon...7=Sun), default to today ──
  const [selectedDay, setSelectedDay] = useState<number>(() => {
    const jsDay = new Date().getDay(); // 0=Sun
    return jsDay === 0 ? 7 : jsDay;
  });

  // ── Group slots by day ──────────────────────────
  const slotsByDay = useMemo(() => {
    const source = hasPersonalSlots ? displaySlots : groupSlots;
    const map = new Map<number, typeof source>();
    for (const s of source) {
      const list = map.get(s.day_of_week) ?? [];
      list.push(s as any);
      map.set(s.day_of_week, list);
    }
    // Sort each day by start_time
    for (const list of map.values()) {
      list.sort((a, b) => a.start_time.localeCompare(b.start_time));
    }
    return map;
  }, [hasPersonalSlots, displaySlots, groupSlots]);

  // ── Mini-strip time range for slot indicators ───
  const stripRange = useMemo(() => {
    let minH = 22;
    let maxH = 6;
    slotsByDay.forEach((daySlots) => {
      for (const s of daySlots) {
        const startH = Math.floor(timeToMinutes(s.start_time) / 60);
        const endH = Math.ceil(timeToMinutes(s.end_time) / 60);
        if (startH < minH) minH = startH;
        if (endH > maxH) maxH = endH;
      }
    });
    if (minH >= maxH) return { start: 6, end: 22 };
    return { start: Math.max(0, minH), end: Math.min(24, maxH) };
  }, [slotsByDay]);

  const stripTotalMin = (stripRange.end - stripRange.start) * 60;
  const todayDow = (() => { const d = new Date().getDay(); return d === 0 ? 7 : d; })();
  const selectedDaySlots = slotsByDay.get(selectedDay) ?? [];

  // ── Loading ─────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 rounded-lg" />
        ))}
      </div>
    );
  }

  // ── Render ──────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Header actions */}
      <div className="flex items-center justify-between gap-2">
        {!hasPersonalSlots ? (
          <Button size="sm" onClick={() => initMut.mutate()} disabled={initMut.isPending}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Personnaliser le planning
          </Button>
        ) : (
          <>
            <Button size="sm" variant="outline" onClick={() => setShowAddSheet(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Ajouter
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmReset(true)}>
              <RotateCcw className="h-3.5 w-3.5 mr-1" />
              Réinitialiser
            </Button>
          </>
        )}
      </div>

      {/* Banner when inheriting */}
      {!hasPersonalSlots && groupSlots.length > 0 && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 px-3 py-2 text-sm text-blue-700 dark:text-blue-300">
          Hérite du planning du groupe. Cliquez sur &laquo; Personnaliser &raquo; pour ajuster.
        </div>
      )}

      {/* ── Week navigation ── */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          className="h-8 w-8 rounded-lg border border-border bg-card flex items-center justify-center hover:bg-muted transition active:scale-95"
          onClick={() => setWeekOffset((o) => o - 1)}
          aria-label="Semaine précédente"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="text-xs font-medium text-muted-foreground hover:text-foreground transition"
          onClick={() => setWeekOffset(0)}
          title="Revenir à cette semaine"
        >
          {weekOffset === 0
            ? "Cette semaine"
            : `${weekRange.monday.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} – ${weekRange.sunday.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}`}
        </button>
        <button
          type="button"
          className="h-8 w-8 rounded-lg border border-border bg-card flex items-center justify-center hover:bg-muted transition active:scale-95"
          onClick={() => setWeekOffset((o) => o + 1)}
          aria-label="Semaine suivante"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* ── 7-column week strip ── */}
      <div className="grid grid-cols-7 gap-0 rounded-xl border border-border bg-card overflow-hidden">
        {[1, 2, 3, 4, 5, 6, 7].map((dow) => {
          const isToday = weekOffset === 0 && dow === todayDow;
          const isSelected = dow === selectedDay;
          const daySlots = slotsByDay.get(dow) ?? [];
          const dayAbsence = absenceByDay.get(dow);
          const dayDate = new Date(weekRange.monday);
          dayDate.setDate(weekRange.monday.getDate() + (dow - 1));
          const dayNum = dayDate.getDate();

          return (
            <button
              key={dow}
              type="button"
              className={`flex flex-col items-center py-2 transition-colors relative ${
                dayAbsence
                  ? isSelected ? "bg-status-error/8" : "bg-status-error/5"
                  : isSelected
                    ? "bg-primary/8"
                    : "hover:bg-muted/50 active:bg-muted"
              }`}
              onClick={() => setSelectedDay(dow)}
            >
              {/* Day label */}
              <span className={`text-[10px] font-semibold uppercase tracking-wider ${
                dayAbsence ? "text-status-error" : isToday ? "text-primary" : "text-muted-foreground"
              }`}>
                {DAYS_SHORT[dow - 1]}
              </span>
              <span className={`text-[9px] tabular-nums ${
                dayAbsence ? "text-status-error" : "text-muted-foreground/60"
              }`}>
                {dayNum}
              </span>

              {/* Slot count dot */}
              <span className={`relative text-xs font-bold tabular-nums mt-0.5 h-7 w-7 flex items-center justify-center rounded-full ${
                dayAbsence
                  ? "bg-status-error/15 text-status-error"
                  : isToday
                    ? "bg-primary text-primary-foreground"
                    : isSelected
                      ? "text-foreground"
                      : "text-foreground/80"
              }`}>
                {dayAbsence ? <Ban className="h-3.5 w-3.5" /> : (daySlots.length || "·")}
              </span>

              {/* Mini slot bars */}
              <div className="w-full px-1 mt-1.5 h-8 relative">
                {daySlots.map((slot: any) => {
                  const startMin = timeToMinutes(slot.start_time) - stripRange.start * 60;
                  const endMin = timeToMinutes(slot.end_time) - stripRange.start * 60;
                  const topPct = Math.max(0, (startMin / stripTotalMin) * 100);
                  const heightPct = Math.max(8, ((endMin - startMin) / stripTotalMin) * 100);
                  const swim = isSwimSlot(slot);

                  return (
                    <div
                      key={slot.id}
                      className={`absolute left-1 right-1 rounded-sm ${
                        swim ? "bg-blue-500/40" : "bg-amber-400/50"
                      }`}
                      style={{
                        top: `${topPct}%`,
                        height: `${heightPct}%`,
                        minHeight: "3px",
                      }}
                    />
                  );
                })}
              </div>

              {/* Selection indicator line */}
              {isSelected && (
                <div className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-primary" />
              )}
            </button>
          );
        })}
      </div>

      {/* ── Day detail: slot cards ── */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground px-0.5">
          {DAYS_FR[selectedDay - 1]}
          {weekOffset !== 0 && (
            <span className="text-muted-foreground font-normal ml-1">
              {(() => {
                const d = new Date(weekRange.monday);
                d.setDate(weekRange.monday.getDate() + (selectedDay - 1));
                return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
              })()}
            </span>
          )}
        </h3>

        {/* Absence banner */}
        {absenceByDay.get(selectedDay) && (
          <div className="rounded-lg border border-status-error/20 bg-status-error-bg px-3 py-2 flex items-start gap-2">
            <Ban className="h-4 w-4 text-status-error flex-shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-status-error">Absence déclarée</p>
              {absenceByDay.get(selectedDay)?.reason && (
                <p className="text-xs text-status-error/80 mt-0.5">
                  {absenceByDay.get(selectedDay)!.reason}
                </p>
              )}
            </div>
          </div>
        )}

        {selectedDaySlots.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 py-8 text-center">
            <p className="text-sm text-muted-foreground">Aucun créneau</p>
          </div>
        ) : (
          <div className="space-y-2">
            {selectedDaySlots.map((s: any) => {
              const swim = isSwimSlot(s);
              return (
                <button
                  key={s.id}
                  type="button"
                  className="w-full text-left rounded-xl border border-border bg-card transition-all active:scale-[0.98] hover:border-border/80"
                  onClick={() => hasPersonalSlots ? setEditSlot(s) : undefined}
                >
                  <div className="flex">
                    {/* Color accent bar */}
                    <div className={`w-1 rounded-l-xl flex-shrink-0 ${
                      swim ? "bg-blue-500" : "bg-amber-400"
                    }`} />

                    <div className="flex-1 px-3 py-2.5 min-w-0">
                      {/* Time row */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold tabular-nums text-foreground">
                            {(s.start_time as string).slice(0, 5)} – {(s.end_time as string).slice(0, 5)}
                          </span>
                          <span className={`text-xs tabular-nums px-1.5 py-0.5 rounded-md font-medium ${
                            swim
                              ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                              : "bg-amber-400/10 text-amber-600 dark:text-amber-400"
                          }`}>
                            {durationLabel(s.start_time, s.end_time)}
                          </span>
                        </div>
                        {hasPersonalSlots && (s as SwimmerTrainingSlot).source_assignment_id && (
                          <Link2 className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />
                        )}
                      </div>

                      {/* Location */}
                      <div className="flex items-center gap-1.5 mt-1">
                        <MapPin className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                        <span className="text-xs text-muted-foreground truncate">
                          {s.location}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Confirm reset dialog */}
      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Réinitialiser le planning ?</AlertDialogTitle>
            <AlertDialogDescription>
              Tous les créneaux personnalisés seront supprimés et remplacés par ceux du groupe.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { resetMut.mutate(); setConfirmReset(false); }}
            >
              Réinitialiser
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce créneau ?</AlertDialogTitle>
            <AlertDialogDescription>Le créneau sera retiré du planning personnel.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (deleteTarget) deleteMut.mutate(deleteTarget); setDeleteTarget(null); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit sheet */}
      <Sheet open={!!editSlot} onOpenChange={(open) => !open && setEditSlot(null)}>
        <SheetContent side="bottom" className="max-h-[80dvh]">
          <SheetHeader>
            <SheetTitle>Modifier le créneau</SheetTitle>
            <SheetDescription>Ajustez les horaires ou le lieu</SheetDescription>
          </SheetHeader>
          {editSlot && (
            <SlotEditForm
              slot={editSlot}
              onSave={(input) => {
                updateMut.mutate({ slotId: editSlot.id, input });
                setEditSlot(null);
              }}
              onDelete={() => { setDeleteTarget(editSlot.id); setEditSlot(null); }}
              isPending={updateMut.isPending}
            />
          )}
        </SheetContent>
      </Sheet>

      {/* Add sheet */}
      <Sheet open={showAddSheet} onOpenChange={setShowAddSheet}>
        <SheetContent side="bottom" className="max-h-[80dvh]">
          <SheetHeader>
            <SheetTitle>Ajouter un créneau</SheetTitle>
            <SheetDescription>Nouveau créneau personnalisé</SheetDescription>
          </SheetHeader>
          <SlotAddForm
            onSave={(input) => {
              createMut.mutate({ ...input, user_id: athleteId });
              setShowAddSheet(false);
            }}
            isPending={createMut.isPending}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ── Session type toggle (swim vs strength) ──────

function SessionTypeToggle({
  value,
  onChange,
}: {
  value: "swim" | "strength";
  onChange: (v: "swim" | "strength") => void;
}) {
  return (
    <div>
      <Label>Type de séance</Label>
      <div className="mt-1 grid grid-cols-2 gap-2">
        {(
          [
            { id: "swim", label: "Natation", dot: "bg-blue-500" },
            { id: "strength", label: "Musculation", dot: "bg-amber-400" },
          ] as const
        ).map((opt) => {
          const active = value === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChange(opt.id)}
              className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-muted"
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${opt.dot}`} />
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Slot Edit Form (inline) ─────────────────────

function SlotEditForm({
  slot,
  onSave,
  onDelete,
  isPending,
}: {
  slot: SwimmerTrainingSlot;
  onSave: (input: Partial<SwimmerTrainingSlotInput>) => void;
  onDelete: () => void;
  isPending: boolean;
}) {
  const [startTime, setStartTime] = useState(slot.start_time.slice(0, 5));
  const [endTime, setEndTime] = useState(slot.end_time.slice(0, 5));
  const [location, setLocation] = useState(slot.location);
  const [sessionType, setSessionType] = useState<"swim" | "strength">(slot.session_type ?? "swim");

  return (
    <div className="space-y-4 pt-4">
      <SessionTypeToggle value={sessionType} onChange={setSessionType} />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="slot-edit-start">Début</Label>
          <Input id="slot-edit-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="slot-edit-end">Fin</Label>
          <Input id="slot-edit-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        </div>
      </div>
      <div>
        <Label htmlFor="slot-edit-location">Lieu</Label>
        <Input id="slot-edit-location" value={location} onChange={(e) => setLocation(e.target.value)} />
      </div>
      <div className="flex gap-2">
        <Button
          className="flex-1"
          onClick={() => onSave({ start_time: startTime, end_time: endTime, location, session_type: sessionType })}
          disabled={isPending}
        >
          Enregistrer
        </Button>
        <Button variant="destructive" size="icon" onClick={onDelete} aria-label="Supprimer le créneau">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ── Slot Add Form (inline) ──────────────────────

function SlotAddForm({
  onSave,
  isPending,
}: {
  onSave: (input: Omit<SwimmerTrainingSlotInput, "user_id">) => void;
  isPending: boolean;
}) {
  const [dayOfWeek, setDayOfWeek] = useState("1");
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("10:00");
  const [location, setLocation] = useState("");
  const [sessionType, setSessionType] = useState<"swim" | "strength">("swim");

  return (
    <div className="space-y-4 pt-4">
      <SessionTypeToggle value={sessionType} onChange={setSessionType} />
      <div>
        <Label>Jour</Label>
        <Select value={dayOfWeek} onValueChange={setDayOfWeek}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {DAYS_FR.map((d, i) => (
              <SelectItem key={i + 1} value={String(i + 1)}>{d}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="slot-add-start">Début</Label>
          <Input id="slot-add-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="slot-add-end">Fin</Label>
          <Input id="slot-add-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        </div>
      </div>
      <div>
        <Label htmlFor="slot-add-location">Lieu</Label>
        <Input id="slot-add-location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Piscine, Salle..." />
      </div>
      <Button
        className="w-full"
        onClick={() => onSave({
          day_of_week: Number(dayOfWeek),
          start_time: startTime,
          end_time: endTime,
          location,
          session_type: sessionType,
        })}
        disabled={isPending || !location}
      >
        Ajouter
      </Button>
    </div>
  );
}
