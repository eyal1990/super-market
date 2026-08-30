import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/location/search**', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [{ id: 'fixture-even-gvirol', label: 'אבן גבירול 124, תל אביב', detail: 'תל אביב', lat: 32.086, lon: 34.783, coordinates: { lat: 32.086, lon: 34.783 }, countryCode: 'IL', confidence: 0.95, granularity: 'address', isExactAddress: true, source: 'fixture', provider: 'fixture' }], geocoding: { mode: 'fixture', status: 'fixture' } }) }));
  await page.route('**/api/location/suggestions**', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ suggestions: [{ id: 'fixture-address', kind: 'address', label: 'אבן גבירול 124, תל אביב', detail: 'כתובת בדיקה', addressQuery: 'אבן גבירול 124, תל אביב' }] }) }));
  await page.route('**/images.openfoodfacts.org/**', async (route) => route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64') }));
  await page.addInitScript(() => {
    localStorage.clear();
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition: (_success: PositionCallback, error: PositionErrorCallback) => error({ code: 1, message: 'denied' } as GeolocationPositionError) } });
  });
});

test('product discovery exposes a loading transition and an honest no-results state', async ({ page }) => {
  await page.route('**/api/products/search**', async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('q') !== 'never-match-this') {
      await route.continue();
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'no_results', results: [], pagination: { page: 1, pageSize: 24, total: 0, hasNext: false, hasPrevious: false } }) });
  });
  await page.goto('/');
  await expect(page.locator('[data-app-ready="true"]')).toBeVisible();
  await page.getByPlaceholder('חפש מוצר, מותג או ברקוד...').fill('never-match-this');
  await expect(page.getByTestId('product-search-loading')).toBeVisible();
  await expect(page.getByText('לא מצאנו מוצר כזה')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('product-search-loading')).toBeHidden();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
});

test('configured catalog product metadata renders outside the fixture catalog', async ({ page }) => {
  await page.route('**/api/products/search**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'ready',
        results: [{
          id: 'runtime-milk', barcode: '9990000000001', name: 'Runtime milk', brand: 'Runtime brand', size: '1 L',
          category: 'Dairy', tag: 'Configured catalog', icon: '🥛', aliases: ['Runtime milk'], imageUrl: null, imageAlt: 'Runtime milk', image: null,
          provenance: null, prices: {}, branchPrices: { 'shufersal-avenue': { amount: 6.25, unitPrice: '6.25 ₪ לליטר', available: true, availabilityState: 'available', updatedAt: '2026-08-30T08:00:00Z', source: 'fixture-feed', trustState: 'fresh', freshness: { state: 'fresh', checkedAt: '2026-08-30T08:00:00Z', label: 'נבדק עכשיו' } } },
          branchAvailability: { 'shufersal-avenue': true }, promotions: [], branchPromotions: {}, price: null,
        }],
        pagination: { page: 1, pageSize: 24, total: 1, hasNext: false, hasPrevious: false },
        catalogSource: 'configured', catalog: { dataset: 'configured', productCount: 1, branchCount: 1, branchPriceCoverage: 1, limitations: ['Representative configured fixture'] },
      }),
    });
  });
  await page.goto('/');
  await expect(page.locator('[data-app-ready="true"]')).toBeVisible();
  await expect(page.locator('.product-card h3').filter({ hasText: 'Runtime milk' })).toBeVisible();
  await expect(page.locator('.product-card').filter({ hasText: 'Runtime milk' })).toContainText('Runtime brand');
});

test('first visit is empty, location-gated, and supports a complete physical journey', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-app-ready="true"]')).toBeVisible();
  await expect(page.getByRole('heading', { name: /הסל שלי/ })).toContainText('0');
  await expect(page.getByText('עדיין לא נבחר סניף')).toBeVisible();
  await expect(page.getByRole('button', { name: '+ הוסף' }).first()).toBeDisabled();
  await page.getByRole('textbox', { name: 'חיפוש כתובת' }).fill('אבן גבירול 124');
  await expect(page.getByRole('button', { name: /אבן גבירול 124/ }).first()).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: /אבן גבירול 124/ }).first().click();
  await expect(page.getByRole('button', { name: /אבן גבירול 124/ }).last()).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: /אבן גבירול 124/ }).last().click();
  await expect(page.getByRole('button', { name: /שופרסל דיל/ }).first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('button', { name: /שופרסל דיל/ }).first()).toBeDisabled();
  await expect(page.getByText('בחרו קודם קנייה פיזית או משלוח')).toBeVisible();
  await page.getByRole('button', { name: /קנייה פיזית/ }).click();
  await expect(page.getByRole('button', { name: /שופרסל דיל/ }).first()).toBeEnabled();
  await page.getByRole('button', { name: /שופרסל דיל/ }).first().click();
  await expect(page.getByLabel('התקדמות התחלה')).toContainText('3. בחירת מוצרים');
  await page.locator('.product-card').first().scrollIntoViewIfNeeded();
  const productImage = page.locator('.product-card img').first();
  await expect(productImage).toBeVisible();
  await productImage.evaluate((image) => image.dispatchEvent(new Event('error')));
  await expect(page.getByRole('img', { name: /תמונת מוצר לא זמינה/ }).first()).toBeVisible();
  await page.getByPlaceholder('חפש מוצר, מותג או ברקוד...').fill('pasta');
  await page.getByRole('button', { name: '+ הוסף' }).first().click();
  await expect(page.getByRole('heading', { name: /הסל שלי/ })).toContainText('1');
  await page.getByRole('button', { name: /הוסף יחידה של/ }).click();
  await expect(page.getByRole('heading', { name: /הסל שלי/ })).toContainText('2');
  await page.getByRole('button', { name: /הסר יחידה של/ }).click();
  await expect(page.getByRole('heading', { name: /הסל שלי/ })).toContainText('1');
  await expect(page.getByText(/סה״כ בסניף הנבחר/)).toBeVisible();
});

test('delivery mode exposes retailer handoff and does not claim an order was placed', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-app-ready="true"]')).toBeVisible();
  await page.getByRole('textbox', { name: 'חיפוש כתובת' }).fill('אבן גבירול 124');
  await page.getByRole('button', { name: /אבן גבירול 124/ }).first().click();
  await expect(page.getByRole('button', { name: /אבן גבירול 124/ }).last()).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: /אבן גבירול 124/ }).last().click();
  await page.getByRole('button', { name: /קנייה פיזית/ }).click();
  await page.getByRole('button', { name: /שופרסל דיל/ }).first().click();
  await page.getByRole('button', { name: /קנייה במשלוח/ }).click();
  await page.getByPlaceholder('חפש מוצר, מותג או ברקוד...').fill('milk');
  await page.getByRole('button', { name: '+ הוסף' }).first().click();
  await page.getByRole('button', { name: /השוואת סל למשלוח/ }).click();
  await expect(page.getByText('המשך לרשת או העתקת הרשימה')).toBeVisible();
  await page.getByRole('button', { name: /העבר לשופרסל/ }).click();
  await expect(page.getByText(/העברה מוכנה/)).toBeVisible();
  await expect(page.getByText(/העברה.*אינה הזמנה/)).toBeVisible();
  await page.locator('.compare-modal .modal-close').click();
  await page.getByRole('button', { name: /קנייה פיזית/ }).click();
  await expect(page.getByRole('button', { name: /שופרסל דיל/ }).first()).toBeVisible();
});
