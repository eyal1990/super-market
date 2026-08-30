import assert from 'node:assert/strict';
import test from 'node:test';
import { directoryImportIsSafe, importStoreDirectory, nationwideStoreDirectory, storeDirectoryCompleteness, storesFromDirectory } from '../lib/store-directory.ts';
import { stores } from '../lib/data.ts';
import type { NormalizedStore } from '../lib/ingestion/types.ts';

const source = { retailerId: 'fixture', adapterId: 'fixture', sourceFileId: 'stores-full', sourceUri: 'fixture://stores', fileName: 'Stores.xml', documentKind: 'stores' as const, downloadedAt: '2026-08-30T08:00:00Z', checksum: 'fixture' };

function record(overrides: Partial<NormalizedStore> = {}): NormalizedStore {
  return { retailerId: 'fixture', storeId: '001', name: 'סניף בדיקה', city: 'תל אביב-יפו', latitude: 32.08, longitude: 34.78, source, ...overrides };
}

test('the directory fixture spans Israel and is explicitly partial', () => {
  assert.ok(nationwideStoreDirectory.length >= 15);
  assert.ok(storeDirectoryCompleteness.districtCount >= 5);
  assert.equal(storeDirectoryCompleteness.coverageStatus, 'representative');
  assert.ok(storeDirectoryCompleteness.limitations.length > 0);
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

test('directory merge retains priced branches and does not invent price observations', () => {
  const merged = storesFromDirectory(stores);
  assert.equal(merged.length, nationwideStoreDirectory.length);
  assert.equal(merged[0]?.id, stores[0]?.id);
  assert.ok(!Object.keys(merged.find((store) => store.id === 'shufersal-jerusalem-givat-shaul') ?? {}).includes('prices'));
});
