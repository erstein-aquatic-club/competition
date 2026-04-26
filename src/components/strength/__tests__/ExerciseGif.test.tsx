import React from "react";
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ExerciseGif } from "@/components/strength/ExerciseGif";

test("renders fallback Dumbbell icon when src is null", () => {
  const markup = renderToStaticMarkup(
    <ExerciseGif src={null} alt="" className="h-10 w-10" />,
  );
  // No <img> tag should be present.
  assert.ok(
    !markup.includes("<img"),
    "should not render <img> when src is null",
  );
  // lucide-react renders SVGs — fallback marker is the role="img" + svg.
  assert.ok(
    markup.includes("<svg"),
    "should render an SVG fallback (Dumbbell)",
  );
});

test("renders ImageOff icon variant when offline=true and no src", () => {
  const markup = renderToStaticMarkup(
    <ExerciseGif src={null} offline className="h-10 w-10" />,
  );
  assert.ok(
    markup.includes("Illustration indisponible hors ligne"),
    "should expose offline-aware aria-label",
  );
});

test("renders <img> with provided src when src is non-empty", () => {
  const markup = renderToStaticMarkup(
    <ExerciseGif src="https://example.com/a.gif" alt="Squat" />,
  );
  assert.ok(markup.includes("<img"), "should render an <img> tag");
  assert.ok(
    markup.includes("https://example.com/a.gif"),
    "should include the GIF URL",
  );
  assert.ok(
    markup.includes('alt="Squat"'),
    "should pass through alt text for accessibility",
  );
});

test("renders skeleton placeholder while initial state is loading", () => {
  // First render before onLoad fires: opacity-0 on the img + animate-pulse
  // skeleton overlay so the swimmer never sees a half-loaded GIF flash.
  const markup = renderToStaticMarkup(
    <ExerciseGif src="https://example.com/b.gif" alt="" />,
  );
  assert.ok(
    markup.includes("animate-pulse"),
    "should render the loading skeleton until onLoad fires",
  );
  assert.ok(
    markup.includes("opacity-0"),
    "img should start hidden until decoded",
  );
});
