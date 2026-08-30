import { expect, test } from '@playwright/test';

test('product discovery API is paginated and explicit about no results and branch coverage', async ({ request }) => {
  const empty = await request.get('/api/products/search?q=not-a-real-product');
  expect(empty.ok()).toBeTruthy();
  const emptyBody = await empty.json();
  expect(emptyBody.status).toBe('no_results');
  expect(emptyBody.results).toEqual([]);
  expect(emptyBody.pagination).toMatchObject({ total: 0, hasNext: false, hasPrevious: false });

  const page = await request.get('/api/products/search?q=&page=1&pageSize=2&sort=relevance&storeId=victory-yh');
  expect(page.ok()).toBeTruthy();
  const pageBody = await page.json();
  expect(pageBody.results).toHaveLength(2);
  expect(pageBody.pagination).toMatchObject({ page: 1, pageSize: 2, total: 5, hasNext: true });
  expect(pageBody.coverage).toMatchObject({ storeId: 'victory-yh', pricedProducts: 5, availableProducts: 4, unavailableProducts: 1, availabilityState: 'partial', complete: true });
  expect(pageBody.results.every((result: { price?: unknown }) => result.price)).toBeTruthy();

  const tomato = await request.get('/api/products/search?q=tomato&storeId=victory-yh');
  const tomatoBody = await tomato.json();
  expect(tomatoBody.results[0]).toMatchObject({ availabilityState: 'unavailable', price: { available: false, amount: null, trustState: 'unavailable' } });
});

test('compare and handoff APIs expose partial totals, validation details, and privacy boundaries', async ({ request }) => {
  const compare = await request.post('/api/basket/compare', { data: { items: { tomatoes: 1 }, storeId: 'victory-yh' } });
  expect(compare.ok()).toBeTruthy();
  const compareBody = await compare.json();
  expect(compareBody.totals['victory-yh']).toMatchObject({
    coverage: { status: 'partial', unavailableItems: 1 },
    total: { status: 'partial', excludedItems: 1, basis: 'public_branch_prices_before_checkout' },
  });

  const emptyCompare = await request.post('/api/basket/compare', { data: { items: {}, storeId: 'shufersal-avenue' } });
  expect(emptyCompare.ok()).toBeTruthy();
  expect((await emptyCompare.json()).totals['shufersal-avenue'].total).toMatchObject({ amount: 0, status: 'complete', excludedItems: 0 });

  const malformed = await request.post('/api/basket/compare', { data: { items: { unknown: 1 }, storeId: 'shufersal-avenue' } });
  expect(malformed.status()).toBe(400);
  expect(await malformed.json()).toMatchObject({ code: 'invalid_basket', issues: [{ code: 'unknown_product', productId: 'unknown' }] });

  const handoff = await request.post('/api/basket/handoff', { data: { mode: 'delivery', storeId: 'shufersal-avenue', items: { cereal: 2 } } });
  expect(handoff.ok()).toBeTruthy();
  const handoffBody = await handoff.json();
  expect(handoffBody.handoff).toMatchObject({
    retailer: { id: 'shufersal', capability: 'partial' },
    orderPlaced: false,
    privacy: { destinationIncluded: false, exactAddressLogged: false },
    status: 'review_required',
  });
  expect(handoffBody.handoff.items[0]).toMatchObject({ productId: 'cereal', barcode: '7290012345678', quantity: 2, price: { source: 'Cerberus · PriceFull' } });
  expect(handoffBody.handoff.warningDetails.some((warning: { code: string }) => warning.code === 'club_only_price')).toBeTruthy();

  const wrongMode = await request.post('/api/basket/handoff', { data: { mode: 'physical', storeId: 'shufersal-avenue', items: { cereal: 1 } } });
  expect(wrongMode.status()).toBe(400);
});
