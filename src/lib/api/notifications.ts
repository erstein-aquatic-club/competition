/**
 * API Notifications - Notification management methods
 */

import {
  supabase,
  canUseSupabase,
  safeInt,
  safeOptionalInt,
  delay,
  fetchUserGroupIds,
  STORAGE_KEYS,
  assertSupabase,
} from './client';
import type { Notification } from './types';
import type { NotificationListResult } from './helpers';
import { localStorageGet, localStorageSave } from './localStorage';

export async function getNotifications(athleteName: string): Promise<Notification[]> {
  await delay(200);
  const notifs = (localStorageGet(STORAGE_KEYS.NOTIFICATIONS) || []) as any[];
  return notifs
    .filter((n: any) => n.target_athlete === athleteName || n.target_athlete === "All")
    .reverse();
}

export async function notifications_send(payload: {
  title: string;
  body?: string | null;
  type: "message" | "assignment" | "birthday";
  targets: Array<{ target_user_id?: number | null; target_group_id?: number | null }>;
  reply_to_target_id?: number;
}) {
  if (canUseSupabase()) {
    const notif = assertSupabase(
      await supabase
        .from("notifications")
        .insert({
          title: payload.title,
          body: payload.body ?? null,
          type: payload.type,
        })
        .select("id")
        .single()
    );
    if (notif && payload.targets.length > 0) {
      const { error: targetError } = await supabase
        .from("notification_targets")
        .insert(
        payload.targets.map((target) => ({
          notification_id: notif.id,
          target_user_id: target.target_user_id ?? null,
          target_group_id: target.target_group_id ?? null,
        })),
        );
      if (targetError) throw new Error(targetError.message);
      // Push delivery handled by pg_net trigger (00044)
    }

    // Log the notification for history
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: senderRow } = await supabase
          .from("users")
          .select("id")
          .eq("auth_uid", user.id)
          .single();
        if (senderRow) {
          const targetUserIds = payload.targets
            .map((t) => t.target_user_id)
            .filter((id): id is number => id != null);
          const targetGroupIds = payload.targets
            .map((t) => t.target_group_id)
            .filter((id): id is number => id != null);
          const targetType = targetGroupIds.length > 0 ? "group" : targetUserIds.length > 0 ? "user" : "all";
          const targetIds = targetType === "group" ? targetGroupIds : targetUserIds;
          await supabase.from("notification_log").insert({
            sender_id: senderRow.id,
            title: payload.title,
            body: payload.body ?? null,
            target_type: targetType,
            target_ids: targetIds,
            recipient_count: payload.targets.length,
          });
        }
      }
    } catch { /* non-blocking */ }

    return { status: "sent" };
  }
  const notifs = (localStorageGet(STORAGE_KEYS.NOTIFICATIONS) || []) as any[];
  const baseNotif = {
    sender: "Coach",
    title: payload.title,
    message: payload.body || "",
    type: payload.type,
  };
  const entries = payload.targets.map((target, index) => ({
    ...baseNotif,
    id: Date.now() + index,
    read: false,
    date: new Date().toISOString(),
    sender_id: null,
    sender_email: null,
    target_user_id: target.target_user_id ?? null,
    target_group_id: target.target_group_id ?? null,
  }));
  localStorageSave(STORAGE_KEYS.NOTIFICATIONS, [...notifs, ...entries]);
  return { status: "sent" };
}

export async function markNotificationRead(id: number) {
  const notifs = (localStorageGet(STORAGE_KEYS.NOTIFICATIONS) || []) as any[];
  const updated = notifs.map((n: any) => (n.id === id ? { ...n, read: true } : n));
  localStorageSave(STORAGE_KEYS.NOTIFICATIONS, updated);
}

async function fetchUserDismissedNotificationIds(userId?: number | null): Promise<Set<number>> {
  if (!userId || !canUseSupabase()) return new Set();
  const { data, error } = await supabase
    .from("notification_dismissals")
    .select("notification_id")
    .eq("user_id", userId);
  if (error || !data) return new Set();
  return new Set(data.map((row: { notification_id: number }) => row.notification_id));
}

export async function notifications_list(options: {
  targetUserId?: number | null;
  targetAthleteName?: string | null;
  limit?: number;
  offset?: number;
  order?: "asc" | "desc";
  status?: "read" | "unread";
  type?: "message" | "assignment" | "birthday";
  from?: string;
  to?: string;
}): Promise<NotificationListResult> {
  const limitRaw = options.limit ?? 20;
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(Number(limitRaw), 1), 200)
    : 20;
  const offsetRaw = options.offset ?? 0;
  const offset = Number.isFinite(offsetRaw) ? Math.max(Number(offsetRaw), 0) : 0;
  const order = options.order === "asc" ? "asc" : "desc";

  if (canUseSupabase()) {
    const groupIds = await fetchUserGroupIds(options.targetUserId ?? null);
    const orFilters: string[] = [];
    if (options.targetUserId) {
      orFilters.push(`target_user_id.eq.${options.targetUserId}`);
    }
    groupIds.forEach((gid) => orFilters.push(`target_group_id.eq.${gid}`));
    if (!orFilters.length) {
      return { notifications: [], pagination: { limit, offset, total: 0 } };
    }
    let query = supabase
      .from("notification_targets")
      .select("*, notifications!inner(*)")
      .or(orFilters.join(","))
      .order("notifications(created_at)", { ascending: order === "asc" });
    if (options.status === "read") {
      query = query.not("read_at", "is", null);
    } else if (options.status === "unread") {
      query = query.is("read_at", null);
    }
    if (options.type) {
      query = query.eq("notifications.type", options.type);
    }
    if (options.from) {
      query = query.gte("notifications.created_at", options.from);
    }
    if (options.to) {
      query = query.lte("notifications.created_at", options.to + "T23:59:59");
    }
    const [{ data: rawTargets, error }, dismissedIds] = await Promise.all([
      query,
      fetchUserDismissedNotificationIds(options.targetUserId ?? null),
    ]);
    if (error) throw new Error(error.message);
    const nowMs = Date.now();
    const filteredTargets = (rawTargets ?? []).filter((t: any) => {
      const notif = t?.notifications;
      if (!notif) return true;
      if (dismissedIds.has(notif.id)) return false;
      if (notif.expires_at) {
        const expiresMs = Date.parse(notif.expires_at);
        if (Number.isFinite(expiresMs) && expiresMs <= nowMs) return false;
      }
      return true;
    });
    const mapped = filteredTargets.map((t: any) => {
      const notif = t.notifications || {};
      return {
        id: safeInt(t.id, Date.now()),
        notification_id: safeOptionalInt(notif.id) ?? null,
        target_id: safeOptionalInt(t.id) ?? undefined,
        target_user_id: safeOptionalInt(t.target_user_id) ?? null,
        sender_id: safeOptionalInt(notif.created_by) ?? null,
        sender_email: null,
        target_group_id: safeOptionalInt(t.target_group_id) ?? null,
        target_group_name: null,
        sender_name: null,
        sender_role: null,
        counterparty_id: null,
        counterparty_name: null,
        counterparty_role: null,
        sender: notif.created_by ? "Coach" : "Système",
        title: String(notif.title || ""),
        message: String(notif.body || ""),
        type: String(notif.type || "message"),
        read: Boolean(t.read_at),
        date: notif.created_at || new Date().toISOString(),
        metadata: notif.metadata && typeof notif.metadata === "object" ? notif.metadata : null,
      };
    });
    const total = mapped.length;
    const paged = mapped.slice(offset, offset + limit);
    return { notifications: paged, pagination: { limit, offset, total } };
  }

  await delay(200);
  const notifs = (localStorageGet(STORAGE_KEYS.NOTIFICATIONS) || []) as any[];
  const filtered = notifs.filter((notif: any) => {
    if (options.targetUserId && notif.target_user_id !== options.targetUserId) {
      return false;
    }
    if (options.targetAthleteName) {
      const matchesName =
        notif.target_athlete === options.targetAthleteName ||
        notif.target_athlete === "All";
      if (!matchesName) return false;
    }
    if (options.type && notif.type !== options.type) return false;
    if (options.status === "read" && !notif.read) return false;
    if (options.status === "unread" && notif.read) return false;
    return true;
  });
  const sorted = filtered.sort((a: any, b: any) => {
    const aDate = new Date(a.date || a.created_at || 0).getTime();
    const bDate = new Date(b.date || b.created_at || 0).getTime();
    return order === "asc" ? aDate - bDate : bDate - aDate;
  });
  const total = sorted.length;
  const page = sorted.slice(offset, offset + limit);
  const notifications = page.map((notif: any) => ({
    id: safeInt(notif.id, Date.now()),
    notification_id: safeOptionalInt(notif.notification_id) ?? null,
    target_user_id: safeOptionalInt(notif.target_user_id) ?? null,
    sender_id: safeOptionalInt(notif.sender_id) ?? null,
    sender_email: notif.sender_email ? String(notif.sender_email) : null,
    sender: String(notif.sender || "Coach"),
    title: String(notif.title || ""),
    message: String(notif.message || ""),
    type: String(notif.type || "message"),
    read: Boolean(notif.read),
    date: notif.date || new Date().toISOString(),
    metadata: notif.metadata && typeof notif.metadata === "object" ? notif.metadata : null,
    related_id: notif.related_id ?? undefined,
  }));
  return { notifications, pagination: { limit, offset, total } };
}

export async function notifications_mark_read(payload: {
  targetId?: number;
  id?: number;
}) {
  const resolvedId = payload.targetId ?? payload.id;
  if (!resolvedId) {
    throw new Error("Missing target id");
  }
  if (canUseSupabase()) {
    assertSupabase(
      await supabase
        .from("notification_targets")
        .update({ read_at: new Date().toISOString() })
        .eq("id", resolvedId)
    );
    return;
  }

  const notifs = (localStorageGet(STORAGE_KEYS.NOTIFICATIONS) || []) as any[];
  const updated = notifs.map((notif: any) =>
    notif.id === resolvedId ? { ...notif, read: true } : notif,
  );
  localStorageSave(STORAGE_KEYS.NOTIFICATIONS, updated);
}

/**
 * §161 — Nettoyage serveur des notifications visibles pour l'utilisateur.
 * Personal targets (target_user_id = userId) → DELETE (RLS permet depuis §00139).
 * Group targets (target_group_id, partagées) → INSERT dans notification_dismissals
 * pour masquer persistently sans affecter les autres membres du groupe.
 *
 * Renvoie le bilan pour toast / debug. Idempotent : re-run OK (ignoreDuplicates sur dismissals).
 */
export async function notifications_clear_all(options: {
  userId: number;
}): Promise<{ deleted: number; dismissed: number }> {
  if (!canUseSupabase()) {
    const notifs = (localStorageGet(STORAGE_KEYS.NOTIFICATIONS) || []) as any[];
    const remaining = notifs.filter(
      (n: any) => n.target_user_id !== options.userId && n.target_user_id != null,
    );
    localStorageSave(STORAGE_KEYS.NOTIFICATIONS, remaining);
    return { deleted: notifs.length - remaining.length, dismissed: 0 };
  }

  if (!options.userId) return { deleted: 0, dismissed: 0 };

  const groupIds = await fetchUserGroupIds(options.userId);
  const orFilters: string[] = [`target_user_id.eq.${options.userId}`];
  groupIds.forEach((gid) => orFilters.push(`target_group_id.eq.${gid}`));

  const { data: targets, error: fetchError } = await supabase
    .from("notification_targets")
    .select("id, target_user_id, target_group_id, notification_id")
    .or(orFilters.join(","));
  if (fetchError) throw new Error(fetchError.message);
  if (!targets || targets.length === 0) return { deleted: 0, dismissed: 0 };

  const personalTargetIds = targets
    .filter((t: any) => t.target_user_id === options.userId)
    .map((t: any) => t.id as number);
  const groupNotifIds = Array.from(
    new Set(
      targets
        .filter((t: any) => t.target_group_id != null)
        .map((t: any) => t.notification_id as number),
    ),
  );

  let deleted = 0;
  let dismissed = 0;

  if (personalTargetIds.length > 0) {
    const { error: delError, count } = await supabase
      .from("notification_targets")
      .delete({ count: "exact" })
      .in("id", personalTargetIds);
    if (delError) throw new Error(delError.message);
    deleted = count ?? personalTargetIds.length;
  }

  if (groupNotifIds.length > 0) {
    const rows = groupNotifIds.map((nid) => ({
      user_id: options.userId,
      notification_id: nid,
    }));
    const { error: insError } = await supabase
      .from("notification_dismissals")
      .upsert(rows, {
        onConflict: "user_id,notification_id",
        ignoreDuplicates: true,
      });
    if (insError) throw new Error(insError.message);
    dismissed = groupNotifIds.length;
  }

  return { deleted, dismissed };
}
