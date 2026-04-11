import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { TrainingCycle, TrainingCycleInput, TrainingWeek, TrainingWeekInput, Competition } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
import { Plus, Trash2, CalendarRange, Check, X, Pencil, Copy } from "lucide-react";
import { weekTypeColor, weekTypeTextColor } from "@/lib/weekTypeColor";
import { toISODate } from "@/lib/date";

const TODAY_SENTINEL = "__today__";

// ── Types ───────────────────────────────────────────────────────

interface Props {
  athleteId: number;
}

// ── Helpers ─────────────────────────────────────────────────────

/** Returns all Monday ISO dates between two dates (inclusive of range). */
function getMondays(startDate: string, endDate: string): string[] {
  const mondays: string[] = [];
  const start = new Date(startDate + "T00:00:00");
  const end = new Date(endDate + "T00:00:00");

  // Move to the first Monday on or after start
  const current = new Date(start);
  const day = current.getDay();
  const diffToMonday = day === 0 ? 1 : day === 1 ? 0 : 8 - day;
  current.setDate(current.getDate() + diffToMonday);

  while (current <= end) {
    mondays.push(current.toISOString().split("T")[0]);
    current.setDate(current.getDate() + 7);
  }
  return mondays;
}

/** Format a date as DD/MM/YYYY. */
function fmtDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Format a date as DD/MM. */
function fmtShort(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}

/** Get the Sunday date for a given Monday. */
function getSunday(mondayIso: string): string {
  const d = new Date(mondayIso + "T00:00:00");
  d.setDate(d.getDate() + 6);
  return d.toISOString().split("T")[0];
}

/** Check if today falls in a given week (Monday to Sunday). */
function isCurrentWeek(mondayIso: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monday = new Date(mondayIso + "T00:00:00");
  const sunday = new Date(mondayIso + "T00:00:00");
  sunday.setDate(sunday.getDate() + 6);
  return today >= monday && today <= sunday;
}

// ── SwimmerPlanningTab ──────────────────────────────────────────

const SwimmerPlanningTab = ({ athleteId }: Props) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // ── State ──
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null);
  const [editingWeekId, setEditingWeekId] = useState<string | null>(null);
  const [editWeekType, setEditWeekType] = useState("");
  const [editWeekNotes, setEditWeekNotes] = useState("");
  const [showCreateSheet, setShowCreateSheet] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showCustomizeConfirm, setShowCustomizeConfirm] = useState(false);
  const [newCycleName, setNewCycleName] = useState("");
  const [newCycleStartId, setNewCycleStartId] = useState("");
  const [newCycleEndId, setNewCycleEndId] = useState("");

  // ── Data fetching ──

  // Athletes (to find this athlete's group_id)
  const { data: athletes = [] } = useQuery({
    queryKey: ["athletes"],
    queryFn: () => api.getAthletes(),
  });

  const athleteGroupId = useMemo(() => {
    const athlete = athletes.find((a) => a.id === athleteId);
    return athlete?.group_id ?? null;
  }, [athletes, athleteId]);

  // Individual cycles
  const { data: individualCycles = [], isLoading: indLoading } = useQuery({
    queryKey: ["training-cycles", "athlete", athleteId],
    queryFn: () => api.getTrainingCycles({ athleteId }),
  });

  // Group cycles
  const { data: groupCycles = [], isLoading: grpLoading } = useQuery({
    queryKey: ["training-cycles", "group", athleteGroupId],
    queryFn: () => api.getTrainingCycles({ groupId: athleteGroupId! }),
    enabled: athleteGroupId != null,
  });

  // Determine which cycles to show
  const isGroupPlan = individualCycles.length === 0 && groupCycles.length > 0;
  const cycles = individualCycles.length > 0 ? individualCycles : groupCycles;

  // Auto-select first cycle
  useEffect(() => {
    if (cycles.length > 0 && (!selectedCycleId || !cycles.find((c) => c.id === selectedCycleId))) {
      setSelectedCycleId(cycles[0].id);
    }
  }, [cycles, selectedCycleId]);

  const selectedCycle = cycles.find((c) => c.id === selectedCycleId) ?? null;

  // Weeks for selected cycle
  const { data: weeks = [], isLoading: weeksLoading } = useQuery({
    queryKey: ["training-weeks", selectedCycleId],
    queryFn: () => api.getTrainingWeeks(selectedCycleId!),
    enabled: !!selectedCycleId,
  });

  // Competitions
  const { data: competitions = [] } = useQuery({
    queryKey: ["competitions"],
    queryFn: () => api.getCompetitions(),
  });

  const sortedCompetitions = useMemo(() =>
    [...competitions].sort((a, b) => a.date.localeCompare(b.date)),
    [competitions],
  );

  // Collect existing week types for autocompletion
  const existingWeekTypes = useMemo(() => {
    const types = new Set<string>();
    weeks.forEach((w) => {
      if (w.week_type) types.add(w.week_type);
    });
    return Array.from(types).sort();
  }, [weeks]);

  // Generate timeline entries (Mondays between start and end competition)
  const effectiveStartDate = selectedCycle?.start_competition_date ?? selectedCycle?.start_date ?? null;

  const timelineMondays = useMemo(() => {
    if (!selectedCycle) return [];
    const startDate = effectiveStartDate;
    let endDate = selectedCycle.end_competition_date;
    // Fallback if end competition was deleted: estimate from start + number of existing weeks
    if (!endDate && startDate) {
      const weeksCount = weeks.length || 4; // default 4 weeks if no weeks exist
      const fallback = new Date(startDate + "T00:00:00");
      fallback.setDate(fallback.getDate() + weeksCount * 7);
      endDate = fallback.toISOString().split("T")[0];
    }
    if (!startDate || !endDate) return [];
    return getMondays(startDate, endDate);
  }, [selectedCycle, effectiveStartDate, weeks.length]);

  // Map weeks by week_start for quick lookup
  const weeksByStart = useMemo(() => {
    const map = new Map<string, TrainingWeek>();
    weeks.forEach((w) => map.set(w.week_start, w));
    return map;
  }, [weeks]);

  const isLoading = indLoading || grpLoading;

  // ── Mutations ──

  const createCycleMutation = useMutation({
    mutationFn: async (input: TrainingCycleInput) => {
      const cycle = await api.createTrainingCycle(input);
      // Generate Monday rows
      const effectiveStart = input.start_date ?? competitions.find((c) => c.id === input.start_competition_id)?.date;
      const endComp = competitions.find((c) => c.id === input.end_competition_id);
      if (effectiveStart && endComp) {
        const mondays = getMondays(effectiveStart, endComp.date);
        if (mondays.length > 0) {
          await api.bulkUpsertTrainingWeeks(
            mondays.map((m) => ({ cycle_id: cycle.id, week_start: m })),
          );
        }
      }
      return cycle;
    },
    onSuccess: (cycle) => {
      toast({ title: "Cycle cree" });
      setSelectedCycleId(cycle.id);
      setShowCreateSheet(false);
      setNewCycleName("");
      setNewCycleStartId("");
      setNewCycleEndId("");
      void queryClient.invalidateQueries({ queryKey: ["training-cycles"] });
      void queryClient.invalidateQueries({ queryKey: ["training-weeks", cycle.id] });
    },
    onError: (err: Error) => {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    },
  });

  const deleteCycleMutation = useMutation({
    mutationFn: (id: string) => api.deleteTrainingCycle(id),
    onSuccess: () => {
      toast({ title: "Cycle supprime" });
      setSelectedCycleId(null);
      setShowDeleteConfirm(false);
      void queryClient.invalidateQueries({ queryKey: ["training-cycles"] });
    },
    onError: (err: Error) => {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    },
  });

  const upsertWeekMutation = useMutation({
    mutationFn: (input: TrainingWeekInput) => api.upsertTrainingWeek(input),
    onSuccess: () => {
      setEditingWeekId(null);
      void queryClient.invalidateQueries({ queryKey: ["training-weeks", selectedCycleId] });
    },
    onError: (err: Error) => {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    },
  });

  const customizeMutation = useMutation({
    mutationFn: async () => {
      // Copy all group cycles to individual cycles for this athlete
      for (const groupCycle of groupCycles) {
        const newCycle = await api.createTrainingCycle({
          athlete_id: athleteId,
          group_id: null,
          start_competition_id: groupCycle.start_competition_id,
          end_competition_id: groupCycle.end_competition_id,
          name: groupCycle.name,
          notes: groupCycle.notes,
        });
        // Copy weeks
        const groupWeeks = await api.getTrainingWeeks(groupCycle.id);
        if (groupWeeks.length > 0) {
          await api.bulkUpsertTrainingWeeks(
            groupWeeks.map((w) => ({
              cycle_id: newCycle.id,
              week_start: w.week_start,
              week_type: w.week_type,
              notes: w.notes,
            })),
          );
        }
      }
    },
    onSuccess: () => {
      toast({ title: "Planification personnalisee" });
      setShowCustomizeConfirm(false);
      setSelectedCycleId(null);
      void queryClient.invalidateQueries({ queryKey: ["training-cycles"] });
    },
    onError: (err: Error) => {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    },
  });

  // ── Handlers ──

  const handleCreateCycle = () => {
    if (!newCycleName.trim()) {
      toast({ title: "Nom requis", variant: "destructive" });
      return;
    }
    if (!newCycleStartId || !newCycleEndId) {
      toast({ title: "Dates requises", description: "Choisis un debut et une fin.", variant: "destructive" });
      return;
    }
    const isToday = newCycleStartId === TODAY_SENTINEL;
    const startDate = isToday ? toISODate(new Date()) : null;
    const startComp = isToday ? null : competitions.find((c) => c.id === newCycleStartId);
    const endComp = competitions.find((c) => c.id === newCycleEndId);
    const effectiveStartDate = isToday ? startDate! : startComp?.date;
    if (effectiveStartDate && endComp && endComp.date <= effectiveStartDate) {
      toast({ title: "Dates invalides", description: "La fin doit etre apres le debut.", variant: "destructive" });
      return;
    }
    createCycleMutation.mutate({
      athlete_id: athleteId,
      group_id: null,
      start_competition_id: isToday ? null : newCycleStartId,
      end_competition_id: newCycleEndId,
      start_date: startDate,
      name: newCycleName.trim(),
    });
  };

  const handleStartEditWeek = (week: TrainingWeek) => {
    setEditingWeekId(week.id);
    setEditWeekType(week.week_type ?? "");
    setEditWeekNotes(week.notes ?? "");
  };

  const handleStartEditMondayWithoutWeek = (monday: string) => {
    // Create a virtual ID so we can track which Monday is being edited
    setEditingWeekId(`new:${monday}`);
    setEditWeekType("");
    setEditWeekNotes("");
  };

  const handleSaveWeek = (monday: string, existingWeek?: TrainingWeek) => {
    if (!selectedCycleId) return;
    upsertWeekMutation.mutate({
      cycle_id: selectedCycleId,
      week_start: monday,
      week_type: editWeekType.trim() || null,
      notes: editWeekNotes.trim() || null,
    });
  };

  const handleCancelEdit = () => {
    setEditingWeekId(null);
  };

  // ── Render ──

  // Empty state
  if (!isLoading && cycles.length === 0) {
    return (
      <div className="text-center py-12 space-y-3">
        <CalendarRange className="h-10 w-10 text-muted-foreground mx-auto" />
        <p className="text-sm text-muted-foreground">
          Aucun cycle pour ce nageur.
        </p>
        <Button variant="outline" size="sm" onClick={() => setShowCreateSheet(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Nouveau cycle
        </Button>

        <CycleCreateSheet
          open={showCreateSheet}
          onOpenChange={setShowCreateSheet}
          competitions={sortedCompetitions}
          name={newCycleName}
          setName={setNewCycleName}
          startId={newCycleStartId}
          setStartId={setNewCycleStartId}
          endId={newCycleEndId}
          setEndId={setNewCycleEndId}
          onSubmit={handleCreateCycle}
          isPending={createCycleMutation.isPending}
        />
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border p-3 animate-pulse motion-reduce:animate-none">
            <div className="h-4 w-48 rounded bg-muted" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Cycle selector */}
        {cycles.length > 1 ? (
          <Select value={selectedCycleId ?? ""} onValueChange={setSelectedCycleId}>
            <SelectTrigger className="w-auto min-w-[180px] h-8 text-sm">
              <SelectValue placeholder="Choisir un cycle" />
            </SelectTrigger>
            <SelectContent>
              {cycles.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : selectedCycle ? (
          <span className="text-sm font-semibold">{selectedCycle.name}</span>
        ) : null}

        {isGroupPlan && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            Planif. groupe
          </Badge>
        )}

        <div className="flex-1" />

        {isGroupPlan && (
          <Button
            variant="outline"
            size="sm"
            className="text-xs h-10"
            onClick={() => setShowCustomizeConfirm(true)}
          >
            <Copy className="mr-1 h-3 w-3" />
            Personnaliser
          </Button>
        )}

        <Button
          variant="outline"
          size="sm"
          className="text-xs h-10"
          onClick={() => setShowCreateSheet(true)}
        >
          <Plus className="mr-1 h-3 w-3" />
          Nouveau
        </Button>

        {selectedCycle && !isGroupPlan && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-10 w-10 text-destructive hover:text-destructive"
            onClick={() => setShowDeleteConfirm(true)}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        )}
      </div>

      {/* Timeline */}
      {selectedCycle && (
        <div className="space-y-0">
          {/* Start competition or today */}
          <div className="flex items-center gap-2 py-2 px-1">
            <span className="text-base" aria-hidden="true">
              {selectedCycle.start_competition_id ? "\u{1F3CA}" : "\u{1F4C5}"}
            </span>
            <span className="text-sm font-medium">
              {selectedCycle.start_competition_id
                ? (selectedCycle.start_competition_name ?? "Competition")
                : "Debut du cycle"}
            </span>
            {effectiveStartDate && (
              <span className="text-xs text-muted-foreground">
                ({fmtDate(effectiveStartDate)})
              </span>
            )}
          </div>

          {/* Vertical line connector */}
          <div className="relative ml-3 border-l-2 border-border pl-4 space-y-1">
            {weeksLoading ? (
              <div className="py-4">
                <div className="h-4 w-32 rounded bg-muted animate-pulse motion-reduce:animate-none" />
              </div>
            ) : (
              timelineMondays.map((monday, idx) => {
                const week = weeksByStart.get(monday);
                const isCurrent = isCurrentWeek(monday);
                const isEditing = editingWeekId === (week?.id ?? `new:${monday}`);

                return (
                  <WeekRow
                    key={monday}
                    monday={monday}
                    weekNumber={idx + 1}
                    week={week}
                    isCurrent={isCurrent}
                    isEditing={isEditing}
                    isGroupPlan={isGroupPlan}
                    editWeekType={editWeekType}
                    setEditWeekType={setEditWeekType}
                    editWeekNotes={editWeekNotes}
                    setEditWeekNotes={setEditWeekNotes}
                    existingWeekTypes={existingWeekTypes}
                    onStartEdit={() =>
                      week ? handleStartEditWeek(week) : handleStartEditMondayWithoutWeek(monday)
                    }
                    onSave={() => handleSaveWeek(monday, week)}
                    onCancel={handleCancelEdit}
                    isSaving={upsertWeekMutation.isPending}
                  />
                );
              })
            )}
          </div>

          {/* End competition */}
          <div className="flex items-center gap-2 py-2 px-1">
            <span className="text-base" aria-hidden="true">&#x1F3AF;</span>
            <span className="text-sm font-medium">
              {selectedCycle.end_competition_name ?? "Competition"}
            </span>
            {selectedCycle.end_competition_date && (
              <span className="text-xs text-muted-foreground">
                ({fmtDate(selectedCycle.end_competition_date)})
              </span>
            )}
          </div>
        </div>
      )}

      {/* Create Sheet */}
      <CycleCreateSheet
        open={showCreateSheet}
        onOpenChange={setShowCreateSheet}
        competitions={sortedCompetitions}
        name={newCycleName}
        setName={setNewCycleName}
        startId={newCycleStartId}
        setStartId={setNewCycleStartId}
        endId={newCycleEndId}
        setEndId={setNewCycleEndId}
        onSubmit={handleCreateCycle}
        isPending={createCycleMutation.isPending}
      />

      {/* Delete confirm */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer le cycle</AlertDialogTitle>
            <AlertDialogDescription>
              Le cycle et ses semaines seront supprimes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedCycleId && deleteCycleMutation.mutate(selectedCycleId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Customize confirm */}
      <AlertDialog open={showCustomizeConfirm} onOpenChange={setShowCustomizeConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Personnaliser la planification</AlertDialogTitle>
            <AlertDialogDescription>
              Copie le plan du groupe pour ce nageur. Tu pourras ensuite l'ajuster.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={() => customizeMutation.mutate()}>
              {customizeMutation.isPending ? "Copie..." : "Personnaliser"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

// ── Week Row ────────────────────────────────────────────────────

type WeekRowProps = {
  monday: string;
  weekNumber: number;
  week?: TrainingWeek;
  isCurrent: boolean;
  isEditing: boolean;
  isGroupPlan: boolean;
  editWeekType: string;
  setEditWeekType: (v: string) => void;
  editWeekNotes: string;
  setEditWeekNotes: (v: string) => void;
  existingWeekTypes: string[];
  onStartEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  isSaving: boolean;
};

const WeekRow = ({
  monday,
  weekNumber,
  week,
  isCurrent,
  isEditing,
  isGroupPlan,
  editWeekType,
  setEditWeekType,
  editWeekNotes,
  setEditWeekNotes,
  existingWeekTypes,
  onStartEdit,
  onSave,
  onCancel,
  isSaving,
}: WeekRowProps) => {
  const sunday = getSunday(monday);
  const datalistId = `week-types-${monday}`;

  if (isEditing) {
    return (
      <div
        className={`rounded-lg border bg-card p-3 space-y-2 ${isCurrent ? "ring-2 ring-primary" : ""}`}
      >
        <div className="text-xs font-medium text-muted-foreground">
          Sem. {weekNumber} ({fmtShort(monday)} - {fmtShort(sunday)})
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Type de semaine</Label>
          <Input
            className="h-7 text-sm"
            placeholder="Ex : Foncier, Affutage"
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
        <div className="space-y-1.5">
          <Label className="text-xs">Notes</Label>
          <Textarea
            className="text-sm min-h-[48px]"
            placeholder="Note optionnelle"
            rows={2}
            value={editWeekNotes}
            onChange={(e) => setEditWeekNotes(e.target.value)}
          />
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" className="h-10 text-xs" onClick={onCancel}>
            <X className="mr-1 h-3 w-3" />
            Annuler
          </Button>
          <Button size="sm" className="h-10 text-xs" onClick={onSave} disabled={isSaving}>
            <Check className="mr-1 h-3 w-3" />
            {isSaving ? "..." : "Enregistrer"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      className={`w-full text-left rounded-lg border bg-card px-3 py-2 flex items-center gap-2 transition-colors ${
        isGroupPlan ? "cursor-default" : "hover:bg-muted/50"
      } ${isCurrent ? "ring-2 ring-primary" : ""}`}
      onClick={isGroupPlan ? undefined : onStartEdit}
      disabled={isGroupPlan}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
            Sem. {weekNumber}
          </span>
          <span className="text-[10px] text-muted-foreground/70 whitespace-nowrap">
            ({fmtShort(monday)} - {fmtShort(sunday)})
          </span>
          {week?.week_type && (
            <Badge
              className="text-[10px] px-1.5 py-0 border-0"
              style={{
                backgroundColor: weekTypeColor(week.week_type),
                color: weekTypeTextColor(week.week_type),
              }}
            >
              {week.week_type}
            </Badge>
          )}
        </div>
        {week?.notes && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
            {week.notes}
          </p>
        )}
      </div>
      {!isGroupPlan && (
        <Pencil className="h-3 w-3 text-muted-foreground/40 shrink-0" />
      )}
    </button>
  );
};

// ── Cycle Create Sheet ──────────────────────────────────────────

type CycleCreateSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  competitions: Competition[];
  name: string;
  setName: (v: string) => void;
  startId: string;
  setStartId: (v: string) => void;
  endId: string;
  setEndId: (v: string) => void;
  onSubmit: () => void;
  isPending: boolean;
};

const CycleCreateSheet = ({
  open,
  onOpenChange,
  competitions,
  name,
  setName,
  startId,
  setStartId,
  endId,
  setEndId,
  onSubmit,
  isPending,
}: CycleCreateSheetProps) => {
  // Reset form when sheet opens
  useEffect(() => {
    if (open) {
      setName("");
      setStartId("");
      setEndId("");
    }
  }, [open]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Nouveau cycle</SheetTitle>
        </SheetHeader>
        <div className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label>Nom du cycle *</Label>
            <Input
              placeholder="Ex : Preparation hiver"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Date de debut *</Label>
            <Select value={startId} onValueChange={setStartId}>
              <SelectTrigger>
                <SelectValue placeholder="Choisir..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODAY_SENTINEL}>
                  Aujourd'hui ({fmtDate(toISODate(new Date()))})
                </SelectItem>
                {competitions.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} ({fmtDate(c.date)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Competition de fin *</Label>
            <Select value={endId} onValueChange={setEndId}>
              <SelectTrigger>
                <SelectValue placeholder="Choisir..." />
              </SelectTrigger>
              <SelectContent>
                {competitions.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} ({fmtDate(c.date)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Preview week count */}
          {startId && endId && (() => {
            const isToday = startId === TODAY_SENTINEL;
            const effectiveStart = isToday ? toISODate(new Date()) : competitions.find((c) => c.id === startId)?.date;
            const endComp = competitions.find((c) => c.id === endId);
            if (effectiveStart && endComp && endComp.date > effectiveStart) {
              const count = getMondays(effectiveStart, endComp.date).length;
              return (
                <p className="text-xs text-muted-foreground">
                  {count} semaine{count > 1 ? "s" : ""} seront generees.
                </p>
              );
            }
            return null;
          })()}

          <Button
            className="w-full"
            onClick={onSubmit}
            disabled={isPending}
          >
            {isPending ? "Creation..." : "Creer le cycle"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default SwimmerPlanningTab;
