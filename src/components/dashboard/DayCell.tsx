import React, { memo } from "react";
import { Dumbbell, Moon, Sun, Trophy } from "lucide-react";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function toISODate(d: Date) {
  const pad2 = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

type SlotStatus = { slotKey: "AM" | "PM"; expected: boolean; completed: boolean; absent: boolean; slotTime?: string };

interface DayCellProps {
  date: Date;
  inMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  isFocused: boolean;
  status: { completed: number; total: number; slots: SlotStatus[] };
  strengthAssigned?: boolean;
  hasCompetition?: boolean;
  hasAbsence?: boolean;
  onClick: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}

export const DayCell = memo(function DayCell({
  date,
  inMonth,
  isToday,
  isSelected,
  isFocused,
  status,
  strengthAssigned,
  hasCompetition,
  hasAbsence,
  onClick,
  onKeyDown,
}: DayCellProps) {
  const { total, slots } = status;
  const isRest = total === 0;
  const expectedSlots = slots.filter((s) => s.expected);
  const allAbsent = expectedSlots.length > 0 && expectedSlots.every((s) => s.absent);
  const allDone = total > 0 && status.completed === total && !allAbsent;
  const bg = hasAbsence
    ? "bg-muted-foreground/15 dark:bg-muted-foreground/25"
    : hasCompetition
    ? "bg-amber-50 dark:bg-amber-950/30"
    : isRest ? "bg-muted/30" : allDone ? "bg-status-success/10" : "bg-card";
  const border = hasAbsence
    ? "border-muted-foreground/20"
    : hasCompetition ? "border-amber-200 dark:border-amber-900/40" : "border-border";

  const ring = isSelected ? "ring-2 ring-primary/30" : "";
  const todayRing = isToday && !isSelected ? "ring-2 ring-primary/50" : "";
  const focusRing = isFocused ? "ring-2 ring-primary" : "";
  /**
   * Returns the pill background AND glyph color for a slot status, picked
   * so the inner Sun/Moon icon stays readable in both light and dark modes.
   *
   * Why per-tone colors instead of a global `text-foreground/70`:
   *   - `--status-success` is hsl(142 71% 45%) in light but hsl(142 55% 50%)
   *     in dark — bright enough that a 70% white glyph fades. Force
   *     `text-white` on success keeps Sun/Moon legible on the green pill in
   *     both themes.
   *   - `bg-muted-foreground/30` (in-progress) sits on a low-saturation
   *     fond — `text-foreground` (true black/white per theme) gives the
   *     strongest contrast.
   *   - `bg-muted-foreground/15` (absent) is intentionally washed out;
   *     `text-muted-foreground` keeps the glyph dimmed to match the
   *     "this slot was skipped" semantics without being unreadable.
   */
  const slotPillTone = (slot?: SlotStatus): { bg: string; glyph: string } | null => {
    if (!slot?.expected) return null;
    if (slot.completed) return { bg: "bg-status-success", glyph: "text-white" };
    if (slot.absent) return { bg: "bg-muted-foreground/15", glyph: "text-muted-foreground" };
    return { bg: "bg-muted-foreground/30", glyph: "text-foreground" };
  };

  const amSlot = slots.find((s) => s.slotKey === "AM");
  const pmSlot = slots.find((s) => s.slotKey === "PM");

  return (
    <button
      type="button"
      onClick={onClick}
      onKeyDown={onKeyDown}
      tabIndex={isFocused ? 0 : -1}
      data-calendar-cell="true"
      className={cn(
        "aspect-square min-w-0 rounded-2xl border p-1 transition",
        bg,
        border,
        !inMonth && "opacity-40",
        "hover:shadow-sm focus:outline-none",
        ring,
        todayRing,
        focusRing
      )}
      aria-label={`${toISODate(date)} — ${isRest ? "Repos" : `${status.completed}/${total}`}`}
    >
      <div className="flex h-full flex-col justify-between">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-1">
            <div className={cn("text-[12px] font-semibold", hasAbsence ? "text-muted-foreground" : "text-foreground")}>{date.getDate()}</div>
            {/* Strength session indicator. Trophy (competition) takes the
                top-right slot; the dumbbell sits next to the date number on
                the top-left. We never show muscu on a competition day in
                practice, but if it ever happens the Trophy still wins
                visually as agreed. */}
            {strengthAssigned && !hasCompetition ? (
              <Dumbbell
                className="h-3 w-3 text-orange-500 shrink-0"
                aria-label="Séance musculation prévue"
              />
            ) : null}
          </div>
          {hasCompetition ? (
            <Trophy className="h-3 w-3 text-amber-500" />
          ) : (
            <div className="h-[14px] w-[14px]" />
          )}
        </div>

        <div className="flex items-center justify-end gap-1">
          {hasCompetition ? null : isRest && !strengthAssigned ? (
            // "Real" rest day: no swim, no muscu. Soft moon hints there's
            // genuinely nothing planned (kept distinct from the PM-pill moon
            // below, which is solid + colored to encode completion status).
            <Moon className="h-3 w-3 text-muted-foreground/40" />
          ) : (
            <>
              <div className="flex items-center gap-1">
                {expectedSlots.length > 0
                  ? expectedSlots.map((slot, i) => (
                      <SlotPill key={i} slot={slot} variant={slotPillTone(slot)} />
                    ))
                  : (
                    <>
                      <SlotPill slot={amSlot} variant={slotPillTone(amSlot)} />
                      <SlotPill slot={pmSlot} variant={slotPillTone(pmSlot)} />
                    </>
                  )}
              </div>
            </>
          )}
        </div>
      </div>
    </button>
  );
});

/**
 * A single AM/PM pill: keeps the tri-tone background (success/in-progress/
 * absent) for at-a-glance status scanning, and adds a tiny Sun/Moon glyph
 * inside so a swimmer who doesn't know the convention can still tell which
 * slot is which without a legend.
 *
 * Hidden when `variant === null` (slot not expected) — the SlotStatus
 * already encodes that case via slotPillTone().
 */
function SlotPill({
  slot,
  variant,
}: {
  slot: SlotStatus | undefined;
  variant: { bg: string; glyph: string } | null;
}) {
  if (!variant) return null;
  // strokeWidth 3 (vs lucide's default 2) keeps the glyph readable at 8px
  // on retina mobile screens, especially over the muted-foreground/30 pill
  // where stroke 2 disappeared after the icon was reduced from 12×8 plain
  // to 14×14 with inner Sun/Moon.
  const Icon = slot?.slotKey === "PM" ? Moon : Sun;
  return (
    <span
      className={cn(
        "inline-flex h-3.5 w-3.5 items-center justify-center rounded-full",
        variant.bg,
      )}
    >
      <Icon className={cn("h-2 w-2", variant.glyph)} strokeWidth={3} />
    </span>
  );
}
