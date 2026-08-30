import type { Store } from './data.ts';

export const israelCoordinateBounds = { minLat: 29.45, maxLat: 33.35, minLon: 34.15, maxLon: 35.95 } as const;

export function isIsraeliCoordinate(lat: number, lon: number) {
  return Number.isFinite(lat) && Number.isFinite(lon)
    && lat >= israelCoordinateBounds.minLat && lat <= israelCoordinateBounds.maxLat
    && lon >= israelCoordinateBounds.minLon && lon <= israelCoordinateBounds.maxLon;
}

export function distanceKm(aLat: number, aLon: number, bLat: number, bLon: number) {
  const radians = (n: number) => n * Math.PI / 180;
  const dLat = radians(bLat - aLat); const dLon = radians(bLon - aLon);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(aLat)) * Math.cos(radians(bLat)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function rankNearbyStores(stores: readonly Store[], lat: number, lon: number, radiusKm: number, mode: 'physical' | 'delivery') {
  return stores
    .filter((store) => mode !== 'delivery' || store.delivery.capability !== 'unsupported')
    .map((store) => ({ ...store, distanceKm: distanceKm(lat, lon, store.coordinates.lat, store.coordinates.lon) }))
    .filter((store) => store.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm);
}
