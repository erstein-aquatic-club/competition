// Module-level mutex for the offline sync drain loop.
// Prevents double-drain when OfflineMutationSync mounts twice (StrictMode dev,
// rapid unmount/remount around PWAInstallGate transitions) or when multiple
// triggers (online change + queue-updated event + login) fire in parallel.

let isDraining = false;

/**
 * Run `task` exclusively. If a drain is already in progress, the call is a no-op
 * (returns immediately without awaiting). Used to coalesce concurrent sync triggers.
 */
export async function runSyncOnce(task: () => Promise<void>): Promise<void> {
  if (isDraining) return;
  isDraining = true;
  try {
    await task();
  } finally {
    isDraining = false;
  }
}

/** Test-only: reset the mutex flag between tests. */
export function __resetMutex(): void {
  isDraining = false;
}
