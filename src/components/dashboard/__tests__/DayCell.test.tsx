import React from "react";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DayCell } from "../DayCell";

/**
 * Visual contract tests for §172 DayCell changes:
 *  - Dumbbell icon shown when strengthAssigned, hidden when hasCompetition
 *    (Trophy takes priority — agreed in conversation, no muscu on
 *    competition days in practice).
 *  - SlotPill renders inner Sun/Moon glyph with the variant glyph color
 *    matching the pill background (success → text-white, in-progress →
 *    text-foreground, absent → text-muted-foreground). Failing this
 *    contract = the contrast regression we shipped a fix for.
 *
 * Renders are SSR-only via renderToStaticMarkup — no DOM, no jsdom dep.
 * Assertions hit the produced HTML so a class rename in DayCell is loud.
 */

const baseDate = new Date(2026, 3, 22); // Wed 22 April 2026

const fullSlots = (overrides: Partial<{ amCompleted: boolean; pmCompleted: boolean; amAbsent: boolean; pmAbsent: boolean }> = {}) => ({
  completed: (overrides.amCompleted ? 1 : 0) + (overrides.pmCompleted ? 1 : 0),
  total: 2,
  slots: [
    {
      slotKey: "AM" as const,
      expected: true,
      completed: overrides.amCompleted ?? false,
      absent: overrides.amAbsent ?? false,
    },
    {
      slotKey: "PM" as const,
      expected: true,
      completed: overrides.pmCompleted ?? false,
      absent: overrides.pmAbsent ?? false,
    },
  ],
});

describe("DayCell — Dumbbell + Trophy priority", () => {
  it("renders Dumbbell when strengthAssigned and no competition", () => {
    const markup = renderToStaticMarkup(
      <DayCell
        date={baseDate}
        iso="2026-04-22"
        index={0}
        inMonth
        isToday={false}
        isSelected={false}
        isFocused={false}
        status={fullSlots()}
        strengthAssigned
        hasCompetition={false}
        hasAbsence={false}
        onClick={() => {}}
        onKeyDown={() => {}}
      />,
    );
    assert.ok(
      markup.includes("Séance musculation prévue"),
      "expected Dumbbell aria-label",
    );
    // Trophy svg shouldn't be there
    assert.ok(
      !markup.includes("text-amber-500"),
      "Trophy should not render when hasCompetition=false",
    );
  });

  it("hides Dumbbell when hasCompetition is true (Trophy wins)", () => {
    const markup = renderToStaticMarkup(
      <DayCell
        date={baseDate}
        iso="2026-04-22"
        index={0}
        inMonth
        isToday={false}
        isSelected={false}
        isFocused={false}
        status={fullSlots()}
        strengthAssigned
        hasCompetition
        hasAbsence={false}
        onClick={() => {}}
        onKeyDown={() => {}}
      />,
    );
    assert.ok(
      !markup.includes("Séance musculation prévue"),
      "Dumbbell aria-label must not appear when hasCompetition=true",
    );
    // Trophy SVG present (amber color class)
    assert.ok(
      markup.includes("text-amber-500"),
      "Trophy should render when hasCompetition=true",
    );
  });

  it("hides Dumbbell when strengthAssigned is false", () => {
    const markup = renderToStaticMarkup(
      <DayCell
        date={baseDate}
        iso="2026-04-22"
        index={0}
        inMonth
        isToday={false}
        isSelected={false}
        isFocused={false}
        status={fullSlots()}
        strengthAssigned={false}
        hasCompetition={false}
        hasAbsence={false}
        onClick={() => {}}
        onKeyDown={() => {}}
      />,
    );
    assert.ok(!markup.includes("Séance musculation prévue"));
  });
});

describe("DayCell — SlotPill variants (dark-mode contrast contract)", () => {
  it("success pill carries text-white glyph (legible on green in light + dark)", () => {
    const markup = renderToStaticMarkup(
      <DayCell
        date={baseDate}
        iso="2026-04-22"
        index={0}
        inMonth
        isToday={false}
        isSelected={false}
        isFocused={false}
        status={fullSlots({ amCompleted: true, pmCompleted: true })}
        onClick={() => {}}
        onKeyDown={() => {}}
      />,
    );
    assert.ok(markup.includes("bg-status-success"), "success pill bg present");
    assert.ok(markup.includes("text-white"), "success glyph must be text-white");
  });

  it("in-progress pill carries text-foreground glyph (true black/white per theme)", () => {
    const markup = renderToStaticMarkup(
      <DayCell
        date={baseDate}
        iso="2026-04-22"
        index={0}
        inMonth
        isToday={false}
        isSelected={false}
        isFocused={false}
        status={fullSlots()}
        onClick={() => {}}
        onKeyDown={() => {}}
      />,
    );
    assert.ok(markup.includes("bg-muted-foreground/30"));
    assert.ok(markup.includes("text-foreground"));
  });

  it("absent pill carries text-muted-foreground glyph (intentionally dimmed)", () => {
    const markup = renderToStaticMarkup(
      <DayCell
        date={baseDate}
        iso="2026-04-22"
        index={0}
        inMonth
        isToday={false}
        isSelected={false}
        isFocused={false}
        status={fullSlots({ amAbsent: true, pmAbsent: true })}
        onClick={() => {}}
        onKeyDown={() => {}}
      />,
    );
    assert.ok(markup.includes("bg-muted-foreground/15"));
    assert.ok(markup.includes("text-muted-foreground"));
  });

  it("renders no SlotPill on a real rest day (no slots, no muscu)", () => {
    // Empty slot list = real rest. The "Moon gris pâle" empty-state shows.
    const markup = renderToStaticMarkup(
      <DayCell
        date={baseDate}
        iso="2026-04-22"
        index={0}
        inMonth
        isToday={false}
        isSelected={false}
        isFocused={false}
        status={{ completed: 0, total: 0, slots: [] }}
        onClick={() => {}}
        onKeyDown={() => {}}
      />,
    );
    // The fade-out moon for rest is text-muted-foreground/40 — distinct from
    // the dimmed pill glyph (text-muted-foreground without /40).
    assert.ok(markup.includes("text-muted-foreground/40"), "rest moon");
  });
});
