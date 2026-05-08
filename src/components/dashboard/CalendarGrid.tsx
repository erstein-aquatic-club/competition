import React from "react";
import { DayCell } from "./DayCell";

const WEEKDAYS_FR_SHORT = ["Lu", "Ma", "Me", "Je", "Ve", "Sa", "Di"]; // mobile
const WEEKDAYS_FR = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"]; // desktop

function toISODate(d: Date) {
  const pad2 = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

interface CalendarGridProps {
  monthCursor: Date;
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

export function CalendarGrid({
  monthCursor,
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
}: CalendarGridProps) {
  return (
    <div className="p-3 sm:p-5">
      <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {WEEKDAYS_FR_SHORT.map((wd, idx) => (
          <div key={wd + idx} className="px-0.5 pb-1 text-[10px] font-semibold text-muted-foreground text-center">
            <span className="sm:hidden">{wd}</span>
            <span className="hidden sm:inline">{WEEKDAYS_FR[idx]}</span>
          </div>
        ))}

        {gridDates.map((d, index) => {
          const iso = toISODate(d);
          const inMonth = d.getMonth() === monthCursor.getMonth();
          const isSel = iso === selectedISO;
          const status = completionByISO[iso] || { completed: 0, total: 2, slots: [{ slotKey: "AM" as const, expected: true, completed: false, absent: false }, { slotKey: "PM" as const, expected: true, completed: false, absent: false }] };
          const isToday = isSameDay(d, today);
          const isFocused = selectedDayIndex === index || (selectedDayIndex === null && isToday);
          return (
            <DayCell
              key={iso}
              date={d}
              iso={iso}
              index={index}
              inMonth={inMonth}
              isToday={isToday}
              isSelected={isSel}
              isFocused={isFocused}
              status={status}
              strengthAssigned={strengthByISO?.[iso]}
              hasCompetition={competitionDates?.has(iso)}
              hasAbsence={absenceDates?.has(iso)}
              onClick={onDayClick}
              onKeyDown={onKeyDown}
            />
          );
        })}
      </div>
    </div>
  );
}
