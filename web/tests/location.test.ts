import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addressQueryWithoutHouseNumber,
  createAddressGeocoder,
  AddressGeocoderError,
  normalizeProviderResults,
  resolveAddressSearch,
  validateAddressQuery,
} from '../lib/data.ts';
import { parseBasket, parseShoppingMode } from '../lib/shopping.ts';
import { LOCATION_MEMORY_MAX_AGE_MS, parseRememberedLocation, serializeRememberedLocation } from '../lib/location-state.ts';

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

test('provider labels prefer Hebrew structured address fields over transliterated display names', () => {
  const results = normalizeProviderResults([
    {
      id: 'hebrew-address',
      display_name: 'Hayotzim 10, Gan Yavne, Israel',
      address: { road: 'היורה', house_number: '10', town: 'גן יבנה', country_code: 'il' },
      lat: 31.793,
      lon: 34.708,
      type: 'house',
    },
  ], 'nominatim');

  assert.equal(results[0]?.label, 'היורה 10, גן יבנה');
  assert.equal(results[0]?.detail, 'גן יבנה');
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

test('address resolution exposes empty, ambiguous, out-of-coverage, timeout, and rate-limit states', async () => {
  const result = (id: string, lat: number, lon: number, type = 'house') => ({ id, display_name: id, address: { city: 'תל אביב-יפו', country_code: 'il' }, lat, lon, type });
  const empty = await resolveAddressSearch('כתובת שלא קיימת', createAddressGeocoder({ provider: { id: 'empty', async search() { return []; } } }));
  assert.equal(empty.providerStatus, 'empty');

  const ambiguous = await resolveAddressSearch('הרצל 10', createAddressGeocoder({ provider: { id: 'ambiguous', async search() { return [result('a', 32.08, 34.78, 'road'), result('b', 32.09, 34.79, 'road')]; } } }));
  assert.equal(ambiguous.providerStatus, 'ambiguous');
  assert.equal(ambiguous.results.length, 2);

  const outside = await resolveAddressSearch('London', createAddressGeocoder({ provider: { id: 'outside', async search() { return [{ id: 'gb', display_name: 'London', address: { country_code: 'gb' }, lat: 51.5, lon: -0.1 }]; } } }));
  assert.equal(outside.providerStatus, 'out_of_coverage');

  const timeout = await resolveAddressSearch('כתובת', createAddressGeocoder({ provider: { id: 'timeout', async search() { throw new AddressGeocoderError('timeout'); } } }));
  assert.equal(timeout.providerStatus, 'timeout');
  const limited = await resolveAddressSearch('כתובת', createAddressGeocoder({ provider: { id: 'limited', async search() { throw new AddressGeocoderError('rate_limited'); } } }));
  assert.equal(limited.providerStatus, 'rate_limited');
});

test('persisted onboarding state rejects corrupt, unknown, and unsafe values', () => {
  assert.deepEqual(parseBasket('{"cereal":2,"unknown":9,"eggs":0}'), { cereal: 2 });
  assert.equal(parseBasket('{broken'), null);
  assert.equal(parseBasket('[]'), null);
  assert.equal(parseBasket('{"version":2,"items":{"cereal":2}}'), null);
  assert.equal(parseBasket('{"version":1,"items":{"cereal":2,"unknown":9}}'), null);
  assert.equal(parseShoppingMode('delivery'), 'delivery');
  assert.equal(parseShoppingMode('pickup'), null);
  assert.equal(parseShoppingMode('{"mode":"delivery"}'), null);
});

test('remembered location is explicit, coarse, current, and never stores the address text', () => {
  const now = new Date('2026-08-30T10:00:00.000Z');
  const serialized = serializeRememberedLocation({ storeId: 'shufersal-avenue', mode: 'physical', lat: 32.08647, lon: 34.78362 }, now);
  assert.ok(serialized);
  assert.equal(serialized.includes('אבן גבירול'), false);
  const parsed = parseRememberedLocation(serialized, now);
  assert.deepEqual(parsed, { version: 1, storeId: 'shufersal-avenue', mode: 'physical', lat: 32.09, lon: 34.78, savedAt: now.toISOString() });
  assert.equal(parseRememberedLocation('{"version":2,"storeId":"shufersal-avenue"}', now), null);
  assert.equal(parseRememberedLocation(JSON.stringify({ ...parsed, savedAt: new Date(now.getTime() - LOCATION_MEMORY_MAX_AGE_MS - 1).toISOString() }), now), null);
  assert.equal(parseRememberedLocation(JSON.stringify({ ...parsed, lat: 51.5, lon: -0.1 }), now), null);
});
