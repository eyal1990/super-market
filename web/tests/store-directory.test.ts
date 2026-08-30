import assert from 'node:assert/strict';
import test from 'node:test';
import { directoryImportIsSafe, importStoreDirectory, importStoreDirectoryFromAdapters, IRON_BRANCHES_DATASTORE_URL, israelGridToWgs84, loadStoreDirectory, nationwideStoreDirectory, storeDirectoryCompleteness, storesFromDirectory } from '../lib/store-directory.ts';
import { createCerberusAdapter } from '../lib/ingestion/adapters/cerberus.ts';
import { createShufersalAdapter } from '../lib/ingestion/adapters/shufersal.ts';
import { stores } from '../lib/data.ts';
import type { DownloadedSourceFile, NormalizedStore, SourceFile } from '../lib/ingestion/types.ts';

const source = { retailerId: 'fixture', adapterId: 'fixture', sourceFileId: 'stores-full', sourceUri: 'fixture://stores', fileName: 'Stores.xml', documentKind: 'stores' as const, downloadedAt: '2026-08-30T08:00:00Z', checksum: 'fixture' };

function record(overrides: Partial<NormalizedStore> = {}): NormalizedStore {
  return { retailerId: 'fixture', storeId: '001', name: 'סניף בדיקה', address: 'אבן גבירול 1', city: 'תל אביב-יפו', latitude: 32.08, longitude: 34.78, source, ...overrides };
}

function storesDocument(file: SourceFile, xml: string): DownloadedSourceFile {
  const body = new TextEncoder().encode(xml);
  return { source: file, body, compression: 'none', compressedSizeBytes: body.byteLength, sizeBytes: body.byteLength, checksum: `fixture-${file.id}`, downloadedAt: '2026-08-30T08:00:00.000Z' };
}

function cerberusStoresAdapter(id: string, xml: string, options: { failDiscovery?: boolean } = {}) {
  return createCerberusAdapter({
    listFiles: async () => {
      if (options.failDiscovery) throw new Error('fixture credential gate');
      return [{ id, retailerId: 'cerberus', documentKind: 'stores', uri: `fixture://${id}`, fileName: 'Stores.xml' }];
    },
    download: async (file) => storesDocument(file, xml),
  });
}

function shufersalStoresAdapter(id: string, xml: string) {
  return createShufersalAdapter({
    listFiles: async () => [{ id, retailerId: 'shufersal', documentKind: 'stores', uri: `fixture://${id}`, fileName: 'Stores.xml' }],
    download: async (file) => storesDocument(file, xml),
  });
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

test('adapter directory import discovers and parses stores files across supported feeds', async () => {
  const rami = cerberusStoresAdapter('rami-stores', '<ROOT><STORE><STOREID>001</STOREID><STORENAME>רמי לוי תל אביב</STORENAME><CHAINID>rami</CHAINID><CHAINNAME>רמי לוי</CHAINNAME><ADDRESS>דרך מנחם בגין 1</ADDRESS><CITY>תל אביב-יפו</CITY><LATITUDE>32.08</LATITUDE><LONGITUDE>34.78</LONGITUDE></STORE></ROOT>');
  const victory = cerberusStoresAdapter('victory-stores', '<ROOT><STORE><STOREID>002</STOREID><STORENAME>ויקטורי חיפה</STORENAME><CHAINID>victory</CHAINID><CHAINNAME>ויקטורי</CHAINNAME><ADDRESS>ההסתדרות 2</ADDRESS><CITY>חיפה</CITY><LATITUDE>32.79</LATITUDE><LONGITUDE>34.99</LONGITUDE></STORE></ROOT>');
  const shufersal = shufersalStoresAdapter('shufersal-stores', '<ROOT><STORE><STOREID>003</STOREID><STORENAME>שופרסל ירושלים</STORENAME><CHAINID>shufersal</CHAINID><CHAINNAME>שופרסל</CHAINNAME><ADDRESS>כנפי נשרים 3</ADDRESS><CITY>ירושלים</CITY><LATITUDE>31.78</LATITUDE><LONGITUDE>35.18</LONGITUDE></STORE></ROOT>');
  const result = await importStoreDirectoryFromAdapters([rami, victory, shufersal], { now: new Date('2026-08-30T08:00:00Z') }, {
    retailerIdForStore: (store) => store.chainId === 'rami' ? 'rami-levy' : store.chainId === 'victory' ? 'victory' : store.chainId === 'shufersal' ? 'shufersal' : undefined,
  });
  assert.equal(result.published, true);
  assert.equal(result.feedState, 'complete');
  assert.deepEqual(result.entries.map((entry) => entry.retailerId), ['rami-levy', 'shufersal', 'victory']);
  assert.deepEqual(result.adapterReports.map((report) => [report.retailerId, report.storeFileCount, report.parsedRecordCount, report.status]), [['cerberus', 1, 1, 'completed'], ['cerberus', 1, 1, 'completed'], ['shufersal', 1, 1, 'completed']]);
});

test('adapter directory import fails closed when one expected feed is unavailable', async () => {
  const available = cerberusStoresAdapter('available-stores', '<ROOT><STORE><STOREID>001</STOREID><STORENAME>סניף</STORENAME><CHAINID>rami</CHAINID><ADDRESS>אבן גבירול 1</ADDRESS><CITY>תל אביב</CITY><LATITUDE>32.08</LATITUDE><LONGITUDE>34.78</LONGITUDE></STORE></ROOT>');
  const unavailable = cerberusStoresAdapter('unavailable-stores', '', { failDiscovery: true });
  const prior = record({ retailerId: 'prior-chain', storeId: 'prior-1' });
  const result = await importStoreDirectoryFromAdapters([available, unavailable], { now: new Date('2026-08-30T08:00:00Z') }, { previous: [prior] });
  assert.equal(result.published, false);
  assert.equal(result.feedState, 'partial');
  assert.deepEqual(result.records.map((item) => item.storeId), ['prior-1']);
  assert.match(result.warnings.join(' '), /credential gate/);
  assert.equal(result.adapterReports[1]?.status, 'failed');
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

test('CKAN DataStore pagination consumes every page up to the reported total', async () => {
  const endpoint = `${IRON_BRANCHES_DATASTORE_URL.replace('limit=1000', 'limit=2')}&offset=0`;
  const rows = [
    { id: 'iron-1', chain: 'רשת א', branch: 'אחד', city: 'תל אביב', address: 'אבן גבירול 1', X: 178700, Y: 665000, report_date: '2026-08-20' },
    { id: 'iron-2', chain: 'רשת א', branch: 'שתיים', city: 'חיפה', address: 'חורב 2', X: 200000, Y: 750000, report_date: '2026-08-20' },
    { id: 'iron-3', chain: 'רשת ב', branch: 'שלוש', city: 'באר שבע', address: 'השלום 3', X: 180000, Y: 570000, report_date: '2026-08-20' },
  ];
  process.env.STORE_DIRECTORY_URL = endpoint;
  try {
    const requestedOffsets: string[] = [];
    const result = await loadStoreDirectory(async (input) => {
      const url = new URL(String(input));
      requestedOffsets.push(url.searchParams.get('offset') ?? 'missing');
      const offset = Number(url.searchParams.get('offset') ?? 0);
      return new Response(JSON.stringify({ success: true, result: { records: rows.slice(offset, offset + 2), total: rows.length, last_modified: '2026-08-20T00:00:00Z' } }), { status: 200 });
    }, { forceRefresh: true });
    assert.equal(result.entries.length, 3);
    assert.deepEqual(requestedOffsets, ['0', '2']);
  } finally {
    delete process.env.STORE_DIRECTORY_URL;
  }
});

test('multiple validated source snapshots merge deterministically and remain partial', async () => {
  const first = 'https://fixture.invalid/directory-source-a.json';
  const second = 'https://fixture.invalid/directory-source-b.json';
  const failed = 'https://fixture.invalid/directory-source-failed.json';
  process.env.STORE_DIRECTORY_URLS = `${first},${second},${failed}`;
  try {
    const result = await loadStoreDirectory(async (input) => {
      const url = String(input);
      if (url === failed) return new Response('unavailable', { status: 503 });
      const newer = url === second;
      return new Response(JSON.stringify([record({ retailerId: 'fixture-chain', storeId: 'branch-1', name: newer ? 'newer branch' : 'older branch', source: { ...source, sourceUri: url, publishedAt: newer ? '2026-08-31T00:00:00Z' : '2026-08-30T00:00:00Z' } })]), { status: 200 });
    }, { forceRefresh: true });
    assert.equal(result.entries.length, 1);
    assert.equal(result.entries[0]?.name, 'newer branch');
    assert.equal(result.completeness.coverageStatus, 'configured-partial');
    assert.equal(result.completeness.sourceState, 'mixed');
    assert.match(result.completeness.source, /directory-source-b/);
    assert.match(result.completeness.warnings.join(' '), /503/);
    assert.ok(result.completeness.limitations.length > 0);
  } finally {
    delete process.env.STORE_DIRECTORY_URLS;
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
