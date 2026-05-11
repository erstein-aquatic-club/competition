import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getAthletes,
  getGroups,
  getCompetitionAssignments,
  createCompetition,
  setCompetitionAssignments,
  updateCompetition,
  deleteCompetition,
  getCompetitions,
} from "@/lib/api";
import type { Competition, CompetitionInput } from "@/lib/api";
import { getAllPendingInterviews } from "@/lib/api/interviews";
import { getTrainingCycles } from "@/lib/api/planning";
import { toast } from "sonner";
import CoachSectionHeader from "./CoachSectionHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CalendarDays, Plus, Trophy, Users, ChevronDown } from "lucide-react";
import { getTimelineEventEndDate, isTimelineEventPast } from "./competitionTimeline";

// ── Helpers ─────────────────────────────────────────────────────

function formatDateFr(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function toLocalIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function weeksBetween(a: string, b: string): number {
  return Math.max(0, Math.round(
    (new Date(b + "T00:00:00").getTime() - new Date(a + "T00:00:00").getTime()) / 604800000,
  ));
}

const PX_PER_WEEK = 7;
const MIN_GAP = 20;
const MAX_GAP = 72;

function gapPx(weeks: number): number {
  return Math.min(MAX_GAP, Math.max(MIN_GAP, weeks * PX_PER_WEEK));
}

// ── Competition Form Sheet ──────────────────────────────────────

type CompetitionFormProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  competition?: Competition | null;
};

const CompetitionFormSheet = ({
  open,
  onOpenChange,
  competition,
}: CompetitionFormProps) => {
  const queryClient = useQueryClient();
  const isEdit = !!competition;

  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [assignedAthleteIds, setAssignedAthleteIds] = useState<Set<number>>(new Set());

  const { data: athletes = [] } = useQuery({
    queryKey: ["athletes"],
    queryFn: () => getAthletes(),
  });

  const { data: groups = [] } = useQuery({
    queryKey: ["groups"],
    queryFn: () => getGroups(),
  });

  const { data: existingAssignments } = useQuery({
    queryKey: ["competition-assignments", competition?.id],
    queryFn: () => getCompetitionAssignments(competition!.id),
    enabled: !!competition?.id,
  });

  // Sync form fields when sheet opens or competition changes
  useEffect(() => {
    if (!open) return;
    if (competition) {
      setName(competition.name);
      setDate(competition.date);
      setEndDate(competition.end_date ?? competition.date ?? "");
      setLocation(competition.location ?? "");
      setDescription(competition.description ?? "");
      // Set athlete assignments
      if (existingAssignments) {
        setAssignedAthleteIds(new Set(existingAssignments.map((a) => a.athlete_id)));
      }
    } else {
      setName("");
      setDate("");
      setEndDate("");
      setLocation("");
      setDescription("");
      setAssignedAthleteIds(new Set());
    }
  }, [open, competition, existingAssignments]);

  const createMutation = useMutation({
    mutationFn: (input: CompetitionInput) => createCompetition(input),
    onSuccess: async (result) => {
      // Save competition assignments
      if (assignedAthleteIds.size > 0) {
        try {
          await setCompetitionAssignments(result.id, Array.from(assignedAthleteIds));
        } catch (e) {
          console.warn("[EAC] Failed to save competition assignments:", e);
        }
      }
      toast("Competition creee");
      void queryClient.invalidateQueries({ queryKey: ["competitions"] });
      void queryClient.invalidateQueries({ queryKey: ["competition-assignments"] });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error("Erreur", { description: err.message });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (input: Partial<CompetitionInput>) =>
      updateCompetition(competition!.id, input),
    onSuccess: async () => {
      // Save competition assignments
      try {
        await setCompetitionAssignments(competition!.id, Array.from(assignedAthleteIds));
      } catch (e) {
        console.warn("[EAC] Failed to save competition assignments:", e);
      }
      toast("Competition mise a jour");
      void queryClient.invalidateQueries({ queryKey: ["competitions"] });
      void queryClient.invalidateQueries({ queryKey: ["competition-assignments"] });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error("Erreur", { description: err.message });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteCompetition(competition!.id),
    onSuccess: () => {
      toast("Competition supprimee");
      void queryClient.invalidateQueries({ queryKey: ["competitions"] });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error("Erreur", { description: err.message });
    },
  });

  const handleSubmit = () => {
    if (!name.trim()) {
      toast.error("Nom requis", { description: "Veuillez saisir un nom pour la competition." });
      return;
    }
    if (!date) {
      toast.error("Date requise", { description: "Veuillez saisir une date." });
      return;
    }

    const input: CompetitionInput = {
      name: name.trim(),
      date,
      end_date: endDate || date || null,
      location: location.trim() || null,
      description: description.trim() || null,
    };

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

  const dateRangeInvalid = Boolean(date && endDate && endDate < date);

  const dateCls = "flex h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

  const handleStartChange = (v: string) => {
    setDate(v);
    if (!endDate || endDate < v) setEndDate(v);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-md overflow-y-auto"
        >
          <SheetHeader>
            <SheetTitle>
              {isEdit ? "Modifier" : "Nouvelle compétition"}
            </SheetTitle>
          </SheetHeader>

          <div className="mt-5 space-y-5">
            {/* ── Name ── */}
            <div className="space-y-1.5">
              <Label htmlFor="comp-name" className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Nom
              </Label>
              <Input
                id="comp-name"
                placeholder="Ex : Championnats Régionaux"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="text-[15px] font-medium"
                maxLength={200}
              />
            </div>

            {/* ── Dates (side by side) ── */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Dates
              </span>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label htmlFor="comp-date" className="text-[10px] text-muted-foreground/60 pl-0.5">Début</label>
                  <input
                    id="comp-date"
                    type="date"
                    value={date}
                    onChange={(e) => handleStartChange(e.target.value)}
                    className={dateCls}
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="comp-end-date" className="text-[10px] text-muted-foreground/60 pl-0.5">Fin</label>
                  <input
                    id="comp-end-date"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    min={date || undefined}
                    className={dateCls}
                  />
                </div>
              </div>
            </div>

            {/* ── Location ── */}
            <div className="space-y-1.5">
              <Label htmlFor="comp-location" className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Lieu
              </Label>
              <Input
                id="comp-location"
                placeholder="Ex : Piscine de Strasbourg"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>

            {/* ── Notes ── */}
            <div className="space-y-1.5">
              <Label htmlFor="comp-description" className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Notes
              </Label>
              <Textarea
                id="comp-description"
                placeholder="Informations complémentaires..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                maxLength={2000}
                className="resize-none"
              />
            </div>

            {/* ── Divider ── */}
            <div className="border-t border-border/40" />

            {/* ── Athletes ── */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Nageurs
                </span>
                <span className="text-[10px] tabular-nums text-muted-foreground/50">
                  {assignedAthleteIds.size} sélectionné{assignedAthleteIds.size > 1 ? "s" : ""}
                </span>
              </div>

              <Select
                value=""
                onValueChange={(groupId) => {
                  const groupMembers = athletes.filter((a) => a.group_id === Number(groupId));
                  setAssignedAthleteIds((prev) => {
                    const next = new Set(prev);
                    groupMembers.forEach((m) => { if (m.id != null) next.add(m.id); });
                    return next;
                  });
                }}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Ajouter un groupe..." />
                </SelectTrigger>
                <SelectContent>
                  {groups.filter((g) => !g.is_temporary).map((g) => (
                    <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="max-h-44 overflow-y-auto rounded-lg border p-1.5 space-y-0.5">
                {athletes.map((athlete) => {
                  if (athlete.id == null) return null;
                  const checked = assignedAthleteIds.has(athlete.id);
                  return (
                    <label
                      key={athlete.id}
                      className={cn(
                        "flex items-center gap-2 py-1 px-1.5 rounded-md cursor-pointer transition-colors",
                        checked ? "bg-primary/5" : "hover:bg-muted/50",
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(c) => {
                          setAssignedAthleteIds((prev) => {
                            const next = new Set(prev);
                            if (c) next.add(athlete.id!);
                            else next.delete(athlete.id!);
                            return next;
                          });
                        }}
                      />
                      <span className="text-[13px]">{athlete.display_name}</span>
                      {athlete.group_label && (
                        <span className="text-[10px] text-muted-foreground/50 ml-auto">{athlete.group_label}</span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>

            {/* ── Actions ── */}
            <div className="space-y-3 pt-1">
              <Button
                className="w-full"
                onClick={handleSubmit}
                disabled={isPending || !name.trim() || !date || !endDate || dateRangeInvalid}
              >
                {isPending
                  ? "Enregistrement..."
                  : isEdit
                    ? "Enregistrer"
                    : "Créer la compétition"}
              </Button>

              {isEdit && (
                <button
                  type="button"
                  className="w-full text-center text-[11px] text-destructive/50 hover:text-destructive py-1.5 transition-colors"
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={isPending}
                >
                  Supprimer cette compétition
                </button>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer la compétition</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. La compétition &laquo;{" "}
              {competition?.name} &raquo; sera supprimée définitivement.
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

// ── Unified Deadline Events ─────────────────────────────────────

type DeadlineEventType = "competition" | "interview" | "cycle_end";

type DeadlineEvent = {
  id: string;
  type: DeadlineEventType;
  date: string;
  end_date?: string;
  name: string;
  subtitle?: string;
  competition?: Competition;
};

const DOT_ACTIVE: Record<DeadlineEventType, string> = {
  competition: "bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.4)]",
  interview: "bg-blue-500 shadow-[0_0_6px_rgba(59,130,246,0.4)]",
  cycle_end: "bg-violet-500 shadow-[0_0_6px_rgba(139,92,246,0.4)]",
};

const BADGE_COLORS: Record<DeadlineEventType, string> = {
  competition: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  interview: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  cycle_end: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
};

const INTERVIEW_STATUS_LABELS: Record<string, string> = {
  draft_athlete: "En attente nageur",
  draft_coach: "En attente coach",
  sent: "Envoyé, à signer",
};

// ── Events Timeline ─────────────────────────────────────────────

type TimelineNode =
  | { kind: "event"; event: DeadlineEvent; isPast: boolean; days: number; isNewMonth: boolean; monthLabel: string }
  | { kind: "gap"; weeks: number; height: number }
  | { kind: "today" };

const EventsTimeline = ({
  events,
  onEditCompetition,
}: {
  events: DeadlineEvent[];
  onEditCompetition: (c: Competition) => void;
}) => {
  const [pastOpen, setPastOpen] = useState(false);

  const { items, todayIdx } = useMemo(() => {
    const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = toLocalIso(today);

    const result: TimelineNode[] = [];
    let prevEnd = "";
    let prevMonth = "";
    let todayInserted = false;

    for (const ev of sorted) {
      const isPast = isTimelineEventPast(ev, todayStr);
      const days = daysUntil(ev.date);
      const evMonth = ev.date.slice(0, 7);
      const isNewMonth = evMonth !== prevMonth;
      const monthLabel = new Date(ev.date + "T00:00:00")
        .toLocaleDateString("fr-FR", { month: "short" })
        .replace(".", "")
        .toUpperCase();

      if (!todayInserted && !isPast) {
        if (prevEnd) {
          const w = weeksBetween(prevEnd, todayStr);
          if (w >= 1) result.push({ kind: "gap", weeks: w, height: gapPx(w) });
        }
        result.push({ kind: "today" });
        todayInserted = true;
        const w = weeksBetween(todayStr, ev.date);
        if (w >= 1) result.push({ kind: "gap", weeks: w, height: gapPx(w) });
      } else if (prevEnd) {
        const w = weeksBetween(prevEnd, ev.date);
        if (w >= 1) result.push({ kind: "gap", weeks: w, height: gapPx(w) });
      }

      result.push({ kind: "event", event: ev, isPast, days, isNewMonth, monthLabel });
      prevEnd = getTimelineEventEndDate(ev);
      prevMonth = evMonth;
    }

    if (!todayInserted) {
      if (prevEnd) {
        const w = weeksBetween(prevEnd, todayStr);
        if (w >= 1) result.push({ kind: "gap", weeks: w, height: gapPx(w) });
      }
      result.push({ kind: "today" });
    }

    return { items: result, todayIdx: result.findIndex((n) => n.kind === "today") };
  }, [events]);

  if (events.length === 0) return null;

  const pastItems = todayIdx > 0 ? items.slice(0, todayIdx) : [];
  const upcomingItems = todayIdx >= 0 ? items.slice(todayIdx) : items;
  const pastCount = pastItems.filter((n) => n.kind === "event").length;

  // ── Shared node renderer ──
  const renderNode = (item: TimelineNode, i: number) => {
    if (item.kind === "gap") {
      return (
        <div key={`g${i}`} className="relative" style={{ height: item.height }}>
          {item.weeks >= 2 && (
            <span className="absolute left-[-0.8rem] -translate-x-1/2 top-1/2 -translate-y-1/2 text-[9px] tabular-nums font-medium text-muted-foreground/30 bg-background px-1 select-none">
              {item.weeks}s
            </span>
          )}
        </div>
      );
    }

    if (item.kind === "today") {
      return (
        <div key="today" className="relative flex items-center h-7 -ml-14">
          <div className="absolute left-0 right-0 h-[2px] bg-emerald-500/60" />
          <span className="relative text-[10px] font-bold tracking-widest text-emerald-600 dark:text-emerald-400 bg-background pl-2 pr-1.5 select-none">
            AUJOURD&apos;HUI
          </span>
        </div>
      );
    }

    const { event: ev, isPast, days, isNewMonth, monthLabel } = item;
    const isCompetition = ev.type === "competition" && ev.competition;

    const dateLabel = (() => {
      const ds = new Date(ev.date + "T00:00:00");
      if (!ev.end_date || ev.end_date === ev.date) {
        return ds.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }).replace(".", "");
      }
      const de = new Date(ev.end_date + "T00:00:00");
      const endFmt = de.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }).replace(".", "");
      return ds.getMonth() === de.getMonth()
        ? `${ds.getDate()}–${endFmt}`
        : `${ds.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }).replace(".", "")} → ${endFmt}`;
    })();

    const content = (
      <>
        {isNewMonth && (
          <span className="absolute left-[-3.25rem] top-[3px] w-[2rem] text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 text-right select-none">
            {monthLabel}
          </span>
        )}

        <div
          className={cn(
            "absolute left-[-0.8rem] top-[5px] h-[10px] w-[10px] rounded-full -translate-x-1/2 z-10 border-2 border-background transition-transform group-hover:scale-150",
            isPast ? "bg-muted-foreground/30" : DOT_ACTIVE[ev.type],
          )}
        />

        <div className="min-w-0 flex-1 pl-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={cn(
              "text-[13px] font-semibold truncate flex-1 min-w-0",
              isPast ? "text-muted-foreground" : "text-foreground",
            )}>
              {ev.name}
            </span>
            {!isPast && days >= 0 && (
              <span className={cn(
                "text-[10px] font-bold tabular-nums shrink-0 px-1.5 py-0.5 rounded-full",
                BADGE_COLORS[ev.type],
              )}>
                J-{days}
              </span>
            )}
          </div>
          <p className={cn(
            "text-[11px] truncate",
            isPast ? "text-muted-foreground/60" : "text-muted-foreground",
          )}>
            {dateLabel}
            {ev.subtitle && ` · ${ev.subtitle}`}
          </p>
        </div>
      </>
    );

    if (isCompetition) {
      return (
        <button
          key={ev.id}
          type="button"
          className={cn(
            "relative w-full flex items-start text-left py-1.5 group transition-opacity",
            isPast ? "opacity-40 hover:opacity-70" : "hover:opacity-80",
          )}
          onClick={() => onEditCompetition(ev.competition!)}
        >
          {content}
        </button>
      );
    }

    return (
      <div
        key={ev.id}
        className={cn(
          "relative w-full flex items-start text-left py-1.5 group",
          isPast && "opacity-40",
        )}
      >
        {content}
      </div>
    );
  };

  return (
    <div className="relative pl-14">
      {/* Vertical rail */}
      <div className="absolute left-[2.625rem] top-1 bottom-1 w-[2px] rounded-full bg-gradient-to-b from-border/10 via-border/40 to-border/10" />

      {/* Collapsed past toggle */}
      {pastCount > 0 && (
        <button
          type="button"
          className="relative flex items-center gap-1.5 py-2 text-[11px] font-medium text-muted-foreground/50 hover:text-muted-foreground transition-colors select-none"
          onClick={() => setPastOpen((o) => !o)}
        >
          <ChevronDown className={cn("h-3 w-3 shrink-0 transition-transform", pastOpen && "rotate-180")} />
          <span>Passées ({pastCount})</span>
        </button>
      )}

      {/* Past items (collapsible) */}
      {pastOpen && pastItems.map((item, i) => renderNode(item, i))}

      {/* Today + upcoming items */}
      {upcomingItems.map((item, i) => renderNode(item, pastItems.length + i))}
    </div>
  );
};

// ── Main Component ──────────────────────────────────────────────

type CoachCompetitionsScreenProps = {
  onBack?: () => void;
};

const CoachCompetitionsScreen = ({ onBack }: CoachCompetitionsScreenProps) => {
  const [showForm, setShowForm] = useState(false);
  const [editingComp, setEditingComp] = useState<Competition | null>(null);

  const { data: competitions = [], isLoading: compLoading } = useQuery({
    queryKey: ["competitions"],
    queryFn: () => getCompetitions(),
  });

  const { data: interviews = [], isLoading: intvLoading } = useQuery({
    queryKey: ["coach-events-interviews"],
    queryFn: getAllPendingInterviews,
  });

  const { data: cycles = [], isLoading: cyclesLoading } = useQuery({
    queryKey: ["coach-events-cycles"],
    queryFn: () => getTrainingCycles(),
  });

  const isLoading = compLoading || intvLoading || cyclesLoading;

  const allEvents = useMemo<DeadlineEvent[]>(() => {
    const comps: DeadlineEvent[] = competitions.map((c) => ({
      id: `comp-${c.id}`,
      type: "competition" as const,
      date: c.date,
      end_date: c.end_date ?? undefined,
      name: c.name,
      subtitle: c.location && c.location !== "??" ? c.location : undefined,
      competition: c,
    }));

    const intvs: DeadlineEvent[] = interviews.map((i) => ({
      id: `intv-${i.id}`,
      type: "interview" as const,
      date: i.date,
      name: `Entretien : ${i.athlete_name}`,
      subtitle: INTERVIEW_STATUS_LABELS[i.status] ?? i.status,
    }));

    const cycleEnds: DeadlineEvent[] = cycles
      .filter((c) => c.end_competition_date != null)
      .map((c) => ({
        id: `cycle-${c.id}`,
        type: "cycle_end" as const,
        date: c.end_competition_date!,
        name: `Fin cycle : ${c.name}`,
        subtitle: c.end_competition_name ?? undefined,
      }));

    return [...comps, ...intvs, ...cycleEnds];
  }, [competitions, interviews, cycles]);

  const handleCreate = () => {
    setEditingComp(null);
    setShowForm(true);
  };

  const handleEdit = (comp: Competition) => {
    setEditingComp(comp);
    setShowForm(true);
  };

  return (
    <div className="space-y-6 pb-24">
      <CoachSectionHeader
        title="Échéances"
        description="Compétitions, entretiens et fins de cycles"
        onBack={onBack}
        actions={
          <Button variant="outline" size="sm" onClick={handleCreate}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Compétition
          </Button>
        }
      />

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-xl border p-3 animate-pulse motion-reduce:animate-none"
            >
              <div className="flex items-center gap-3">
                <div className="h-4 w-40 rounded bg-muted" />
                <div className="ml-auto h-5 w-12 rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      ) : allEvents.length === 0 ? (
        <div className="text-center py-12 space-y-3">
          <CalendarDays className="h-10 w-10 text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">
            Aucune échéance à venir
          </p>
          <Button variant="outline" size="sm" onClick={handleCreate}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Créer une compétition
          </Button>
        </div>
      ) : (
        <EventsTimeline
          events={allEvents}
          onEditCompetition={handleEdit}
        />
      )}

      <CompetitionFormSheet
        open={showForm}
        onOpenChange={setShowForm}
        competition={editingComp}
      />
    </div>
  );
};

export default CoachCompetitionsScreen;
