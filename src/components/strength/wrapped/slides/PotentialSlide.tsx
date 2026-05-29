import { motion } from "framer-motion";
import { TrendingUp } from "lucide-react";
import type { RankedKpi } from "@/lib/strength/wrappedStats";
import { SlideShell, SlideKicker } from "./slideChrome";

/**
 * Slide potentiel : l'axe le plus faible, FORMULÉ POSITIVEMENT ("ton plus gros
 * gain à venir"). Confidentialité : `label` + `band.label` uniquement, jamais le score.
 */
export function PotentialSlide({ axis }: { axis: RankedKpi }) {
  return (
    <SlideShell kind="potential" className="gap-7">
      <motion.div
        initial={{ scale: 0.7, opacity: 0, rotate: -10 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 200, damping: 14 }}
        className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25"
      >
        <TrendingUp className="h-7 w-7 text-[#caffb0]" />
      </motion.div>

      <div>
        <SlideKicker>Marge de progression</SlideKicker>
        <motion.h2
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 130, damping: 16 }}
          className="heading-display mt-2 text-4xl leading-[0.95] sm:text-5xl"
        >
          Ton plus gros gain à venir
        </motion.h2>
      </div>

      <motion.div
        initial={{ y: 22, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.4, type: "spring", stiffness: 150, damping: 18 }}
        className="rounded-2xl bg-white/10 p-5 ring-1 ring-white/15 backdrop-blur-sm"
      >
        <p className="text-xl font-semibold text-white">{axis.label}</p>
        <p className="heading-display mt-1 text-2xl text-[#caffb0]">{axis.band.label}</p>
        <p className="mt-1 text-sm text-white/60">
          Comparé aux jeunes de ton âge et de ton sexe.
        </p>
        <p className="mt-3 text-sm leading-snug text-white/75">
          C'est ici que tu as le plus à gagner — chaque séance compte.
        </p>
      </motion.div>
    </SlideShell>
  );
}
