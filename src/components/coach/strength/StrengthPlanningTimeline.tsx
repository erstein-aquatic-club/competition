/**
 * StrengthPlanningTimeline.tsx — Presentational timeline of weeks for strength planning.
 *
 * Mirror of SwimPlanningTimeline.tsx (Phase 3 §158).
 * Differences vs swim:
 * - No filière concept — cells display session name + phase badge + exercise count.
 * - Phase dot uses PHASE_STYLES from strengthPhaseStyles.ts (detectPhase on session title).
 * - 7 day rows (Lun–Dim) vs 6 for swim.
 * - Badge "Perso" (overridden) identical to swim.
 * - Empty edit cell: dashed border + Plus icon.
 * - No session link button (session IS the primary content here).
 *
 * Stateless — all state (expanded week, editing meta, callbacks, data) from props.
 */
import { useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Competition, StrengthSessionTemplate } from "@/lib/api/types";
import type { EffectiveStrengthSlot, EffectiveStrengthWeekMeta } from "@/lib/strengthPlanningMerge";
import { PHASE_STYLES, detectPhase } from "@/lib/strength/strengthPhaseStyles";
import { weekTypeColor, weekTypeTextColor } from "@/lib/weekTypeColor";
import { cn } from "@/lib/utils";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Check,
  ChevronDown,
  Pencil,
  Plus,
  Trophy,
  User,
  X,
} from "lucide-react";

import {
  DAY_ROWS,
  fmtDD_MM,
  isCurrentWeek,
  type WeekInfo,
} from "@/components/coach/swim/swimPlanningShared";

/* ═══════════════════════════════════════════════════════════════════
   Props
   ═══════════════════════════════════════════════════════════════════ */

export interface StrengthPlanningTimelineProps {
  weeks: WeekInfo[];
  effectiveSlotsByWeek: Map<string, EffectiveStrengthSlot[]>;
  getEffectiveWeekMeta: (weekKey: string) => EffectiveStrengthWeekMeta;
  sessionTemplatesById: Map<number, StrengthSessionTemplate>;
  competitionsByWeek: Map<string, Competition[]>;
  getDayCompetitions: (weekMonday: Date, dayIndex: number) => Competition[];
  currentWeekKey?: string;
  expandedWeekKey: string | null;
  onToggleExpand: (weekKey: string) => void;
  onSlotTap: (
    weekKey: string,
    dayIndex: number,
    timeSlot: "morning" | "evening",
    slot: EffectiveStrengthSlot | null,
  ) => void;
  onWeekMetaTap: (weekKey: string, e: React.MouseEvent) => void;
  onCompetitionTap: (c: Competition) => void;
  // Inline week-meta editing state (managed by parent)
  editingWeekKey: string | null;
  editWeekType: string;
  editWeekNotes: string;
  existingWeekTypes: string[];
  onSaveMeta: () => void;
  onCancelEditMeta: () => void;
  onEditTypeChange: (v: string) => void;
  onEditNotesChange: (v: string) => void;
  showOverrideBadge?: boolean;
  readOnly?: boolean;
  sentinelRef?: React.RefObject<HTMLDivElement | null>;
  isLoading?: boolean;
  isEmpty?: boolean;
}

/* ═══════════════════════════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════════════════════════ */

export default function StrengthPlanningTimeline(
  props: StrengthPlanningTimelineProps,
) {
  const {
    weeks,
    effectiveSlotsByWeek,
    getEffectiveWeekMeta,
    sessionTemplatesById,
    competitionsByWeek,
    getDayCompetitions,
    expandedWeekKey,
    onToggleExpand,
    onSlotTap,
    onWeekMetaTap,
    onCompetitionTap,
    editingWeekKey,
    editWeekType,
    editWeekNotes,
    existingWeekTypes,
    onSaveMeta,
    onCancelEditMeta,
    onEditTypeChange,
    onEditNotesChange,
    sentinelRef,
    isLoading = false,
    isEmpty = false,
    readOnly = false,
  } = props;

  const showOverrideBadge = props.showOverrideBadge ?? false;

  const findSlot = useCallback(
    (
      weekKey: string,
      dayIndex: number,
      timeSlot: "morning" | "evening",
    ): EffectiveStrengthSlot | undefined => {
      const weekSlots = effectiveSlotsByWeek.get(weekKey);
      if (!weekSlots) return undefined;
      return weekSlots.find(
        (s) => s.day_of_week === dayIndex && s.time_slot === timeSlot,
      );
    },
    [effectiveSlotsByWeek],
  );

  return (
    <div className="relative px-4 pt-3">
      {/* Vertical rail */}
      <div className="absolute left-[27px] top-8 bottom-8 w-px bg-border" />

      {isLoading && isEmpty ? (
        <div className="space-y-3 pl-8">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="rounded-xl border p-3 animate-pulse motion-reduce:animate-none"
            >
              <div className="h-4 w-36 rounded bg-muted" />
              <div className="h-3 w-24 mt-2 rounded bg-muted" />
            </div>
          ))}
        </div>
      ) : (
        weeks.map((week) => {
          const current = isCurrentWeek(week.weekKey);
          const expanded = expandedWeekKey === week.weekKey;
          const editing = editingWeekKey === week.weekKey;
          const meta = getEffectiveWeekMeta(week.weekKey);
          const weekSlots = effectiveSlotsByWeek.get(week.weekKey) ?? [];
          const filledCount = weekSlots.length;
          const weekCompetitions = competitionsByWeek.get(week.weekKey) ?? [];

          return (
            <WeekCard
              key={week.weekKey}
              week={week}
              isCurrent={current}
              isExpanded={expanded}
              isEditing={editing}
              meta={meta}
              filledCount={filledCount}
              weekSlots={weekSlots}
              weekCompetitions={weekCompetitions}
              getDayCompetitions={getDayCompetitions}
              onSelectCompetition={onCompetitionTap}
              editWeekType={editWeekType}
              setEditWeekType={onEditTypeChange}
              editWeekNotes={editWeekNotes}
              setEditWeekNotes={onEditNotesChange}
              existingWeekTypes={existingWeekTypes}
              onToggleExpand={() => onToggleExpand(week.weekKey)}
              onStartEditMeta={(e) => onWeekMetaTap(week.weekKey, e)}
              onSaveMeta={onSaveMeta}
              onCancelEditMeta={onCancelEditMeta}
              findSlot={findSlot}
              onCellTap={(dayIndex, timeSlot) => {
                const existing = findSlot(week.weekKey, dayIndex, timeSlot);
                onSlotTap(week.weekKey, dayIndex, timeSlot, existing ?? null);
              }}
              showOverrideBadge={showOverrideBadge}
              sessionTemplatesById={sessionTemplatesById}
              readOnly={readOnly}
            />
          );
        })
      )}

      {/* Sentinel for infinite scroll */}
      {sentinelRef && <div ref={sentinelRef} className="h-4" />}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Week Card
   ═══════════════════════════════════════════════════════════════════ */

interface WeekCardProps {
  week: WeekInfo;
  isCurrent: boolean;
  isExpanded: boolean;
  isEditing: boolean;
  meta: EffectiveStrengthWeekMeta;
  filledCount: number;
  weekSlots: EffectiveStrengthSlot[];
  weekCompetitions: Competition[];
  getDayCompetitions: (weekMonday: Date, dayIndex: number) => Competition[];
  onSelectCompetition: (c: Competition) => void;
  editWeekType: string;
  setEditWeekType: (v: string) => void;
  editWeekNotes: string;
  setEditWeekNotes: (v: string) => void;
  existingWeekTypes: string[];
  onToggleExpand: () => void;
  onStartEditMeta: (e: React.MouseEvent) => void;
  onSaveMeta: () => void;
  onCancelEditMeta: () => void;
  findSlot: (
    weekKey: string,
    dayIndex: number,
    timeSlot: "morning" | "evening",
  ) => EffectiveStrengthSlot | undefined;
  onCellTap: (dayIndex: number, timeSlot: "morning" | "evening") => void;
  showOverrideBadge: boolean;
  sessionTemplatesById: Map<number, StrengthSessionTemplate>;
  readOnly: boolean;
}

function WeekCard({
  week,
  isCurrent,
  isExpanded,
  isEditing,
  meta,
  filledCount,
  weekSlots,
  weekCompetitions,
  getDayCompetitions,
  onSelectCompetition,
  editWeekType,
  setEditWeekType,
  editWeekNotes,
  setEditWeekNotes,
  existingWeekTypes,
  onToggleExpand,
  onStartEditMeta,
  onSaveMeta,
  onCancelEditMeta,
  findSlot,
  onCellTap,
  showOverrideBadge,
  sessionTemplatesById,
  readOnly,
}: WeekCardProps) {
  const hasCompetition = weekCompetitions.length > 0;
  const datalistId = `wt-strength-${week.weekKey}`;

  return (
    <div className="relative pl-8 mb-2">
      {/* Timeline dot */}
      <div
        className={cn(
          "absolute left-[11px] top-3.5 h-[9px] w-[9px] rounded-full ring-2 ring-background transition-colors",
          hasCompetition
            ? "bg-amber-500"
            : isCurrent
              ? "bg-primary"
              : filledCount > 0
                ? "bg-emerald-500"
                : "bg-muted-foreground/25",
        )}
      />

      <div
        className={cn(
          "rounded-xl border bg-card transition-all overflow-hidden",
          isCurrent && "ring-2 ring-primary",
        )}
      >
        {/* ── Editing mode ── */}
        {isEditing ? (
          <div className="p-3 space-y-2.5">
            <div className="text-xs font-medium text-muted-foreground">
              S{week.weekNumber} &middot; {fmtDD_MM(week.monday)} &ndash;{" "}
              {fmtDD_MM(week.sunday)}
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">
                Type de semaine
              </label>
              <Input
                className="h-8 text-sm"
                placeholder="Ex : Force, Puissance, Taper..."
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
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">
                Notes
              </label>
              <Textarea
                className="text-sm min-h-[48px] resize-none"
                placeholder="Note optionnelle"
                rows={2}
                value={editWeekNotes}
                onChange={(e) => setEditWeekNotes(e.target.value)}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="ghost"
                size="sm"
                className="h-10 text-xs"
                onClick={onCancelEditMeta}
              >
                <X className="mr-1 h-3 w-3" />
                Annuler
              </Button>
              <Button size="sm" className="h-10 text-xs" onClick={onSaveMeta}>
                <Check className="mr-1 h-3 w-3" />
                Enregistrer
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* ── Collapsed header (always visible) ── */}
            <button
              type="button"
              className="w-full text-left px-3 py-2.5 flex items-center gap-2 min-h-[48px] hover:bg-muted/40 transition-colors active:bg-muted/60"
              onClick={onToggleExpand}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-foreground tabular-nums">
                    S{week.weekNumber}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {fmtDD_MM(week.monday)} &ndash; {fmtDD_MM(week.sunday)}
                  </span>
                  {meta.week_type && (
                    <Badge
                      className="text-[10px] px-1.5 py-0 border-0 shrink-0"
                      style={{
                        backgroundColor: weekTypeColor(meta.week_type),
                        color: weekTypeTextColor(meta.week_type),
                      }}
                    >
                      {meta.week_type}
                    </Badge>
                  )}
                  {filledCount > 0 && (
                    <span className="inline-flex items-center gap-[3px] shrink-0">
                      {/* Mini-dots: ordered Lun matin, Lun soir, Mar matin... */}
                      {DAY_ROWS.flatMap((day) =>
                        (["morning", "evening"] as const).map((ts) => {
                          const slot = weekSlots.find(
                            (s) =>
                              s.day_of_week === day.index && s.time_slot === ts,
                          );
                          if (!slot) return null;
                          const tpl = slot.session_template_id
                            ? sessionTemplatesById.get(slot.session_template_id)
                            : null;
                          const phase = tpl ? detectPhase(tpl.title ?? tpl.name ?? "") : "force";
                          const style = PHASE_STYLES[phase] ?? PHASE_STYLES.force;
                          return (
                            <span
                              key={`${day.index}-${ts}`}
                              className={cn(
                                "h-[6px] w-[6px] rounded-full shrink-0",
                                style.dot,
                              )}
                            />
                          );
                        }),
                      )}
                    </span>
                  )}
                </div>
                {meta.notes && (
                  <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
                    {meta.notes}
                  </p>
                )}
                {hasCompetition && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {weekCompetitions.map((c) => {
                      const d = new Date(c.date.slice(0, 10) + "T00:00:00");
                      return (
                        <span
                          key={c.id}
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectCompetition(c);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.stopPropagation();
                              onSelectCompetition(c);
                            }
                          }}
                          className="inline-flex items-center gap-1 rounded-md border border-amber-300/60 bg-amber-50 dark:bg-amber-900/30 dark:border-amber-700/60 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-200 max-w-full"
                        >
                          <Trophy className="h-3 w-3 shrink-0" />
                          <span className="truncate">{c.name}</span>
                          <span className="tabular-nums text-amber-700/70 dark:text-amber-300/70 shrink-0">
                            {fmtDD_MM(d)}
                          </span>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Edit pencil (hidden in read-only mode) */}
              {!readOnly && (
                <button
                  type="button"
                  className="p-2 -m-1 rounded-lg hover:bg-muted/60 transition-colors shrink-0"
                  onClick={onStartEditMeta}
                  aria-label="Modifier la semaine"
                >
                  <Pencil className="h-3.5 w-3.5 text-muted-foreground/50" />
                </button>
              )}

              {/* Chevron */}
              <motion.span
                animate={{ rotate: isExpanded ? 180 : 0 }}
                transition={{ duration: 0.2 }}
                className="shrink-0"
              >
                <ChevronDown className="h-4 w-4 text-muted-foreground/40" />
              </motion.span>
            </button>

            {/* ── Expanded micro grid ── */}
            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: "easeInOut" }}
                  className="overflow-hidden"
                >
                  <MicroGrid
                    weekKey={week.weekKey}
                    weekMonday={week.monday}
                    findSlot={findSlot}
                    onCellTap={onCellTap}
                    getDayCompetitions={getDayCompetitions}
                    onSelectCompetition={onSelectCompetition}
                    showOverrideBadge={showOverrideBadge}
                    sessionTemplatesById={sessionTemplatesById}
                    readOnly={readOnly}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Micro Grid — 7 rows x 2 columns (Matin / Soir)
   ═══════════════════════════════════════════════════════════════════ */

function MicroGrid({
  weekKey,
  weekMonday,
  findSlot,
  onCellTap,
  getDayCompetitions,
  onSelectCompetition,
  showOverrideBadge,
  sessionTemplatesById,
  readOnly,
}: {
  weekKey: string;
  weekMonday: Date;
  findSlot: (
    weekKey: string,
    dayIndex: number,
    timeSlot: "morning" | "evening",
  ) => EffectiveStrengthSlot | undefined;
  onCellTap: (dayIndex: number, timeSlot: "morning" | "evening") => void;
  getDayCompetitions: (weekMonday: Date, dayIndex: number) => Competition[];
  onSelectCompetition: (c: Competition) => void;
  showOverrideBadge: boolean;
  sessionTemplatesById: Map<number, StrengthSessionTemplate>;
  readOnly: boolean;
}) {
  return (
    <div className="border-t bg-muted/20">
      {/* Column headers */}
      <div className="grid grid-cols-[48px_1fr_1fr] gap-1 px-3 pt-2 pb-1">
        <span />
        <span className="text-[10px] font-semibold text-muted-foreground text-center uppercase tracking-wider">
          Matin
        </span>
        <span className="text-[10px] font-semibold text-muted-foreground text-center uppercase tracking-wider">
          Soir
        </span>
      </div>

      {/* Day rows — all 7 (Lun–Dim) */}
      <div className="px-3 pb-3 space-y-1">
        {DAY_ROWS.map((day) => {
          const morning = findSlot(weekKey, day.index, "morning");
          const evening = findSlot(weekKey, day.index, "evening");
          const dayComps = getDayCompetitions(weekMonday, day.index);
          const hasComp = dayComps.length > 0;
          const emptyDay = !morning && !evening;
          const primaryComp = dayComps[0];

          return (
            <div
              key={day.index}
              className={cn(
                "grid grid-cols-[48px_1fr_1fr] gap-1 items-center rounded-lg transition-colors",
                hasComp &&
                  !emptyDay &&
                  "bg-amber-50/60 dark:bg-amber-900/15 ring-1 ring-amber-200/60 dark:ring-amber-800/40 pr-1",
              )}
            >
              <span
                className={cn(
                  "text-[11px] font-medium pl-0.5 flex items-center gap-1",
                  hasComp
                    ? "text-amber-700 dark:text-amber-300 font-semibold"
                    : "text-muted-foreground",
                )}
              >
                {hasComp && <Trophy className="h-3 w-3 shrink-0" />}
                {day.label}
              </span>

              {hasComp && emptyDay ? (
                <button
                  type="button"
                  onClick={() => onSelectCompetition(primaryComp)}
                  className="col-span-2 relative h-9 w-full rounded-lg flex items-center gap-1.5 px-2 overflow-hidden
                             bg-gradient-to-r from-amber-100 via-amber-50 to-amber-100
                             dark:from-amber-900/40 dark:via-amber-900/20 dark:to-amber-900/40
                             border border-amber-300/70 dark:border-amber-700/60
                             text-amber-900 dark:text-amber-100
                             active:scale-[0.98] transition-transform"
                  aria-label={primaryComp.name}
                >
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 opacity-[0.18]
                               bg-[repeating-linear-gradient(45deg,_transparent_0_6px,_currentColor_6px_7px)]"
                  />
                  <Trophy className="relative h-3.5 w-3.5 shrink-0" />
                  <span className="relative text-[10px] font-bold tracking-tight truncate flex-1 text-left">
                    {primaryComp.name}
                  </span>
                  {dayComps.length > 1 && (
                    <span className="relative text-[9px] font-semibold opacity-70 shrink-0">
                      +{dayComps.length - 1}
                    </span>
                  )}
                </button>
              ) : (
                <>
                  <SlotCell
                    slot={morning}
                    onTap={() => onCellTap(day.index, "morning")}
                    showOverrideBadge={showOverrideBadge}
                    sessionTemplatesById={sessionTemplatesById}
                    readOnly={readOnly}
                  />
                  <SlotCell
                    slot={evening}
                    onTap={() => onCellTap(day.index, "evening")}
                    showOverrideBadge={showOverrideBadge}
                    sessionTemplatesById={sessionTemplatesById}
                    readOnly={readOnly}
                  />
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Slot Cell — empty (dashed +) or filled (session chip)
   ═══════════════════════════════════════════════════════════════════ */

function SlotCell({
  slot,
  onTap,
  showOverrideBadge,
  sessionTemplatesById,
  readOnly,
}: {
  slot: EffectiveStrengthSlot | undefined;
  onTap: () => void;
  showOverrideBadge: boolean;
  sessionTemplatesById: Map<number, StrengthSessionTemplate>;
  readOnly: boolean;
}) {
  if (!slot) {
    if (readOnly) {
      return (
        <div
          aria-hidden
          className="h-9 w-full rounded-lg border border-dashed border-muted-foreground/15"
        />
      );
    }
    return (
      <button
        type="button"
        className="h-9 w-full rounded-lg border border-dashed border-muted-foreground/20 flex items-center justify-center hover:border-muted-foreground/40 hover:bg-muted/30 transition-colors active:scale-95"
        onClick={onTap}
        aria-label="Ajouter une séance"
      >
        <Plus className="h-3.5 w-3.5 text-muted-foreground/40" />
      </button>
    );
  }

  const tpl = slot.session_template_id
    ? sessionTemplatesById.get(slot.session_template_id)
    : null;
  const sessionName = tpl?.title ?? tpl?.name ?? null;
  const phase = sessionName ? detectPhase(sessionName) : "force";
  const style = PHASE_STYLES[phase] ?? PHASE_STYLES.force;
  const itemCount = tpl?.items?.length ?? 0;
  const overridden = slot.overridden === true && showOverrideBadge;
  // In athlete mode, inherited (non-overridden) group slots get reduced opacity
  const inheritedInAthleteMode = showOverrideBadge && !overridden;

  // Strip common day prefix (e.g. "Lun — Force haut" → "Force haut")
  const displayName = sessionName
    ? sessionName.replace(/^[A-Za-z]{3,4}\s*[—–-]\s*/u, "").slice(0, 16)
    : "Séance";

  if (readOnly) {
    return (
      <div
        className={cn(
          "relative h-9 w-full rounded-lg flex items-center gap-1.5 px-1.5 transition-colors overflow-hidden",
          style.bg,
          overridden && "ring-2 ring-dashed ring-primary/50",
          inheritedInAthleteMode && "opacity-70",
        )}
        aria-label={`${sessionName ?? "Séance"}${overridden ? " (séance individuelle)" : ""}`}
      >
        <span
          className={cn("h-2 w-2 rounded-full shrink-0", style.dot)}
        />
        <span
          className={cn(
            "text-[10px] font-semibold truncate leading-tight flex-1",
            style.text,
          )}
        >
          {displayName}
        </span>
        {itemCount > 0 && (
          <span
            className={cn(
              "text-[9px] font-semibold shrink-0 opacity-70",
              style.text,
            )}
          >
            {itemCount}ex
          </span>
        )}
        {overridden && (
          <User
            aria-label="Séance individuelle"
            className="absolute top-0.5 right-0.5 h-3 w-3 text-primary bg-background rounded-full p-[1px] ring-1 ring-primary/50"
          />
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      className={cn(
        "relative h-9 w-full rounded-lg flex items-center gap-1.5 px-1.5 transition-all active:scale-[0.97] overflow-hidden",
        style.bg,
        overridden && "ring-2 ring-dashed ring-primary/50",
        inheritedInAthleteMode && "opacity-70",
      )}
      onClick={onTap}
      aria-label={`Modifier : ${sessionName ?? "Séance"}${overridden ? " (séance individuelle)" : ""}`}
    >
      <span
        className={cn("h-2 w-2 rounded-full shrink-0", style.dot)}
      />
      <span
        className={cn(
          "text-[10px] font-semibold truncate leading-tight flex-1 text-left",
          style.text,
        )}
      >
        {displayName}
      </span>
      {itemCount > 0 && (
        <span
          className={cn(
            "text-[9px] font-semibold shrink-0 opacity-70",
            style.text,
          )}
        >
          {itemCount}ex
        </span>
      )}
      {overridden && (
        <User
          aria-label="Séance individuelle"
          className="absolute top-0.5 right-0.5 h-3 w-3 text-primary bg-background rounded-full p-[1px] ring-1 ring-primary/50"
        />
      )}
    </button>
  );
}
