/**
 * useSwimPlanningAthleteMode — athlete-mode state, queries, and mutations
 * for the coach swim-planning timeline.
 *
 * Encapsulates:
 * - Athlete selection (with URL hash `?athlete=<id>` sync).
 * - Athletes list + per-group filtering + dangling-selection cleanup.
 * - DB-backed per-athlete slot overrides + per-group/per-athlete week meta.
 * - Merged `EffectiveSlot` / `EffectiveWeekMeta` derivations.
 * - Write helpers that branch between group-mode and athlete-mode.
 *
 * Does NOT own: `filiereSheet`/`editingWeekKey`/sheet state, toast display,
 * or group-level slot fetching (those stay in the caller).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  SwimPlanningSlot,
  AthleteSummary,
} from "@/lib/api/types";
import type { EffectiveSlot, EffectiveWeekMeta } from "@/lib/swimPlanningMerge";
import { mergeSlots, mergeWeekMeta } from "@/lib/swimPlanningMerge";

export interface UseSwimPlanningAthleteModeOptions {
  selectedGroupId: number | null;
  visibleWeekKeys: string[];
  groupSlotsByWeek: Map<string, SwimPlanningSlot[]>;
}

export interface SwimPlanningSlotWriteInput {
  weekKey: string;
  dayIndex: number;
  timeSlot: "morning" | "evening";
  filiere: string;
  session_id: string | null;
  /** Existing slot (for session-link flows that preserve filiere). */
  existingSlot?: EffectiveSlot;
}

export interface SwimPlanningAthleteModeApi {
  // Selection + URL sync (managed inside)
  selectedAthleteId: number | null;
  setSelectedAthleteId: (id: number | null) => void;
  selectedAthlete: AthleteSummary | null;
  groupAthletes: AthleteSummary[];

  // Merged data for the timeline
  effectiveSlotsByWeek: Map<string, EffectiveSlot[]>;
  getEffectiveWeekMeta: (weekKey: string) => EffectiveWeekMeta;
  existingWeekTypes: string[];

  // Routed writes — caller passes per-call onSuccess/onError for view-side effects
  writeSlot: (
    input: SwimPlanningSlotWriteInput,
    opts?: { onSuccess?: () => void; onError?: (err: Error) => void },
  ) => void;
  deleteSlot: (
    slot: EffectiveSlot,
    opts?: { onSuccess?: () => void; onError?: (err: Error) => void },
  ) => void;
  writeWeekMeta: (
    weekKey: string,
    week_type: string | null,
    notes: string | null,
    opts?: { onSuccess?: () => void; onError?: (err: Error) => void },
  ) => void;

  // Composite pending flag
  isPending: boolean;
}

export function useSwimPlanningAthleteMode({
  selectedGroupId,
  visibleWeekKeys,
  groupSlotsByWeek,
}: UseSwimPlanningAthleteModeOptions): SwimPlanningAthleteModeApi {
  const queryClient = useQueryClient();

  // ── Athlete list ──
  const { data: allAthletes = [] } = useQuery({
    queryKey: ["athletes"],
    queryFn: () => api.getAthletes(),
  });

  const groupAthletes = useMemo(
    () =>
      allAthletes.filter(
        (a) => a.id != null && a.group_id === selectedGroupId,
      ),
    [allAthletes, selectedGroupId],
  );

  // ── Athlete selection (with URL hash ?athlete=<id>) ──
  const [selectedAthleteId, setSelectedAthleteId] = useState<number | null>(
    () => {
      const params = new URLSearchParams(
        window.location.hash.split("?")[1] ?? "",
      );
      const raw = params.get("athlete");
      const n = raw ? Number(raw) : NaN;
      return Number.isFinite(n) && n > 0 ? n : null;
    },
  );

  // Sync athlete id to URL hash query string
  useEffect(() => {
    const [path, qs] = window.location.hash.split("?");
    const params = new URLSearchParams(qs ?? "");
    if (selectedAthleteId) {
      params.set("athlete", String(selectedAthleteId));
    } else {
      params.delete("athlete");
    }
    const next = params.toString();
    const nextHash = next ? `${path}?${next}` : path;
    if (nextHash !== window.location.hash) {
      window.history.replaceState(null, "", nextHash);
    }
  }, [selectedAthleteId]);

  const selectedAthlete = useMemo(
    () => groupAthletes.find((a) => a.id === selectedAthleteId) ?? null,
    [groupAthletes, selectedAthleteId],
  );

  // Clear dangling athlete selection when the coach switches group or when
  // the loaded athlete list confirms the id isn't in scope.
  useEffect(() => {
    if (selectedAthleteId == null) return;
    if (allAthletes.length === 0) return; // not loaded yet
    const stillInGroup = groupAthletes.some(
      (a) => a.id === selectedAthleteId,
    );
    if (!stillInGroup) setSelectedAthleteId(null);
  }, [allAthletes, groupAthletes, selectedAthleteId, selectedGroupId]);

  // ── Queries (athlete-mode overrides + per-group week meta) ──

  // Per-athlete slot overrides (only fetched in athlete mode)
  const { data: slotOverrides = [] } = useQuery({
    queryKey: [
      "swim-planning-slot-overrides",
      selectedAthleteId,
      visibleWeekKeys,
    ],
    queryFn: () =>
      api.getSwimPlanningSlotOverrides({
        athleteId: selectedAthleteId!,
        weekStarts: visibleWeekKeys,
      }),
    enabled: selectedAthleteId != null && visibleWeekKeys.length > 0,
  });

  // Per-group week meta (always fetched — used in both modes)
  const { data: groupWeekMeta = [] } = useQuery({
    queryKey: ["swim-planning-week-meta", selectedGroupId, visibleWeekKeys],
    queryFn: () =>
      api.getSwimPlanningWeekMeta({
        groupId: selectedGroupId!,
        weekStarts: visibleWeekKeys,
      }),
    enabled: selectedGroupId != null && visibleWeekKeys.length > 0,
  });

  // Per-athlete week overrides (only fetched in athlete mode)
  const { data: athleteWeekOverrides = [] } = useQuery({
    queryKey: [
      "swim-planning-week-overrides",
      selectedAthleteId,
      visibleWeekKeys,
    ],
    queryFn: () =>
      api.getSwimPlanningWeekOverrides({
        athleteId: selectedAthleteId!,
        weekStarts: visibleWeekKeys,
      }),
    enabled: selectedAthleteId != null && visibleWeekKeys.length > 0,
  });

  // ── Effective slots per week (merged in athlete mode) ──
  const effectiveSlotsByWeek = useMemo(() => {
    if (selectedAthleteId == null) {
      // Group mode — slots already match EffectiveSlot shape (overridden is optional).
      return groupSlotsByWeek as unknown as Map<string, EffectiveSlot[]>;
    }
    const overridesByWeek = new Map<string, typeof slotOverrides>();
    for (const o of slotOverrides) {
      const arr = overridesByWeek.get(o.week_start) ?? [];
      arr.push(o);
      overridesByWeek.set(o.week_start, arr);
    }
    const map = new Map<string, EffectiveSlot[]>();
    for (const weekKey of visibleWeekKeys) {
      const groupSlots = groupSlotsByWeek.get(weekKey) ?? [];
      const weekOverrides = overridesByWeek.get(weekKey) ?? [];
      map.set(weekKey, mergeSlots(groupSlots, weekOverrides));
    }
    return map;
  }, [selectedAthleteId, groupSlotsByWeek, slotOverrides, visibleWeekKeys]);

  // ── Effective week meta (merged in athlete mode) ──
  const groupMetaByWeek = useMemo(() => {
    const map = new Map<string, (typeof groupWeekMeta)[number]>();
    for (const m of groupWeekMeta) map.set(m.week_start, m);
    return map;
  }, [groupWeekMeta]);

  const athleteOverrideByWeek = useMemo(() => {
    const map = new Map<string, (typeof athleteWeekOverrides)[number]>();
    for (const o of athleteWeekOverrides) map.set(o.week_start, o);
    return map;
  }, [athleteWeekOverrides]);

  const getEffectiveWeekMeta = useCallback(
    (weekKey: string): EffectiveWeekMeta => {
      const g = groupMetaByWeek.get(weekKey) ?? null;
      const a =
        selectedAthleteId != null
          ? athleteOverrideByWeek.get(weekKey) ?? null
          : null;
      return mergeWeekMeta(g, a);
    },
    [groupMetaByWeek, athleteOverrideByWeek, selectedAthleteId],
  );

  // Existing week types set (from effective meta across visible weeks — both
  // group + athlete overrides contribute).
  const existingWeekTypes = useMemo(() => {
    if (!selectedGroupId) return [];
    const types = new Set<string>();
    for (const weekKey of visibleWeekKeys) {
      const meta = getEffectiveWeekMeta(weekKey);
      if (meta.week_type) types.add(meta.week_type);
    }
    return Array.from(types).sort();
  }, [visibleWeekKeys, selectedGroupId, getEffectiveWeekMeta]);

  // ── Mutations ──

  // Group-mode slot upsert
  const upsertMutation = useMutation({
    mutationFn: (input: Parameters<typeof api.upsertSwimPlanningSlot>[0]) =>
      api.upsertSwimPlanningSlot(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["swim-planning-slots"],
      });
    },
  });

  // Group-mode slot delete
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteSwimPlanningSlot(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["swim-planning-slots"],
      });
    },
  });

  // Athlete-mode slot override upsert
  const upsertOverrideMutation = useMutation({
    mutationFn: (
      input: Parameters<typeof api.upsertSwimPlanningSlotOverride>[0],
    ) => api.upsertSwimPlanningSlotOverride(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["swim-planning-slot-overrides"],
      });
    },
  });

  // Athlete-mode slot override delete
  const deleteOverrideMutation = useMutation({
    mutationFn: (id: string) => api.deleteSwimPlanningSlotOverride(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["swim-planning-slot-overrides"],
      });
    },
  });

  // Group-level week meta upsert
  const upsertGroupMetaMutation = useMutation({
    mutationFn: (
      input: Parameters<typeof api.upsertSwimPlanningWeekMeta>[0],
    ) => api.upsertSwimPlanningWeekMeta(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["swim-planning-week-meta"],
      });
    },
  });

  // Athlete-level week override upsert
  const upsertAthleteWeekOverrideMutation = useMutation({
    mutationFn: (
      input: Parameters<typeof api.upsertSwimPlanningWeekOverride>[0],
    ) => api.upsertSwimPlanningWeekOverride(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["swim-planning-week-overrides"],
      });
    },
  });

  // ── Write helpers (route between group-mode and athlete-mode) ──

  const writeSlot = useCallback(
    (
      input: SwimPlanningSlotWriteInput,
      opts?: { onSuccess?: () => void; onError?: (err: Error) => void },
    ) => {
      if (selectedAthleteId != null) {
        upsertOverrideMutation.mutate(
          {
            athlete_id: selectedAthleteId,
            week_start: input.weekKey,
            day_of_week: input.dayIndex,
            time_slot: input.timeSlot,
            filiere: input.filiere,
            session_id: input.session_id,
          },
          {
            onSuccess: () => opts?.onSuccess?.(),
            onError: (err: Error) => opts?.onError?.(err),
          },
        );
        return;
      }
      if (selectedGroupId == null) return;
      upsertMutation.mutate(
        {
          group_id: selectedGroupId,
          week_start: input.weekKey,
          day_of_week: input.dayIndex,
          time_slot: input.timeSlot,
          filiere: input.filiere,
          session_id: input.session_id,
        },
        {
          onSuccess: () => opts?.onSuccess?.(),
          onError: (err: Error) => opts?.onError?.(err),
        },
      );
    },
    [selectedAthleteId, selectedGroupId, upsertMutation, upsertOverrideMutation],
  );

  const deleteSlot = useCallback(
    (
      slot: EffectiveSlot,
      opts?: { onSuccess?: () => void; onError?: (err: Error) => void },
    ) => {
      if (selectedAthleteId != null) {
        // Athlete mode: only delete if the cell is actually an override.
        if (!slot.overridden || !slot.overrideId) return;
        deleteOverrideMutation.mutate(slot.overrideId, {
          onSuccess: () => opts?.onSuccess?.(),
          onError: (err: Error) => opts?.onError?.(err),
        });
        return;
      }
      deleteMutation.mutate(slot.id, {
        onSuccess: () => opts?.onSuccess?.(),
        onError: (err: Error) => opts?.onError?.(err),
      });
    },
    [selectedAthleteId, deleteMutation, deleteOverrideMutation],
  );

  const writeWeekMeta = useCallback(
    (
      weekKey: string,
      week_type: string | null,
      notes: string | null,
      opts?: { onSuccess?: () => void; onError?: (err: Error) => void },
    ) => {
      if (selectedAthleteId != null) {
        upsertAthleteWeekOverrideMutation.mutate(
          {
            athlete_id: selectedAthleteId,
            week_start: weekKey,
            week_type,
            notes,
          },
          {
            onSuccess: () => opts?.onSuccess?.(),
            onError: (err: Error) => opts?.onError?.(err),
          },
        );
        return;
      }
      if (selectedGroupId == null) return;
      upsertGroupMetaMutation.mutate(
        {
          group_id: selectedGroupId,
          week_start: weekKey,
          week_type,
          notes,
        },
        {
          onSuccess: () => opts?.onSuccess?.(),
          onError: (err: Error) => opts?.onError?.(err),
        },
      );
    },
    [
      selectedAthleteId,
      selectedGroupId,
      upsertGroupMetaMutation,
      upsertAthleteWeekOverrideMutation,
    ],
  );

  const isPending =
    upsertMutation.isPending ||
    upsertOverrideMutation.isPending ||
    deleteMutation.isPending ||
    deleteOverrideMutation.isPending ||
    upsertGroupMetaMutation.isPending ||
    upsertAthleteWeekOverrideMutation.isPending;

  return {
    selectedAthleteId,
    setSelectedAthleteId,
    selectedAthlete,
    groupAthletes,
    effectiveSlotsByWeek,
    getEffectiveWeekMeta,
    existingWeekTypes,
    writeSlot,
    deleteSlot,
    writeWeekMeta,
    isPending,
  };
}
