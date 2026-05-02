import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToString } from "react-dom/server";
import React from "react";
import PaceMatrixInline from "../PaceMatrixInline";

describe("PaceMatrixInline (compact)", () => {
  it("renders cells for V0/V1/V2/V3/MAX without the toolbar controls", () => {
    const html = renderToString(
      React.createElement(PaceMatrixInline, {
        targetTimeMs: 65500,
        targetDistance: 100,
        stroke: "NL",
        targetPoolSize: "50m",
        swimmerSex: null,
      }),
    );
    assert.ok(html.includes("V1") || html.includes("V0"), "matrix renders zones");
    assert.ok(!html.includes("Bassin"), "no pool toggle");
    assert.ok(!html.includes("Personnaliser zones"), "no zones drawer button");
  });
});
