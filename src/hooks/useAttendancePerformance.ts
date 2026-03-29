/**
 * useAttendancePerformance — computes attendance rate vs performance improvement
 * for swimmers, enabling correlation analysis between training regularity and
 * competition time improvements.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { canUseSupabase } from "@/lib/api/client";

// ── Types ────────────────────────────────────────────────────

export interface UseAttendancePerformanceProps {
  groupId?: number;
  months: number; // default 6
}

export interface AttendancePerformancePoint {
  name: string;
  userId: number;
  attendance: number; // 0-100 (percentage)
  improvement: number; // percentage (negative = faster = better)
}

export interface UseAttendancePerformanceResult {
  points: AttendancePerformancePoint[];
  correlation: number; // Pearson r coefficient
  isLoading: boolean;
}

// ── Helpers ──────────────────────────────────────────────────

function monthsAgoISO(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Pearson correlation coefficient between x and y values.
 * Returns 0 if fewer than 3 data points or zero variance.
 */
export function pearsonCorrelation(points: { x: number; y: number }[]): number {
  if (points.length < 3) return 0;
  const n = points.length;
  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0);
  const sumY2 = points.reduce((s, p) => s + p.y * p.y, 0);
  const denom = Math.sqrt((n * sumX2 - sumX ** 2) * (n * sumY2 - sumY ** 2));
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

// ── Raw data types ───────────────────────────────────────────

interface SessionCountRow {
  athlete_id: number;
  count: number;
}

interface AthleteRow {
  user_id: number;
  display_name: string;
}

interface PerfRow {
  user_id: number;
  event_code: string;
  time_seconds: number;
  competition_date: string;
}

// ── Hook ─────────────────────────────────────────────────────

export function useAttendancePerformance({
  groupId,
  months = 6,
}: UseAttendancePerformanceProps): UseAttendancePerformanceResult {
  const from = useMemo(() => monthsAgoISO(months), [months]);
  const to = useMemo(() => todayISO(), []);

  // Number of weeks in the period (for attendance normalization)
  const weeksInPeriod = useMemo(() => {
    const msPerWeek = 7 * 24 * 60 * 60 * 1000;
    const fromDate = new Date(from);
    const toDate = new Date(to);
    return Math.max(1, Math.round((toDate.getTime() - fromDate.getTime()) / msPerWeek));
  }, [from, to]);

  const query = useQuery({
    queryKey: ["attendance-performance", groupId, months],
    queryFn: async (): Promise<AttendancePerformancePoint[]> => {
      if (!canUseSupabase()) return [];

      // 1. Get athletes in group
      let athletes: AthleteRow[] = [];
      if (groupId) {
        const { data, error } = await supabase
          .from("group_members")
          .select("user_id, users!inner(display_name, role)")
          .eq("group_id", groupId)
          .eq("users.role", "athlete");
        if (error) throw new Error(error.message);
        athletes = (data ?? []).map((m: any) => ({
          user_id: m.user_id,
          display_name: (m.users as any)?.display_name ?? "Inconnu",
        }));
      } else {
        // All active athletes
        const { data, error } = await supabase
          .from("users")
          .select("id, display_name")
          .eq("role", "athlete")
          .eq("is_active", true);
        if (error) throw new Error(error.message);
        athletes = (data ?? []).map((u: any) => ({
          user_id: u.id,
          display_name: u.display_name,
        }));
      }

      if (athletes.length === 0) return [];

      const athleteIds = athletes.map((a) => a.user_id);
      const athleteMap = new Map(athletes.map((a) => [a.user_id, a.display_name]));

      // 2. Count sessions per athlete in the period
      const { data: sessionsData, error: sessionsError } = await supabase
        .from("dim_sessions")
        .select("athlete_id, session_date")
        .in("athlete_id", athleteIds)
        .gte("session_date", from)
        .lte("session_date", to);
      if (sessionsError) throw new Error(sessionsError.message);

      const sessionCounts = new Map<number, number>();
      for (const row of sessionsData ?? []) {
        const id = row.athlete_id as number;
        sessionCounts.set(id, (sessionCounts.get(id) ?? 0) + 1);
      }

      // 3. Count swimmer_training_slots per athlete to estimate expected sessions
      // We use 4 sessions/week as a reasonable default if no slots are configured
      const { data: slotsData } = await supabase
        .from("swimmer_training_slots")
        .select("user_id")
        .in("user_id", athleteIds)
        .eq("is_active", true);

      const slotCounts = new Map<number, number>();
      for (const row of slotsData ?? []) {
        const id = row.user_id as number;
        slotCounts.set(id, (slotCounts.get(id) ?? 0) + 1);
      }

      // Also check group-level training slots
      let groupSlotCount = 0;
      if (groupId) {
        const { data: groupSlots } = await supabase
          .from("training_slot_assignments")
          .select("slot_id")
          .eq("group_id", groupId);
        groupSlotCount = (groupSlots ?? []).length;
      }

      const DEFAULT_SLOTS_PER_WEEK = 4;

      // 4. Fetch performances (from swimmer_performances table)
      // Get performances with user_id in our athlete list
      const { data: perfData, error: perfError } = await supabase
        .from("swimmer_performances")
        .select("user_id, event_code, time_seconds, competition_date")
        .in("user_id", athleteIds)
        .gte("competition_date", from)
        .lte("competition_date", to)
        .order("competition_date", { ascending: true });
      if (perfError) throw new Error(perfError.message);

      // 5. Compute improvement per athlete
      // Strategy: for each swimmer, group by event_code, compute best time in first half vs second half
      const midpoint = new Date(
        (new Date(from).getTime() + new Date(to).getTime()) / 2,
      ).toISOString().slice(0, 10);

      // Group performances by user_id and event_code
      const perfByAthlete = new Map<number, Map<string, { firstHalf: number[]; secondHalf: number[] }>>();
      for (const row of perfData ?? []) {
        const uid = row.user_id as number;
        if (!uid) continue;
        if (!perfByAthlete.has(uid)) perfByAthlete.set(uid, new Map());
        const eventMap = perfByAthlete.get(uid)!;
        const ec = row.event_code as string;
        if (!eventMap.has(ec)) eventMap.set(ec, { firstHalf: [], secondHalf: [] });
        const entry = eventMap.get(ec)!;
        const compDate = row.competition_date as string;
        const timeS = row.time_seconds as number;
        if (timeS > 0) {
          if (compDate <= midpoint) {
            entry.firstHalf.push(timeS);
          } else {
            entry.secondHalf.push(timeS);
          }
        }
      }

      // 6. Build data points
      const points: AttendancePerformancePoint[] = [];

      for (const [userId, name] of athleteMap) {
        // Attendance
        const actual = sessionCounts.get(userId) ?? 0;
        const slotsPerWeek = slotCounts.get(userId) || groupSlotCount || DEFAULT_SLOTS_PER_WEEK;
        const expected = slotsPerWeek * weeksInPeriod;
        const attendance = Math.min(100, Math.round((actual / expected) * 100));

        // Performance improvement: average improvement across events
        const eventMap = perfByAthlete.get(userId);
        if (!eventMap || eventMap.size === 0) continue; // Skip athletes without perf data

        let totalImprovement = 0;
        let eventCount = 0;

        for (const [, { firstHalf, secondHalf }] of eventMap) {
          if (firstHalf.length === 0 || secondHalf.length === 0) continue;
          const bestFirst = Math.min(...firstHalf);
          const bestSecond = Math.min(...secondHalf);
          // Negative = faster = better
          const pctChange = ((bestSecond - bestFirst) / bestFirst) * 100;
          totalImprovement += pctChange;
          eventCount++;
        }

        if (eventCount === 0) continue; // No comparable events

        const improvement = totalImprovement / eventCount;

        points.push({
          name,
          userId,
          attendance,
          improvement: Math.round(improvement * 100) / 100,
        });
      }

      return points;
    },
    staleTime: 10 * 60_000,
    enabled: true,
  });

  const correlation = useMemo(() => {
    const pts = query.data ?? [];
    return pearsonCorrelation(
      pts.map((p) => ({ x: p.attendance, y: p.improvement })),
    );
  }, [query.data]);

  return {
    points: query.data ?? [],
    correlation,
    isLoading: query.isLoading,
  };
}
