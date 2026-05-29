import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { SlideShell, SlideKicker } from "./slideChrome";

/**
 * Slide de clôture : message d'encouragement. `viewerContext` adapte le ton
 * (nageur tutoyé vs coach qui regarde son nageur).
 */
export function OutroSlide({
  viewerContext,
  displayName,
}: {
  viewerContext: "self" | "coach";
  displayName?: string;
}) {
  const headline =
    viewerContext === "self" ? "Continue comme ça" : `${displayName?.trim() || "Ton nageur"} avance`;

  return (
    <SlideShell kind="outro" className="gap-7">
      <motion.div
        initial={{ scale: 0.5, rotate: -20, opacity: 0 }}
        animate={{ scale: 1, rotate: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 13 }}
        className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/30"
      >
        <Sparkles className="h-8 w-8 text-[#d8c4ff]" />
      </motion.div>

      <div>
        <SlideKicker>C'est tout pour aujourd'hui</SlideKicker>
        <motion.h2
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.25, type: "spring", stiffness: 120, damping: 16 }}
          className="heading-display mt-2 text-5xl leading-[0.95] sm:text-6xl"
        >
          {headline}
        </motion.h2>
      </div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.55 }}
        className="max-w-md text-lg leading-snug text-white/80"
      >
        {viewerContext === "self"
          ? "Chaque séance te rapproche de ton objectif. On se retrouve au prochain récap."
          : "Les bases sont là. Le prochain bloc va creuser l'écart."}
      </motion.p>
    </SlideShell>
  );
}
