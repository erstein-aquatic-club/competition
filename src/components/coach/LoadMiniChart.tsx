import type { DailyLoad } from "@/hooks/useTrainingLoad";

interface LoadMiniChartProps {
  dailyLoads: DailyLoad[];
}

/**
 * Mini 4-bar chart showing weekly total load for the last 28 days.
 * Older weeks are rendered with lower opacity.
 */
export default function LoadMiniChart({ dailyLoads }: LoadMiniChartProps) {
  // Group into 4 weeks (most recent 28 days)
  const last28 = dailyLoads.slice(-28);

  const weeks: number[] = [];
  for (let w = 0; w < 4; w++) {
    const start = w * 7;
    const end = start + 7;
    const slice = last28.slice(start, end);
    weeks.push(slice.reduce((sum, d) => sum + d.totalLoad, 0));
  }

  const maxWeek = Math.max(...weeks, 1);

  // Opacity gradient: oldest (index 0) lighter, newest (index 3) full
  const opacities = [0.3, 0.5, 0.7, 1.0];

  return (
    <div className="flex items-end gap-[3px]" style={{ width: 48, height: 20 }}>
      {weeks.map((total, i) => {
        const heightPct = Math.max((total / maxWeek) * 100, 4); // min 4% so bar is visible
        return (
          <div
            key={i}
            className="flex-1 rounded-sm"
            style={{
              height: `${heightPct}%`,
              backgroundColor: `hsl(var(--primary) / ${opacities[i]})`,
            }}
          />
        );
      })}
    </div>
  );
}
