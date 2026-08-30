import assert from 'node:assert/strict';
import test from 'node:test';
import { catalogCompleteness, freshnessLabel, isPriceStale, priceTrustState, products, stores } from '../lib/data.ts';
import { buildDeliveryHandoff, getCatalogBranchCoverage, parseBasket, parseShoppingMode, validateBasketItems } from '../lib/shopping.ts';

test('basket persistence accepts only known positive quantities', () => {
  assert.deepEqual(parseBasket(JSON.stringify({ milk: 2, unknown: 4, cereal: 0, eggs: 100 })), { milk: 2 });
  assert.equal(parseBasket('{broken'), null);
  assert.equal(parseShoppingMode('delivery'), 'delivery');
  assert.equal(parseShoppingMode('club'), null);
});

test('search normalization handles Hebrew final letters and Latin aliases', () => {
  assert.equal(products.find((product) => product.id === 'eggs') !== undefined, true);
  assert.equal(products.filter((product) => product.aliases.includes('pasta')).length, 1);
});

test('trust state distinguishes fresh, stale, unavailable and unknown prices', () => {
  const fresh = { amount: 5, unitPrice: '5 ₪', updatedAt: '2026-08-30T08:00:00+03:00', available: true, source: 'fixture' };
  const stale = { ...fresh, updatedAt: '2026-08-28T08:00:00+03:00' };
  const unavailable = { ...fresh, amount: null, available: false };
  const unknown = { ...fresh, updatedAt: '' };
  const malformed = { ...fresh, updatedAt: 'not-a-timestamp' };
  const now = new Date('2026-08-30T10:00:00+03:00');
  assert.equal(priceTrustState(fresh, now), 'fresh');
  assert.equal(priceTrustState(stale, now), 'stale');
  assert.equal(priceTrustState(unavailable, now), 'unavailable');
  assert.equal(priceTrustState(unknown, now), 'unknown');
  assert.equal(priceTrustState(malformed, now), 'unknown');
  assert.equal(isPriceStale(stale, now), true);
  assert.equal(freshnessLabel(fresh.updatedAt, now), 'נבדק לפני 2 שעות');
});

test('catalog completeness reports all fixture branches and preserves unavailable products', () => {
  const coverage = getCatalogBranchCoverage(products, stores, new Date('2026-08-30T10:00:00+03:00'));
  assert.equal(coverage.length, stores.length);
  assert.ok(coverage.every((branch) => branch.complete));
  assert.equal(coverage.find((branch) => branch.storeId === 'victory-yh')?.unavailableProducts, 1);
  assert.equal(catalogCompleteness.imageCoverage, 1);
});

test('delivery handoff is retailer-neutral and excludes destination data', () => {
  const handoff = buildDeliveryHandoff({ milk: 2, cereal: 1 }, stores[0].id, new Date('2026-08-30T10:00:00+03:00'))!;
  assert.equal(handoff.retailer.id, 'shufersal');
  assert.equal(handoff.branch.id, stores[0].id);
  assert.deepEqual(handoff.items.map((item) => [item.productId, item.barcode, item.quantity]), [['milk', '7290004123456', 2], ['cereal', '7290012345678', 1]]);
  assert.equal(handoff.privacy.destinationIncluded, false);
  assert.equal(handoff.privacy.exactAddressLogged, false);
  assert.ok(handoff.warnings.some((warning) => warning.includes('מועדון')));
});

test('handoff validation rejects malformed and empty baskets', () => {
  assert.equal(validateBasketItems({}), null);
  assert.equal(validateBasketItems({ milk: 0 }), null);
  assert.equal(validateBasketItems({ milk: 2, cereal: 1 })?.milk, 2);
  assert.equal(buildDeliveryHandoff({ milk: 1 }, 'missing-store'), null);
});
