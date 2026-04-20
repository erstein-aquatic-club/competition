import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getMonday } from "@/components/coach/swim/swimPlanningShared";
import type { Competition } from "@/lib/api/types";

export function useCompetitionsByWeek(userId: number | null | undefined) {
  const { data: allCompetitions = [] } = useQuery({
    queryKey: ["competitions"],
    queryFn: () => api.getCompetitions(),
  });

  const { data: myCompetitionIds } = useQuery({
    queryKey: ["my-competition-ids", userId],
    queryFn: () => api.getMyCompetitionIds(userId),
    enabled: !!userId,
  });

  const visibleCompetitions = useMemo(() => {
    if (myCompetitionIds && myCompetitionIds.length > 0) {
      return allCompetitions.filter((c) => myCompetitionIds.includes(c.id));
    }
    return allCompetitions;
  }, [allCompetitions, myCompetitionIds]);

  const competitionsByWeek = useMemo(() => {
    const map = new Map<string, Competition[]>();
    for (const c of visibleCompetitions) {
      if (!c.date) continue;
      const start = new Date(c.date.slice(0, 10) + "T00:00:00");
      const end = c.end_date
        ? new Date(c.end_date.slice(0, 10) + "T00:00:00")
        : start;
      const cursor = getMonday(start);
      const endMonday = getMonday(end);
      while (cursor.getTime() <= endMonday.getTime()) {
        const key = cursor.toISOString().split("T")[0];
        const arr = map.get(key) ?? [];
        arr.push(c);
        map.set(key, arr);
        cursor.setDate(cursor.getDate() + 7);
      }
    }
    return map;
  }, [visibleCompetitions]);

  const getDayCompetitions = useMemo(
    () =>
      (weekMonday: Date, dayIndex: number): Competition[] => {
        const d = new Date(weekMonday);
        d.setDate(weekMonday.getDate() + dayIndex);
        d.setHours(0, 0, 0, 0);
        const t = d.getTime();
        return visibleCompetitions.filter((c) => {
          if (!c.date) return false;
          const s = new Date(c.date.slice(0, 10) + "T00:00:00").getTime();
          const e = c.end_date
            ? new Date(c.end_date.slice(0, 10) + "T00:00:00").getTime()
            : s;
          return t >= s && t <= e;
        });
      },
    [visibleCompetitions],
  );

  return { visibleCompetitions, competitionsByWeek, getDayCompetitions };
}
