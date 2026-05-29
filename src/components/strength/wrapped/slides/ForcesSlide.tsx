import { motion } from "framer-motion";
import { Flame } from "lucide-react";
import type { RankedKpi } from "@/lib/strength/wrappedStats";
import { SlideShell, SlideKicker } from "./slideChrome";

/**
 * Slide forces : 1 à 2 KPI les plus forts.
 * RÈGLE CONFIDENTIALITÉ : on n'affiche QUE `label` + `band.label` — jamais `score`
 * ni aucune valeur brute (poids/perf).
 */
export function ForcesSlide({ forces }: { forces: RankedKpi[] }) {
  return (
    <SlideShell kind="forces" className="gap-7">
      <motion.div
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 14 }}
        className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25"
      >
        <Flame className="h-7 w-7 text-[#ffd089]" />
      </motion.div>

      <div>
        <SlideKicker>Tes points forts</SlideKicker>
        <motion.h2
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 130, damping: 16 }}
          className="heading-display mt-2 text-4xl leading-[0.95] sm:text-5xl"
        >
          {forces.length > 1 ? "Là où tu domines" : "Ton point fort"}
        </motion.h2>
      </div>

      <div className="flex flex-col gap-4">
        {forces.map((kpi, i) => (
          <motion.div
            key={kpi.key}
            initial={{ x: -28, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.35 + i * 0.18, type: "spring", stiffness: 160, damping: 18 }}
            className="rounded-2xl bg-white/10 p-5 ring-1 ring-white/15 backdrop-blur-sm"
          >
            <p className="text-xl font-semibold text-white">{kpi.label}</p>
            <p className="heading-display mt-1 text-2xl text-[#ffd089]">{kpi.band.label}</p>
          </motion.div>
        ))}
      </div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7 }}
        className="text-sm leading-snug text-white/70"
      >
        Comparé aux jeunes de ton âge et de ton sexe.
      </motion.p>
    </SlideShell>
  );
}
