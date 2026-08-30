import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createAddressGeocoder,
  resolveAddressSearch,
  validateAddressQuery,
} from '../lib/data.ts';

function validationCode(value: string) {
  const result = validateAddressQuery(value);
  if (result.valid) throw new Error('expected invalid address query');
  return result.code;
}

test('address input is trimmed and validated without rejecting normal Israeli punctuation', () => {
  assert.deepEqual(validateAddressQuery('  רוטשילד 1, תל אביב  '), { valid: true, query: 'רוטשילד 1, תל אביב' });
  assert.equal(validationCode(' '), 'required');
  assert.equal(validationCode('א'), 'too_short');
  assert.equal(validationCode('x'.repeat(121)), 'too_long');
  assert.equal(validationCode('רחוב\nתל אביב'), 'invalid_characters');
});

test('default geocoder is deterministic fixture mode and exposes nearby-store coordinates', async () => {
  const resolution = await resolveAddressSearch('אבן גבירול 124');
  assert.equal(resolution.mode, 'fixture');
  assert.equal(resolution.providerStatus, 'fixture');
  assert.equal(resolution.results[0]?.coordinates.lat, 32.086);
  assert.equal(resolution.results[0]?.source, 'fixture');
  assert.match(resolution.limitations[0]!, /אינו מכסה את כל כתובות ישראל/);
});

test('configured provider results are normalized and limited to Israel', async () => {
  const geocoder = createAddressGeocoder({
    provider: {
      id: 'test-provider',
      async search() {
        return {
          results: [
            { id: 'il-1', display_name: 'הרצל 10, חיפה', address: { city: 'חיפה', country_code: 'il' }, lat: '32.794', lon: '34.989', type: 'house', confidence: 0.91 },
            { id: 'outside', display_name: 'London', address: { country_code: 'gb' }, lat: 51.5, lon: -0.1 },
          ],
        };
      },
    },
  });
  const resolution = await resolveAddressSearch('הרצל 10, חיפה', geocoder);
  assert.equal(resolution.mode, 'provider');
  assert.equal(resolution.providerStatus, 'ok');
  assert.deepEqual(resolution.results.map((result) => result.id), ['il-1']);
  assert.equal(resolution.results[0]?.isExactAddress, true);
  assert.equal(resolution.results[0]?.coordinates.lon, 34.989);
});

test('configured HTTP endpoint is called with an Israeli search scope', async () => {
  let requestedUrl = '';
  let requestedUserAgent = '';
  const geocoder = createAddressGeocoder({
    endpoint: 'https://geocoder.invalid/search',
    providerName: 'test-http-provider',
    userAgent: 'sal-zol-test/1.0 (tests@example.invalid)',
    fetchImpl: async (input, init) => {
      requestedUrl = String(input);
      requestedUserAgent = new Headers(init?.headers).get('user-agent') ?? '';
      return new Response(JSON.stringify({ results: [{ label: 'הנביאים 5, ירושלים', lat: 31.78, lon: 35.22, type: 'house' }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });
  const resolution = await resolveAddressSearch('הנביאים 5, ירושלים', geocoder);
  const url = new URL(requestedUrl);
  assert.equal(url.searchParams.get('q'), 'הנביאים 5, ירושלים');
  assert.equal(url.searchParams.get('country'), 'il');
  assert.equal(url.searchParams.get('countrycodes'), 'il');
  assert.equal(url.searchParams.get('limit'), '8');
  assert.equal(url.searchParams.get('format'), 'jsonv2');
  assert.equal(url.searchParams.get('accept-language'), 'he');
  assert.equal(requestedUserAgent, 'sal-zol-test/1.0 (tests@example.invalid)');
  assert.equal(resolution.provider, 'test-http-provider');
  assert.equal(resolution.results[0]?.source, 'provider');
});

test('provider failure uses only matching fixtures and declares the fallback', async () => {
  const geocoder = createAddressGeocoder({
    provider: { id: 'offline-provider', async search() { throw new Error('offline'); } },
  });
  const resolution = await resolveAddressSearch('אבן גבירול 124', geocoder);
  assert.equal(resolution.providerStatus, 'unavailable');
  assert.equal(resolution.fallbackUsed, true);
  assert.equal(resolution.mode, 'fixture');
  assert.equal(resolution.results[0]?.source, 'fixture');

  const unknown = await resolveAddressSearch('שדרות הנשיא 100, חיפה', geocoder);
  assert.equal(unknown.fallbackUsed, false);
  assert.equal(unknown.results.length, 0);
  assert.equal(unknown.mode, 'provider');
});
