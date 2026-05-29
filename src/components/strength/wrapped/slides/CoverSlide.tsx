import { motion } from "framer-motion";
import { Dumbbell } from "lucide-react";
import { SlideShell, SlideKicker } from "./slideChrome";

/**
 * Slide d'ouverture du récap. Titre selon le contexte :
 *  - 'self'  → "Ton récap muscu"
 *  - 'coach' → "Le récap de {displayName}"
 * Sous-titre fixe : "90 derniers jours".
 */
export function CoverSlide({
  viewerContext,
  displayName,
}: {
  viewerContext: "self" | "coach";
  displayName?: string;
}) {
  const title =
    viewerContext === "self"
      ? "Ton récap muscu"
      : `Le récap de ${displayName?.trim() || "ton nageur"}`;

  return (
    <SlideShell kind="cover" className="gap-8">
      <motion.div
        initial={{ scale: 0.6, rotate: -12, opacity: 0 }}
        animate={{ scale: 1, rotate: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 14, delay: 0.1 }}
        className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm ring-1 ring-white/30"
      >
        <Dumbbell className="h-8 w-8 text-[#c4b5ff]" />
      </motion.div>

      <div>
        <motion.div
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.25 }}
        >
          <SlideKicker>Erstein Aquatic Club</SlideKicker>
        </motion.div>
        <motion.h1
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.35, type: "spring", stiffness: 120, damping: 16 }}
          className="heading-display mt-3 text-5xl leading-[0.95] sm:text-6xl"
        >
          {title}
        </motion.h1>
      </div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="text-lg font-medium text-white/75"
      >
        90 derniers jours
      </motion.p>
    </SlideShell>
  );
}
