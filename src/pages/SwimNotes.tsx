import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { EQUIPMENT_OPTIONS } from "@/lib/api/types";
import { FFN_EVENTS, eventLabel } from "@/lib/objectiveHelpers";
import { PageHeader } from "@/components/shared/PageHeader";
import { SwimExerciseLogsHistory } from "@/components/dashboard/SwimExerciseLogsHistory";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileText, Plus } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { SwimTimeInput } from "@/components/swim/SwimTimeInput";
import { formatSwimTime, parseSwimTime } from "@/lib/swimConsultationUtils";

export default function SwimNotes() {
  const user = useAuth((s) => s.user);
  const [authUuid, setAuthUuid] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAuthUuid(data.session?.user?.id ?? null);
    });
  }, [user]);

  if (!authUuid) {
    return (
      <div className="mx-auto max-w-lg px-4">
        <PageHeader
          title="Notes techniques"
          icon={<FileText className="h-3.5 w-3.5" />}
          backHref="/"
        />
        <div className="mt-4 space-y-3">
          <Skeleton className="h-16 rounded-2xl" />
          <Skeleton className="h-16 rounded-2xl" />
          <Skeleton className="h-16 rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 pb-24">
      <PageHeader
        title="Notes techniques"
        icon={<FileText className="h-3.5 w-3.5" />}
        backHref="/"
        action={
          <Button
            size="sm"
            onClick={() => setShowCreate(true)}
            className="h-8 rounded-xl px-2.5 text-xs font-semibold"
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Ajouter
          </Button>
        }
      />
      <div className="mt-2">
        <SwimExerciseLogsHistory
          userId={authUuid}
          expanded
          onToggle={() => {}}
          standalone
        />
      </div>

      <CreateNoteDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        userId={authUuid}
      />
    </div>
  );
}

// ── Creation dialog ──────────────────────────────────────────

function CreateNoteDialog({
  open,
  onOpenChange,
  userId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId: string;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [eventCode, setEventCode] = useState("");
  const [poolLength, setPoolLength] = useState<number | null>(null);
  const [equipment, setEquipment] = useState<string[]>(["aucun"]);
  const [label, setLabel] = useState("");
  const [tempo, setTempo] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [splitTexts, setSplitTexts] = useState<string[]>([""]);

  const reset = () => {
    setEventCode("");
    setPoolLength(null);
    setEquipment(["aucun"]);
    setLabel("");
    setTempo(null);
    setNotes("");
    setSplitTexts([""]);
  };

  const createMutation = useMutation({
    mutationFn: () => {
      const splits = splitTexts
        .map((t, i) => ({ rep: i + 1, time_seconds: parseSwimTime(t) }))
        .filter((s) => s.time_seconds > 0);
      return api.createStandaloneSwimLog(userId, {
        exercise_label: label.trim() || (eventCode ? eventLabel(eventCode) : "Note"),
        event_code: eventCode || null,
        pool_length: poolLength,
        equipment,
        tempo,
        split_times: splits,
        stroke_count: [],
        notes: notes.trim() || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["swim-exercise-logs-history", userId] });
      toast({ title: "Note enregistrée" });
      reset();
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: "Erreur", description: "Impossible d'enregistrer.", variant: "destructive" });
    },
  });

  const toggleEquipment = (value: string) => {
    if (value === "aucun") {
      setEquipment(["aucun"]);
      return;
    }
    setEquipment((prev) => {
      const without = prev.filter((e) => e !== "aucun");
      if (without.includes(value)) {
        const next = without.filter((e) => e !== value);
        return next.length === 0 ? ["aucun"] : next;
      }
      return [...without, value];
    });
  };

  const addSplit = () => setSplitTexts((prev) => [...prev, ""]);
  const removeSplit = (i: number) => setSplitTexts((prev) => prev.filter((_, j) => j !== i));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-2xl max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nouvelle note technique</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Event select */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">Épreuve</label>
            <select
              value={eventCode}
              onChange={(e) => setEventCode(e.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-foreground/10"
            >
              <option value="">— Aucune —</option>
              {FFN_EVENTS.map((ev) => (
                <option key={ev} value={ev}>{eventLabel(ev)}</option>
              ))}
            </select>
          </div>

          {/* Pool toggle */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">Bassin</label>
            <div className="mt-1 flex gap-2">
              {[25, 50].map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => setPoolLength(poolLength === size ? null : size)}
                  className={`flex-1 rounded-xl border px-3 py-2 text-sm font-medium transition ${
                    poolLength === size
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {size}m
                </button>
              ))}
            </div>
          </div>

          {/* Equipment chips */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">Équipement</label>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {EQUIPMENT_OPTIONS.map((opt) => {
                const selected = equipment.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleEquipment(opt.value)}
                    className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                      selected
                        ? "border-primary/30 bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Label */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">Exercice (optionnel)</label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={eventCode ? eventLabel(eventCode) : "Ex: 6x50m NL"}
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-foreground/10"
            />
          </div>

          {/* Splits */}
          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">Temps (par rep)</label>
              <button type="button" onClick={addSplit} className="text-xs text-primary hover:text-primary/80">
                <Plus className="inline h-3 w-3 mr-0.5" />Rep
              </button>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {splitTexts.map((text, i) => (
                <div key={i} className="flex items-center gap-1">
                  <span className="text-[10px] text-muted-foreground w-4 text-right">{i + 1}</span>
                  <SwimTimeInput
                    value={text}
                    onChange={(v) => setSplitTexts((prev) => prev.map((t, j) => (j === i ? v : t)))}
                    onBlur={() => {
                      const parsed = parseSwimTime(splitTexts[i]);
                      setSplitTexts((prev) => prev.map((t, j) => (j === i ? formatSwimTime(parsed) : t)));
                    }}
                    size="compact"
                  />
                  {splitTexts.length > 1 && (
                    <button type="button" onClick={() => removeSplit(i)} className="p-0.5 text-muted-foreground hover:text-destructive">
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Tempo */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">Tempo (coups/min)</label>
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              min={0}
              value={tempo ?? ""}
              onChange={(e) => setTempo(e.target.value ? Number(e.target.value) : null)}
              placeholder="—"
              className="mt-1 w-24 rounded-xl border border-border bg-background px-3 py-2 text-sm text-center outline-none focus:ring-2 focus:ring-foreground/10"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observations, sensations..."
              rows={2}
              className="mt-1 w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-foreground/10"
            />
          </div>

          {/* Submit */}
          <Button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
            className="w-full rounded-xl"
          >
            {createMutation.isPending ? "Enregistrement..." : "Enregistrer"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
