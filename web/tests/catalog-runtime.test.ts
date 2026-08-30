import assert from 'node:assert/strict';
import test from 'node:test';
import { getRuntimeBranchPromotions, loadRuntimeCatalog, searchRuntimeProducts } from '../lib/catalog-runtime.ts';
import { products as fixtureProducts } from '../lib/data.ts';

function source(sourceFileId: string) {
  return {
    retailerId: 'fixture',
    adapterId: 'fixture-feed',
    sourceFileId,
    sourceUri: 'https://fixture.example/catalog.json',
    fileName: 'catalog.json',
    documentKind: 'price_full' as const,
    downloadedAt: '2026-08-30T08:00:00Z',
    checksum: sourceFileId,
  };
}

test('runtime catalog serves configured products and branch observations', async () => {
  const endpoint = 'https://fixture.invalid/runtime-configured.json';
  const previousEndpoint = process.env.CATALOG_SOURCE_URL;
  process.env.CATALOG_SOURCE_URL = endpoint;
  try {
    const result = await loadRuntimeCatalog({
      fetchImpl: async (input) => {
        assert.equal(String(input), endpoint);
        return new Response(JSON.stringify({
      records: [{
        retailerId: 'fixture', storeId: 'shufersal-avenue', retailerItemId: 'runtime-milk',
        barcode: '9990000000001', productName: 'Runtime milk', brand: 'Runtime brand', size: '1 L',
        category: 'Dairy', priceNis: 6.25, unitPriceNis: 6.25, unitOfMeasure: 'L',
        observedAt: '2026-08-30T08:00:00Z', imageUrl: 'https://fixture.example/milk.jpg', imageAlt: 'Runtime milk',
        source: source('runtime-configured'), promotions: [{
          retailerId: 'fixture', storeId: 'shufersal-avenue', promotionId: 'runtime-club', description: 'Runtime club price',
          promotionalPriceNis: 5.5, clubId: 'club-1', isClubOnly: true, retailerItemIds: ['runtime-milk'], source: source('runtime-promo'),
        }],
      }],
        }), { status: 200 });
      },
    });

    assert.equal(result.source, 'configured');
    assert.equal(result.fallbackUsed, false);
    assert.equal(result.products.length, 1);
    assert.equal(result.products[0]?.barcode, '9990000000001');
    assert.equal(result.products[0]?.name, 'Runtime milk');
    assert.equal(result.products[0]?.prices['shufersal-avenue']?.amount, 6.25);
    assert.equal(result.products[0]?.prices['shufersal-avenue']?.available, true);
    assert.equal(result.products[0]?.prices['shufersal-avenue']?.source, 'fixture-feed · runtime-configured');
    assert.equal(getRuntimeBranchPromotions(result, result.products[0]!)['shufersal-avenue']?.[0]?.id, 'runtime-club');
    assert.equal(searchRuntimeProducts('Runtime milk', result.products)[0]?.id, result.products[0]?.id);
    assert.equal('coverageStatus' in result.completeness ? result.completeness.coverageStatus : null, 'configured-partial');
  } finally {
    if (previousEndpoint === undefined) delete process.env.CATALOG_SOURCE_URL;
    else process.env.CATALOG_SOURCE_URL = previousEndpoint;
  }
});

test('runtime catalog falls back to fixtures when no valid configured snapshot exists', async () => {
  const endpoint = 'https://fixture.invalid/runtime-fallback.json';
  const result = await loadRuntimeCatalog({
    endpoint,
    fetchImpl: async () => new Response(JSON.stringify({ records: [{ retailerId: 'fixture', storeId: 'branch', retailerItemId: '', priceNis: 4 }] }), { status: 200 }),
  });

  assert.equal(result.source, 'fixture');
  assert.equal(result.fallbackUsed, true);
  assert.deepEqual(result.products.map((product) => product.id), fixtureProducts.map((product) => product.id));
  assert.ok(result.warnings.some((warning) => warning.includes('validation')));
});

test('runtime catalog keeps the fixture fallback when no source is configured', async () => {
  const previousEndpoint = process.env.CATALOG_SOURCE_URL;
  delete process.env.CATALOG_SOURCE_URL;
  let fetchCalls = 0;
  try {
    const result = await loadRuntimeCatalog({ fetchImpl: async () => { fetchCalls += 1; return new Response('{}'); } });
    assert.equal(result.source, 'fixture');
    assert.equal(result.fallbackUsed, true);
    assert.equal(fetchCalls, 0);
    assert.equal('dataset' in result.completeness ? result.completeness.dataset : null, 'fixture');
  } finally {
    if (previousEndpoint === undefined) delete process.env.CATALOG_SOURCE_URL;
    else process.env.CATALOG_SOURCE_URL = previousEndpoint;
  }
});
