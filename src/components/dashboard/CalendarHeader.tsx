import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function monthLabelFR(d: Date) {
  return d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

interface IconButtonProps {
  onClick: (e: React.MouseEvent) => void;
  label: string;
  children: React.ReactNode;
  tone?: "neutral" | "dark" | "sky";
  disabled?: boolean;
}

function IconButton({ onClick, label, children, tone = "neutral", disabled }: IconButtonProps) {
  const tones = {
    neutral: "bg-background border-border text-foreground hover:bg-muted",
    dark: "bg-foreground border-foreground text-background hover:opacity-90",
    sky: "bg-primary/10 border-primary/30 text-primary hover:bg-primary/20",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center justify-center rounded-2xl border p-2 transition",
        tones[tone],
        disabled && "opacity-50 cursor-not-allowed hover:bg-background"
      )}
      aria-label={label}
      title={label}
    >
      {children}
      <span className="sr-only">{label}</span>
    </button>
  );
}

interface CalendarHeaderProps {
  monthCursor: Date;
  selectedDayStatus: { completed: number; total: number; slots: Array<{ slotKey: "AM" | "PM"; expected: boolean; completed: boolean; absent: boolean }> };
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onJumpToday: () => void;
}

export function CalendarHeader({ monthCursor, selectedDayStatus, onPrevMonth, onNextMonth, onJumpToday }: CalendarHeaderProps) {
  const expectedCount = selectedDayStatus.slots.filter((slot) => slot.expected).length;
  const completedCount = selectedDayStatus.slots.filter((slot) => slot.expected && slot.completed).length;
  const absentCount = selectedDayStatus.slots.filter((slot) => slot.expected && slot.absent).length;
  const summaryLabel =
    expectedCount === 0
      ? "repos"
      : absentCount === expectedCount
        ? "absent"
        : `${completedCount}/${expectedCount} fait`;

  return (
    <div className="flex items-center justify-between px-3 sm:px-5 py-3 border-b border-border">
      <div className="flex items-center gap-1">
        <IconButton onClick={onPrevMonth} label="Mois précédent">
          <ChevronLeft className="h-5 w-5" />
        </IconButton>
        <IconButton onClick={onNextMonth} label="Mois suivant">
          <ChevronRight className="h-5 w-5" />
        </IconButton>
      </div>

      <div className="min-w-0 text-center">
        <div className="text-base font-semibold text-foreground capitalize truncate">{monthLabelFR(monthCursor)}</div>
        <div className="mt-1 text-[10px] font-semibold uppercase tracking-eyebrow-sm text-muted-foreground">
          {summaryLabel}
        </div>
      </div>

      <button
        type="button"
        onClick={onJumpToday}
        className="rounded-2xl border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground transition hover:bg-muted"
        aria-label="Aller à aujourd'hui"
      >
        Aujourd&apos;hui
      </button>
    </div>
  );
}
