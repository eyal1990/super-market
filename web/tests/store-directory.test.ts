import assert from 'node:assert/strict';
import test from 'node:test';
import { directoryImportIsSafe, importStoreDirectory, IRON_BRANCHES_DATASTORE_URL, israelGridToWgs84, loadStoreDirectory, nationwideStoreDirectory, storeDirectoryCompleteness, storesFromDirectory } from '../lib/store-directory.ts';
import { stores } from '../lib/data.ts';
import type { NormalizedStore } from '../lib/ingestion/types.ts';

const source = { retailerId: 'fixture', adapterId: 'fixture', sourceFileId: 'stores-full', sourceUri: 'fixture://stores', fileName: 'Stores.xml', documentKind: 'stores' as const, downloadedAt: '2026-08-30T08:00:00Z', checksum: 'fixture' };

function record(overrides: Partial<NormalizedStore> = {}): NormalizedStore {
  return { retailerId: 'fixture', storeId: '001', name: 'סניף בדיקה', address: 'אבן גבירול 1', city: 'תל אביב-יפו', latitude: 32.08, longitude: 34.78, source, ...overrides };
}

test('the directory fixture spans Israel and is explicitly partial', () => {
  assert.ok(nationwideStoreDirectory.length >= 15);
  assert.ok(storeDirectoryCompleteness.districtCount >= 5);
  assert.equal(storeDirectoryCompleteness.coverageStatus, 'representative');
  assert.ok(storeDirectoryCompleteness.limitations.length > 0);
  assert.ok(nationwideStoreDirectory.every((entry) => entry.status === 'active' && entry.verifiedAt === entry.lastVerified));
});

test('Israeli TM Grid coordinates are converted to WGS84 without accepting out-of-country results', () => {
  const coordinates = israelGridToWgs84(178700, 665000);
  assert.ok(coordinates);
  assert.ok(coordinates.lat > 31 && coordinates.lat < 33);
  assert.ok(coordinates.lon > 34 && coordinates.lon < 35.5);
  assert.equal(israelGridToWgs84(1, 1), null);
});

test('directory imports validate Israel coordinates, deduplicate, and keep the last record', async () => {
  const result = await importStoreDirectory((async function* () {
    yield record();
    yield record({ name: 'סניף מעודכן' });
    yield record({ storeId: '002', latitude: 51.5, longitude: -0.1 });
  })());
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0]?.name, 'סניף מעודכן');
  assert.equal(result.duplicateCount, 1);
  assert.equal(result.skippedCount, 1);
  assert.equal(directoryImportIsSafe(result), false);
});

test('directory imports use source timestamps when duplicate rows arrive out of order', async () => {
  const result = await importStoreDirectory((async function* () {
    yield record({ name: '×¡× ×™×£ ×—×“×©', source: { ...source, publishedAt: '2026-08-30T10:00:00Z' } });
    yield record({ name: '×¡× ×™×£ ×™×©×Ÿ', source: { ...source, publishedAt: '2026-08-29T10:00:00Z' } });
  })());
  assert.equal(result.records[0]?.name, '×¡× ×™×£ ×—×“×©');
});

test('directory merge retains priced branches and does not invent price observations', () => {
  const merged = storesFromDirectory(stores);
  assert.equal(merged.length, nationwideStoreDirectory.length);
  assert.equal(merged[0]?.id, stores[0]?.id);
  assert.ok(!Object.keys(merged.find((store) => store.id === 'shufersal-jerusalem-givat-shaul') ?? {}).includes('prices'));
});

test('directory metadata remains authoritative when it overlaps a priced branch', () => {
  const merged = storesFromDirectory(stores, [{
    ...nationwideStoreDirectory[0]!,
    address: '×›×ª×•×‘×ª ×ž×¢×•×“×›× ×ª',
    city: '×ª×œ ××‘×™×‘-×™×¤×•',
    coordinates: { lat: 32.1, lon: 34.8 },
    deliveryCapability: 'deep_link',
    retailerUrl: 'https://example.invalid/store',
    openNow: null,
  }]);
  const branch = merged[0]!;
  assert.equal(branch.address, '×›×ª×•×‘×ª ×ž×¢×•×“×›× ×ª, ×ª×œ ××‘×™×‘-×™×¤×•');
  assert.deepEqual(branch.coordinates, { lat: 32.1, lon: 34.8 });
  assert.equal(branch.delivery.capability, 'deep_link');
  assert.equal(branch.delivery.retailerUrl, 'https://example.invalid/store');
  assert.equal(branch.openNow, null);
  assert.equal(branch.distanceKm, null);
});

test('a configured complete directory source is loaded, cached, and exposed as configured coverage', async () => {
  const key = 'https://fixture.invalid/directory-complete.json';
  process.env.STORE_DIRECTORY_URL = key;
  try {
    let calls = 0;
    const result = await loadStoreDirectory(async () => {
      calls += 1;
      return new Response(JSON.stringify({ completeness: { complete: true, scope: { id: 'fixture-live-scope', countryCode: 'IL', expectedBranchCount: 1, expectedChains: ['fixture-live'], sourceVersion: 'v1', asOf: '2026-08-30' } }, stores: [record({ retailerId: 'fixture-live', storeId: 'live-1', name: 'סניף חי' })] }), { status: 200 });
    });
    const cached = await loadStoreDirectory(async () => { calls += 1; return new Response('{}', { status: 500 }); });
    assert.equal(result.completeness.dataset, 'configured-source');
    assert.equal(result.completeness.coverageStatus, 'configured-complete-for-scope');
    assert.equal(result.completeness.scope.id, 'fixture-live-scope');
    assert.equal(result.entries[0]?.storeId, 'live-1');
    assert.equal(cached.entries[0]?.storeId, 'live-1');
    assert.equal(calls, 1);
  } finally {
    delete process.env.STORE_DIRECTORY_URL;
  }
});

test('an unsafe configured directory keeps the valid fixture and explains the fallback', async () => {
  process.env.STORE_DIRECTORY_URL = 'https://fixture.invalid/directory-invalid.json';
  try {
    const result = await loadStoreDirectory(async () => new Response(JSON.stringify({ records: [{ storeId: 'missing-retailer', name: 'לא תקין' }] }), { status: 200 }));
    assert.equal(result.completeness.dataset, 'fixture');
    assert.equal(result.entries.length, nationwideStoreDirectory.length);
    assert.match(result.completeness.limitations.at(-1)!, /מקור הסניפים/);
  } finally {
    delete process.env.STORE_DIRECTORY_URL;
  }
});

test('a failed refresh preserves the last valid configured directory snapshot', async () => {
  const key = 'https://fixture.invalid/directory-refresh-safe.json';
  process.env.STORE_DIRECTORY_URL = key;
  try {
    const first = await loadStoreDirectory(async () => new Response(JSON.stringify({ completeness: { complete: true, scope: { id: 'safe-directory', countryCode: 'IL', expectedBranchCount: 1, expectedChains: ['fixture-live'], sourceVersion: 'v1', asOf: '2026-08-30' } }, stores: [record({ retailerId: 'fixture-live', storeId: 'safe-1' })] }), { status: 200 }), { forceRefresh: true });
    const second = await loadStoreDirectory(async () => new Response(JSON.stringify({ stores: [{ storeId: 'missing-fields' }] }), { status: 200 }), { forceRefresh: true });
    assert.equal(first.entries[0]?.storeId, 'safe-1');
    assert.equal(second.entries[0]?.storeId, 'safe-1');
    assert.match(second.completeness.limitations.at(-1)!, /snapshot/);
  } finally {
    delete process.env.STORE_DIRECTORY_URL;
  }
});

test('Iron Branches CKAN/DataStore rows are imported from ITM as an explicitly partial emergency subset', async () => {
  process.env.STORE_DIRECTORY_URL = IRON_BRANCHES_DATASTORE_URL;
  try {
    const result = await loadStoreDirectory(async () => new Response(JSON.stringify({ success: true, result: {
      records: [{ chain: 'רשת בדיקה', branch: 'סניף חירום', city: 'תל אביב-יפו', street: 'אבן גבירול', address: 'אבן גבירול 124', X: '178700', Y: '665000', report_date: '2026-08-20' }],
      total: 1,
      last_modified: '2026-08-20T00:00:00Z',
    } }), { status: 200 }), { forceRefresh: true });
    const entry = result.entries[0]!;
    assert.equal(result.completeness.dataset, 'configured-source');
    assert.equal(result.completeness.coverageStatus, 'configured-partial');
    assert.equal(entry.status, 'emergency-open');
    assert.equal(entry.source, IRON_BRANCHES_DATASTORE_URL);
    assert.equal(entry.verifiedAt, '2026-08-20T00:00:00.000Z');
    assert.ok(entry.coordinates.lat > 31 && entry.coordinates.lon > 34);
    assert.match(result.completeness.limitations.join(' '), /emergency-open subset/);
  } finally {
    delete process.env.STORE_DIRECTORY_URL;
  }
});

test('incremental directory refresh is idempotent and preserves prior branches', async () => {
  const first = await importStoreDirectory((async function* () { yield record({ storeId: '001' }); })(), { mode: 'full' });
  const delta = record({ storeId: '002', name: 'סניף נוסף', source: { ...source, sourceFileId: 'stores-incremental', publishedAt: '2026-08-31T08:00:00Z' } });
  const once = await importStoreDirectory((async function* () { yield delta; })(), { mode: 'incremental', previous: first.records });
  const twice = await importStoreDirectory((async function* () { yield delta; })(), { mode: 'incremental', previous: once.records });
  assert.equal(once.published, true);
  assert.deepEqual(twice.records, once.records);
  assert.deepEqual(twice.records.map((item) => item.storeId), ['001', '002']);
});
