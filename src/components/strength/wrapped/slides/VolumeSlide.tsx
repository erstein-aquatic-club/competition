import { motion } from "framer-motion";
import { Layers } from "lucide-react";
import type { VolumeStats } from "@/lib/strength/wrappedStats";
import { CountUp } from "../CountUp";
import { SlideShell, SlideKicker } from "./slideChrome";

/**
 * Slide volume : tonnage cumulé en gros count-up + 3 sous-stats (séances, séries, reps).
 * NB confidentialité : le tonnage d'ENTRAÎNEMENT cumulé n'est pas du poids de corps → OK.
 */
export function VolumeSlide({ volume }: { volume: VolumeStats }) {
  return (
    <SlideShell kind="volume" className="gap-6">
      <motion.div
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 14 }}
        className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25"
      >
        <Layers className="h-7 w-7 text-[#ffb3ee]" />
      </motion.div>

      <SlideKicker>Tu as soulevé</SlideKicker>

      <motion.div
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.2, type: "spring", stiffness: 140, damping: 16 }}
        className="leading-none"
      >
        <CountUp
          value={volume.totalTonnageKg}
          durationMs={1900}
          className="heading-display block text-7xl text-[#ffb3ee] sm:text-8xl"
        />
        <span className="heading-display mt-1 block text-2xl text-white/80">kg au total</span>
      </motion.div>

      <motion.div
        initial={{ y: 18, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.55 }}
        className="grid grid-cols-3 gap-3"
      >
        <MiniStat value={volume.sessions} label="séances" />
        <MiniStat value={volume.totalSets} label="séries" />
        <MiniStat value={volume.totalReps} label="reps" />
      </motion.div>
    </SlideShell>
  );
}

function MiniStat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-2xl bg-white/10 px-3 py-4 text-center ring-1 ring-white/15 backdrop-blur-sm">
      <CountUp
        value={value}
        durationMs={1300}
        className="heading-display block text-3xl not-italic text-white"
      />
      <span className="mt-1 block text-xs uppercase tracking-wider text-white/65">{label}</span>
    </div>
  );
}
