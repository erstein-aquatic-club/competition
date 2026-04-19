import React from 'react';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { QuickViewContent } from '../CoachSwimmerQuickView';
import type { SwimmerBriefing } from '@/lib/api/coach-quickview';

const mockBriefing: SwimmerBriefing = {
  profile: { id: 42, display_name: 'Test Nageur', avatar_url: null, group_name: 'Élite', age: 17, sex: 'M' },
  wellness_today: { readiness_score: 7, fatigue: 2, mood: 4, logged_at: '2026-04-19T08:00:00Z' },
  pain_summary: null,
  load_summary: { volume_7d_km: 22, volume_28d_km: 88, sessions_7d: 6, avg_rpe_7d: 6.5 },
  objectives_short: [],
  recent_perfs: [],
  today_session: null,
};

test('QuickViewContent renders amber ribbon', () => {
  const markup = renderToStaticMarkup(
    <QuickViewContent briefing={mockBriefing} onBack={() => {}} onAttendance={() => {}} onComment={() => {}} onAssign={() => {}} />,
  );
  assert.ok(markup.includes('Mode dépannage'), 'should show Mode dépannage ribbon');
});

test('QuickViewContent renders athlete name', () => {
  const markup = renderToStaticMarkup(
    <QuickViewContent briefing={mockBriefing} onBack={() => {}} onAttendance={() => {}} onComment={() => {}} onAssign={() => {}} />,
  );
  assert.ok(markup.includes('Test Nageur'), 'should show athlete name');
  assert.ok(markup.includes('lite') || markup.includes('Groupe'), 'should show group');
});

test('QuickViewContent shows no-session message when today_session is null', () => {
  const markup = renderToStaticMarkup(
    <QuickViewContent briefing={mockBriefing} onBack={() => {}} onAttendance={() => {}} onComment={() => {}} onAssign={() => {}} />,
  );
  assert.ok(markup.includes('Pas de séance') || markup.includes('planifi'), 'should show no-session state');
});

test('QuickViewContent renders session name when today_session is set', () => {
  const withSession: SwimmerBriefing = {
    ...mockBriefing,
    today_session: { assignment_id: 1, catalog_id: 5, time_slot: 'evening', session_name: 'Endurance aérobie', session_description: null, total_distance: 4200 },
  };
  const markup = renderToStaticMarkup(
    <QuickViewContent briefing={withSession} onBack={() => {}} onAttendance={() => {}} onComment={() => {}} onAssign={() => {}} />,
  );
  assert.ok(markup.includes('Endurance'), 'should show session name');
});
