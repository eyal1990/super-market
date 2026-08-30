import { NextResponse } from 'next/server';
import { formatDistance, stores } from '@/lib/data';
import { loadStoreDirectory, storesFromDirectory } from '@/lib/store-directory';
import { rateLimit } from '@/lib/api';
import { isIsraeliCoordinate, rankNearbyStores } from '@/lib/nearby';

export async function GET(request: Request) {
  const limited = rateLimit(request, 'nearby-stores'); if (limited) return limited;
  const url = new URL(request.url); const lat = Number(url.searchParams.get('lat')); const lon = Number(url.searchParams.get('lon'));
  const radius = Number(url.searchParams.get('radius') ?? 10);
  const requestedMode = url.searchParams.get('mode');
  if (requestedMode && requestedMode !== 'physical' && requestedMode !== 'delivery') return NextResponse.json({ error: 'מצב קנייה לא תקין' }, { status: 400 });
  const mode = requestedMode === 'delivery' ? 'delivery' : 'physical';
  if (!isIsraeliCoordinate(lat, lon) || !Number.isFinite(radius) || radius <= 0 || radius > 100) return NextResponse.json({ error: 'מיקום או רדיוס לא תקינים' }, { status: 400 });
  const directory = await loadStoreDirectory();
  const nearby = rankNearbyStores(storesFromDirectory(stores, directory.entries), lat, lon, radius, mode);
  const outOfCoverage = nearby.length === 0;
  const fixtureFallback = directory.completeness.dataset === 'fixture';
  const selected = nearby.map((store) => ({ ...store, distance: formatDistance(store.distanceKm) }));
  return NextResponse.json({ stores: selected, radiusKm: radius, fallbackUsed: fixtureFallback, outOfCoverage, mode, directory: directory.completeness, warnings: directory.completeness.warnings, limitations: [
    ...(mode === 'delivery' ? ['כיסוי משלוח ודמי משלוח לא אומתו בנתוני הדוגמה.'] : []),
    ...directory.completeness.limitations,
  ] }, { headers: { 'cache-control': 'no-store' } });
}
