import { isIsraeliCoordinate } from './nearby.ts';

export const LOCATION_MEMORY_STORAGE_KEY = 'sal-zol-location-v1';
export const LOCATION_MEMORY_VERSION = 1 as const;
export const LOCATION_MEMORY_MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;

export type RememberedShoppingMode = 'physical' | 'delivery';

export type RememberedLocation = {
  version: typeof LOCATION_MEMORY_VERSION;
  storeId: string;
  mode: RememberedShoppingMode;
  lat: number;
  lon: number;
  savedAt: string;
};

type RememberedLocationInput = Omit<RememberedLocation, 'version' | 'lat' | 'lon' | 'savedAt'> & {
  lat: number;
  lon: number;
  savedAt?: string;
};

function roundCoordinate(value: number) {
  return Math.round(value * 100) / 100;
}

export function serializeRememberedLocation(input: RememberedLocationInput, now = new Date()): string | null {
  if (!input.storeId.trim() || !isIsraeliCoordinate(input.lat, input.lon)) return null;
  const savedAt = input.savedAt ?? now.toISOString();
  if (!Number.isFinite(Date.parse(savedAt))) return null;
  return JSON.stringify({
    version: LOCATION_MEMORY_VERSION,
    storeId: input.storeId.trim(),
    mode: input.mode,
    // Two decimal places revalidate a nearby branch without persisting an exact address.
    lat: roundCoordinate(input.lat),
    lon: roundCoordinate(input.lon),
    savedAt,
  } satisfies RememberedLocation);
}

export function parseRememberedLocation(value: string | null, now = new Date()): RememberedLocation | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    if (record.version !== LOCATION_MEMORY_VERSION || typeof record.storeId !== 'string' || !record.storeId.trim()) return null;
    if (record.mode !== 'physical' && record.mode !== 'delivery') return null;
    if (typeof record.lat !== 'number' || typeof record.lon !== 'number' || !isIsraeliCoordinate(record.lat, record.lon)) return null;
    if (typeof record.savedAt !== 'string') return null;
    const savedAt = Date.parse(record.savedAt);
    if (!Number.isFinite(savedAt) || savedAt > now.getTime() || now.getTime() - savedAt > LOCATION_MEMORY_MAX_AGE_MS) return null;
    return {
      version: LOCATION_MEMORY_VERSION,
      storeId: record.storeId.trim(),
      mode: record.mode,
      lat: record.lat,
      lon: record.lon,
      savedAt: record.savedAt,
    };
  } catch {
    return null;
  }
}
