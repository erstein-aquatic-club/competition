import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  readAuditSessionMeta,
  auditSourcePhase,
  auditWeekStart,
} from "../coachMesocycleAudit";

describe("Plan détaillé coach — PDF Manon", () => {
  it("n'efface pas la séance du lundi quand session_number vaut 0", () => {
    const payloads = [0, 1, 3, 4].map((n) => ({
      week_number: 1, session_number: n,
    }));
    const sessions = payloads.map(readAuditSessionMeta);
    assert.deepEqual(sessions.map((m) => m?.sessionNumber), [0, 1, 3, 4]);
    assert.equal(new Set(sessions.map((m) => m?.sessionNumber)).size, 4);
    assert.equal([3, 5, 5, 5].reduce((a, b) => a + b, 0), 18);
  });

  it("ignore les entrées réellement invalides, sans accepter les jours négatifs", () => {
    assert.equal(readAuditSessionMeta({ week_number: 1 }), null);
    assert.equal(readAuditSessionMeta({ week_number: 0, session_number: 2 }), null);
    assert.equal(readAuditSessionMeta({ week_number: 1, session_number: -1 }), null);
    assert.equal(readAuditSessionMeta({ week_number: 1, session_number: "" }), null);
    assert.deepEqual(readAuditSessionMeta({ week_number: "14", session_number: "0" }),
      { weekNumber: 14, sessionNumber: 0 });
  });

  it("lit les vraies phases de chaque semaine PDF sans renommer les phases moteur", () => {
    assert.equal(auditSourcePhase({ source_phase: "Force I", periodization_cycle: null }), "Force I");
    assert.equal(auditSourcePhase({ source_phase: "Force-vitesse" }), "Force-vitesse");
    assert.equal(auditSourcePhase({ source_phase: "Affûtage juin" }), "Affûtage juin");
    assert.equal(auditSourcePhase({ periodization_cycle: "force_max" }), "force_max");
    assert.equal(auditSourcePhase({}), "");
  });

  it("résout les dates de semaine à cheval sur 2026/2027, sans dérive horaire", () => {
    assert.equal(auditWeekStart("2026-11-16", 1), "2026-11-16");
    assert.equal(auditWeekStart("2026-11-16", 2), "2026-11-23");
    assert.equal(auditWeekStart("2026-11-16", 14), "2027-02-15");
    assert.equal(auditWeekStart("2026-11-16", 32), "2027-06-21");
    assert.equal(auditWeekStart("2026-11-17", 1), null);
    assert.equal(auditWeekStart(null, 5), null);
  });
});
