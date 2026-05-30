import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhysicalTests, effectiveAxisScore } from '../physicalTests.ts';

test('effectiveAxisScore = min(left,right)', () => {
  assert.equal(effectiveAxisScore({ left: 3, right: 0 }), 0);
  assert.equal(effectiveAxisScore({ left: 2, right: 3 }), 2);
});

test('normalizePhysicalTests: ancienne forme (number) → {left,right} égaux', () => {
  const v1 = { mobility: { shoulder_flexion: 2, t_spine: 1, hip: 3 }, movement: { scapula_control: 0, trunk_neck_alignment: 2, hip_hinge: 3 }, filled_at: '2026-01-01T00:00:00Z' } as any;
  const n = normalizePhysicalTests(v1)!;
  assert.deepEqual(n.mobility.shoulder_flexion, { left: 2, right: 2, note: undefined });
  assert.deepEqual(n.movement.scapula_control, { left: 0, right: 0, note: undefined });
  assert.equal(n.filled_at, '2026-01-01T00:00:00Z');
});

test('normalizePhysicalTests: forme v2 → passthrough (préserve note + asymétrie)', () => {
  const v2 = { mobility: { shoulder_flexion: { left: 3, right: 1, note: 'épaule D limitée' }, t_spine: { left: 2, right: 2 }, hip: { left: 3, right: 3 } }, movement: { scapula_control: { left: 1, right: 0 }, trunk_neck_alignment: { left: 2, right: 2 }, hip_hinge: { left: 3, right: 3 } }, note: 'synthèse', filled_at: '2026-02-01T00:00:00Z' } as any;
  const n = normalizePhysicalTests(v2)!;
  assert.deepEqual(n.mobility.shoulder_flexion, { left: 3, right: 1, note: 'épaule D limitée' });
  assert.equal(n.note, 'synthèse');
});

test('normalizePhysicalTests: null → null', () => {
  assert.equal(normalizePhysicalTests(null), null);
});
