import { describe, expect, it } from "vitest";
import { formatStrengthSessionTitle } from "../formatStrengthSessionTitle";

describe("formatStrengthSessionTitle", () => {
  it("retire la provenance et la date d'un import EAC", () => {
    expect(
      formatStrengthSessionTitle("EAC 19/12/2026 | 2026-11-10 | Force haut — reprise"),
    ).toBe("Force haut — reprise");
  });

  it("conserve le libellé fonctionnel des séances non importées", () => {
    expect(formatStrengthSessionTitle("Amorce SNC · Puissance haut")).toBe(
      "Amorce SNC · Puissance haut",
    );
    expect(formatStrengthSessionTitle("Force bas + haut")).toBe(
      "Force bas + haut",
    );
  });

  it("retire également l'éventuel préfixe de jour", () => {
    expect(
      formatStrengthSessionTitle("Mardi — EAC 19/12/2026 | 2026-11-10 | Force haut"),
    ).toBe("Force haut");
  });

  it("ne tronque pas les titres avec un séparateur sans date ISO", () => {
    expect(formatStrengthSessionTitle("Force haut | Puissance bas")).toBe(
      "Force haut | Puissance bas",
    );
    expect(formatStrengthSessionTitle("EAC | 10/11/2026 | Force haut")).toBe(
      "EAC | 10/11/2026 | Force haut",
    );
  });
});
