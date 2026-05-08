import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { CompetitionRace, CompetitionRaceInput } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { eventLabel, FFN_EVENTS, STROKE_COLORS, strokeFromCode } from "@/lib/objectiveHelpers";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Trophy, Plus, Pencil, Trash2, Clock, Star } from "lucide-react";

/* ── Props ──────────────────────────────────────────────── */

interface RacesTabProps {
  competitionId: string;
  competitionDate: string;
  competitionEndDate?: string | null;
}

/* ── Constants ──────────────────────────────────────────── */

const FINAL_LETTERS = ["A", "B", "C", "D"];

/* ── Helpers ─────────────────────────────────────────────── */

/** Build an array of YYYY-MM-DD strings between start and end (inclusive). */
function dateRange(start: string, end?: string | null): string[] {
  const days: string[] = [];
  const cur = new Date(start + "T00:00:00");
  const last = end ? new Date(end + "T00:00:00") : cur;
  while (cur <= last) {
    const yyyy = cur.getFullYear();
    const mm = String(cur.getMonth() + 1).padStart(2, "0");
    const dd = String(cur.getDate()).padStart(2, "0");
    days.push(`${yyyy}-${mm}-${dd}`);
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

function formatDayLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
}

function formatTime(time: string): string {
  const [h, m] = time.split(":");
  return `${h}h${m}`;
}

function raceTypeLabel(race: CompetitionRace): string | null {
  if (race.race_type === "finale") {
    return race.final_letter ? `Finale ${race.final_letter}` : "Finale";
  }
  return null;
}

/* ── Component ──────────────────────────────────────────── */

export default function RacesTab({ competitionId, competitionDate, competitionEndDate }: RacesTabProps) {
  const { toast } = useToast();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingRace, setEditingRace] = useState<CompetitionRace | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CompetitionRace | null>(null);

  // Form state
  const [eventCode, setEventCode] = useState("");
  const [raceDay, setRaceDay] = useState(competitionDate);
  const [startTime, setStartTime] = useState("");
  const [notes, setNotes] = useState("");
  const [raceType, setRaceType] = useState<"series" | "finale">("series");
  const [finalLetter, setFinalLetter] = useState("");
  const [lane, setLane] = useState("");

  const days = dateRange(competitionDate, competitionEndDate);

  /* ── Queries ─────────────────────────────────────────── */

  const { data: races = [], isLoading } = useQuery({
    queryKey: ["competition-races", competitionId],
    queryFn: () => api.getCompetitionRaces(competitionId),
  });

  /* ── Mutations ───────────────────────────────────────── */

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["competition-races", competitionId] });

  const createMutation = useMutation({
    mutationFn: (input: CompetitionRaceInput) => api.createCompetitionRace(input),
    onSuccess: () => {
      invalidate();
      toast({ title: "Course ajoutée" });
      closeSheet();
    },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<CompetitionRaceInput> }) =>
      api.updateCompetitionRace(id, input),
    onSuccess: () => {
      invalidate();
      toast({ title: "Course modifiée" });
      closeSheet();
    },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteCompetitionRace(id),
    onSuccess: () => {
      invalidate();
      toast({ title: "Course supprimée" });
      setDeleteTarget(null);
    },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  /* ── Sheet helpers ───────────────────────────────────── */

  function resetForm() {
    setEventCode("");
    setRaceDay(competitionDate);
    setStartTime("");
    setNotes("");
    setRaceType("series");
    setFinalLetter("");
    setLane("");
  }

  function openCreate() {
    setEditingRace(null);
    resetForm();
    setSheetOpen(true);
  }

  function openEdit(race: CompetitionRace) {
    setEditingRace(race);
    setEventCode(race.event_code);
    setRaceDay(race.race_day);
    setStartTime(race.start_time ?? "");
    setNotes(race.notes ?? "");
    setRaceType((race.race_type as "series" | "finale") || "series");
    setFinalLetter(race.final_letter ?? "");
    setLane(race.lane != null ? String(race.lane) : "");
    setSheetOpen(true);
  }

  function duplicateAsFinale(race: CompetitionRace) {
    setEditingRace(null);
    setEventCode(race.event_code);
    setRaceDay(race.race_day);
    setStartTime("");
    setNotes("");
    setRaceType("finale");
    setFinalLetter("A");
    setLane("");
    setSheetOpen(true);
  }

  function closeSheet() {
    setSheetOpen(false);
    setEditingRace(null);
  }

  function handleSubmit() {
    if (!eventCode) return;
    const input: CompetitionRaceInput = {
      competition_id: competitionId,
      event_code: eventCode,
      race_day: raceDay,
      start_time: startTime || null,
      notes: notes.trim() || null,
      race_type: raceType,
      final_letter: raceType === "finale" && finalLetter ? finalLetter : null,
      lane: lane ? parseInt(lane, 10) : null,
    };
    if (editingRace) {
      updateMutation.mutate({ id: editingRace.id, input });
    } else {
      createMutation.mutate(input);
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  /* ── Render ──────────────────────────────────────────── */

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="h-20 rounded-2xl bg-muted/40 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <>
      {races.length === 0 ? (
        /* ── Empty state ──────────────────────────────── */
        <button
          type="button"
          onClick={openCreate}
          className="w-full rounded-3xl border-2 border-dashed border-amber-300/50 bg-amber-500/5 p-6 text-center transition hover:border-amber-400/70 hover:bg-amber-500/10"
        >
          <Trophy className="mx-auto h-8 w-8 text-amber-500/60" />
          <p className="mt-3 text-sm font-semibold text-foreground">Ajoute tes courses</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Configure tes épreuves pour cette compétition
          </p>
        </button>
      ) : (
        /* ── Race cards ───────────────────────────────── */
        <div className="space-y-2.5">
          {races.map((race) => {
            const isFinale = race.race_type === "finale";
            const stroke = strokeFromCode(race.event_code);
            const borderColor = stroke ? STROKE_COLORS[stroke] : "border-l-amber-500";
            const typeLabel = raceTypeLabel(race);
            return (
              <div
                key={race.id}
                className={`rounded-2xl border px-3 py-3 border-l-[3px] ${
                  isFinale
                    ? "border-l-yellow-500 border-yellow-500/40 bg-gradient-to-r from-yellow-500/[0.07] to-amber-500/[0.03]"
                    : `bg-card ${borderColor}`
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {isFinale && (
                        <Star className="h-3.5 w-3.5 shrink-0 fill-yellow-500 text-yellow-500" />
                      )}
                      <p className="text-sm font-semibold truncate">
                        {eventLabel(race.event_code)}
                      </p>
                      {typeLabel && (
                        <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                          isFinale
                            ? "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300"
                            : "bg-orange-500/10 text-orange-600 dark:text-orange-400"
                        }`}>
                          {typeLabel}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{formatDayLabel(race.race_day)}</span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {race.start_time ? formatTime(race.start_time) : "Heure à définir"}
                      </span>
                      {race.lane != null && (
                        <span>Ligne {race.lane}</span>
                      )}
                    </div>
                    {race.notes && (
                      <p className="mt-1.5 text-xs text-muted-foreground/80 line-clamp-1">
                        {race.notes}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => openEdit(race)}
                      className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition"
                      aria-label="Modifier"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(race)}
                      className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-status-error hover:bg-status-error-bg transition"
                      aria-label="Supprimer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                {!isFinale && (
                  <button
                    type="button"
                    onClick={() => duplicateAsFinale(race)}
                    className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-yellow-500/30 bg-yellow-500/[0.06] py-1.5 text-[11px] font-semibold text-yellow-700 dark:text-yellow-300 transition hover:bg-yellow-500/15 hover:border-yellow-500/50 active:scale-[0.98]"
                  >
                    <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                    Qualifié en finale
                  </button>
                )}
              </div>
            );
          })}

          {/* ── Add button ──────────────────────────────── */}
          <button
            type="button"
            onClick={openCreate}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-amber-300/50 bg-amber-500/5 px-3 py-3 text-xs font-medium text-amber-600 dark:text-amber-400 transition hover:border-amber-400/70 hover:bg-amber-500/10"
          >
            <Plus className="h-4 w-4" />
            Ajouter une course
          </button>
        </div>
      )}

      {/* ── Add / Edit Sheet ──────────────────────────────── */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editingRace ? "Modifier la course" : "Ajouter une course"}</SheetTitle>
            <SheetDescription>
              {editingRace ? "Modifie les détails de cette épreuve." : "Choisis ton épreuve et renseigne les détails."}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-5">
            {/* Event selector */}
            <div className="space-y-2">
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Épreuve
              </Label>
              <Select value={eventCode} onValueChange={setEventCode}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Choisis une épreuve" />
                </SelectTrigger>
                <SelectContent>
                  {FFN_EVENTS.map((code) => (
                    <SelectItem key={code} value={code}>
                      {eventLabel(code)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Race type toggle */}
            <div className="space-y-2">
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Type
              </Label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setRaceType("series")}
                  className={`flex-1 rounded-xl border px-3 py-2 text-sm font-medium transition ${
                    raceType === "series"
                      ? "border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                      : "border-border bg-card text-muted-foreground hover:bg-muted"
                  }`}
                >
                  Série
                </button>
                <button
                  type="button"
                  onClick={() => setRaceType("finale")}
                  className={`flex-1 rounded-xl border px-3 py-2 text-sm font-medium transition ${
                    raceType === "finale"
                      ? "border-orange-500 bg-orange-500/10 text-orange-700 dark:text-orange-300"
                      : "border-border bg-card text-muted-foreground hover:bg-muted"
                  }`}
                >
                  Finale
                </button>
              </div>
            </div>

            {/* Final letter (only for finale) */}
            {raceType === "finale" && (
              <div className="space-y-2">
                <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Lettre de finale
                </Label>
                <div className="flex gap-2">
                  {FINAL_LETTERS.map((letter) => (
                    <button
                      key={letter}
                      type="button"
                      onClick={() => setFinalLetter(letter)}
                      className={`h-10 w-10 rounded-xl border text-sm font-semibold transition ${
                        finalLetter === letter
                          ? "border-orange-500 bg-orange-500/10 text-orange-700 dark:text-orange-300"
                          : "border-border bg-card text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {letter}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Day picker */}
            <div className="space-y-2">
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Jour
              </Label>
              <select
                value={raceDay}
                onChange={(e) => setRaceDay(e.target.value)}
                className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {days.map((d) => (
                  <option key={d} value={d}>
                    {formatDayLabel(d)}
                  </option>
                ))}
              </select>
            </div>

            {/* Time input */}
            <div className="space-y-2">
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Heure de passage
              </Label>
              <Input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="rounded-xl"
                placeholder="Ex : 14:30"
              />
            </div>

            {/* Lane */}
            <div className="space-y-2">
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Ligne
              </Label>
              <Input
                type="number"
                min={1}
                max={10}
                value={lane}
                onChange={(e) => setLane(e.target.value)}
                className="rounded-xl"
                placeholder="Ex : 4"
              />
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Notes
              </Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="rounded-xl resize-none"
                rows={3}
                placeholder="Remarques..."
              />
            </div>

            {/* Submit */}
            <Button
              onClick={handleSubmit}
              disabled={!eventCode || isSaving}
              className="w-full rounded-xl bg-amber-500 hover:bg-amber-600 text-white"
            >
              {isSaving ? "Enregistrement..." : editingRace ? "Enregistrer" : "Ajouter"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Delete confirmation ──────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette course ?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (
                <>
                  <strong>{eventLabel(deleteTarget.event_code)}</strong>{" "}
                  {raceTypeLabel(deleteTarget) && `(${raceTypeLabel(deleteTarget)}) `}
                  du {formatDayLabel(deleteTarget.race_day)} sera supprimée.
                  Cette action est irréversible.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              disabled={deleteMutation.isPending}
              className="bg-status-error hover:bg-status-error/90 text-white"
            >
              {deleteMutation.isPending ? "Suppression..." : "Supprimer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
