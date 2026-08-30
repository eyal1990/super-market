import assert from 'node:assert/strict';
import test from 'node:test';
import { isIsraeliCoordinate, rankNearbyStores } from '../lib/nearby.ts';
import { stores } from '../lib/data.ts';

test('nearby ranking uses the requested radius and nearest-first order', () => {
  const result = rankNearbyStores(stores, 32.086, 34.783, 2, 'physical');
  assert.equal(result[0]?.id, 'shufersal-avenue');
  assert.ok(result.every((store) => store.distanceKm <= 2));
  assert.ok(!rankNearbyStores(stores, 32.0861, 34.7831, 0.01, 'physical').length);
});

test('delivery ranking excludes branches without delivery support', () => {
  const result = rankNearbyStores([
    stores[0],
    { ...stores[1], delivery: { ...stores[1].delivery, capability: 'unsupported' } },
  ], 32.086, 34.783, 100, 'delivery');
  assert.deepEqual(result.map((store) => store.id), ['shufersal-avenue']);
});

test('nearby coordinates must be inside Israel bounds', () => {
  assert.equal(isIsraeliCoordinate(32.08, 34.78), true);
  assert.equal(isIsraeliCoordinate(0, 0), false);
  assert.equal(isIsraeliCoordinate(51.5, -0.1), false);
});
