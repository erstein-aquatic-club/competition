import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  STROKE_COLORS_RGB,
  STROKE_TINTS_RGB,
  ZONE_BG_RGB,
  ZONE_TEXT_RGB,
  PDF_GENERAL,
} from "../pdfPalette.ts";

describe("pdfPalette — STROKE_COLORS_RGB", () => {
  it("contains all 5 stroke keys", () => {
    const keys = Object.keys(STROKE_COLORS_RGB);
    for (const k of ["NL", "Dos", "Brasse", "Pap", "4N"]) {
      assert.ok(keys.includes(k), `Missing key: ${k}`);
    }
  });

  it("all values are [r, g, b] tuples with values 0–255", () => {
    for (const [key, color] of Object.entries(STROKE_COLORS_RGB)) {
      assert.strictEqual(color.length, 3, `${key} must have 3 components`);
      for (const c of color) {
        assert.ok(c >= 0 && c <= 255, `${key}: component ${c} out of [0, 255]`);
      }
    }
  });
});

describe("pdfPalette — ZONE_BG_RGB and ZONE_TEXT_RGB", () => {
  it("ZONE_BG_RGB has V0/V1/V2/V3/V4/MAX", () => {
    for (const zone of ["V0", "V1", "V2", "V3", "V4", "MAX"]) {
      assert.ok(zone in ZONE_BG_RGB, `ZONE_BG_RGB missing: ${zone}`);
    }
  });

  it("ZONE_TEXT_RGB has V0/V1/V2/V3/V4/MAX", () => {
    for (const zone of ["V0", "V1", "V2", "V3", "V4", "MAX"]) {
      assert.ok(zone in ZONE_TEXT_RGB, `ZONE_TEXT_RGB missing: ${zone}`);
    }
  });
});

describe("pdfPalette — STROKE_TINTS_RGB", () => {
  it("tint is lighter than stroke color (higher sum)", () => {
    for (const key of ["NL", "Dos", "Brasse", "Pap", "4N"]) {
      const tint = STROKE_TINTS_RGB[key];
      const color = STROKE_COLORS_RGB[key];
      const tintSum = tint.reduce((a, b) => a + b, 0);
      const colorSum = color.reduce((a, b) => a + b, 0);
      assert.ok(tintSum > colorSum, `Tint for ${key} should be lighter than stroke color`);
    }
  });
});

describe("pdfPalette — PDF_GENERAL", () => {
  it("WHITE is [255, 255, 255]", () => {
    assert.deepStrictEqual(PDF_GENERAL.WHITE, [255, 255, 255]);
  });

  it("CHARCOAL is dark (each component < 100)", () => {
    for (const c of PDF_GENERAL.CHARCOAL) {
      assert.ok(c < 100, `CHARCOAL component ${c} should be < 100`);
    }
  });
});
