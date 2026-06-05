// Tests vitest jsdom de MesocyclePreview — helper pur de navigation retour (C2).
//
// En mode ajustement mid-cycle (§338), « Retour » / « Modifier les paramètres »
// doivent ramener à l'écran d'AJUSTEMENT du nageur ciblé, pas à l'écran de
// génération (qui perdrait la config pivot/facteurs du coach).
// En mode coach (§371), retour à /coach/mesocycle-generate/:id (pas au nageur).
import { describe, it, expect } from "vitest";

import { mesocyclePreviewBackTarget } from "@/pages/MesocyclePreview";

describe("mesocyclePreviewBackTarget — C2", () => {
  it("mode génération nageur → écran de génération nageur", () => {
    expect(mesocyclePreviewBackTarget(null)).toBe(
      "/strength/mesocycle-generate",
    );
    expect(
      mesocyclePreviewBackTarget({ adjust: false, athleteId: 7, coachMode: false }),
    ).toBe("/strength/mesocycle-generate");
  });

  it("mode génération coach → écran de génération coach avec athleteId", () => {
    expect(
      mesocyclePreviewBackTarget({ adjust: false, athleteId: 7, coachMode: true }),
    ).toBe("/coach/mesocycle-generate/7");
  });

  it("mode coach sans athleteId → repli génération nageur (sécurité)", () => {
    expect(
      mesocyclePreviewBackTarget({ adjust: false, athleteId: null, coachMode: true }),
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
