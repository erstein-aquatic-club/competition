/**
 * API Assignments - Assignment management methods
 */

import {
  supabase,
  canUseSupabase,
  safeInt,
  safeOptionalInt,
  delay,
  fetchUserGroupIds,
  fetchUserGroupIdsWithContext,
  STORAGE_KEYS,
} from './client';
import type { Assignment, CoachAssignment } from './types';
import { localStorageGet, localStorageSave } from './localStorage';
import { getSwimCatalog } from './swim';
import { getStrengthSessions } from './strength';


export async function getAssignmentsForCoach(): Promise<Assignment[] | null> {
  if (canUseSupabase()) {
    return null;
  }
  await delay(100);
  return (localStorageGet(STORAGE_KEYS.ASSIGNMENTS) || []) as Assignment[];
}

export async function getAssignments(
  athleteName: string,
  athleteId?: number | null,
  options?: { assignmentType?: "swim" | "strength"; status?: string },
): Promise<Assignment[]> {
  if (canUseSupabase()) {
    const { permanentGroupIds, temporaryGroupIds, hasActiveTemporary } =
      await fetchUserGroupIdsWithContext(athleteId ?? null);
    const orFilters: string[] = [];
    if (athleteId !== null && athleteId !== undefined) {
      orFilters.push(`target_user_id.eq.${athleteId}`);
    }
    const visibleGroupIds = hasActiveTemporary ? temporaryGroupIds : permanentGroupIds;
    visibleGroupIds.forEach((gid) => orFilters.push(`target_group_id.eq.${gid}`));
    if (!orFilters.length) return [];

    let query = supabase
      .from("session_assignments")
      .select("*")
      .or(orFilters.join(","));
    if (options?.assignmentType) {
      query = query.eq("assignment_type", options.assignmentType);
    }
    if (options?.status) {
      query = query.eq("status", options.status);
    } else {
      query = query.neq("status", "completed");
    }
    const { data: rawAssignments, error } = await query;
    if (error) throw new Error(error.message);
    if (!rawAssignments?.length) return [];

    const [swimCatalogs, strengthCatalogs] = await Promise.all([
      getSwimCatalog(),
      getStrengthSessions(),
    ]);
    const swimById = new Map(swimCatalogs.map((catalog) => [catalog.id, catalog]));
    const strengthById = new Map(
      strengthCatalogs.map((session) => [session.id, session]),
    );
    const mapped = rawAssignments.map((assignment: any) => {
      const sessionType =
        assignment.assignment_type === "strength" ? "strength" : "swim";
      const sessionId =
        safeOptionalInt(
          sessionType === "swim"
            ? assignment.swim_catalog_id
            : assignment.strength_session_id,
        ) ?? 0;
      const scheduledDate = assignment.scheduled_date || assignment.created_at || "";
      const status = String(assignment.status || "assigned");
      const swimSession =
        sessionType === "swim" ? swimById.get(sessionId) : undefined;
      const strengthSession =
        sessionType === "strength" ? strengthById.get(sessionId) : undefined;
      const base = {
        id: safeInt(assignment.id, Date.now()),
        session_id: sessionId,
        session_type: sessionType,
        title:
          sessionType === "swim"
            ? (swimSession?.name ?? "Séance natation")
            : (strengthSession?.title ?? "Séance musculation"),
        description:
          (swimSession?.description ?? strengthSession?.description) ?? "",
        assigned_date: scheduledDate || new Date().toISOString(),
        assigned_slot: assignment.scheduled_slot ?? null,
        status,
        items: strengthSession?.items ?? swimSession?.items,
      } as Assignment & { cycle?: string; assigned_slot?: string | null };
      if (sessionType === "strength") {
        base.cycle = strengthSession?.cycle ?? "endurance";
      }
      return base;
    });
    const unique = new Map(mapped.map((assignment) => [assignment.id, assignment]));
    return Array.from(unique.values());
  }

  await delay(200);
  const all = (localStorageGet(STORAGE_KEYS.ASSIGNMENTS) || []) as any[];
  return all.filter((a: any) => {
    const matchesUserId =
      athleteId !== null &&
      athleteId !== undefined &&
      String(athleteId) !== "" &&
      String(a.target_user_id) === String(athleteId);
    const matchesUser = matchesUserId || a.target_athlete === athleteName;
    if (!matchesUser) return false;
    if (options?.assignmentType && a.session_type !== options.assignmentType) return false;
    if (options?.status) return a.status === options.status;
    return a.status !== "completed";
  });
}

export async function assignments_create(
  data: {
    assignment_type?: "swim" | "strength";
    session_type?: "swim" | "strength";
    session_id: number;
    target_athlete?: string;
    target_user_id?: number | null;
    target_group_id?: number | null;
    assigned_date?: string;
    scheduled_date?: string;
    scheduled_slot?: "morning" | "evening";
  },
  currentUserId?: number | null,
) {
  const assignmentType = data.assignment_type ?? data.session_type;
  if (!assignmentType) return { status: "error" };
  const scheduledDate =
    data.scheduled_date ?? data.assigned_date ?? new Date().toISOString();
  if (canUseSupabase()) {
    const insertPayload: Record<string, unknown> = {
      assignment_type: assignmentType,
      scheduled_date: scheduledDate,
      scheduled_slot: data.scheduled_slot ?? null,
      assigned_by: currentUserId ?? null,
      status: "assigned",
    };
    if (assignmentType === "swim") {
      insertPayload.swim_catalog_id = data.session_id;
    } else {
      insertPayload.strength_session_id = data.session_id;
    }
    if (data.target_user_id !== null && data.target_user_id !== undefined) {
      insertPayload.target_user_id = data.target_user_id;
    } else if (data.target_group_id !== null && data.target_group_id !== undefined) {
      insertPayload.target_group_id = data.target_group_id;
    }
    const { data: created, error } = await supabase
      .from("session_assignments")
      .insert(insertPayload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    // Create notification
    const { data: notif, error: notifError } = await supabase
      .from("notifications")
      .insert({
        title: "Nouvelle séance assignée",
        body: `Séance prévue le ${scheduledDate}.`,
        type: "assignment",
      })
      .select("id")
      .single();
    if (!notifError && notif) {
      const targetPayload: Record<string, unknown> = { notification_id: notif.id };
      if (data.target_user_id) targetPayload.target_user_id = data.target_user_id;
      if (data.target_group_id) targetPayload.target_group_id = data.target_group_id;
      await supabase
        .from("notification_targets")
        .insert(targetPayload);
      // Push delivery handled by pg_net trigger (00044)
    }
    return { status: "assigned" };
  }

  // Fetch source session to copy details (simplification for mock)
  let source: any;
  if (assignmentType === "swim") {
    source = ((localStorageGet(STORAGE_KEYS.SWIM_SESSIONS) || []) as any[]).find(
      (s: any) => s.id === data.session_id,
    );
  } else {
    source = ((localStorageGet(STORAGE_KEYS.STRENGTH_SESSIONS) || []) as any[]).find(
      (s: any) => s.id === data.session_id,
    );
  }

  if (!source) return { status: "error" };

  const assignment = {
    id: Date.now(),
    session_id: data.session_id,
    session_type: assignmentType,
    target_athlete: data.target_athlete ?? "",
    target_user_id: data.target_user_id ?? null,
    target_group_id: data.target_group_id ?? null,
    assigned_date: scheduledDate,
    title: source.name ?? source.title,
    description: source.description,
    items: source.items,
    status: "assigned",
  };

  const all = (localStorageGet(STORAGE_KEYS.ASSIGNMENTS) || []) as any[];
  localStorageSave(STORAGE_KEYS.ASSIGNMENTS, [...all, assignment]);

  // Create Notification
  const notifs = (localStorageGet(STORAGE_KEYS.NOTIFICATIONS) || []) as any[];
  localStorageSave(STORAGE_KEYS.NOTIFICATIONS, [
    ...notifs,
    {
      id: Date.now() + 1,
      sender: "Coach",
      target_athlete: data.target_athlete,
      target_user_id: data.target_user_id ?? null,
      target_group_id: data.target_group_id ?? null,
      title: "Nouvelle séance assignée",
      message: `Séance ${source.title ?? source.name} prévue le ${scheduledDate}.`,
      type: "assignment",
      related_id: assignment.id,
      read: false,
      date: new Date().toISOString(),
    },
  ]);

  return { status: "assigned" };
}

export async function assignments_delete(assignmentId: number) {
  if (canUseSupabase()) {
    const { error } = await supabase
      .from("session_assignments")
      .delete()
      .eq("id", assignmentId);
    if (error) throw new Error(error.message);
    return { status: "deleted" };
  }

  const assignments = (localStorageGet(STORAGE_KEYS.ASSIGNMENTS) || []) as any[];
  const updated = assignments.filter((assignment: any) => assignment.id !== assignmentId);
  localStorageSave(STORAGE_KEYS.ASSIGNMENTS, updated);
  return { status: "deleted" };
}

export async function getCoachAssignments(filters: {
  groupId?: number | null;
  userId?: number | null;
  from: string;   // ISO date
  to: string;     // ISO date
}): Promise<CoachAssignment[]> {
  if (!canUseSupabase()) return [];

  let query = supabase
    .from("session_assignments")
    .select("*")
    .gte("scheduled_date", filters.from)
    .lte("scheduled_date", filters.to);

  if (filters.groupId) {
    query = query.eq("target_group_id", filters.groupId);
  } else if (filters.userId) {
    // Include both direct user assignments AND assignments targeting user's groups
    const { permanentGroupIds, temporaryGroupIds, hasActiveTemporary } =
      await fetchUserGroupIdsWithContext(filters.userId);
    const orFilters: string[] = [`target_user_id.eq.${filters.userId}`];
    const visibleGroupIds = hasActiveTemporary ? temporaryGroupIds : permanentGroupIds;
    visibleGroupIds.forEach((gid) => orFilters.push(`target_group_id.eq.${gid}`));
    query = query.or(orFilters.join(","));
  } else {
    return [];
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  if (!data?.length) return [];

  const [swimCatalogs, strengthCatalogs] = await Promise.all([
    getSwimCatalog(),
    getStrengthSessions(),
  ]);
  const swimById = new Map(swimCatalogs.map((c) => [c.id, c]));
  const strengthById = new Map(strengthCatalogs.map((s) => [s.id, s]));

  return data.map((row: any) => {
    const type = row.assignment_type === "strength" ? "strength" : "swim";
    const sessionId = safeOptionalInt(
      type === "swim" ? row.swim_catalog_id : row.strength_session_id
    ) ?? 0;
    const swim = type === "swim" ? swimById.get(sessionId) : undefined;
    const strength = type === "strength" ? strengthById.get(sessionId) : undefined;

    return {
      id: safeInt(row.id, 0),
      title: type === "swim"
        ? (swim?.name ?? "Séance natation")
        : (strength?.title ?? "Séance musculation"),
      type,
      scheduledDate: row.scheduled_date ?? "",
      scheduledSlot: row.scheduled_slot ?? null,
      targetLabel: "",  // Will be enriched by the caller if needed
      targetType: row.target_group_id ? "group" : "user",
      status: row.status ?? "assigned",
    } satisfies CoachAssignment;
  });
}

// ── Slot-centric helpers ────────────────────────────────────────────

/** Derive morning/evening from a training slot start_time (HH:MM format) */
export function deriveScheduledSlot(startTime: string): "morning" | "evening" {
  const hour = parseInt(startTime.split(":")[0], 10);
  return hour < 13 ? "morning" : "evening";
}

/** Create one assignment per group for a session on a specific slot+date */
export async function bulkCreateSlotAssignments(params: {
  swimCatalogId: number;
  trainingSlotId: string;
  scheduledDate: string;
  groupIds: number[];
  scheduledSlot: "morning" | "evening";
  visibleFrom: string | null;
  assignedBy: number;
}): Promise<{ created: number }> {
  if (!canUseSupabase()) throw new Error("Connexion indisponible");

  const rows = params.groupIds.map((groupId) => ({
    assignment_type: "swim" as const,
    swim_catalog_id: params.swimCatalogId,
    target_group_id: groupId,
    scheduled_date: params.scheduledDate,
    scheduled_slot: params.scheduledSlot,
    training_slot_id: params.trainingSlotId,
    visible_from: params.visibleFrom,
    assigned_by: params.assignedBy,
    status: "assigned",
  }));

  const { data, error } = await supabase
    .from("session_assignments")
    .insert(rows)
    .select("id");

  if (error) throw new Error(error.message);
  return { created: data?.length ?? 0 };
}

/** Get all slot-linked assignments for a date range (coach view) */
export async function getSlotAssignments(params: {
  from: string;
  to: string;
}): Promise<Array<{
  id: number;
  swim_catalog_id: number | null;
  training_slot_id: string | null;
  target_group_id: number | null;
  scheduled_date: string;
  scheduled_slot: string | null;
  visible_from: string | null;
  notified_at: string | null;
  status: string;
  session_name: string | null;
  session_distance: number | null;
}>> {
  if (!canUseSupabase()) return [];

  const { data, error } = await supabase
    .from("session_assignments")
    .select(`
      id, swim_catalog_id, training_slot_id, target_group_id,
      scheduled_date, scheduled_slot, visible_from, notified_at, status,
      swim_sessions_catalog(name)
    `)
    .eq("assignment_type", "swim")
    .gte("scheduled_date", params.from)
    .lte("scheduled_date", params.to)
    .neq("status", "completed")
    .order("scheduled_date");

  if (error) throw new Error(error.message);

  return (data ?? []).map((row: any) => ({
    id: row.id,
    swim_catalog_id: row.swim_catalog_id,
    training_slot_id: row.training_slot_id,
    target_group_id: row.target_group_id,
    scheduled_date: row.scheduled_date,
    scheduled_slot: row.scheduled_slot,
    visible_from: row.visible_from,
    notified_at: row.notified_at,
    status: row.status,
    session_name: row.swim_sessions_catalog?.name ?? null,
    session_distance: null,
  }));
}

/** Update visible_from on all assignments for a slot+date */
export async function updateSlotVisibility(params: {
  trainingSlotId: string;
  scheduledDate: string;
  visibleFrom: string | null;
}): Promise<void> {
  if (!canUseSupabase()) throw new Error("Connexion indisponible");

  const { error } = await supabase
    .from("session_assignments")
    .update({ visible_from: params.visibleFrom })
    .eq("training_slot_id", params.trainingSlotId)
    .eq("scheduled_date", params.scheduledDate);

  if (error) throw new Error(error.message);
}

/** Delete all assignments for a slot+date */
export async function deleteSlotAssignments(params: {
  trainingSlotId: string;
  scheduledDate: string;
}): Promise<void> {
  if (!canUseSupabase()) throw new Error("Connexion indisponible");

  const { error } = await supabase
    .from("session_assignments")
    .delete()
    .eq("training_slot_id", params.trainingSlotId)
    .eq("scheduled_date", params.scheduledDate);

  if (error) throw new Error(error.message);
}

/** Get distinct swim_catalog_ids that have upcoming (today+) slot assignments */
export async function getAssignedSwimCatalogIds(): Promise<Set<number>> {
  if (!canUseSupabase()) return new Set();

  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("session_assignments")
    .select("swim_catalog_id")
    .eq("assignment_type", "swim")
    .gte("scheduled_date", today)
    .neq("status", "completed")
    .not("swim_catalog_id", "is", null);

  if (error) throw new Error(error.message);

  const ids = new Set<number>();
  for (const row of data ?? []) {
    if (row.swim_catalog_id != null) ids.add(row.swim_catalog_id);
  }
  return ids;
}
