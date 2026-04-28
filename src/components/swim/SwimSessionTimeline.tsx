import { useState, useMemo } from "react";
import type { SwimSessionItem, SwimExerciseLogInput } from "@/lib/api";
import { ExerciseLogInline } from "./ExerciseLogInline";
import type { SwimPayloadFields } from "@/lib/types";
import {
  type BlockGroup,
  type SwimExerciseDetail,
  normalizeIntensity,
  getStrokeLabel,
  formatRecoveryDisplay,
  groupItemsByBlock,
  strokeTypeLabels,
} from "@/lib/swimConsultationUtils";
import { formatIntensityLabel } from "@/components/swim/IntensityDots";
import { EquipmentIconCompact } from "@/components/swim/EquipmentIconCompact";
import { splitModalitiesLines, calculateSwimTotalDistance } from "@/lib/swimSessionUtils";
import { ChevronDown, Clock, Layers, Eye, List, Waves } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface SwimSessionTimelineProps {
  title: string;
  description?: string;
  items?: SwimSessionItem[];
  showHeader?: boolean;
  onExerciseSelect?: (detail: SwimExerciseDetail) => void;
  /** Edit mode — per-exercise log data keyed by item id */
  exerciseLogs?: Map<number, SwimExerciseLogInput>;
  /** Currently expanded exercise item id */
  expandedItemId?: number | null;
  /** Toggle inline expansion for an exercise */
  onToggleExpand?: (itemId: number) => void;
  /** Called when inline log data changes */
  onLogChange?: (itemId: number, log: SwimExerciseLogInput) => void;
}

// ---------------------------------------------------------------------------
// Color maps
// ---------------------------------------------------------------------------
const railColorMap: Record<string, string> = {
  V0: "bg-intensity-1",
  V1: "bg-intensity-2",
  V2: "bg-intensity-3",
  V3: "bg-intensity-4",
  Max: "bg-intensity-5",
  Prog: "bg-intensity-prog",
};

const dotRingMap: Record<string, string> = {
  V0: "ring-intensity-1/40",
  V1: "ring-intensity-2/40",
  V2: "ring-intensity-3/40",
  V3: "ring-intensity-4/40",
  Max: "ring-intensity-5/40",
  Prog: "ring-intensity-prog/40",
};

const intensityTextMap: Record<string, string> = {
  V0: "text-intensity-1",
  V1: "text-intensity-2",
  V2: "text-intensity-3",
  V3: "text-intensity-4",
  Max: "text-intensity-5",
  Prog: "bg-gradient-to-r from-intensity-2 to-intensity-4 bg-clip-text text-transparent",
};

const strokeBadgeMap: Record<string, { label: string; className: string }> = {
  NL: { label: "NL", className: "bg-sky-100 text-sky-800" },
  Dos: { label: "Dos", className: "bg-violet-100 text-violet-800" },
  Brasse: { label: "Brasse", className: "bg-emerald-100 text-emerald-800" },
  Pap: { label: "Pap", className: "bg-amber-100 text-amber-800" },
  "4 nages": { label: "4N", className: "bg-slate-100 text-slate-700" },
  NAC: { label: "NAC", className: "bg-orange-100 text-orange-800" },
  "Spé": { label: "Spé", className: "bg-pink-100 text-pink-800" },
};

const typeBadgeMap: Record<string, { label: string; className: string }> = {
  "Éducatif": { label: "Éduc", className: "bg-violet-100 text-violet-800 italic" },
  Jambes: { label: "Jambes", className: "bg-teal-100 text-teal-800" },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Dominant intensity of a block = highest found */
const getDominantIntensity = (items: SwimSessionItem[]): string => {
  const priority = ["Max", "V3", "V2", "V1", "V0", "Prog"];
  const intensities = items
    .map((item) => {
      const p = (item.raw_payload as SwimPayloadFields) ?? {};
      return normalizeIntensity(p.exercise_intensity ?? item.intensity);
    })
    .filter(Boolean) as string[];
  for (const level of priority) {
    if (intensities.includes(level)) return level;
  }
  return "V1";
};

/** Block total distance (including repetitions) */
const computeBlockDistance = (block: BlockGroup): number => {
  const itemsDist = block.items.reduce((total, item) => {
    const p = (item.raw_payload as SwimPayloadFields) ?? {};
    const reps = Number(p.exercise_repetitions) || 1;
    const dist = Number(item.distance) || 0;
    return total + reps * dist;
  }, 0);
  return itemsDist * (block.repetitions || 1);
};

/** Exercise label: "4x100m" */
const formatExerciseLabel = (item: SwimSessionItem): string => {
  const p = (item.raw_payload as SwimPayloadFields) ?? {};
  const reps = Number(p.exercise_repetitions);
  const dist = Number(item.distance);
  if (reps > 1 && dist > 0) return `${reps}×${dist}m`;
  if (dist > 0) return `${dist}m`;
  return item.label || "—";
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function SwimSessionTimeline({
  title: _title,
  description: _description,
  items = [],
  showHeader = true,
  onExerciseSelect,
  exerciseLogs,
  expandedItemId,
  onToggleExpand,
  onLogChange,
}: SwimSessionTimelineProps) {
  const [viewLevel, setViewLevel] = useState<0 | 1 | 2>(0);
  const [collapsedBlocks, setCollapsedBlocks] = useState<Set<string>>(new Set());

  const blocks = useMemo(() => groupItemsByBlock(items), [items]);
  const totalDistance = useMemo(() => calculateSwimTotalDistance(items), [items]);

  const isBassin = viewLevel === 2;
  const isCompact = viewLevel >= 1;

  const cycleViewLevel = () => {
    const next = ((viewLevel + 1) % 3) as 0 | 1 | 2;
    setViewLevel(next);
    if (next === 2) {
      setCollapsedBlocks(new Set(blocks.map((b) => b.key)));
    } else if (next === 0) {
      setCollapsedBlocks(new Set());
    }
    // Level 1: don't change collapsed state
  };

  const toggleBlock = (key: string) => {
    setCollapsedBlocks((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  /** Build SwimExerciseDetail from an item for the optional callback */
  const buildDetail = (
    item: SwimSessionItem,
    itemIndex: number,
    block: BlockGroup,
    blockIndex: number,
  ): SwimExerciseDetail => {
    const payload = (item.raw_payload as SwimPayloadFields) ?? {};
    const normalizedIntensity = normalizeIntensity(
      payload.exercise_intensity ?? item.intensity ?? null,
    );
    const strokeLabel = getStrokeLabel(payload.exercise_stroke);
    const strokeTypeLabel = payload.exercise_stroke_type
      ? (strokeTypeLabels[payload.exercise_stroke_type] ?? payload.exercise_stroke_type)
      : null;
    const equipmentList = Array.isArray(payload.exercise_equipment)
      ? payload.exercise_equipment
      : [];

    return {
      label: item.label || `Exercice ${itemIndex + 1}`,
      distance: item.distance ?? null,
      repetitions: payload.exercise_repetitions ?? null,
      rest: payload.exercise_rest ?? null,
      restType: (payload.exercise_rest_type as "departure" | "rest") ?? "rest",
      stroke: strokeLabel,
      strokeType: strokeTypeLabel,
      intensity: normalizedIntensity,
      modalities: item.notes ?? null,
      equipment: equipmentList,
      blockTitle: block.title,
      blockIndex,
    };
  };

  // Cumulative distance tracking
  let cumulDist = 0;

  if (blocks.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-muted/70 bg-muted/30 p-6 text-sm text-muted-foreground">
        Aucun contenu détaillé pour cette séance.
      </div>
    );
  }

  return (
    <div>
      {/* ── Header ── */}
      {showHeader && (
        <div className="flex items-center justify-between gap-3 pb-4">
          <div className="flex items-baseline gap-4">
            <span className="text-3xl font-display font-extrabold tracking-tight tabular-nums">
              {totalDistance.toLocaleString("fr-FR")}m
            </span>
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              <Layers className="h-3.5 w-3.5" /> {blocks.length} blocs
            </span>
          </div>
          {/* 3-level cycling pill */}
          <button
            type="button"
            onClick={cycleViewLevel}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all",
              viewLevel === 0 && "border-border bg-card text-muted-foreground",
              viewLevel === 1 && "border-muted-foreground/30 bg-muted text-foreground",
              viewLevel === 2 && "border-primary bg-primary text-primary-foreground",
            )}
          >
            {viewLevel === 0 && (
              <>
                <Eye className="h-3.5 w-3.5" /> Détail
              </>
            )}
            {viewLevel === 1 && (
              <>
                <List className="h-3.5 w-3.5" /> Compact
              </>
            )}
            {viewLevel === 2 && (
              <>
                <Waves className="h-3.5 w-3.5" /> Bassin
              </>
            )}
          </button>
        </div>
      )}

      {/* ── Timeline ── */}
      <div className="pt-2">
        {blocks.map((block, blockIndex) => {
          const dominant = getDominantIntensity(block.items);
          const blockDist = computeBlockDistance(block);
          cumulDist += blockDist;
          const isCollapsed = collapsedBlocks.has(block.key);

          return (
            <div key={block.key}>
              {/* ── Block ── */}
              <div
                className="flex"
                style={{
                  animation:
                    "timeline-block-reveal 0.5s cubic-bezier(0.16,1,0.3,1) both",
                  animationDelay: `${blockIndex * 0.07}s`,
                }}
              >
                {/* Rail column */}
                <div className="flex w-8 shrink-0 flex-col items-center pt-0.5">
                  <div
                    className={cn(
                      "h-4 w-4 shrink-0 rounded-full border-[3px] border-background ring-2",
                      railColorMap[dominant],
                      dotRingMap[dominant],
                    )}
                  />
                  <div
                    className={cn(
                      "-mt-0.5 w-[5px] grow rounded-full opacity-35",
                      railColorMap[dominant],
                    )}
                  />
                </div>

                {/* Content column */}
                <div className="min-w-0 flex-1 pb-4 pl-3">
                  {/* Block header */}
                  <button
                    type="button"
                    onClick={() => toggleBlock(block.key)}
                    aria-expanded={!isCollapsed}
                    className="flex w-full items-center gap-2 py-1.5 text-left select-none"
                  >
                    <span
                      className={cn(
                        "font-display font-bold uppercase tracking-[0.08em]",
                        isBassin ? "text-base" : "text-sm",
                        intensityTextMap[dominant] ?? "text-foreground",
                      )}
                    >
                      {block.title}
                    </span>
                    {block.repetitions && block.repetitions > 1 ? (
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0.5 text-[11px] font-bold leading-tight text-white",
                          railColorMap[dominant],
                        )}
                      >
                        ×{block.repetitions}
                      </span>
                    ) : null}
                    <span className="flex-1" />
                    <span
                      className={cn(
                        "font-display font-bold tabular-nums tracking-tight text-foreground",
                        isBassin ? "text-lg" : "text-base",
                      )}
                    >
                      {blockDist.toLocaleString("fr-FR")}m
                    </span>
                    <ChevronDown
                      className={cn(
                        "h-[18px] w-[18px] shrink-0 text-muted-foreground transition-transform duration-300",
                        isCollapsed && "-rotate-90",
                      )}
                    />
                  </button>

                  {/* Block description (only viewLevel 0) */}
                  {!isCompact && block.description && !isCollapsed ? (
                    <p className="pb-1.5 text-xs italic text-muted-foreground leading-snug">
                      {block.description}
                    </p>
                  ) : null}

                  {/* Exercise list (hidden when collapsed) */}
                  {!isCollapsed && (
                    <div className="flex flex-col gap-1">
                      {block.items.map((item, itemIndex) => {
                        const payload =
                          (item.raw_payload as SwimPayloadFields) ?? {};
                        const normalizedIntensity = normalizeIntensity(
                          payload.exercise_intensity ?? item.intensity ?? null,
                        );
                        const strokeLabel = getStrokeLabel(
                          payload.exercise_stroke,
                        );
                        const strokeTypeLabel = payload.exercise_stroke_type
                          ? (strokeTypeLabels[payload.exercise_stroke_type] ??
                              payload.exercise_stroke_type)
                          : null;
                        const equipmentList = Array.isArray(
                          payload.exercise_equipment,
                        )
                          ? payload.exercise_equipment
                          : [];
                        const restSeconds = Number(payload.exercise_rest) || 0;
                        const restType = payload.exercise_rest_type;
                        const modalitiesLines = splitModalitiesLines(item.notes);

                        const strokeBadge = strokeLabel
                          ? (strokeBadgeMap[strokeLabel] ?? null)
                          : null;
                        const typeBadge = strokeTypeLabel
                          ? (typeBadgeMap[strokeTypeLabel] ?? null)
                          : null;

                        // Edit mode flags
                        const isExpandable = Boolean(onToggleExpand && item.id != null);
                        const isExpanded = isExpandable && expandedItemId === item.id;
                        const hasLogData = item.id != null && exerciseLogs?.has(item.id);

                        const handleClick = isExpandable
                          ? () => onToggleExpand!(item.id!)
                          : onExerciseSelect
                            ? () => onExerciseSelect(buildDetail(item, itemIndex, block, blockIndex))
                            : undefined;

                        const isClickable = Boolean(handleClick);

                        const exerciseRow = (
                          <div
                            key={`${block.key}-${itemIndex}`}
                            className={cn(
                              itemIndex > 0 && "border-t border-border/40",
                            )}
                          >
                            {/* Clickable content wrapper */}
                            <div
                              className={cn(
                                "py-2",
                                isClickable && "cursor-pointer active:bg-muted/50 rounded",
                              )}
                              onClick={handleClick}
                              role={isClickable ? "button" : undefined}
                              tabIndex={isClickable ? 0 : undefined}
                              onKeyDown={
                                isClickable
                                  ? (e) => {
                                      if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        handleClick!();
                                      }
                                    }
                                  : undefined
                              }
                            >
                              {/* Main exercise row */}
                              <div className="flex items-center gap-1.5">
                                {/* Distance label */}
                                <span
                                  className={cn(
                                    "font-display font-bold tabular-nums tracking-tight text-foreground",
                                    isBassin
                                      ? "min-w-[95px] text-xl"
                                      : "min-w-[76px] text-lg",
                                  )}
                                >
                                  {formatExerciseLabel(item)}
                                </span>

                                {/* Stroke badge */}
                                {strokeBadge ? (
                                  <span
                                    className={cn(
                                      "rounded-full font-display font-bold whitespace-nowrap leading-tight",
                                      isBassin
                                        ? "px-2.5 py-1 text-sm"
                                        : "px-2 py-0.5 text-xs",
                                      strokeBadge.className,
                                    )}
                                  >
                                    {strokeBadge.label}
                                  </span>
                                ) : null}

                                {/* Type badge (hidden in bassin) */}
                                {!isBassin && typeBadge ? (
                                  <span
                                    className={cn(
                                      "rounded-full px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap leading-tight",
                                      typeBadge.className,
                                    )}
                                  >
                                    {typeBadge.label}
                                  </span>
                                ) : null}

                                {/* Intensity text (hidden in bassin) */}
                                {!isBassin && normalizedIntensity ? (
                                  <span
                                    className={cn(
                                      "font-display text-sm font-bold whitespace-nowrap",
                                      intensityTextMap[normalizedIntensity] ??
                                        "text-foreground",
                                    )}
                                  >
                                    {formatIntensityLabel(normalizedIntensity)}
                                  </span>
                                ) : null}

                                {/* Log indicator badge */}
                                {hasLogData ? (
                                  <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary leading-tight">
                                    ✓
                                  </span>
                                ) : null}

                                {/* Spacer */}
                                <span className="flex-1" />

                                {/* Rest (hidden in bassin) */}
                                {!isBassin && restSeconds > 0 ? (
                                  <span className="ml-auto flex items-center gap-1 whitespace-nowrap text-sm font-medium text-muted-foreground">
                                    <Clock className="h-3 w-3" />
                                    {restType === "departure" ? "d:" : "r:"}
                                    {formatRecoveryDisplay(restSeconds)}
                                  </span>
                                ) : null}
                              </div>

                              {/* Equipment row */}
                              {equipmentList.length > 0 ? (
                                <div className="flex flex-wrap gap-2 pb-0.5 pt-1.5">
                                  {equipmentList.map((eq: string) => (
                                    <EquipmentIconCompact
                                      key={eq}
                                      equipment={eq}
                                      size={isBassin ? "md" : "sm"}
                                    />
                                  ))}
                                </div>
                              ) : null}

                              {/* Modalities (only viewLevel 0) */}
                              {viewLevel === 0 && modalitiesLines.length > 0 ? (
                                <div
                                  className={cn(
                                    "mt-1.5 rounded-md border-l-[3px] bg-muted/60 px-2.5 py-1.5 text-sm leading-relaxed text-muted-foreground",
                                    (() => {
                                      // Use the dominant intensity border color
                                      const borderMap: Record<string, string> = {
                                        V0: "border-intensity-1",
                                        V1: "border-intensity-2",
                                        V2: "border-intensity-3",
                                        V3: "border-intensity-4",
                                        Max: "border-intensity-5",
                                        Prog: "border-intensity-prog",
                                      };
                                      return (
                                        borderMap[dominant] ??
                                        "border-muted-foreground/30"
                                      );
                                    })(),
                                  )}
                                >
                                  {modalitiesLines.map((line, li) => (
                                    <div key={`mod-${block.key}-${itemIndex}-${li}`}>
                                      {line}
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                            </div>

                            {/* Inline exercise log form (edit mode) */}
                            {isExpanded && item.id != null && onLogChange && (
                              <ExerciseLogInline
                                item={item}
                                log={exerciseLogs?.get(item.id) ?? {
                                  exercise_label: item.label || `Exercice ${itemIndex + 1}`,
                                  source_item_id: item.id,
                                  split_times: [],
                                  tempo: null,
                                  stroke_count: [],
                                  notes: null,
                                }}
                                onChange={(log) => onLogChange(item.id!, log)}
                                onCollapse={() => onToggleExpand!(item.id!)}
                              />
                            )}
                          </div>
                        );

                        return exerciseRow;
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* ── Milestone ── */}
              {blockIndex < blocks.length - 1 && (
                <div
                  className="flex items-center py-2"
                  style={{ marginLeft: "15px" }}
                >
                  <div className="h-px flex-1 bg-border" />
                  <span className="px-2.5 text-[11px] font-bold tabular-nums text-muted-foreground">
                    {cumulDist.toLocaleString("fr-FR")}m
                  </span>
                  <div className="h-px flex-1 bg-border" />
                </div>
              )}
            </div>
          );
        })}

        {/* ── Session End Marker ── */}
        <div className="flex items-center gap-2 pl-2.5 pt-2">
          <div className="h-2.5 w-2.5 rounded-full bg-muted" />
          <span className="text-xs font-semibold text-muted-foreground">
            Fin de séance — {totalDistance.toLocaleString("fr-FR")}m
          </span>
        </div>
      </div>
    </div>
  );
}
