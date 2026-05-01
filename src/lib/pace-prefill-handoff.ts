import type { Stroke } from "./paceCalculator";
import type { PoolSize } from "./poolConversion";

export const PACE_PREFILL_KEY = "eac-pace-prefill-v1";

export interface PacePrefillPayload {
  swimmer_account_id: number;
  stroke: Stroke;
  target_distance_m: number;
  target_time_ms: number;
  target_pool_size: PoolSize;
}

function isValidPayload(v: unknown): v is PacePrefillPayload {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.swimmer_account_id === "number" &&
    typeof o.stroke === "string" &&
    typeof o.target_distance_m === "number" &&
    typeof o.target_time_ms === "number" &&
    (o.target_pool_size === "25m" || o.target_pool_size === "50m")
  );
}

export function setPacePrefill(
  payload: PacePrefillPayload,
  storage: Storage = sessionStorage,
): void {
  try {
    storage.setItem(PACE_PREFILL_KEY, JSON.stringify(payload));
  } catch {
    /* quota — silent */
  }
}

export function consumePacePrefill(
  storage: Storage = sessionStorage,
): PacePrefillPayload | null {
  let raw: string | null;
  try { raw = storage.getItem(PACE_PREFILL_KEY); } catch { return null; }
  if (!raw) return null;
  try { storage.removeItem(PACE_PREFILL_KEY); } catch { /* ignore */ }
  try {
    const parsed = JSON.parse(raw);
    return isValidPayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
