/**
 * API Users - User management methods
 */

import {
  supabase,
  canUseSupabase,
  safeInt,
  safeOptionalInt,
  STORAGE_KEYS,
  assertSupabase,
} from './client';
import type {
  UserProfile,
  AthleteSummary,
  GroupSummary,
  UpcomingBirthday,
  UserSummary,
} from './types';
import { localStorageGet } from './localStorage';

export async function getProfile(options: {
  userId?: number | null;
  displayName?: string | null;
}): Promise<UserProfile | null> {
  if (!canUseSupabase()) return null;
  let query = supabase.from("user_profiles").select("*");
  if (options.userId) {
    query = query.eq("user_id", options.userId);
  } else if (options.displayName) {
    query = query.eq("display_name", options.displayName);
  }
  const data = assertSupabase(await query.maybeSingle());
  if (!data) return null;
  return {
    id: data.user_id ?? null,
    display_name: data.display_name ?? null,
    email: data.email ?? null,
    birthdate: data.birthdate ?? null,
    sex: data.sex === 'M' || data.sex === 'F' ? data.sex : null,
    group_id: safeOptionalInt(data.group_id) ?? null,
    group_label: data.group_label ?? null,
    objectives: data.objectives ?? null,
    bio: data.bio ?? null,
    avatar_url: data.avatar_url ?? null,
    ffn_iuf: data.ffn_iuf ?? null,
    phone: data.phone ?? null,
    body_weight: data.body_weight != null ? Number(data.body_weight) : null,
  };
}

export async function updateProfile(payload: {
  userId?: number | null;
  profile: {
    display_name?: string | null;
    group_id?: number | null;
    group_label?: string | null;
    birthdate?: string | null;
    objectives?: string | null;
    bio?: string | null;
    avatar_url?: string | null;
    ffn_iuf?: string | null;
    phone?: string | null;
    body_weight?: number | null;
  };
}) {
  if (!canUseSupabase()) return { status: "skipped" };
  const userId = payload.userId;
  if (!userId) return { status: "skipped" };

  // If the user is setting an IUF, check for and remove any manual duplicate
  const newIuf = payload.profile.ffn_iuf?.trim() || null;
  if (newIuf) {
    const { data: manualDupes, error: dupeErr } = await supabase
      .from("club_record_swimmers")
      .select("id")
      .eq("iuf", newIuf)
      .eq("source_type", "manual");
    if (dupeErr) throw new Error(dupeErr.message);
    if (manualDupes && manualDupes.length > 0) {
      const ids = manualDupes.map((d: any) => d.id);
      const { error: delErr } = await supabase
        .from("club_record_swimmers")
        .delete()
        .in("id", ids);
      if (delErr) throw new Error(delErr.message);
    }
  }

  assertSupabase(await supabase.from("user_profiles").upsert(
    {
      user_id: userId,
      ...payload.profile,
    },
    { onConflict: "user_id" },
  ));

  // Sync display_name to the users table if provided
  if (payload.profile.display_name) {
    const { error: nameErr } = await supabase
      .from("users")
      .update({ display_name: payload.profile.display_name })
      .eq("id", userId);
    if (nameErr) throw new Error(nameErr.message);
  }

  return { status: "updated" };
}

export async function getAthletes(): Promise<AthleteSummary[]> {
  if (!canUseSupabase()) {
    const athletes = new Map<string, AthleteSummary>();
    const addAthlete = (name?: string | null, id?: number | null) => {
      const displayName = String(name ?? "").trim();
      if (!displayName) return;
      const parsedId = id !== null && id !== undefined ? safeOptionalInt(id) : null;
      const key = parsedId !== null ? `id:${parsedId}` : `name:${displayName.toLowerCase()}`;
      if (!athletes.has(key)) {
        athletes.set(key, { id: parsedId, display_name: displayName });
      }
    };
    const sessions = (localStorageGet(STORAGE_KEYS.SESSIONS) ?? []) as any[];
    sessions.forEach((session: any) => addAthlete(session.athlete_name, session.athlete_id));
    const strengthRuns = (localStorageGet(STORAGE_KEYS.STRENGTH_RUNS) ?? []) as any[];
    strengthRuns.forEach((run: any) => addAthlete(run.athlete_name, run.athlete_id));
    const assignments = (localStorageGet(STORAGE_KEYS.ASSIGNMENTS) ?? []) as any[];
    assignments.forEach((assignment: any) =>
      addAthlete(assignment.target_athlete, assignment.target_user_id),
    );
    return Array.from(athletes.values()).sort((a, b) =>
      a.display_name.localeCompare(b.display_name, "fr"),
    );
  }

  // Fetch groups + profiles in parallel (no data dependency — saves 1 RTT)
  const [groupsRes, profilesRes] = await Promise.all([
    supabase.from("groups").select("id, name"),
    supabase.from("user_profiles").select("user_id, ffn_iuf, avatar_url"),
  ]);
  if (groupsRes.error) throw new Error(groupsRes.error.message);
  const groups = groupsRes.data;
  const profiles = profilesRes.data;
  const profileMap = new Map((profiles ?? []).map((p: any) => [p.user_id, p]));

  if (!groups?.length) {
    const { data: users, error: usersError } = await supabase
      .from("users")
      .select("id, display_name, email")
      .eq("role", "athlete")
      .eq("is_active", true);
    if (usersError) throw new Error(usersError.message);
    return (users ?? [])
      .map((u: any) => ({ id: u.id, display_name: u.display_name, email: u.email ?? null, ffn_iuf: profileMap.get(u.id)?.ffn_iuf ?? null, avatar_url: profileMap.get(u.id)?.avatar_url ?? null }))
      .filter((a: AthleteSummary) => a.display_name)
      .sort((a, b) => a.display_name.localeCompare(b.display_name, "fr"));
  }
  const { data: members, error: membersError } = await supabase
    .from("group_members")
    .select("user_id, group_id, users!inner(display_name, role, email), groups!inner(is_temporary)")
    .eq("users.role", "athlete")
    .eq("groups.is_temporary", false);
  if (membersError) throw new Error(membersError.message);
  const groupMap = new Map(groups.map((g: any) => [g.id, g.name]));
  const athleteMap = new Map<number, AthleteSummary>();
  (members ?? []).forEach((m: any) => {
    const userId = m.user_id;
    if (athleteMap.has(userId)) return;
    athleteMap.set(userId, {
      id: userId,
      display_name: (m.users as any)?.display_name ?? "",
      email: (m.users as any)?.email ?? null,
      group_id: m.group_id ?? null,
      group_label: groupMap.get(m.group_id) ?? null,
      ffn_iuf: profileMap.get(userId)?.ffn_iuf ?? null,
      avatar_url: profileMap.get(userId)?.avatar_url ?? null,
    });
  });
  return Array.from(athleteMap.values())
    .filter((a) => a.display_name)
    .sort((a, b) => a.display_name.localeCompare(b.display_name, "fr"));
}

export async function getGroups(): Promise<GroupSummary[]> {
  if (!canUseSupabase()) return [];
  const data = assertSupabase(
    await supabase
      .from("groups")
      .select("id, name, description, is_temporary, is_active, parent_group_id")
  );
  return (data ?? [])
    .filter((g: any) => {
      // Show all permanent groups + active temporary groups
      if (!g.is_temporary) return true;
      return g.is_active === true;
    })
    .map((group: any) => ({
      id: safeInt(group.id, 0),
      name: String(group.name ?? `Groupe ${group.id ?? ""}`).trim(),
      member_count: null,
      is_temporary: group.is_temporary ?? false,
      is_active: group.is_active ?? true,
      parent_group_id: group.parent_group_id ?? null,
    }))
    .filter((g: GroupSummary) => g.id > 0 && g.name)
    .sort((a, b) => {
      // Temporary active groups first, then permanent
      if (a.is_temporary && !b.is_temporary) return -1;
      if (!a.is_temporary && b.is_temporary) return 1;
      return a.name.localeCompare(b.name, "fr");
    });
}

export async function getUpcomingBirthdays(options?: {
  days?: number;
}): Promise<UpcomingBirthday[]> {
  if (!canUseSupabase()) return [];
  const days = options?.days ?? 30;
  const data = assertSupabase(await supabase.rpc("get_upcoming_birthdays", { p_days: days }));
  return Array.isArray(data) ? data : [];
}

export async function listUsers(options?: {
  role?: "athlete" | "coach" | "comite" | "admin";
  includeInactive?: boolean;
}): Promise<UserSummary[]> {
  if (!canUseSupabase()) return [];
  let query = supabase.from("users").select("id, display_name, role, email, is_active");
  if (options?.role) {
    query = query.eq("role", options.role);
  }
  if (!options?.includeInactive) {
    query = query.eq("is_active", true);
  }
  const data = assertSupabase(await query.order("display_name"));
  return (data ?? []).map((user: any) => ({
    id: user.id,
    display_name: user.display_name ?? "",
    role: user.role ?? "",
    email: user.email ?? null,
    is_active: user.is_active ?? null,
    group_label: null,
  }));
}

export async function createCoach(payload: {
  display_name: string;
  email?: string | null;
  password?: string | null;
}) {
  if (!canUseSupabase()) return { status: "skipped", user: null, initialPassword: null };
  const data = assertSupabase(await supabase.functions.invoke("admin-user", {
    body: {
      action: "create_coach",
      display_name: payload.display_name,
      email: payload.email,
      password: payload.password,
    },
  }));
  return {
    status: "created",
    user: data?.user ?? null,
    initialPassword: data?.initial_password ?? null,
  };
}

export async function updateUserRole(payload: {
  userId: number;
  role: "athlete" | "coach" | "comite" | "admin";
}) {
  if (!canUseSupabase()) return { status: "skipped" };
  assertSupabase(await supabase.functions.invoke("admin-user", {
    body: { action: "update_role", user_id: payload.userId, role: payload.role },
  }));
  return { status: "updated" };
}

export async function disableUser(payload: { userId: number }) {
  if (!canUseSupabase()) return { status: "skipped" };
  assertSupabase(await supabase.functions.invoke("admin-user", {
    body: { action: "disable_user", user_id: payload.userId },
  }));
  return { status: "disabled" };
}

export async function getPendingApprovals(): Promise<
  Array<{ user_id: number; display_name: string; email: string | null; created_at: string }>
> {
  if (!canUseSupabase()) return [];
  // Explicitly specify the foreign key to use (user_id, not approved_by)
  const data = assertSupabase(
    await supabase
      .from("user_profiles")
      .select("user_id, display_name, email, users!user_profiles_user_id_fkey(created_at)")
      .eq("is_approved", false)
  );
  // Transform the response to match the expected interface
  return (data ?? []).map((item: any) => ({
    user_id: item.user_id,
    display_name: item.display_name,
    email: item.email,
    created_at: item.users?.created_at ?? new Date().toISOString(),
  }));
}

export async function approveUser(userId: number): Promise<void> {
  if (!canUseSupabase()) return;
  assertSupabase(
    await supabase
      .from("user_profiles")
      .update({ is_approved: true, approved_at: new Date().toISOString() })
      .eq("user_id", userId)
  );
}

export async function rejectUser(userId: number): Promise<void> {
  if (!canUseSupabase()) return;
  // Delete from users table (will cascade to user_profiles and other related tables)
  assertSupabase(
    await supabase
      .from("users")
      .delete()
      .eq("id", userId)
  );
}

export async function authPasswordUpdate(payload: {
  userId?: number | null;
  password: string;
}) {
  if (!canUseSupabase()) return { status: "skipped" };
  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser();
  if (!payload.userId || payload.userId === currentUser?.user_metadata?.app_user_id) {
    const { error } = await supabase.auth.updateUser({ password: payload.password });
    if (error) throw new Error(error.message);
    return { status: "updated" };
  }
  assertSupabase(await supabase.functions.invoke("admin-user", {
    body: { action: "update_password", user_id: payload.userId, password: payload.password },
  }));
  return { status: "updated" };
}

/**
 * §263 — Serialize/deserialize avatar Blob ↔ data URL for the offline queue.
 *
 * `tryWithOfflineQueue` stores payloads as JSON in localStorage, which can't
 * hold a raw `Blob`. We round-trip via base64 data URLs (e.g.
 * `"data:image/png;base64,iVBOR..."`). The data URL embeds the MIME type so
 * the replay path can reconstruct the original Blob exactly.
 *
 * iOS Safari localStorage caps at ~5-10 MB; the caller is expected to enforce
 * a per-avatar size budget before enqueueing (cf. `MAX_AVATAR_OFFLINE_BYTES`
 * in Profile.tsx).
 */
export async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("FileReader failed"));
    reader.readAsDataURL(blob);
  });
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const commaIndex = dataUrl.indexOf(",");
  if (!dataUrl.startsWith("data:") || commaIndex < 0) {
    throw new Error("dataUrlToBlob: not a valid data URL");
  }
  const meta = dataUrl.slice(5, commaIndex);
  const b64 = dataUrl.slice(commaIndex + 1);
  const mimeMatch = meta.match(/^([^;]+)/);
  const mime = mimeMatch ? mimeMatch[1] : "application/octet-stream";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export async function uploadAvatar(payload: {
  userId: number;
  blob: Blob;
  mimeType: string;
  extension: string;
}): Promise<string> {
  if (!canUseSupabase()) throw new Error("Supabase non disponible");

  const filePath = `${payload.userId}.${payload.extension}`;

  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(filePath, payload.blob, {
      contentType: payload.mimeType,
      upsert: true,
    });
  if (uploadError) throw new Error(uploadError.message);

  const { data: urlData } = supabase.storage
    .from("avatars")
    .getPublicUrl(filePath);

  const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;

  const { error: profileError } = await supabase
    .from("user_profiles")
    .update({ avatar_url: publicUrl })
    .eq("user_id", payload.userId);
  if (profileError) throw new Error(profileError.message);

  return publicUrl;
}

export async function deleteAvatar(userId: number): Promise<void> {
  if (!canUseSupabase()) return;

  assertSupabase(
    await supabase.storage
      .from("avatars")
      .remove([`${userId}.webp`, `${userId}.jpg`])
  );

  const { error: profileError } = await supabase
    .from("user_profiles")
    .update({ avatar_url: null })
    .eq("user_id", userId);
  if (profileError) throw new Error(profileError.message);
}

export async function getAthletesPaginated(opts: {
  offset?: number;
  limit?: number;
  search?: string;
  groupId?: number;
} = {}): Promise<{ athletes: AthleteSummary[]; total: number }> {
  if (!canUseSupabase()) {
    const all = await getAthletes();
    return { athletes: all, total: all.length };
  }
  const data = assertSupabase(await supabase.rpc('get_athletes_paginated', {
    p_offset: opts.offset ?? 0,
    p_limit: opts.limit ?? 20,
    p_search: opts.search ?? null,
    p_group_id: opts.groupId ?? null,
  }));
  return { athletes: data?.athletes ?? [], total: data?.total ?? 0 };
}

export async function getRecentSessionsAllAthletes(days = 30): Promise<
  Array<{
    athlete_id: number | null;
    athlete_name: string;
    session_date: string;
    effort: number | null;
    performance: number | null;
    engagement: number | null;
    fatigue: number | null;
  }>
> {
  if (!canUseSupabase()) return [];
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceISO = since.toISOString().slice(0, 10);

  const data = assertSupabase(
    await supabase
      .from("dim_sessions")
      .select("athlete_id, athlete_name, session_date, rpe, performance, engagement, fatigue")
      .gte("session_date", sinceISO)
      .order("session_date", { ascending: false })
  );

  return (data ?? []).map((row: any) => ({
    athlete_id: row.athlete_id ? safeInt(row.athlete_id) : null,
    athlete_name: String(row.athlete_name ?? ""),
    session_date: String(row.session_date ?? ""),
    effort: safeOptionalInt(row.rpe),
    performance: safeOptionalInt(row.performance),
    engagement: safeOptionalInt(row.engagement),
    fatigue: safeOptionalInt(row.fatigue),
  }));
}

export async function getFeedbackRatesAllAthletes(
  daysBack = 30,
): Promise<Record<number, { assigned: number; feedback: number; total: number }>> {
  if (!canUseSupabase()) return {};
  const data = assertSupabase(await supabase.rpc("get_feedback_rates_all_athletes", {
    days_back: daysBack,
  }));
  const record: Record<number, { assigned: number; feedback: number; total: number }> = {};
  for (const row of data ?? []) {
    record[Number(row.athlete_id)] = {
      assigned: Number(row.assigned_count),
      feedback: Number(row.feedback_count),
      total: Number(row.total_slots),
    };
  }
  return record;
}
