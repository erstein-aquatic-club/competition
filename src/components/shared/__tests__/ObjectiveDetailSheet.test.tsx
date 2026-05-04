import assert from "node:assert/strict";
import { describe, it, before, mock } from "node:test";
import React from "react";
import { renderToString } from "react-dom/server";
import type { Objective } from "@/lib/api";

before(async () => {
  mock.module("@/components/ui/sheet", {
    namedExports: {
      Sheet: ({ open, children }: any) => open ? React.createElement(React.Fragment, null, children) : null,
      SheetContent: ({ children }: any) => React.createElement("div", null, children),
      SheetHeader: ({ children }: any) => React.createElement("div", null, children),
      SheetTitle: ({ children }: any) => React.createElement("h2", null, children),
    },
  });
  mock.module("@/components/ui/toggle-group", {
    namedExports: {
      ToggleGroup: ({ children }: any) => React.createElement("div", { "data-testid": "toggle-group" }, children),
      ToggleGroupItem: ({ children }: any) => React.createElement("button", null, children),
    },
  });
  mock.module("@/components/coach/pace/PaceMatrixInline", {
    defaultExport: () => React.createElement("div", { "data-testid": "pace-matrix" }, "PaceMatrixInline"),
  });
  mock.module("@/components/shared/EventProgressionSheet", {
    namedExports: {
      EventProgressionContent: () => React.createElement("div", { "data-testid": "progression" }, "EventProgressionContent"),
    },
  });
});

describe("ObjectiveDetailSheet", () => {
  it("affiche le toggle Allures/Progression quand l'objectif est parseable avec un temps cible", async () => {
    const { ObjectiveDetailSheet } = await import("../ObjectiveDetailSheet");
    const obj: Objective = { id: "1", athlete_id: "a1", competition_ids: [], event_code: "100NL", pool_length: 50, target_time_seconds: 65 };
    const html = renderToString(
      React.createElement(ObjectiveDetailSheet, {
        open: true, onOpenChange: () => {}, objective: obj, matchingTarget: null, iuf: null,
      }),
    );
    assert.ok(html.includes("Allures"), "doit contenir le label Allures même sans matchingTarget");
    assert.ok(html.includes("Progression"), "doit contenir le label Progression");
  });

  it("n'affiche pas le toggle quand target_time_seconds est null", async () => {
    const { ObjectiveDetailSheet } = await import("../ObjectiveDetailSheet");
    const obj: Objective = { id: "1", athlete_id: "a1", competition_ids: [], event_code: "100NL", pool_length: 50, target_time_seconds: null };
    const html = renderToString(
      React.createElement(ObjectiveDetailSheet, {
        open: true, onOpenChange: () => {}, objective: obj, matchingTarget: null, iuf: null,
      }),
    );
    assert.ok(!html.includes("Allures"), "ne doit pas contenir le label Allures sans temps cible");
    assert.ok(html.includes("EventProgressionContent"), "doit afficher EventProgressionContent en fallback");
  });
});
