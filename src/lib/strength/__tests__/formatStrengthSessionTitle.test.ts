import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatStrengthSessionTitle } from "../formatStrengthSessionTitle";

describe("formatStrengthSessionTitle", () => {
  it("retire la provenance et la date d'un import EAC", () => {
    assert.equal(
      formatStrengthSessionTitle("EAC 19/12/2026 | 2026-11-10 | Force haut — reprise"),
      "Force haut — reprise",
    );
  });

  it("conserve le libellé fonctionnel des séances non importées", () => {
    assert.equal(
      formatStrengthSessionTitle("Amorce SNC · Puissance haut"),
      "Amorce SNC · Puissance haut",
    );
    assert.equal(formatStrengthSessionTitle("Force bas + haut"), "Force bas + haut");
  });

  it("retire également l'éventuel préfixe de jour", () => {
    assert.equal(
      formatStrengthSessionTitle("Mardi — EAC 19/12/2026 | 2026-11-10 | Force haut"),
      "Force haut",
    );
  });

  it("ne tronque pas les titres avec un séparateur sans date ISO", () => {
    assert.equal(
      formatStrengthSessionTitle("Force haut | Puissance bas"),
      "Force haut | Puissance bas",
    );
    assert.equal(
      formatStrengthSessionTitle("EAC | 10/11/2026 | Force haut"),
      "EAC | 10/11/2026 | Force haut",
    );
  });
});
