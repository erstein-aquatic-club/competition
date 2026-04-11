import { useEffect, useMemo, useRef, useState } from "react";
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
import CoachSectionHeader from "./CoachSectionHeader";
import SlotSessionSheet from "./SlotSessionSheet";
import { SlotTemplatePicker } from "./SlotTemplatePicker";
import type { SwimLibraryEntryContext } from "./swimLibraryEntryContext";
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
} from "lucide-react";

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

/** True if slot is a swimming session (vs PPG/muscu) based on location */
function isSwimSlot(location: string): boolean {
  const loc = location.toLowerCase();
  return loc.includes("piscine") || loc.includes("bassin") || (!loc.includes("salle") && !loc.includes("muscu") && !loc.includes("ppg") && !loc.includes("gym"));
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

  const [dayOfWeek, setDayOfWeek] = useState("1");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [location, setLocation] = useState("");
  const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>([]);
  const [selectedCoachIds, setSelectedCoachIds] = useState<number[]>([]);
  const [laneCount, setLaneCount] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (slot) {
      setDayOfWeek(String(slot.day_of_week));
      setStartTime(formatTime(slot.start_time));
      setEndTime(formatTime(slot.end_time));
      setLocation(slot.location);
      setSelectedGroupIds(slot.assignments.map((a) => a.group_id));
      setSelectedCoachIds((slot.coaches ?? []).map((c) => c.coach_id));
      setLaneCount(slot.lane_count != null ? String(slot.lane_count) : "");
    } else {
      setDayOfWeek("1");
      setStartTime("");
      setEndTime("");
      setLocation("");
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
    return {
      day_of_week: Number(dayOfWeek),
      start_time: startTime,
      end_time: endTime,
      location: location.trim(),
      lane_count: laneCount ? Number(laneCount) : null,
      group_ids: selectedGroupIds,
      coach_ids: selectedCoachIds,
    };
  };

  const createMutation = useMutation({
    mutationFn: (input: TrainingSlotInput) => api.createTrainingSlot(input),
    onSuccess: () => {
      toast({ title: "Creneau cree" });
      void queryClient.invalidateQueries({ queryKey: ["training-slots"] });
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
            {/* Day of week */}
            <div className="space-y-2">
              <Label>Jour de la semaine *</Label>
              <Select value={dayOfWeek} onValueChange={setDayOfWeek}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAYS_FR.map((d, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

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
                disabled={isPending || !startTime || !endTime || !location.trim()}
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
};

const OverrideFormSheet = ({
  open,
  onOpenChange,
  slot,
  initialDate,
}: OverrideFormSheetProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [overrideDate, setOverrideDate] = useState("");
  const [status, setStatus] = useState<"cancelled" | "modified">("cancelled");
  const [newStartTime, setNewStartTime] = useState("");
  const [newEndTime, setNewEndTime] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!open) return;
    setOverrideDate(initialDate ?? "");
    setStatus("cancelled");
    setNewStartTime(slot ? formatTime(slot.start_time) : "");
    setNewEndTime(slot ? formatTime(slot.end_time) : "");
    setNewLocation(slot?.location ?? "");
    setReason("");
  }, [open, slot]);

  const createMutation = useMutation({
    mutationFn: (input: TrainingSlotOverrideInput) =>
      api.createSlotOverride(input),
    onSuccess: () => {
      toast({ title: "Exception enregistree" });
      void queryClient.invalidateQueries({
        queryKey: ["training-slot-overrides"],
      });
      void queryClient.invalidateQueries({ queryKey: ["training-slots"] });
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

    const input: TrainingSlotOverrideInput = {
      slot_id: slot.id,
      override_date: overrideDate,
      status,
      new_start_time: status === "modified" ? newStartTime || null : null,
      new_end_time: status === "modified" ? newEndTime || null : null,
      new_location:
        status === "modified" && newLocation.trim()
          ? newLocation.trim()
          : null,
      reason: reason.trim() || null,
    };

    createMutation.mutate(input);
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
            disabled={createMutation.isPending || !overrideDate}
          >
            {createMutation.isPending ? "Enregistrement..." : "Enregistrer"}
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
  const swim = isSwimSlot(slot.location);
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
function TimelineSlotInline({
  slot,
  instance,
  hasOverrides,
  cancelled = false,
  onSelect,
  top,
  height,
}: TimelineSlotProps & { top: number; height: number }) {
  const isShort = height < 50;
  const swim = isSwimSlot(slot.location);
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
                  const startMin = timeToMinutes(slot.start_time) - stripRange.start * 60;
                  const endMin = timeToMinutes(slot.end_time) - stripRange.start * 60;
                  const topPct = Math.max(0, (startMin / stripTotalMin) * 100);
                  const heightPct = Math.max(8, ((endMin - startMin) / stripTotalMin) * 100);
                  const swim = isSwimSlot(slot.location);
                  const cancelled = cancelledSlotIds.has(slot.id);
                  const instance = slotInstancesById.get(slot.id);
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
              const swim = isSwimSlot(slot.location);
              const cancelled = cancelledSlotIds.has(slot.id);
              const slotOverrides = overridesBySlot.get(slot.id) ?? [];
              const hasOverrides = slotOverrides.length > 0;
              const instance = slotInstancesById.get(slot.id);
              const completionState = getSlotCompletionState(instance);
              const isPublished = instance?.state === "published";
              const isDraft = instance?.state === "draft";

              return (
                <button
                  key={slot.id}
                  type="button"
                  className={`w-full text-left rounded-xl border bg-card transition-all active:scale-[0.98] ${
                    cancelled ? "opacity-50 border-border" : "border-border hover:border-border/80"
                  }`}
                  onClick={() => onSelect(slot)}
                >
                  <div className="flex">
                    {/* Color accent bar */}
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
                            {formatTime(slot.start_time)} – {formatTime(slot.end_time)}
                          </span>
                          <span className={`text-xs tabular-nums px-1.5 py-0.5 rounded-md font-medium ${
                            swim
                              ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                              : "bg-amber-400/10 text-amber-600 dark:text-amber-400"
                          }`}>
                            {durationLabel(slot.start_time, slot.end_time)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <SlotCompletionBadge state={completionState} />
                          {hasOverrides && !cancelled && (
                            <AlertTriangle className="h-3.5 w-3.5 text-orange-500 flex-shrink-0" />
                          )}
                        </div>
                      </div>

                      {/* Location */}
                      <div className="flex items-center gap-1.5 mt-1">
                        <MapPin className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                        <span className="text-xs text-muted-foreground truncate">
                          {slot.location}
                        </span>
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
      is_active: s.is_active,
      created_by: s.created_by,
      created_at: s.created_at,
      assignments: [],
      lane_count: null,
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

  // Group filtered slots by day, sorted by start_time
  const slotsByDay = useMemo(() => {
    const map = new Map<number, TrainingSlot[]>();
    for (let d = 1; d <= 7; d++) map.set(d, []);
    for (const s of filteredSlots) {
      map.get(s.day_of_week)!.push(s);
    }
    // Sort each day by start_time
    for (const list of map.values()) {
      list.sort((a, b) => a.start_time.localeCompare(b.start_time));
    }
    return map;
  }, [filteredSlots]);

  // Overrides scoped to the selected week
  const weekMondayIso = toIsoDate(weekMonday);
  const weekSundayIso = toIsoDate(weekSunday);

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

    for (const slot of filteredSlots) {
      const slotDate = weekDates[slot.day_of_week - 1];
      if (!slotDate) continue;

      const scheduledDate = toIsoDate(slotDate);
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
  }, [filteredSlots, slotAssignments, weekDates, weekOverrides]);

  // ── Adaptive timeline range (desktop) ─────────────────────
  const timelineRange = useMemo(() => {
    let minH = 22;
    let maxH = 6;
    filteredSlots.forEach((s) => {
      const startH = Math.floor(timeToMinutes(s.start_time) / 60);
      const endH = Math.ceil(timeToMinutes(s.end_time) / 60);
      if (startH < minH) minH = startH;
      if (endH > maxH) maxH = endH;
    });
    if (minH >= maxH) return { start: 6, end: 22, hours: 16 };
    // 1h buffer on each side
    const start = Math.max(0, minH - 1);
    const end = Math.min(24, maxH + 1);
    return { start, end, hours: end - start };
  }, [filteredSlots]);

  const timelineHourLabels = useMemo(
    () => Array.from({ length: timelineRange.hours + 1 }, (_, i) => timelineRange.start + i),
    [timelineRange],
  );

  // Measure available viewport height below the timeline container
  const timelineContainerRef = useRef<HTMLDivElement>(null);
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

  const handleOpenInstance = (instance: SlotInstance) => {
    setSelectedInstance(instance);
    setShowSessionSheet(true);
  };

  const handleSelect = (slot: TrainingSlot) => {
    const instance = slotInstancesById.get(slot.id);
    if (!instance) return;
    handleOpenInstance(instance);
  };

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

  const description =
    slots.length === 0
      ? "Planning hebdomadaire des entrainements."
      : `${slots.length} creneau${slots.length > 1 ? "x" : ""}`;


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

      {/* ── Desktop header ── */}
      <div className="hidden sm:block">
        <CoachSectionHeader
          title="Creneaux"
          description={description}
          onBack={onBack}
          actions={
            <div className="flex items-center gap-2">
              {onOpenLibrary && (
                <Button variant="ghost" size="sm" onClick={() => onOpenLibrary()}>
                  <BookOpen className="mr-1.5 h-3.5 w-3.5" />
                  Bibliothèque
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={handleCreate}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Nouveau
              </Button>
            </div>
          }
        />
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

      {/* ── Desktop week navigation + filters ── */}
      <div className="hidden sm:block space-y-3">
        {/* Week nav bar */}
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="icon" className="h-10 w-10" onClick={prevWeek}>
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <button
            type="button"
            className="flex items-center gap-2 rounded-lg border bg-card px-3 py-1.5 text-sm font-semibold hover:bg-muted/50 transition-colors"
            onClick={goToday}
            title="Revenir a cette semaine"
          >
            <span className="text-primary">S{weekNumber}</span>
            <span className="text-muted-foreground text-xs font-normal">
              {formatDayMonth(weekMonday)} – {formatDayMonth(weekSunday)}
            </span>
          </button>

          <Button variant="ghost" size="icon" className="h-10 w-10" onClick={nextWeek}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-row items-center gap-3">
          <Select value={filterValue} onValueChange={setFilterValue}>
            <SelectTrigger className="w-56">
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
        </div>
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
            />
          </div>

          {/* ── Desktop timeline (viewport-fitted) ── */}
          <div
            ref={timelineContainerRef}
            className="hidden sm:block overflow-x-auto -mx-4 px-4"
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
                      const slotTop = ((timeToMinutes(slot.start_time) - timelineRange.start * 60) / 60) * dynamicPxPerHour;
                      const slotHeight = ((timeToMinutes(slot.end_time) - timeToMinutes(slot.start_time)) / 60) * dynamicPxPerHour;
                      return (
                        <TimelineSlotInline
                          key={slot.id}
                          slot={slot}
                          instance={slotInstancesById.get(slot.id)}
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
        </>
      )}

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
      />

      <SlotTemplatePicker
        open={templatePickerOpen}
        onOpenChange={(open) => {
          setTemplatePickerOpen(open);
          if (!open) {
            setTemplateTargetInstance(null);
            setTemplateSelectedGroups([]);
            setTemplateVisibleFrom("");
          }
        }}
        onSelect={(catalogId, _sessionName) => handleTemplateSelect(catalogId)}
        isAssigning={assignTemplateMutation.isPending}
      />
    </div>
  );
};

export default CoachTrainingSlotsScreen;
