import { useQuery } from "@tanstack/react-query";
import { getUserAchievements } from "@/lib/api/achievements";
import { BADGE_DEFINITIONS, type BadgeDefinition } from "@/lib/achievementRules";
import type { Achievement } from "@/lib/api/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface BadgesGridProps {
  userId: number;
}

function BadgeTile({
  badge,
  achievement,
}: {
  badge: BadgeDefinition;
  achievement: Achievement | undefined;
}) {
  const unlocked = !!achievement;
  const date = achievement
    ? new Date(achievement.unlocked_at).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

  return (
    <div
      className={`flex flex-col items-center rounded-2xl border p-3 text-center transition ${
        unlocked
          ? "border-primary/20 bg-primary/5"
          : "border-border/50 bg-muted/30 opacity-50 grayscale"
      }`}
    >
      <span className="text-2xl leading-none" role="img" aria-label={badge.label}>
        {badge.icon}
      </span>
      <p className="mt-2 text-xs font-semibold leading-tight">{badge.label}</p>
      {unlocked && date ? (
        <p className="mt-1 text-[10px] text-muted-foreground">{date}</p>
      ) : (
        <p className="mt-1 text-[10px] text-muted-foreground">{badge.description}</p>
      )}
    </div>
  );
}

export default function BadgesGrid({ userId }: BadgesGridProps) {
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

  if (isLoading) {
    return (
      <Card className="overflow-hidden border-primary/15 bg-card shadow-sm">
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-2xl" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden border-primary/15 bg-card shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base uppercase tracking-[0.08em]">
            Mes badges
          </CardTitle>
          <span className="text-xs text-muted-foreground">
            {unlockedCount}/{totalCount}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5">
          {BADGE_DEFINITIONS.map((badge) => (
            <BadgeTile
              key={badge.key}
              badge={badge}
              achievement={unlockedMap.get(badge.key)}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
