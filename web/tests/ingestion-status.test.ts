import assert from 'node:assert/strict';
import test from 'node:test';
import { buildIngestionStatus } from '../app/api/ingestion/status/status-contract.ts';

test('demo ingestion status never presents fixture values as live telemetry', () => {
  const responseTime = new Date('2026-08-30T08:20:00.000Z');
  const status = buildIngestionStatus(responseTime);

  assert.equal(status.schemaVersion, 1);
  assert.equal(status.generatedAt, responseTime.toISOString());
  assert.equal(status.mode, 'demo');
  assert.equal(status.overallStatus, 'unavailable');
  assert.deepEqual(status.telemetry, { live: false, persistence: 'none' });
  assert.equal(
    status.message,
    'לא הוגדר מאגר מתמשך לנתוני הקליטה; מצב הריצות אינו ידוע.',
  );

  for (const retailer of status.retailers) {
    assert.equal(retailer.status, 'unknown');
    assert.equal(retailer.lastSuccessfulRun, null);
    assert.equal(retailer.documents, null);
    assert.equal(retailer.warnings, null);
    assert.equal(retailer.failures, null);
  }
});

test('ingestion status exposes valid Hebrew labels without mojibake', () => {
  const status = buildIngestionStatus(new Date('2026-08-30T08:20:00.000Z'));

  assert.deepEqual(status.retailers.map((retailer) => retailer.name), [
    'מקורות קמעונאיים (Cerberus)',
    'שופרסל',
  ]);
  const serialized = JSON.stringify(status);
  assert.equal(
    new TextDecoder().decode(new TextEncoder().encode(serialized)),
    serialized,
  );
});
