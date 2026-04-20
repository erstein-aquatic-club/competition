import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, ChevronRight, Dumbbell } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WeekSession } from "@/lib/strength/strengthPlanWeeks";

interface MyPlanSessionRowProps {
  weekSession: WeekSession;
  checked: boolean;
  onToggleCheck: (e: React.MouseEvent) => void;
  onSelect: () => void;
}

const DAY_COLORS: Record<string, string> = {
  Lun: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  Mar: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  Mer: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  Jeu: "bg-violet-500/15 text-violet-700 dark:text-violet-400",
  Ven: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  Sam: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
  Dim: "bg-gray-500/15 text-gray-600 dark:text-gray-400",
};

export function MyPlanSessionRow({
  weekSession,
  checked,
  onToggleCheck,
  onSelect,
}: MyPlanSessionRowProps) {
  const { session, dayLabel, cleanTitle } = weekSession;
  const itemCount = session.items?.length ?? 0;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full flex items-center gap-2 h-10 px-2.5 rounded-lg bg-card border border-border/50 active:scale-[0.99] transition-transform",
        checked && "opacity-55",
      )}
    >
      {/* Check circle */}
      <span
        role="button"
        tabIndex={0}
        onClick={onToggleCheck}
        onKeyDown={(e) => e.key === "Enter" && onToggleCheck(e as unknown as React.MouseEvent)}
        className="relative flex items-center justify-center shrink-0 h-5 w-5 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={checked ? "Marquer non fait" : "Marquer fait"}
      >
        <AnimatePresence mode="wait">
          {checked ? (
            <motion.span
              key="checked"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 25 }}
              className="flex items-center justify-center h-5 w-5 rounded-full bg-emerald-500"
            >
              <Check className="h-3 w-3 text-white" strokeWidth={3} />
            </motion.span>
          ) : (
            <motion.span
              key="unchecked"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="h-5 w-5 rounded-full border-2 border-muted-foreground/25"
            />
          )}
        </AnimatePresence>
      </span>

      {/* Day badge or dumbbell icon */}
      {dayLabel ? (
        <span
          className={cn(
            "inline-flex items-center justify-center rounded-md px-1.5 py-0.5 text-[10px] font-bold shrink-0 min-w-[32px]",
            DAY_COLORS[dayLabel] ?? "bg-muted text-muted-foreground",
          )}
        >
          {dayLabel}
        </span>
      ) : (
        <Dumbbell className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      )}

      <span className="text-[12px] font-medium truncate flex-1">{cleanTitle}</span>

      <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
        {itemCount} ex.
      </span>

      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
    </button>
  );
}
