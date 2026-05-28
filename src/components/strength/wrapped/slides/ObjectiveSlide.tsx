import { motion } from "framer-motion";
import { Target, CalendarDays, Repeat } from "lucide-react";
import type { ObjectiveInfo } from "@/lib/strength/wrappedStats";
import { SlideShell, SlideKicker } from "./slideChrome";

/** Slide objectif : titre du plan, focus (si présent), durée, fréquence. */
export function ObjectiveSlide({ objective }: { objective: ObjectiveInfo }) {
  return (
    <SlideShell kind="objective" className="gap-7">
      <motion.div
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 14, delay: 0.05 }}
        className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25"
      >
        <Target className="h-7 w-7 text-[#7df0ff]" />
      </motion.div>

      <div>
        <motion.div
          initial={{ y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <SlideKicker>Ton cap</SlideKicker>
        </motion.div>
        <motion.h2
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3, type: "spring", stiffness: 130, damping: 16 }}
          className="heading-display mt-2 text-4xl leading-[0.95] sm:text-5xl"
        >
          {objective.title}
        </motion.h2>
        {objective.focusLabel && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="mt-3 text-lg font-medium text-[#7df0ff]"
          >
            Focus · {objective.focusLabel}
          </motion.p>
        )}
      </div>

      <motion.div
        initial={{ y: 16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="flex flex-wrap gap-3"
      >
        <Stat icon={<CalendarDays className="h-4 w-4" />} value={objective.weeks} label="semaines" />
        <Stat
          icon={<Repeat className="h-4 w-4" />}
          value={objective.sessionsPerWeek}
          label="séances / sem"
        />
      </motion.div>
    </SlideShell>
  );
}

function Stat({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white/10 px-4 py-3 ring-1 ring-white/15 backdrop-blur-sm">
      <span className="text-[#7df0ff]">{icon}</span>
      <span className="heading-display text-2xl not-italic">{value}</span>
      <span className="text-sm text-white/70">{label}</span>
    </div>
  );
}
