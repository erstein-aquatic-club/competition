// Tests vitest jsdom de MesocyclePreview — helper pur de navigation retour (C2).
//
// En mode ajustement mid-cycle (§338), « Retour » / « Modifier les paramètres »
// doivent ramener à l'écran d'AJUSTEMENT du nageur ciblé, pas à l'écran de
// génération (qui perdrait la config pivot/facteurs du coach).
import { describe, it, expect } from "vitest";

import { mesocyclePreviewBackTarget } from "@/pages/MesocyclePreview";

describe("mesocyclePreviewBackTarget — C2", () => {
  it("mode génération → écran de génération", () => {
    expect(mesocyclePreviewBackTarget(null)).toBe(
      "/strength/mesocycle-generate",
    );
    expect(
      mesocyclePreviewBackTarget({ adjust: false, athleteId: 7 }),
    ).toBe("/strength/mesocycle-generate");
  });

  it("mode ajustement → écran d'ajustement du nageur ciblé", () => {
    expect(
      mesocyclePreviewBackTarget({ adjust: true, athleteId: 18 }),
    ).toBe("/strength/mesocycle-adjust/18");
  });

  it("ajustement sans athleteId → repli génération (sécurité)", () => {
    expect(
      mesocyclePreviewBackTarget({ adjust: true, athleteId: null }),
    ).toBe("/strength/mesocycle-generate");
  });
});
