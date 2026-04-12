import assert from "node:assert/strict";
import { test } from "node:test";

import type { Notification } from "@/lib/api";
import {
  filterVisibleNotifications,
  getDismissedUnreadTargetIds,
  persistDismissedNotificationTargetIds,
  readDismissedNotificationTargetIds,
} from "@/lib/notificationsVisibility";

function buildNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: overrides.id ?? 1,
    notification_id: overrides.notification_id ?? null,
    target_id: overrides.target_id,
    target_user_id: overrides.target_user_id ?? 42,
    target_group_id: overrides.target_group_id ?? null,
    target_group_name: overrides.target_group_name ?? null,
    sender_id: overrides.sender_id ?? null,
    sender_email: overrides.sender_email ?? null,
    sender_name: overrides.sender_name ?? null,
    sender_role: overrides.sender_role ?? null,
    counterparty_id: overrides.counterparty_id ?? null,
    counterparty_name: overrides.counterparty_name ?? null,
    counterparty_role: overrides.counterparty_role ?? null,
    sender: overrides.sender ?? "Coach",
    title: overrides.title ?? "Message",
    message: overrides.message ?? "",
    type: overrides.type ?? "message",
    read: overrides.read ?? false,
    date: overrides.date ?? "2026-04-12T09:00:00.000Z",
    metadata: overrides.metadata ?? null,
    related_id: overrides.related_id,
  };
}

function createMemoryStorage(seed: Record<string, string> = {}): Storage {
  const store = new Map(Object.entries(seed));

  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key) {
      store.delete(key);
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
  };
}

test("readDismissedNotificationTargetIds keeps only finite unique ids", () => {
  const storage = createMemoryStorage({
    "profile-notifications-dismissed:12": JSON.stringify([4, "7", 4, "abc", null]),
  });

  assert.deepEqual(readDismissedNotificationTargetIds(12, storage), [4, 7]);
});

test("persistDismissedNotificationTargetIds saves finite unique ids", () => {
  const storage = createMemoryStorage();

  persistDismissedNotificationTargetIds(12, [4, 7, 4, Number.NaN], storage);

  assert.equal(
    storage.getItem("profile-notifications-dismissed:12"),
    JSON.stringify([4, 7]),
  );
});

test("filterVisibleNotifications hides only matching target ids", () => {
  const notifications = [
    buildNotification({ id: 1, target_id: 10 }),
    buildNotification({ id: 2, target_id: 11 }),
    buildNotification({ id: 3 }),
  ];

  assert.deepEqual(
    filterVisibleNotifications(notifications, [10]).map((notification) => notification.id),
    [2, 3],
  );
});

test("getDismissedUnreadTargetIds returns unique unread dismissed ids", () => {
  const notifications = [
    buildNotification({ id: 1, target_id: 10, read: false }),
    buildNotification({ id: 2, target_id: 10, read: false }),
    buildNotification({ id: 3, target_id: 11, read: true }),
    buildNotification({ id: 4, target_id: 12, read: false }),
  ];

  assert.deepEqual(getDismissedUnreadTargetIds(notifications, [10, 11]), [10]);
});
