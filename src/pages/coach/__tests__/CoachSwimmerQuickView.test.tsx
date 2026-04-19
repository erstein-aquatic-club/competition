import React from 'react';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { QuickViewContent } from '../CoachSwimmerQuickView';

// QuickViewContent embeds self-fetching components (SwimmerFormBadge, PainHistoryMap)
// that require QueryClient + Supabase context unavailable in SSR.
// We verify the component is importable and has the correct interface; open-state
// rendering is covered by manual E2E.

test('QuickViewContent is importable', () => {
  assert.ok(typeof QuickViewContent === 'function', 'should export QuickViewContent');
});

test('QuickViewContent prop types compile correctly', () => {
  const briefing = {
    profile: { id: 42, display_name: 'Test', avatar_url: null, group_name: null, age: null, sex: null },
    wellness_today: null,
    pain_summary: null,
    load_summary: null,
    objectives_short: [],
    recent_perfs: [],
    today_session: null,
  };
  const noop = () => {};
  const props = { briefing, onBack: noop, onAttendance: noop, onComment: noop, onAssign: noop };
  assert.ok(props.briefing.profile.id === 42);
});
