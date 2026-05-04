import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToString } from "react-dom/server";
import React from "react";
import ObjectiveCard from "../ObjectiveCard";
import type { Objective } from "@/lib/api";

const baseObjective: Objective = {
  id: "obj-1",
  athlete_id: "auth-uuid",
  competition_ids: [],
  event_code: "100NL",
  pool_length: 50,
  target_time_seconds: 65.5,
  text: "100m NL en 1:05.50",
  created_at: "2026-01-01",
};

describe("ObjectiveCard — pace link button (coach context)", () => {
  it("renders → Allures button when context=coach + valid event_code + target_time", () => {
    const html = renderToString(
      React.createElement(ObjectiveCard, {
        objective: baseObjective,
        context: "coach",
        swimmerAccountId: 42,
        onPaceLink: () => {},
      }),
    );
    assert.ok(html.includes("→ Allures"), "button label visible");
    assert.ok(!html.includes("disabled"), "button enabled with full data");
  });

  it("does NOT render the button when context=swimmer", () => {
    const html = renderToString(
      React.createElement(ObjectiveCard, {
        objective: baseObjective,
        context: "swimmer",
      }),
    );
    assert.ok(!html.includes("→ Allures"), "button hidden in swimmer context");
  });

  it("renders disabled button when target_time_seconds is null", () => {
    const html = renderToString(
      React.createElement(ObjectiveCard, {
        objective: { ...baseObjective, target_time_seconds: null },
        context: "coach",
        swimmerAccountId: 42,
        onPaceLink: () => {},
      }),
    );
    assert.ok(html.includes("→ Allures"));
    assert.ok(html.includes("disabled"));
  });

  it("renders disabled button when event_code is unparseable", () => {
    const html = renderToString(
      React.createElement(ObjectiveCard, {
        objective: { ...baseObjective, event_code: "BIZARRE" },
        context: "coach",
        swimmerAccountId: 42,
        onPaceLink: () => {},
      }),
    );
    assert.ok(html.includes("disabled"));
  });
});
