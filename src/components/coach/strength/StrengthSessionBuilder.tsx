import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ChevronDown, Filter, Plus } from "lucide-react";
import { SessionMetadataForm } from "../shared/SessionMetadataForm";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { getContrastPair, validContrastPair, validateContrastPlan, type TrainingIntent } from "@/lib/strength/contrast";
import { FormActions } from "../shared/FormActions";
import { StrengthExerciseCard } from "./StrengthExerciseCard";
import { cn } from "@/lib/utils";
import type { Exercise, StrengthCycleType, StrengthSessionItem, StrengthFolder } from "@/lib/api";

interface StrengthSessionBuilderProps {
  session: {
    title: string;
    description: string;
    cycle: StrengthCycleType;
    items: StrengthSessionItem[];
    folder_id?: number | null;
  };
  exercises: Exercise[];
  editingSessionId: number | null;
  folders?: StrengthFolder[];
  onSessionChange: (session: {
    title: string;
    description: string;
    cycle: StrengthCycleType;
    items: StrengthSessionItem[];
    folder_id?: number | null;
  }) => void;
  onCycleChange: (cycle: StrengthCycleType) => void;
  onSave: () => void;
  onCancel: () => void;
  onAddItem: () => void;
  onUpdateItem: (index: number, field: string, value: string | number | null) => void;
  onRemoveItem: (index: number) => void;
  onReorderItems: (fromIndex: number, toIndex: number) => void;
  onExerciseDialogOpen: () => void;
  isSaving?: boolean;
  onSaveAndAssign?: () => void;
}

const normalizeStrengthCycle = (value?: string | null): StrengthCycleType => {
  if (value === "endurance" || value === "hypertrophie" || value === "force") {
    return value;
  }
  return "endurance";
};

export function StrengthSessionBuilder({
  session,
  exercises,
  editingSessionId,
  folders,
  onSessionChange,
  onCycleChange,
  onSave,
  onCancel,
  onAddItem,
  onUpdateItem,
  onRemoveItem,
  onReorderItems,
  onExerciseDialogOpen,
  isSaving,
  onSaveAndAssign,
}: StrengthSessionBuilderProps) {
  const [exerciseFilter, setExerciseFilter] = useState<"all" | "strength" | "warmup">("all");
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [metadataCollapsed, setMetadataCollapsed] = useState(false);

  const exerciseById = new Map(exercises.map((ex) => [ex.id, ex]));
  const totalSets = session.items.reduce((sum, item) => sum + (item.sets || 0), 0);

  const editItems = (items: StrengthSessionItem[]) => onSessionChange({ ...session, items });

  const handleMoveUp = (index: number) => {
    if (session.items.some(getContrastPair)) {
      toast("Dissocie d'abord le contraste pour réordonner les exercices.");
      return;
    }
    if (index > 0) onReorderItems(index, index - 1);
  };

  const handleMoveDown = (index: number) => {
    if (session.items.some(getContrastPair)) {
      toast("Dissocie d'abord le contraste pour réordonner les exercices.");
      return;
    }
    if (index < session.items.length - 1) onReorderItems(index, index + 1);
  };

  const changeIntent = (index: number, intent: TrainingIntent | null) => {
    editItems(session.items.map((item, i) => i !== index ? item : ({
      ...item, raw_payload: { ...item.raw_payload, training_intent: intent ?? undefined },
    })));
  };

  const toggleContrast = (index: number) => {
    const a = session.items[index], b = session.items[index + 1];
    if (!a || !b) return;
    const existing = getContrastPair(a);
    if (existing?.role === "force" && getContrastPair(b)?.id === existing.id) {
      editItems(session.items.map((item, i) => i === index || i === index + 1
        ? { ...item, raw_payload: { ...item.raw_payload, contrast_pair_v1: undefined },
            rest_seconds: i === index ? existing.rest_seconds : item.rest_seconds }
        : item));
      return;
    }
    if (getContrastPair(a) || getContrastPair(b) || a.block === "warmup" || b.block === "warmup" ||
        a.exercise_id === b.exercise_id || a.sets !== b.sets || a.sets < 2 || a.sets > 8) {
      toast.error("Contraste impossible", { description: "Choisis deux exercices consécutifs distincts, avec 2 à 8 séries identiques." });
      return;
    }
    const rest = 180;
    const id = `contrast-${a.exercise_id}-${b.exercise_id}-${index}-${Date.now()}`;
    editItems(session.items.map((item, i) => {
      if (i !== index && i !== index + 1) return item;
      const role = i === index ? "force" : "power";
      return {
        ...item, rest_seconds: role === "force" ? 0 : rest,
        raw_payload: { ...item.raw_payload, training_intent: role === "force" ? "force" : "puissance",
          contrast_pair_v1: { id, role, rest_seconds: rest } },
      };
    }));
  };

  const changeContrastRest = (index: number, seconds: number) => {
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > 900) return;
    const pair = getContrastPair(session.items[index]);
    if (!pair || pair.role !== "force") return;
    editItems(session.items.map((item, i) => {
      if ((i !== index && i !== index + 1) || getContrastPair(item)?.id !== pair.id) return item;
      return { ...item, rest_seconds: i === index ? 0 : seconds,
        raw_payload: { ...item.raw_payload, contrast_pair_v1: { ...getContrastPair(item)!, rest_seconds: seconds } } };
    }));
  };

  const saveValidated = (callback: () => void) => {
    const issue = validateContrastPlan(session.items)[0];
    if (issue) {
      toast.error("Contraste à corriger", { description: issue });
      return;
    }
    callback();
  };

  const handlePreview = () => {
    setDetailDialogOpen(true);
  };

  return (
    <div className="space-y-4 animate-in slide-in-from-bottom-4">
      <FormActions
        isEditing={Boolean(editingSessionId)}
        isSaving={isSaving}
        onSave={() => saveValidated(onSave)}
        onCancel={onCancel}
        onPreview={handlePreview}
        onSaveAndAssign={onSaveAndAssign ? () => saveValidated(onSaveAndAssign) : undefined}
      />

      <div className="p-4 space-y-4">
        {/* Collapsible metadata */}
        <SessionMetadataForm
          name={session.title}
          onNameChange={(value) => onSessionChange({ ...session, title: value })}
          showDuration={false}
          showTotalDistance={false}
          collapsible
          collapsed={metadataCollapsed}
          onToggleCollapse={() => setMetadataCollapsed(!metadataCollapsed)}
          collapsedSummary={
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{session.title || "Sans titre"}</span>
              <span>·</span>
              <span className="capitalize">{session.cycle}</span>
              <span>·</span>
              <span>{totalSets} séries</span>
            </div>
          }
          additionalFields={
            <>
              {folders && folders.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-muted-foreground">Dossier</div>
                  <div className="mt-1">
                    <Select
                      value={session.folder_id?.toString() ?? "none"}
                      onValueChange={(v) => onSessionChange({ ...session, folder_id: v === "none" ? null : parseInt(v) })}
                    >
                      <SelectTrigger className="rounded-2xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Aucun</SelectItem>
                        {folders.map((f) => (
                          <SelectItem key={f.id} value={f.id.toString()}>{f.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
              <div>
                <div className="text-xs font-semibold text-muted-foreground">Cycle</div>
                <div className="mt-1">
                  <Select
                    value={session.cycle}
                    onValueChange={(value) => onCycleChange(normalizeStrengthCycle(value))}
                  >
                    <SelectTrigger className="rounded-2xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="endurance">Endurance</SelectItem>
                      <SelectItem value="hypertrophie">Hypertrophie</SelectItem>
                      <SelectItem value="force">Force</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold text-muted-foreground">Séries totales</div>
                <div className="mt-1 rounded-2xl border border-border bg-muted px-3 py-2 text-sm font-semibold">
                  {totalSets}
                </div>
              </div>
              <div className="col-span-2">
                <div className="text-xs font-semibold text-muted-foreground">Description</div>
                <div className="mt-1">
                  <Textarea
                    value={session.description}
                    onChange={(e) => onSessionChange({ ...session, description: e.target.value })}
                    placeholder="Description optionnelle..."
                    className="rounded-2xl min-h-[60px]"
                    maxLength={2000}
                  />
                </div>
              </div>
            </>
          }
        />

        {/* Exercise list header */}
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">
            Exercices ({session.items.length})
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={exerciseFilter}
              onValueChange={(value: "all" | "strength" | "warmup") => setExerciseFilter(value)}
            >
              <SelectTrigger className="h-8 w-auto gap-1 rounded-full border-dashed text-xs">
                <Filter className="h-3 w-3" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                <SelectItem value="strength">Travail</SelectItem>
                <SelectItem value="warmup">Échauf.</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Exercise list — compact cards */}
        <div className="space-y-2">
          {session.items.map((item, index) => {
            const pair = getContrastPair(item);
            const isPairStart = pair?.role === "force" &&
              session.items[index + 1] && validContrastPair(item, session.items[index + 1]);
            return (
              <React.Fragment key={`${item.exercise_id}-${index}`}>
                <StrengthExerciseCard
                  exercise={item}
                  exercises={exercises}
                  exerciseFilter={exerciseFilter}
                  index={index}
                  totalItems={session.items.length}
                  onChange={(field, value) => onUpdateItem(index, field, value)}
                  onIntentChange={(intent) => changeIntent(index, intent)}
                  onDelete={() => {
                    if (pair) { toast("Dissocie le contraste avant de supprimer l'exercice."); return; }
                    onRemoveItem(index);
                  }}
                  onMoveUp={() => handleMoveUp(index)}
                  onMoveDown={() => handleMoveDown(index)}
                />
                {isPairStart && (
                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs space-y-2">
                    <p className="font-semibold text-primary">Contraste · {item.sets} tours · A → B → récupération</p>
                    <div className="flex items-center gap-2">
                      <label htmlFor={`contrast-rest-${index}`} className="text-muted-foreground">Repos après B (secondes)</label>
                      <Input id={`contrast-rest-${index}`} type="number" min={0} max={900} step={15}
                        className="h-9 w-20" value={pair.rest_seconds}
                        onChange={(e) => changeContrastRest(index, Number(e.target.value))} />
                      <Button size="sm" variant="outline" className="ml-auto"
                        onClick={() => toggleContrast(index)}>Dissocier</Button>
                    </div>
                  </div>
                )}
                {!pair && index < session.items.length - 1 && !getContrastPair(session.items[index + 1]) &&
                  item.block !== "warmup" && session.items[index + 1].block !== "warmup" && (
                  <button type="button" className="text-xs text-primary font-semibold pl-2 py-1"
                    onClick={() => toggleContrast(index)}>Associer au suivant en contraste (A → B → repos)</button>
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Add exercise buttons */}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onAddItem}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
          >
            <Plus className="h-4 w-4" /> Ajouter un exercice
          </button>
          <button
            type="button"
            onClick={onExerciseDialogOpen}
            className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-xs font-semibold hover:bg-muted"
          >
            <Plus className="h-4 w-4" /> Nouvel exercice
          </button>
        </div>
      </div>

      {/* Preview dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Aperçu de la séance</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <p className="text-lg font-semibold">{session.title || "Sans titre"}</p>
              <p className="text-sm text-muted-foreground">{session.description || "—"}</p>
              <p className="text-sm text-muted-foreground">Cycle : {session.cycle}</p>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-semibold">Exercices</p>
              <div className="space-y-2">
                {session.items
                  .slice()
                  .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
                  .map((item, index) => {
                    const exercise = exerciseById.get(item.exercise_id);
                    return (
                      <div
                        key={`${item.exercise_id}-${index}`}
                        className="rounded-xl border px-3 py-2 text-sm"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">
                            {index + 1}. {exercise?.nom_exercice ?? "Exercice"}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {exercise?.exercise_type === "warmup" ? "Échauffement" : "Travail"}
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {item.sets} séries &bull; {item.reps} reps &bull; {item.percent_1rm}% 1RM &bull;{" "}
                          {item.rest_seconds}s
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
