/**
 * WellnessBanner — Shown on Dashboard if daily wellness not filled today.
 *
 * Uses InlineBanner (blue variant) with a Heart icon.
 * If data exists, renders a mini ReadinessGauge inline.
 */

import { useQuery } from "@tanstack/react-query";
import { Heart } from "lucide-react";
import { getWellnessForDate } from "@/lib/api/wellness";
import { InlineBanner } from "@/components/shared/InlineBanner";
import { ReadinessGauge } from "./ReadinessGauge";

export interface WellnessBannerProps {
  userId: number;
  onOpen: () => void;
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function WellnessBanner({ userId, onOpen }: WellnessBannerProps) {
  const today = todayISO();

  const { data: wellness, isLoading } = useQuery({
    queryKey: ["wellness", userId, today],
    queryFn: () => getWellnessForDate(userId, today),
    enabled: !!userId,
    staleTime: 60_000,
  });

  // Loading or error: don't show anything
  if (isLoading) return null;

  // Data exists: show mini gauge inline
  if (wellness) {
    return (
      <InlineBanner
        variant="emerald"
        icon={<Heart />}
        label="Wellness"
        badge={
          <ReadinessGauge score={wellness.readiness_score} size={28} showLabel={false} />
        }
        visible
        onClick={onOpen}
        className="mt-2"
      />
    );
  }

  // No data today: prompt to fill
  return (
    <InlineBanner
      variant="blue"
      icon={<Heart />}
      label="Comment te sens-tu ce matin ?"
      badge="Remplir"
      visible
      onClick={onOpen}
      className="mt-2"
    />
  );
}
