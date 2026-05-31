import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  warmupSectionLabel,
  correctiveSideLabel,
  correctiveChipLabel,
  warmupMetaFromItem,
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

describe("warmupMetaFromItem — §353", () => {
  it("common", () => {
    assert.deepEqual(warmupMetaFromItem({ raw_payload: { warmup_kind: "common" } }), {
      kind: "common",
      correctiveAxis: null,
      correctiveSide: null,
    });
  });

  it("corrective + axe/côté", () => {
    assert.deepEqual(
      warmupMetaFromItem({
        raw_payload: { warmup_kind: "corrective", corrective_axis: "hip", corrective_side: "left" },
      }),
      { kind: "corrective", correctiveAxis: "hip", correctiveSide: "left" },
    );
  });

  it("activation", () => {
    assert.equal(warmupMetaFromItem({ raw_payload: { warmup_kind: "activation" } }).kind, "activation");
  });

  it("valeurs invalides → null", () => {
    assert.deepEqual(
      warmupMetaFromItem({ raw_payload: { warmup_kind: "bogus", corrective_side: "up" } }),
      { kind: null, correctiveAxis: null, correctiveSide: null },
    );
  });

  it("axe correctif ignoré si kind != corrective", () => {
    // warmup_kind activation ne doit pas porter d'axe correctif
    assert.equal(
      warmupMetaFromItem({ raw_payload: { warmup_kind: "activation", corrective_axis: "hip" } }).correctiveAxis,
      null,
    );
  });

  it("raw_payload absent/null → tout null", () => {
    assert.equal(warmupMetaFromItem({}).kind, null);
    assert.equal(warmupMetaFromItem({ raw_payload: null }).kind, null);
  });
});
