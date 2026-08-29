import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateBasket, calculateLine, isPromotionActive, products, searchProducts, stores } from '../lib/data.ts';

test('Hebrew and barcode search returns the canonical product', () => {
  assert.equal(searchProducts('קורנפלקס')[0]?.id, 'cereal');
  assert.equal(searchProducts('7290012345678')[0]?.name, 'קורנפלקס תלמה');
  assert.equal(searchProducts('not-a-product').length, 0);
});

test('public multi-buy applies only when its minimum quantity is met', () => {
  const cereal = products.find((product) => product.id === 'cereal')!;
  assert.equal(calculateLine(cereal, stores[0].id, 1).publicTotal, 24.9);
  assert.equal(calculateLine(cereal, stores[0].id, 2).publicTotal, 24.9);
  assert.equal(calculateLine(cereal, stores[0].id, 2).clubTotal, 24.9);
});

test('club savings are reported separately from the public total', () => {
  const result = calculateBasket({ cereal: 2, milk: 1 }, stores[0].id);
  assert.equal(result.publicTotal, 32.18);
  assert.equal(result.clubTotal, 32.18);
  assert.equal(result.clubSavings, 0);
});

test('club-only unit price does not leak into public totals', () => {
  const cereal = products.find((product) => product.id === 'cereal')!;
  const line = calculateLine(cereal, stores[0].id, 1);
  assert.equal(line.publicTotal, 24.9);
  assert.equal(line.clubTotal, 19.9);
  assert.equal(line.clubSavings, 5);
});

test('expired promotions are excluded from calculations', () => {
  const cereal = products.find((product) => product.id === 'cereal')!;
  const expired = { ...cereal, promotions: cereal.promotions.map((promotion) => ({ ...promotion, validUntil: '2020-01-01' })) };
  assert.equal(isPromotionActive(expired.promotions[0]!, new Date('2026-08-30T08:00:00Z')), false);
  assert.equal(calculateLine(expired, stores[0].id, 2).publicTotal, 49.8);
});

test('unavailable products remain visible and are not priced as zero', () => {
  const result = calculateBasket({ tomatoes: 1 }, stores[2].id);
  assert.equal(result.publicTotal, 0);
  assert.equal(result.unavailable.length, 1);
  assert.equal(result.lines[0].calculation.status, 'unavailable');
});
