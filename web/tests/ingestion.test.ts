import assert from 'node:assert/strict';
import test from 'node:test';
import { runIngestion } from '../lib/ingestion/core.ts';
import { createCerberusAdapter, createConfiguredAdapterRegistry, createShufersalAdapter, diagnoseShufersalCoverage } from '../lib/ingestion/adapters/index.ts';
import { parseCerberusPrices } from '../lib/ingestion/adapters/cerberus.ts';
import { catalogImportIsSafe, importCatalogFromAdapter, importCatalogPrices, loadConfiguredCatalog, materializeCatalogProducts } from '../lib/ingestion/catalog.ts';
import type { DownloadedSourceFile, RetailerSourceAdapter, SourceFile } from '../lib/ingestion/types.ts';

function downloaded(source: SourceFile, xml: string): DownloadedSourceFile {
  const body = new TextEncoder().encode(xml);
  return { source, body, compression: 'none', compressedSizeBytes: body.byteLength, sizeBytes: body.byteLength, checksum: 'fixture-' + source.id, downloadedAt: '2026-08-30T08:00:00.000Z' };
}

test('Shufersal discovery recognizes current numeric branch filename patterns', async () => {
  const adapter = createShufersalAdapter({ listingUrl: 'https://fixture.invalid/', fetchImpl: async () => new Response('<a href="Price7290027600007-001-003-20260827-010000.gz">price</a><a href="Stores7290027600007-000-20260827-020.gz">stores</a>') });
  const files = await adapter.discoverFiles({ retailerId: 'shufersal' });
  assert.equal(files[0].documentKind, 'price_incremental');
  assert.equal(files[0].storeId, '003');
  assert.equal(files[1].documentKind, 'stores');
});

test('Shufersal discovery follows public transparency pagination and direct blob links', async () => {
  const pages = new Map([
    ['https://prices.shufersal.co.il/?page=1', '<a href="/?page=2">next</a><a href="https://pricesprodpublic.blob.core.windows.net/stores/Stores7290027600007-000-20260830-020000.gz">stores</a><a href="https://pricesprodpublic.blob.core.windows.net/pricefull/PriceFull7290027600007-001-001-20260830-030000.gz">download</a><a href="https://pricesprodpublic.blob.core.windows.net/promofull/PromoFull7290027600007-001-001-20260830-030000.gz">promo</a>'],
    ['https://prices.shufersal.co.il/?page=2', '<a href="/?page=1">previous</a><a href="https://pricesprodpublic.blob.core.windows.net/pricefull/PriceFull7290027600007-001-002-20260830-030000.gz">download</a><a href="https://pricesprodpublic.blob.core.windows.net/promofull/PromoFull7290027600007-001-002-20260830-030000.gz">promo</a>'],
  ]);
  const adapter = createShufersalAdapter({ listingUrl: 'https://prices.shufersal.co.il/?page=1', usePortalCategoryEndpoint: false, maxListingPages: 5, fetchImpl: async (input) => new Response(pages.get(String(input)) ?? '', { status: 200 }) });
  const allFiles = await adapter.discoverFiles({ retailerId: 'shufersal' });
  const files = allFiles.filter((file) => file.documentKind === 'price_full');
  assert.deepEqual(files.map((file) => file.storeId), ['001', '002']);
  assert.ok(files.every((file) => file.uri.startsWith('https://pricesprodpublic.blob.core.windows.net/')));
  const diagnostic = diagnoseShufersalCoverage(allFiles, true);
  assert.equal(diagnostic.status, 'file-set-ready-records-unverified');
  assert.deepEqual(diagnostic.priceFullBranchIds, ['001', '002']);
  assert.deepEqual(diagnostic.missingPromoFullBranchIds, []);
  assert.ok(diagnostic.limitations.some((limitation) => limitation.includes('record counts')));
});

test('Shufersal discovery follows official category endpoint for complete catalog families', async () => {
  const endpoint = 'https://fixture.invalid/FileObject/UpdateCategory';
  const pages = new Map([
    [`${endpoint}?catID=5&storeId=0`, '<a href="https://blob.fixture/Stores7290027600007-000-20260830-020000.gz">stores</a>'],
    [`${endpoint}?catID=2&storeId=0`, '<a href="/FileObject/UpdateCategory?catID=2&amp;storeId=0&amp;page=2">next</a><a href="https://blob.fixture/pricefull/PriceFull7290027600007-001-001-20260830-030000.gz?sv=1&amp;sig=two">full 001</a>'],
    [`${endpoint}?catID=2&storeId=0&page=2`, '<a href="https://blob.fixture/pricefull/PriceFull7290027600007-001-002-20260830-030000.gz?sv=1&amp;sig=two">full 002</a>'],
    [`${endpoint}?catID=4&storeId=0`, '<a href="https://blob.fixture/promofull/PromoFull7290027600007-001-001-20260830-030000.gz?sv=1&amp;sig=two">promo 001</a>'],
  ]);
  const adapter = createShufersalAdapter({
    listingUrl: 'https://fixture.invalid/',
    categoryEndpointUrl: endpoint,
    usePortalCategoryEndpoint: true,
    maxListingPages: 5,
    fetchImpl: async (input) => new Response(pages.get(String(input)) ?? '', { status: 200 }),
  });
  const files = await adapter.discoverFiles({ retailerId: 'shufersal', documentKinds: ['stores', 'price_full', 'promo_full'] });
  assert.deepEqual(files.map((file) => file.documentKind), ['stores', 'price_full', 'price_full', 'promo_full']);
  assert.deepEqual(files.filter((file) => file.documentKind === 'price_full').map((file) => file.storeId), ['001', '002']);
  assert.equal(files.find((file) => file.documentKind === 'price_full')?.uri, 'https://blob.fixture/pricefull/PriceFull7290027600007-001-001-20260830-030000.gz?sv=1&sig=two');
});

test('Shufersal discovery fails closed when pagination exceeds its configured bound', async () => {
  const adapter = createShufersalAdapter({ listingUrl: 'https://prices.shufersal.co.il/?page=1', usePortalCategoryEndpoint: false, maxListingPages: 1, fetchImpl: async () => new Response('<a href="/?page=2">next</a>', { status: 200 }) });
  await assert.rejects(() => adapter.discoverFiles({ retailerId: 'shufersal' }), (error: unknown) => error instanceof Error && error.message.includes('maxListingPages'));
});

test('Cerberus public web endpoint remains observable as credential-gated', async () => {
  const adapter = createCerberusAdapter({ listingUrl: 'https://url.retail.publishedprices.co.il/', fetchImpl: async () => new Response('<form><input name="Username"><input name="Password"></form>', { status: 200 }) });
  const files = await adapter.discoverFiles({ retailerId: 'cerberus', documentKinds: ['price_full'] });
  assert.deepEqual(files, []);
  assert.equal(adapter.metadata.requiresAuthentication, true);
});

test('configured adapter registry reads listing surfaces without making credentials implicit', () => {
  const registry = createConfiguredAdapterRegistry({ NODE_ENV: 'test', CERBERUS_LISTING_URL: 'https://fixture.invalid/cerberus-listing.html', SHUFERSAL_LISTING_URL: 'https://fixture.invalid/shufersal/' });
  assert.equal(registry.get('cerberus')?.metadata.endpointHints[0], 'ftp://url.retail.publishedprices.co.il');
  assert.equal(registry.get('shufersal')?.metadata.requiresAuthentication, false);
});

test('case-insensitive XML parsing normalizes a price and records malformed rows as warnings', async () => {
  const source: SourceFile = { id: 'fixture-price', retailerId: 'cerberus', documentKind: 'price_full', uri: 'fixture://price', fileName: 'PriceFull.xml', storeId: '001' };
  const warnings: string[] = [];
  const records = parseCerberusPrices(downloaded(source, '<ROOT><ITEM><STOREID>001</STOREID><ITEMCODE>milk-1</ITEMCODE><BARCODE>7290004123456</BARCODE><ITEMNAME>חלב</ITEMNAME><PRICE>7.28</PRICE></ITEM><ITEM><STOREID>001</STOREID><ITEMCODE>bad</ITEMCODE><PRICE>not-a-price</PRICE></ITEM></ROOT>'), { source: downloaded(source, '<ROOT/>'), metadata: { retailerId: 'cerberus', adapterId: 'cerberus', sourceFileId: source.id, sourceUri: source.uri, fileName: source.fileName, documentKind: source.documentKind, downloadedAt: '2026-08-30T08:00:00.000Z', checksum: 'fixture' }, now: new Date('2026-08-30T08:00:00Z'), warn: (message) => warnings.push(message) });
  const values = []; for await (const record of records) values.push(record);
  assert.equal(values.length, 1); assert.equal(values[0]!.priceNis, 7.28); assert.equal(warnings.length, 1);
});

test('a failed document creates a partial run without erasing successful records', async () => {
  const good: SourceFile = { id: 'good', retailerId: 'fixture', documentKind: 'price_full', uri: 'fixture://good', fileName: 'good.xml' };
  const bad: SourceFile = { id: 'bad', retailerId: 'fixture', documentKind: 'price_full', uri: 'fixture://bad', fileName: 'bad.xml' };
  const adapter: RetailerSourceAdapter = {
    retailerId: 'fixture', metadata: { adapterId: 'fixture', retailerId: 'fixture', displayName: 'Fixture', sourceFamily: 'retailer-portal', endpointHints: [], supportedDocumentKinds: ['price_full'], gzipExpected: false, requiresAuthentication: false, limitations: [] },
    async discoverFiles() { return [good, bad]; },
    async downloadFile(source) { return downloaded(source, '<ROOT/>'); },
    async *parseStores() { /* no-op */ },
    async *parsePromotions() { /* no-op */ },
    async *parsePrices(file) { if (file.source.id === 'bad') throw new Error('fixture parser failure'); yield { retailerId: 'fixture', storeId: '001', retailerItemId: 'milk', priceNis: 7.28, observedAt: '2026-08-30T08:00:00Z', source: { retailerId: 'fixture', adapterId: 'fixture', sourceFileId: file.source.id, sourceUri: file.source.uri, fileName: file.source.fileName, documentKind: 'price_full', downloadedAt: file.downloadedAt, checksum: file.checksum } }; },
  };
  let upserted = 0;
  const result = await runIngestion(adapter, { retailerId: 'fixture', runKey: 'fixture-run', now: new Date('2026-08-30T08:00:00Z') }, { async upsertPrices(records) { for await (const record of records) { void record; upserted += 1; } return upserted; } });
  assert.equal(result.status, 'partial'); assert.equal(upserted, 1); assert.equal(result.failures.length, 1); assert.deepEqual(result.processedDocumentIds, ['good']);
});

test('catalog import keeps the latest branch record, deduplicates identities, and rejects malformed rows', async () => {
  const source = { retailerId: 'shufersal', adapterId: 'shufersal', sourceFileId: 'catalog-full', sourceUri: 'fixture://catalog', fileName: 'PriceFull.xml', documentKind: 'price_full' as const, downloadedAt: '2026-08-30T08:00:00Z', checksum: 'fixture' };
  const records = [
    { retailerId: 'shufersal', storeId: '001', retailerItemId: 'milk', barcode: '7290004123456', productName: 'חלב', priceNis: 7.28, observedAt: '2026-08-30T08:00:00Z', source },
    { retailerId: 'shufersal', storeId: '001', retailerItemId: 'milk', barcode: '7290004123456', productName: 'חלב', priceNis: 7.5, observedAt: '2026-08-30T09:00:00Z', source },
    { retailerId: 'shufersal', storeId: '001', retailerItemId: '', priceNis: -1, observedAt: '', source },
  ];
  const result = await importCatalogPrices((async function* () { yield* records; })());
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0]?.priceNis, 7.5);
  assert.equal(result.duplicateCount, 1);
  assert.equal(result.skippedCount, 1);
  assert.equal(catalogImportIsSafe(result), false);
});

test('catalog full and incremental publication gates preserve a valid snapshot', async () => {
  const source = { retailerId: 'fixture', adapterId: 'fixture', sourceFileId: 'catalog-safe', sourceUri: 'fixture://catalog-safe', fileName: 'PriceFull.xml', documentKind: 'price_full' as const, downloadedAt: '2026-08-30T08:00:00Z', checksum: 'safe' };
  const previous = await importCatalogPrices((async function* () {
    yield { retailerId: 'fixture', storeId: 'branch-a', retailerItemId: 'milk', barcode: '100', priceNis: 7, observedAt: '2026-08-30T08:00:00Z', source };
    yield { retailerId: 'fixture', storeId: 'branch-b', retailerItemId: 'milk', barcode: '100', priceNis: 8, observedAt: '2026-08-30T08:00:00Z', source };
  })());
  assert.equal(previous.published, true);
  const unsafe = await importCatalogPrices((async function* () {
    yield { retailerId: 'fixture', storeId: 'branch-a', retailerItemId: 'milk', barcode: '100', priceNis: 7.5, observedAt: '2026-08-30T09:00:00Z', source };
  })(), { previous: previous.records, mode: 'full', maxDropRatio: 0.25 });
  assert.equal(unsafe.published, false);
  assert.deepEqual(unsafe.records.map((record) => record.storeId), ['branch-a', 'branch-b']);
  assert.ok(unsafe.warnings.some((warning) => warning.includes('ירידה')));

  const incremental = await importCatalogPrices((async function* () {
    yield { retailerId: 'fixture', storeId: 'branch-a', retailerItemId: 'milk', barcode: '100', priceNis: 7.5, observedAt: '2026-08-30T09:00:00Z', source };
    yield { retailerId: 'fixture', storeId: 'branch-c', retailerItemId: 'milk', barcode: '100', priceNis: 6.5, isAvailable: false, observedAt: '2026-08-30T09:00:00Z', source };
  })(), { previous: previous.records, mode: 'incremental' });
  assert.equal(incremental.published, true);
  assert.equal(incremental.records.length, 3);
  assert.deepEqual(incremental.branchAvailability.find((branch) => branch.storeId === 'branch-c'), {
    retailerId: 'fixture', storeId: 'branch-c', totalProducts: 1, availableProducts: 0, unavailableProducts: 1,
    lastObservedAt: '2026-08-30T09:00:00.000Z', sourceFileIds: ['catalog-safe'],
  });
});

test('catalog materialization retains product metadata, source provenance, images, and branch availability', async () => {
  const source = { retailerId: 'fixture', adapterId: 'fixture', sourceFileId: 'catalog-metadata', sourceUri: 'fixture://catalog-metadata', fileName: 'PriceFull.xml', documentKind: 'price_full' as const, downloadedAt: '2026-08-30T08:00:00Z', checksum: 'metadata' };
  const imported = await importCatalogPrices((async function* () {
    yield { retailerId: 'fixture', storeId: 'branch-a', retailerItemId: 'item-1', barcode: '123', productName: 'Product One', brand: 'Brand', size: '500 g', category: 'Pantry', aliases: ['one'], imageUrl: 'https://images.example.invalid/item-1.jpg', imageAlt: 'Product One pack', priceNis: 12.5, unitPriceNis: 2.5, unitOfMeasure: '100 g', observedAt: '2026-08-30T08:00:00Z', source };
    yield { retailerId: 'fixture', storeId: 'branch-b', retailerItemId: 'item-1', barcode: '123', productName: 'Product One', brand: 'Brand', size: '500 g', category: 'Pantry', priceNis: null, isAvailable: false, observedAt: '2026-08-30T08:00:00Z', source };
  })());
  const product = materializeCatalogProducts(imported.records)[0]!;
  assert.equal(product.name, 'Product One');
  assert.equal(product.brand, 'Brand');
  assert.equal(product.image?.status, 'candidate');
  assert.equal(product.image?.source, 'fixture://catalog-metadata');
  assert.match(product.image?.attribution ?? '', /verify current rights/);
  assert.equal(product.provenance?.sourceFileIds[0], 'catalog-metadata');
  assert.equal(product.prices['branch-a']?.amount, 12.5);
  assert.equal(product.prices['branch-b']?.available, false);
  assert.deepEqual(product.branchAvailability, { 'branch-a': true, 'branch-b': false });
});

test('weighted identities and public/club promotions survive catalog materialization without branch leakage', async () => {
  const source = { retailerId: 'fixture', adapterId: 'fixture-feed', sourceFileId: 'catalog-promotions', sourceUri: 'fixture://catalog-promotions', fileName: 'PriceFull.xml', documentKind: 'price_full' as const, downloadedAt: '2026-08-30T08:00:00Z', checksum: 'promotions' };
  const promotion = (storeId: string | undefined, promotionId: string, isClubOnly: boolean) => ({ retailerId: 'fixture', storeId, promotionId, description: promotionId, startsAt: '2026-08-30T00:00:00Z', endsAt: '2026-09-03T00:00:00Z', minimumQuantity: 2, promotionalPriceNis: isClubOnly ? 4 : 5, clubId: isClubOnly ? 'club-1' : undefined, isClubOnly, retailerItemIds: ['plu-1'], source });
  const result = await importCatalogPrices((async function* () {
    yield { retailerId: 'fixture', storeId: 'branch-a', retailerItemId: 'plu-1', barcode: '999', productName: 'Weighted apples', priceNis: 8, quantity: 1, unitOfMeasure: 'kg', isWeighted: true, observedAt: '2026-08-30T08:00:00Z', source };
    yield { retailerId: 'fixture', storeId: 'branch-a', retailerItemId: 'plu-2', barcode: '999', productName: 'Weighted pears', priceNis: 9, quantity: 1, unitOfMeasure: 'kg', isWeighted: true, observedAt: '2026-08-30T08:00:00Z', source };
    yield { retailerId: 'fixture', storeId: 'branch-b', retailerItemId: 'plu-1', barcode: '999', productName: 'Weighted apples', priceNis: 7, quantity: 1, unitOfMeasure: 'kg', isWeighted: true, observedAt: '2026-08-30T08:00:00Z', source };
  })(), { promotions: [promotion(undefined, 'public-buy-two', false), promotion('branch-a', 'club-branch-a', true)] });
  assert.equal(result.published, true);
  assert.equal(result.records.length, 3);
  assert.equal(result.promotions.length, 2);
  assert.equal(result.records.find((record) => record.storeId === 'branch-a' && record.retailerItemId === 'plu-1')?.promotions.length, 2);
  assert.equal(result.records.find((record) => record.storeId === 'branch-b' && record.retailerItemId === 'plu-1')?.promotions.length, 1);
  const products = materializeCatalogProducts(result.records);
  assert.equal(products.length, 2);
  assert.deepEqual(products.find((product) => product.name === 'Weighted apples')?.promotions.map((item) => item.id), ['public-buy-two']);
});

test('configured catalog snapshots require a source manifest and are cached after validation', async () => {
  const endpoint = 'https://fixture.invalid/catalog-complete-20260830.json';
  const source = { retailerId: 'fixture', adapterId: 'fixture-feed', sourceFileId: 'full-1', sourceUri: 'fixture://full-1', fileName: 'PriceFull.xml', documentKind: 'price_full' as const, downloadedAt: '2026-08-30T08:00:00Z', checksum: 'full-1' };
  const payload = {
    complete: true,
    manifest: { schemaVersion: '1', sourceId: 'fixture-catalog-2026-08', sourceUri: 'https://fixture.example/catalog.json', sourceVersion: '2026-08-30', countryCode: 'IL', asOf: '2026-08-30T08:00:00Z', usage: { kind: 'permissioned', termsUrl: 'https://fixture.example/terms' }, coverage: { expectedRecordCount: 2, expectedProductCount: 1, expectedBranchCount: 2, retailers: [{ retailerId: 'fixture', branchIds: ['north', 'south'], expectedRecordCount: 2, expectedProductCount: 1 }] } },
    completeness: { scope: { id: 'fixture-catalog-2026-08', countryCode: 'IL', sourceVersion: '2026-08-30', asOf: '2026-08-30T08:00:00Z', expectedRecordCount: 2, expectedProductCount: 1, expectedBranchCount: 2, expectedRetailers: ['fixture'] } },
    records: [
      { retailerId: 'fixture', storeId: 'north', retailerItemId: 'milk', barcode: '100', productName: 'חלב', priceNis: 7, observedAt: '2026-08-30T08:00:00Z', source },
      { retailerId: 'fixture', storeId: 'south', retailerItemId: 'milk', barcode: '100', productName: 'חלב', priceNis: 8, observedAt: '2026-08-30T08:00:00Z', source },
    ],
  };
  let calls = 0;
  const result = await loadConfiguredCatalog({ endpoint, fetchImpl: async () => { calls += 1; return new Response(JSON.stringify(payload), { status: 200 }); } });
  const cached = await loadConfiguredCatalog({ endpoint, fetchImpl: async () => { calls += 1; return new Response('{}', { status: 500 }); } });
  assert.equal(result.completeness.coverageStatus, 'configured-complete-for-scope');
  assert.equal(result.records.length, 2);
  assert.equal(result.products.length, 1);
  assert.equal(cached.records.length, 2);
  assert.equal(calls, 1);
});

test('malformed configured catalog snapshots never replace a valid previous snapshot', async () => {
  const endpoint = 'https://fixture.invalid/catalog-invalid-20260830.json';
  const source = { retailerId: 'fixture', adapterId: 'fixture-feed', sourceFileId: 'full-2', sourceUri: 'fixture://full-2', fileName: 'PriceFull.xml', documentKind: 'price_full' as const, downloadedAt: '2026-08-30T08:00:00Z', checksum: 'full-2' };
  const previous = await importCatalogPrices((async function* () { yield { retailerId: 'fixture', storeId: 'north', retailerItemId: 'milk', barcode: '100', priceNis: 7, observedAt: '2026-08-30T08:00:00Z', source }; })());
  const result = await loadConfiguredCatalog({ endpoint, previous: previous.records, fetchImpl: async () => new Response(JSON.stringify({ records: [{ retailerId: 'fixture', storeId: 'north', retailerItemId: '', priceNis: 7 }] }), { status: 200 }) });
  assert.equal(result.fallbackUsed, true);
  assert.deepEqual(result.records.map((record) => record.priceNis), [7]);
  assert.ok(result.warnings.some((warning) => warning.includes('validation')));
});

test('adapter catalog import consumes every discovered full-price record and labels incomplete runs', async () => {
  const source: SourceFile = { id: 'adapter-full', retailerId: 'fixture', documentKind: 'price_full', uri: 'fixture://adapter-full', fileName: 'PriceFull.xml' };
  const adapter: RetailerSourceAdapter = {
    retailerId: 'fixture',
    metadata: { adapterId: 'fixture-feed', retailerId: 'fixture', displayName: 'Fixture feed', sourceFamily: 'retailer-portal', endpointHints: [], supportedDocumentKinds: ['price_full'], gzipExpected: false, requiresAuthentication: false, limitations: [] },
    async discoverFiles() { return [source]; },
    async downloadFile(file) { return downloaded(file, '<ROOT/>'); },
    async *parseStores() { /* no-op */ },
    async *parsePromotions() { /* no-op */ },
    async *parsePrices(file) {
      const shared = { retailerId: 'fixture', adapterId: 'fixture-feed', sourceFileId: file.source.id, sourceUri: file.source.uri, fileName: file.source.fileName, documentKind: 'price_full' as const, downloadedAt: file.downloadedAt, checksum: file.checksum };
      yield { retailerId: 'fixture', storeId: 'north', retailerItemId: 'milk', barcode: '100', priceNis: 7, observedAt: '2026-08-30T08:00:00Z', source: shared };
      yield { retailerId: 'fixture', storeId: 'south', retailerItemId: 'milk', barcode: '100', priceNis: 8, observedAt: '2026-08-30T08:00:00Z', source: shared };
    },
  };
  const result = await importCatalogFromAdapter(adapter, { retailerId: 'fixture', runKey: 'fixture-adapter-run', now: new Date('2026-08-30T08:00:00Z') });
  assert.equal(result.fallbackUsed, false);
  assert.equal(result.ingestion?.status, 'completed');
  assert.equal(result.records.length, 2);
  assert.equal(result.products[0]?.prices.north?.amount, 7);
  assert.equal(result.completeness.coverageStatus, 'configured-partial');
});
