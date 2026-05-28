import { motion } from "framer-motion";
import { Heart } from "lucide-react";
import { SlideShell, SlideKicker } from "./slideChrome";

/** Slide stat fun : l'exo le plus pratiqué = "ton exo fétiche". */
export function FunStatSlide({ topExerciseName }: { topExerciseName: string }) {
  return (
    <SlideShell kind="funstat" className="gap-7">
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 220, damping: 12 }}
        className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25"
      >
        <Heart className="h-8 w-8 fill-[#ff5e7a] text-[#ff5e7a]" />
      </motion.div>

      <SlideKicker className="text-black/55">Ton exo fétiche</SlideKicker>

      <motion.h2
        initial={{ y: 26, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.25, type: "spring", stiffness: 120, damping: 15 }}
        className="heading-display text-5xl leading-[0.95] text-[#2a1903] sm:text-6xl"
      >
        {topExerciseName}
      </motion.h2>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.55 }}
        className="text-lg font-medium text-black/65"
      >
        Celui que tu as enchaîné le plus souvent. Une vraie histoire d'amour.
      </motion.p>
    </SlideShell>
  );
}
