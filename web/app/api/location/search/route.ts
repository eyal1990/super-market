import { NextResponse } from 'next/server';
import { createAddressGeocoder, resolveAddressSearch, validateAddressQuery } from '@/lib/data';
import { rateLimit } from '@/lib/api';

const noStoreHeaders = { 'cache-control': 'no-store' };

export async function GET(request: Request) {
  const limited = rateLimit(request, 'location-search'); if (limited) return limited;
  const rawQuery = new URL(request.url).searchParams.get('q') ?? '';
  const validation = validateAddressQuery(rawQuery);
  if (!validation.valid) return NextResponse.json({ error: validation.error, code: validation.code }, { status: 400, headers: noStoreHeaders });

  const geocoder = createAddressGeocoder({
    endpoint: process.env.LOCATION_GEOCODER_URL ?? process.env.ADDRESS_GEOCODER_URL ?? process.env.GEOCODER_URL,
    providerName: process.env.LOCATION_GEOCODER_PROVIDER ?? process.env.ADDRESS_GEOCODER_PROVIDER,
    apiKey: process.env.LOCATION_GEOCODER_API_KEY ?? process.env.ADDRESS_GEOCODER_API_KEY,
  });
  const resolution = await resolveAddressSearch(validation.query, geocoder);
  return NextResponse.json({
    results: resolution.results,
    geocoding: {
      mode: resolution.mode,
      configuredMode: resolution.configuredMode,
      provider: resolution.provider,
      status: resolution.providerStatus,
      fallbackUsed: resolution.fallbackUsed,
      limitations: resolution.limitations,
    },
    privacy: {
      exactAddressUsedFor: 'current search only',
      exactAddressPersisted: false,
      cache: 'no-store',
    },
  }, { headers: noStoreHeaders });
}
