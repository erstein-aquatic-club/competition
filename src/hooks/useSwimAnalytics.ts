/**
 * useSwimAnalytics — fetches swim assignments and computes volume analytics
 * (by stroke, type, intensity) aggregated by ISO week.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { canUseSupabase } from "@/lib/api/client";
import type { SwimBlock, SwimExercise } from "@/lib/swimTextParser";
import {
  computeSessionVolume,
  aggregateByWeek,
  type SwimVolumeEntry,
  type WeeklySwimVolume,
} from "@/lib/swimAnalytics";

// ── Types ────────────────────────────────────────────────────

export interface UseSwimAnalyticsProps {
  groupId?: number;
  userId?: number;
  weeks: number; // default 8
}

export interface UseSwimAnalyticsResult {
  weeklyVolumes: WeeklySwimVolume[];
  totalMeters: number;
  isLoading: boolean;
}

// ── Helpers ──────────────────────────────────────────────────

function weeksAgoISO(weeks: number): string {
  const d = new Date();
  d.setDate(d.getDate() - weeks * 7);
  return d.toISOString().slice(0, 10);
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

interface RawPayload {
  block_order?: number;
  block_repetitions?: number | null;
  block_title?: string;
  block_description?: string | null;
  block_modalities?: string | null;
  block_equipment?: string[];
  exercise_repetitions?: number | null;
  exercise_rest?: number | null;
  exercise_rest_type?: "departure" | "rest";
  exercise_stroke?: string | null;
  exercise_stroke_type?: string | null;
  exercise_intensity?: string | null;
  exercise_modalities?: string | null;
  exercise_equipment?: string[];
  exercise_order?: number;
}

interface AssignmentRow {
  id: number;
  scheduled_date: string;
  swim_catalog_id: number | null;
}

interface CatalogItemRow {
  catalog_id: number;
  distance: number | null;
  raw_payload: RawPayload | string | null;
}

/**
 * Rebuild SwimBlock[] from flat swim_session_items rows (raw_payload).
 * This mirrors how buildItemsFromBlocks stores the data, reversed.
 */
function rebuildBlocks(items: CatalogItemRow[]): SwimBlock[] {
  const blockMap = new Map<
    number,
    { block: SwimBlock; exercises: SwimExercise[] }
  >();

  for (const item of items) {
    const raw: RawPayload =
      typeof item.raw_payload === "string"
        ? JSON.parse(item.raw_payload)
        : (item.raw_payload ?? {});

    const blockOrder = raw.block_order ?? 0;

    if (!blockMap.has(blockOrder)) {
      blockMap.set(blockOrder, {
        block: {
          title: raw.block_title ?? `Bloc ${blockOrder + 1}`,
          repetitions: raw.block_repetitions ?? null,
          description: raw.block_description ?? "",
          modalities: raw.block_modalities ?? "",
          equipment: Array.isArray(raw.block_equipment)
            ? raw.block_equipment
            : [],
          exercises: [],
        },
        exercises: [],
      });
    }

    const entry = blockMap.get(blockOrder)!;
    entry.exercises.push({
      repetitions: raw.exercise_repetitions ?? 1,
      distance: item.distance ?? null,
      rest: raw.exercise_rest ?? null,
      restType: raw.exercise_rest_type ?? "rest",
      stroke: raw.exercise_stroke ?? "crawl",
      strokeType: raw.exercise_stroke_type ?? "nc",
      intensity: raw.exercise_intensity ?? "V1",
      modalities: raw.exercise_modalities ?? "",
      equipment: Array.isArray(raw.exercise_equipment)
        ? raw.exercise_equipment
        : [],
    });
  }

  // Assemble blocks with exercises
  const result: SwimBlock[] = [];
  for (const [, { block, exercises }] of [...blockMap.entries()].sort(
    ([a], [b]) => a - b,
  )) {
    block.exercises = exercises;
    result.push(block);
  }
  return result;
}

// ── Hook ─────────────────────────────────────────────────────

export function useSwimAnalytics({
  groupId,
  userId,
  weeks = 8,
}: UseSwimAnalyticsProps): UseSwimAnalyticsResult {
  const from = useMemo(() => weeksAgoISO(weeks), [weeks]);
  const to = useMemo(() => todayISO(), []);

  // 1. Fetch swim assignments for the period
  const assignmentsQuery = useQuery({
    queryKey: ["swim-analytics-assignments", groupId, userId, weeks],
    queryFn: async (): Promise<AssignmentRow[]> => {
      if (!canUseSupabase()) return [];

      let query = supabase
        .from("session_assignments")
        .select("id, scheduled_date, swim_catalog_id")
        .eq("assignment_type", "swim")
        .gte("scheduled_date", from)
        .lte("scheduled_date", to)
        .not("swim_catalog_id", "is", null);

      if (userId) {
        // Fetch direct user assignments + group assignments for user's groups
        const { data: groupRows } = await supabase
          .from("group_members")
          .select("group_id")
          .eq("user_id", userId);
        const gids = (groupRows ?? []).map((r: { group_id: number }) => r.group_id);
        const orParts = [`target_user_id.eq.${userId}`];
        for (const gid of gids) {
          orParts.push(`target_group_id.eq.${gid}`);
        }
        query = query.or(orParts.join(","));
      } else if (groupId) {
        query = query.eq("target_group_id", groupId);
      } else {
        return [];
      }

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? []) as AssignmentRow[];
    },
    staleTime: 5 * 60_000,
    enabled: !!(userId || groupId),
  });

  // 2. Fetch catalog items for all catalog IDs found
  const catalogIds = useMemo(() => {
    const ids = new Set<number>();
    for (const a of assignmentsQuery.data ?? []) {
      if (a.swim_catalog_id) ids.add(a.swim_catalog_id);
    }
    return Array.from(ids);
  }, [assignmentsQuery.data]);

  const itemsQuery = useQuery({
    queryKey: ["swim-analytics-items", catalogIds],
    queryFn: async (): Promise<Map<number, CatalogItemRow[]>> => {
      if (!canUseSupabase() || catalogIds.length === 0)
        return new Map();

      const { data, error } = await supabase
        .from("swim_session_items")
        .select("catalog_id, distance, raw_payload")
        .in("catalog_id", catalogIds)
        .order("ordre", { ascending: true });

      if (error) throw new Error(error.message);

      // Group by catalog_id
      const map = new Map<number, CatalogItemRow[]>();
      for (const row of data ?? []) {
        const cid = row.catalog_id as number;
        if (!map.has(cid)) map.set(cid, []);
        map.get(cid)!.push(row as CatalogItemRow);
      }
      return map;
    },
    staleTime: 5 * 60_000,
    enabled: catalogIds.length > 0,
  });

  // 3. Compute volumes
  const result = useMemo(() => {
    const assignments = assignmentsQuery.data ?? [];
    const itemsMap = itemsQuery.data ?? new Map<number, CatalogItemRow[]>();

    if (assignments.length === 0 || itemsMap.size === 0) {
      return { weeklyVolumes: [] as WeeklySwimVolume[], totalMeters: 0 };
    }

    // Build volume entries: one per assignment
    const entries: SwimVolumeEntry[] = [];

    for (const assignment of assignments) {
      if (!assignment.swim_catalog_id) continue;
      const items = itemsMap.get(assignment.swim_catalog_id);
      if (!items || items.length === 0) continue;

      const blocks = rebuildBlocks(items);
      const volume = computeSessionVolume(blocks);
      if (volume.totalMeters > 0) {
        entries.push({
          date: assignment.scheduled_date,
          ...volume,
        });
      }
    }

    const weeklyVolumes = aggregateByWeek(entries);
    const totalMeters = weeklyVolumes.reduce((s, w) => s + w.totalMeters, 0);

    return { weeklyVolumes, totalMeters };
  }, [assignmentsQuery.data, itemsQuery.data]);

  return {
    ...result,
    isLoading: assignmentsQuery.isLoading || itemsQuery.isLoading,
  };
}
