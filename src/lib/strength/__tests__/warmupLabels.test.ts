import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  warmupSectionLabel,
  correctiveSideLabel,
  correctiveChipLabel,
} from "../warmupLabels";

describe("warmupLabels — §351", () => {
  it("warmupSectionLabel — common / corrective / activation", () => {
    assert.equal(warmupSectionLabel("common"), "Échauffement articulaire");
    assert.equal(warmupSectionLabel("corrective"), "Mobilité corrective");
    assert.equal(warmupSectionLabel("activation"), "Activation musculaire");
  });

  it("correctiveSideLabel — gauche/droite, null si bilatéral/absent", () => {
    assert.equal(correctiveSideLabel("left"), "côté gauche");
    assert.equal(correctiveSideLabel("right"), "côté droit");
    assert.equal(correctiveSideLabel("both"), null);
    assert.equal(correctiveSideLabel(null), null);
    assert.equal(correctiveSideLabel(undefined), null);
  });

  it("correctiveChipLabel — axe FR + côté", () => {
    assert.equal(correctiveChipLabel("hip", "left"), "Mobilité de hanche · côté gauche");
    assert.equal(correctiveChipLabel("shoulder_flexion", "right"), "Flexion d'épaule · côté droit");
  });

  it("correctiveChipLabel — bilatéral → axe seul, sans suffixe côté", () => {
    assert.equal(correctiveChipLabel("t_spine", "both"), "Mobilité thoracique");
  });

  it("correctiveChipLabel — axe inconnu → fallback brut ; axe absent → null", () => {
    assert.equal(correctiveChipLabel("unknown_axis", "left"), "unknown_axis · côté gauche");
    assert.equal(correctiveChipLabel(null, "left"), null);
    assert.equal(correctiveChipLabel(undefined, undefined), null);
  });
});
