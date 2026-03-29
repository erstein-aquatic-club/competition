import { motion } from "framer-motion";
import type { BadgeDefinition } from "@/lib/achievementRules";

interface AchievementToastProps {
  badge: BadgeDefinition;
}

/**
 * Custom toast content for badge unlock celebrations.
 * Intended to be rendered inside the toast `description` slot.
 */
export default function AchievementToast({ badge }: AchievementToastProps) {
  return (
    <motion.div
      className="flex items-center gap-3"
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 400, damping: 20 }}
    >
      <span className="text-3xl leading-none" role="img" aria-label={badge.label}>
        {badge.icon}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-bold leading-tight">{badge.label}</p>
        <p className="text-xs text-muted-foreground">{badge.description}</p>
      </div>
    </motion.div>
  );
}
