import { memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  TrainingSlot,
  TrainingSlotOverride,
  TrainingSlotInput,
  TrainingSlotOverrideInput,
} from "@/lib/api/types";
import type { SlotInstance } from "@/hooks/useSlotCalendar";
import { computeSlotState, resolveSlotAssignment } from "@/hooks/useSlotCalendar";
import { deriveScheduledSlot } from "@/lib/api/assignments";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { buildHtml2CanvasOnClone } from "@/lib/html2canvas-export";
import { lazyWithRetry } from "@/lib/lazyWithRetry";

// Lazy-loaded sheets : ces deux composants ne sont rendus qu'à l'ouverture
// des modals correspondants (clic sur slot ou sur "ajouter depuis bibliothèque").
// Lazy split → réduit le bundle initial du wrapper de ~1410 LOC.
const SlotSessionSheet = lazyWithRetry(() => import("./SlotSessionSheet"));
const SlotTemplatePicker = lazyWithRetry(() => import("./SlotTemplatePicker"));
import type { SwimLibraryEntryContext } from "./swimLibraryEntryContext";
import { getCompetitions } from "@/lib/api/competitions";
import type { Competition } from "@/lib/api/types";
import { CompetitionDayBanner } from "@/components/coach/CompetitionDayBanner";
import { CompetitionQuickSheet } from "@/components/coach/CompetitionQuickSheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  Plus,
  Trash2,
  AlertTriangle,
  BookOpen,
  Check,
  CircleDashed,
  Ban,
  Share2,
  Loader2,
  Waves,
  Dumbbell,
  Trophy,
} from "lucide-react";

// ── Competition types (week overlay) ─────────────────────────────
interface CompetitionDayEntry {
  competition: Competition;
  dayIndex: number;
  totalDays: number;
}

function diffDaysInclusive(startIso: string, endIso: string): number {
  const [sy, sm, sd] = startIso.split("-").map(Number);
  const [ey, em, ed] = endIso.split("-").map(Number);
  const start = new Date(sy, sm - 1, sd).getTime();
  const end = new Date(ey, em - 1, ed).getTime();
  return Math.round((end - start) / 86400000) + 1;
}

function iterateDatesInclusive(startIso: string, endIso: string): string[] {
  const [sy, sm, sd] = startIso.split("-").map(Number);
  const [ey, em, ed] = endIso.split("-").map(Number);
  const out: string[] = [];
  const cur = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);
  const pad = (v: number) => String(v).padStart(2, "0");
  while (cur.getTime() <= end.getTime()) {
    out.push(`${cur.getFullYear()}-${pad(cur.getMonth() + 1)}-${pad(cur.getDate())}`);
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

// ── Constants ────────────────────────────────────────────────────

const DAYS_FR = [
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
  "Dimanche",
];

const DAYS_SHORT = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

/** Timeline range */
const TIMELINE_START = 6; // 06:00
const TIMELINE_END = 22; // 22:00
const TIMELINE_HOURS = TIMELINE_END - TIMELINE_START; // 16h
const PX_PER_HOUR = 40;
const TIMELINE_HEIGHT = TIMELINE_HOURS * PX_PER_HOUR; // 640px
const HOUR_LABELS = Array.from({ length: TIMELINE_HOURS + 1 }, (_, i) => TIMELINE_START + i);


// ── Helpers ──────────────────────────────────────────────────────

function formatTime(t: string): string {
  // "08:00:00" → "08:00"
  return t.slice(0, 5);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Convert "HH:MM" or "HH:MM:SS" to minutes since midnight */
function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/** Convert time to pixel offset from timeline top */
function timeToPx(t: string): number {
  const mins = timeToMinutes(t);
  return ((mins - TIMELINE_START * 60) / 60) * PX_PER_HOUR;
}

/** Duration in px between two time strings */
function durationPx(start: string, end: string): number {
  return timeToPx(end) - timeToPx(start);
}

/** Get Monday of the week containing `date` */
function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun, 1=Mon...6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** ISO week number (ISO 8601) */
function getISOWeek(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const jan4 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d.getTime() - jan4.getTime()) / 86400000 - 3 + ((jan4.getDay() + 6) % 7)) / 7);
}

/** Format date as "DD/MM" */
function formatDayMonth(date: Date): string {
  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}

/** ISO date string "YYYY-MM-DD" from a Date */
function toIsoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** True if slot is a swimming session (vs PPG/muscu) — based on explicit session_type */
function isSwimSlot(slot: { session_type?: "swim" | "strength" | null }): boolean {
  return (slot.session_type ?? "swim") === "swim";
}

function buildSwimLibraryContext(
  instance: SlotInstance,
  mode: "create" | "edit",
  swimCatalogId?: number,
): SwimLibraryEntryContext {
  const base = {
    slot: {
      trainingSlotId: instance.slot.id,
      scheduledDate: instance.date,
      startTime: instance.slot.start_time,
      endTime: instance.slot.end_time,
      location: instance.slot.location,
    },
  };

  if (mode === "edit" && swimCatalogId != null) {
    return {
      mode,
      swimCatalogId,
      ...base,
    };
  }

  return {
    mode: "create",
    ...base,
  };
}

// ── Types ────────────────────────────────────────────────────────

type CoachTrainingSlotsScreenProps = {
  onBack?: () => void;
  groups: Array<{ id: number | string; name: string }>;
  onOpenLibrary?: (context?: SwimLibraryEntryContext) => void;
  modeToggle?: React.ReactNode;
};

// (AssignmentRow removed — groups and coaches are now independent multi-select lists)

type SlotCompletionState = "empty" | "draft" | "published" | "cancelled";

// ── Slot Form Sheet ─────────────────────────────────────────────

type SlotFormSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slot?: TrainingSlot | null;
  groups: Array<{ id: number | string; name: string }>;
  coaches: Array<{ id: number; display_name: string }>;
};

const SlotFormSheet = ({
  open,
  onOpenChange,
  slot,
  groups,
  coaches,
}: SlotFormSheetProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEdit = !!slot;

  const [slotMode, setSlotMode] = useState<"recurring" | "oneoff">("recurring");
  const [dayOfWeek, setDayOfWeek] = useState("1");
  const [scheduledDate, setScheduledDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [location, setLocation] = useState("");
  const [sessionType, setSessionType] = useState<"swim" | "strength">("swim");
  const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>([]);
  const [selectedCoachIds, setSelectedCoachIds] = useState<number[]>([]);
  const [laneCount, setLaneCount] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (slot) {
      setSlotMode(slot.scheduled_date ? "oneoff" : "recurring");
      setDayOfWeek(String(slot.day_of_week));
      setScheduledDate(slot.scheduled_date ?? "");
      setStartTime(formatTime(slot.start_time));
      setEndTime(formatTime(slot.end_time));
      setLocation(slot.location);
      setSessionType(slot.session_type ?? "swim");
      setSelectedGroupIds(slot.assignments.map((a) => a.group_id));
      setSelectedCoachIds((slot.coaches ?? []).map((c) => c.coach_id));
      setLaneCount(slot.lane_count != null ? String(slot.lane_count) : "");
    } else {
      setSlotMode("recurring");
      setDayOfWeek("1");
      setScheduledDate("");
      setStartTime("");
      setEndTime("");
      setLocation("");
      setSessionType("swim");
      setSelectedGroupIds([]);
      setSelectedCoachIds([]);
      setLaneCount("");
    }
  }, [open, slot]);

  const toggleGroup = (id: number) => {
    setSelectedGroupIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };
  const toggleCoach = (id: number) => {
    setSelectedCoachIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const buildInput = (): TrainingSlotInput | null => {
    if (!startTime || !endTime) {
      toast({
        title: "Horaires requis",
        description: "Veuillez saisir les heures de debut et fin.",
        variant: "destructive",
      });
      return null;
    }
    if (!location.trim()) {
      toast({
        title: "Lieu requis",
        description: "Veuillez saisir un lieu.",
        variant: "destructive",
      });
      return null;
    }
    if (slotMode === "oneoff" && !scheduledDate) {
      toast({ title: "Date requise", description: "Veuillez saisir la date du créneau ponctuel.", variant: "destructive" });
      return null;
    }
    let effectiveDayOfWeek = Number(dayOfWeek);
    if (slotMode === "oneoff" && scheduledDate) {
      const d = new Date(scheduledDate + "T00:00:00");
      const jsDay = d.getDay();
      effectiveDayOfWeek = jsDay === 0 ? 7 : jsDay;
    }
    return {
      day_of_week: effectiveDayOfWeek,
      start_time: startTime,
      end_time: endTime,
      location: location.trim(),
      session_type: sessionType,
      lane_count: laneCount ? Number(laneCount) : null,
      group_ids: selectedGroupIds,
      coach_ids: selectedCoachIds,
      scheduled_date: slotMode === "oneoff" ? scheduledDate : null,
    };
  };

  const createMutation = useMutation({
    mutationFn: (input: TrainingSlotInput) => api.createTrainingSlot(input),
    onSuccess: () => {
      toast({ title: "Creneau cree" });
      void queryClient.invalidateQueries({ queryKey: ["training-slots"] });
      void queryClient.invalidateQueries({ queryKey: ["slot-assignments"] });
      void queryClient.invalidateQueries({ queryKey: ["slot-overrides"] });
      void queryClient.invalidateQueries({ queryKey: ["resolved-assignments-batch"] });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast({
        title: "Erreur",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (input: TrainingSlotInput) =>
      api.updateTrainingSlot(slot!.id, input),
    onSuccess: () => {
      toast({ title: "Creneau mis a jour" });
      void queryClient.invalidateQueries({ queryKey: ["training-slots"] });
      void queryClient.invalidateQueries({ queryKey: ["slot-assignments"] });
      void queryClient.invalidateQueries({ queryKey: ["slot-overrides"] });
      void queryClient.invalidateQueries({ queryKey: ["resolved-assignments-batch"] });
      onOpenChange(false);
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
    mutationFn: () => api.deleteTrainingSlot(slot!.id),
    onSuccess: () => {
      toast({ title: "Creneau supprime" });
      void queryClient.invalidateQueries({ queryKey: ["training-slots"] });
      void queryClient.invalidateQueries({ queryKey: ["slot-assignments"] });
      void queryClient.invalidateQueries({ queryKey: ["slot-overrides"] });
      void queryClient.invalidateQueries({ queryKey: ["resolved-assignments-batch"] });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast({
        title: "Erreur",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = () => {
    const input = buildInput();
    if (!input) return;
    if (isEdit) {
      updateMutation.mutate(input);
    } else {
      createMutation.mutate(input);
    }
  };

  const isPending =
    createMutation.isPending ||
    updateMutation.isPending ||
    deleteMutation.isPending;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-md overflow-y-auto"
        >
          <SheetHeader>
            <SheetTitle>
              {isEdit ? "Modifier le creneau" : "Nouveau creneau"}
            </SheetTitle>
            <SheetDescription>
              {isEdit
                ? "Modifiez les details de ce creneau."
                : "Definissez un nouveau creneau hebdomadaire."}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-4">
            {/* ── Session type selector (swim vs strength) ───── */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Type de séance
              </Label>
              <div
                role="radiogroup"
                aria-label="Type de séance"
                className="relative grid grid-cols-2 gap-1 rounded-2xl border border-border/60 bg-muted/30 p-1 shadow-inner"
              >
                {/* Sliding accent pill */}
                <div
                  aria-hidden
                  className={`pointer-events-none absolute inset-y-1 w-[calc(50%-0.25rem)] rounded-xl border transition-all duration-300 ease-out ${
                    sessionType === "swim"
                      ? "left-1 border-blue-500/40 bg-blue-500/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_1px_2px_rgba(59,130,246,0.25)]"
                      : "left-[calc(50%+0.125rem)] border-amber-500/40 bg-amber-500/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_1px_2px_rgba(245,158,11,0.25)]"
                  }`}
                />
                {(
                  [
                    { id: "swim", label: "Natation", Icon: Waves, activeColor: "text-blue-600 dark:text-blue-300" },
                    { id: "strength", label: "Musculation", Icon: Dumbbell, activeColor: "text-amber-700 dark:text-amber-300" },
                  ] as const
                ).map(({ id, label, Icon, activeColor }) => {
                  const active = sessionType === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setSessionType(id)}
                      className={`relative z-10 flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold tracking-tight transition-all duration-200 active:scale-[0.98] ${
                        active
                          ? `${activeColor}`
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Icon
                        className={`h-4 w-4 transition-transform duration-300 ${
                          active ? "scale-110" : "scale-100"
                        }`}
                      />
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Recurring / One-off toggle */}
            {!isEdit && (
              <div className="flex gap-1 rounded-xl border bg-muted/30 p-0.5">
                <button type="button" onClick={() => setSlotMode("recurring")} className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${slotMode === "recurring" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>Récurrent</button>
                <button type="button" onClick={() => setSlotMode("oneoff")} className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${slotMode === "oneoff" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>Ponctuel</button>
              </div>
            )}
            {slotMode === "recurring" ? (
              <div className="space-y-2">
                <Label>Jour de la semaine *</Label>
                <Select value={dayOfWeek} onValueChange={setDayOfWeek}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DAYS_FR.map((d, i) => (<SelectItem key={i + 1} value={String(i + 1)}>{d}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="slot-date">Date *</Label>
                <input id="slot-date" type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
              </div>
            )}

            {/* Time range */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="slot-start">Debut *</Label>
                <input
                  id="slot-start"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="slot-end">Fin *</Label>
                <input
                  id="slot-end"
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
            </div>

            {/* Location */}
            <div className="space-y-2">
              <Label htmlFor="slot-location">Lieu *</Label>
              <Input
                id="slot-location"
                placeholder="Ex : Piscine Erstein"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>

            <Separator />

            {/* Groups multi-select */}
            <div className="space-y-2">
              <Label>Groupes</Label>
              <div className="flex flex-wrap gap-2">
                {groups.map((g) => {
                  const selected = selectedGroupIds.includes(Number(g.id));
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => toggleGroup(Number(g.id))}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        selected
                          ? "border-blue-500/40 bg-blue-500/15 text-blue-700 dark:text-blue-300"
                          : "border-muted bg-muted/40 text-muted-foreground"
                      }`}
                    >
                      <span
                        className={`flex h-3.5 w-3.5 items-center justify-center rounded-sm border ${
                          selected
                            ? "border-blue-500 bg-blue-500 text-white"
                            : "border-muted-foreground/40"
                        }`}
                      >
                        {selected && <Check className="h-2.5 w-2.5" />}
                      </span>
                      {g.name}
                    </button>
                  );
                })}
              </div>
              {groups.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-2">
                  Aucun groupe disponible.
                </p>
              )}
            </div>

            {/* Lane count */}
            <div className="space-y-2">
              <Label htmlFor="slot-lanes">Lignes d'eau</Label>
              <Input
                id="slot-lanes"
                type="number"
                min={0}
                placeholder="Ex : 6"
                value={laneCount}
                onChange={(e) => setLaneCount(e.target.value)}
                className="w-32"
              />
            </div>

            {/* Coaches multi-select */}
            <div className="space-y-2">
              <Label>Coachs</Label>
              <div className="flex flex-wrap gap-2">
                {coaches.map((c) => {
                  const selected = selectedCoachIds.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggleCoach(c.id)}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        selected
                          ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                          : "border-muted bg-muted/40 text-muted-foreground"
                      }`}
                    >
                      <span
                        className={`flex h-3.5 w-3.5 items-center justify-center rounded-sm border ${
                          selected
                            ? "border-emerald-500 bg-emerald-500 text-white"
                            : "border-muted-foreground/40"
                        }`}
                      >
                        {selected && <Check className="h-2.5 w-2.5" />}
                      </span>
                      {c.display_name}
                    </button>
                  );
                })}
              </div>
              {coaches.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-2">
                  Aucun coach disponible.
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="space-y-2 pt-2">
              <Button
                className="w-full"
                onClick={handleSubmit}
                disabled={isPending}
              >
                {isPending
                  ? "Enregistrement..."
                  : isEdit
                    ? "Enregistrer"
                    : "Creer"}
              </Button>

              {isEdit && (
                <Button
                  variant="outline"
                  className="w-full text-destructive hover:text-destructive"
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={isPending}
                >
                  Supprimer ce creneau
                </Button>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Delete confirmation */}
      <AlertDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer le creneau</AlertDialogTitle>
            <AlertDialogDescription>
              Ce creneau sera desactive. Les exceptions associees resteront en
              base mais ne seront plus visibles.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                deleteMutation.mutate();
                setShowDeleteConfirm(false);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

// ── Override Form Sheet ──────────────────────────────────────────

type OverrideFormSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slot: TrainingSlot | null;
  initialDate?: string;
  coaches: Array<{ id: number; display_name: string }>;
};

const OverrideFormSheet = ({
  open,
  onOpenChange,
  slot,
  initialDate,
  coaches,
}: OverrideFormSheetProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [overrideDate, setOverrideDate] = useState("");
  const [status, setStatus] = useState<"cancelled" | "modified">("cancelled");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [newStartTime, setNewStartTime] = useState("");
  const [newEndTime, setNewEndTime] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [selectedCoachIds, setSelectedCoachIds] = useState<number[]>([]);
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!open) return;
    setOverrideDate(initialDate ?? "");
    setStatus("cancelled");
    setEffectiveDate(initialDate ?? "");
    setNewStartTime(slot ? formatTime(slot.start_time) : "");
    setNewEndTime(slot ? formatTime(slot.end_time) : "");
    setNewLocation(slot?.location ?? "");
    setSelectedCoachIds((slot?.coaches ?? []).map((c) => c.coach_id));
    setReason("");
  }, [open, slot, initialDate]);

  const toggleCoach = (id: number) => {
    setSelectedCoachIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!slot) throw new Error("Créneau introuvable");
      if (!overrideDate) throw new Error("Date requise");

      if (status === "cancelled") {
        await api.createSlotOverride({
          slot_id: slot.id,
          override_date: overrideDate,
          status: "cancelled",
          reason: reason.trim() || null,
        });
        return;
      }

      const targetDate = effectiveDate || overrideDate;
      const nextLocation = newLocation.trim() || slot.location;
      const baseCoachIds = (slot.coaches ?? [])
        .map((c) => c.coach_id)
        .sort((a, b) => a - b);
      const nextCoachIds = [...selectedCoachIds].sort((a, b) => a - b);

      const coachesChanged =
        baseCoachIds.length !== nextCoachIds.length ||
        baseCoachIds.some((id, i) => id !== nextCoachIds[i]);
      const movedToAnotherDate = targetDate !== overrideDate;

      // If day or coaches change, model it as:
      // 1) one-off slot on target date with the updated setup
      // 2) cancellation of the recurring slot on the original date
      if (movedToAnotherDate || coachesChanged) {
        if (!targetDate) throw new Error("Date cible requise");

        const d = new Date(`${targetDate}T00:00:00`);
        const jsDay = d.getDay();
        const targetDayOfWeek = jsDay === 0 ? 7 : jsDay;

        await api.createTrainingSlot({
          day_of_week: targetDayOfWeek,
          start_time: newStartTime || formatTime(slot.start_time),
          end_time: newEndTime || formatTime(slot.end_time),
          location: nextLocation,
          session_type: slot.session_type,
          lane_count: slot.lane_count ?? null,
          group_ids: slot.assignments.map((a) => a.group_id),
          coach_ids: selectedCoachIds,
          scheduled_date: targetDate,
        });

        await api.createSlotOverride({
          slot_id: slot.id,
          override_date: overrideDate,
          status: "cancelled",
          reason: reason.trim() || null,
        });

        return;
      }

      const input: TrainingSlotOverrideInput = {
        slot_id: slot.id,
        override_date: overrideDate,
        status: "modified",
        new_start_time: newStartTime || null,
        new_end_time: newEndTime || null,
        new_location: newLocation.trim() ? newLocation.trim() : null,
        reason: reason.trim() || null,
      };

      await api.createSlotOverride(input);
    },
    onSuccess: () => {
      toast({ title: "Exception enregistree" });
      void queryClient.invalidateQueries({
        queryKey: ["training-slot-overrides"],
      });
      void queryClient.invalidateQueries({ queryKey: ["slot-overrides"] });
      void queryClient.invalidateQueries({ queryKey: ["training-slots"] });
      void queryClient.invalidateQueries({ queryKey: ["slot-assignments"] });
      void queryClient.invalidateQueries({ queryKey: ["resolved-assignments-batch"] });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast({
        title: "Erreur",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = () => {
    if (!slot) return;
    if (!overrideDate) {
      toast({
        title: "Date requise",
        description: "Veuillez saisir la date de l'exception.",
        variant: "destructive",
      });
      return;
    }
    if (status === "modified" && !effectiveDate) {
      toast({
        title: "Date cible requise",
        description: "Veuillez saisir la date du créneau modifié.",
        variant: "destructive",
      });
      return;
    }
    saveMutation.mutate();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md overflow-y-auto"
      >
        <SheetHeader>
          <SheetTitle>Exception</SheetTitle>
          <SheetDescription>
            Annulez ou modifiez ce creneau pour une date precise.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {/* Date */}
          <div className="space-y-2">
            <Label htmlFor="override-date">Date *</Label>
            <input
              id="override-date"
              type="date"
              value={overrideDate}
              onChange={(e) => setOverrideDate(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          {/* Status */}
          <div className="space-y-2">
            <Label>Type</Label>
            <RadioGroup
              value={status}
              onValueChange={(v) =>
                setStatus(v as "cancelled" | "modified")
              }
              className="flex gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="cancelled" id="ovr-cancelled" />
                <Label htmlFor="ovr-cancelled" className="font-normal">
                  Annule
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="modified" id="ovr-modified" />
                <Label htmlFor="ovr-modified" className="font-normal">
                  Modifie
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Modified fields */}
          {status === "modified" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="ovr-target-date">Nouvelle date / jour</Label>
                <input
                  id="ovr-target-date"
                  type="date"
                  value={effectiveDate}
                  onChange={(e) => setEffectiveDate(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
                <p className="text-xs text-muted-foreground">
                  Changez la date pour deplacer le creneau sur un autre jour.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="ovr-start">Nouvel horaire debut</Label>
                  <input
                    id="ovr-start"
                    type="time"
                    value={newStartTime}
                    onChange={(e) => setNewStartTime(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ovr-end">Nouvel horaire fin</Label>
                  <input
                    id="ovr-end"
                    type="time"
                    value={newEndTime}
                    onChange={(e) => setNewEndTime(e.target.value)}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ovr-location">Nouveau lieu</Label>
                <Input
                  id="ovr-location"
                  value={newLocation}
                  onChange={(e) => setNewLocation(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Coachs pour cette exception</Label>
                <div className="flex flex-wrap gap-2">
                  {coaches.map((c) => {
                    const selected = selectedCoachIds.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => toggleCoach(c.id)}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                          selected
                            ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                            : "border-muted bg-muted/40 text-muted-foreground"
                        }`}
                      >
                        <span
                          className={`flex h-3.5 w-3.5 items-center justify-center rounded-sm border ${
                            selected
                              ? "border-emerald-500 bg-emerald-500 text-white"
                              : "border-muted-foreground/40"
                          }`}
                        >
                          {selected && <Check className="h-2.5 w-2.5" />}
                        </span>
                        {c.display_name}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  Si la date ou les coachs changent, un creneau ponctuel sera cree et le creneau initial sera annule sur la date d'origine.
                </p>
              </div>
            </>
          )}

          {/* Reason */}
          <div className="space-y-2">
            <Label htmlFor="ovr-reason">Motif</Label>
            <Input
              id="ovr-reason"
              placeholder="Ex : Vacances scolaires"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          {/* Submit */}
          <Button
            className="w-full"
            onClick={handleSubmit}
            disabled={saveMutation.isPending || !overrideDate}
          >
            {saveMutation.isPending ? "Enregistrement..." : "Enregistrer"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

// ── Timeline Slot Block (positioned absolutely on the timeline) ──

function getSlotCompletionState(instance?: SlotInstance): SlotCompletionState {
  if (!instance) return "empty";
  return instance.state;
}

function SlotCompletionBadge({
  state,
  compact = false,
}: {
  state: SlotCompletionState;
  compact?: boolean;
}) {
  const config = {
    empty: {
      label: "À renseigner",
      shortLabel: "À faire",
      icon: CircleDashed,
      className:
        "border-border/60 bg-background/80 text-muted-foreground",
    },
    draft: {
      label: "Brouillon",
      shortLabel: "Brouillon",
      icon: CircleDashed,
      className:
        "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    },
    published: {
      label: "Renseignée",
      shortLabel: "OK",
      icon: Check,
      className:
        "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    },
    cancelled: {
      label: "Annulé",
      shortLabel: "Annulé",
      icon: Ban,
      className:
        "border-border/60 bg-muted/60 text-muted-foreground",
    },
  } satisfies Record<
    SlotCompletionState,
    {
      label: string;
      shortLabel: string;
      icon: typeof Check;
      className: string;
    }
  >;

  const { icon: Icon, className, label, shortLabel } = config[state];

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-none ${className}`}
      title={label}
      aria-label={label}
    >
      <Icon className="h-3 w-3 shrink-0" />
      {!compact && <span>{shortLabel}</span>}
    </span>
  );
}

type TimelineSlotProps = {
  slot: TrainingSlot;
  instance?: SlotInstance;
  hasOverrides: boolean;
  cancelled?: boolean;
  onSelect: (slot: TrainingSlot) => void;
};

const TimelineSlot = ({
  slot,
  instance,
  hasOverrides,
  cancelled = false,
  onSelect,
}: TimelineSlotProps) => {
  const top = timeToPx(slot.start_time);
  const height = durationPx(slot.start_time, slot.end_time);
  const isShort = height < 50;
  const swim = isSwimSlot(slot);
  const completionState = getSlotCompletionState(instance);
  const hasAssignment = !!instance?.assignment;
  const isDraft = instance?.state === "draft";
  const isPublished = instance?.state === "published";

  const bgClass = cancelled
    ? "bg-muted/50 border-muted-foreground/20 opacity-50 line-through"
    : isPublished
      ? "bg-emerald-500/12 border-emerald-500/30 hover:bg-emerald-500/18"
      : isDraft
        ? "bg-amber-500/12 border-amber-500/30 hover:bg-amber-500/18"
    : swim
      ? "bg-blue-500/15 border-blue-400/40 hover:bg-blue-500/25"
      : "bg-amber-400/15 border-amber-400/40 hover:bg-amber-400/25";

  const iconClass = isPublished
    ? "text-emerald-600 dark:text-emerald-400"
    : isDraft
      ? "text-amber-600 dark:text-amber-400"
      : swim
        ? "text-blue-500"
        : "text-amber-500";

  return (
    <button
      type="button"
      className={`absolute left-0.5 right-0.5 rounded-md border px-1.5 py-0.5 text-left overflow-hidden cursor-pointer transition-colors ${bgClass}`}
      style={{ top, height, minHeight: 24 }}
      onClick={() => onSelect(slot)}
      title={`${formatTime(slot.start_time)}–${formatTime(slot.end_time)} · ${slot.location}${instance?.assignment?.session_name ? ` · ${instance.assignment.session_name}` : ""}`}
    >
      <div className={`flex flex-col gap-0.5 ${isShort ? "flex-row items-center" : ""}`}>
        {/* Location */}
        <div className="flex items-start justify-between gap-1 min-w-0">
          <div className="flex items-center gap-1 min-w-0">
            <MapPin className={`h-2.5 w-2.5 shrink-0 ${iconClass}`} />
            <span className="text-[10px] font-medium text-foreground truncate">
              {slot.location}
            </span>
            {hasOverrides && !cancelled && (
              <AlertTriangle className="h-2.5 w-2.5 text-orange-500 shrink-0" />
            )}
          </div>
          <span className="shrink-0">
            <SlotCompletionBadge state={completionState} compact />
          </span>
        </div>

        {/* Group badges */}
        {!isShort && slot.assignments.length > 0 && (
          <div className="flex flex-wrap gap-0.5">
            {slot.assignments.map((a) => (
              <Badge
                key={a.id}
                variant="secondary"
                className="text-[9px] px-1 py-0 leading-tight"
              >
                {a.group_name}
              </Badge>
            ))}
          </div>
        )}

        {/* Coach names for taller slots */}
        {!isShort && height >= 70 && (slot.coaches?.length ?? 0) > 0 && (
          <span className="text-[9px] text-muted-foreground truncate">
            {(slot.coaches ?? []).map((c) => c.coach_name).join(", ")}
          </span>
        )}

        {!isShort && hasAssignment && (
          <span
            className={`text-[9px] truncate ${
              isDraft
                ? "text-amber-700 dark:text-amber-300"
                : "text-emerald-700 dark:text-emerald-300"
            }`}
          >
            {instance?.assignment?.session_name ?? "Séance"}
          </span>
        )}
      </div>
    </button>
  );
};

/** Inline variant of TimelineSlot that receives pre-computed top/height */
function TimelineSlotInlineImpl({
  slot,
  instance,
  hasOverrides,
  cancelled = false,
  onSelect,
  top,
  height,
}: TimelineSlotProps & { top: number; height: number }) {
  const isShort = height < 50;
  const isOneOff = !!slot.scheduled_date;
  const swim = isSwimSlot(slot);
  const completionState = getSlotCompletionState(instance);
  const hasAssignment = !!instance?.assignment;
  const isDraft = instance?.state === "draft";
  const isPublished = instance?.state === "published";
  const ov = instance?.override;
  const isModified = ov?.status === "modified";
  const effectiveLocation = (isModified && ov?.new_location) ? ov.new_location : slot.location;

  // Modified slots keep their swim/strength base color — orange is only an accent
  const bgClass = cancelled
    ? "bg-muted/50 border-muted-foreground/20 opacity-50 line-through"
    : isPublished
      ? "bg-emerald-500/12 border-emerald-500/30 hover:bg-emerald-500/18"
      : isDraft
        ? "bg-amber-500/12 border-amber-500/30 hover:bg-amber-500/18"
      : swim
        ? "bg-blue-500/15 border-blue-400/40 hover:bg-blue-500/25"
        : "bg-amber-400/15 border-amber-400/40 hover:bg-amber-400/25";

  const iconClass = isPublished
    ? "text-emerald-600 dark:text-emerald-400"
    : isDraft
      ? "text-amber-600 dark:text-amber-400"
      : swim
        ? "text-blue-500"
        : "text-amber-500";

  const borderStyle = isOneOff ? "border-dashed " : "";

  return (
    <button
      type="button"
      className={`absolute left-0.5 right-0.5 rounded-md border px-1.5 py-0.5 text-left overflow-hidden cursor-pointer transition-colors ${borderStyle}${bgClass}${isModified ? " border-t-[3px] border-t-orange-500" : ""}`}
      style={{ top, height, minHeight: 24 }}
      onClick={() => onSelect(slot)}
      title={`${isOneOff ? "[Ponctuel] " : ""}${isModified ? "[Modifié] " : ""}${formatTime(slot.start_time)}–${formatTime(slot.end_time)} · ${effectiveLocation}${instance?.assignment?.session_name ? ` · ${instance.assignment.session_name}` : ""}`}
    >
      <div className={`flex flex-col gap-0.5 ${isShort ? "flex-row items-center" : ""}`}>
        <div className="flex items-start justify-between gap-1 min-w-0">
          <div className="flex items-center gap-1 min-w-0">
            <MapPin className={`h-2.5 w-2.5 shrink-0 ${iconClass}`} />
            <span className="text-[10px] font-medium text-foreground truncate">
              {effectiveLocation}
            </span>
            {isOneOff && (
              <span className="shrink-0 rounded bg-violet-500/15 border border-violet-500/30 px-1 text-[8px] font-bold text-violet-600 dark:text-violet-400 leading-tight">
                1×
              </span>
            )}
            {isModified && (
              <span className="shrink-0 rounded-sm bg-orange-500 px-1 text-[8px] font-bold text-white leading-tight">
                Modifié
              </span>
            )}
            {hasOverrides && !cancelled && !isModified && (
              <AlertTriangle className="h-2.5 w-2.5 text-orange-500 shrink-0" />
            )}
          </div>
          <span className="shrink-0">
            <SlotCompletionBadge state={completionState} compact />
          </span>
        </div>

        {!isShort && slot.assignments.length > 0 && (
          <div className="flex flex-wrap gap-0.5">
            {slot.assignments.map((a) => (
              <Badge
                key={a.id}
                variant="secondary"
                className="text-[9px] px-1 py-0 leading-tight"
              >
                {a.group_name}
              </Badge>
            ))}
          </div>
        )}

        {!isShort && height >= 70 && (slot.coaches?.length ?? 0) > 0 && (
          <span className="text-[9px] text-muted-foreground truncate">
            {(slot.coaches ?? []).map((c) => c.coach_name).join(", ")}
          </span>
        )}

        {!isShort && hasAssignment && (
          <span
            className={`text-[9px] truncate ${
              isDraft
                ? "text-amber-700 dark:text-amber-300"
                : "text-emerald-700 dark:text-emerald-300"
            }`}
          >
            {instance?.assignment?.session_name ?? "Séance"}
          </span>
        )}
      </div>
    </button>
  );
}

const TimelineSlotInline = memo(TimelineSlotInlineImpl);

// ── Mobile View: Week Strip + Day Detail ────────────────────────

type MobileViewProps = {
  slotsByDay: Map<number, TrainingSlot[]>;
  slotInstancesById: Map<string, SlotInstance>;
  weekDates: Date[];
  todayStr: string;
  overridesBySlot: Map<string, TrainingSlotOverride[]>;
  cancelledSlotIds: Set<string>;
  onSelect: (slot: TrainingSlot) => void;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  weekNumber: number;
  competitionsByDate: Map<string, CompetitionDayEntry[]>;
  onOpenCompetition: (competition: Competition) => void;
};

/** Compute duration string from two time strings */
function durationLabel(start: string, end: string): string {
  const diff = timeToMinutes(end) - timeToMinutes(start);
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h${String(m).padStart(2, "0")}`;
}

const MobileView = ({
  slotsByDay,
  slotInstancesById,
  weekDates,
  todayStr,
  overridesBySlot,
  cancelledSlotIds,
  onSelect,
  onPrevWeek,
  onNextWeek,
  weekNumber,
  competitionsByDate,
  onOpenCompetition,
}: MobileViewProps) => {
  // Auto-select today's day (1=Mon...7=Sun), or Monday if today isn't in this week
  const [selectedDay, setSelectedDay] = useState<number>(() => {
    const todayIdx = weekDates.findIndex((d) => toIsoDate(d) === todayStr);
    return todayIdx >= 0 ? todayIdx + 1 : 1;
  });

  // Re-sync selectedDay when week changes
  useEffect(() => {
    const todayIdx = weekDates.findIndex((d) => toIsoDate(d) === todayStr);
    if (todayIdx >= 0) setSelectedDay(todayIdx + 1);
    else setSelectedDay(1);
  }, [weekDates, todayStr]);

  const selectedDaySlots = slotsByDay.get(selectedDay) ?? [];

  // Compute the smart time range for the mini-strip visualization
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

  return (
    <div className="space-y-3">
      {/* ── Week nav ── */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          className="flex items-center justify-center h-10 w-10 rounded-full text-muted-foreground hover:bg-muted active:scale-90 transition-all"
          onClick={onPrevWeek}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex items-baseline gap-1.5">
          <span className="text-xs font-bold text-primary uppercase tracking-wider font-display">
            S{weekNumber}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {formatDayMonth(weekDates[0])} – {formatDayMonth(weekDates[6])}
          </span>
        </div>
        <button
          type="button"
          className="flex items-center justify-center h-10 w-10 rounded-full text-muted-foreground hover:bg-muted active:scale-90 transition-all"
          onClick={onNextWeek}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* ── Week strip: 7 day columns with mini slot indicators ── */}
      <div className="grid grid-cols-7 gap-0 rounded-xl border border-border bg-card overflow-hidden">
        {weekDates.map((date, i) => {
          const dow = i + 1;
          const isToday = toIsoDate(date) === todayStr;
          const isSelected = dow === selectedDay;
          const daySlots = slotsByDay.get(dow) ?? [];
          const hasCompetition = (competitionsByDate.get(toIsoDate(date)) ?? []).length > 0;

          return (
            <button
              key={dow}
              type="button"
              className={`flex flex-col items-center py-2 transition-colors relative ${
                isSelected
                  ? "bg-primary/8"
                  : "hover:bg-muted/50 active:bg-muted"
              }`}
              onClick={() => setSelectedDay(dow)}
            >
              {/* Competition indicator dot */}
              {hasCompetition && (
                <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-rose-500" />
              )}
              {/* Day label */}
              <span className={`text-[10px] font-semibold uppercase tracking-wider ${
                isToday ? "text-primary" : "text-muted-foreground"
              }`}>
                {DAYS_SHORT[i]}
              </span>

              {/* Date number */}
              <span className={`text-sm font-bold tabular-nums mt-0.5 h-10 w-10 flex items-center justify-center rounded-full ${
                isToday
                  ? "bg-primary text-primary-foreground"
                  : isSelected
                    ? "text-foreground"
                    : "text-foreground/80"
              }`}>
                {date.getDate()}
              </span>

              {/* Mini slot bars — proportional to time range */}
              <div className="w-full px-1 mt-1.5 h-8 relative">
                {daySlots.map((slot) => {
                  const instance = slotInstancesById.get(slot.id);
                  const ov = instance?.override;
                  const isMod = ov?.status === "modified";
                  const effStart = (isMod && ov?.new_start_time) ? ov.new_start_time : slot.start_time;
                  const effEnd = (isMod && ov?.new_end_time) ? ov.new_end_time : slot.end_time;
                  const startMin = timeToMinutes(effStart) - stripRange.start * 60;
                  const endMin = timeToMinutes(effEnd) - stripRange.start * 60;
                  const topPct = Math.max(0, (startMin / stripTotalMin) * 100);
                  const heightPct = Math.max(8, ((endMin - startMin) / stripTotalMin) * 100);
                  const swim = isSwimSlot(slot);
                  const cancelled = cancelledSlotIds.has(slot.id);
                  const isPublished = instance?.state === "published";
                  const isDraft = instance?.state === "draft";

                  return (
                    <div
                      key={slot.id}
                      className={`absolute left-1 right-1 rounded-sm ${
                        cancelled
                          ? "bg-muted-foreground/20"
                          : isPublished
                            ? "bg-emerald-500/50"
                            : isDraft
                              ? "bg-amber-500/50"
                          : swim
                            ? "bg-blue-500/40"
                            : "bg-amber-400/50"
                      }${isMod && !cancelled ? " border-t-2 border-t-orange-500" : ""}`}
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
        {(() => {
          const selectedDate = weekDates[selectedDay - 1];
          const entries = selectedDate ? (competitionsByDate.get(toIsoDate(selectedDate)) ?? []) : [];
          if (entries.length === 0) return null;
          return (
            <div className="space-y-2 mb-2">
              {entries.map((entry) => (
                <CompetitionDayBanner
                  key={`${entry.competition.id}-mobile`}
                  competition={entry.competition}
                  dayIndex={entry.dayIndex}
                  totalDays={entry.totalDays}
                  onTap={() => onOpenCompetition(entry.competition)}
                />
              ))}
            </div>
          );
        })()}
        <h3 className="text-sm font-semibold text-foreground px-0.5">
          {DAYS_FR[selectedDay - 1]} {weekDates[selectedDay - 1]?.getDate()}{" "}
          <span className="font-normal text-muted-foreground">
            {weekDates[selectedDay - 1]?.toLocaleDateString("fr-FR", { month: "long" })}
          </span>
        </h3>

        {selectedDaySlots.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 py-8 text-center">
            <p className="text-sm text-muted-foreground">Aucun créneau</p>
          </div>
        ) : (
          <div className="space-y-2">
            {selectedDaySlots.map((slot) => {
              const swim = isSwimSlot(slot);
              const cancelled = cancelledSlotIds.has(slot.id);
              const slotOverrides = overridesBySlot.get(slot.id) ?? [];
              const hasOverrides = slotOverrides.length > 0;
              const instance = slotInstancesById.get(slot.id);
              const completionState = getSlotCompletionState(instance);
              const isPublished = instance?.state === "published";
              const isDraft = instance?.state === "draft";
              const ov = instance?.override;
              const isModified = ov?.status === "modified";
              const effStart = (isModified && ov?.new_start_time) ? ov.new_start_time : slot.start_time;
              const effEnd = (isModified && ov?.new_end_time) ? ov.new_end_time : slot.end_time;
              const effLocation = (isModified && ov?.new_location) ? ov.new_location : slot.location;

              return (
                <button
                  key={slot.id}
                  type="button"
                  className={`w-full text-left rounded-xl border transition-all active:scale-[0.98] ${
                    cancelled
                      ? "opacity-50 border-border bg-card"
                      : "border-border bg-card hover:border-border/80"
                  }${isModified && !cancelled ? " border-t-[3px] border-t-orange-500" : ""}`}
                  onClick={() => onSelect(slot)}
                >
                  <div className="flex">
                    {/* Color accent bar — always type-colored */}
                    <div className={`w-1 rounded-l-xl flex-shrink-0 ${
                      cancelled
                        ? "bg-muted-foreground/30"
                        : swim
                          ? "bg-blue-500"
                          : "bg-amber-400"
                    }`} />

                    <div className="flex-1 px-3 py-2.5 min-w-0">
                      {/* Time row */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`text-sm font-bold tabular-nums ${
                            cancelled ? "line-through text-muted-foreground" : "text-foreground"
                          }`}>
                            {formatTime(effStart)} – {formatTime(effEnd)}
                          </span>
                          {isModified && (effStart !== slot.start_time || effEnd !== slot.end_time) && (
                            <span className="text-[10px] tabular-nums text-muted-foreground line-through">
                              {formatTime(slot.start_time)}–{formatTime(slot.end_time)}
                            </span>
                          )}
                          <span className={`text-xs tabular-nums px-1.5 py-0.5 rounded-md font-medium ${
                            swim
                              ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                              : "bg-amber-400/10 text-amber-600 dark:text-amber-400"
                          }`}>
                            {durationLabel(effStart, effEnd)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <SlotCompletionBadge state={completionState} />
                          {isModified && (
                            <span className="shrink-0 rounded-sm bg-orange-500 px-1.5 py-0.5 text-[9px] font-bold text-white leading-tight">
                              Modifié
                            </span>
                          )}
                          {hasOverrides && !cancelled && !isModified && (
                            <AlertTriangle className="h-3.5 w-3.5 text-orange-500 flex-shrink-0" />
                          )}
                        </div>
                      </div>

                      {/* Location */}
                      <div className="flex items-center gap-1.5 mt-1">
                        <MapPin className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                        <span className="text-xs text-muted-foreground truncate">
                          {effLocation}
                        </span>
                        {isModified && effLocation !== slot.location && (
                          <span className="text-[10px] text-muted-foreground line-through truncate">
                            {slot.location}
                          </span>
                        )}
                      </div>

                      {instance?.assignment?.session_name && (
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <span
                            className={`inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                              isDraft
                                ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                                : isPublished
                                  ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                  : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {isDraft ? "Brouillon" : "Publié"}
                          </span>
                          <span className="truncate text-xs font-medium text-foreground">
                            {instance.assignment.session_name}
                          </span>
                        </div>
                      )}

                      {/* Group badges + coach/lane info */}
                      {(slot.assignments.length > 0 || (slot.coaches?.length ?? 0) > 0 || slot.lane_count) && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {slot.assignments.map((a) => (
                            <span
                              key={a.id}
                              className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground"
                            >
                              {a.group_name}
                            </span>
                          ))}
                          {(slot.coaches ?? []).length > 0 && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                              {(slot.coaches ?? []).map((c) => c.coach_name.split(" ")[0]).join(", ")}
                            </span>
                          )}
                          {slot.lane_count != null && slot.lane_count > 0 && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground">
                              {slot.lane_count}L
                            </span>
                          )}
                        </div>
                      )}

                      {/* Override info */}
                      {hasOverrides && !cancelled && (
                        <div className="mt-1.5 space-y-0.5">
                          {slotOverrides.slice(0, 2).map((o) => (
                            <div key={o.id} className="flex items-center gap-1 text-[10px]">
                              <span className={`font-medium ${
                                o.status === "cancelled" ? "text-red-500" : "text-orange-500"
                              }`}>
                                {o.status === "cancelled" ? "Annulé" : "Modifié"} le{" "}
                                {new Date(o.override_date).toLocaleDateString("fr-FR", {
                                  day: "2-digit",
                                  month: "2-digit",
                                })}
                              </span>
                              {o.reason && (
                                <span className="text-muted-foreground truncate">— {o.reason}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// ── Main Component ──────────────────────────────────────────────

const CoachTrainingSlotsScreen = ({
  onBack,
  groups,
  onOpenLibrary,
  modeToggle,
}: CoachTrainingSlotsScreenProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { userId } = useAuth();

  const [showSlotForm, setShowSlotForm] = useState(false);
  const [editingSlot, setEditingSlot] = useState<TrainingSlot | null>(null);
  const [overrideSlot, setOverrideSlot] = useState<TrainingSlot | null>(null);
  const [overrideInitialDate, setOverrideInitialDate] = useState("");
  const [showOverrideForm, setShowOverrideForm] = useState(false);
  const [selectedInstance, setSelectedInstance] = useState<SlotInstance | null>(null);
  const [showSessionSheet, setShowSessionSheet] = useState(false);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [templateTargetInstance, setTemplateTargetInstance] = useState<SlotInstance | null>(null);
  const [templateSelectedGroups, setTemplateSelectedGroups] = useState<number[]>([]);
  const [templateVisibleFrom, setTemplateVisibleFrom] = useState<string>("");

  // Week navigation state
  const [weekMonday, setWeekMonday] = useState(() => getMonday(new Date()));

  const weekNumber = useMemo(() => getISOWeek(weekMonday), [weekMonday]);
  const weekSunday = useMemo(() => {
    const d = new Date(weekMonday);
    d.setDate(d.getDate() + 6);
    return d;
  }, [weekMonday]);

  /** Dates for each day column (Mon=0 … Sun=6) */
  const weekDates = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekMonday);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [weekMonday]);

  // ── Competitions overlay ─────────────────────────────
  const { data: competitions = [] } = useQuery({
    queryKey: ["competitions"],
    queryFn: getCompetitions,
    staleTime: 5 * 60 * 1000,
  });

  const competitionsByDate = useMemo(() => {
    const map = new Map<string, CompetitionDayEntry[]>();
    const weekIsoSet = new Set(weekDates.map((d) => toIsoDate(d)));
    for (const c of competitions) {
      if (!c.date) continue;
      const endIso = c.end_date && c.end_date >= c.date ? c.end_date : c.date;
      const totalDays = diffDaysInclusive(c.date, endIso);
      const allDays = iterateDatesInclusive(c.date, endIso);
      allDays.forEach((iso, idx) => {
        if (!weekIsoSet.has(iso)) return;
        const entry: CompetitionDayEntry = {
          competition: c,
          dayIndex: idx + 1,
          totalDays,
        };
        const arr = map.get(iso) ?? [];
        arr.push(entry);
        map.set(iso, arr);
      });
    }
    return map;
  }, [competitions, weekDates]);

  const [selectedCompetition, setSelectedCompetition] = useState<Competition | null>(null);
  const [compSheetOpen, setCompSheetOpen] = useState(false);

  const handleOpenCompetition = useCallback((c: Competition) => {
    setSelectedCompetition(c);
    setCompSheetOpen(true);
  }, []);

  const handleViewCompetitionDetail = useCallback(() => {
    setCompSheetOpen(false);
    window.location.hash = "#/coach/competitions";
  }, []);

  const prevWeek = () =>
    setWeekMonday((m) => {
      const d = new Date(m);
      d.setDate(d.getDate() - 7);
      return d;
    });
  const nextWeek = () =>
    setWeekMonday((m) => {
      const d = new Date(m);
      d.setDate(d.getDate() + 7);
      return d;
    });
  const goToday = () => setWeekMonday(getMonday(new Date()));

  // Filter state
  const [filterValue, setFilterValue] = useState<string>("all");

  // Fetch slots
  const { data: slots = [], isLoading: slotsLoading } = useQuery({
    queryKey: ["training-slots"],
    queryFn: () => api.getTrainingSlots(),
  });

  // Fetch all overrides (we filter client-side per week)
  const { data: allOverrides = [] } = useQuery({
    queryKey: ["training-slot-overrides"],
    queryFn: () => api.getSlotOverrides(),
  });

  // Fetch coaches
  const { data: coaches = [] } = useQuery({
    queryKey: ["users", "coaches"],
    queryFn: () => api.listUsers({ role: "coach" }),
  });

  // Fetch athletes for swimmer filter
  const { data: athletes = [] } = useQuery({
    queryKey: ["athletes"],
    queryFn: () => api.getAthletes(),
  });

  // Swimmer filter: fetch swimmer's custom slots when selected
  const swimmerFilterId = filterValue.startsWith("swimmer:")
    ? Number(filterValue.split(":")[1])
    : null;

  const { data: swimmerSlots } = useQuery({
    queryKey: ["swimmer-slots", swimmerFilterId],
    queryFn: () => api.getSwimmerSlots(swimmerFilterId!),
    enabled: swimmerFilterId != null,
  });

  const { data: swimmerHasCustom } = useQuery({
    queryKey: ["swimmer-slots-exists", swimmerFilterId],
    queryFn: () => api.hasCustomSlots(swimmerFilterId!),
    enabled: swimmerFilterId != null,
  });

  // Convert swimmer slots to TrainingSlot shape for timeline display
  const swimmerSlotsAsTraining = useMemo((): TrainingSlot[] => {
    if (!swimmerSlots) return [];
    return swimmerSlots.map((s) => ({
      id: s.id,
      day_of_week: s.day_of_week,
      start_time: s.start_time,
      end_time: s.end_time,
      location: s.location,
      session_type: s.session_type ?? "swim",
      is_active: s.is_active,
      created_by: s.created_by,
      created_at: s.created_at,
      assignments: [],
      lane_count: null,
      scheduled_date: null,
      coaches: [],
    }));
  }, [swimmerSlots]);

  // Filter slots
  const filteredSlots = useMemo(() => {
    if (filterValue === "all") return slots;
    if (filterValue.startsWith("group:")) {
      const gid = Number(filterValue.split(":")[1]);
      return slots.filter((s) =>
        s.assignments.some((a) => a.group_id === gid),
      );
    }
    if (filterValue.startsWith("coach:")) {
      const cid = Number(filterValue.split(":")[1]);
      return slots.filter((s) =>
        (s.coaches ?? []).some((c) => c.coach_id === cid),
      );
    }
    if (filterValue.startsWith("swimmer:")) {
      // When a swimmer has custom slots, show those; otherwise show group slots
      if (swimmerHasCustom && swimmerSlotsAsTraining.length > 0) {
        return swimmerSlotsAsTraining;
      }
      // Fallback: show slots for the swimmer's group
      const athlete = athletes.find((a) => a.id === swimmerFilterId);
      if (athlete?.group_id) {
        return slots.filter((s) =>
          s.assignments.some((a) => a.group_id === athlete.group_id),
        );
      }
      return slots;
    }
    return slots;
  }, [slots, filterValue, swimmerHasCustom, swimmerSlotsAsTraining, athletes, swimmerFilterId]);

  // Overrides scoped to the selected week
  const weekMondayIso = toIsoDate(weekMonday);
  const weekSundayIso = toIsoDate(weekSunday);

  // Filter out one-off slots that don't belong to the current week
  const weekFilteredSlots = useMemo(() => {
    return filteredSlots.filter((s) => {
      if (!s.scheduled_date) return true; // recurring → always show
      return s.scheduled_date >= weekMondayIso && s.scheduled_date <= weekSundayIso;
    });
  }, [filteredSlots, weekMondayIso, weekSundayIso]);

  // Group filtered slots by day, sorted by start_time
  const slotsByDay = useMemo(() => {
    const map = new Map<number, TrainingSlot[]>();
    for (let d = 1; d <= 7; d++) map.set(d, []);
    for (const s of weekFilteredSlots) {
      map.get(s.day_of_week)!.push(s);
    }
    // Sort each day by start_time
    for (const list of map.values()) {
      list.sort((a, b) => a.start_time.localeCompare(b.start_time));
    }
    return map;
  }, [weekFilteredSlots]);

  const { data: slotAssignments = [] } = useQuery({
    queryKey: ["slot-assignments", weekMondayIso, weekSundayIso],
    queryFn: () =>
      api.getSlotAssignments({
        from: weekMondayIso,
        to: weekSundayIso,
      }),
  });

  const weekOverrides = useMemo(() => {
    return allOverrides.filter(
      (o) => o.override_date >= weekMondayIso && o.override_date <= weekSundayIso,
    );
  }, [allOverrides, weekMondayIso, weekSundayIso]);

  // Overrides indexed by slot_id for the selected week
  const overridesBySlot = useMemo(() => {
    const map = new Map<string, TrainingSlotOverride[]>();
    for (const o of weekOverrides) {
      const list = map.get(o.slot_id) ?? [];
      list.push(o);
      map.set(o.slot_id, list);
    }
    return map;
  }, [weekOverrides]);

  /** Set of slot IDs cancelled this week */
  const cancelledSlotIds = useMemo(() => {
    const set = new Set<string>();
    for (const o of weekOverrides) {
      if (o.status === "cancelled") set.add(o.slot_id);
    }
    return set;
  }, [weekOverrides]);

  const slotInstancesById = useMemo(() => {
    const map = new Map<string, SlotInstance>();
    const today = todayIso();

    for (const slot of weekFilteredSlots) {
      const slotDate = weekDates[slot.day_of_week - 1];
      if (!slotDate) continue;

      const scheduledDate = slot.scheduled_date ?? toIsoDate(slotDate);
      const override = weekOverrides.find(
        (item) =>
          item.slot_id === slot.id &&
          item.override_date === scheduledDate,
      );
      const assignment = resolveSlotAssignment(slot, scheduledDate, slotAssignments);

      const state =
        override?.status === "cancelled"
          ? "cancelled"
          : computeSlotState(assignment, today);

      map.set(slot.id, {
        date: scheduledDate,
        slot,
        groups: slot.assignments,
        state,
        assignment,
        override,
      });
    }

    return map;
  }, [weekFilteredSlots, slotAssignments, weekDates, weekOverrides]);

  // ── Adaptive timeline range (desktop) ─────────────────────
  const timelineRange = useMemo(() => {
    let minH = 22;
    let maxH = 6;
    weekFilteredSlots.forEach((s) => {
      // Account for override times that may shift the slot
      const instance = slotInstancesById.get(s.id);
      const ov = instance?.override;
      const isMod = ov?.status === "modified";
      const effStart = (isMod && ov?.new_start_time) ? ov.new_start_time : s.start_time;
      const effEnd = (isMod && ov?.new_end_time) ? ov.new_end_time : s.end_time;
      const startH = Math.floor(timeToMinutes(effStart) / 60);
      const endH = Math.ceil(timeToMinutes(effEnd) / 60);
      if (startH < minH) minH = startH;
      if (endH > maxH) maxH = endH;
    });
    if (minH >= maxH) return { start: 6, end: 22, hours: 16 };
    // 1h buffer on each side
    const start = Math.max(0, minH - 1);
    const end = Math.min(24, maxH + 1);
    return { start, end, hours: end - start };
  }, [weekFilteredSlots, slotInstancesById]);

  const timelineHourLabels = useMemo(
    () => Array.from({ length: timelineRange.hours + 1 }, (_, i) => timelineRange.start + i),
    [timelineRange],
  );

  // Measure available viewport height below the timeline container
  const timelineContainerRef = useRef<HTMLDivElement>(null);
  const exportContentRef = useRef<HTMLDivElement>(null);
  const [availableHeight, setAvailableHeight] = useState(0);

  useEffect(() => {
    const el = timelineContainerRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      // Available = viewport bottom - element top - small bottom padding
      const h = window.innerHeight - rect.top - 16;
      setAvailableHeight(Math.max(200, h));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(document.body);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  // Dynamic px per hour: fill available space, min 28px/h for readability
  const dynamicPxPerHour = useMemo(() => {
    if (availableHeight <= 0) return PX_PER_HOUR; // fallback
    // Reserve ~28px for day headers row
    const usable = availableHeight - 28;
    const ideal = usable / timelineRange.hours;
    return Math.max(28, ideal);
  }, [availableHeight, timelineRange.hours]);

  const dynamicTimelineHeight = timelineRange.hours * dynamicPxPerHour;

  const handleCreate = () => {
    setEditingSlot(null);
    setShowSlotForm(true);
  };

  const handleSelect = useCallback((slot: TrainingSlot) => {
    const instance = slotInstancesById.get(slot.id);
    if (!instance) return;
    setSelectedInstance(instance);
    setShowSessionSheet(true);
  }, [slotInstancesById]);

  const handleEditSlot = (instance: SlotInstance) => {
    setEditingSlot(instance.slot);
    setShowSlotForm(true);
  };

  const handleManageOverride = (instance: SlotInstance) => {
    setOverrideSlot(instance.slot);
    setOverrideInitialDate(instance.date);
    setShowOverrideForm(true);
  };

  const handleCreateNewSession = (instance: SlotInstance) => {
    if (!onOpenLibrary) return;
    setShowSessionSheet(false);
    onOpenLibrary(buildSwimLibraryContext(instance, "create"));
  };

  const handleEditSession = (sessionId: number) => {
    if (!onOpenLibrary) return;
    setShowSessionSheet(false);
    if (!selectedInstance) {
      onOpenLibrary();
      return;
    }
    onOpenLibrary(buildSwimLibraryContext(selectedInstance, "edit", sessionId));
  };

  const handlePickTemplate = (instance: SlotInstance, selectedGroupIds: number[], visibleFrom: string) => {
    setTemplateTargetInstance(instance);
    setTemplateSelectedGroups(selectedGroupIds);
    setTemplateVisibleFrom(visibleFrom);
    setShowSessionSheet(false);
    setTemplatePickerOpen(true);
  };

  const assignTemplateMutation = useMutation({
    mutationFn: async ({
      catalogId,
      instance,
      groupIds,
      visibleFrom,
    }: {
      catalogId: number;
      instance: SlotInstance;
      groupIds: number[];
      visibleFrom: string;
    }) => {
      if (groupIds.length === 0) throw new Error("Aucun groupe sélectionné");
      if (!userId) throw new Error("Utilisateur non connecté");

      await api.bulkCreateSlotAssignments({
        swimCatalogId: catalogId,
        trainingSlotId: instance.slot.id,
        scheduledDate: instance.date,
        groupIds,
        scheduledSlot: deriveScheduledSlot(instance.slot.start_time),
        visibleFrom: visibleFrom || instance.date,
        assignedBy: userId,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["slot-assignments"] });
      void queryClient.invalidateQueries({ queryKey: ["resolved-assignments-batch"] });
      setTemplatePickerOpen(false);
      setTemplateTargetInstance(null);
      toast({ title: "Séance assignée au créneau" });
    },
    onError: (err: Error) => {
      toast({
        title: "Erreur",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const handleTemplateSelect = (catalogId: number) => {
    if (!templateTargetInstance) return;
    assignTemplateMutation.mutate({
      catalogId,
      instance: templateTargetInstance,
      groupIds: templateSelectedGroups,
      visibleFrom: templateVisibleFrom,
    });
  };

  const coachesForForm = coaches.map((c) => ({
    id: c.id,
    display_name: c.display_name,
  }));

  // ── Export image ───────────────────────────────────────
  const [exporting, setExporting] = useState(false);

  const shareOrDownloadPng = useCallback(async (blob: Blob, fileName: string) => {
    if (navigator.share && navigator.canShare) {
      const file = new File([blob], fileName, { type: "image/png" });
      const shareData = { files: [file] };
      try {
        if (navigator.canShare(shareData)) {
          await navigator.share(shareData);
          return;
        }
      } catch {
        // User cancelled or share failed — fall through to download
      }
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const buildFallbackWeekPng = useCallback(async (): Promise<Blob> => {
    const width = 2400;
    const padX = 40;
    const padY = 40;
    const leftAxisWidth = 150;
    const colGap = 16;
    const visibleWeekDates = weekDates.slice(0, 6); // Lun -> Sam (sans dimanche)
    const colCount = visibleWeekDates.length;
    const headerTitleH = 200;
    const daysHeaderH = 120;

    const weekData = visibleWeekDates.map((date, i) => {
      const day = i + 1;
      const slots = (slotsByDay.get(day) ?? [])
        .map((slot) => {
          const instance = slotInstancesById.get(slot.id);
          const ov = instance?.override;
          const isModified = ov?.status === "modified";
          const isCancelled = instance?.state === "cancelled";
          const start = isModified && ov?.new_start_time ? ov.new_start_time : slot.start_time;
          const end = isModified && ov?.new_end_time ? ov.new_end_time : slot.end_time;
          const location = isModified && ov?.new_location ? ov.new_location : slot.location;
          const coachesLabel = (slot.coaches ?? []).map((c) => c.coach_name).join(", ") || "Non défini";
          const sessionName = instance?.assignment?.session_name ?? null;
          const groupsLabel = slot.assignments.map((a) => a.group_name).join(", ");
          return {
            start,
            end,
            location,
            swim: isSwimSlot(slot),
            isModified,
            isCancelled,
            state: instance?.state ?? "empty",
            coachesLabel,
            sessionName,
            groupsLabel,
          };
        })
        .sort((a, b) => a.start.localeCompare(b.start));

      return {
        dayShort: DAYS_SHORT[i],
        dayFull: DAYS_FR[i],
        dateLabel: formatDayMonth(date),
        slots,
      };
    });

    const allTimes = weekData.flatMap((d) => d.slots.flatMap((s) => [timeToMinutes(s.start), timeToMinutes(s.end)]));
    let startMin = TIMELINE_START * 60;
    let endMin = TIMELINE_END * 60;
    if (allTimes.length > 0) {
      const min = Math.min(...allTimes);
      const max = Math.max(...allTimes);
      startMin = Math.max(0, Math.floor((min - 60) / 60) * 60);
      endMin = Math.min(24 * 60, Math.ceil((max + 60) / 60) * 60);
      if (endMin <= startMin) {
        startMin = TIMELINE_START * 60;
        endMin = TIMELINE_END * 60;
      }
    }

    const totalHours = Math.max(1, (endMin - startMin) / 60);
    const pxPerHour = 160;
    const timelineHeight = Math.max(1200, totalHours * pxPerHour);
    const height = padY + headerTitleH + daysHeaderH + timelineHeight + padY;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Impossible de créer le canvas");

    const truncate = (txt: string, maxWidth: number, font: string) => {
      ctx.font = font;
      if (ctx.measureText(txt).width <= maxWidth) return txt;
      let out = txt;
      while (out.length > 0 && ctx.measureText(`${out}…`).width > maxWidth) {
        out = out.slice(0, -1);
      }
      return out.length > 0 ? `${out}…` : "";
    };

    const drawWavesIcon = (x: number, y: number, size: number, color: string) => {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(2, size * 0.1);
      ctx.lineCap = "round";
      for (let row = 0; row < 2; row += 1) {
        const yy = y + size * (0.38 + row * 0.28);
        ctx.beginPath();
        ctx.moveTo(x + size * 0.08, yy);
        ctx.quadraticCurveTo(x + size * 0.22, yy - size * 0.13, x + size * 0.36, yy);
        ctx.quadraticCurveTo(x + size * 0.5, yy + size * 0.13, x + size * 0.64, yy);
        ctx.quadraticCurveTo(x + size * 0.78, yy - size * 0.13, x + size * 0.92, yy);
        ctx.stroke();
      }
      ctx.restore();
    };

    const drawDumbbellIcon = (x: number, y: number, size: number, color: string) => {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = Math.max(2, size * 0.1);
      ctx.lineCap = "round";

      const midY = y + size * 0.5;
      ctx.beginPath();
      ctx.moveTo(x + size * 0.26, midY);
      ctx.lineTo(x + size * 0.74, midY);
      ctx.stroke();

      const plateW = size * 0.11;
      const plateHOuter = size * 0.58;
      const plateHInner = size * 0.44;
      const leftX = x + size * 0.1;
      const rightX = x + size * 0.79;
      const outerY = y + (size - plateHOuter) / 2;
      const innerY = y + (size - plateHInner) / 2;

      ctx.fillRect(leftX, outerY, plateW, plateHOuter);
      ctx.fillRect(leftX + plateW + size * 0.05, innerY, plateW, plateHInner);
      ctx.fillRect(rightX - plateW - size * 0.05, innerY, plateW, plateHInner);
      ctx.fillRect(rightX, outerY, plateW, plateHOuter);
      ctx.restore();
    };

    const drawStopSignIcon = (x: number, y: number, size: number) => {
      const cx = x + size / 2;
      const cy = y + size / 2;
      const r = size * 0.46;

      ctx.save();
      ctx.beginPath();
      for (let i = 0; i < 8; i += 1) {
        const angle = (-Math.PI / 2) + i * (Math.PI / 4);
        const px = cx + r * Math.cos(angle);
        const py = cy + r * Math.sin(angle);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = "#dc2626";
      ctx.fill();
      ctx.lineWidth = Math.max(1.8, size * 0.08);
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();

      ctx.fillStyle = "#ffffff";
      ctx.font = `700 ${Math.max(7, Math.round(size * 0.24))}px Inter, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("STOP", cx, cy + 0.5);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.restore();
    };

    const gridX = padX + leftAxisWidth;
    const gridY = padY + headerTitleH + daysHeaderH;
    const gridW = width - padX - gridX;
    const colW = (gridW - colGap * (colCount - 1)) / colCount;

    const yFromMinutes = (minutes: number) =>
      gridY + ((minutes - startMin) / (endMin - startMin)) * timelineHeight;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    // Title
    ctx.fillStyle = "#0f172a";
    ctx.font = "700 76px Inter, sans-serif";
    ctx.fillText(
      `Créneaux — S${weekNumber} · ${formatDayMonth(visibleWeekDates[0])} – ${formatDayMonth(visibleWeekDates[visibleWeekDates.length - 1])}`,
      padX,
      padY + 80,
    );

    // Day headers
    for (let i = 0; i < weekData.length; i += 1) {
      const x = gridX + i * (colW + colGap);
      const center = x + colW / 2;
      const day = weekData[i];
      ctx.fillStyle = "#64748b";
      ctx.font = "700 32px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(day.dayShort.toUpperCase(), center, padY + headerTitleH - 30);
      ctx.fillStyle = "#111827";
      ctx.font = "700 38px Inter, sans-serif";
      ctx.fillText(day.dateLabel, center, padY + headerTitleH + 18);
      ctx.textAlign = "left";
    }

    // Background columns
    for (let i = 0; i < colCount; i += 1) {
      const x = gridX + i * (colW + colGap);
      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(x, gridY, colW, timelineHeight);
    }

    // Hour lines + labels
    for (let h = Math.ceil(startMin / 60); h <= Math.floor(endMin / 60); h += 1) {
      const y = yFromMinutes(h * 60);
      ctx.strokeStyle = h % 2 === 0 ? "#cbd5e1" : "#e2e8f0";
      ctx.lineWidth = h % 2 === 0 ? 1.2 : 1;
      ctx.beginPath();
      ctx.moveTo(gridX, y);
      ctx.lineTo(gridX + gridW, y);
      ctx.stroke();

      ctx.fillStyle = "#64748b";
      ctx.font = "600 30px Inter, sans-serif";
      ctx.fillText(`${String(h).padStart(2, "0")}h`, padX + 8, y + 8);
    }

    // Vertical separators
    for (let i = 0; i <= colCount; i += 1) {
      const x = i === colCount ? gridX + gridW : gridX + i * (colW + colGap) - (i > 0 ? colGap / 2 : 0);
      ctx.strokeStyle = "#dbe3ee";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, gridY);
      ctx.lineTo(x, gridY + timelineHeight);
      ctx.stroke();
    }

    // Slot cards
    for (let i = 0; i < weekData.length; i += 1) {
      const dayX = gridX + i * (colW + colGap);
      for (const s of weekData[i].slots) {
        const startY = yFromMinutes(timeToMinutes(s.start)) + 2;
        const endY = yFromMinutes(timeToMinutes(s.end)) - 2;
        const cardH = Math.max(200, endY - startY);
        const cardY = startY;
        const cardX = dayX + 8;
        const cardW = colW - 16;

        // Keep swim/strength base color — modified gets orange top accent only
        let bg = s.swim ? "rgba(59,130,246,0.15)" : "rgba(251,191,36,0.15)";
        let border = s.swim ? "rgba(96,165,250,0.40)" : "rgba(251,191,36,0.40)";
        let fg = "#0f172a";

        if (s.state === "published") {
          bg = "rgba(16,185,129,0.12)";
          border = "rgba(16,185,129,0.30)";
          fg = "#065f46";
        } else if (s.state === "draft") {
          bg = "rgba(245,158,11,0.12)";
          border = "rgba(245,158,11,0.30)";
          fg = "#92400e";
        }
        if (s.isCancelled) {
          bg = "rgba(148,163,184,0.16)";
          border = "rgba(100,116,139,0.22)";
          fg = "#64748b";
        }

        ctx.fillStyle = bg;
        ctx.strokeStyle = border;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(cardX, cardY, cardW, cardH, 14);
        ctx.fill();
        ctx.stroke();

        // Orange top accent bar for modified slots
        if (s.isModified && !s.isCancelled) {
          ctx.fillStyle = "#f97316"; // orange-500
          ctx.beginPath();
          ctx.roundRect(cardX, cardY, cardW, 5, [14, 14, 0, 0]);
          ctx.fill();
        }

        const iconReserve = 52;
        const textMaxWidth = cardW - 30 - iconReserve;
        const timeLine = `${formatTime(s.start)} – ${formatTime(s.end)}`;
        const sessionLine = s.sessionName ? truncate(s.sessionName, textMaxWidth, "700 34px Inter, sans-serif") : null;
        const coachLine = truncate(s.coachesLabel, textMaxWidth, "600 30px Inter, sans-serif");
        const locationLine = truncate(s.location, textMaxWidth, "500 28px Inter, sans-serif");
        const groupsLine = s.groupsLabel ? truncate(s.groupsLabel, textMaxWidth, "500 26px Inter, sans-serif") : null;

        const textX = cardX + 16;
        let textCursor = cardY + 48;

        // Time
        ctx.fillStyle = fg;
        ctx.font = "700 40px Inter, sans-serif";
        ctx.fillText(timeLine, textX, textCursor);
        textCursor += 46;

        // Session name
        if (sessionLine) {
          ctx.fillStyle = s.state === "published" ? "#065f46" : s.state === "draft" ? "#92400e" : fg;
          ctx.font = "700 34px Inter, sans-serif";
          ctx.fillText(sessionLine, textX, textCursor);
          textCursor += 40;
        }

        // Coach
        ctx.fillStyle = fg;
        ctx.font = "600 30px Inter, sans-serif";
        ctx.fillText(coachLine, textX, textCursor);
        textCursor += 36;

        // Location
        ctx.fillStyle = s.isCancelled ? "#94a3b8" : "#64748b";
        ctx.font = "500 28px Inter, sans-serif";
        ctx.fillText(locationLine, textX, textCursor);
        textCursor += 32;

        // Groups
        if (groupsLine) {
          ctx.fillStyle = "#94a3b8";
          ctx.font = "500 26px Inter, sans-serif";
          ctx.fillText(groupsLine, textX, textCursor);
        }

        const iconSize = 40;
        const iconX = cardX + cardW - iconSize - 14;
        const iconY = cardY + cardH - iconSize - 14;
        const iconColor = s.swim ? "#2563eb" : "#b45309";
        if (s.isCancelled) {
          drawStopSignIcon(iconX, iconY, iconSize);
        } else if (s.swim) {
          drawWavesIcon(iconX, iconY, iconSize, iconColor);
        } else {
          drawDumbbellIcon(iconX, iconY, iconSize, iconColor);
        }

        if (s.isCancelled) {
          ctx.strokeStyle = "#94a3b8";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(cardX + 10, cardY + cardH / 2);
          ctx.lineTo(cardX + cardW - iconReserve, cardY + cardH / 2);
          ctx.stroke();
        }
      }
    }

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => {
        if (b) resolve(b);
        else reject(new Error("Impossible de générer l'image"));
      }, "image/png");
    });
    return blob;
  }, [slotsByDay, slotInstancesById, weekDates, weekNumber]);

  const handleExportImage = useCallback(async () => {
    const el = exportContentRef.current;
    if (!el || exporting) return;
    setExporting(true);
    let cleanupCapture = () => {};
    try {
      const html2canvas = (await import("html2canvas")).default;
      const { onclone, cleanup } = buildHtml2CanvasOnClone(el);
      cleanupCapture = cleanup;
      const fileName = `semaine-${weekMondayIso}.png`;
      let blob: Blob;
      try {
        const canvas = await html2canvas(el, {
          backgroundColor: "#ffffff",
          scale: 2,
          useCORS: true,
          logging: false,
          onclone,
        });
        blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((b) => {
            if (b) resolve(b);
            else reject(new Error("Impossible de générer l'image"));
          }, "image/png");
        });
      } catch (captureErr) {
        const msg = String(captureErr).toLowerCase();
        if (msg.includes("oklab") || msg.includes("unsupported color function")) {
          blob = await buildFallbackWeekPng();
        } else {
          throw captureErr;
        }
      }

      await shareOrDownloadPng(blob, fileName);
    } catch (err) {
      toast({ title: "Erreur export", description: String(err), variant: "destructive" });
    } finally {
      cleanupCapture();
      setExporting(false);
    }
  }, [buildFallbackWeekPng, exporting, shareOrDownloadPng, toast, weekMondayIso]);

  return (
    <div className="space-y-4 pb-24">
      {/* ── Mobile header ── */}
      <div className="sm:hidden">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {onBack && (
              <Button variant="ghost" size="icon" className="h-10 w-10 -ml-2" onClick={onBack}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
            )}
            <div>
              <h2 className="text-lg font-display font-semibold uppercase italic text-primary leading-tight">
                Créneaux
              </h2>
              {slots.length > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  {slots.length} créneau{slots.length > 1 ? "x" : ""} actif{slots.length > 1 ? "s" : ""}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="flex items-center justify-center h-9 w-9 rounded-full border border-border bg-card text-muted-foreground active:scale-90 transition-all disabled:opacity-50"
              onClick={handleExportImage}
              disabled={exporting || slotsLoading}
              aria-label="Exporter en image"
            >
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
            </button>
            {onOpenLibrary && (
              <button
                type="button"
                className="flex items-center justify-center h-9 w-9 rounded-full border border-border bg-card text-primary active:scale-90 transition-all"
                onClick={() => onOpenLibrary()}
                aria-label="Ouvrir la bibliothèque"
              >
                <BookOpen className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              className="flex items-center justify-center h-9 w-9 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/20 active:scale-90 transition-all"
              onClick={handleCreate}
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Mobile filter ── */}
      {!slotsLoading && slots.length > 0 && (
        <div className="sm:hidden">
          <Select value={filterValue} onValueChange={setFilterValue}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Filtrer..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les créneaux</SelectItem>
              <SelectSeparator />
              {groups.map((g) => (
                <SelectItem key={g.id} value={`group:${g.id}`}>
                  {g.name}
                </SelectItem>
              ))}
              {athletes.length > 0 && <SelectSeparator />}
              {athletes.map((a) => (
                <SelectItem key={`swimmer:${a.id}`} value={`swimmer:${a.id}`}>
                  {a.display_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* ── Desktop: row 1 — filter (left) + actions + mode toggle (right) ── */}
      <div className="hidden sm:flex items-center gap-2">
        <Select value={filterValue} onValueChange={setFilterValue}>
          <SelectTrigger className="w-44 h-8 text-xs">
            <SelectValue placeholder="Filtrer..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les créneaux</SelectItem>
            <SelectSeparator />
            {groups.map((g) => (
              <SelectItem key={g.id} value={`group:${g.id}`}>
                {g.name}
              </SelectItem>
            ))}
            {coaches.length > 0 && <SelectSeparator />}
            {coaches.map((c) => (
              <SelectItem key={c.id} value={`coach:${c.id}`}>
                {c.display_name}
              </SelectItem>
            ))}
            {athletes.length > 0 && <SelectSeparator />}
            {athletes.map((a) => (
              <SelectItem key={`swimmer:${a.id}`} value={`swimmer:${a.id}`}>
                {a.display_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground"
          onClick={handleExportImage}
          disabled={exporting || slotsLoading}
        >
          {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Share2 className="h-3.5 w-3.5" />}
        </Button>
        {onOpenLibrary && (
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => onOpenLibrary()}>
            <BookOpen className="mr-1.5 h-3.5 w-3.5" />
            Bibliothèque
          </Button>
        )}
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleCreate}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Nouveau
        </Button>
        {modeToggle}
      </div>

      {/* ── Desktop: row 2 — week navigation ── */}
      <div className="hidden sm:flex items-center justify-center gap-2">
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={prevWeek}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1 text-sm font-semibold hover:bg-muted/50 transition-colors"
          onClick={goToday}
          title="Revenir à cette semaine"
        >
          <span className="text-primary">S{weekNumber}</span>
          <span className="text-muted-foreground text-xs font-normal">
            {formatDayMonth(weekMonday)} – {formatDayMonth(weekSunday)}
          </span>
        </button>
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={nextWeek}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* ── Content ── */}
      {slotsLoading ? (
        <>
          {/* Mobile skeleton */}
          <div className="sm:hidden space-y-3">
            <div className="flex items-center justify-between">
              <div className="h-8 w-8 rounded-full bg-muted animate-pulse motion-reduce:animate-none" />
              <div className="h-4 w-28 rounded bg-muted animate-pulse motion-reduce:animate-none" />
              <div className="h-8 w-8 rounded-full bg-muted animate-pulse motion-reduce:animate-none" />
            </div>
            <div className="grid grid-cols-7 gap-0 rounded-xl border border-border overflow-hidden">
              {Array.from({ length: 7 }, (_, i) => (
                <div key={i} className="flex flex-col items-center py-2 gap-1">
                  <div className="h-3 w-6 rounded bg-muted animate-pulse motion-reduce:animate-none" />
                  <div className="h-7 w-7 rounded-full bg-muted animate-pulse motion-reduce:animate-none" />
                  <div className="h-8 w-5 rounded bg-muted/50 animate-pulse motion-reduce:animate-none mt-1" />
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <div className="h-4 w-32 rounded bg-muted animate-pulse motion-reduce:animate-none" />
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="h-20 rounded-xl bg-muted animate-pulse motion-reduce:animate-none" />
              ))}
            </div>
          </div>
          {/* Desktop skeleton */}
          <div className="hidden sm:grid grid-cols-7 gap-2">
            {Array.from({ length: 7 }, (_, i) => (
              <div key={i} className="space-y-2">
                <div className="h-4 w-12 rounded bg-muted animate-pulse motion-reduce:animate-none" />
                <div className="h-40 rounded-lg bg-muted animate-pulse motion-reduce:animate-none" />
              </div>
            ))}
          </div>
        </>
      ) : slots.length === 0 ? (
        <div className="text-center py-16 space-y-4">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-muted/60 flex items-center justify-center">
            <Clock className="h-7 w-7 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">
              Aucun créneau défini
            </p>
            <p className="text-xs text-muted-foreground">
              Créez votre premier créneau d'entraînement.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleCreate}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Créer un créneau
          </Button>
        </div>
      ) : (
        <>
          {/* ── Swimmer inherited banner ── */}
          {swimmerFilterId != null && swimmerHasCustom === false && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 px-3 py-2 text-sm text-blue-700 dark:text-blue-300">
              Ce nageur hérite des créneaux du groupe. Personnalisez depuis sa fiche.
            </div>
          )}

          {/* ── Capturable content area ── */}
          <div ref={exportContentRef}>
          {/* Export-only header — hidden on screen, visible in capture */}
          <div className="hidden export-visible px-1 pb-3">
            <p className="text-base font-bold capitalize" style={{ fontFamily: "var(--font-display, 'Oswald', sans-serif)" }}>
              Séances — S{weekNumber} · {formatDayMonth(weekDates[0])} – {formatDayMonth(weekDates[6])}
            </p>
          </div>

          {/* ── Mobile view ── */}
          <div className="sm:hidden">
            <MobileView
              slotsByDay={slotsByDay}
              slotInstancesById={slotInstancesById}
              weekDates={weekDates}
              todayStr={todayIso()}
              overridesBySlot={overridesBySlot}
              cancelledSlotIds={cancelledSlotIds}
              onSelect={handleSelect}
              onPrevWeek={prevWeek}
              onNextWeek={nextWeek}
              weekNumber={weekNumber}
              competitionsByDate={competitionsByDate}
              onOpenCompetition={handleOpenCompetition}
            />
          </div>

          {/* ── Desktop timeline (viewport-fitted, breaks out of container for wider view) ── */}
          <div
            ref={timelineContainerRef}
            className="hidden sm:block overflow-x-auto -mx-4 px-4 lg:w-[calc(100%+12rem)] lg:-ml-24 lg:px-6 xl:w-[calc(100%+20rem)] xl:-ml-40 xl:px-8"
          >
            <div
              className="grid"
              style={{
                minWidth: "760px",
                gridTemplateColumns: "2.5rem repeat(7, 1fr)",
              }}
            >
              {/* ── Day headers row ── */}
              <div /> {/* empty cell above time labels */}
              {weekDates.map((date, i) => {
                const isToday = toIsoDate(date) === todayIso();
                return (
                  <div key={i} className="text-center pb-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                      {DAYS_FR[i]}
                    </span>
                    <br />
                    <span className={`text-[10px] ${isToday ? "text-primary font-bold" : "text-muted-foreground/60"}`}>
                      {formatDayMonth(date)}
                    </span>
                  </div>
                );
              })}

              {/* ── Competition strips row (desktop) ── */}
              <div />
              {weekDates.map((date, i) => {
                const entries = competitionsByDate.get(toIsoDate(date)) ?? [];
                return (
                  <div key={`comp-${i}`} className="px-0.5 pb-1">
                    {entries.map((entry) => (
                      <button
                        key={`${entry.competition.id}-desk`}
                        type="button"
                        onClick={() => handleOpenCompetition(entry.competition)}
                        className="w-full text-left px-1.5 py-1 mb-1 rounded-md bg-gradient-to-r from-rose-500/15 to-orange-500/10 border border-rose-500/30 flex items-center gap-1 hover:bg-rose-500/20 transition-colors"
                      >
                        <Trophy className="h-3 w-3 text-rose-600 dark:text-rose-400 shrink-0" />
                        <span className="text-[10px] font-semibold truncate text-foreground">
                          {entry.competition.name}
                        </span>
                        {entry.totalDays > 1 && (
                          <span className="text-[9px] text-rose-600/70 dark:text-rose-400/70 shrink-0">
                            J{entry.dayIndex}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                );
              })}

              {/* ── Time labels column ── */}
              <div className="relative" style={{ height: dynamicTimelineHeight }}>
                {timelineHourLabels.map((h) => (
                  <span
                    key={h}
                    className="absolute right-1 text-[9px] text-muted-foreground/70 leading-none -translate-y-1/2"
                    style={{ top: (h - timelineRange.start) * dynamicPxPerHour }}
                  >
                    {h}h
                  </span>
                ))}
              </div>

              {/* ── 7 day columns ── */}
              {Array.from({ length: 7 }, (_, i) => i + 1).map((day) => {
                const daySlots = slotsByDay.get(day) ?? [];
                return (
                  <div
                    key={day}
                    className="relative border-l border-border/40"
                    style={{ height: dynamicTimelineHeight }}
                  >
                    {/* Hour grid lines */}
                    {timelineHourLabels.map((h) => (
                      <div
                        key={h}
                        className="absolute left-0 right-0 border-t border-border/20"
                        style={{ top: (h - timelineRange.start) * dynamicPxPerHour }}
                      />
                    ))}

                    {/* Slot blocks */}
                    {daySlots.map((slot) => {
                      const instance = slotInstancesById.get(slot.id);
                      const ov = instance?.override;
                      const isModified = ov?.status === "modified";
                      const effectiveStart = (isModified && ov?.new_start_time) ? ov.new_start_time : slot.start_time;
                      const effectiveEnd = (isModified && ov?.new_end_time) ? ov.new_end_time : slot.end_time;
                      const slotTop = ((timeToMinutes(effectiveStart) - timelineRange.start * 60) / 60) * dynamicPxPerHour;
                      const slotHeight = ((timeToMinutes(effectiveEnd) - timeToMinutes(effectiveStart)) / 60) * dynamicPxPerHour;
                      return (
                        <TimelineSlotInline
                          key={slot.id}
                          slot={slot}
                          instance={instance}
                          hasOverrides={(overridesBySlot.get(slot.id) ?? []).length > 0}
                          cancelled={cancelledSlotIds.has(slot.id)}
                          onSelect={handleSelect}
                          top={slotTop}
                          height={slotHeight}
                        />
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
          </div>{/* end exportContentRef */}
        </>
      )}

      <CompetitionQuickSheet
        competition={selectedCompetition}
        open={compSheetOpen}
        onOpenChange={(open) => {
          setCompSheetOpen(open);
          if (!open) setSelectedCompetition(null);
        }}
        onViewDetail={handleViewCompetitionDetail}
      />

      <Suspense fallback={null}>
        {showSessionSheet && (
          <SlotSessionSheet
            instance={selectedInstance}
            open={showSessionSheet}
            onOpenChange={setShowSessionSheet}
            onCreateNew={handleCreateNewSession}
            onEditSession={handleEditSession}
            onPickTemplate={handlePickTemplate}
            onEditSlot={handleEditSlot}
            onManageOverride={handleManageOverride}
          />
        )}
      </Suspense>

      {/* Slot Form Sheet */}
      <SlotFormSheet
        open={showSlotForm}
        onOpenChange={setShowSlotForm}
        slot={editingSlot}
        groups={groups}
        coaches={coachesForForm}
      />

      {/* Override Form Sheet */}
      <OverrideFormSheet
        open={showOverrideForm}
        onOpenChange={setShowOverrideForm}
        slot={overrideSlot}
        initialDate={overrideInitialDate}
        coaches={coachesForForm}
      />

      <Suspense fallback={null}>
        {templatePickerOpen && (
          <SlotTemplatePicker
            open={templatePickerOpen}
            onOpenChange={(open: boolean) => {
              setTemplatePickerOpen(open);
              if (!open) {
                setTemplateTargetInstance(null);
                setTemplateSelectedGroups([]);
                setTemplateVisibleFrom("");
              }
            }}
            onSelect={(catalogId: number, _sessionName: string) => handleTemplateSelect(catalogId)}
            isAssigning={assignTemplateMutation.isPending}
          />
        )}
      </Suspense>
    </div>
  );
};

export default CoachTrainingSlotsScreen;
