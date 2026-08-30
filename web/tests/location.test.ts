import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addressQueryWithoutHouseNumber,
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

test('an address fallback removes only the house number and keeps street and city', () => {
  assert.equal(addressQueryWithoutHouseNumber('היורה 10, גן יבנה'), 'היורה, גן יבנה');
  assert.equal(addressQueryWithoutHouseNumber('היורה 10א גן יבנה'), 'היורה גן יבנה');
  assert.equal(addressQueryWithoutHouseNumber('גן יבנה'), null);
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
            { id: 'il-road', display_name: 'היורה, גן יבנה', address: { town: 'גן יבנה', country_code: 'il' }, lat: '31.793', lon: '34.708', addresstype: 'road', type: 'residential' },
            { id: 'outside', display_name: 'London', address: { country_code: 'gb' }, lat: 51.5, lon: -0.1 },
          ],
        };
      },
    },
  });
  const resolution = await resolveAddressSearch('הרצל 10, חיפה', geocoder);
  assert.equal(resolution.mode, 'provider');
  assert.equal(resolution.providerStatus, 'ok');
  assert.deepEqual(resolution.results.map((result) => result.id), ['il-1', 'il-road']);
  assert.equal(resolution.results[0]?.isExactAddress, true);
  assert.equal(resolution.results[0]?.coordinates.lon, 34.989);
  assert.equal(resolution.results[1]?.isExactAddress, false);
});

test('an exact house miss retries with street and city results', async () => {
  const requestedQueries: string[] = [];
  const geocoder = createAddressGeocoder({
    provider: {
      id: 'closest-match-provider',
      async search(query) {
        requestedQueries.push(query);
        if (query === 'היורה, גן יבנה') {
          return [{ id: 'street-1', display_name: 'היורה, גן יבנה', address: { town: 'גן יבנה', country_code: 'il' }, lat: 31.793, lon: 34.708, addresstype: 'road' }];
        }
        return [];
      },
    },
  });
  const resolution = await resolveAddressSearch('היורה 10, גן יבנה', geocoder);
  assert.deepEqual(requestedQueries, ['היורה 10, גן יבנה', 'היורה, גן יבנה']);
  assert.equal(resolution.matchedQuery, 'היורה, גן יבנה');
  assert.equal(resolution.results[0]?.isExactAddress, false);
  assert.match(resolution.limitations[0]!, /מספר הבית המדויק/);
});

test('GeoJSON open geocoder results are normalized into closest address options', async () => {
  const geocoder = createAddressGeocoder({
    provider: {
      id: 'photon',
      async search() {
        return {
          type: 'FeatureCollection',
          features: [{
            properties: { type: 'street', name: 'היורה', city: 'גן יבנה', country: 'ישראל', countrycode: 'IL' },
            geometry: { type: 'Point', coordinates: [34.7078762, 31.7931477] },
          }],
        };
      },
    },
  });
  const resolution = await resolveAddressSearch('היורה 10, גן יבנה', geocoder);
  assert.equal(resolution.results[0]?.label, 'היורה, גן יבנה, ישראל');
  assert.equal(resolution.results[0]?.granularity, 'street');
  assert.equal(resolution.results[0]?.isExactAddress, false);
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
