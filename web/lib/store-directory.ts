import type { Store } from './data.ts';
import type { NormalizedStore } from './ingestion/types.ts';

export type StoreDirectoryEntry = {
  retailerId: string;
  storeId: string;
  chainId: string;
  chainName: string;
  name: string;
  address: string;
  city: string;
  district: string;
  postalCode?: string;
  coordinates: { lat: number; lon: number };
  isActive: boolean;
  source: string;
  lastVerified: string;
  deliveryCapability: Store['delivery']['capability'];
  retailerUrl?: string;
  openNow: boolean | null;
};

export type StoreDirectoryImportResult = {
  candidateRecords: NormalizedStore[];
  records: NormalizedStore[];
  mode: 'full' | 'incremental';
  published: boolean;
  duplicateCount: number;
  skippedCount: number;
  warnings: string[];
};

export type StoreDirectoryScope = {
  id: string;
  countryCode: string;
  expectedBranchCount?: number;
  expectedChains: string[];
  sourceVersion?: string;
  asOf?: string;
};

export type StoreDirectoryCompleteness = {
  dataset: 'fixture' | 'configured-source';
  coverageStatus: 'representative' | 'configured-partial' | 'configured-complete' | 'configured-complete-for-scope';
  branchCount: number;
  districtCount: number;
  supportedChains: string[];
  source: string;
  lastVerified: string;
  scope: StoreDirectoryScope;
  limitations: string[];
};

export type StoreDirectoryLoadResult = {
  entries: StoreDirectoryEntry[];
  completeness: StoreDirectoryCompleteness;
};

const israelBounds = { minLat: 29.45, maxLat: 33.35, minLon: 34.15, maxLon: 35.95 };

/**
 * A deliberately broad, provider-neutral fixture. Production refreshes should
 * replace this list with the validated output of a retailer branch feed.
 * Existing priced branches are kept as the first three records so the local
 * shopping fixture remains useful while the directory spans all districts.
 */
export const nationwideStoreDirectory: StoreDirectoryEntry[] = [
  { retailerId: 'shufersal', storeId: 'shufersal-avenue', chainId: 'shufersal', chainName: 'שופרסל', name: 'דיל · אבן גבירול', address: 'אבן גבירול 124', city: 'תל אביב-יפו', district: 'תל אביב', coordinates: { lat: 32.086, lon: 34.783 }, isActive: true, lastVerified: '2026-08-30', source: 'fixture', deliveryCapability: 'partial', openNow: true },
  { retailerId: 'rami-levy', storeId: 'rami-levy-azrieli', chainId: 'rami-levy', chainName: 'רמי לוי', name: 'מגדלי תל אביב', address: 'דרך מנחם בגין 132', city: 'תל אביב-יפו', district: 'תל אביב', coordinates: { lat: 32.074, lon: 34.79 }, isActive: true, source: 'fixture', lastVerified: '2026-08-30', deliveryCapability: 'manual', openNow: true },
  { retailerId: 'victory', storeId: 'victory-yh', chainId: 'victory', chainName: 'ויקטורי', name: 'יהודה המכבי', address: 'יהודה המכבי 42', city: 'תל אביב-יפו', district: 'תל אביב', coordinates: { lat: 32.094, lon: 34.793 }, isActive: true, source: 'fixture', lastVerified: '2026-08-30', deliveryCapability: 'manual', openNow: true },
  { retailerId: 'shufersal', storeId: 'shufersal-jerusalem-givat-shaul', chainId: 'shufersal', chainName: 'שופרסל', name: 'גבעת שאול', address: 'כנפי נשרים 22', city: 'ירושלים', district: 'ירושלים', coordinates: { lat: 31.786, lon: 35.184 }, isActive: true, source: 'fixture', lastVerified: '2026-08-30', deliveryCapability: 'unsupported', openNow: true },
  { retailerId: 'rami-levy', storeId: 'rami-levy-jerusalem-talpiot', chainId: 'rami-levy', chainName: 'רמי לוי', name: 'תלפיות', address: 'האומן 17', city: 'ירושלים', district: 'ירושלים', coordinates: { lat: 31.751, lon: 35.209 }, isActive: true, source: 'fixture', lastVerified: '2026-08-30', deliveryCapability: 'unsupported', openNow: true },
  { retailerId: 'shufersal', storeId: 'shufersal-haifa-horev', chainId: 'shufersal', chainName: 'שופרסל', name: 'חורב', address: 'חורב 15', city: 'חיפה', district: 'חיפה', coordinates: { lat: 32.789, lon: 34.989 }, isActive: true, source: 'fixture', lastVerified: '2026-08-30', deliveryCapability: 'unsupported', openNow: true },
  { retailerId: 'victory', storeId: 'victory-haifa-check-post', chainId: 'victory', chainName: 'ויקטורי', name: 'צ׳ק פוסט', address: 'ההסתדרות 1', city: 'חיפה', district: 'חיפה', coordinates: { lat: 32.805, lon: 35.04 }, isActive: true, source: 'fixture', lastVerified: '2026-08-30', deliveryCapability: 'unsupported', openNow: true },
  { retailerId: 'rami-levy', storeId: 'rami-levy-beer-sheva', chainId: 'rami-levy', chainName: 'רמי לוי', name: 'באר שבע', address: 'דרך חברון 21', city: 'באר שבע', district: 'דרום', coordinates: { lat: 31.245, lon: 34.792 }, isActive: true, source: 'fixture', lastVerified: '2026-08-30', deliveryCapability: 'unsupported', openNow: true },
  { retailerId: 'shufersal', storeId: 'shufersal-beer-sheva', chainId: 'shufersal', chainName: 'שופרסל', name: 'רמות', address: 'אברהם אבינו 1', city: 'באר שבע', district: 'דרום', coordinates: { lat: 31.267, lon: 34.782 }, isActive: true, source: 'fixture', lastVerified: '2026-08-30', deliveryCapability: 'unsupported', openNow: true },
  { retailerId: 'victory', storeId: 'victory-rishon-lezion', chainId: 'victory', chainName: 'ויקטורי', name: 'ראשון לציון', address: 'לחי 2', city: 'ראשון לציון', district: 'מרכז', coordinates: { lat: 31.983, lon: 34.78 }, isActive: true, source: 'fixture', lastVerified: '2026-08-30', deliveryCapability: 'unsupported', openNow: true },
  { retailerId: 'shufersal', storeId: 'shufersal-netanya', chainId: 'shufersal', chainName: 'שופרסל', name: 'נתניה', address: 'האורזים 2', city: 'נתניה', district: 'מרכז', coordinates: { lat: 32.295, lon: 34.853 }, isActive: true, source: 'fixture', lastVerified: '2026-08-30', deliveryCapability: 'unsupported', openNow: true },
  { retailerId: 'rami-levy', storeId: 'rami-levy-ashdod', chainId: 'rami-levy', chainName: 'רמי לוי', name: 'אשדוד', address: 'בני ברית 1', city: 'אשדוד', district: 'דרום', coordinates: { lat: 31.8, lon: 34.65 }, isActive: true, source: 'fixture', lastVerified: '2026-08-30', deliveryCapability: 'unsupported', openNow: true },
  { retailerId: 'shufersal', storeId: 'shufersal-eilat', chainId: 'shufersal', chainName: 'שופרסל', name: 'אילת', address: 'הסתת 1', city: 'אילת', district: 'דרום', coordinates: { lat: 29.56, lon: 34.95 }, isActive: true, source: 'fixture', lastVerified: '2026-08-30', deliveryCapability: 'unsupported', openNow: true },
  { retailerId: 'victory', storeId: 'victory-nazareth', chainId: 'victory', chainName: 'ויקטורי', name: 'נצרת', address: 'כביש 75', city: 'נצרת', district: 'צפון', coordinates: { lat: 32.704, lon: 35.303 }, isActive: true, source: 'fixture', lastVerified: '2026-08-30', deliveryCapability: 'unsupported', openNow: true },
  { retailerId: 'rami-levy', storeId: 'rami-levy-kfar-saba', chainId: 'rami-levy', chainName: 'רמי לוי', name: 'כפר סבא', address: 'ויצמן 207', city: 'כפר סבא', district: 'מרכז', coordinates: { lat: 32.178, lon: 34.907 }, isActive: true, source: 'fixture', lastVerified: '2026-08-30', deliveryCapability: 'unsupported', openNow: true },
  { retailerId: 'shufersal', storeId: 'shufersal-afula', chainId: 'shufersal', chainName: 'שופרסל', name: 'עפולה', address: 'השוק 1', city: 'עפולה', district: 'צפון', coordinates: { lat: 32.61, lon: 35.29 }, isActive: true, source: 'fixture', lastVerified: '2026-08-30', deliveryCapability: 'unsupported', openNow: true },
  { retailerId: 'victory', storeId: 'victory-modiin', chainId: 'victory', chainName: 'ויקטורי', name: 'מודיעין', address: 'דם המכבים 36', city: 'מודיעין-מכבים-רעות', district: 'מרכז', coordinates: { lat: 31.9, lon: 35.01 }, isActive: true, source: 'fixture', lastVerified: '2026-08-30', deliveryCapability: 'unsupported', openNow: true },
];

export const storeDirectoryCompleteness: StoreDirectoryCompleteness = {
  dataset: 'fixture' as const,
  coverageStatus: 'representative' as const,
  branchCount: nationwideStoreDirectory.length,
  districtCount: new Set(nationwideStoreDirectory.map((entry) => entry.district)).size,
  supportedChains: [...new Set(nationwideStoreDirectory.map((entry) => entry.chainId))],
  source: 'fixture',
  lastVerified: '2026-08-30',
  scope: { id: 'development-representative-fixture', countryCode: 'IL', expectedChains: ['rami-levy', 'shufersal', 'victory'], sourceVersion: 'fixture-2026-08-30', asOf: '2026-08-30' },
  limitations: ['המאגר מייצג סניפים מכל מחוז לצורכי פיתוח ואינו רשימת סניפים חיה או מלאה. יש להחליף אותו בייצוא רשמי מאומת לפני השקה ארצית.'],
};

function completenessFor(entries: StoreDirectoryEntry[], source: 'fixture' | 'configured-source', lastVerified: string, limitations: string[], complete = false, scope: StoreDirectoryScope = source === 'fixture' ? storeDirectoryCompleteness.scope : { id: 'configured-source', countryCode: 'IL', expectedChains: [...new Set(entries.map((entry) => entry.chainId))] }): StoreDirectoryCompleteness {
  return {
    dataset: source,
    coverageStatus: source === 'fixture' ? 'representative' : complete ? 'configured-complete-for-scope' : 'configured-partial',
    branchCount: entries.length,
    districtCount: new Set(entries.map((entry) => entry.district).filter(Boolean)).size,
    supportedChains: [...new Set(entries.map((entry) => entry.chainId))],
    source,
    lastVerified,
    scope,
    limitations,
  };
}

function directoryIdentity(record: NormalizedStore) {
  return `${record.retailerId}:${record.storeId}`.toLocaleLowerCase('en-US');
}

function directoryRecordTime(record: NormalizedStore) {
  const value = record.source.publishedAt ?? record.source.downloadedAt;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function directoryStableTieBreak(record: NormalizedStore) {
  return JSON.stringify({
    retailerId: record.retailerId.trim().toLocaleLowerCase('en-US'),
    storeId: record.storeId.trim().toLocaleLowerCase('en-US'),
    chainId: record.chainId ?? '',
    chainName: record.chainName ?? '',
    name: record.name.trim(),
    address: record.address?.trim() ?? '',
    city: record.city?.trim() ?? '',
    district: record.district?.trim() ?? '',
    postalCode: record.postalCode ?? '',
    latitude: record.latitude ?? null,
    longitude: record.longitude ?? null,
    isActive: record.isActive !== false,
    openNow: record.openNow ?? null,
    deliveryCapability: record.deliveryCapability ?? 'unsupported',
    retailerUrl: record.retailerUrl ?? '',
    sourceFileId: record.source.sourceFileId,
    checksum: record.source.checksum,
  });
}

function shouldReplaceDirectoryRecord(candidate: NormalizedStore, existing: NormalizedStore) {
  const candidateTime = directoryRecordTime(candidate);
  const existingTime = directoryRecordTime(existing);
  if (candidateTime !== existingTime) return candidateTime > existingTime;
  return directoryStableTieBreak(candidate).localeCompare(directoryStableTieBreak(existing), 'en-US') > 0;
}

function validCoordinate(latitude: number | undefined, longitude: number | undefined) {
  return latitude !== undefined && longitude !== undefined && Number.isFinite(latitude) && Number.isFinite(longitude)
    && latitude >= israelBounds.minLat && latitude <= israelBounds.maxLat && longitude >= israelBounds.minLon && longitude <= israelBounds.maxLon;
}

/** Validate and atomically prepare a full or incremental branch feed. */
export async function importStoreDirectory(records: AsyncIterable<NormalizedStore>, options: { mode?: 'full' | 'incremental'; previous?: readonly NormalizedStore[]; minimumRecords?: number; expectedRecords?: number; maxDropRatio?: number } = {}): Promise<StoreDirectoryImportResult> {
  const mode = options.mode ?? 'full';
  const previous = options.previous ? [...options.previous] : [];
  const byIdentity = new Map<string, NormalizedStore>();
  const warnings: string[] = [];
  let duplicateCount = 0;
  let skippedCount = 0;
  for await (const record of records) {
    if (!record.retailerId || !record.storeId || !record.name.trim() || !record.address?.trim() || !record.city?.trim() || !validCoordinate(record.latitude, record.longitude)) {
      skippedCount += 1;
      warnings.push('שורת סניף חסרה מזהה, שם או קואורדינטות בישראל');
      continue;
    }
    const key = directoryIdentity(record);
    const existing = byIdentity.get(key);
    if (existing) duplicateCount += 1;
    if (!existing || shouldReplaceDirectoryRecord(record, existing)) {
      byIdentity.set(key, { ...record, isActive: record.isActive ?? true });
    }
  }
  const candidateRecords = [...byIdentity.values()].sort((left, right) => directoryIdentity(left).localeCompare(directoryIdentity(right), 'en-US'));
  const minimumRecords = options.minimumRecords ?? (mode === 'full' ? 1 : 0);
  const expectedMismatch = options.expectedRecords !== undefined && candidateRecords.length !== options.expectedRecords;
  const maxDropRatio = options.maxDropRatio ?? 0.5;
  const dropTooLarge = mode === 'full' && previous.length > 0 && candidateRecords.length < previous.length * (1 - Math.max(0, Math.min(1, maxDropRatio)));
  const emptyIncrementalWithoutSnapshot = mode === 'incremental' && candidateRecords.length === 0 && previous.length === 0;
  const published = skippedCount === 0 && candidateRecords.length >= minimumRecords && !expectedMismatch && !dropTooLarge && !emptyIncrementalWithoutSnapshot;
  if (expectedMismatch) warnings.push(`מספר רשומות הסניפים (${candidateRecords.length}) אינו תואם לצפי (${options.expectedRecords})`);
  if (dropTooLarge) warnings.push('רענון מלא של הסניפים הושמט: ירידה חריגה במספר הרשומות');
  if (emptyIncrementalWithoutSnapshot) warnings.push('עדכון מדורג ריק ללא snapshot קודם אינו ניתן לפרסום');
  const merged = new Map(previous.map((record) => [directoryIdentity(record), record]));
  if (published && mode === 'incremental') for (const record of candidateRecords) {
    const existing = merged.get(directoryIdentity(record));
    if (!existing || shouldReplaceDirectoryRecord(record, existing)) merged.set(directoryIdentity(record), record);
  }
  const publishedRecords = published ? mode === 'incremental' ? [...merged.values()] : candidateRecords : previous.length ? previous : candidateRecords;
  return { candidateRecords, records: publishedRecords.sort((left, right) => directoryIdentity(left).localeCompare(directoryIdentity(right), 'en-US')), mode, published, duplicateCount, skippedCount, warnings };
}

export function directoryImportIsSafe(result: StoreDirectoryImportResult, minimumRecords = 1) {
  return result.published && result.candidateRecords.length >= minimumRecords && result.skippedCount === 0;
}

const colors: Store['color'][] = ['mint', 'blue', 'yellow'];

function displayStoreName(entry: StoreDirectoryEntry) {
  return entry.name.includes('·') ? `${entry.chainName} ${entry.name}` : `${entry.chainName} · ${entry.name}`;
}

/** Merge directory coverage with the priced fixture without inventing prices. */
export function storesFromDirectory(pricedStores: Store[], entries: readonly StoreDirectoryEntry[] = nationwideStoreDirectory): Store[] {
  const pricedById = new Map(pricedStores.map((store) => [store.id, store]));
  return entries.filter((entry) => entry.isActive).map((entry, index) => {
    const priced = pricedById.get(entry.storeId);
    if (priced) return {
      ...priced,
      chain: entry.chainName,
      name: displayStoreName(entry),
      address: `${entry.address}, ${entry.city}`,
      coordinates: entry.coordinates,
      distanceKm: null,
      openNow: entry.openNow,
      delivery: { ...priced.delivery, capability: entry.deliveryCapability, retailerUrl: entry.retailerUrl ?? priced.delivery.retailerUrl },
    } satisfies Store;
    return {
      id: entry.storeId,
      retailerId: entry.retailerId,
      chain: entry.chainName,
      name: displayStoreName(entry),
      address: `${entry.address}, ${entry.city}`,
      distanceKm: null,
      color: colors[index % colors.length],
      coordinates: entry.coordinates,
      openNow: entry.openNow,
      delivery: { capability: entry.deliveryCapability, retailerUrl: entry.retailerUrl, coverageVerified: false, feesVerified: false },
    } satisfies Store;
  });
}

const directoryCache = new Map<string, { expiresAt: number; result: StoreDirectoryLoadResult }>();
const directoryInflight = new Map<string, Promise<StoreDirectoryLoadResult>>();
const directoryCacheTtlMs = 5 * 60 * 1000;
const directoryFailureTtlMs = 30 * 1000;
const directoryFetchTimeoutMs = 10_000;

function sourceMetadata(retailerId: string, source: unknown, lastVerified?: unknown) {
  if (source && typeof source === 'object') {
    const value = source as Record<string, unknown>;
    if (typeof value.sourceUri === 'string' && typeof value.downloadedAt === 'string') return source as NormalizedStore['source'];
  }
  const verified = typeof lastVerified === 'string' ? lastVerified : new Date().toISOString();
  return { retailerId, adapterId: 'configured-directory', sourceFileId: 'configured-directory', sourceUri: typeof source === 'string' ? source : 'configured://directory', fileName: 'directory.json', documentKind: 'stores' as const, publishedAt: verified, downloadedAt: verified, checksum: 'runtime-source' };
}

function normalizedExternalRecord(raw: unknown): NormalizedStore | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const coordinates = value.coordinates && typeof value.coordinates === 'object' ? value.coordinates as Record<string, unknown> : undefined;
  const retailerId = typeof value.retailerId === 'string' ? value.retailerId : typeof value.chainId === 'string' ? value.chainId : null;
  const storeId = typeof value.storeId === 'string' ? value.storeId : typeof value.id === 'string' ? value.id : null;
  const name = typeof value.name === 'string' ? value.name : typeof value.branch === 'string' ? value.branch : null;
  const numeric = (input: unknown) => {
    const result = typeof input === 'number' ? input : typeof input === 'string' && input.trim() ? Number(input) : Number.NaN;
    return Number.isFinite(result) ? result : null;
  };
  const latitude = numeric(value.latitude ?? coordinates?.lat);
  const longitude = numeric(value.longitude ?? coordinates?.lon);
  const address = typeof value.address === 'string' ? value.address.trim() : undefined;
  const city = typeof value.city === 'string' ? value.city.trim() : undefined;
  if (!retailerId || !storeId || !name || !address || !city || latitude === null || longitude === null) return null;
  return {
    retailerId,
    storeId,
    chainId: typeof value.chainId === 'string' ? value.chainId : retailerId,
    chainName: typeof value.chainName === 'string' ? value.chainName : undefined,
    name,
    address,
    city,
    district: typeof value.district === 'string' ? value.district.trim() : undefined,
    postalCode: typeof value.postalCode === 'string' ? value.postalCode : undefined,
    latitude,
    longitude,
    isActive: value.isActive !== false,
    openNow: typeof value.openNow === 'boolean' ? value.openNow : null,
    deliveryCapability: value.deliveryCapability === 'deep_link' || value.deliveryCapability === 'partial' || value.deliveryCapability === 'manual' || value.deliveryCapability === 'unsupported' ? value.deliveryCapability : undefined,
    retailerUrl: typeof value.retailerUrl === 'string' ? value.retailerUrl : undefined,
    source: sourceMetadata(retailerId, value.source, value.lastVerified),
  };
}

function directoryEntryFromRecord(record: NormalizedStore): StoreDirectoryEntry {
  const source = record.source;
  const lastVerified = source.publishedAt ?? source.downloadedAt;
  return {
    retailerId: record.retailerId,
    storeId: record.storeId,
    chainId: record.chainId ?? record.retailerId,
    chainName: record.chainName ?? record.chainId ?? record.retailerId,
    name: record.name,
    address: record.address ?? 'כתובת לא סופקה',
    city: record.city ?? 'יישוב לא סופק',
    district: record.district ?? 'לא סווג',
    postalCode: record.postalCode,
    coordinates: { lat: record.latitude!, lon: record.longitude! },
    isActive: record.isActive !== false,
    source: source.sourceUri,
    lastVerified,
    deliveryCapability: record.deliveryCapability ?? 'unsupported',
    retailerUrl: record.retailerUrl,
    openNow: record.openNow ?? null,
  };
}

function externalRecords(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  const value = payload as Record<string, unknown>;
  for (const key of ['stores', 'records', 'branches']) if (Array.isArray(value[key])) return value[key] as unknown[];
  if (value.result) return externalRecords(value.result);
  return [];
}

function configuredScope(payload: unknown, entries: readonly StoreDirectoryEntry[]): StoreDirectoryScope {
  const root = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload as Record<string, unknown> : {};
  const completeness = root.completeness && typeof root.completeness === 'object' ? root.completeness as Record<string, unknown> : root;
  const rawScope = completeness.scope && typeof completeness.scope === 'object' ? completeness.scope as Record<string, unknown> : root.scope && typeof root.scope === 'object' ? root.scope as Record<string, unknown> : {};
  const expectedChains = Array.isArray(rawScope.expectedChains) ? rawScope.expectedChains.filter((value): value is string => typeof value === 'string' && Boolean(value.trim())).map((value) => value.trim()).sort() : [];
  const expectedBranchCount = typeof rawScope.expectedBranchCount === 'number' && Number.isInteger(rawScope.expectedBranchCount) ? rawScope.expectedBranchCount : undefined;
  return {
    id: typeof rawScope.id === 'string' && rawScope.id.trim() ? rawScope.id.trim() : typeof rawScope.scopeId === 'string' && rawScope.scopeId.trim() ? rawScope.scopeId.trim() : 'configured-source',
    countryCode: typeof rawScope.countryCode === 'string' ? rawScope.countryCode.trim().toUpperCase() : '',
    expectedBranchCount,
    expectedChains: expectedChains.length ? expectedChains : [...new Set(entries.map((entry) => entry.chainId))].sort(),
    sourceVersion: typeof rawScope.sourceVersion === 'string' ? rawScope.sourceVersion : typeof rawScope.version === 'string' ? rawScope.version : undefined,
    asOf: typeof rawScope.asOf === 'string' ? rawScope.asOf : typeof rawScope.lastVerified === 'string' ? rawScope.lastVerified : undefined,
  };
}

function sourceClaimsComplete(payload: unknown, entries: readonly StoreDirectoryEntry[]) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { complete: false, scope: configuredScope(payload, entries) };
  const value = payload as Record<string, unknown>;
  const completeness = value.completeness && typeof value.completeness === 'object' ? value.completeness as Record<string, unknown> : value;
  const declaredComplete = value.complete === true || value.coverageStatus === 'complete' || completeness.complete === true || completeness.coverageStatus === 'complete';
  const scope = configuredScope(payload, entries);
  const actualChains = [...new Set(entries.map((entry) => entry.chainId))].sort();
  const expectedChains = [...scope.expectedChains].sort();
  const complete = declaredComplete
    && scope.countryCode === 'IL'
    && Boolean(scope.id && scope.sourceVersion && scope.asOf && Number.isFinite(new Date(scope.asOf).getTime()))
    && scope.expectedBranchCount === entries.length
    && expectedChains.length > 0
    && expectedChains.length === actualChains.length
    && expectedChains.every((chain) => actualChains.includes(chain));
  return { complete, scope };
}

/**
 * Load a complete branch snapshot from a provider-neutral JSON endpoint. The
 * endpoint is server-side only; failures and unsafe snapshots keep the local
 * fixture available and visibly marked as such.
 */
async function fetchConfiguredDirectory(endpoint: string, fetchImpl: typeof fetch): Promise<StoreDirectoryLoadResult> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), directoryFetchTimeoutMs);
    try {
      const response = await fetchImpl(endpoint, { headers: { accept: 'application/json' }, signal: controller.signal });
      if (!response.ok) throw new Error(`directory source returned ${response.status}`);
      const payload = await response.json() as unknown;
      const rawRecords = externalRecords(payload);
      const normalized: NormalizedStore[] = [];
      let invalidCount = 0;
      rawRecords.forEach((raw) => {
        const record = normalizedExternalRecord(raw);
        if (record) normalized.push(record); else invalidCount += 1;
      });
      const imported = await importStoreDirectory((async function* () { yield* normalized; })());
      if (!rawRecords.length || invalidCount > 0 || !directoryImportIsSafe(imported)) throw new Error('directory source failed validation');
      const entries = imported.records.map(directoryEntryFromRecord);
      const claim = sourceClaimsComplete(payload, entries);
      const limitations = claim.complete ? [] : ['מקור הסניפים חייב לספק scope עם countryCode=IL, מזהה scope, גרסה, תאריך asOf, expectedChains ו-expectedBranchCount התואם לרשומות הייחודיות; אחרת הוא מסומן חלקי.'];
      const result = { entries, completeness: completenessFor(entries, 'configured-source', new Date().toISOString(), limitations, claim.complete, claim.scope) };
      directoryCache.set(endpoint, { expiresAt: Date.now() + directoryCacheTtlMs, result });
      return result;
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    const result = {
      entries: nationwideStoreDirectory,
      completeness: completenessFor(nationwideStoreDirectory, 'fixture', storeDirectoryCompleteness.lastVerified, [
        ...storeDirectoryCompleteness.limitations,
        'מקור הסניפים שהוגדר לא זמין או נכשל בבדיקת תקינות; מוצגת תמונת fixture אחרונה.',
      ]),
    };
    directoryCache.set(endpoint, { expiresAt: Date.now() + directoryFailureTtlMs, result });
    return result;
  }
}

export async function loadStoreDirectory(fetchImpl: typeof fetch = fetch): Promise<StoreDirectoryLoadResult> {
  const endpoint = process.env.STORE_DIRECTORY_URL?.trim();
  if (!endpoint) return { entries: nationwideStoreDirectory, completeness: storeDirectoryCompleteness };
  const cached = directoryCache.get(endpoint);
  if (cached && cached.expiresAt > Date.now()) return cached.result;
  const pending = directoryInflight.get(endpoint);
  if (pending) return pending;
  const request = fetchConfiguredDirectory(endpoint, fetchImpl);
  directoryInflight.set(endpoint, request);
  try {
    return await request;
  } finally {
    if (directoryInflight.get(endpoint) === request) directoryInflight.delete(endpoint);
  }
}
