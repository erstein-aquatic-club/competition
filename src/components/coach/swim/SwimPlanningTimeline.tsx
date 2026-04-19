/**
 * SwimPlanningTimeline.tsx — Presentational timeline of weeks for swim planning.
 *
 * Extracted from SwimPlanningDemo.tsx as a mechanical refactor (Task 5 of the
 * individual swim planning plan). The timeline renders:
 *   - vertical rail + loading skeleton
 *   - WeekCard per ISO week (collapsed header + expanded micro-grid)
 *   - in-line edit of week meta (type + notes)
 *   - filière chips + session link buttons per cell
 *   - competition chips (week-level + day-level)
 *   - sentinel ref for infinite scroll
 *
 * Stateless — all state (expanded week, editing meta, callbacks, data) comes
 * from props. Used by both SwimPlanningDemo (mode="group") and future
 * SwimmerPlanningPanel (mode="athlete", showOverrideBadge=true).
 */
import { useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Competition } from "@/lib/api/types";
import type { EffectiveSlot } from "@/lib/swimPlanningMerge";
import { FILIERE_MAP, FILIERE_STYLES } from "@/lib/swimFilieres";
import { weekTypeColor, weekTypeTextColor } from "@/lib/weekTypeColor";
import { cn } from "@/lib/utils";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Check,
  ChevronDown,
  Link2,
  Pencil,
  Plus,
  Trophy,
  X,
} from "lucide-react";

import {
  DAY_ROWS,
  fmtDD_MM,
  isCurrentWeek,
  type WeekInfo,
} from "./swimPlanningShared";

/* ═══════════════════════════════════════════════════════════════════
   Props
   ═══════════════════════════════════════════════════════════════════ */

export interface SwimPlanningTimelineProps {
  mode: "group" | "athlete";
  weeks: WeekInfo[];
  slotsByWeek: Map<string, EffectiveSlot[]>;
  competitionsByWeek: Map<string, Competition[]>;
  expandedWeekKey: string | null;
  onToggleWeek: (weekKey: string) => void;
  getWeekMeta: (weekKey: string) => {
    weekType?: string;
    notes?: string;
    source?: "group" | "athlete" | "none";
  };
  editingWeekKey: string | null;
  editWeekType: string;
  editWeekNotes: string;
  existingWeekTypes: string[];
  onStartEditMeta: (weekKey: string, e: React.MouseEvent) => void;
  onSaveMeta: () => void;
  onCancelEditMeta: () => void;
  onEditTypeChange: (v: string) => void;
  onEditNotesChange: (v: string) => void;
  onSlotClick: (
    weekKey: string,
    dayIndex: number,
    timeSlot: "morning" | "evening",
    slot?: EffectiveSlot,
  ) => void;
  onSessionPickerClick?: (
    weekKey: string,
    dayIndex: number,
    timeSlot: "morning" | "evening",
    currentSessionId?: string | null,
  ) => void;
  onCompetitionClick?: (c: Competition) => void;
  getDayCompetitions: (weekMonday: Date, dayIndex: number) => Competition[];
  sessionNameMap: Map<string, string>;
  sentinelRef?: React.RefObject<HTMLDivElement | null>;
  readOnly?: boolean;
  showOverrideBadge?: boolean;
  isLoading?: boolean;
  isEmpty?: boolean;
}

/* ═══════════════════════════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════════════════════════ */

export default function SwimPlanningTimeline(props: SwimPlanningTimelineProps) {
  const {
    mode,
    weeks,
    slotsByWeek,
    competitionsByWeek,
    expandedWeekKey,
    onToggleWeek,
    getWeekMeta,
    editingWeekKey,
    editWeekType,
    editWeekNotes,
    existingWeekTypes,
    onStartEditMeta,
    onSaveMeta,
    onCancelEditMeta,
    onEditTypeChange,
    onEditNotesChange,
    onSlotClick,
    onSessionPickerClick,
    onCompetitionClick,
    getDayCompetitions,
    sentinelRef,
    isLoading = false,
    isEmpty = false,
  } = props;

  const showOverrideBadge = props.showOverrideBadge ?? mode === "athlete";

  const findSlot = useCallback(
    (
      weekKey: string,
      dayIndex: number,
      timeSlot: "morning" | "evening",
    ): EffectiveSlot | undefined => {
      const weekSlots = slotsByWeek.get(weekKey);
      if (!weekSlots) return undefined;
      return weekSlots.find(
        (s) => s.day_of_week === dayIndex && s.time_slot === timeSlot,
      );
    },
    [slotsByWeek],
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
          const meta = getWeekMeta(week.weekKey);
          const weekSlots = slotsByWeek.get(week.weekKey) ?? [];
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
              onSelectCompetition={(c) => onCompetitionClick?.(c)}
              editWeekType={editWeekType}
              setEditWeekType={onEditTypeChange}
              editWeekNotes={editWeekNotes}
              setEditWeekNotes={onEditNotesChange}
              existingWeekTypes={existingWeekTypes}
              onToggleExpand={() => onToggleWeek(week.weekKey)}
              onStartEditMeta={(e) => onStartEditMeta(week.weekKey, e)}
              onSaveMeta={onSaveMeta}
              onCancelEditMeta={onCancelEditMeta}
              findSlot={findSlot}
              onCellTap={(dayIndex, timeSlot) => {
                const existing = findSlot(week.weekKey, dayIndex, timeSlot);
                onSlotClick(week.weekKey, dayIndex, timeSlot, existing);
              }}
              onLinkTap={(dayIndex, timeSlot) => {
                const existing = findSlot(week.weekKey, dayIndex, timeSlot);
                if (!existing) return;
                onSessionPickerClick?.(
                  week.weekKey,
                  dayIndex,
                  timeSlot,
                  existing.session_id,
                );
              }}
              showOverrideBadge={showOverrideBadge}
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
  meta: { weekType?: string; notes?: string; source?: "group" | "athlete" | "none" };
  filledCount: number;
  weekSlots: EffectiveSlot[];
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
  ) => EffectiveSlot | undefined;
  onCellTap: (dayIndex: number, timeSlot: "morning" | "evening") => void;
  onLinkTap: (dayIndex: number, timeSlot: "morning" | "evening") => void;
  showOverrideBadge: boolean;
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
  onLinkTap,
  showOverrideBadge,
}: WeekCardProps) {
  const hasCompetition = weekCompetitions.length > 0;
  const datalistId = `wt-${week.weekKey}`;

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
                placeholder="Ex : Foncier, Affutage..."
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
                  {meta.weekType && (
                    <Badge
                      className="text-[10px] px-1.5 py-0 border-0 shrink-0"
                      style={{
                        backgroundColor: weekTypeColor(meta.weekType),
                        color: weekTypeTextColor(meta.weekType),
                      }}
                    >
                      {meta.weekType}
                    </Badge>
                  )}
                  {filledCount > 0 && (
                    <span className="inline-flex items-center gap-[3px] shrink-0">
                      {/* Mini-dots: ordered Lun matin, Lun soir, Mar matin... */}
                      {DAY_ROWS.flatMap((day) =>
                        (["morning", "evening"] as const).map((ts) => {
                          const slot = weekSlots.find(
                            (s) => s.day_of_week === day.index && s.time_slot === ts,
                          );
                          if (!slot) return null;
                          const f = FILIERE_MAP.get(slot.filiere);
                          const style = FILIERE_STYLES[f?.color ?? "sky"] ?? FILIERE_STYLES.sky;
                          return (
                            <span
                              key={`${day.index}-${ts}`}
                              className={cn("h-[6px] w-[6px] rounded-full shrink-0", style.dot)}
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

              {/* Edit pencil */}
              <button
                type="button"
                className="p-2 -m-1 rounded-lg hover:bg-muted/60 transition-colors shrink-0"
                onClick={onStartEditMeta}
                aria-label="Modifier la semaine"
              >
                <Pencil className="h-3.5 w-3.5 text-muted-foreground/50" />
              </button>

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
                    onLinkTap={onLinkTap}
                    getDayCompetitions={getDayCompetitions}
                    onSelectCompetition={onSelectCompetition}
                    showOverrideBadge={showOverrideBadge}
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
   Micro Grid — 6 rows x 2 columns (Matin / Soir)
   ═══════════════════════════════════════════════════════════════════ */

function MicroGrid({
  weekKey,
  weekMonday,
  findSlot,
  onCellTap,
  onLinkTap,
  getDayCompetitions,
  onSelectCompetition,
  showOverrideBadge,
}: {
  weekKey: string;
  weekMonday: Date;
  findSlot: (
    weekKey: string,
    dayIndex: number,
    timeSlot: "morning" | "evening",
  ) => EffectiveSlot | undefined;
  onCellTap: (dayIndex: number, timeSlot: "morning" | "evening") => void;
  onLinkTap: (dayIndex: number, timeSlot: "morning" | "evening") => void;
  getDayCompetitions: (weekMonday: Date, dayIndex: number) => Competition[];
  onSelectCompetition: (c: Competition) => void;
  showOverrideBadge: boolean;
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

      {/* Day rows */}
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
                    onLinkTap={() => onLinkTap(day.index, "morning")}
                    showOverrideBadge={showOverrideBadge}
                  />
                  <SlotCell
                    slot={evening}
                    onTap={() => onCellTap(day.index, "evening")}
                    onLinkTap={() => onLinkTap(day.index, "evening")}
                    showOverrideBadge={showOverrideBadge}
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
   Slot Cell — empty (dashed +) or filled (colored chip)
   ═══════════════════════════════════════════════════════════════════ */

function SlotCell({
  slot,
  onTap,
  onLinkTap,
  showOverrideBadge,
}: {
  slot: EffectiveSlot | undefined;
  onTap: () => void;
  onLinkTap: () => void;
  showOverrideBadge: boolean;
}) {
  if (!slot) {
    return (
      <button
        type="button"
        className="h-9 w-full rounded-lg border border-dashed border-muted-foreground/20 flex items-center justify-center hover:border-muted-foreground/40 hover:bg-muted/30 transition-colors active:scale-95"
        onClick={onTap}
        aria-label="Ajouter une filiere"
      >
        <Plus className="h-3.5 w-3.5 text-muted-foreground/40" />
      </button>
    );
  }

  const filiere = FILIERE_MAP.get(slot.filiere);
  const color = filiere?.color ?? "sky";
  const style = FILIERE_STYLES[color] ?? FILIERE_STYLES.sky;
  const hasSession = !!slot.session_id;
  const overridden = slot.overridden === true && showOverrideBadge;

  return (
    <div className="flex items-center gap-0.5 h-9 w-full">
      {/* Filière chip — tap to change filière */}
      <button
        type="button"
        className={cn(
          "h-full flex-1 min-w-0 rounded-l-lg flex items-center justify-center px-1.5 transition-all active:scale-[0.97]",
          style.bg,
          overridden && "ring-2 ring-dashed ring-primary/50",
        )}
        onClick={onTap}
        aria-label={`Modifier: ${filiere?.short ?? slot.filiere}`}
      >
        <span className={cn("text-[10px] font-semibold truncate leading-tight", style.text)}>
          {filiere?.short ?? slot.filiere}
        </span>
      </button>

      {/* Link session button */}
      <button
        type="button"
        className={cn(
          "h-full w-7 shrink-0 rounded-r-lg flex items-center justify-center transition-all active:scale-[0.93]",
          hasSession
            ? cn(style.bg, "border-l border-white/20 dark:border-black/10")
            : "bg-muted/40 border border-dashed border-muted-foreground/15 hover:border-muted-foreground/30",
        )}
        onClick={(e) => {
          e.stopPropagation();
          onLinkTap();
        }}
        aria-label={hasSession ? "Modifier la séance liée" : "Lier une séance"}
      >
        <Link2
          className={cn(
            "h-3 w-3",
            hasSession
              ? cn(style.text, "opacity-80")
              : "text-muted-foreground/35",
          )}
        />
      </button>
    </div>
  );
}
