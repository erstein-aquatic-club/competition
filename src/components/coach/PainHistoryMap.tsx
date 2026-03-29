/**
 * PainHistoryMap — Coach view: aggregate pain reports over 4 weeks.
 *
 * Displays BodySvg in view mode with frequency-based opacity.
 * Alerts if any zone reported 3+ times in 14 days.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getPainReportsRange } from "@/lib/api/painReports";
import { BodyHeatMap } from "@/components/wellness/BodyHeatMap";
import { BODY_ZONES } from "@/components/wellness/BodySvg";
import { AlertTriangle } from "lucide-react";

interface PainHistoryMapProps {
  userId: number;
  days?: number;
}

export default function PainHistoryMap({ userId, days = 28 }: PainHistoryMapProps) {
  const endDate = new Date().toISOString().slice(0, 10);
  const startDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().slice(0, 10);
  }, [days]);

  const { data: reports, isLoading } = useQuery({
    queryKey: ["pain-reports-range", userId, startDate, endDate],
    queryFn: () => getPainReportsRange(userId, startDate, endDate),
    enabled: !!userId,
    staleTime: 5 * 60_000,
  });

  // Aggregate: count per zone
  const { zoneCounts, alerts } = useMemo(() => {
    if (!reports || reports.length === 0) return { zoneCounts: {} as Record<string, number>, alerts: [] as string[] };

    const counts: Record<string, number> = {};
    for (const r of reports) {
      counts[r.body_zone] = (counts[r.body_zone] || 0) + 1;
    }

    // Check for alerts: 3+ reports in 14 days
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    const recentStr = twoWeeksAgo.toISOString().slice(0, 10);

    const recentCounts: Record<string, number> = {};
    for (const r of reports) {
      if (r.date >= recentStr) {
        recentCounts[r.body_zone] = (recentCounts[r.body_zone] || 0) + 1;
      }
    }

    const alertZones = Object.entries(recentCounts)
      .filter(([, count]) => count >= 3)
      .map(([zone]) => {
        const z = BODY_ZONES.find((b) => b.id === zone);
        return z?.label ?? zone;
      });

    return { zoneCounts: counts, alerts: alertZones };
  }, [reports]);

  if (isLoading) {
    return <p className="text-xs text-muted-foreground text-center py-4">Chargement...</p>;
  }

  const totalReports = reports?.length ?? 0;

  if (totalReports === 0) {
    return (
      <p className="text-xs text-muted-foreground text-center py-4">
        Aucune douleur signalée sur {days} jours.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* Alert banner */}
      {alerts.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-red-400/40 bg-red-500/10 p-2.5">
          <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
          <div className="text-xs">
            <p className="font-semibold text-red-700 dark:text-red-400">
              Zones récurrentes (3+ fois en 14j)
            </p>
            <p className="text-red-600 dark:text-red-400/80 mt-0.5">
              {alerts.join(", ")}
            </p>
          </div>
        </div>
      )}

      {/* Body heat map in view mode */}
      <BodyHeatMap
        selectedZones={{}}
        onChange={() => {}}
        mode="view"
        viewData={zoneCounts}
      />

      {/* Summary */}
      <p className="text-[10px] text-muted-foreground text-center">
        {totalReports} signalement{totalReports > 1 ? "s" : ""} sur {days} jours
      </p>
    </div>
  );
}
