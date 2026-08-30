import type { Store } from './data.ts';
import type { DiscoveryInput, NormalizedStore, ParseContext, RetailerSourceAdapter } from './ingestion/types.ts';

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
  status: 'active' | 'inactive' | 'temporarily-closed' | 'emergency-open' | 'unknown';
  source: string;
  lastVerified: string;
  verifiedAt: string;
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

export type StoreDirectoryAdapterReport = {
  adapterId: string;
  retailerId: string;
  status: 'completed' | 'partial' | 'failed';
  discoveredFileCount: number;
  storeFileCount: number;
  downloadedFileCount: number;
  parsedRecordCount: number;
  warnings: string[];
  failures: string[];
};

export type StoreDirectoryAdapterImportResult = {
  /** Records observed across all adapter feeds before the publication gate. */
  candidateRecords: NormalizedStore[];
  /** Safe records to persist; a failed full run retains `previous` when supplied. */
  records: NormalizedStore[];
  candidateEntries: StoreDirectoryEntry[];
  entries: StoreDirectoryEntry[];
  importResult: StoreDirectoryImportResult;
  adapterReports: StoreDirectoryAdapterReport[];
  published: boolean;
  feedState: 'complete' | 'partial' | 'failed';
  warnings: string[];
};

export type StoreDirectoryAdapterImportOptions = {
  mode?: 'full' | 'incremental';
  previous?: readonly NormalizedStore[];
  minimumRecords?: number;
  expectedRecords?: number;
  maxDropRatio?: number;
  now?: Date;
  /** Map a shared-feed chain identifier to the app's stable retailer id. */
  retailerIdForStore?: (record: NormalizedStore, adapter: RetailerSourceAdapter) => string | undefined;
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
  warnings: string[];
  sourceState: 'fixture' | 'live' | 'stale-fallback' | 'mixed';
  refreshAttempted: boolean;
};

export type StoreDirectoryLoadResult = {
  entries: StoreDirectoryEntry[];
  completeness: StoreDirectoryCompleteness;
};

export type StoreDirectorySourceContract = {
  version: '1';
  format: 'ckan-datastore-json' | 'normalized-json';
  recordPath: string;
  requiredRecordFields: readonly string[];
  coordinateSystems: readonly string[];
  completenessRule: string;
};

/**
 * The only payload contract accepted by the server-side directory loader.
 * A source can be useful without being a claim of nationwide coverage; the
 * completeness manifest is deliberately separate from the row schema.
 */
export const storeDirectorySourceContract: StoreDirectorySourceContract = {
  version: '1',
  format: 'ckan-datastore-json',
  recordPath: 'result.records[] (or stores[]/records[]/branches[])',
  requiredRecordFields: ['retailerId or chain', 'storeId or branch id', 'name or branch', 'address', 'city', 'latitude/longitude or ITM X/Y', 'source/lastVerified or source timestamp'],
  coordinateSystems: ['WGS84 latitude/longitude', 'EPSG:2039 / Israeli TM Grid (ITM) X/Y'],
  completenessRule: 'Only an explicit IL scope manifest with expectedBranchCount and expectedChains can be complete-for-scope; a source without that manifest remains partial.',
};

export const IRON_BRANCHES_RESOURCE_ID = 'f7d9c47e-3414-4524-a187-a0f0e057b08a';
export const IRON_BRANCHES_SOURCE_URL = `https://data.gov.il/he/datasets/moital/iron-branches/${IRON_BRANCHES_RESOURCE_ID}`;
export const IRON_BRANCHES_DATASTORE_URL = `https://data.gov.il/api/3/action/datastore_search?resource_id=${IRON_BRANCHES_RESOURCE_ID}&limit=1000`;

/** Public sources investigated for this directory; none is a complete cross-chain inventory. */
export const officialDirectorySources = [
  { id: 'iron-branches', authority: 'Israel Ministry of Economy and Industry', url: IRON_BRANCHES_SOURCE_URL, format: 'CSV / CKAN DataStore JSON', coverage: 'emergency-branch subset; partial', coordinateSystem: 'EPSG:2039 / ITM X/Y' },
  { id: 'israel-basket', authority: 'Israel Ministry of Economy and Industry', url: 'https://data.gov.il/he/datasets/moital/israel-sal', format: 'CSV / CKAN DataStore JSON', coverage: 'participating Israel Basket branches; partial', coordinateSystem: 'address only' },
  { id: 'rami-levy-branches', authority: 'Rami Levy', url: 'https://tav.rami-levy.co.il/branches/', format: 'official HTML', coverage: 'single chain; coordinates not supplied in the public listing' },
  { id: 'victory-branches', authority: 'Victory', url: 'https://victory.co.il/branches/', format: 'official HTML', coverage: 'single chain; coordinates not supplied in the public listing' },
  { id: 'shufersal-branches', authority: 'Shufersal', url: 'https://media.shufersal.co.il/policy/ShufersalBranchesOnSaturdayEveningsV3.pdf', format: 'official PDF', coverage: 'operational subset; coordinates not supplied' },
] as const;

const israelBounds = { minLat: 29.45, maxLat: 33.35, minLon: 34.15, maxLon: 35.95 };

/**
 * A deliberately broad, provider-neutral fixture. Production refreshes should
 * replace this list with the validated output of a retailer branch feed.
 * Existing priced branches are kept as the first three records so the local
 * shopping fixture remains useful while the directory spans all districts.
 */
const representativeStoreDirectorySeed: Array<Omit<StoreDirectoryEntry, 'status' | 'verifiedAt'>> = [
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

export const nationwideStoreDirectory: StoreDirectoryEntry[] = representativeStoreDirectorySeed.map((entry) => ({
  ...entry,
  status: entry.isActive ? 'active' : 'inactive',
  verifiedAt: entry.lastVerified,
}));

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
  warnings: [],
  sourceState: 'fixture',
  refreshAttempted: false,
};

function completenessFor(entries: StoreDirectoryEntry[], source: 'fixture' | 'configured-source', lastVerified: string, limitations: string[], complete = false, scope: StoreDirectoryScope = source === 'fixture' ? storeDirectoryCompleteness.scope : { id: 'configured-source', countryCode: 'IL', expectedChains: [...new Set(entries.map((entry) => entry.chainId))] }, options: { warnings?: string[]; sourceState?: StoreDirectoryCompleteness['sourceState']; refreshAttempted?: boolean } = {}): StoreDirectoryCompleteness {
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
    warnings: options.warnings ?? [],
    sourceState: options.sourceState ?? (source === 'fixture' ? 'fixture' : 'live'),
    refreshAttempted: options.refreshAttempted ?? source === 'configured-source',
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
const directoryLastValid = new Map<string, StoreDirectoryLoadResult>();
const directoryInflight = new Map<string, Promise<StoreDirectoryLoadResult>>();
const directoryCacheTtlMs = 5 * 60 * 1000;
const directoryFailureTtlMs = 30 * 1000;
const directoryFetchTimeoutMs = 10_000;
const directoryMaxResponseBytes = 20 * 1024 * 1024;

/** Convert EPSG:2039 (Israeli TM Grid) easting/northing to WGS84. */
export function israelGridToWgs84(easting: number, northing: number): { lat: number; lon: number } | null {
  if (!Number.isFinite(easting) || !Number.isFinite(northing) || easting < 100_000 || easting > 350_000 || northing < 0 || northing > 900_000) return null;
  const a = 6378137;
  const inverseFlattening = 298.257222101;
  const f = 1 / inverseFlattening;
  const eccentricitySquared = f * (2 - f);
  const secondEccentricitySquared = eccentricitySquared / (1 - eccentricitySquared);
  const scale = 1.0000067;
  const latitudeOfOrigin = 31.7343936111111 * Math.PI / 180;
  const centralMeridian = 35.2045169444444 * Math.PI / 180;
  const falseEasting = 219529.584;
  const falseNorthing = 626907.39;
  const meridionalArc = (latitude: number) => a * ((1 - eccentricitySquared / 4 - 3 * eccentricitySquared ** 2 / 64 - 5 * eccentricitySquared ** 3 / 256) * latitude
    - (3 * eccentricitySquared / 8 + 3 * eccentricitySquared ** 2 / 32 + 45 * eccentricitySquared ** 3 / 1024) * Math.sin(2 * latitude)
    + (15 * eccentricitySquared ** 2 / 256 + 45 * eccentricitySquared ** 3 / 1024) * Math.sin(4 * latitude)
    - (35 * eccentricitySquared ** 3 / 3072) * Math.sin(6 * latitude));
  const meridian = meridionalArc(latitudeOfOrigin) + (northing - falseNorthing) / scale;
  const mu = meridian / (a * (1 - eccentricitySquared / 4 - 3 * eccentricitySquared ** 2 / 64 - 5 * eccentricitySquared ** 3 / 256));
  const footpoint = mu
    + (3 * (eccentricitySquared / (1 - eccentricitySquared)) / 2 - 27 * (eccentricitySquared / (1 - eccentricitySquared)) ** 3 / 32) * Math.sin(2 * mu)
    + (21 * (eccentricitySquared / (1 - eccentricitySquared)) ** 2 / 16 - 55 * (eccentricitySquared / (1 - eccentricitySquared)) ** 4 / 32) * Math.sin(4 * mu)
    + (151 * (eccentricitySquared / (1 - eccentricitySquared)) ** 3 / 96) * Math.sin(6 * mu);
  const sinFootpoint = Math.sin(footpoint);
  const cosFootpoint = Math.cos(footpoint);
  const tangentSquared = Math.tan(footpoint) ** 2;
  const radiusPrimeVertical = a / Math.sqrt(1 - eccentricitySquared * sinFootpoint ** 2);
  const radiusMeridian = a * (1 - eccentricitySquared) / (1 - eccentricitySquared * sinFootpoint ** 2) ** 1.5;
  const c = secondEccentricitySquared * cosFootpoint ** 2;
  const d = (easting - falseEasting) / (radiusPrimeVertical * scale);
  const latitude = footpoint - (radiusPrimeVertical * Math.tan(footpoint) / radiusMeridian) * (d ** 2 / 2 - (5 + 3 * tangentSquared + 10 * c - 4 * c ** 2 - 9 * secondEccentricitySquared) * d ** 4 / 24 + (61 + 90 * tangentSquared + 298 * c + 45 * tangentSquared ** 2 - 252 * secondEccentricitySquared - 3 * c ** 2) * d ** 6 / 720);
  const longitude = centralMeridian + (d - (1 + 2 * tangentSquared + c) * d ** 3 / 6 + (5 - 2 * c + 28 * tangentSquared - 3 * c ** 2 + 8 * secondEccentricitySquared + 24 * tangentSquared ** 2) * d ** 5 / 120) / cosFootpoint;
  const result = { lat: latitude * 180 / Math.PI, lon: longitude * 180 / Math.PI };
  return validCoordinate(result.lat, result.lon) ? result : null;
}

function parseTimestamp(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const dayMonthYear = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  const parsed = dayMonthYear ? new Date(Date.UTC(Number(dayMonthYear[3]), Number(dayMonthYear[2]) - 1, Number(dayMonthYear[1]))) : new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function numericValue(input: unknown): number | null {
  const value = typeof input === 'number' ? input : typeof input === 'string' && input.trim() ? Number(input.replaceAll(',', '').trim()) : Number.NaN;
  return Number.isFinite(value) ? value : null;
}

function directoryStatus(input: unknown, isActive: boolean | undefined, emergencySource: boolean): StoreDirectoryEntry['status'] {
  const value = typeof input === 'string' ? input.trim().toLocaleLowerCase('he-IL') : '';
  if (emergencySource) return 'emergency-open';
  if (/inactive|closed|סגור|לא פעיל/.test(value)) return 'inactive';
  if (/temporary|temporarily|שיפוץ|זמני/.test(value)) return 'temporarily-closed';
  if (isActive === false) return 'inactive';
  if (value) return 'active';
  return isActive === true ? 'active' : 'unknown';
}

class DirectorySourceValidationError extends Error {
  readonly warningList: string[];

  constructor(warningList: string[]) {
    super('directory source failed validation');
    this.warningList = warningList;
  }
}

function sourceMetadata(retailerId: string, source: unknown, lastVerified: string, downloadedAt = lastVerified) {
  if (source && typeof source === 'object') {
    const value = source as Record<string, unknown>;
    if (typeof value.sourceUri === 'string' && typeof value.downloadedAt === 'string') return source as NormalizedStore['source'];
  }
  return { retailerId, adapterId: 'configured-directory', sourceFileId: 'configured-directory', sourceUri: typeof source === 'string' ? source : 'configured://directory', fileName: 'directory.json', documentKind: 'stores' as const, publishedAt: lastVerified, downloadedAt, checksum: 'runtime-source' };
}

function normalizedExternalRecord(raw: unknown, context: { endpoint: string; verifiedAt?: string; downloadedAt?: string } = { endpoint: 'configured://directory' }): NormalizedStore | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const coordinates = value.coordinates && typeof value.coordinates === 'object' ? value.coordinates as Record<string, unknown> : undefined;
  const emergencySource = context.endpoint.includes(IRON_BRANCHES_RESOURCE_ID) || context.endpoint.includes('iron-branches');
  const chain = typeof value.retailerId === 'string' ? value.retailerId : typeof value.chainId === 'string' ? value.chainId : typeof value.chain === 'string' ? value.chain : typeof value.network === 'string' ? value.network : null;
  const retailerId = chain?.trim() || null;
  const explicitStoreId = typeof value.storeId === 'string' ? value.storeId : typeof value.id === 'string' ? value.id : typeof value.branchId === 'string' ? value.branchId : typeof value.branch_id === 'string' ? value.branch_id : null;
  const name = typeof value.name === 'string' ? value.name : typeof value.branch === 'string' ? value.branch : null;
  const easting = numericValue(value.x ?? value.X ?? value.easting ?? coordinates?.x);
  const northing = numericValue(value.y ?? value.Y ?? value.northing ?? coordinates?.y);
  const converted = easting !== null && northing !== null ? israelGridToWgs84(easting, northing) : null;
  const latitude = numericValue(value.latitude ?? value.lat ?? coordinates?.lat) ?? converted?.lat ?? null;
  const longitude = numericValue(value.longitude ?? value.lon ?? value.lng ?? coordinates?.lon) ?? converted?.lon ?? null;
  const address = typeof value.address === 'string' ? value.address.trim() : undefined;
  const street = typeof value.street === 'string' ? value.street.trim() : '';
  const city = typeof value.city === 'string' ? value.city.trim() : undefined;
  const resolvedAddress = address || (street && city ? `${street}, ${city}` : undefined);
  const verifiedAt = parseTimestamp(value.lastVerified ?? value.verifiedAt ?? value.report_date ?? value.reportDate ?? (value.source && typeof value.source === 'object' ? (value.source as Record<string, unknown>).publishedAt ?? (value.source as Record<string, unknown>).downloadedAt : undefined) ?? context.verifiedAt);
  const storeId = explicitStoreId?.trim() || (retailerId && name && resolvedAddress ? `${retailerId}:${name}:${resolvedAddress}`.toLocaleLowerCase('en-US').replace(/[^a-z0-9א-ת:]+/gi, '-') : null);
  if (!retailerId || !storeId || !name?.trim() || !resolvedAddress || !city || latitude === null || longitude === null || !verifiedAt) return null;
  return {
    retailerId,
    storeId,
    chainId: typeof value.chainId === 'string' ? value.chainId : retailerId,
    chainName: typeof value.chainName === 'string' ? value.chainName : typeof value.chain === 'string' ? value.chain : undefined,
    name: name.trim(),
    address: resolvedAddress,
    city,
    district: typeof value.district === 'string' ? value.district.trim() : undefined,
    postalCode: typeof value.postalCode === 'string' ? value.postalCode : undefined,
    latitude,
    longitude,
    isActive: value.isActive !== false && directoryStatus(value.status, typeof value.isActive === 'boolean' ? value.isActive : undefined, emergencySource) !== 'inactive',
    openNow: typeof value.openNow === 'boolean' ? value.openNow : null,
    deliveryCapability: value.deliveryCapability === 'deep_link' || value.deliveryCapability === 'partial' || value.deliveryCapability === 'manual' || value.deliveryCapability === 'unsupported' ? value.deliveryCapability : undefined,
    retailerUrl: typeof value.retailerUrl === 'string' ? value.retailerUrl : undefined,
    source: sourceMetadata(retailerId, value.source ?? context.endpoint, verifiedAt, context.downloadedAt ?? verifiedAt),
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
    status: directoryStatus(undefined, record.isActive, source.sourceUri.includes(IRON_BRANCHES_RESOURCE_ID) || source.sourceUri.includes('iron-branches')),
    source: source.sourceUri,
    lastVerified,
    verifiedAt: lastVerified,
    deliveryCapability: record.deliveryCapability ?? 'unsupported',
    retailerUrl: record.retailerUrl,
    openNow: record.openNow ?? null,
  };
}

async function collectDirectoryRecordsFromAdapter(
  adapter: RetailerSourceAdapter,
  input: Omit<DiscoveryInput, 'retailerId'>,
): Promise<{ records: NormalizedStore[]; report: StoreDirectoryAdapterReport }> {
  const report: StoreDirectoryAdapterReport = {
    adapterId: adapter.metadata.adapterId,
    retailerId: adapter.retailerId,
    status: 'failed',
    discoveredFileCount: 0,
    storeFileCount: 0,
    downloadedFileCount: 0,
    parsedRecordCount: 0,
    warnings: [],
    failures: [],
  };
  const records: NormalizedStore[] = [];
  try {
    const discovered = await adapter.discoverFiles({ ...input, retailerId: adapter.retailerId, documentKinds: ['stores'] });
    const files = [...new Map(discovered.filter((file) => file.documentKind === 'stores').map((file) => [file.id, file])).values()];
    report.discoveredFileCount = discovered.length;
    report.storeFileCount = files.length;
    if (!files.length) {
      report.failures.push('no stores document was discovered');
      return { records, report };
    }
    for (const file of files) {
      try {
        const downloaded = await adapter.downloadFile(file, input.signal);
        report.downloadedFileCount += 1;
        const context: ParseContext = {
          source: downloaded,
          metadata: {
            retailerId: adapter.retailerId,
            adapterId: adapter.metadata.adapterId,
            sourceFileId: file.id,
            sourceUri: file.uri,
            fileName: file.fileName,
            documentKind: file.documentKind,
            publishedAt: file.publishedAt,
            downloadedAt: downloaded.downloadedAt,
            checksum: downloaded.checksum,
          },
          now: input.now ?? new Date(),
          warn: (message) => report.warnings.push(`${file.id}: ${message}`),
        };
        for await (const record of adapter.parseStores(downloaded, context)) records.push(record);
        report.parsedRecordCount = records.length;
      } catch (error) {
        report.failures.push(`${file.id}: ${error instanceof Error ? error.message : 'store document failed'}`);
      }
    }
  } catch (error) {
    report.failures.push(error instanceof Error ? error.message : 'directory discovery failed');
  }
  if (report.failures.length) report.status = records.length ? 'partial' : 'failed';
  else if (!records.length) {
    report.status = 'failed';
    report.failures.push('stores documents produced no records');
  } else report.status = 'completed';
  return { records, report };
}

/**
 * Discover and import official retailer `stores` documents into the directory
 * boundary. This is intentionally separate from the HTTP snapshot loader so a
 * worker can use the existing authenticated Cerberus or public retailer
 * adapter, retain per-adapter evidence, and refuse to publish a cross-chain
 * snapshot when one expected adapter fails.
 */
export async function importStoreDirectoryFromAdapters(
  adapters: readonly RetailerSourceAdapter[],
  input: Omit<DiscoveryInput, 'retailerId'> = {},
  options: StoreDirectoryAdapterImportOptions = {},
): Promise<StoreDirectoryAdapterImportResult> {
  const collected = await Promise.all(adapters.map((adapter) => collectDirectoryRecordsFromAdapter(adapter, input)));
  const adapterReports = collected.map((result) => result.report);
  const candidateRecords = collected.flatMap((result, index) => result.records.map((record) => {
    const retailerId = options.retailerIdForStore?.(record, adapters[index]!)?.trim();
    return retailerId ? { ...record, retailerId } : record;
  }));
  const importResult = await importStoreDirectory((async function* () { yield* candidateRecords; }()), {
    mode: options.mode,
    previous: options.previous,
    minimumRecords: options.minimumRecords,
    expectedRecords: options.expectedRecords,
    maxDropRatio: options.maxDropRatio,
  });
  const allAdaptersCompleted = adapters.length > 0 && adapterReports.length === adapters.length && adapterReports.every((report) => report.status === 'completed');
  const published = allAdaptersCompleted && importResult.published;
  const safeRecords = published ? importResult.records : [...(options.previous ?? [])];
  const warnings = [
    ...importResult.warnings,
    ...adapterReports.flatMap((report) => report.warnings),
    ...adapterReports.flatMap((report) => report.failures.map((failure) => `${report.adapterId}: ${failure}`)),
    ...(adapters.length ? [] : ['no directory adapters were configured']),
    ...(!allAdaptersCompleted && candidateRecords.length ? ['directory feed is partial; a failed adapter prevented publication'] : []),
  ];
  const feedState = published ? 'complete' : candidateRecords.length ? 'partial' : 'failed';
  return {
    candidateRecords: importResult.candidateRecords,
    records: safeRecords,
    candidateEntries: importResult.candidateRecords.map(directoryEntryFromRecord),
    entries: safeRecords.map(directoryEntryFromRecord),
    importResult,
    adapterReports,
    published,
    feedState,
    warnings: [...new Set(warnings)],
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

function sourceTimestamp(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const root = payload as Record<string, unknown>;
  const result = root.result && typeof root.result === 'object' ? root.result as Record<string, unknown> : undefined;
  return parseTimestamp(root.last_modified ?? root.lastModified ?? root.updatedAt ?? result?.last_modified ?? result?.lastModified ?? result?.updatedAt) ?? undefined;
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > directoryMaxResponseBytes) throw new Error('directory source response exceeds size limit');
  const body = await response.text();
  if (new TextEncoder().encode(body).byteLength > directoryMaxResponseBytes) throw new Error('directory source response exceeds size limit');
  return JSON.parse(body) as unknown;
}

/**
 * Load a complete branch snapshot from a provider-neutral JSON endpoint. The
 * endpoint is server-side only; failures and unsafe snapshots keep the local
 * fixture available and visibly marked as such.
 */
async function fetchConfiguredDirectory(endpoint: string, fetchImpl: typeof fetch): Promise<StoreDirectoryLoadResult> {
  const refreshWarnings: string[] = [];
  try {
    const parsedEndpoint = new URL(endpoint);
    if (parsedEndpoint.protocol !== 'https:' && parsedEndpoint.protocol !== 'http:') throw new Error('directory source URL must use HTTP(S)');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), directoryFetchTimeoutMs);
    try {
      const fetchPage = async (url: string) => {
        const response = await fetchImpl(url, { headers: { accept: 'application/json' }, signal: controller.signal });
        if (!response.ok) throw new Error(`directory source returned ${response.status}`);
        const payload = await readBoundedJson(response);
        if (payload && typeof payload === 'object' && !Array.isArray(payload) && (payload as Record<string, unknown>).success === false) throw new Error('directory CKAN source reported failure');
        return payload;
      };
      let payload = await fetchPage(endpoint);
      const parsedSource = new URL(endpoint);
      const isCkanDataStore = parsedSource.pathname.endsWith('/datastore_search') && parsedSource.searchParams.has('resource_id');
      if (isCkanDataStore) {
        const firstRecords = externalRecords(payload);
        const result = payload && typeof payload === 'object' && !Array.isArray(payload) && (payload as Record<string, unknown>).result && typeof (payload as Record<string, unknown>).result === 'object'
          ? (payload as Record<string, unknown>).result as Record<string, unknown> : {};
        const total = numericValue(result.total);
        const requestedLimit = Math.max(1, Math.min(1000, Math.floor(numericValue(parsedSource.searchParams.get('limit')) ?? 1000)));
        const records = [...firstRecords];
        let offset = (numericValue(parsedSource.searchParams.get('offset')) ?? 0) + records.length;
        let pageCount = 1;
        while (pageCount < 50 && (total === null ? firstRecords.length >= requestedLimit : records.length < total)) {
          const nextUrl = new URL(endpoint);
          nextUrl.searchParams.set('limit', String(requestedLimit));
          nextUrl.searchParams.set('offset', String(offset));
          const nextPayload = await fetchPage(nextUrl.toString());
          const nextRecords = externalRecords(nextPayload);
          records.push(...nextRecords);
          pageCount += 1;
          if (!nextRecords.length || nextRecords.length < requestedLimit) break;
          offset += nextRecords.length;
        }
        if (total !== null && records.length < total) throw new Error(`directory CKAN source pagination incomplete (${records.length}/${total})`);
        const root = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload as Record<string, unknown> : {};
        payload = { ...root, result: { ...result, records } };
      }
      const rawRecords = externalRecords(payload);
      const normalized: NormalizedStore[] = [];
      let invalidCount = 0;
      const downloadedAt = new Date().toISOString();
      const verifiedAt = sourceTimestamp(payload);
      rawRecords.forEach((raw, index) => {
        const record = normalizedExternalRecord(raw, { endpoint, verifiedAt, downloadedAt });
        if (record) normalized.push(record); else {
          invalidCount += 1;
          refreshWarnings.push(`directory row ${index + 1} is malformed or lacks authoritative coordinates/timestamp`);
        }
      });
      const imported = await importStoreDirectory((async function* () { yield* normalized; })());
      refreshWarnings.push(...imported.warnings);
      if (!rawRecords.length) refreshWarnings.push('directory source returned no records');
      if (!rawRecords.length || invalidCount > 0 || !directoryImportIsSafe(imported)) throw new DirectorySourceValidationError(refreshWarnings);
      const entries = imported.records.map(directoryEntryFromRecord);
      const claim = sourceClaimsComplete(payload, entries);
      const emergencySource = endpoint.includes(IRON_BRANCHES_RESOURCE_ID) || endpoint.includes('iron-branches');
      const sourceLimitations = [
        ...(claim.complete ? [] : ['configured source is partial unless its IL scope manifest declares matching expectedChains and expectedBranchCount']),
        ...(emergencySource ? ['Iron Branches is an emergency-open subset, not a complete Israeli supermarket inventory.'] : []),
      ];
      const lastVerified = sourceTimestamp(payload) ?? entries.map((entry) => entry.lastVerified).sort().at(-1) ?? downloadedAt;
      const result = { entries, completeness: completenessFor(entries, 'configured-source', lastVerified, sourceLimitations, claim.complete, claim.scope, { warnings: refreshWarnings, sourceState: 'live', refreshAttempted: true }) };
      directoryLastValid.set(endpoint, result);
      directoryCache.set(endpoint, { expiresAt: Date.now() + directoryCacheTtlMs, result });
      return result;
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    const warnings = error instanceof DirectorySourceValidationError ? error.warningList : [`directory source refresh failed: ${error instanceof Error ? error.message : 'unknown error'}`];
    const previous = directoryLastValid.get(endpoint);
    if (previous) {
      const result = {
        entries: previous.entries,
        completeness: { ...previous.completeness, limitations: [...previous.completeness.limitations, 'מקור הסניפים החדש לא אומת; נשמר ה-snapshot התקין האחרון.'] },
      };
      result.completeness = { ...result.completeness, warnings: [...result.completeness.warnings, ...warnings], sourceState: 'stale-fallback', refreshAttempted: true };
      directoryCache.set(endpoint, { expiresAt: Date.now() + directoryFailureTtlMs, result });
      return result;
    }
    const result = {
      entries: nationwideStoreDirectory,
      completeness: completenessFor(nationwideStoreDirectory, 'fixture', storeDirectoryCompleteness.lastVerified, [
        ...storeDirectoryCompleteness.limitations,
        'מקור הסניפים שהוגדר לא זמין או נכשל בבדיקת תקינות; מוצגת תמונת fixture אחרונה.',
      ]),
    };
    result.completeness = { ...result.completeness, warnings, sourceState: 'stale-fallback', refreshAttempted: true };
    directoryCache.set(endpoint, { expiresAt: Date.now() + directoryFailureTtlMs, result });
    return result;
  }
}

function directoryEntryTimestamp(entry: StoreDirectoryEntry): number {
  const timestamp = new Date(entry.verifiedAt || entry.lastVerified).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

/** Merge independently validated official snapshots without widening completeness claims. */
export function mergeStoreDirectoryLoads(results: readonly StoreDirectoryLoadResult[]): StoreDirectoryLoadResult {
  const configuredResults = results.filter((result) => result.completeness.dataset === 'configured-source');
  const failedResults = results.filter((result) => result.completeness.dataset !== 'configured-source');
  const byIdentity = new Map<string, StoreDirectoryEntry>();
  for (const result of configuredResults) for (const entry of result.entries) {
    const key = `${entry.retailerId}:${entry.storeId}`.toLocaleLowerCase('en-US');
    const existing = byIdentity.get(key);
    if (!existing || directoryEntryTimestamp(entry) > directoryEntryTimestamp(existing) || (directoryEntryTimestamp(entry) === directoryEntryTimestamp(existing) && entry.source.localeCompare(existing.source, 'en-US') > 0)) byIdentity.set(key, entry);
  }
  const entries = [...byIdentity.values()].sort((left, right) => `${left.retailerId}:${left.storeId}`.localeCompare(`${right.retailerId}:${right.storeId}`, 'en-US'));
  const limitations = [...new Set(results.flatMap((result) => result.completeness.limitations))];
  const warnings = [...new Set(results.flatMap((result) => result.completeness.warnings))];
  const lastVerified = entries.map((entry) => entry.verifiedAt || entry.lastVerified).sort().at(-1) ?? new Date(0).toISOString();
  const sources = [...new Set(entries.map((entry) => entry.source))].sort();
  return {
    entries,
    completeness: {
      dataset: 'configured-source',
      coverageStatus: 'configured-partial',
      branchCount: entries.length,
      districtCount: new Set(entries.map((entry) => entry.district).filter(Boolean)).size,
      supportedChains: [...new Set(entries.map((entry) => entry.chainId))].sort(),
      source: sources.join(',') || 'configured-source',
      lastVerified,
      scope: { id: 'multi-source-configured', countryCode: 'IL', expectedChains: [...new Set(entries.map((entry) => entry.chainId))].sort() },
      limitations: [...limitations, 'multiple source snapshots were merged; combined coverage remains partial until a manifest proves the complete shared scope'],
      warnings,
      sourceState: failedResults.length || configuredResults.some((result) => result.completeness.sourceState !== 'live') ? 'mixed' : 'live',
      refreshAttempted: true,
    },
  };
}

export async function loadStoreDirectory(fetchImpl: typeof fetch = fetch, options: { forceRefresh?: boolean } = {}): Promise<StoreDirectoryLoadResult> {
  const endpoints = [...new Set([...(process.env.STORE_DIRECTORY_URLS?.split(',') ?? []), process.env.STORE_DIRECTORY_URL ?? ''].map((endpoint) => endpoint.trim()).filter(Boolean))];
  if (!endpoints.length) return { entries: nationwideStoreDirectory, completeness: storeDirectoryCompleteness };
  const cacheKey = endpoints.join('|');
  const cached = directoryCache.get(cacheKey);
  if (!options.forceRefresh && cached && cached.expiresAt > Date.now()) return cached.result;
  const pending = directoryInflight.get(cacheKey);
  if (pending) return pending;
  const request = (async () => {
    const results = await Promise.all(endpoints.map((endpoint) => fetchConfiguredDirectory(endpoint, fetchImpl)));
    if (results.length === 1) return results[0]!;
    const configuredResults = results.filter((result) => result.completeness.dataset === 'configured-source');
    if (!configuredResults.length) {
      const fallback = results[0] ?? { entries: nationwideStoreDirectory, completeness: storeDirectoryCompleteness };
      return {
        entries: fallback.entries,
        completeness: {
          ...fallback.completeness,
          warnings: [...new Set(results.flatMap((result) => result.completeness.warnings))],
          limitations: [...new Set(results.flatMap((result) => result.completeness.limitations))],
          sourceState: 'stale-fallback' as const,
          refreshAttempted: true,
        },
      };
    }
    return mergeStoreDirectoryLoads(results);
  })();
  directoryInflight.set(cacheKey, request);
  try {
    const result = await request;
    directoryCache.set(cacheKey, { expiresAt: Date.now() + directoryCacheTtlMs, result });
    return result;
  } finally {
    if (directoryInflight.get(cacheKey) === request) directoryInflight.delete(cacheKey);
  }
}
