import { useEffect } from 'react';
import { toast } from "sonner";
import { queryClient } from '@/lib/queryClient';

interface PushPayload {
  title?: string;
  body?: string;
  url?: string;
  [key: string]: unknown;
}

/**
 * Hook that bridges foreground push messages from the Service Worker to React.
 * Displays in-app toasts for foreground push notifications and invalidates
 * related query cache (notifications, coach comments).
 *
 * Must be called once at app level (e.g., in App.tsx).
 * Safe on SSR and when Service Worker is unavailable.
 */
export function useInAppPushBridge() {
  useEffect(() => {
    // Early return on SSR or no SW support
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    const handleMessage = (event: MessageEvent) => {
      // Filter for eac-push messages
      if (event.data?.type !== 'eac-push') {
        return;
      }

      const payload = event.data.payload as PushPayload;
      if (!payload) {
        return;
      }

      // Extract title and body
      const title = payload.title || 'Notification';
      const body = payload.body || '';

      // Show in-app toast
      toast(title, { description: body, duration: 5000 });

      // Invalidate notification-related queries to refresh stale data
      void queryClient.invalidateQueries({
        queryKey: ['notifications'],
      });
      void queryClient.invalidateQueries({
        queryKey: ['coach-comments-recent-48h'],
      });
    };

    // Register the message listener
    navigator.serviceWorker.addEventListener('message', handleMessage);

    // Cleanup: remove listener on unmount
    return () => {
      navigator.serviceWorker.removeEventListener('message', handleMessage);
    };
  }, [toast]);
}
