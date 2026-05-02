import assert from "node:assert/strict";
import { describe, it, before, mock } from "node:test";
import React from "react";
import { renderToString } from "react-dom/server";
import type { Objective } from "@/lib/api";
import type { PaceTarget } from "@/lib/api/pace-targets";
import type { Stroke } from "@/lib/paceCalculator";
import type { PoolSize } from "@/lib/poolConversion";

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
  it("affiche le toggle Allures/Progression quand matchingTarget est non-null", async () => {
    const { ObjectiveDetailSheet } = await import("../ObjectiveDetailSheet");
    const obj: Objective = { id: "1", athlete_id: "a1", event_code: "100NL", pool_length: 50, target_time_seconds: 65 };
    const target: PaceTarget = {
      id: "t1", coach_id: "c1", swimmer_account_id: null, swimmer_manual_id: null,
      stroke: "NL" as Stroke, target_distance_m: 100, target_time_ms: 65_000,
      target_pool_size: "50m" as PoolSize, updated_at: "2026-01-01",
    };
    const html = renderToString(
      React.createElement(ObjectiveDetailSheet, {
        open: true, onOpenChange: () => {}, objective: obj, matchingTarget: target, iuf: null,
      }),
    );
    assert.ok(html.includes("Allures"), "doit contenir le label Allures");
    assert.ok(html.includes("Progression"), "doit contenir le label Progression");
  });

  it("n'affiche pas le toggle quand matchingTarget est null", async () => {
    const { ObjectiveDetailSheet } = await import("../ObjectiveDetailSheet");
    const obj: Objective = { id: "1", athlete_id: "a1", event_code: "100NL", pool_length: 50, target_time_seconds: 65 };
    const html = renderToString(
      React.createElement(ObjectiveDetailSheet, {
        open: true, onOpenChange: () => {}, objective: obj, matchingTarget: null, iuf: null,
      }),
    );
    assert.ok(!html.includes("Allures"), "ne doit pas contenir le label Allures");
    assert.ok(html.includes("EventProgressionContent"), "doit afficher EventProgressionContent en fallback");
  });
});
