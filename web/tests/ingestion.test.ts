import assert from 'node:assert/strict';
import test from 'node:test';
import { runIngestion } from '../lib/ingestion/core.ts';
import { createShufersalAdapter } from '../lib/ingestion/adapters/index.ts';
import { parseCerberusPrices } from '../lib/ingestion/adapters/cerberus.ts';
import { catalogImportIsSafe, importCatalogPrices } from '../lib/ingestion/catalog.ts';
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
