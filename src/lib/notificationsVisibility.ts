import type { Notification } from "@/lib/api";

const DISMISSED_NOTIFICATIONS_STORAGE_PREFIX = "profile-notifications-dismissed";

function normalizeTargetIds(values: unknown[]) {
  return Array.from(
    new Set(
      values
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0),
    ),
  );
}

function resolveStorage(storage?: Storage | null) {
  if (storage !== undefined) return storage;
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

export function getDismissedNotificationsStorageKey(userId: number) {
  return `${DISMISSED_NOTIFICATIONS_STORAGE_PREFIX}:${userId}`;
}

export function readDismissedNotificationTargetIds(userId: number, storage?: Storage | null): number[] {
  if (userId <= 0) return [];

  const targetStorage = resolveStorage(storage);
  if (!targetStorage) return [];

  try {
    const raw = targetStorage.getItem(getDismissedNotificationsStorageKey(userId));
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];

    return normalizeTargetIds(parsed);
  } catch {
    return [];
  }
}

export function persistDismissedNotificationTargetIds(
  userId: number,
  targetIds: number[],
  storage?: Storage | null,
) {
  if (userId <= 0) return;

  const targetStorage = resolveStorage(storage);
  if (!targetStorage) return;

  targetStorage.setItem(
    getDismissedNotificationsStorageKey(userId),
    JSON.stringify(normalizeTargetIds(targetIds)),
  );
}

export function filterVisibleNotifications(
  notifications: Notification[],
  dismissedTargetIds: number[],
) {
  if (dismissedTargetIds.length === 0) return notifications;

  const dismissedSet = new Set(dismissedTargetIds);
  return notifications.filter(
    (notification) =>
      notification.target_id == null || !dismissedSet.has(notification.target_id),
  );
}

export function getDismissedUnreadTargetIds(
  notifications: Notification[],
  dismissedTargetIds: number[],
) {
  if (dismissedTargetIds.length === 0) return [];

  const dismissedSet = new Set(dismissedTargetIds);

  return Array.from(
    new Set(
      notifications
        .filter(
          (notification) =>
            notification.target_id != null &&
            dismissedSet.has(notification.target_id) &&
            !notification.read,
        )
        .map((notification) => notification.target_id as number),
    ),
  );
}
