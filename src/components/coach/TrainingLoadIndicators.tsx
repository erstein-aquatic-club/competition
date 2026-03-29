import { useEffect } from "react";
import { useTrainingLoad } from "@/hooks/useTrainingLoad";
import AcwrBadge from "./AcwrBadge";
import LoadMiniChart from "./LoadMiniChart";

interface TrainingLoadIndicatorsProps {
  userId: number;
  /** Optional callback to report ACWR value to parent (for sorting). */
  onAcwrReady?: (userId: number, acwr: number | null) => void;
}

/**
 * Wrapper component that calls useTrainingLoad for a single swimmer
 * and renders AcwrBadge + LoadMiniChart side by side.
 * Designed to be used inside each swimmer card so React Query handles caching per user.
 */
export default function TrainingLoadIndicators({ userId, onAcwrReady }: TrainingLoadIndicatorsProps) {
  const { acwr, dailyLoads, isLoading } = useTrainingLoad({ userId, days: 28 });

  // Report ACWR to parent when available
  useEffect(() => {
    if (!isLoading && onAcwrReady) {
      onAcwrReady(userId, acwr);
    }
  }, [isLoading, acwr, userId, onAcwrReady]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2">
        <div className="h-4 w-7 rounded-full bg-muted animate-pulse motion-reduce:animate-none" />
        <div className="h-5 w-12 rounded bg-muted animate-pulse motion-reduce:animate-none" />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <AcwrBadge acwr={acwr} size="sm" />
      <LoadMiniChart dailyLoads={dailyLoads} />
    </div>
  );
}
