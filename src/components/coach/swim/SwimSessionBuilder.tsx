import React, { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { SwimSessionTimeline } from "@/components/swim/SwimSessionTimeline";
import { SwimExerciseForm } from "./SwimExerciseForm";
import { SessionMetadataForm } from "../shared/SessionMetadataForm";
import { FormActions } from "../shared/FormActions";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  FileText,
  Layers,
  Plus,
  Repeat,
  Sparkles,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { intensityTone } from "@/components/swim/IntensityDots";
import { buildItemsFromBlocks, calculateSwimTotalDistance } from "@/lib/swimSessionUtils";
import { detectTextWarnings, normalizeIntensityValue, parseSwimText } from "@/lib/swimTextParser";
import type { SwimBlock, SwimExercise, TextWarning } from "@/lib/swimTextParser";
import type { SwimSessionItem } from "@/lib/api";

interface SwimSessionDraft {
  id: number | null;
  name: string;
  description: string;
  estimatedDuration: number;
  folder: string | null;
  blocks: SwimBlock[];
}

interface SwimSessionBuilderProps {
  session: SwimSessionDraft;
  onSessionChange: (session: SwimSessionDraft) => void;
  onSave: () => void;
  onCancel: () => void;
  userId: number | null;
  isSaving?: boolean;
}

const strokeTypeLabels: Record<string, string> = {
  nc: "NC",
  educ: "Educ",
  jambes: "Jambes",
};

const swimTypeTone: Record<string, string> = {
  nc: "bg-sky-100 text-sky-900 ring-sky-200",
  educ: "bg-violet-100 text-violet-900 ring-violet-200",
  jambes: "bg-teal-100 text-teal-900 ring-teal-200",
};

const intensityTextTone: Record<string, string> = {
  V0: "text-intensity-1",
  V1: "text-intensity-2",
  V2: "text-intensity-3",
  V3: "text-intensity-4",
  Max: "text-intensity-5",
  Prog: "text-intensity-prog",
};

const intensityRingTone: Record<string, string> = {
  V0: "ring-intensity-1/30",
  V1: "ring-intensity-2/30",
  V2: "ring-intensity-3/30",
  V3: "ring-intensity-4/30",
  Max: "ring-intensity-5/30",
  Prog: "ring-intensity-prog/30",
};

const formatIntensityLabel = (value: string) => (value === "Max" ? "MAX" : value);

const formatRecoveryTime = (seconds: number | null) => {
  if (!seconds) return "";
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  if (min > 0 && sec > 0) return `${min}'${sec.toString().padStart(2, "0")}`;
  if (min > 0) return `${min}'00`;
  return `${sec}s`;
};

export function SwimSessionBuilder({
  session,
  onSessionChange,
  onSave,
  onCancel,
  userId,
  isSaving,
}: SwimSessionBuilderProps) {
  const { toast } = useToast();
  const [editorMode, setEditorMode] = React.useState<"blocks" | "text">("blocks");
  const [rawText, setRawText] = React.useState(session.description || "");
  const [expandedExercise, setExpandedExercise] = React.useState<{
    blockIndex: number;
    exerciseIndex: number;
  } | null>(null);
  const [selectedSession, setSelectedSession] = React.useState<{
    id: number;
    name: string;
    description: string;
    created_by: number | null;
    items: SwimSessionItem[];
  } | null>(null);

  const totalDistance = useMemo(
    () => calculateSwimTotalDistance(buildItemsFromBlocks(session.blocks)),
    [session.blocks],
  );

  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const backdropRef = React.useRef<HTMLDivElement>(null);

  const syncScroll = React.useCallback(() => {
    if (backdropRef.current && textareaRef.current) {
      backdropRef.current.style.transform = `translateY(-${textareaRef.current.scrollTop}px)`;
    }
  }, []);

  const textWarnings = useMemo<TextWarning[]>(
    () => (editorMode === "text" ? detectTextWarnings(rawText) : []),
    [editorMode, rawText],
  );

  const backdropLines = useMemo(() => {
    if (textWarnings.length === 0) return null;
    const warningSet = new Set(textWarnings.map((w) => w.lineIndex));
    return rawText.split("\n").map((line, i) => (
      <React.Fragment key={i}>
        <span
          className={cn(
            "text-transparent",
            warningSet.has(i) && "rounded-[2px] bg-amber-200/70 dark:bg-amber-700/40",
          )}
        >
          {line || "\u200B"}
        </span>
        {"\n"}
      </React.Fragment>
    ));
  }, [rawText, textWarnings]);

  const nullDistanceCount = useMemo(
    () =>
      session.blocks.reduce(
        (acc, block) =>
          acc + block.exercises.filter((ex) => ex.distance === null).length * (block.repetitions ?? 1),
        0,
      ),
    [session.blocks],
  );

  const addBlock = () => {
    onSessionChange({
      ...session,
      blocks: [
        ...session.blocks,
        {
          title: "Nouveau bloc",
          repetitions: 1,
          description: "",
          modalities: "",
          equipment: [],
          exercises: [
            {
              repetitions: 4,
              distance: 50,
              rest: null,
              restType: "rest",
              stroke: "crawl",
              strokeType: "nc",
              intensity: "V2",
              modalities: "",
              equipment: [],
            },
          ],
        },
      ],
    });
  };

  const updateBlock = (index: number, field: keyof SwimBlock, value: string | number | null | string[]) => {
    const blocks = [...session.blocks];
    blocks[index] = { ...blocks[index], [field]: value };
    onSessionChange({ ...session, blocks });
  };

  const removeBlock = (index: number) => {
    const blocks = session.blocks.filter((_, i) => i !== index);
    onSessionChange({ ...session, blocks });
  };

  const moveBlock = (fromIndex: number, direction: "up" | "down") => {
    const toIndex = direction === "up" ? fromIndex - 1 : fromIndex + 1;
    if (toIndex < 0 || toIndex >= session.blocks.length) return;
    const blocks = [...session.blocks];
    const [moved] = blocks.splice(fromIndex, 1);
    blocks.splice(toIndex, 0, moved);
    onSessionChange({ ...session, blocks });
  };

  const addExercise = (blockIndex: number) => {
    const blocks = [...session.blocks];
    blocks[blockIndex].exercises.push({
      repetitions: 4,
      distance: 50,
      rest: null,
      restType: "rest",
      stroke: "crawl",
      strokeType: "nc",
      intensity: "V2",
      modalities: "",
      equipment: [],
    });
    onSessionChange({ ...session, blocks });
  };

  const updateExercise = (
    blockIndex: number,
    exerciseIndex: number,
    field: keyof SwimExercise,
    value: string | number | null | string[],
  ) => {
    const blocks = [...session.blocks];
    const exercises = [...blocks[blockIndex].exercises];
    exercises[exerciseIndex] = { ...exercises[exerciseIndex], [field]: value } as SwimExercise;
    blocks[blockIndex] = { ...blocks[blockIndex], exercises };
    onSessionChange({ ...session, blocks });
  };

  const removeExercise = (blockIndex: number, exerciseIndex: number) => {
    const blocks = [...session.blocks];
    blocks[blockIndex].exercises = blocks[blockIndex].exercises.filter((_, idx) => idx !== exerciseIndex);
    onSessionChange({ ...session, blocks });
  };

  const duplicateExercise = (blockIndex: number, exerciseIndex: number) => {
    const blocks = [...session.blocks];
    const original = blocks[blockIndex].exercises[exerciseIndex];
    const copy = { ...original };
    blocks[blockIndex].exercises = [
      ...blocks[blockIndex].exercises.slice(0, exerciseIndex + 1),
      copy,
      ...blocks[blockIndex].exercises.slice(exerciseIndex + 1),
    ];
    onSessionChange({ ...session, blocks });
    setExpandedExercise({ blockIndex, exerciseIndex: exerciseIndex + 1 });
  };

  return (
    <div className="animate-in slide-in-from-bottom-4 motion-reduce:animate-none">
      <FormActions
        isEditing={Boolean(session.id)}
        isSaving={isSaving}
        saveDisabled={editorMode === "text"}
        onSave={onSave}
        onCancel={onCancel}
        onPreview={editorMode === "blocks" ? () =>
          setSelectedSession({
            id: session.id ?? Date.now(),
            name: session.name,
            description: session.description,
            created_by: userId ?? null,
            items: buildItemsFromBlocks(session.blocks),
          }) : undefined
        }
      />

      <div className="space-y-4 p-4">
        <SessionMetadataForm
          name={session.name}
          onNameChange={(value) => onSessionChange({ ...session, name: value })}
          estimatedDuration={session.estimatedDuration}
          onEstimatedDurationChange={(value) => onSessionChange({ ...session, estimatedDuration: value })}
          totalDistance={editorMode === "blocks" ? totalDistance : undefined}
          showDuration={true}
          showTotalDistance={editorMode === "blocks"}
        />
        {editorMode === "blocks" && nullDistanceCount > 0 && (
          <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
            <span>
              <span className="font-semibold">{nullDistanceCount} exercice{nullDistanceCount > 1 ? "s" : ""}</span>
              {" sans distance — le total affiché peut être inférieur à la réalité"}
            </span>
          </div>
        )}

        {/* Mode toggle: Blocs / Texte */}
        <div className="flex items-center rounded-xl border border-border bg-muted/50 p-0.5">
          <button
            type="button"
            onClick={() => setEditorMode("blocks")}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors",
              editorMode === "blocks"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Layers className="h-3.5 w-3.5" />
            Blocs
          </button>
          <button
            type="button"
            onClick={() => setEditorMode("text")}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors",
              editorMode === "text"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <FileText className="h-3.5 w-3.5" />
            Texte
          </button>
        </div>

        {editorMode === "text" ? (
          /* ── Text mode ── */
          <div className="space-y-3">
            <div className="relative overflow-hidden rounded-2xl border border-border bg-card focus-within:ring-2 focus-within:ring-ring">
              {backdropLines && (
                <div
                  ref={backdropRef}
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 top-0 px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap break-words"
                >
                  {backdropLines}
                </div>
              )}
              <textarea
                ref={textareaRef}
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                onScroll={syncScroll}
                placeholder={"Collez ou tapez votre séance ici…\n\nExemple :\nÉchauffement\n4x100 crawl V1 R30\n8x50 educ dos V0\n\nCorps de séance\n2x(4x100 NL V3 D1'30)\n6x50 papillon jambes V2 R20\n\nRetour au calme\n200 4N souple"}
                className="relative min-h-[280px] w-full resize-y bg-transparent px-4 py-3 text-sm leading-relaxed placeholder:text-muted-foreground/60 focus:outline-none"
              />
            </div>
            {textWarnings.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-800 dark:bg-amber-950/30">
                <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  {textWarnings.length} ligne{textWarnings.length > 1 ? "s" : ""} avec distance incertaine
                </div>
                <ul className="space-y-1">
                  {textWarnings.map((w) => (
                    <li key={w.lineIndex} className="text-[11px] text-amber-800 dark:text-amber-300">
                      <span className="font-mono opacity-60">L{w.lineIndex + 1}</span>
                      {" · "}
                      <span className="font-medium">{w.message}</span>
                      {" — "}
                      <span className="opacity-75 break-all">{w.line.length > 50 ? `${w.line.slice(0, 50)}…` : w.line}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                if (!rawText.trim()) return;
                const blocks = parseSwimText(rawText);
                if (blocks.length === 0) {
                  toast({
                    title: "Aucun bloc reconnu",
                    description: "Vérifiez le format du texte.",
                    variant: "destructive",
                  });
                  return;
                }
                const splitWarnings = textWarnings.filter((w) => w.type === "split_distance");
                if (splitWarnings.length > 0) {
                  const proceed = window.confirm(
                    `${splitWarnings.length} ligne(s) avec distance partielle (ex: "10 EZ" perdu après le /). Convertir quand même ?`,
                  );
                  if (!proceed) return;
                }
                onSessionChange({ ...session, blocks, description: rawText });
                setEditorMode("blocks");
                toast({ title: `${blocks.length} bloc(s) importé(s)` });
              }}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Sparkles className="h-4 w-4" />
              Convertir en séance
            </button>
            <p className="text-center text-[11px] text-muted-foreground">
              La conversion analysera votre texte et créera les blocs correspondants.
            </p>
          </div>
        ) : (
          /* ── Blocks mode ── */
          <>
            <div className="space-y-3">
              {session.blocks.map((block, blockIndex) => (
                <div key={blockIndex} className="rounded-2xl border border-border bg-card">
                  {/* Block header */}
                  <div className="flex items-center justify-between gap-1 px-3 py-2">
                    <div className="flex min-w-0 flex-1 items-center gap-1.5">
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">
                        <Repeat className="inline h-3 w-3" /> {block.repetitions ?? 1}x
                      </span>
                      <Input
                        value={block.title}
                        onChange={(e) => updateBlock(blockIndex, "title", e.target.value)}
                        placeholder={`Bloc ${blockIndex + 1}`}
                        className="h-7 min-w-0 flex-1 rounded-lg border-none bg-transparent px-1 text-xs font-semibold shadow-none focus-visible:bg-muted focus-visible:ring-1"
                      />
                      <div className="shrink-0 text-[11px] text-muted-foreground whitespace-nowrap">
                        · {block.exercises.length} ex
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <Input
                        type="number"
                        min={1}
                        value={block.repetitions ?? ""}
                        onChange={(e) =>
                          updateBlock(blockIndex, "repetitions", e.target.value === "" ? null : Number(e.target.value))
                        }
                        className="h-7 w-11 rounded-lg text-center text-xs"
                        placeholder="1"
                      />
                      <button type="button" onClick={() => moveBlock(blockIndex, "up")}
                        aria-label="Déplacer le bloc vers le haut"
                        className="inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-muted disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                        disabled={blockIndex === 0}>
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => moveBlock(blockIndex, "down")}
                        aria-label="Déplacer le bloc vers le bas"
                        className="inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-muted disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                        disabled={blockIndex === session.blocks.length - 1}>
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => removeBlock(blockIndex)}
                        aria-label="Supprimer le bloc"
                        className="inline-flex h-10 w-10 items-center justify-center rounded-full text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Exercises */}
                  <div className="border-t border-border">
                    {block.exercises.map((exercise, exerciseIndex) => {
                      const isExpanded =
                        expandedExercise?.blockIndex === blockIndex &&
                        expandedExercise?.exerciseIndex === exerciseIndex;
                      const normalizedIntensity = normalizeIntensityValue(exercise.intensity);
                      return (
                        <div key={exerciseIndex} className="border-b border-border last:border-b-0">
                          {/* Compact summary row */}
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedExercise(
                                isExpanded ? null : { blockIndex, exerciseIndex }
                              )
                            }
                            className={cn(
                              "flex w-full items-center gap-1 px-3 py-2 text-left text-[11px] font-semibold transition-colors hover:bg-muted/50 overflow-hidden",
                              isExpanded && "bg-muted/50"
                            )}
                          >
                            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
                              <span className="text-muted-foreground whitespace-nowrap">
                                {exercise.repetitions ?? ""}×{exercise.distance ?? ""}m
                              </span>
                              <span className="text-muted-foreground whitespace-nowrap">{exercise.stroke}</span>
                              <span className={cn(
                                "inline-flex items-center rounded-full px-1.5 py-0.5 ring-1 whitespace-nowrap",
                                swimTypeTone[exercise.strokeType] ?? "bg-muted ring-border"
                              )}>
                                {strokeTypeLabels[exercise.strokeType] ?? exercise.strokeType}
                              </span>
                              <span className={cn(
                                "inline-flex items-center gap-1 rounded-full bg-card px-1.5 py-0.5 ring-1 whitespace-nowrap",
                                intensityRingTone[normalizedIntensity],
                                intensityTextTone[normalizedIntensity],
                              )}>
                                <span className={cn("h-1.5 w-1.5 rounded-full", intensityTone[normalizedIntensity] ?? "bg-muted")} />
                                {formatIntensityLabel(normalizedIntensity)}
                              </span>
                              {exercise.rest ? (
                                <span className="text-muted-foreground whitespace-nowrap">
                                  {exercise.restType === "departure" ? "⏱" : "⏸"}{" "}
                                  {exercise.restType === "departure" ? "Dép." : "Repos"}{" "}
                                  {formatRecoveryTime(exercise.rest)}
                                </span>
                              ) : null}
                              {exercise.equipment.length > 0 ? (
                                <span className="text-muted-foreground whitespace-nowrap">
                                  🏊{exercise.equipment.length}
                                </span>
                              ) : null}
                            </div>
                            <span
                              onClick={(e) => {
                                e.stopPropagation();
                                removeExercise(blockIndex, exerciseIndex);
                              }}
                              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="h-3 w-3" />
                            </span>
                          </button>

                          {/* Expanded edit form */}
                          {isExpanded ? (
                            <div className="border-t border-border bg-muted/30 px-3 py-3">
                              <SwimExerciseForm
                                exercise={exercise}
                                onChange={(field, value) =>
                                  updateExercise(blockIndex, exerciseIndex, field, value)
                                }
                                onDelete={() => removeExercise(blockIndex, exerciseIndex)}
                                onDuplicate={() => duplicateExercise(blockIndex, exerciseIndex)}
                                showDelete={true}
                              />
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>

                  {/* Add exercise button */}
                  <div className="border-t border-border px-3 py-2">
                    <button
                      type="button"
                      onClick={() => addExercise(blockIndex)}
                      className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1.5 text-[11px] font-semibold text-muted-foreground hover:bg-muted/80"
                    >
                      <Plus className="h-3 w-3" /> Exercice
                    </button>
                  </div>
                </div>
              ))}

              {!session.blocks.length ? (
                <div className="rounded-2xl border border-dashed border-border bg-muted px-3 py-6 text-center text-sm text-muted-foreground">
                  Aucun bloc. Ajoute un bloc pour commencer.
                </div>
              ) : null}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={addBlock}
              className="h-10 rounded-full px-3 text-xs"
            >
              <Plus className="h-4 w-4" /> Ajouter bloc
            </Button>
          </>
        )}

        <div className="h-8" />
      </div>

      <Dialog
        open={Boolean(selectedSession)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedSession(null);
          }
        }}
      >
        <DialogContent className="max-w-4xl">
          <SwimSessionTimeline
            title={selectedSession?.name ?? ""}
            description={selectedSession?.description ?? undefined}
            items={selectedSession?.items}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
