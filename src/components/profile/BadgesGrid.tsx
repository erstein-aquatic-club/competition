import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getUserAchievements } from "@/lib/api/achievements";
import { BADGE_DEFINITIONS, type BadgeDefinition } from "@/lib/achievementRules";
import type { Achievement } from "@/lib/api/types";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronDown, Trophy, Flame, Heart, Dumbbell, Medal, type LucideIcon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface BadgesGridProps {
  userId: number;
}

// ── Group badges by type ──────────────────────────────────────

type BadgeType = BadgeDefinition["type"];

const TYPE_META: Record<BadgeType, { label: string; Icon: LucideIcon; color: string; bg: string; track: string }> = {
  streak:      { label: "Présence",    Icon: Flame,    color: "text-orange-500",  bg: "bg-orange-500",  track: "bg-orange-500/20" },
  pr:          { label: "Records",     Icon: Trophy,   color: "text-amber-500",   bg: "bg-amber-500",   track: "bg-amber-500/20" },
  wellness:    { label: "Bien-être",   Icon: Heart,    color: "text-emerald-500", bg: "bg-emerald-500", track: "bg-emerald-500/20" },
  attendance:  { label: "Musculation", Icon: Dumbbell, color: "text-blue-500",    bg: "bg-blue-500",    track: "bg-blue-500/20" },
  competition: { label: "Compétition", Icon: Medal,    color: "text-violet-500",  bg: "bg-violet-500",  track: "bg-violet-500/20" },
};

const TYPE_ORDER: BadgeType[] = ["streak", "wellness", "attendance", "pr", "competition"];

function groupByType(badges: BadgeDefinition[]): Record<BadgeType, BadgeDefinition[]> {
  const groups = {} as Record<BadgeType, BadgeDefinition[]>;
  for (const t of TYPE_ORDER) groups[t] = [];
  for (const b of badges) {
    groups[b.type]?.push(b);
  }
  // Sort each group by palier ascending
  for (const t of TYPE_ORDER) {
    groups[t].sort((a, b) => a.palier - b.palier);
  }
  return groups;
}

// ── Category track — horizontal milestones ────────────────────

function CategoryTrack({
  type,
  badges,
  unlockedMap,
}: {
  type: BadgeType;
  badges: BadgeDefinition[];
  unlockedMap: Map<string, Achievement>;
}) {
  const meta = TYPE_META[type];
  const unlockedInCategory = badges.filter((b) => unlockedMap.has(b.key)).length;
  const total = badges.length;
  // Progress ratio for the track fill
  const progressRatio = total > 0 ? unlockedInCategory / total : 0;

  return (
    <div className="flex items-center gap-3">
      {/* Icon + label */}
      <div className="flex items-center gap-2 w-[100px] shrink-0">
        <meta.Icon className={`h-4 w-4 ${meta.color}`} aria-label={meta.label} />
        <div className="min-w-0">
          <p className="text-xs font-semibold leading-tight truncate">{meta.label}</p>
          <p className="text-[10px] text-muted-foreground/50">
            {unlockedInCategory}/{total}
          </p>
        </div>
      </div>

      {/* Track with milestones */}
      <div className="flex-1 relative flex items-center">
        {/* Background track */}
        <div className={`absolute inset-y-1/2 -translate-y-1/2 left-0 right-0 h-[3px] rounded-full ${meta.track}`} />
        {/* Filled track */}
        <motion.div
          className={`absolute inset-y-1/2 -translate-y-1/2 left-0 h-[3px] rounded-full ${meta.bg}`}
          initial={{ width: 0 }}
          animate={{ width: `${progressRatio * 100}%` }}
          transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
        />

        {/* Milestone dots */}
        <div className="relative flex items-center justify-between w-full">
          {badges.map((badge, idx) => {
            const unlocked = unlockedMap.has(badge.key);
            const achievement = unlockedMap.get(badge.key);
            const date = achievement
              ? new Date(achievement.unlocked_at).toLocaleDateString("fr-FR", {
                  day: "numeric",
                  month: "short",
                })
              : null;

            return (
              <div
                key={badge.key}
                className="flex flex-col items-center"
                style={{ zIndex: idx + 1 }}
              >
                {/* Dot */}
                <div className="relative">
                  {unlocked && (
                    <motion.div
                      className={`absolute -inset-1 rounded-full ${meta.bg} opacity-20`}
                      initial={{ scale: 0 }}
                      animate={{ scale: [1, 1.4, 1] }}
                      transition={{ duration: 2, repeat: Infinity, repeatDelay: 1 }}
                    />
                  )}
                  <motion.div
                    className={[
                      "relative w-7 h-7 rounded-full flex items-center justify-center border-2 transition-colors",
                      unlocked
                        ? `${meta.bg} border-transparent text-white shadow-sm`
                        : "bg-muted/60 border-border/50 text-muted-foreground/40",
                    ].join(" ")}
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.1 * idx + 0.3, duration: 0.4 }}
                  >
                    <span className="text-[10px] font-bold leading-none">
                      {badge.palier}
                    </span>
                  </motion.div>
                </div>
                {/* Label below */}
                <p className={`mt-1 text-[9px] leading-tight text-center max-w-[52px] ${
                  unlocked ? "font-semibold text-foreground/80" : "text-muted-foreground/40"
                }`}>
                  {unlocked ? (date ?? badge.label) : badge.label}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────

export default function BadgesGrid({ userId }: BadgesGridProps) {
  const [isOpen, setIsOpen] = useState(false);

  const { data: achievements, isLoading } = useQuery({
    queryKey: ["achievements", userId],
    queryFn: () => getUserAchievements(userId),
    enabled: !!userId,
    staleTime: 60_000,
  });

  const unlockedMap = new Map<string, Achievement>();
  for (const a of achievements ?? []) {
    unlockedMap.set(a.key, a);
  }

  const unlockedCount = unlockedMap.size;
  const totalCount = BADGE_DEFINITIONS.length;
  const grouped = groupByType(BADGE_DEFINITIONS);

  if (isLoading) {
    return (
      <Card className="overflow-hidden border-primary/15 bg-card shadow-sm">
        <div className="px-4 py-3">
          <Skeleton className="h-5 w-40" />
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden border-primary/15 bg-card shadow-sm">
      {/* Clickable header — always visible */}
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-3 text-left active:bg-muted/30 transition-colors"
        onClick={() => setIsOpen((o) => !o)}
      >
        <div className="flex items-center gap-2.5">
          <Trophy className="h-4 w-4 text-primary/70" />
          <span className="text-base font-semibold uppercase tracking-eyebrow-sm">
            Mes badges
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground tabular-nums">
            {unlockedCount}/{totalCount}
          </span>
          <motion.div
            animate={{ rotate: isOpen ? 180 : 0 }}
            transition={{ duration: 0.25 }}
          >
            <ChevronDown className="h-4 w-4 text-muted-foreground/50" />
          </motion.div>
        </div>
      </button>

      {/* Collapsible content */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <CardContent className="pt-0 pb-4 space-y-4">
              {TYPE_ORDER.map((type) => (
                <CategoryTrack
                  key={type}
                  type={type}
                  badges={grouped[type]}
                  unlockedMap={unlockedMap}
                />
              ))}
            </CardContent>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
