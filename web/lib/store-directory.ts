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
};

export type StoreDirectoryImportResult = {
  records: NormalizedStore[];
  duplicateCount: number;
  skippedCount: number;
  warnings: string[];
};

const israelBounds = { minLat: 29.45, maxLat: 33.35, minLon: 34.15, maxLon: 35.95 };

/**
 * A deliberately broad, provider-neutral fixture. Production refreshes should
 * replace this list with the validated output of a retailer branch feed.
 * Existing priced branches are kept as the first three records so the local
 * shopping fixture remains useful while the directory spans all districts.
 */
export const nationwideStoreDirectory: StoreDirectoryEntry[] = [
  { retailerId: 'shufersal', storeId: 'shufersal-avenue', chainId: 'shufersal', chainName: 'שופרסל', name: 'דיל · אבן גבירול', address: 'אבן גבירול 124', city: 'תל אביב-יפו', district: 'תל אביב', coordinates: { lat: 32.086, lon: 34.783 }, isActive: true, source: 'fixture', lastVerified: '2026-08-30', deliveryCapability: 'partial' },
  { retailerId: 'rami-levy', storeId: 'rami-levy-azrieli', chainId: 'rami-levy', chainName: 'רמי לוי', name: 'מגדלי תל אביב', address: 'דרך מנחם בגין 132', city: 'תל אביב-יפו', district: 'תל אביב', coordinates: { lat: 32.074, lon: 34.79 }, isActive: true, source: 'fixture', lastVerified: '2026-08-30', deliveryCapability: 'manual' },
  { retailerId: 'victory', storeId: 'victory-yh', chainId: 'victory', chainName: 'ויקטורי', name: 'יהודה המכבי', address: 'יהודה המכבי 42', city: 'תל אביב-יפו', district: 'תל אביב', coordinates: { lat: 32.094, lon: 34.793 }, isActive: true, source: 'fixture', lastVerified: '2026-08-30', deliveryCapability: 'manual' },
  { retailerId: 'shufersal', storeId: 'shufersal-jerusalem-givat-shaul', chainId: 'shufersal', chainName: 'שופרסל', name: 'גבעת שאול', address: 'כנפי נשרים 22', city: 'ירושלים', district: 'ירושלים', coordinates: { lat: 31.786, lon: 35.184 }, isActive: true, source: 'fixture', lastVerified: '2026-08-30', deliveryCapability: 'unsupported' },
  { retailerId: 'rami-levy', storeId: 'rami-levy-jerusalem-talpiot', chainId: 'rami-levy', chainName: 'רמי לוי', name: 'תלפיות', address: 'האומן 17', city: 'ירושלים', district: 'ירושלים', coordinates: { lat: 31.751, lon: 35.209 }, isActive: true, source: 'fixture', lastVerified: '2026-08-30', deliveryCapability: 'unsupported' },
  { retailerId: 'shufersal', storeId: 'shufersal-haifa-horev', chainId: 'shufersal', chainName: 'שופרסל', name: 'חורב', address: 'חורב 15', city: 'חיפה', district: 'חיפה', coordinates: { lat: 32.789, lon: 34.989 }, isActive: true, source: 'fixture', lastVerified: '2026-08-30', deliveryCapability: 'unsupported' },
  { retailerId: 'victory', storeId: 'victory-haifa-check-post', chainId: 'victory', chainName: 'ויקטורי', name: 'צ׳ק פוסט', address: 'ההסתדרות 1', city: 'חיפה', district: 'חיפה', coordinates: { lat: 32.805, lon: 35.04 }, isActive: true, source: 'fixture', lastVerified: '2026-08-30', deliveryCapability: 'unsupported' },
  { retailerId: 'rami-levy', storeId: 'rami-levy-beer-sheva', chainId: 'rami-levy', chainName: 'רמי לוי', name: 'באר שבע', address: 'דרך חברון 21', city: 'באר שבע', district: 'דרום', coordinates: { lat: 31.245, lon: 34.792 }, isActive: true, source: 'fixture', lastVerified: '2026-08-30', deliveryCapability: 'unsupported' },
  { retailerId: 'shufersal', storeId: 'shufersal-beer-sheva', chainId: 'shufersal', chainName: 'שופרסל', name: 'רמות', address: 'אברהם אבינו 1', city: 'באר שבע', district: 'דרום', coordinates: { lat: 31.267, lon: 34.782 }, isActive: true, source: 'fixture', lastVerified: '2026-08-30', deliveryCapability: 'unsupported' },
  { retailerId: 'victory', storeId: 'victory-rishon-lezion', chainId: 'victory', chainName: 'ויקטורי', name: 'ראשון לציון', address: 'לחי 2', city: 'ראשון לציון', district: 'מרכז', coordinates: { lat: 31.983, lon: 34.78 }, isActive: true, source: 'fixture', lastVerified: '2026-08-30', deliveryCapability: 'unsupported' },
  { retailerId: 'shufersal', storeId: 'shufersal-netanya', chainId: 'shufersal', chainName: 'שופרסל', name: 'נתניה', address: 'האורזים 2', city: 'נתניה', district: 'מרכז', coordinates: { lat: 32.295, lon: 34.853 }, isActive: true, source: 'fixture', lastVerified: '2026-08-30', deliveryCapability: 'unsupported' },
  { retailerId: 'rami-levy', storeId: 'rami-levy-ashdod', chainId: 'rami-levy', chainName: 'רמי לוי', name: 'אשדוד', address: 'בני ברית 1', city: 'אשדוד', district: 'דרום', coordinates: { lat: 31.8, lon: 34.65 }, isActive: true, source: 'fixture', lastVerified: '2026-08-30', deliveryCapability: 'unsupported' },
  { retailerId: 'shufersal', storeId: 'shufersal-eilat', chainId: 'shufersal', chainName: 'שופרסל', name: 'אילת', address: 'הסתת 1', city: 'אילת', district: 'דרום', coordinates: { lat: 29.56, lon: 34.95 }, isActive: true, source: 'fixture', lastVerified: '2026-08-30', deliveryCapability: 'unsupported' },
  { retailerId: 'victory', storeId: 'victory-nazareth', chainId: 'victory', chainName: 'ויקטורי', name: 'נצרת', address: 'כביש 75', city: 'נצרת', district: 'צפון', coordinates: { lat: 32.704, lon: 35.303 }, isActive: true, source: 'fixture', lastVerified: '2026-08-30', deliveryCapability: 'unsupported' },
  { retailerId: 'rami-levy', storeId: 'rami-levy-kfar-saba', chainId: 'rami-levy', chainName: 'רמי לוי', name: 'כפר סבא', address: 'ויצמן 207', city: 'כפר סבא', district: 'מרכז', coordinates: { lat: 32.178, lon: 34.907 }, isActive: true, source: 'fixture', lastVerified: '2026-08-30', deliveryCapability: 'unsupported' },
  { retailerId: 'shufersal', storeId: 'shufersal-afula', chainId: 'shufersal', chainName: 'שופרסל', name: 'עפולה', address: 'השוק 1', city: 'עפולה', district: 'צפון', coordinates: { lat: 32.61, lon: 35.29 }, isActive: true, source: 'fixture', lastVerified: '2026-08-30', deliveryCapability: 'unsupported' },
  { retailerId: 'victory', storeId: 'victory-modiin', chainId: 'victory', chainName: 'ויקטורי', name: 'מודיעין', address: 'דם המכבים 36', city: 'מודיעין-מכבים-רעות', district: 'מרכז', coordinates: { lat: 31.9, lon: 35.01 }, isActive: true, source: 'fixture', lastVerified: '2026-08-30', deliveryCapability: 'unsupported' },
];

export const storeDirectoryCompleteness = {
  dataset: 'fixture' as const,
  coverageStatus: 'representative' as const,
  branchCount: nationwideStoreDirectory.length,
  districtCount: new Set(nationwideStoreDirectory.map((entry) => entry.district)).size,
  supportedChains: [...new Set(nationwideStoreDirectory.map((entry) => entry.chainId))],
  source: 'fixture',
  lastVerified: '2026-08-30',
  limitations: ['המאגר מייצג סניפים מכל מחוז לצורכי פיתוח ואינו רשימת סניפים חיה או מלאה. יש להחליף אותו בייצוא רשמי מאומת לפני השקה ארצית.'],
};

function directoryIdentity(record: NormalizedStore) {
  return `${record.retailerId}:${record.storeId}`.toLocaleLowerCase('en-US');
}

function validCoordinate(latitude: number | undefined, longitude: number | undefined) {
  return latitude !== undefined && longitude !== undefined && Number.isFinite(latitude) && Number.isFinite(longitude)
    && latitude >= israelBounds.minLat && latitude <= israelBounds.maxLat && longitude >= israelBounds.minLon && longitude <= israelBounds.maxLon;
}

/** Validate and atomically prepare a full or incremental branch feed. */
export async function importStoreDirectory(records: AsyncIterable<NormalizedStore>): Promise<StoreDirectoryImportResult> {
  const byIdentity = new Map<string, NormalizedStore>();
  const warnings: string[] = [];
  let duplicateCount = 0;
  let skippedCount = 0;
  for await (const record of records) {
    if (!record.retailerId || !record.storeId || !record.name.trim() || !validCoordinate(record.latitude, record.longitude)) {
      skippedCount += 1;
      warnings.push('שורת סניף חסרה מזהה, שם או קואורדינטות בישראל');
      continue;
    }
    const key = directoryIdentity(record);
    if (byIdentity.has(key)) duplicateCount += 1;
    byIdentity.set(key, { ...record, isActive: record.isActive ?? true });
  }
  return { records: [...byIdentity.values()].sort((left, right) => directoryIdentity(left).localeCompare(directoryIdentity(right))), duplicateCount, skippedCount, warnings };
}

export function directoryImportIsSafe(result: StoreDirectoryImportResult, minimumRecords = 1) {
  return result.records.length >= minimumRecords && result.skippedCount === 0;
}

const colors: Store['color'][] = ['mint', 'blue', 'yellow'];

/** Merge directory coverage with the priced fixture without inventing prices. */
export function storesFromDirectory(pricedStores: Store[]): Store[] {
  const pricedById = new Map(pricedStores.map((store) => [store.id, store]));
  return nationwideStoreDirectory.filter((entry) => entry.isActive).map((entry, index) => {
    const priced = pricedById.get(entry.storeId);
    if (priced) return priced;
    return {
      id: entry.storeId,
      retailerId: entry.retailerId,
      chain: entry.chainName,
      name: `${entry.chainName} · ${entry.name}`,
      address: `${entry.address}, ${entry.city}`,
      distanceKm: 0,
      color: colors[index % colors.length],
      coordinates: entry.coordinates,
      openNow: true,
      delivery: { capability: entry.deliveryCapability, coverageVerified: false, feesVerified: false },
    } satisfies Store;
  });
}
