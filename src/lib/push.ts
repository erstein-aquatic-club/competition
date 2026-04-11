/**
 * Web Push subscription management — browser-side.
 *
 * Re-exports the pure helpers from pushHelpers.ts and adds
 * browser-dependent functions that interact with the PushManager API
 * and Supabase.
 */
import { supabase } from "@/lib/supabase";
import { VAPID_PUBLIC_KEY } from "@/lib/pushConfig";

// Re-export pure helpers so consumers can import everything from one place.
export { urlBase64ToUint8Array, serializeSubscription } from "@/lib/pushHelpers";
import { urlBase64ToUint8Array, serializeSubscription } from "@/lib/pushHelpers";

export function isPushSupported(): boolean {
  return "PushManager" in window && "serviceWorker" in navigator;
}

export function getPushPermission(): NotificationPermission {
  return Notification.permission;
}

async function getPushRegistration(): Promise<ServiceWorkerRegistration | null> {
  const cached = (window as any).__pwaRegistration as ServiceWorkerRegistration | undefined;
  if (cached) return cached;

  if (!("serviceWorker" in navigator)) return null;

  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) {
    (window as any).__pwaRegistration = existing;
    return existing;
  }

  try {
    const ready = await navigator.serviceWorker.ready;
    if (ready) {
      (window as any).__pwaRegistration = ready;
      return ready;
    }
  } catch {
    return null;
  }

  return null;
}

export async function subscribeToPush(userId: number): Promise<boolean> {
  if (!isPushSupported() || !VAPID_PUBLIC_KEY) return false;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;

  const reg = await getPushRegistration();
  if (!reg) return false;

  const existingSubscription = await reg.pushManager.getSubscription();
  const subscription = existingSubscription ?? await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  });

  const { endpoint, p256dh, auth } = serializeSubscription(subscription);
  const deviceInfo = `${navigator.userAgent.slice(0, 100)}`;

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: userId,
      endpoint,
      p256dh,
      auth,
      device_info: deviceInfo,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,endpoint" },
  );

  if (!error) {
    // Clean up stale endpoints for this user (browser may have rotated the endpoint)
    await supabase.from("push_subscriptions").delete()
      .eq("user_id", userId).neq("endpoint", endpoint);
  }

  return !error;
}

export async function unsubscribeFromPush(userId: number): Promise<boolean> {
  const reg = await getPushRegistration();
  if (!reg) return false;

  const subscription = await reg.pushManager.getSubscription();
  if (subscription) {
    await subscription.unsubscribe();
    await supabase
      .from("push_subscriptions")
      .delete()
      .eq("user_id", userId)
      .eq("endpoint", subscription.endpoint);
  }
  return true;
}

export async function hasActivePushSubscription(): Promise<boolean> {
  const reg = await getPushRegistration();
  if (!reg) return false;
  const subscription = await reg.pushManager.getSubscription();
  return subscription !== null;
}
