import type { Product, ProductImageMetadata, ProductProvenance, PriceObservation } from '../data.ts';
import { readBoundedBody, runIngestion } from './core.ts';
import type { DiscoveryInput, IngestionRunResult, NormalizedPrice, RetailerSourceAdapter, SourceMetadata } from './types.ts';

export type CatalogImportMode = 'full' | 'incremental';
export type CatalogImageHealth = 'verified' | 'candidate' | 'missing' | 'failed';

export type CatalogImageMetadata = ProductImageMetadata & {
  sourceFileId?: string;
  checkedAt?: string;
};

export type CatalogProductRecord = {
  retailerId: string;
  storeId: string;
  retailerItemId: string;
  barcode?: string;
  productName?: string;
  brand?: string;
  size?: string;
  category?: string;
  aliases: string[];
  priceNis: number | null;
  unitPriceNis?: number;
  unitOfMeasure?: string;
  quantity?: number;
  isAvailable: boolean;
  isWeighted: boolean;
  observedAt: string;
  source: SourceMetadata;
  image?: CatalogImageMetadata;
};

export type CatalogBranchAvailability = {
  retailerId: string;
  storeId: string;
  totalProducts: number;
  availableProducts: number;
  unavailableProducts: number;
  lastObservedAt: string | null;
  sourceFileIds: string[];
};

export type CatalogImportOptions = {
  mode?: CatalogImportMode;
  previous?: readonly CatalogProductRecord[];
  minimumRecords?: number;
  expectedRecords?: number;
  /** Reject a full refresh when it drops more than this fraction of the prior snapshot. */
  maxDropRatio?: number;
};

export type CatalogImportResult = {
  /** The validated candidate before the publication gate. */
  candidateRecords: CatalogProductRecord[];
  /** The safe published view; an unsafe refresh keeps the previous view. */
  records: CatalogProductRecord[];
  mode: CatalogImportMode;
  published: boolean;
  duplicateCount: number;
  skippedCount: number;
  warnings: string[];
  branchAvailability: CatalogBranchAvailability[];
  imageCoverage: { total: number; withUrl: number; candidate: number; missing: number };
};

export type CatalogSourceScope = {
  id: string;
  countryCode: string;
  expectedRecordCount?: number;
  expectedProductCount?: number;
  expectedBranchCount?: number;
  expectedRetailers?: string[];
  sourceVersion?: string;
  asOf?: string;
};

export type CatalogSourceCompleteness = {
  dataset: 'configured-source' | 'adapter-feed' | 'empty';
  coverageStatus: 'configured-partial' | 'configured-complete-for-scope' | 'unavailable';
  recordCount: number;
  productCount: number;
  branchCount: number;
  retailers: string[];
  lastVerified: string | null;
  scope: CatalogSourceScope;
  limitations: string[];
};

export type CatalogSourceLoadResult = {
  records: CatalogProductRecord[];
  products: Product[];
  completeness: CatalogSourceCompleteness;
  warnings: string[];
  fallbackUsed: boolean;
  ingestion?: IngestionRunResult;
};

export type CatalogSourceLoadOptions = {
  endpoint?: string;
  previous?: readonly CatalogProductRecord[];
  fetchImpl?: typeof fetch;
  maxBytes?: number;
  timeoutMs?: number;
};

const catalogSourceCache = new Map<string, { expiresAt: number; result: CatalogSourceLoadResult }>();
const catalogSourceInflight = new Map<string, Promise<CatalogSourceLoadResult>>();
const catalogSourceCacheTtlMs = 5 * 60 * 1000;
const catalogSourceFailureTtlMs = 30 * 1000;
const catalogSourceDefaultMaxBytes = 200 * 1024 * 1024;
const catalogSourceDefaultTimeoutMs = 30_000;

function text(value: string | undefined): string | undefined {
  const result = value?.replace(/\s+/g, ' ').trim();
  return result || undefined;
}

function canonical(value: string | undefined): string {
  return (value ?? '').trim().toLocaleLowerCase('en-US');
}

function validTimestamp(value: string): number | null {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function productIdentity(record: Pick<NormalizedPrice, 'retailerId' | 'storeId' | 'barcode' | 'retailerItemId'>): string {
  const barcode = canonical(record.barcode);
  const productKey = barcode ? `barcode:${barcode}` : `item:${canonical(record.retailerItemId)}`;
  return `${canonical(record.retailerId)}:${canonical(record.storeId)}:${productKey}`;
}

function catalogIdentity(record: Pick<CatalogProductRecord, 'retailerId' | 'storeId' | 'barcode' | 'retailerItemId'>): string {
  return productIdentity(record);
}

function stableTieBreak(record: CatalogProductRecord): string {
  return JSON.stringify({
    retailerId: canonical(record.retailerId),
    storeId: canonical(record.storeId),
    retailerItemId: canonical(record.retailerItemId),
    barcode: canonical(record.barcode),
    productName: text(record.productName) ?? '',
    brand: text(record.brand) ?? '',
    size: text(record.size) ?? '',
    category: text(record.category) ?? '',
    aliases: [...record.aliases].map(canonical).sort(),
    priceNis: record.priceNis,
    unitPriceNis: record.unitPriceNis ?? null,
    unitOfMeasure: text(record.unitOfMeasure) ?? '',
    quantity: record.quantity ?? null,
    isAvailable: record.isAvailable,
    isWeighted: record.isWeighted,
    observedAt: record.observedAt,
    sourceFileId: record.source.sourceFileId,
    checksum: record.source.checksum,
    imageUrl: record.image?.url ?? '',
  });
}

function shouldReplace(candidate: CatalogProductRecord, existing: CatalogProductRecord): boolean {
  const candidateTime = validTimestamp(candidate.observedAt) ?? -Infinity;
  const existingTime = validTimestamp(existing.observedAt) ?? -Infinity;
  if (candidateTime !== existingTime) return candidateTime > existingTime;
  return stableTieBreak(candidate).localeCompare(stableTieBreak(existing), 'en-US') > 0;
}

function normalizeImage(url: string | undefined, alt: string | undefined, sourceFileId: string, sourceUri: string): CatalogImageMetadata {
  const fallbackLabel = 'תמונת מוצר אינה זמינה';
  const meaningfulAlt = text(alt);
  if (!url || !meaningfulAlt) return { status: 'missing', alt: meaningfulAlt ?? fallbackLabel, fallbackLabel, sourceFileId };
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('unsupported image protocol');
    return {
      url: parsed.toString(),
      status: 'candidate',
      alt: meaningfulAlt,
      fallbackLabel,
      source: sourceUri,
      attribution: 'Image URL supplied by the retailer feed; verify current rights and attribution before publication',
      sourceFileId,
    };
  } catch {
    return { status: 'missing', alt: meaningfulAlt, fallbackLabel, sourceFileId };
  }
}

function toCatalogRecord(record: NormalizedPrice): CatalogProductRecord {
  const productName = text(record.productName);
  const source = record.source;
  return {
    retailerId: canonical(record.retailerId),
    storeId: canonical(record.storeId),
    retailerItemId: text(record.retailerItemId)!,
    barcode: text(record.barcode),
    productName,
    brand: text(record.brand),
    size: text(record.size),
    category: text(record.category),
    aliases: [...new Set((record.aliases ?? []).map(text).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, 'he-IL')),
    priceNis: record.priceNis,
    unitPriceNis: record.unitPriceNis,
    unitOfMeasure: text(record.unitOfMeasure),
    quantity: record.quantity,
    isAvailable: record.isAvailable !== false && record.priceNis !== null,
    isWeighted: record.isWeighted === true,
    observedAt: new Date(record.observedAt).toISOString(),
    source,
    image: normalizeImage(record.imageUrl, record.imageAlt ?? productName, source.sourceFileId, source.sourceUri),
  };
}

function sortRecords(records: Iterable<CatalogProductRecord>): CatalogProductRecord[] {
  return [...records].sort((left, right) => catalogIdentity(left).localeCompare(catalogIdentity(right), 'en-US'));
}

function availability(records: readonly CatalogProductRecord[]): CatalogBranchAvailability[] {
  const byBranch = new Map<string, CatalogBranchAvailability>();
  for (const record of records) {
    const key = `${record.retailerId}:${record.storeId}`;
    const current = byBranch.get(key) ?? { retailerId: record.retailerId, storeId: record.storeId, totalProducts: 0, availableProducts: 0, unavailableProducts: 0, lastObservedAt: null, sourceFileIds: [] };
    current.totalProducts += 1;
    if (record.isAvailable) current.availableProducts += 1; else current.unavailableProducts += 1;
    if (!current.lastObservedAt || (validTimestamp(record.observedAt) ?? -Infinity) > (validTimestamp(current.lastObservedAt) ?? -Infinity)) current.lastObservedAt = record.observedAt;
    if (!current.sourceFileIds.includes(record.source.sourceFileId)) current.sourceFileIds.push(record.source.sourceFileId);
    byBranch.set(key, current);
  }
  return [...byBranch.values()].map((branch) => ({ ...branch, sourceFileIds: [...branch.sourceFileIds].sort() })).sort((a, b) => `${a.retailerId}:${a.storeId}`.localeCompare(`${b.retailerId}:${b.storeId}`, 'en-US'));
}

function imageCoverage(records: readonly CatalogProductRecord[]) {
  const total = records.length;
  const withUrl = records.filter((record) => Boolean(record.image?.url)).length;
  return { total, withUrl, candidate: records.filter((record) => record.image?.status === 'candidate').length, missing: total - withUrl };
}

function mergeIncremental(previous: readonly CatalogProductRecord[], candidate: readonly CatalogProductRecord[]): CatalogProductRecord[] {
  const merged = new Map(previous.map((record) => [catalogIdentity(record), record]));
  for (const record of candidate) {
    const key = catalogIdentity(record);
    const existing = merged.get(key);
    if (!existing || shouldReplace(record, existing)) merged.set(key, record);
  }
  return sortRecords(merged.values());
}

/**
 * Import a full or incremental price stream and apply an atomic publication
 * gate. Invalid rows, empty full feeds, unexpected row counts, and dangerous
 * full-feed drops leave the previous snapshot untouched.
 */
export async function importCatalogPrices(records: AsyncIterable<NormalizedPrice>, options: CatalogImportOptions = {}): Promise<CatalogImportResult> {
  const mode = options.mode ?? 'full';
  const previous = options.previous ? [...options.previous] : [];
  const candidates: CatalogProductRecord[] = [];
  const warnings: string[] = [];
  let duplicateCount = 0;
  let skippedCount = 0;
  for await (const record of records) {
    const invalid = !record.retailerId || !record.storeId || !text(record.retailerItemId)
      || (record.priceNis !== null && (!Number.isFinite(record.priceNis) || record.priceNis < 0))
      || (record.priceNis === null && record.isAvailable !== false)
      || !record.observedAt || validTimestamp(record.observedAt) === null;
    if (invalid) {
      skippedCount += 1;
      warnings.push('שורת קטלוג חסרה זהות, מחיר תקין או חותמת זמן תקינה');
      continue;
    }
    candidates.push(toCatalogRecord(record));
  }
  // Reconcile retailer-item and barcode aliases before choosing a winner, so
  // feeds that add a barcode later cannot create a second product row.
  const parent = candidates.map((_, index) => index);
  const find = (index: number): number => {
    if (parent[index] !== index) parent[index] = find(parent[index]!);
    return parent[index]!;
  };
  const union = (left: number, right: number) => {
    const leftRoot = find(left); const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent[Math.max(leftRoot, rightRoot)] = Math.min(leftRoot, rightRoot);
  };
  const aliasOwner = new Map<string, number>();
  candidates.forEach((record, index) => {
    const branch = `${canonical(record.retailerId)}:${canonical(record.storeId)}`;
    const aliases = [`${branch}:item:${canonical(record.retailerItemId)}`];
    if (record.barcode) aliases.push(`${branch}:barcode:${canonical(record.barcode)}`);
    for (const alias of aliases) {
      const owner = aliasOwner.get(alias);
      if (owner !== undefined) union(owner, index); else aliasOwner.set(alias, index);
    }
  });
  const groups = new Map<number, CatalogProductRecord[]>();
  candidates.forEach((record, index) => {
    const root = find(index);
    const group = groups.get(root) ?? [];
    group.push(record);
    groups.set(root, group);
  });
  const byIdentity = new Map<string, CatalogProductRecord>();
  for (const group of groups.values()) {
    duplicateCount += Math.max(0, group.length - 1);
    const winner = group.reduce((current, candidate) => shouldReplace(candidate, current) ? candidate : current);
    byIdentity.set(catalogIdentity(winner), winner);
  }
  const candidateRecords = sortRecords(byIdentity.values());
  const minimumRecords = options.minimumRecords ?? (mode === 'full' ? 1 : 0);
  const priorCount = previous.length;
  const maxDropRatio = options.maxDropRatio ?? 0.5;
  const dropTooLarge = mode === 'full' && priorCount > 0 && candidateRecords.length < priorCount * (1 - Math.max(0, Math.min(1, maxDropRatio)));
  const expectedMismatch = options.expectedRecords !== undefined && candidateRecords.length !== options.expectedRecords;
  const emptyIncrementalWithoutSnapshot = mode === 'incremental' && candidateRecords.length === 0 && previous.length === 0;
  const published = skippedCount === 0 && candidateRecords.length >= minimumRecords && !expectedMismatch && !dropTooLarge && !emptyIncrementalWithoutSnapshot;
  if (expectedMismatch) warnings.push(`מספר רשומות הקטלוג (${candidateRecords.length}) אינו תואם לצפי (${options.expectedRecords})`);
  if (dropTooLarge) warnings.push('רענון מלא הושמט: ירידה חריגה במספר המוצרים לעומת snapshot תקין קודם');
  if (emptyIncrementalWithoutSnapshot) warnings.push('עדכון מדורג ריק ללא snapshot קודם אינו ניתן לפרסום');
  const publishedRecords = published ? (mode === 'incremental' ? mergeIncremental(previous, candidateRecords) : candidateRecords) : previous.length ? sortRecords(previous) : candidateRecords;
  return {
    candidateRecords,
    records: publishedRecords,
    mode,
    published,
    duplicateCount,
    skippedCount,
    warnings,
    branchAvailability: availability(publishedRecords),
    imageCoverage: imageCoverage(publishedRecords),
  };
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function sourceDocumentKind(value: unknown): SourceMetadata['documentKind'] {
  return value === 'price_incremental' ? 'price_incremental' : 'price_full';
}

function externalSourceMetadata(raw: Record<string, unknown>, root: Record<string, unknown>, retailerId: string, index: number, now: string): SourceMetadata {
  const source = objectRecord(raw.source) ?? objectRecord(root.source);
  const observedAt = typeof raw.observedAt === 'string' ? raw.observedAt : typeof root.observedAt === 'string' ? root.observedAt : now;
  const sourceFileId = typeof source?.sourceFileId === 'string' && source.sourceFileId.trim()
    ? source.sourceFileId.trim()
    : typeof raw.sourceFileId === 'string' && raw.sourceFileId.trim() ? raw.sourceFileId.trim() : `configured-catalog-${index + 1}`;
  const sourceUri = typeof source?.sourceUri === 'string' && source.sourceUri.trim()
    ? source.sourceUri.trim()
    : typeof raw.sourceUri === 'string' && raw.sourceUri.trim() ? raw.sourceUri.trim() : 'configured://catalog';
  const downloadedAt = typeof source?.downloadedAt === 'string' ? source.downloadedAt : now;
  const publishedAt = typeof source?.publishedAt === 'string' ? source.publishedAt : observedAt;
  return {
    retailerId: typeof source?.retailerId === 'string' ? source.retailerId : retailerId,
    adapterId: typeof source?.adapterId === 'string' && source.adapterId.trim() ? source.adapterId : 'configured-catalog',
    sourceFileId,
    sourceUri,
    fileName: typeof source?.fileName === 'string' && source.fileName.trim() ? source.fileName : 'catalog.json',
    documentKind: sourceDocumentKind(source?.documentKind),
    publishedAt,
    downloadedAt,
    checksum: typeof source?.checksum === 'string' && source.checksum.trim() ? source.checksum : 'configured-source',
  };
}

function externalPriceRecord(raw: unknown, root: Record<string, unknown>, index: number, now: string): NormalizedPrice | null {
  const value = objectRecord(raw);
  if (!value) return null;
  const retailerId = typeof value.retailerId === 'string' ? value.retailerId.trim() : typeof value.retailer === 'string' ? value.retailer.trim() : typeof root.retailerId === 'string' ? root.retailerId.trim() : '';
  const storeId = typeof value.storeId === 'string' ? value.storeId.trim() : typeof value.branchId === 'string' ? value.branchId.trim() : '';
  const retailerItemId = typeof value.retailerItemId === 'string' ? value.retailerItemId.trim() : typeof value.itemId === 'string' ? value.itemId.trim() : typeof value.sku === 'string' ? value.sku.trim() : '';
  const rawPrice = value.priceNis ?? value.price;
  const priceNis = rawPrice === null ? null : typeof rawPrice === 'number' && Number.isFinite(rawPrice) ? rawPrice : typeof rawPrice === 'string' && rawPrice.trim() && Number.isFinite(Number(rawPrice)) ? Number(rawPrice) : Number.NaN;
  const observedAt = typeof value.observedAt === 'string' ? value.observedAt : typeof root.observedAt === 'string' ? root.observedAt : now;
  if (!retailerId || !storeId || !retailerItemId || (Number.isNaN(priceNis) && value.isAvailable !== false)) return null;
  if (priceNis !== null && (!Number.isFinite(priceNis) || priceNis < 0)) return null;
  if (!observedAt || validTimestamp(observedAt) === null) return null;
  const source = externalSourceMetadata(value, root, retailerId, index, now);
  return {
    retailerId,
    storeId,
    retailerItemId,
    barcode: typeof value.barcode === 'string' ? value.barcode.trim() || undefined : undefined,
    productName: typeof value.productName === 'string' ? value.productName : typeof value.name === 'string' ? value.name : undefined,
    brand: typeof value.brand === 'string' ? value.brand : undefined,
    size: typeof value.size === 'string' ? value.size : undefined,
    category: typeof value.category === 'string' ? value.category : undefined,
    aliases: Array.isArray(value.aliases) ? value.aliases.filter((alias): alias is string => typeof alias === 'string') : undefined,
    imageUrl: typeof value.imageUrl === 'string' ? value.imageUrl : undefined,
    imageAlt: typeof value.imageAlt === 'string' ? value.imageAlt : undefined,
    priceNis: priceNis === null ? null : priceNis,
    unitPriceNis: typeof value.unitPriceNis === 'number' && Number.isFinite(value.unitPriceNis) ? value.unitPriceNis : undefined,
    unitOfMeasure: typeof value.unitOfMeasure === 'string' ? value.unitOfMeasure : undefined,
    quantity: typeof value.quantity === 'number' && Number.isFinite(value.quantity) ? value.quantity : undefined,
    isAvailable: typeof value.isAvailable === 'boolean' ? value.isAvailable : undefined,
    isWeighted: value.isWeighted === true,
    observedAt,
    source,
  };
}

function externalCatalogRecords(payload: unknown): { root: Record<string, unknown>; records: unknown[] } {
  if (Array.isArray(payload)) return { root: {}, records: payload };
  const root = objectRecord(payload) ?? {};
  for (const key of ['records', 'prices', 'products']) if (Array.isArray(root[key])) return { root, records: root[key] as unknown[] };
  const nested = objectRecord(root.result);
  if (nested) for (const key of ['records', 'prices', 'products']) if (Array.isArray(nested[key])) return { root: { ...root, ...nested }, records: nested[key] as unknown[] };
  return { root, records: [] };
}

function catalogScope(payload: Record<string, unknown>): CatalogSourceScope {
  const completeness = objectRecord(payload.completeness) ?? payload;
  const scope = objectRecord(completeness.scope) ?? objectRecord(payload.scope) ?? {};
  const integer = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
  const strings = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map((item) => item.trim()).sort() : undefined;
  return {
    id: typeof scope.id === 'string' && scope.id.trim() ? scope.id.trim() : 'configured-catalog',
    countryCode: typeof scope.countryCode === 'string' ? scope.countryCode.trim().toUpperCase() : '',
    expectedRecordCount: integer(scope.expectedRecordCount ?? scope.expectedRecords),
    expectedProductCount: integer(scope.expectedProductCount),
    expectedBranchCount: integer(scope.expectedBranchCount),
    expectedRetailers: strings(scope.expectedRetailers ?? scope.expectedChains),
    sourceVersion: typeof scope.sourceVersion === 'string' ? scope.sourceVersion : typeof scope.version === 'string' ? scope.version : undefined,
    asOf: typeof scope.asOf === 'string' ? scope.asOf : typeof scope.lastVerified === 'string' ? scope.lastVerified : undefined,
  };
}

function catalogProductCount(records: readonly CatalogProductRecord[]) {
  return new Set(records.map((record) => catalogProductIdentity(record))).size;
}

function catalogCompletenessFor(records: readonly CatalogProductRecord[], dataset: CatalogSourceCompleteness['dataset'], scope: CatalogSourceScope, lastVerified: string | null, complete: boolean, limitations: string[]): CatalogSourceCompleteness {
  return {
    dataset,
    coverageStatus: complete ? 'configured-complete-for-scope' : records.length ? 'configured-partial' : 'unavailable',
    recordCount: records.length,
    productCount: catalogProductCount(records),
    branchCount: new Set(records.map((record) => `${record.retailerId}:${record.storeId}`)).size,
    retailers: [...new Set(records.map((record) => record.retailerId))].sort(),
    lastVerified,
    scope,
    limitations,
  };
}

function configuredCatalogCompleteness(payload: Record<string, unknown>, records: readonly CatalogProductRecord[]): CatalogSourceCompleteness {
  const scope = catalogScope(payload);
  const completeness = objectRecord(payload.completeness) ?? payload;
  const declaredComplete = payload.complete === true || completeness.complete === true || completeness.coverageStatus === 'complete';
  const retailers = [...new Set(records.map((record) => record.retailerId))].sort();
  const expectedRetailers = scope.expectedRetailers ?? [];
  const validAsOf = Boolean(scope.asOf && validTimestamp(scope.asOf) !== null);
  const complete = declaredComplete
    && scope.countryCode === 'IL'
    && Boolean(scope.id && scope.sourceVersion && validAsOf)
    && scope.expectedRecordCount === records.length
    && (scope.expectedProductCount === undefined || scope.expectedProductCount === catalogProductCount(records))
    && (scope.expectedBranchCount === undefined || scope.expectedBranchCount === new Set(records.map((record) => `${record.retailerId}:${record.storeId}`)).size)
    && (expectedRetailers.length === 0 || expectedRetailers.length === retailers.length && expectedRetailers.every((retailer) => retailers.includes(retailer)));
  const limitations = complete ? [] : ['המקור חייב להצהיר על scope מלא בישראל, גרסה, תאריך asOf, מספר רשומות ייחודי ומספר סניפים/רשתות כאשר הם נדרשים; אחרת הוא מסומן חלקי.'];
  return catalogCompletenessFor(records, 'configured-source', scope, scope.asOf ?? (records.map((record) => record.observedAt).sort().at(-1) ?? null), complete, limitations);
}

function emptyCatalogSourceResult(warnings: string[] = []): CatalogSourceLoadResult {
  return {
    records: [],
    products: [],
    completeness: catalogCompletenessFor([], 'empty', { id: 'configured-catalog', countryCode: '' }, null, false, ['לא הוגדר מקור קטלוג תקין; מוצגים נתוני fixture בלבד.']),
    warnings,
    fallbackUsed: false,
  };
}

const catalogSourceLastValid = new Map<string, CatalogSourceLoadResult>();

async function fetchConfiguredCatalog(endpoint: string, options: CatalogSourceLoadOptions): Promise<CatalogSourceLoadResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxBytes = options.maxBytes ?? catalogSourceDefaultMaxBytes;
  const timeoutMs = options.timeoutMs ?? catalogSourceDefaultTimeoutMs;
  const now = new Date().toISOString();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(endpoint, { headers: { accept: 'application/json' }, signal: controller.signal });
      if (!response.ok) throw new Error(`catalog source returned HTTP ${response.status}`);
      const body = await readBoundedBody(response, maxBytes);
      const payload = JSON.parse(new TextDecoder().decode(body)) as unknown;
      const { root, records: rawRecords } = externalCatalogRecords(payload);
      if (!rawRecords.length) throw new Error('catalog source returned no records');
      const normalized = rawRecords.map((raw, index) => externalPriceRecord(raw, root, index, now));
      const invalidCount = normalized.filter((record): record is null => record === null).length;
      const records = normalized.filter((record): record is NormalizedPrice => Boolean(record));
      const scope = catalogScope(root);
      const imported = await importCatalogPrices((async function* () { yield* records; })(), {
        mode: 'full',
        previous: options.previous,
        expectedRecords: scope.expectedRecordCount,
      });
      if (invalidCount || !catalogImportIsSafe(imported)) throw new Error(`catalog source failed validation (${invalidCount} malformed rows)`);
      const completeness = configuredCatalogCompleteness(root, imported.records);
      const result: CatalogSourceLoadResult = { records: imported.records, products: materializeCatalogProducts(imported.records), completeness, warnings: imported.warnings, fallbackUsed: false };
      catalogSourceLastValid.set(endpoint, result);
      catalogSourceCache.set(endpoint, { expiresAt: Date.now() + catalogSourceCacheTtlMs, result });
      return result;
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    const prior = options.previous?.length ? { records: [...options.previous], products: materializeCatalogProducts(options.previous), completeness: catalogCompletenessFor(options.previous, 'configured-source', { id: 'previous-snapshot', countryCode: 'IL' }, options.previous.map((record) => record.observedAt).sort().at(-1) ?? null, false, ['התרעננות המקור נכשלה; נשמר ה-snapshot התקין האחרון.']), warnings: [], fallbackUsed: true } : catalogSourceLastValid.get(endpoint);
    if (prior) {
      const result = { ...prior, warnings: [...prior.warnings, error instanceof Error ? error.message : 'catalog source unavailable'], fallbackUsed: true, completeness: { ...prior.completeness, limitations: [...prior.completeness.limitations, 'המקור החדש לא אומת ולכן לא החליף את הנתונים התקינים.'] } };
      catalogSourceCache.set(endpoint, { expiresAt: Date.now() + catalogSourceFailureTtlMs, result });
      return result;
    }
    const result = { ...emptyCatalogSourceResult([error instanceof Error ? error.message : 'catalog source unavailable']), completeness: catalogCompletenessFor([], 'empty', { id: 'configured-catalog', countryCode: 'IL' }, null, false, ['המקור החיצוני לא זמין; אין snapshot קודם שניתן לשמר.']) , fallbackUsed: true };
    catalogSourceCache.set(endpoint, { expiresAt: Date.now() + catalogSourceFailureTtlMs, result });
    return result;
  }
}

/** Load a validated normalized JSON snapshot published by an ingestion worker. */
export async function loadConfiguredCatalog(options: CatalogSourceLoadOptions = {}): Promise<CatalogSourceLoadResult> {
  const endpoint = options.endpoint ?? process.env.CATALOG_SOURCE_URL?.trim();
  if (!endpoint) return emptyCatalogSourceResult(['CATALOG_SOURCE_URL is not configured']);
  const configuredMaxBytes = Number(process.env.CATALOG_SOURCE_MAX_BYTES);
  const configuredTimeoutMs = Number(process.env.CATALOG_SOURCE_TIMEOUT_MS);
  const effectiveOptions = {
    ...options,
    maxBytes: options.maxBytes ?? (Number.isSafeInteger(configuredMaxBytes) && configuredMaxBytes > 0 ? configuredMaxBytes : undefined),
    timeoutMs: options.timeoutMs ?? (Number.isSafeInteger(configuredTimeoutMs) && configuredTimeoutMs > 0 ? configuredTimeoutMs : undefined),
  };
  const cached = catalogSourceCache.get(endpoint);
  if (cached && cached.expiresAt > Date.now()) return cached.result;
  const pending = catalogSourceInflight.get(endpoint);
  if (pending) return pending;
  const request = fetchConfiguredCatalog(endpoint, effectiveOptions);
  catalogSourceInflight.set(endpoint, request);
  try { return await request; } finally { if (catalogSourceInflight.get(endpoint) === request) catalogSourceInflight.delete(endpoint); }
}

/** Run a retailer adapter over its complete/incremental price documents and publish atomically. */
export async function importCatalogFromAdapter(adapter: RetailerSourceAdapter, input: DiscoveryInput, options: CatalogImportOptions = {}): Promise<CatalogSourceLoadResult> {
  const normalizedInput: DiscoveryInput = {
    ...input,
    retailerId: adapter.retailerId,
    documentKinds: input.documentKinds?.filter((kind) => kind === 'price_full' || kind === 'price_incremental') ?? ['price_full'],
  };
  const records: NormalizedPrice[] = [];
  const ingestion = await runIngestion(adapter, normalizedInput, {
    async upsertPrices(stream) { for await (const record of stream) records.push(record); return records.length; },
  });
  const onlyIncremental = normalizedInput.documentKinds?.length && normalizedInput.documentKinds.every((kind) => kind === 'price_incremental');
  const imported = await importCatalogPrices((async function* () { yield* records; })(), { ...options, mode: options.mode ?? (onlyIncremental ? 'incremental' : 'full') });
  const published = ingestion.status === 'completed' && imported.published;
  const safeRecords = published ? imported.records : options.previous ? [...options.previous] : imported.records;
  const warnings = [...imported.warnings, ...ingestion.warnings, ...ingestion.failures.map((failure) => `${failure.code}: ${failure.message}`)];
  const sourceScope: CatalogSourceScope = { id: `${adapter.retailerId}-adapter-feed`, countryCode: 'IL', sourceVersion: normalizedInput.runKey, asOf: imported.records.map((record) => record.observedAt).sort().at(-1) };
  return { records: safeRecords, products: materializeCatalogProducts(safeRecords), completeness: catalogCompletenessFor(safeRecords, 'adapter-feed', sourceScope, sourceScope.asOf ?? null, false, published ? ['הזנת adapter הושלמה, אך לא צורף להצהיר scope מלא ולכן היא אינה מסומנת ככיסוי ארצי מלא.'] : ['הייבוא לא הושלם במלואו; ה-snapshot הקודם נשמר ולא סומן ככיסוי מלא.']), warnings, fallbackUsed: !published, ingestion: { ...ingestion }, };
}

export function catalogImportIsSafe(result: CatalogImportResult, minimumRecords = 1) {
  return result.published && result.candidateRecords.length >= minimumRecords && result.skippedCount === 0;
}

export function catalogProductIdentity(record: Pick<CatalogProductRecord, 'retailerId' | 'retailerItemId' | 'barcode'>): string {
  return record.barcode ? `${canonical(record.retailerId)}:barcode:${canonical(record.barcode)}` : `${canonical(record.retailerId)}:item:${canonical(record.retailerItemId)}`;
}

function chooseProductMetadata(records: readonly CatalogProductRecord[]): CatalogProductRecord {
  return [...records].sort((left, right) => {
    const completeness = (record: CatalogProductRecord) => [record.productName, record.brand, record.size, record.category, record.image?.url].filter(Boolean).length;
    const completenessDelta = completeness(right) - completeness(left);
    if (completenessDelta !== 0) return completenessDelta;
    const leftTime = validTimestamp(left.observedAt) ?? -Infinity;
    const rightTime = validTimestamp(right.observedAt) ?? -Infinity;
    return rightTime - leftTime || stableTieBreak(right).localeCompare(stableTieBreak(left), 'en-US');
  })[0]!;
}

function priceObservation(record: CatalogProductRecord): PriceObservation {
  return {
    amount: record.priceNis,
    unitPrice: record.unitPriceNis !== undefined ? `${record.unitPriceNis.toFixed(2)} NIS${record.unitOfMeasure ? ` / ${record.unitOfMeasure}` : ''}` : 'מחיר יחידה לא סופק',
    updatedAt: record.observedAt,
    available: record.isAvailable,
    source: `${record.source.adapterId} · ${record.source.sourceFileId}`,
  };
}

/** Materialize normalized branch records into the Product shape consumed by the app. */
export function materializeCatalogProducts(records: readonly CatalogProductRecord[], options: { defaultCategory?: string; defaultTag?: string; defaultIcon?: string } = {}): Product[] {
  const groups = new Map<string, CatalogProductRecord[]>();
  for (const record of records) {
    const key = catalogProductIdentity(record);
    const group = groups.get(key) ?? [];
    group.push(record);
    groups.set(key, group);
  }
  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right, 'en-US')).map(([identity, group]) => {
    const metadata = chooseProductMetadata(group);
    const prices: Record<string, PriceObservation> = {};
    const branchAvailability: Record<string, boolean> = {};
    const sourceFileIds = new Set<string>();
    for (const record of group) {
      const existing = prices[record.storeId];
      const candidate = priceObservation(record);
      if (!existing || record.observedAt > existing.updatedAt || (record.observedAt === existing.updatedAt && candidate.source.localeCompare(existing.source, 'en-US') > 0)) prices[record.storeId] = candidate;
      branchAvailability[record.storeId] = record.isAvailable;
      sourceFileIds.add(record.source.sourceFileId);
    }
    const image = metadata.image ?? { status: 'missing' as const, alt: metadata.productName ?? 'מוצר', fallbackLabel: 'תמונת מוצר אינה זמינה' };
    const provenance: ProductProvenance = { sourceFileIds: [...sourceFileIds].sort(), sourceUris: [...new Set(group.map((record) => record.source.sourceUri))].sort(), lastObservedAt: metadata.observedAt };
    return {
      id: identity.replace(/[^a-z0-9:_-]+/gi, '-'),
      barcode: metadata.barcode ?? metadata.retailerItemId,
      name: metadata.productName ?? metadata.retailerItemId,
      brand: metadata.brand ?? 'מותג לא סופק',
      size: metadata.size ?? 'מידה לא סופקה',
      category: metadata.category ?? options.defaultCategory ?? 'מוצרי מזון',
      tag: options.defaultTag ?? 'מוצר מהקטלוג',
      icon: options.defaultIcon ?? '🛒',
      aliases: [...new Set([metadata.productName, metadata.brand, ...metadata.aliases].filter((value): value is string => Boolean(value)))],
      imageUrl: image.url,
      imageAlt: image.alt,
      image,
      branchAvailability,
      provenance,
      prices,
      promotions: [],
    } satisfies Product;
  });
}
