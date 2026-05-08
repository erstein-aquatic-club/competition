import React from "react";
import { CalendarHeader } from "./CalendarHeader";
import { CalendarGrid } from "./CalendarGrid";

interface DashboardCalendarProps {
  monthCursor: Date;
  selectedDayStatus: { completed: number; total: number; slots: Array<{ slotKey: "AM" | "PM"; expected: boolean; completed: boolean; absent: boolean; slotTime?: string }> };
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onJumpToday: () => void;
  gridDates: Date[];
  completionByISO: Record<string, { completed: number; total: number; slots: Array<{ slotKey: "AM" | "PM"; expected: boolean; completed: boolean; absent: boolean; slotTime?: string }> }>;
  strengthByISO?: Record<string, boolean>;
  competitionDates?: Set<string>;
  absenceDates?: Set<string>;
  selectedISO: string;
  selectedDayIndex: number | null;
  today: Date;
  onDayClick: (iso: string) => void;
  onKeyDown: (e: React.KeyboardEvent, index: number) => void;
}

/**
 * §216 — Wrapper React.memo de CalendarHeader + CalendarGrid.
 * Isole le calendrier des re-renders d'écriture (saveState/draftState/
 * alternativeOverride) qui vivent maintenant dans DashboardFeedbackContainer.
 */
export const DashboardCalendar = React.memo(function DashboardCalendar({
  monthCursor,
  selectedDayStatus,
  onPrevMonth,
  onNextMonth,
  onJumpToday,
  gridDates,
  completionByISO,
  strengthByISO,
  competitionDates,
  absenceDates,
  selectedISO,
  selectedDayIndex,
  today,
  onDayClick,
  onKeyDown,
}: DashboardCalendarProps) {
  return (
    <div className="mt-3 rounded-3xl border border-border bg-card overflow-hidden">
      <CalendarHeader
        monthCursor={monthCursor}
        selectedDayStatus={selectedDayStatus}
        onPrevMonth={onPrevMonth}
        onNextMonth={onNextMonth}
        onJumpToday={onJumpToday}
      />
      <CalendarGrid
        monthCursor={monthCursor}
        gridDates={gridDates}
        completionByISO={completionByISO}
        strengthByISO={strengthByISO}
        competitionDates={competitionDates}
        absenceDates={absenceDates}
        selectedISO={selectedISO}
        selectedDayIndex={selectedDayIndex}
        today={today}
        onDayClick={onDayClick}
        onKeyDown={onKeyDown}
      />
    </div>
  );
});
