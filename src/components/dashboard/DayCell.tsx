import React, { memo } from "react";
import { Moon, Trophy } from "lucide-react";

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
  const slotPillTone = (slot?: SlotStatus) => {
    if (!slot?.expected) return "hidden";
    if (slot.completed) return "bg-status-success";
    if (slot.absent) return "bg-muted-foreground/15";
    return "bg-muted-foreground/30";
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
          <div className={cn("text-[12px] font-semibold", hasAbsence ? "text-muted-foreground" : "text-foreground")}>{date.getDate()}</div>
          {hasCompetition ? (
            <Trophy className="h-3 w-3 text-amber-500" />
          ) : (
            <div className="h-[14px] w-[14px]" />
          )}
        </div>

        <div className="flex items-center justify-end gap-1">
          {hasCompetition ? null : isRest && !strengthAssigned ? (
            <Moon className="h-3 w-3 text-muted-foreground/40" />
          ) : (
            <>
              <div className="flex items-center gap-1">
                {expectedSlots.length > 0 ? (
                  expectedSlots.map((slot, i) => (
                    <span
                      key={i}
                      className={cn(
                        "inline-flex h-2 w-3 rounded-full",
                        slotPillTone(slot),
                      )}
                    />
                  ))
                ) : (
                  <>
                    <span className={cn("inline-flex h-2 w-3 rounded-full", slotPillTone(amSlot))} />
                    <span className={cn("inline-flex h-2 w-3 rounded-full", slotPillTone(pmSlot))} />
                  </>
                )}
              </div>
              {strengthAssigned ? (
                <span className="h-1.5 w-1.5 rounded-full bg-orange-400 shrink-0" />
              ) : null}
            </>
          )}
        </div>
      </div>
    </button>
  );
});
