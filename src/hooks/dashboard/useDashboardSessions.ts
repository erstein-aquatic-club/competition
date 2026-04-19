import { useCallback, useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Session, Assignment } from "@/lib/api";
import { getSwimmerSessions } from "@/lib/api/swimmerSessions";
import type { SwimmerSession, SwimmerTrainingSlot } from "@/lib/api/types";
import {
  assignmentIso,
  assignmentPlannedKm,
  pickAssignmentSlotKey,
  safeLinesFromText,
  type PlannedSession,
  type SlotKey,
} from "./internal";

interface Params {
  sessions: Session[] | undefined;
  assignments: Assignment[] | undefined;
  userId: number | null | undefined;
  swimmerSlots?: SwimmerTrainingSlot[] | undefined;
}

/**
 * Hook responsible for every read-side projection of session data:
 * - Groups assignments by ISO date
 * - Indexes swimmer slots by day-of-week
 * - Resolves per-day planned sessions (`getSessionsForISO`)
 * - Bridges logged sessions back to their planned session id (`getLogForSession`)
 *
 * Pure read — does not own any UI state.
 */
export function useDashboardSessions({ sessions, assignments, userId, swimmerSlots }: Params) {
  const swimAssignments = useMemo(() => {
    const list = Array.isArray(assignments) ? assignments : [];
    return list.filter((a) => a?.session_type === "swim");
  }, [assignments]);

  const assignmentsByIso = useMemo(() => {
    const map = new Map<string, Assignment[]>();
    for (const a of swimAssignments) {
      const iso = assignmentIso(a as unknown as Record<string, unknown>);
      if (!iso) continue;
      if (!map.has(iso)) map.set(iso, []);
      map.get(iso)!.push(a);
    }
    for (const [iso, list] of map.entries()) {
      list.sort((x: Assignment, y: Assignment) => Number(x?.id ?? 0) - Number(y?.id ?? 0));
      map.set(iso, list);
    }
    return map;
  }, [swimAssignments]);

  const swimSlots = useMemo(() => {
    if (!swimmerSlots?.length) return [];
    return swimmerSlots.filter((s) => {
      const loc = s.location?.toLowerCase() ?? "";
      return !loc.includes("salle");
    });
  }, [swimmerSlots]);

  const slotsByDayOfWeek = useMemo(() => {
    const map = new Map<number, SwimmerTrainingSlot[]>();
    for (const s of swimSlots) {
      if (!map.has(s.day_of_week)) map.set(s.day_of_week, []);
      map.get(s.day_of_week)!.push(s);
    }
    return map;
  }, [swimSlots]);

  const hasSwimmerSlots = swimSlots.length > 0;

  const datesNeedingResolution = useMemo(() => {
    if (!hasSwimmerSlots || !userId) return [] as string[];
    return Array.from(assignmentsByIso.keys()).sort();
  }, [hasSwimmerSlots, userId, assignmentsByIso]);

  const resolutionRange = useMemo(() => {
    if (datesNeedingResolution.length === 0) return null;
    return {
      from: datesNeedingResolution[0]!,
      to: datesNeedingResolution[datesNeedingResolution.length - 1]!,
    };
  }, [datesNeedingResolution]);

  const { data: swimmerSessionsData, isLoading: isResolvingAssignments } = useQuery({
    queryKey: [
      "swimmer-sessions",
      userId,
      resolutionRange?.from ?? null,
      resolutionRange?.to ?? null,
    ],
    queryFn: () =>
      getSwimmerSessions(userId!, resolutionRange!.from, resolutionRange!.to, false),
    enabled: !!userId && resolutionRange != null,
    staleTime: 2 * 60 * 1000,
  });

  // Rebuild a lookup keyed by `${swimmer_slot_id}:${iso}` for per-slot access.
  const swimmerSessionByKey = useMemo(() => {
    const map = new Map<string, SwimmerSession>();
    if (!swimmerSessionsData) return map;
    for (const row of swimmerSessionsData) {
      if (!row.swimmer_slot_id) continue;
      map.set(`${row.swimmer_slot_id}:${row.scheduled_date}`, row);
    }
    return map;
  }, [swimmerSessionsData]);

  // Index assignments by id so we can hydrate full details from the RPC rows.
  const swimAssignmentsById = useMemo(() => {
    const map = new Map<number, Assignment>();
    for (const a of swimAssignments) {
      const id = Number(a?.id);
      if (Number.isFinite(id)) map.set(id, a);
    }
    return map;
  }, [swimAssignments]);

  const logsBySessionId = useMemo(() => {
    const list = Array.isArray(sessions) ? sessions : [];
    const map: Record<string, Session> = {};
    for (const s of list) {
      const iso = String(s?.date ?? "").slice(0, 10);
      const slot: SlotKey = s?.slot === "Soir" ? "PM" : "AM";
      map[`${iso}__${slot}`] = s;
    }
    return map;
  }, [sessions]);

  const sessionsCacheRef = useRef<Map<string, PlannedSession[]>>(new Map());
  useEffect(() => {
    sessionsCacheRef.current.clear();
  }, [assignmentsByIso, slotsByDayOfWeek, swimmerSessionByKey]);

  const getLogForSession = useCallback(
    (sessionId: string): Session | undefined => {
      if (logsBySessionId[sessionId]) return logsBySessionId[sessionId];

      const parts = sessionId.split("__");
      if (parts.length !== 2) return undefined;
      const [iso, slotId] = parts;

      if (slotId === "AM" || slotId === "PM") return undefined;

      // Synthetic IDs from otherGroupSessions: `${iso}__group_${assignmentId}`
      // Match any log on the same day that carries this assignment_id.
      if (slotId.startsWith("group_")) {
        const assignmentId = Number(slotId.slice(6));
        if (Number.isFinite(assignmentId) && assignmentId > 0) {
          const datePrefix = `${iso}__`;
          for (const [key, log] of Object.entries(logsBySessionId)) {
            if (key.startsWith(datePrefix) && (log as any).assignment_id === assignmentId) {
              return log;
            }
          }
        }
        return undefined;
      }

      const planned = sessionsCacheRef.current.get(iso);
      const session = planned?.find((s) => s.swimmerSlotId === slotId);
      const assignmentId = session?.assignmentId;

      if (assignmentId) {
        const datePrefix = `${iso}__`;
        for (const [key, log] of Object.entries(logsBySessionId)) {
          if (key.startsWith(datePrefix) && (log as any).assignment_id === assignmentId) {
            return log;
          }
        }
      }

      const slotObj = swimmerSlots?.find((s) => s.id === slotId);
      if (slotObj) {
        const hour = parseInt(slotObj.start_time.split(":")[0], 10);
        const legacySlot: SlotKey = hour < 13 ? "AM" : "PM";
        return logsBySessionId[`${iso}__${legacySlot}`];
      }

      return undefined;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sessionsCacheRef is invalidated when assignmentsByIso changes
    [logsBySessionId, swimmerSlots, assignmentsByIso],
  );

  const getSessionsForISO = useCallback(
    (iso: string): PlannedSession[] => {
      const cache = sessionsCacheRef.current;
      if (cache.has(iso)) return cache.get(iso)!;

      const dateObj = new Date(iso + "T00:00:00");
      const jsDay = dateObj.getDay();
      const dayOfWeek = jsDay === 0 ? 7 : jsDay;

      const daySlots = slotsByDayOfWeek.get(dayOfWeek);
      const dayAssignments = assignmentsByIso.get(iso) ?? [];

      if (hasSwimmerSlots && (!daySlots || daySlots.length === 0)) {
        cache.set(iso, []);
        return [];
      }

      if (hasSwimmerSlots && daySlots && daySlots.length > 0) {
        const list: PlannedSession[] = daySlots.map((slot) => {
          const hour = parseInt(slot.start_time.split(":")[0], 10);
          const slotKey: SlotKey = hour < 13 ? "AM" : "PM";
          const slotTime = `${slot.start_time.slice(0, 5)}-${slot.end_time.slice(0, 5)}`;

          const row = swimmerSessionByKey.get(`${slot.id}:${iso}`);
          const assignmentId = row?.assignment_id ?? null;
          const hydratedAssignment =
            assignmentId != null ? swimAssignmentsById.get(assignmentId) : undefined;

          if (assignmentId != null) {
            const a = hydratedAssignment;
            const aRecord = (a ?? {}) as unknown as Record<string, unknown>;
            const plannedKm = a
              ? assignmentPlannedKm(aRecord)
              : row?.assignment_total_km != null
                ? Number(row.assignment_total_km)
                : null;
            const details = Array.isArray(aRecord?.details)
              ? (aRecord.details as string[]).map(String)
              : safeLinesFromText(a?.description);

            return {
              id: `${iso}__${slot.id}`,
              iso,
              slotKey,
              title: String(a?.title ?? row?.assignment_title ?? "Séance coach"),
              km: plannedKm,
              details,
              assignmentId,
              isEmpty: false,
              slotTime,
              slotLocation: slot.location,
              assignmentSource: row?.assignment_source ?? "group",
              swimmerSlotId: slot.id,
            };
          }

          if (dayAssignments.length > 0) {
            const slotScheduledSlot = hour < 13 ? "morning" : "evening";
            const fallback =
              dayAssignments.find((a) => a.target_user_id === userId) ??
              dayAssignments.find(
                (a) =>
                  !a.target_user_id &&
                  (a.assigned_slot === slotScheduledSlot ||
                    pickAssignmentSlotKey(a as unknown as Record<string, unknown>, 0) === slotKey),
              );
            if (fallback) {
              const fRecord = fallback as unknown as Record<string, unknown>;
              return {
                id: `${iso}__${slot.id}`,
                iso,
                slotKey,
                title: String(fallback.title ?? "Séance coach"),
                km: assignmentPlannedKm(fRecord),
                details: safeLinesFromText(fallback.description),
                assignmentId:
                  typeof fallback.id === "number" ? fallback.id : Number(fallback.id) || undefined,
                isEmpty: false,
                slotTime,
                slotLocation: slot.location,
                assignmentSource: fallback.target_user_id === userId ? "individual" : "group",
                swimmerSlotId: slot.id,
              };
            }
          }

          return {
            id: `${iso}__${slot.id}`,
            iso,
            slotKey,
            title: "Séance vide",
            km: null,
            details: [],
            isEmpty: true,
            slotTime,
            slotLocation: slot.location,
            assignmentSource: "none" as const,
            swimmerSlotId: slot.id,
          };
        });

        cache.set(iso, list);
        return list;
      }

      // Legacy path
      const list: PlannedSession[] = [
        { id: `${iso}__AM`, iso, slotKey: "AM", title: "Séance vide", km: null, details: [], isEmpty: true },
        { id: `${iso}__PM`, iso, slotKey: "PM", title: "Séance vide", km: null, details: [], isEmpty: true },
      ];

      const sortedAssignments = dayAssignments
        .slice()
        .sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0));
      const usedSlots = new Set<SlotKey>();

      sortedAssignments.forEach((a, idx: number) => {
        const aRecord = a as unknown as Record<string, unknown>;
        const slotKey = pickAssignmentSlotKey(aRecord, idx);
        if (usedSlots.has(slotKey)) return;

        const slotIndex = slotKey === "AM" ? 0 : 1;
        const plannedKm = assignmentPlannedKm(aRecord);
        const details = Array.isArray(aRecord?.details)
          ? (aRecord.details as string[]).map(String)
          : safeLinesFromText(a?.description);

        list[slotIndex] = {
          id: `${iso}__${slotKey}`,
          iso,
          slotKey,
          title: String(a?.title ?? "Séance coach"),
          km: plannedKm,
          details,
          assignmentId: typeof a?.id === "number" ? a.id : Number(a?.id) || undefined,
          isEmpty: false,
        };
        usedSlots.add(slotKey);
      });

      cache.set(iso, list);
      return list;
    },
    [
      assignmentsByIso,
      slotsByDayOfWeek,
      hasSwimmerSlots,
      userId,
      swimmerSessionByKey,
      swimAssignmentsById,
      isResolvingAssignments,
    ],
  );

  return {
    assignmentsByIso,
    logsBySessionId,
    getLogForSession,
    getSessionsForISO,
  };
}
