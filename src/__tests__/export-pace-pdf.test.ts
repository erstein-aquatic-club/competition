import { describe, it, expect } from "vitest";
import { DEFAULT_ZONES } from "@/lib/paceCalculator";
import type { TeamMember } from "@/hooks/useMyTeam";
import type { PaceTarget } from "@/lib/api/pace-targets";

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
  updated_at: "2026-01-01",
};

describe("exportPacePdf", () => {
  it("returns a Blob", async () => {
    const { exportPacePdf } = await import("@/lib/export-pace-pdf");
    const blob = await exportPacePdf({ swimmer, targets: [target], zones: DEFAULT_ZONES });
    expect(blob).toBeInstanceOf(Blob);
  });

  it("mime type is application/pdf", async () => {
    const { exportPacePdf } = await import("@/lib/export-pace-pdf");
    const blob = await exportPacePdf({ swimmer, targets: [target], zones: DEFAULT_ZONES });
    expect(blob.type).toBe("application/pdf");
  });

  it("size is > 1KB", async () => {
    const { exportPacePdf } = await import("@/lib/export-pace-pdf");
    const blob = await exportPacePdf({ swimmer, targets: [target], zones: DEFAULT_ZONES });
    expect(blob.size).toBeGreaterThan(1024);
  });

  it("handles empty targets list without throwing", async () => {
    const { exportPacePdf } = await import("@/lib/export-pace-pdf");
    const blob = await exportPacePdf({ swimmer, targets: [], zones: DEFAULT_ZONES });
    expect(blob).toBeInstanceOf(Blob);
  });

  it("sorts multiple targets by stroke alphabetically", async () => {
    const { exportPacePdf } = await import("@/lib/export-pace-pdf");
    const multiTargets: PaceTarget[] = [
      { id: "t1", coach_id: "c", swimmer_account_id: 1, swimmer_manual_id: null, stroke: "Pap", target_distance_m: 100, target_time_ms: 65000, updated_at: "" },
      { id: "t2", coach_id: "c", swimmer_account_id: 1, swimmer_manual_id: null, stroke: "Dos", target_distance_m: 100, target_time_ms: 65000, updated_at: "" },
      { id: "t3", coach_id: "c", swimmer_account_id: 1, swimmer_manual_id: null, stroke: "NL", target_distance_m: 100, target_time_ms: 60000, updated_at: "" },
    ];
    const blob = await exportPacePdf({ swimmer, targets: multiTargets, zones: DEFAULT_ZONES });
    expect(blob.size).toBeGreaterThan(1024);
  });

  it("includes coachName when provided", async () => {
    const { exportPacePdf } = await import("@/lib/export-pace-pdf");
    const blob = await exportPacePdf({ swimmer, targets: [target], zones: DEFAULT_ZONES, coachName: "Marc Dupont" });
    expect(blob).toBeInstanceOf(Blob);
  });
});
