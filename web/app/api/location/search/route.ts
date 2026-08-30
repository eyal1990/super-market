import { NextResponse } from 'next/server';
import { createAddressGeocoder, resolveAddressSearch, validateAddressQuery } from '@/lib/data';
import { rateLimit } from '@/lib/api';

const noStoreHeaders = { 'cache-control': 'no-store' };
const defaultGeocoderEndpoint = 'https://nominatim.openstreetmap.org/search';
const defaultFallbackGeocoderEndpoint = 'https://photon.komoot.io/api/';
const cacheTtlMs = 5 * 60 * 1000;
const cacheLimit = 256;
const addressCache = new Map<string, { expiresAt: number; results: Awaited<ReturnType<typeof resolveAddressSearch>> }>();

function cacheKey(query: string) {
  return query.trim().replace(/\s+/g, ' ').toLocaleLowerCase('he-IL');
}

function readCachedResolution(key: string) {
  const cached = addressCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    addressCache.delete(key);
    return null;
  }
  return cached.results;
}

function writeCachedResolution(key: string, results: Awaited<ReturnType<typeof resolveAddressSearch>>) {
  if (addressCache.size >= cacheLimit) {
    const oldestKey = addressCache.keys().next().value;
    if (oldestKey) addressCache.delete(oldestKey);
  }
  addressCache.set(key, { expiresAt: Date.now() + cacheTtlMs, results });
}

export async function GET(request: Request) {
  const limited = rateLimit(request, 'location-search', 30); if (limited) return limited;
  const rawQuery = new URL(request.url).searchParams.get('q') ?? '';
  const validation = validateAddressQuery(rawQuery);
  if (!validation.valid) return NextResponse.json({ error: validation.error, code: validation.code }, { status: 400, headers: noStoreHeaders });

  const key = cacheKey(validation.query);
  const cached = readCachedResolution(key);
  const configuredEndpoint = process.env.LOCATION_GEOCODER_URL ?? process.env.ADDRESS_GEOCODER_URL ?? process.env.GEOCODER_URL;
  const resolution = cached ?? await resolveAddressSearch(validation.query, createAddressGeocoder({
    endpoint: configuredEndpoint ?? defaultGeocoderEndpoint,
    providerName: process.env.LOCATION_GEOCODER_PROVIDER ?? process.env.ADDRESS_GEOCODER_PROVIDER,
    apiKey: process.env.LOCATION_GEOCODER_API_KEY ?? process.env.ADDRESS_GEOCODER_API_KEY,
    userAgent: process.env.GEOCODER_USER_AGENT ?? 'sal-zol/0.1 (Israeli address search)',
  }));
  const fallbackResolution = !cached && !configuredEndpoint && !resolution.results.length
    ? await resolveAddressSearch(validation.query, createAddressGeocoder({ endpoint: defaultFallbackGeocoderEndpoint, providerName: 'photon' }))
    : null;
  const selectedResolution = fallbackResolution?.results.length ? fallbackResolution : resolution;
  if (!cached) writeCachedResolution(key, selectedResolution);
  return NextResponse.json({
    results: selectedResolution.results,
    geocoding: {
      mode: selectedResolution.mode,
      configuredMode: selectedResolution.configuredMode,
      provider: selectedResolution.provider,
      status: selectedResolution.providerStatus,
      fallbackUsed: selectedResolution.fallbackUsed,
      matchedQuery: selectedResolution.matchedQuery,
      queryFallbackUsed: selectedResolution.queryFallbackUsed,
      limitations: selectedResolution.limitations,
    },
    privacy: {
      exactAddressUsedFor: 'current search only',
      exactAddressPersisted: false,
      cache: 'no-store',
    },
  }, { headers: noStoreHeaders });
}
