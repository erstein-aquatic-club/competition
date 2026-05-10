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
  assertSupabase,
} from './client';
import type { Assignment, CoachAssignment, ResolvedSlotAssignment } from './types';
import { localStorageGet, localStorageSave } from './localStorage';
import { getSwimCatalog } from './swim';
import { getStrengthSessions } from './strength';
import { getSwimmerSlots } from './swimmer-slots';
import { calculateSwimTotalDistance } from '@/lib/swimSessionUtils';


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
    const rawAssignments = assertSupabase(await query);
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
        training_slot_id: assignment.training_slot_id ?? null,
        target_user_id: safeOptionalInt(assignment.target_user_id) ?? null,
      } as Assignment & { cycle?: string };
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
    assertSupabase(
      await supabase
        .from("session_assignments")
        .insert(insertPayload)
        .select("id")
        .single()
    );
    // Notif + push délégués au trigger SQL `auto_notify_session_assignment`
    // (migration 00045) qui crée 1 notification + 1 target par INSERT, puis le
    // trigger pg_net (00044) appelle push-send. Doublon retiré §194.
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
    assertSupabase(
      await supabase
        .from("session_assignments")
        .delete()
        .eq("id", assignmentId)
    );
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

  const data = assertSupabase(await query);
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

/**
 * Create one assignment per group for a session on a specific slot+date.
 *
 * Individual assignments (target_user_id IS NOT NULL) on the same slot+date
 * are NOT modified — they are fetched before the insert so the caller can
 * inform the coach that those swimmers keep their personal session (§144).
 */
export async function bulkCreateSlotAssignments(params: {
  swimCatalogId: number;
  trainingSlotId: string;
  scheduledDate: string;
  groupIds: number[];
  scheduledSlot: "morning" | "evening";
  visibleFrom: string | null;
  assignedBy: number;
  targetSubgroupId?: number;
}): Promise<{
  created: number;
  preservedIndividuals: Array<{
    userId: number;
    displayName: string;
    sessionTitle: string;
  }>;
}> {
  if (!canUseSupabase()) throw new Error("Connexion indisponible");

  if (!params.groupIds.length) {
    throw new Error("Aucun groupe à assigner");
  }

  if (
    params.visibleFrom &&
    params.scheduledDate &&
    params.visibleFrom > params.scheduledDate
  ) {
    throw new Error(
      "La date de visibilité ne peut pas être postérieure au jour du créneau",
    );
  }

  // Check for existing assignments on the same slot+date+groups to prevent duplicates
  const { data: existing, error: checkError } = await supabase
    .from("session_assignments")
    .select("id")
    .eq("training_slot_id", params.trainingSlotId)
    .eq("scheduled_date", params.scheduledDate)
    .in("target_group_id", params.groupIds);
  if (checkError) throw new Error(checkError.message);
  if (existing && existing.length > 0) {
    throw new Error("Ces groupes ont déjà des assignations sur ce créneau");
  }

  // Fetch individuals that will be preserved (informational; not modified).
  const { data: individualsRaw, error: individualsError } = await supabase
    .from("session_assignments")
    .select(
      `target_user_id,
       users:users!session_assignments_target_user_id_fkey(display_name),
       swim_sessions_catalog(name)`,
    )
    .eq("training_slot_id", params.trainingSlotId)
    .eq("scheduled_date", params.scheduledDate)
    .not("target_user_id", "is", null);
  if (individualsError) throw new Error(individualsError.message);

  const preservedIndividuals = ((individualsRaw ?? []) as Array<{
    target_user_id: number;
    users?: { display_name?: string | null } | { display_name?: string | null }[] | null;
    swim_sessions_catalog?: { name?: string | null } | { name?: string | null }[] | null;
  }>).map((row) => {
    const userRec = Array.isArray(row.users) ? row.users[0] : row.users;
    const catalogRec = Array.isArray(row.swim_sessions_catalog)
      ? row.swim_sessions_catalog[0]
      : row.swim_sessions_catalog;
    return {
      userId: row.target_user_id,
      displayName: userRec?.display_name ?? "Nageur",
      sessionTitle: catalogRec?.name ?? "Séance",
    };
  });

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
    ...(params.targetSubgroupId ? { target_subgroup_id: params.targetSubgroupId } : {}),
  }));

  const { data, error } = await supabase
    .from("session_assignments")
    .insert(rows)
    .select("id");

  if (error) {
    // Unique violation on idx_sa_unique_slot_group_v2 means a concurrent
    // request raced past the pre-check and created the assignment first.
    if ((error as { code?: string }).code === "23505") {
      throw new Error("Ces groupes ont déjà des assignations sur ce créneau");
    }
    throw new Error(error.message);
  }
  return { created: data?.length ?? 0, preservedIndividuals };
}

/**
 * Assign a swim session to a single swimmer on a specific training slot+date.
 *
 * Unlike `assignments_create` (generic group/user inserter), this helper is
 * slot-aware: it writes `training_slot_id` so the session shows up on the
 * swimmer's personalised calendar (§144). Relies on the unique index
 * `idx_sa_unique_slot_user_v1` (migration 00130) to prevent duplicates.
 */
export async function assignIndividualSession(params: {
  swimCatalogId: number;
  trainingSlotId: string;
  scheduledDate: string;
  targetUserId: number;
  scheduledSlot: "morning" | "evening";
  visibleFrom: string | null;
  assignedBy: number;
}): Promise<{ assignmentId: number }> {
  if (!canUseSupabase()) throw new Error("Connexion indisponible");

  const { data, error } = await supabase
    .from("session_assignments")
    .insert({
      assignment_type: "swim" as const,
      swim_catalog_id: params.swimCatalogId,
      target_user_id: params.targetUserId,
      scheduled_date: params.scheduledDate,
      scheduled_slot: params.scheduledSlot,
      training_slot_id: params.trainingSlotId,
      visible_from: params.visibleFrom,
      assigned_by: params.assignedBy,
      status: "assigned",
    })
    .select("id")
    .single();

  if (error) {
    if ((error as { code?: string }).code === "23505") {
      throw new Error("Ce nageur a déjà une séance individuelle sur ce créneau");
    }
    throw new Error(error.message);
  }
  return { assignmentId: (data as { id: number }).id };
}

/** Get all slot-linked assignments for a date range (coach view) */
export async function getSlotAssignments(params: {
  from: string;
  to: string;
  /**
   * Include rows with status="completed". The planning views drop them by
   * default (noise), but the "Ma semaine" widget needs them — otherwise past
   * sessions whose swimmers have all submitted feedback look unassigned.
   */
  includeCompleted?: boolean;
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

  let query = supabase
    .from("session_assignments")
    .select(`
      id, swim_catalog_id, training_slot_id, target_group_id,
      scheduled_date, scheduled_slot, visible_from, notified_at, status,
      swim_sessions_catalog(name, total_distance, swim_session_items(distance, raw_payload))
    `)
    .eq("assignment_type", "swim")
    .gte("scheduled_date", params.from)
    .lte("scheduled_date", params.to)
    .order("scheduled_date");

  if (!params.includeCompleted) {
    query = query.neq("status", "completed");
  }

  const data = assertSupabase(await query);

  return (data ?? []).map((row: any) => {
    const catalog = row.swim_sessions_catalog;
    const storedDistance: number | null = catalog?.total_distance ?? null;
    const computedDistance: number | null = Array.isArray(catalog?.swim_session_items)
      ? calculateSwimTotalDistance(catalog.swim_session_items)
      : null;
    return {
      id: row.id,
      swim_catalog_id: row.swim_catalog_id,
      training_slot_id: row.training_slot_id,
      target_group_id: row.target_group_id,
      scheduled_date: row.scheduled_date,
      scheduled_slot: row.scheduled_slot,
      visible_from: row.visible_from,
      notified_at: row.notified_at,
      status: row.status,
      session_name: catalog?.name ?? null,
      session_distance: storedDistance ?? computedDistance,
    };
  });
}

/**
 * Update visible_from on all assignments for a slot+date.
 * TODO: If per-group visibility is ever needed, add an optional groupIds param
 * and scope the UPDATE with `.in("target_group_id", groupIds)`. Currently the
 * design is intentionally slot-wide: one training slot = one visibility setting.
 */
export async function updateSlotVisibility(params: {
  trainingSlotId: string;
  scheduledDate: string;
  visibleFrom: string | null;
}): Promise<void> {
  if (!canUseSupabase()) throw new Error("Connexion indisponible");

  assertSupabase(
    await supabase
      .from("session_assignments")
      .update({ visible_from: params.visibleFrom })
      .eq("training_slot_id", params.trainingSlotId)
      .eq("scheduled_date", params.scheduledDate)
  );
}

/**
 * Delete group assignments for a slot+date.
 *
 * Scoped to `target_user_id IS NULL` so individual swim assignments are
 * preserved — removing a group session must not clobber a swimmer's personal
 * assignment on the same slot/date (§144).
 */
export async function deleteSlotAssignments(params: {
  trainingSlotId: string;
  scheduledDate: string;
}): Promise<void> {
  if (!canUseSupabase()) throw new Error("Connexion indisponible");

  assertSupabase(
    await supabase
      .from("session_assignments")
      .delete()
      .eq("training_slot_id", params.trainingSlotId)
      .eq("scheduled_date", params.scheduledDate)
      .is("target_user_id", null)
  );
}

/** Get distinct swim_catalog_ids that have upcoming (today+) slot assignments */
export async function getAssignedSwimCatalogIds(): Promise<Set<number>> {
  if (!canUseSupabase()) return new Set();

  const today = new Date().toISOString().slice(0, 10);
  const data = assertSupabase(
    await supabase
      .from("session_assignments")
      .select("swim_catalog_id")
      .eq("assignment_type", "swim")
      .gte("scheduled_date", today)
      .neq("status", "completed")
      .not("swim_catalog_id", "is", null)
  );

  const ids = new Set<number>();
  for (const row of data ?? []) {
    if (row.swim_catalog_id != null) ids.add(row.swim_catalog_id);
  }
  return ids;
}

/** Get ALL distinct swim_catalog_ids that have EVER been assigned. */
export async function getEverAssignedSwimCatalogIds(): Promise<Set<number>> {
  if (!canUseSupabase()) return new Set();

  const data = assertSupabase(
    await supabase
      .from("session_assignments")
      .select("swim_catalog_id")
      .eq("assignment_type", "swim")
      .not("swim_catalog_id", "is", null)
  );

  const ids = new Set<number>();
  for (const row of data ?? []) {
    if (row.swim_catalog_id != null) ids.add(row.swim_catalog_id);
  }
  return ids;
}

/** Get unassigned swim slot occurrences over the past 30 days (J-30 → J-1). */
export async function getUnassignedSlots30d(): Promise<Array<{
  slot_id: string;
  scheduled_date: string;   // YYYY-MM-DD
  day_of_week: number;      // 1=Mon…7=Sun (ISO)
  start_time: string;       // HH:MM:SS
  end_time: string;         // HH:MM:SS
  location: string | null;
}>> {
  if (!canUseSupabase()) return [];
  const data = assertSupabase(await supabase.rpc("get_unassigned_slot_instances_30d"));
  return (data ?? []).map((row: any) => ({
    slot_id: String(row.slot_id),
    scheduled_date: String(row.scheduled_date),
    day_of_week: Number(row.day_of_week),
    start_time: String(row.start_time),
    end_time: String(row.end_time),
    location: row.location ?? null,
  }));
}

// ── Swimmer-centric resolution ─────────────────────────────────────

/**
 * Resolve which session assignments a swimmer sees for a given date,
 * based on their personal training slots and inherited group assignments.
 *
 * Priority: individual (target_user_id) > subgroup > group.
 */
/**
 * Batch-resolve which session assignments a swimmer sees for multiple dates at once.
 * Replaces N parallel calls to resolveSwimmerAssignments with a single set of DB queries.
 */
export async function resolveSwimmerAssignmentsBatch(
  userId: number,
  dates: string[], // Array of ISO dates YYYY-MM-DD
): Promise<Map<string, ResolvedSlotAssignment[]>> {
  const results = new Map<string, ResolvedSlotAssignment[]>();
  if (!canUseSupabase() || dates.length === 0) return results;

  // 1. Fetch swimmer's personal slots (all days — one query)
  const allSlots = await getSwimmerSlots(userId);
  if (allSlots.length === 0) {
    for (const date of dates) results.set(date, []);
    return results;
  }

  // Build a map of dayOfWeek → slots
  const slotsByDay = new Map<number, typeof allSlots>();
  for (const s of allSlots) {
    if (!slotsByDay.has(s.day_of_week)) slotsByDay.set(s.day_of_week, []);
    slotsByDay.get(s.day_of_week)!.push(s);
  }

  // 2. Fetch user's group IDs (one query)
  const { permanentGroupIds, temporaryGroupIds, hasActiveTemporary } =
    await fetchUserGroupIdsWithContext(userId);
  const visibleGroupIds = hasActiveTemporary ? temporaryGroupIds : permanentGroupIds;
  const allGroupIds = [...new Set([...permanentGroupIds, ...temporaryGroupIds])];

  // 3. Resolve source_assignment_id → training_slot_id for swimmer slots (one query)
  const sourceAssignmentIds = allSlots
    .map((s) => s.source_assignment_id)
    .filter((id): id is string => id != null);

  let slotIdByAssignmentId = new Map<string, string>();
  if (sourceAssignmentIds.length > 0) {
    const { data: tsaRows, error: tsaErr } = await supabase
      .from("training_slot_assignments")
      .select("id, slot_id")
      .in("id", sourceAssignmentIds);
    if (!tsaErr && tsaRows) {
      for (const row of tsaRows) {
        slotIdByAssignmentId.set(String(row.id), String(row.slot_id));
      }
    }
  }

  // 4. Fetch ALL session_assignments for ALL dates at once (one query with .in())
  const today = new Date().toISOString().slice(0, 10);
  const orFilters: string[] = [`target_user_id.eq.${userId}`];
  allGroupIds.forEach((gid) => orFilters.push(`target_group_id.eq.${gid}`));

  const { data: saRows, error: saErr } = await supabase
    .from("session_assignments")
    .select(`
      id, assignment_type, swim_catalog_id, strength_session_id,
      target_user_id, target_group_id, target_subgroup_id,
      training_slot_id, scheduled_date, scheduled_slot, status,
      visible_from,
      swim_sessions_catalog(name, total_distance)
    `)
    .in("scheduled_date", dates)
    .neq("status", "cancelled")
    .or(orFilters.join(","));

  if (saErr) throw new Error(saErr.message);

  // Filter by visibility and group by date
  const assignmentsByDate = new Map<string, any[]>();
  for (const row of (saRows ?? [])) {
    if (row.visible_from && row.visible_from > today) continue;
    const d = row.scheduled_date as string;
    if (!assignmentsByDate.has(d)) assignmentsByDate.set(d, []);
    assignmentsByDate.get(d)!.push(row);
  }

  // 5. Fetch strength session titles if needed (one query)
  const strengthIds = new Set<number>();
  for (const row of (saRows ?? [])) {
    if (row.assignment_type === "strength" && row.strength_session_id) {
      strengthIds.add(row.strength_session_id);
    }
  }
  let strengthById = new Map<number, { title: string; description: string }>();
  if (strengthIds.size > 0) {
    const sessions = await getStrengthSessions();
    strengthById = new Map(sessions.map((s) => [s.id, { title: s.title, description: s.description }]));
  }

  // Helper to build an Assignment object from a raw DB row
  const toAssignment = (row: any, date: string): Assignment => {
    const type = row.assignment_type === "strength" ? "strength" : "swim";
    const sessionId = safeOptionalInt(
      type === "swim" ? row.swim_catalog_id : row.strength_session_id,
    ) ?? 0;
    let title: string;
    let description = "";
    if (type === "swim") {
      title = (row.swim_sessions_catalog as any)?.name ?? "Séance natation";
    } else {
      const s = strengthById.get(sessionId);
      title = s?.title ?? "Séance musculation";
      description = s?.description ?? "";
    }
    return {
      id: safeInt(row.id, 0),
      session_id: sessionId,
      session_type: type,
      title,
      description,
      assigned_date: row.scheduled_date ?? date,
      status: String(row.status || "assigned"),
    };
  };

  const getTotalKm = (row: any): number | null => {
    if (row.assignment_type === "swim") {
      const dist = (row.swim_sessions_catalog as any)?.total_distance;
      return dist != null ? Number(dist) : null;
    }
    return null;
  };

  // 6. Resolve for each date
  for (const date of dates) {
    // Parse local ISO date → use local getDay() to avoid a TZ shift
    // (new Date("YYYY-MM-DDT00:00:00") is local; getUTCDay() would wrap
    // to the previous day in timezones west of UTC+0).
    const d = new Date(date + "T00:00:00");
    const jsDay = d.getDay();
    const dayOfWeek = jsDay === 0 ? 7 : jsDay;

    const daySlots = slotsByDay.get(dayOfWeek);
    if (!daySlots || daySlots.length === 0) {
      results.set(date, []);
      continue;
    }

    const assignments = assignmentsByDate.get(date) ?? [];

    // Build maps for this date
    const assignmentsByTrainingSlotId = new Map<string, any[]>();
    const individualAssignments: any[] = [];

    for (const row of assignments) {
      if (row.target_user_id === userId) {
        individualAssignments.push(row);
      }
      if (row.training_slot_id) {
        const key = String(row.training_slot_id);
        if (!assignmentsByTrainingSlotId.has(key)) {
          assignmentsByTrainingSlotId.set(key, []);
        }
        assignmentsByTrainingSlotId.get(key)!.push(row);
      }
    }

    const dateResults: ResolvedSlotAssignment[] = [];

    for (const slot of daySlots) {
      let sourceTrainingSlotId = slot.source_assignment_id
        ? slotIdByAssignmentId.get(slot.source_assignment_id) ?? null
        : null;

      if (slot.source_assignment_id && !sourceTrainingSlotId) {
        const slotBucket = parseInt(slot.start_time.split(":")[0], 10) < 13 ? "morning" : "evening";
        for (const row of assignments) {
          if (row.training_slot_id && !row.target_user_id) {
            if (row.scheduled_slot === slotBucket) {
              sourceTrainingSlotId = String(row.training_slot_id);
              break;
            }
          }
        }
      }

      const slotTime = `${slot.start_time.slice(0, 5)}-${slot.end_time.slice(0, 5)}`;

      let resolved: any = null;
      let source: ResolvedSlotAssignment['source'] = 'none';
      const alternatives: ResolvedSlotAssignment['alternatives'] = [];

      const individualMatch = individualAssignments.find((row) =>
        sourceTrainingSlotId && String(row.training_slot_id) === sourceTrainingSlotId
      );

      // Try individual match by training_slot_id first
      if (individualMatch) {
        resolved = individualMatch;
        source = 'individual';
      }

      // Try group match by training_slot_id
      if (!resolved && sourceTrainingSlotId) {
        const slotAssignments = assignmentsByTrainingSlotId.get(sourceTrainingSlotId) ?? [];
        const groupAssignments = slotAssignments.filter(
          (row) => row.target_group_id && visibleGroupIds.includes(row.target_group_id),
        );

        const subgroupMatch = groupAssignments.find(
          (row) =>
            row.target_subgroup_id &&
            (allGroupIds.includes(row.target_subgroup_id) ||
              visibleGroupIds.includes(row.target_subgroup_id)),
        );

        if (subgroupMatch) {
          resolved = subgroupMatch;
          source = 'subgroup';
        } else if (groupAssignments.length > 0) {
          resolved = groupAssignments[0];
          source = 'group';
        }

        for (const row of groupAssignments) {
          if (resolved && row.id === resolved.id) continue;
          alternatives.push({
            assignmentId: safeInt(row.id, 0),
            title: toAssignment(row, date).title,
            km: getTotalKm(row),
            subgroupName: undefined,
          });
        }
      }

      // Fallback: training_slot_id mismatch (swimmer slots may reference old training_slots).
      // Match by timing bucket (morning/evening) + group membership.
      if (!resolved) {
        const hour = parseInt(slot.start_time.split(":")[0], 10);
        const slotBucket = hour < 13 ? "morning" : "evening";

        // Try individual by timing
        const indByTiming = individualAssignments.find(
          (row) => row.scheduled_slot === slotBucket || (!row.scheduled_slot && !row.training_slot_id),
        );
        if (indByTiming) {
          resolved = indByTiming;
          source = 'individual';
        } else {
          // Try group by timing
          const groupByTiming = assignments.filter(
            (row) =>
              !row.target_user_id &&
              row.target_group_id && visibleGroupIds.includes(row.target_group_id) &&
              (row.scheduled_slot === slotBucket ||
                (!row.scheduled_slot && row.training_slot_id &&
                  (parseInt(slot.start_time.split(":")[0], 10) >= 13) === (row.scheduled_slot !== "morning"))),
          );
          // Deduplicate: don't pick an assignment already matched to another swimmer slot
          const alreadyUsedIds = new Set(dateResults.map((r) => r.assignmentId).filter(Boolean));
          const availableGroup = groupByTiming.filter((row) => !alreadyUsedIds.has(safeInt(row.id, 0)));
          if (availableGroup.length > 0) {
            resolved = availableGroup[0];
            source = 'group';
            for (let i = 1; i < availableGroup.length; i++) {
              alternatives.push({
                assignmentId: safeInt(availableGroup[i].id, 0),
                title: toAssignment(availableGroup[i], date).title,
                km: getTotalKm(availableGroup[i]),
                subgroupName: undefined,
              });
            }
          }
        }
      }

      dateResults.push({
        swimmerSlotId: slot.id,
        slotTime,
        slotLocation: slot.location,
        slotSessionType: slot.session_type ?? "swim",
        sourceTrainingSlotId,
        assignment: resolved ? toAssignment(resolved, date) : null,
        assignmentId: resolved ? safeInt(resolved.id, 0) : null,
        source,
        alternatives,
      });
    }

    results.set(date, dateResults);
  }

  return results;
}

export async function resolveSwimmerAssignments(
  userId: number,
  date: string, // ISO date YYYY-MM-DD
): Promise<ResolvedSlotAssignment[]> {
  if (!canUseSupabase()) return [];

  // 1. Determine day_of_week (1=Monday … 7=Sunday, ISO standard)
  // Use local getDay() to match the locally-parsed ISO date — getUTCDay()
  // would shift to the previous day in timezones east of UTC (e.g. CEST).
  const d = new Date(date + "T00:00:00");
  const jsDay = d.getDay(); // 0=Sun
  const dayOfWeek = jsDay === 0 ? 7 : jsDay;

  // 2. Fetch swimmer's personal slots (all days, we filter below)
  const allSlots = await getSwimmerSlots(userId);
  const daySlots = allSlots.filter((s) => s.day_of_week === dayOfWeek);
  if (daySlots.length === 0) return [];

  // 3. Fetch user's group IDs
  const { permanentGroupIds, temporaryGroupIds, hasActiveTemporary } =
    await fetchUserGroupIdsWithContext(userId);
  const visibleGroupIds = hasActiveTemporary ? temporaryGroupIds : permanentGroupIds;
  const allGroupIds = [...new Set([...permanentGroupIds, ...temporaryGroupIds])];

  // 4. Resolve source_assignment_id → training_slot_id for each swimmer slot
  const sourceAssignmentIds = daySlots
    .map((s) => s.source_assignment_id)
    .filter((id): id is string => id != null);

  let slotIdByAssignmentId = new Map<string, string>();
  if (sourceAssignmentIds.length > 0) {
    const { data: tsaRows, error: tsaErr } = await supabase
      .from("training_slot_assignments")
      .select("id, slot_id")
      .in("id", sourceAssignmentIds);
    if (!tsaErr && tsaRows) {
      for (const row of tsaRows) {
        slotIdByAssignmentId.set(String(row.id), String(row.slot_id));
      }
    }
  }

  // 5. Fetch ALL session_assignments for this date relevant to the swimmer
  const today = new Date().toISOString().slice(0, 10);
  const orFilters: string[] = [`target_user_id.eq.${userId}`];
  allGroupIds.forEach((gid) => orFilters.push(`target_group_id.eq.${gid}`));

  const { data: saRows, error: saErr } = await supabase
    .from("session_assignments")
    .select(`
      id, assignment_type, swim_catalog_id, strength_session_id,
      target_user_id, target_group_id, target_subgroup_id,
      training_slot_id, scheduled_date, scheduled_slot, status,
      visible_from,
      swim_sessions_catalog(name, total_distance)
    `)
    .eq("scheduled_date", date)
    .neq("status", "cancelled")
    .or(orFilters.join(","));

  if (saErr) throw new Error(saErr.message);

  // Filter by visibility
  const assignments = (saRows ?? []).filter((row: any) => {
    if (row.visible_from && row.visible_from > today) return false;
    return true;
  });

  // 6. Build a map of training_slot_id → assignments
  const assignmentsByTrainingSlotId = new Map<string, any[]>();
  const individualAssignments: any[] = [];

  for (const row of assignments) {
    if (row.target_user_id === userId) {
      individualAssignments.push(row);
    }
    if (row.training_slot_id) {
      const key = String(row.training_slot_id);
      if (!assignmentsByTrainingSlotId.has(key)) {
        assignmentsByTrainingSlotId.set(key, []);
      }
      assignmentsByTrainingSlotId.get(key)!.push(row);
    }
  }

  // 7. Fetch strength session titles if needed (for non-swim assignments)
  const strengthIds = new Set<number>();
  for (const row of assignments) {
    if (row.assignment_type === "strength" && row.strength_session_id) {
      strengthIds.add(row.strength_session_id);
    }
  }
  let strengthById = new Map<number, { title: string; description: string }>();
  if (strengthIds.size > 0) {
    const sessions = await getStrengthSessions();
    strengthById = new Map(sessions.map((s) => [s.id, { title: s.title, description: s.description }]));
  }

  // Helper to build an Assignment object from a raw DB row
  const toAssignment = (row: any): Assignment => {
    const type = row.assignment_type === "strength" ? "strength" : "swim";
    const sessionId = safeOptionalInt(
      type === "swim" ? row.swim_catalog_id : row.strength_session_id,
    ) ?? 0;
    let title: string;
    let description = "";
    if (type === "swim") {
      title = (row.swim_sessions_catalog as any)?.name ?? "Séance natation";
    } else {
      const s = strengthById.get(sessionId);
      title = s?.title ?? "Séance musculation";
      description = s?.description ?? "";
    }
    return {
      id: safeInt(row.id, 0),
      session_id: sessionId,
      session_type: type,
      title,
      description,
      assigned_date: row.scheduled_date ?? date,
      status: String(row.status || "assigned"),
    };
  };

  const getTotalKm = (row: any): number | null => {
    if (row.assignment_type === "swim") {
      const dist = (row.swim_sessions_catalog as any)?.total_distance;
      return dist != null ? Number(dist) : null;
    }
    return null;
  };

  // 8. Resolve for each swimmer slot
  const results: ResolvedSlotAssignment[] = [];

  for (const slot of daySlots) {
    let sourceTrainingSlotId = slot.source_assignment_id
      ? slotIdByAssignmentId.get(slot.source_assignment_id) ?? null
      : null;

    // Warn if swimmer slot references a deleted training_slot_assignment
    if (slot.source_assignment_id && !sourceTrainingSlotId) {
      console.warn(
        `[resolveSwimmerAssignments] Swimmer slot ${slot.id} references deleted training_slot_assignment ${slot.source_assignment_id}. Falling back to timing match.`,
      );
      // Fallback: try to match by start_time bucket instead of training_slot_id
      const slotBucket = parseInt(slot.start_time.split(":")[0], 10) < 13 ? "morning" : "evening";
      for (const row of assignments) {
        if (row.training_slot_id && !row.target_user_id) {
          const rowBucket = row.scheduled_slot;
          if (rowBucket === slotBucket) {
            sourceTrainingSlotId = String(row.training_slot_id);
            break;
          }
        }
      }
    }

    const slotTime = `${slot.start_time.slice(0, 5)}-${slot.end_time.slice(0, 5)}`;

    let resolved: any = null;
    let source: ResolvedSlotAssignment['source'] = 'none';
    const alternatives: ResolvedSlotAssignment['alternatives'] = [];

    // a. Check individual assignments matching this slot's training_slot_id
    const individualMatch = individualAssignments.find((row) =>
      sourceTrainingSlotId && String(row.training_slot_id) === sourceTrainingSlotId
    );

    if (individualMatch) {
      resolved = individualMatch;
      source = 'individual';
    } else if (sourceTrainingSlotId) {
      // b. Check group/subgroup assignments on the same training_slot_id
      const slotAssignments = assignmentsByTrainingSlotId.get(sourceTrainingSlotId) ?? [];

      // Filter to group assignments only (exclude individual ones targeting other users)
      const groupAssignments = slotAssignments.filter(
        (row) => row.target_group_id && visibleGroupIds.includes(row.target_group_id),
      );

      // Prefer subgroup match first, then plain group
      // target_subgroup_id is a group ID (sub-groups are groups with parent_group_id)
      // Match if the swimmer belongs to this sub-group OR any of their groups is a parent
      const subgroupMatch = groupAssignments.find(
        (row) =>
          row.target_subgroup_id &&
          (allGroupIds.includes(row.target_subgroup_id) ||
            visibleGroupIds.includes(row.target_subgroup_id)),
      );

      if (subgroupMatch) {
        resolved = subgroupMatch;
        source = 'subgroup';
      } else if (groupAssignments.length > 0) {
        resolved = groupAssignments[0];
        source = 'group';
      }

      // Collect alternatives (other assignments on same slot, different from resolved)
      for (const row of groupAssignments) {
        if (resolved && row.id === resolved.id) continue;
        alternatives.push({
          assignmentId: safeInt(row.id, 0),
          title: toAssignment(row).title,
          km: getTotalKm(row),
          subgroupName: undefined, // Could be enriched with group name if needed
        });
      }
    }

    results.push({
      swimmerSlotId: slot.id,
      slotTime,
      slotLocation: slot.location,
      slotSessionType: slot.session_type ?? "swim",
      sourceTrainingSlotId,
      assignment: resolved ? toAssignment(resolved) : null,
      assignmentId: resolved ? safeInt(resolved.id, 0) : null,
      source,
      alternatives,
    });
  }

  return results;
}
