import type { Product, ProductImageMetadata, ProductProvenance, PriceObservation, Promotion } from '../data.ts';
import { readBoundedBody, runIngestion } from './core.ts';
import type { DiscoveryInput, IngestionRunResult, NormalizedPrice, NormalizedPromotion, RetailerSourceAdapter, SourceMetadata } from './types.ts';

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
  promotions: NormalizedPromotion[];
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
  /** Promotions discovered alongside the price stream. */
  promotions?: Iterable<NormalizedPromotion> | AsyncIterable<NormalizedPromotion>;
  /** A source manifest is required before a result may claim complete coverage. */
  manifest?: CatalogSourceManifest;
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
  promotions: NormalizedPromotion[];
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

export type CatalogCoverageTarget = {
  retailerId: string;
  branchIds: string[];
  expectedRecordCount: number;
  expectedProductCount?: number;
};

/**
 * Evidence supplied by the worker that makes a snapshot's completeness
 * claim auditable. A public URL alone is not permission to redistribute a
 * retailer's catalog, so the manifest must also identify the usage basis.
 */
export type CatalogSourceManifest = {
  schemaVersion: '1';
  sourceId: string;
  sourceUri: string;
  sourceVersion: string;
  countryCode: 'IL';
  asOf: string;
  usage: {
    kind: 'open-data' | 'permissioned';
    termsUrl: string;
  };
  coverage: {
    expectedRecordCount: number;
    expectedProductCount: number;
    expectedBranchCount: number;
    retailers: CatalogCoverageTarget[];
  };
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
  manifest: {
    declared: boolean;
    valid: boolean;
    errors: string[];
  };
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

function productIdentity(record: Pick<NormalizedPrice, 'retailerId' | 'storeId' | 'barcode' | 'retailerItemId'> & { isWeighted?: boolean }): string {
  const barcode = canonical(record.barcode);
  // Variable-weight labels can reuse a barcode while their PLU/item identity
  // remains stable. Never merge such products solely by barcode.
  const productKey = record.isWeighted ? `item:${canonical(record.retailerItemId)}` : barcode ? `barcode:${barcode}` : `item:${canonical(record.retailerItemId)}`;
  return `${canonical(record.retailerId)}:${canonical(record.storeId)}:${productKey}`;
}

function catalogIdentity(record: Pick<CatalogProductRecord, 'retailerId' | 'storeId' | 'barcode' | 'retailerItemId' | 'isWeighted'>): string {
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
    promotions: [],
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

function promotionIdentity(promotion: NormalizedPromotion): string {
  const items = [...promotion.retailerItemIds].map(canonical).sort().join(',');
  return `${canonical(promotion.retailerId)}:${canonical(promotion.storeId) || '*'}:${canonical(promotion.promotionId)}:${items}`;
}

function promotionTieBreak(promotion: NormalizedPromotion): string {
  return JSON.stringify({
    description: text(promotion.description) ?? '',
    startsAt: promotion.startsAt ?? '',
    endsAt: promotion.endsAt ?? '',
    minimumQuantity: promotion.minimumQuantity ?? null,
    discountNis: promotion.discountNis ?? null,
    discountPercent: promotion.discountPercent ?? null,
    promotionalPriceNis: promotion.promotionalPriceNis ?? null,
    clubId: promotion.clubId ?? '',
    isClubOnly: promotion.isClubOnly,
    sourceFileId: promotion.source.sourceFileId,
    checksum: promotion.source.checksum,
  });
}

function validPromotion(promotion: NormalizedPromotion): boolean {
  const start = promotion.startsAt ? validTimestamp(promotion.startsAt) : null;
  const end = promotion.endsAt ? validTimestamp(promotion.endsAt) : null;
  return Boolean(
    promotion.retailerId.trim()
      && promotion.promotionId.trim()
      && promotion.description.trim()
      && Array.isArray(promotion.retailerItemIds)
      && promotion.retailerItemIds.length > 0
      && promotion.source.sourceFileId.trim()
      && promotion.source.sourceUri.trim()
      && promotion.source.checksum.trim()
      && (!promotion.startsAt || start !== null)
      && (!promotion.endsAt || end !== null)
      && (start === null || end === null || end >= start)
      && (promotion.minimumQuantity === undefined || Number.isFinite(promotion.minimumQuantity) && promotion.minimumQuantity > 0)
      && (promotion.discountNis === undefined || Number.isFinite(promotion.discountNis) && promotion.discountNis >= 0)
      && (promotion.discountPercent === undefined || Number.isFinite(promotion.discountPercent) && promotion.discountPercent >= 0 && promotion.discountPercent <= 100)
      && (promotion.promotionalPriceNis === undefined || Number.isFinite(promotion.promotionalPriceNis) && promotion.promotionalPriceNis >= 0),
  );
}

async function collectPromotions(input: CatalogImportOptions['promotions']): Promise<{ promotions: NormalizedPromotion[]; skippedCount: number; warnings: string[] }> {
  if (!input) return { promotions: [], skippedCount: 0, warnings: [] };
  const candidates: NormalizedPromotion[] = [];
  const warnings: string[] = [];
  let skippedCount = 0;
  const values = Symbol.asyncIterator in Object(input)
    ? input as AsyncIterable<NormalizedPromotion>
    : (async function* () { yield* input as Iterable<NormalizedPromotion>; })();
  for await (const promotion of values) {
    if (!validPromotion(promotion)) {
      skippedCount += 1;
      warnings.push('promotion row failed the catalog promotion contract');
      continue;
    }
    candidates.push({
      ...promotion,
      retailerId: canonical(promotion.retailerId),
      storeId: promotion.storeId ? canonical(promotion.storeId) : undefined,
      promotionId: promotion.promotionId.trim(),
      description: text(promotion.description)!,
      retailerItemIds: [...new Set(promotion.retailerItemIds.map((item) => item.trim()).filter(Boolean))].sort(),
    });
  }
  const deduped = new Map<string, NormalizedPromotion>();
  for (const promotion of candidates) {
    const key = promotionIdentity(promotion);
    const existing = deduped.get(key);
    const candidateEnd = validTimestamp(promotion.endsAt ?? '') ?? -Infinity;
    const existingEnd = validTimestamp(existing?.endsAt ?? '') ?? -Infinity;
    if (!existing || candidateEnd > existingEnd || candidateEnd === existingEnd && promotionTieBreak(promotion).localeCompare(promotionTieBreak(existing), 'en-US') > 0) deduped.set(key, promotion);
  }
  return { promotions: [...deduped.values()].sort((left, right) => promotionIdentity(left).localeCompare(promotionIdentity(right), 'en-US')), skippedCount, warnings };
}

function attachPromotions(records: readonly CatalogProductRecord[], promotions: readonly NormalizedPromotion[]): CatalogProductRecord[] {
  return records.map((record) => ({
    ...record,
    promotions: promotions.filter((promotion) => promotion.retailerId === record.retailerId
      && (!promotion.storeId || promotion.storeId === record.storeId)
      && promotion.retailerItemIds.some((item) => canonical(item) === canonical(record.retailerItemId))),
  }));
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
  const promotionResult = await collectPromotions(options.promotions);
  skippedCount += promotionResult.skippedCount;
  warnings.push(...promotionResult.warnings);
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
    if (record.barcode && !record.isWeighted) aliases.push(`${branch}:barcode:${canonical(record.barcode)}`);
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
  const existingPromotions = previous.flatMap((record) => record.promotions ?? []);
  const publishedPromotions = published
    ? [...new Map([...existingPromotions, ...promotionResult.promotions].map((promotion) => [promotionIdentity(promotion), promotion])).values()]
    : existingPromotions;
  const recordsWithPromotions = attachPromotions(publishedRecords, publishedPromotions);
  return {
    candidateRecords,
    records: recordsWithPromotions,
    mode,
    published,
    duplicateCount,
    skippedCount,
    warnings,
    branchAvailability: availability(recordsWithPromotions),
    imageCoverage: imageCoverage(recordsWithPromotions),
    promotions: publishedPromotions,
  };
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function sourceDocumentKind(value: unknown): SourceMetadata['documentKind'] {
  return value === 'price_incremental' ? 'price_incremental' : 'price_full';
}

function externalSourceMetadata(raw: Record<string, unknown>, root: Record<string, unknown>, retailerId: string): SourceMetadata | null {
  const source = objectRecord(raw.source) ?? objectRecord(root.source);
  const sourceFileId = typeof source?.sourceFileId === 'string' && source.sourceFileId.trim()
    ? source.sourceFileId.trim()
    : typeof raw.sourceFileId === 'string' && raw.sourceFileId.trim() ? raw.sourceFileId.trim() : '';
  const sourceUri = typeof source?.sourceUri === 'string' && source.sourceUri.trim()
    ? source.sourceUri.trim()
    : typeof raw.sourceUri === 'string' && raw.sourceUri.trim() ? raw.sourceUri.trim() : '';
  const adapterId = typeof source?.adapterId === 'string' && source.adapterId.trim() ? source.adapterId.trim() : typeof raw.adapterId === 'string' ? raw.adapterId.trim() : '';
  const fileName = typeof source?.fileName === 'string' && source.fileName.trim() ? source.fileName.trim() : typeof raw.fileName === 'string' ? raw.fileName.trim() : '';
  const downloadedAt = typeof source?.downloadedAt === 'string' ? source.downloadedAt : typeof raw.downloadedAt === 'string' ? raw.downloadedAt : '';
  const publishedAt = typeof source?.publishedAt === 'string' ? source.publishedAt : typeof raw.publishedAt === 'string' ? raw.publishedAt : undefined;
  const checksum = typeof source?.checksum === 'string' && source.checksum.trim() ? source.checksum.trim() : typeof raw.checksum === 'string' ? raw.checksum.trim() : '';
  if (!sourceFileId || !sourceUri || !adapterId || !fileName || !checksum || !downloadedAt || validTimestamp(downloadedAt) === null || publishedAt && validTimestamp(publishedAt) === null) return null;
  return {
    retailerId: typeof source?.retailerId === 'string' ? source.retailerId : retailerId,
    adapterId,
    sourceFileId,
    sourceUri,
    fileName,
    documentKind: sourceDocumentKind(source?.documentKind),
    publishedAt,
    downloadedAt,
    checksum,
  };
}

function externalPriceRecord(raw: unknown, root: Record<string, unknown>): NormalizedPrice | null {
  const value = objectRecord(raw);
  if (!value) return null;
  const retailerId = typeof value.retailerId === 'string' ? value.retailerId.trim() : typeof value.retailer === 'string' ? value.retailer.trim() : typeof root.retailerId === 'string' ? root.retailerId.trim() : '';
  const storeId = typeof value.storeId === 'string' ? value.storeId.trim() : typeof value.branchId === 'string' ? value.branchId.trim() : '';
  const retailerItemId = typeof value.retailerItemId === 'string' ? value.retailerItemId.trim() : typeof value.itemId === 'string' ? value.itemId.trim() : typeof value.sku === 'string' ? value.sku.trim() : '';
  const rawPrice = value.priceNis ?? value.price;
  const priceNis = rawPrice === null ? null : typeof rawPrice === 'number' && Number.isFinite(rawPrice) ? rawPrice : typeof rawPrice === 'string' && rawPrice.trim() && Number.isFinite(Number(rawPrice)) ? Number(rawPrice) : Number.NaN;
  const observedAt = typeof value.observedAt === 'string' ? value.observedAt : typeof root.observedAt === 'string' ? root.observedAt : '';
  if (!retailerId || !storeId || !retailerItemId || !observedAt || (Number.isNaN(priceNis) && value.isAvailable !== false)) return null;
  if (priceNis !== null && (!Number.isFinite(priceNis) || priceNis < 0)) return null;
  if (!observedAt || validTimestamp(observedAt) === null) return null;
  const source = externalSourceMetadata(value, root, retailerId);
  if (!source) return null;
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

function externalCatalogRecords(payload: unknown): { root: Record<string, unknown>; records: unknown[]; promotions: unknown[] } {
  if (Array.isArray(payload)) return { root: {}, records: payload, promotions: [] };
  const root = objectRecord(payload) ?? {};
  for (const key of ['records', 'prices', 'products']) if (Array.isArray(root[key])) return { root, records: root[key] as unknown[], promotions: Array.isArray(root.promotions) ? root.promotions : [] };
  const nested = objectRecord(root.result);
  if (nested) for (const key of ['records', 'prices', 'products']) if (Array.isArray(nested[key])) return { root: { ...root, ...nested }, records: nested[key] as unknown[], promotions: Array.isArray(nested.promotions) ? nested.promotions : Array.isArray(root.promotions) ? root.promotions : [] };
  return { root, records: [], promotions: [] };
}

function externalPromotionRecord(raw: unknown, root: Record<string, unknown>): NormalizedPromotion | null {
  const value = objectRecord(raw);
  if (!value) return null;
  const retailerId = typeof value.retailerId === 'string' ? value.retailerId.trim() : typeof value.retailer === 'string' ? value.retailer.trim() : typeof root.retailerId === 'string' ? root.retailerId.trim() : '';
  const storeId = typeof value.storeId === 'string' ? value.storeId.trim() : typeof value.branchId === 'string' ? value.branchId.trim() : undefined;
  const promotionId = typeof value.promotionId === 'string' ? value.promotionId.trim() : typeof value.promoId === 'string' ? value.promoId.trim() : typeof value.id === 'string' ? value.id.trim() : '';
  const description = typeof value.description === 'string' ? value.description.trim() : typeof value.label === 'string' ? value.label.trim() : '';
  const rawItems = value.retailerItemIds ?? value.itemIds ?? value.items ?? (typeof value.retailerItemId === 'string' ? [value.retailerItemId] : undefined);
  const retailerItemIds = Array.isArray(rawItems) ? rawItems.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map((item) => item.trim()) : [];
  const source = externalSourceMetadata(value, root, retailerId);
  if (!source || !retailerId || !promotionId || !description || !retailerItemIds.length) return null;
  const numberValue = (candidate: unknown) => typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : typeof candidate === 'string' && candidate.trim() && Number.isFinite(Number(candidate)) ? Number(candidate) : undefined;
  const startsAt = typeof value.startsAt === 'string' ? value.startsAt : typeof value.validFrom === 'string' ? value.validFrom : undefined;
  const endsAt = typeof value.endsAt === 'string' ? value.endsAt : typeof value.validUntil === 'string' ? value.validUntil : undefined;
  const clubId = typeof value.clubId === 'string' ? value.clubId.trim() || undefined : undefined;
  return {
    retailerId,
    storeId,
    promotionId,
    description,
    startsAt,
    endsAt,
    minimumQuantity: numberValue(value.minimumQuantity ?? value.minQuantity),
    discountNis: numberValue(value.discountNis ?? value.discount),
    discountPercent: numberValue(value.discountPercent ?? value.discountPercentage),
    promotionalPriceNis: numberValue(value.promotionalPriceNis ?? value.promotionalPrice ?? value.salePrice),
    clubId,
    isClubOnly: value.isClubOnly === true || Boolean(clubId),
    retailerItemIds,
    source,
  };
}

function externalNestedPromotions(rawRecords: readonly unknown[]): unknown[] {
  return rawRecords.flatMap((raw) => {
    const record = objectRecord(raw);
    return record && Array.isArray(record.promotions) ? record.promotions : [];
  });
}

function catalogScope(payload: Record<string, unknown>): CatalogSourceScope {
  const completeness = objectRecord(payload.completeness) ?? payload;
  const manifest = objectRecord(payload.manifest) ?? objectRecord(completeness.manifest);
  const scope = objectRecord(completeness.scope) ?? objectRecord(payload.scope) ?? {};
  const coverage = objectRecord(manifest?.coverage);
  const sourceVersion = typeof manifest?.sourceVersion === 'string' ? manifest.sourceVersion : undefined;
  const asOf = typeof manifest?.asOf === 'string' ? manifest.asOf : undefined;
  const expectedRetailers = Array.isArray(coverage?.retailers)
    ? (coverage.retailers as unknown[]).map((item) => objectRecord(item)?.retailerId).filter((item): item is string => typeof item === 'string')
    : undefined;
  const integer = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
  const strings = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map((item) => item.trim()).sort() : undefined;
  return {
    id: typeof manifest?.sourceId === 'string' && manifest.sourceId.trim() ? manifest.sourceId.trim() : typeof scope.id === 'string' && scope.id.trim() ? scope.id.trim() : 'configured-catalog',
    countryCode: typeof manifest?.countryCode === 'string' ? manifest.countryCode.trim().toUpperCase() : typeof scope.countryCode === 'string' ? scope.countryCode.trim().toUpperCase() : '',
    expectedRecordCount: integer(coverage?.expectedRecordCount ?? scope.expectedRecordCount ?? scope.expectedRecords),
    expectedProductCount: integer(coverage?.expectedProductCount ?? scope.expectedProductCount),
    expectedBranchCount: integer(coverage?.expectedBranchCount ?? scope.expectedBranchCount),
    expectedRetailers: strings(expectedRetailers ?? scope.expectedRetailers ?? scope.expectedChains),
    sourceVersion: sourceVersion ?? (typeof scope.sourceVersion === 'string' ? scope.sourceVersion : typeof scope.version === 'string' ? scope.version : undefined),
    asOf: asOf ?? (typeof scope.asOf === 'string' ? scope.asOf : typeof scope.lastVerified === 'string' ? scope.lastVerified : undefined),
  };
}

function catalogProductCount(records: readonly CatalogProductRecord[]) {
  return new Set(records.map((record) => catalogProductIdentity(record))).size;
}

function catalogCompletenessFor(records: readonly CatalogProductRecord[], dataset: CatalogSourceCompleteness['dataset'], scope: CatalogSourceScope, lastVerified: string | null, complete: boolean, limitations: string[], manifest = { declared: false, valid: false, errors: [] as string[] }): CatalogSourceCompleteness {
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
    manifest,
  };
}

function requiredUrl(value: unknown): boolean {
  if (typeof value !== 'string' || !value.trim()) return false;
  try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; }
}

/** Parse and validate the evidence manifest; invalid manifests are never coerced into complete coverage. */
export function validateCatalogSourceManifest(value: unknown): { manifest: CatalogSourceManifest | null; errors: string[] } {
  const root = objectRecord(value);
  const coverage = objectRecord(root?.coverage);
  const usage = objectRecord(root?.usage);
  const errors: string[] = [];
  const integer = (candidate: unknown, name: string, required = true): number | undefined => {
    if (candidate === undefined && !required) return undefined;
    if (typeof candidate !== 'number' || !Number.isSafeInteger(candidate) || candidate < 0) errors.push(`${name} must be a non-negative safe integer`);
    return typeof candidate === 'number' && Number.isSafeInteger(candidate) && candidate >= 0 ? candidate : undefined;
  };
  const stringValue = (candidate: unknown, name: string): string => {
    if (typeof candidate !== 'string' || !candidate.trim()) { errors.push(`${name} is required`); return ''; }
    return candidate.trim();
  };
  const sourceId = stringValue(root?.sourceId, 'manifest.sourceId');
  const sourceUri = stringValue(root?.sourceUri, 'manifest.sourceUri');
  const sourceVersion = stringValue(root?.sourceVersion, 'manifest.sourceVersion');
  const countryCode = stringValue(root?.countryCode, 'manifest.countryCode').toUpperCase();
  const asOf = stringValue(root?.asOf, 'manifest.asOf');
  if (countryCode !== 'IL') errors.push('manifest.countryCode must be IL');
  if (asOf && validTimestamp(asOf) === null) errors.push('manifest.asOf must be an ISO timestamp');
  if (!requiredUrl(sourceUri)) errors.push('manifest.sourceUri must be an absolute HTTP(S) URL');
  const usageKind = usage?.kind;
  if (usageKind !== 'open-data' && usageKind !== 'permissioned') errors.push('manifest.usage.kind must be open-data or permissioned');
  const termsUrl = stringValue(usage?.termsUrl, 'manifest.usage.termsUrl');
  if (termsUrl && !requiredUrl(termsUrl)) errors.push('manifest.usage.termsUrl must be an absolute HTTP(S) URL');
  if (root?.schemaVersion !== '1') errors.push('manifest.schemaVersion must be 1');
  const expectedRecordCount = integer(coverage?.expectedRecordCount, 'manifest.coverage.expectedRecordCount');
  const expectedProductCount = integer(coverage?.expectedProductCount, 'manifest.coverage.expectedProductCount');
  const expectedBranchCount = integer(coverage?.expectedBranchCount, 'manifest.coverage.expectedBranchCount');
  const rawRetailers = Array.isArray(coverage?.retailers) ? coverage.retailers : [];
  if (!Array.isArray(coverage?.retailers) || rawRetailers.length === 0) errors.push('manifest.coverage.retailers must be a non-empty array');
  const retailers: CatalogCoverageTarget[] = [];
  const retailerIds = new Set<string>();
  for (const [index, raw] of rawRetailers.entries()) {
    const item = objectRecord(raw);
    const retailerId = stringValue(item?.retailerId, `manifest.coverage.retailers[${index}].retailerId`).toLowerCase();
    const branchIds = Array.isArray(item?.branchIds) ? item.branchIds.filter((branch): branch is string => typeof branch === 'string' && Boolean(branch.trim())).map((branch) => branch.trim()).sort() : [];
    if (!branchIds.length) errors.push(`manifest.coverage.retailers[${index}].branchIds must be non-empty`);
    if (new Set(branchIds).size !== branchIds.length) errors.push(`manifest.coverage.retailers[${index}].branchIds must be unique`);
    const recordCount = integer(item?.expectedRecordCount, `manifest.coverage.retailers[${index}].expectedRecordCount`);
    const productCount = integer(item?.expectedProductCount, `manifest.coverage.retailers[${index}].expectedProductCount`, false);
    if (retailerIds.has(retailerId)) errors.push(`manifest.coverage.retailers contains duplicate retailer ${retailerId}`); else retailerIds.add(retailerId);
    if (retailerId && recordCount !== undefined) retailers.push({ retailerId, branchIds, expectedRecordCount: recordCount, expectedProductCount: productCount });
  }
  if (expectedBranchCount !== undefined && expectedBranchCount !== new Set(retailers.flatMap((retailer) => retailer.branchIds.map((branch) => `${retailer.retailerId}:${branch}`))).size) errors.push('manifest expectedBranchCount does not match retailer branch targets');
  if (expectedRecordCount !== undefined && expectedRecordCount !== retailers.reduce((total, retailer) => total + retailer.expectedRecordCount, 0)) errors.push('manifest expectedRecordCount does not match retailer targets');
  if (errors.length) return { manifest: null, errors };
  return {
    manifest: {
      schemaVersion: '1', sourceId, sourceUri, sourceVersion, countryCode: 'IL', asOf,
      usage: { kind: usageKind as 'open-data' | 'permissioned', termsUrl },
      coverage: { expectedRecordCount: expectedRecordCount!, expectedProductCount: expectedProductCount!, expectedBranchCount: expectedBranchCount!, retailers },
    },
    errors: [],
  };
}

function configuredCatalogCompleteness(payload: Record<string, unknown>, records: readonly CatalogProductRecord[]): CatalogSourceCompleteness {
  const scope = catalogScope(payload);
  const completeness = objectRecord(payload.completeness) ?? payload;
  const declaredComplete = payload.complete === true || completeness.complete === true || completeness.coverageStatus === 'complete';
  const rawManifest = objectRecord(payload.manifest) ?? objectRecord(completeness.manifest);
  const manifestResult = validateCatalogSourceManifest(rawManifest);
  const retailers = [...new Set(records.map((record) => record.retailerId))].sort();
  const branchKeys = new Set(records.map((record) => `${record.retailerId}:${record.storeId}`));
  const validAsOf = Boolean(scope.asOf && validTimestamp(scope.asOf) !== null);
  const manifestCountsMatch = Boolean(manifestResult.manifest)
    && manifestResult.manifest!.coverage.expectedRecordCount === records.length
    && manifestResult.manifest!.coverage.expectedProductCount === catalogProductCount(records)
    && manifestResult.manifest!.coverage.expectedBranchCount === branchKeys.size
    && manifestResult.manifest!.coverage.retailers.every((target) => {
      const targetBranches = new Set(target.branchIds.map((branch) => `${target.retailerId}:${branch}`));
      const targetRecords = records.filter((record) => record.retailerId === target.retailerId);
      return targetRecords.length === target.expectedRecordCount
        && targetBranches.size === new Set(targetRecords.map((record) => `${record.retailerId}:${record.storeId}`)).size
        && [...targetBranches].every((branch) => branchKeys.has(branch))
        && (target.expectedProductCount === undefined || target.expectedProductCount === new Set(targetRecords.map(catalogProductIdentity)).size);
    })
    && manifestResult.manifest!.coverage.retailers.length === retailers.length
    && manifestResult.manifest!.coverage.retailers.every((target) => retailers.includes(target.retailerId));
  const complete = declaredComplete
    && scope.countryCode === 'IL'
    && Boolean(scope.id && scope.sourceVersion && validAsOf)
    && Boolean(manifestResult.manifest)
    && manifestCountsMatch;
  const limitations = complete ? [] : [
    ...(rawManifest ? manifestResult.errors : ['no source manifest was supplied']),
    ...(rawManifest && manifestResult.manifest && !manifestCountsMatch ? ['manifest counts or retailer/branch targets do not match the normalized records'] : []),
    'complete status requires operator-confirmed open-data or written permission; a public URL alone is not sufficient',
  ];
  return catalogCompletenessFor(records, 'configured-source', scope, scope.asOf ?? (records.map((record) => record.observedAt).sort().at(-1) ?? null), complete, limitations, { declared: Boolean(rawManifest), valid: Boolean(manifestResult.manifest), errors: manifestResult.errors });
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
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(endpoint, { headers: { accept: 'application/json' }, signal: controller.signal });
      if (!response.ok) throw new Error(`catalog source returned HTTP ${response.status}`);
      const body = await readBoundedBody(response, maxBytes);
      const payload = JSON.parse(new TextDecoder().decode(body)) as unknown;
      const { root, records: rawRecords, promotions: rootPromotions } = externalCatalogRecords(payload);
      if (!rawRecords.length) throw new Error('catalog source returned no records');
      const normalized = rawRecords.map((raw) => externalPriceRecord(raw, root));
      const invalidCount = normalized.filter((record): record is null => record === null).length;
      const records = normalized.filter((record): record is NormalizedPrice => Boolean(record));
      const rawPromotions = [...rootPromotions, ...externalNestedPromotions(rawRecords)];
      const normalizedPromotions = rawPromotions.map((raw) => externalPromotionRecord(raw, root));
      const invalidPromotionCount = normalizedPromotions.filter((promotion) => promotion === null).length;
      const promotions = normalizedPromotions.filter((promotion): promotion is NormalizedPromotion => Boolean(promotion));
      const scope = catalogScope(root);
      const imported = await importCatalogPrices((async function* () { yield* records; })(), {
        mode: 'full',
        previous: options.previous,
        expectedRecords: scope.expectedRecordCount,
        promotions,
      });
      if (invalidCount || invalidPromotionCount || !catalogImportIsSafe(imported)) throw new Error(`catalog source failed validation (${invalidCount} malformed price rows, ${invalidPromotionCount} malformed promotion rows)`);
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
  const adapterPromotions: NormalizedPromotion[] = [];
  const ingestion = await runIngestion(adapter, normalizedInput, {
    async upsertPrices(stream) { for await (const record of stream) records.push(record); return records.length; },
    async upsertPromotions(stream) { for await (const promotion of stream) adapterPromotions.push(promotion); return adapterPromotions.length; },
  });
  const onlyIncremental = normalizedInput.documentKinds?.length && normalizedInput.documentKinds.every((kind) => kind === 'price_incremental');
  const allPromotions = (async function* () {
    if (options.promotions) for await (const promotion of options.promotions) yield promotion;
    yield* adapterPromotions;
  })();
  const imported = await importCatalogPrices((async function* () { yield* records; })(), { ...options, promotions: allPromotions, mode: options.mode ?? (onlyIncremental ? 'incremental' : 'full') });
  const published = ingestion.status === 'completed' && imported.published;
  const safeRecords = published ? imported.records : options.previous ? [...options.previous] : imported.records;
  const warnings = [...imported.warnings, ...ingestion.warnings, ...ingestion.failures.map((failure) => `${failure.code}: ${failure.message}`)];
  const sourceScope: CatalogSourceScope = { id: `${adapter.retailerId}-adapter-feed`, countryCode: 'IL', sourceVersion: normalizedInput.runKey, asOf: imported.records.map((record) => record.observedAt).sort().at(-1) };
  if (options.manifest) {
    return {
      records: safeRecords,
      products: materializeCatalogProducts(safeRecords),
      completeness: configuredCatalogCompleteness({ complete: true, manifest: options.manifest }, safeRecords),
      warnings,
      fallbackUsed: !published,
      ingestion: { ...ingestion },
    };
  }
  return { records: safeRecords, products: materializeCatalogProducts(safeRecords), completeness: catalogCompletenessFor(safeRecords, 'adapter-feed', sourceScope, sourceScope.asOf ?? null, false, published ? ['הזנת adapter הושלמה, אך לא צורף להצהיר scope מלא ולכן היא אינה מסומנת ככיסוי ארצי מלא.'] : ['הייבוא לא הושלם במלואו; ה-snapshot הקודם נשמר ולא סומן ככיסוי מלא.']), warnings, fallbackUsed: !published, ingestion: { ...ingestion }, };
}

export function catalogImportIsSafe(result: CatalogImportResult, minimumRecords = 1) {
  return result.published && result.candidateRecords.length >= minimumRecords && result.skippedCount === 0;
}

export function catalogProductIdentity(record: Pick<CatalogProductRecord, 'retailerId' | 'retailerItemId' | 'barcode'> & { isWeighted?: boolean }): string {
  return productIdentity({ ...record, storeId: '', isWeighted: record.isWeighted });
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

function productPromotion(promotion: NormalizedPromotion): Promotion {
  const details = [
    promotion.discountPercent !== undefined ? `${promotion.discountPercent}%` : undefined,
    promotion.discountNis !== undefined ? `${promotion.discountNis.toFixed(2)} NIS` : undefined,
    promotion.clubId ? `club ${promotion.clubId}` : undefined,
  ].filter(Boolean).join(' · ');
  return {
    id: promotion.promotionId,
    kind: promotion.isClubOnly ? 'club' : 'public',
    label: promotion.description,
    minimumQuantity: promotion.minimumQuantity,
    offerPrice: promotion.isClubOnly ? undefined : promotion.promotionalPriceNis,
    clubPrice: promotion.isClubOnly ? promotion.promotionalPriceNis : undefined,
    validUntil: promotion.endsAt ?? '9999-12-31T23:59:59.999Z',
    explanation: details ? `${promotion.description} (${details})` : promotion.description,
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
    // Product.promotions is branch-agnostic. Branch-scoped promotions remain
    // attached to CatalogProductRecord and are not leaked to other branches.
    const promotions = [...new Map(group.flatMap((record) => record.promotions ?? []).filter((promotion) => !promotion.storeId).map((promotion) => [promotionIdentity(promotion), promotion])).values()]
      .map(productPromotion);
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
      promotions,
    } satisfies Product;
  });
}
