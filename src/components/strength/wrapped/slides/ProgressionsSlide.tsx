import { motion } from "framer-motion";
import { Medal } from "lucide-react";
import type { ProgressionItem } from "@/lib/strength/wrappedStats";
import { CountUp } from "../CountUp";
import { SlideShell, SlideKicker } from "./slideChrome";

const MEDAL_TINTS = ["text-[#ffd24a]", "text-[#e6e6f0]", "text-[#ffb487]"];

/** Slide podium : top 3 progressions (Δ% 1RM), animées de la 3e à la 1re place. */
export function ProgressionsSlide({ progressions }: { progressions: ProgressionItem[] }) {
  return (
    <SlideShell kind="progressions" className="gap-7">
      <motion.div
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 14 }}
        className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25"
      >
        <Medal className="h-7 w-7 text-[#ffd0bc]" />
      </motion.div>

      <div>
        <SlideKicker>Tes plus grosses progressions</SlideKicker>
        <motion.h2
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 130, damping: 16 }}
          className="heading-display mt-2 text-4xl leading-[0.95] sm:text-5xl"
        >
          Le podium
        </motion.h2>
      </div>

      <div className="flex flex-col gap-3">
        {progressions.map((p, i) => (
          <motion.div
            key={p.exerciseId}
            initial={{ x: -32, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.3 + i * 0.16, type: "spring", stiffness: 170, damping: 18 }}
            className="flex items-center gap-4 rounded-2xl bg-white/10 px-4 py-3 ring-1 ring-white/15 backdrop-blur-sm"
          >
            <span className={`heading-display text-3xl not-italic ${MEDAL_TINTS[i] ?? "text-white"}`}>
              {i + 1}
            </span>
            <span className="min-w-0 flex-1 truncate text-lg font-semibold text-white">
              {p.exerciseName}
            </span>
            <span className="heading-display text-2xl text-[#ffd0bc]">
              <CountUp value={p.deltaPct} prefix="+" suffix="%" durationMs={1100} />
            </span>
          </motion.div>
        ))}
      </div>
    </SlideShell>
  );
}
