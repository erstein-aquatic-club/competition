import { describe, it, expect } from "vitest";
import {
  ZONE_COEFFICIENTS,
  STROKE_ADJUSTMENTS_DEFAULT,
  type EventFamily,
  type Zone,
} from "@/lib/paceData";
import type { TeamMember } from "@/hooks/useMyTeam";
import type { PaceTarget } from "@/lib/api/pace-targets";

// exportPacePdf attend la forme « v2 » des zones : Record<EventFamily, Partial<Record<Zone, number>>>
// (introduite au §186), ainsi que strokeAdjustments + outputPool. La forme « v1 » DEFAULT_ZONES de
// paceCalculator ({ v0_pct, v1_pct, … }) n'est PAS compatible — l'écran coach passe
// mergeZonesWithDefaults(...) (dérivé de ZONE_COEFFICIENTS) + STROKE_ADJUSTMENTS_DEFAULT.
// On reconstruit ici la même base par défaut que la prod (cf. mergeZonesWithDefaults dans
// CoachPaceCalculatorScreen.tsx) à partir des constantes exportées.
const FAMILIES: EventFamily[] = ["50m", "100m", "200m", "400m", "800m_1500m"];
const zones: Record<EventFamily, Partial<Record<Zone, number>>> = (() => {
  const result = {} as Record<EventFamily, Partial<Record<Zone, number>>>;
  for (const f of FAMILIES) {
    const c = ZONE_COEFFICIENTS[f];
    const defaults: Partial<Record<Zone, number>> = {
      V0: c.V0, V1: c.V1, V2: c.V2, V3: c.V3, MAX: c.MAX,
    };
    if ((f === "50m" || f === "100m") && c.V4 !== null) defaults.V4 = c.V4;
    result[f] = defaults;
  }
  return result;
})();

const strokeAdjustments = STROKE_ADJUSTMENTS_DEFAULT;
const outputPool = "50m" as const;

const swimmer: TeamMember = {
  kind: "account",
  id: "account-1",
  accountId: 1,
  displayName: "Sara Dupont",
};

const target: PaceTarget = {
  id: "t1",
  coach_id: "c",
  swimmer_account_id: 1,
  swimmer_manual_id: null,
  stroke: "NL",
  target_distance_m: 100,
  target_time_ms: 60000,
  target_pool_size: "50m",
  updated_at: "2026-01-01",
};

describe("exportPacePdf", () => {
  it("returns a Blob", async () => {
    const { exportPacePdf } = await import("@/lib/export-pace-pdf");
    const blob = await exportPacePdf({ swimmer, targets: [target], zones, strokeAdjustments, outputPool });
    expect(blob).toBeInstanceOf(Blob);
  });

  it("mime type is application/pdf", async () => {
    const { exportPacePdf } = await import("@/lib/export-pace-pdf");
    const blob = await exportPacePdf({ swimmer, targets: [target], zones, strokeAdjustments, outputPool });
    expect(blob.type).toBe("application/pdf");
  });

  it("size is > 1KB", async () => {
    const { exportPacePdf } = await import("@/lib/export-pace-pdf");
    const blob = await exportPacePdf({ swimmer, targets: [target], zones, strokeAdjustments, outputPool });
    expect(blob.size).toBeGreaterThan(1024);
  });

  it("handles empty targets list without throwing", async () => {
    const { exportPacePdf } = await import("@/lib/export-pace-pdf");
    const blob = await exportPacePdf({ swimmer, targets: [], zones, strokeAdjustments, outputPool });
    expect(blob).toBeInstanceOf(Blob);
  });

  it("sorts multiple targets by stroke alphabetically", async () => {
    const { exportPacePdf } = await import("@/lib/export-pace-pdf");
    const multiTargets: PaceTarget[] = [
      { id: "t1", coach_id: "c", swimmer_account_id: 1, swimmer_manual_id: null, stroke: "Pap", target_distance_m: 100, target_time_ms: 65000, target_pool_size: "50m", updated_at: "" },
      { id: "t2", coach_id: "c", swimmer_account_id: 1, swimmer_manual_id: null, stroke: "Dos", target_distance_m: 100, target_time_ms: 65000, target_pool_size: "50m", updated_at: "" },
      { id: "t3", coach_id: "c", swimmer_account_id: 1, swimmer_manual_id: null, stroke: "NL", target_distance_m: 100, target_time_ms: 60000, target_pool_size: "50m", updated_at: "" },
    ];
    const blob = await exportPacePdf({ swimmer, targets: multiTargets, zones, strokeAdjustments, outputPool });
    expect(blob.size).toBeGreaterThan(1024);
  });

  it("includes coachName when provided", async () => {
    const { exportPacePdf } = await import("@/lib/export-pace-pdf");
    const blob = await exportPacePdf({ swimmer, targets: [target], zones, strokeAdjustments, outputPool, coachName: "Marc Dupont" });
    expect(blob).toBeInstanceOf(Blob);
  });
});
