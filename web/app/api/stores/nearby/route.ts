import { NextResponse } from 'next/server';
import { formatDistance, stores } from '@/lib/data';
import { rateLimit } from '@/lib/api';

const distanceKm = (aLat: number, aLon: number, bLat: number, bLon: number) => {
  const radians = (n: number) => n * Math.PI / 180;
  const dLat = radians(bLat - aLat); const dLon = radians(bLon - aLon);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(aLat)) * Math.cos(radians(bLat)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export async function GET(request: Request) {
  const limited = rateLimit(request, 'nearby-stores'); if (limited) return limited;
  const url = new URL(request.url); const lat = Number(url.searchParams.get('lat')); const lon = Number(url.searchParams.get('lon'));
  const radius = Number(url.searchParams.get('radius') ?? 10);
  const mode = url.searchParams.get('mode') === 'delivery' ? 'delivery' : 'physical';
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || !Number.isFinite(radius) || radius <= 0 || radius > 100) return NextResponse.json({ error: 'מיקום או רדיוס לא תקינים' }, { status: 400 });
  const ranked = stores
    .filter((store) => mode !== 'delivery' || store.delivery.capability !== 'unsupported')
    .map((store) => ({ ...store, distanceKm: distanceKm(lat, lon, store.coordinates.lat, store.coordinates.lon) }))
    .sort((a, b) => a.distanceKm - b.distanceKm);
  const nearby = ranked.filter((store) => store.distanceKm <= radius);
  const fallbackUsed = nearby.length === 0;
  const selected = (fallbackUsed ? ranked.slice(0, 3) : nearby).map((store) => ({ ...store, distance: formatDistance(store.distanceKm) }));
  return NextResponse.json({ stores: selected, radiusKm: radius, fallbackUsed, mode, limitations: mode === 'delivery' ? ['כיסוי משלוח ודמי משלוח לא אומתו בנתוני הדוגמה.'] : [] });
}
