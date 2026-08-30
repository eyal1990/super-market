import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateBasket, findAddressResults, getPrice, products, stores } from '../lib/data.ts';

test('an empty basket is a stable zero-total state', () => {
  const result = calculateBasket({}, stores[0].id);

  assert.deepEqual(result.lines, []);
  assert.deepEqual(result.unavailable, []);
  assert.equal(result.publicTotal, 0);
  assert.equal(result.clubTotal, 0);
  assert.equal(result.clubSavings, 0);
});

test('an empty persisted basket remains empty at the calculation boundary', () => {
  const persisted = JSON.stringify({});
  const restored = JSON.parse(persisted) as Record<string, number>;
  const result = calculateBasket(restored, stores[0].id);

  assert.deepEqual(restored, {});
  assert.equal(result.lines.length, 0);
  assert.equal(result.publicTotal, 0);
});

test('the data layer never silently falls back to a store for an invalid store id', () => {
  const result = calculateBasket({ milk: 1 }, 'missing-store');

  assert.equal(result.publicTotal, 0);
  assert.equal(result.unavailable.length, 1);
  assert.equal(result.lines[0]?.calculation.status, 'unavailable');
});

test('branch totals are selected explicitly and remain branch-level', () => {
  const totals = stores.map((store) => calculateBasket({ milk: 1 }, store.id).publicTotal);

  assert.deepEqual(totals, [7.28, 6.9, 7.28]);
});

test('address lookup clearly distinguishes fixture matches from unsupported addresses', () => {
  assert.deepEqual(findAddressResults('124').map((result) => result.id), ['even-gvirol']);
  assert.deepEqual(findAddressResults('132').map((result) => result.id), ['begin']);
  assert.deepEqual(findAddressResults('Haifa'), []);
});

test('every fixture product has a branch price observation with freshness metadata', () => {
  for (const product of products) {
    for (const store of stores) {
      const price = getPrice(product, store.id);

      assert.equal(typeof price.updatedAt, 'string');
      assert.notEqual(price.source, '');
      if (price.available) {
        if (price.amount === null) throw new Error(`available price missing amount for ${product.id}/${store.id}`);
        assert.ok(price.amount >= 0);
      } else {
        assert.equal(price.amount, null);
      }
    }
  }
});

test('basket lines retain stable product identity needed for a future handoff', () => {
  const result = calculateBasket({ milk: 2 }, stores[0].id);
  const line = result.lines[0];

  assert.equal(line?.product.id, 'milk');
  assert.equal(line?.product.barcode, '7290004123456');
  assert.equal(line?.quantity, 2);
});
