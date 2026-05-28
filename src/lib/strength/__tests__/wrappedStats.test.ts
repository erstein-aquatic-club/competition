import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreToBand } from '../wrappedStats';

test('scoreToBand: paliers percentiles', () => {
  assert.equal(scoreToBand(95).label, 'top 10%');
  assert.equal(scoreToBand(90).label, 'top 10%');
  assert.equal(scoreToBand(80).label, 'top 30%');
  assert.equal(scoreToBand(60).label, 'au-dessus de la moyenne');
  assert.equal(scoreToBand(40).label, 'dans la moyenne');
  assert.equal(scoreToBand(10).label, 'gros potentiel de gain');
});

test('scoreToBand: tier ordonné (0=plus fort)', () => {
  assert.ok(scoreToBand(95).tier < scoreToBand(10).tier);
});
