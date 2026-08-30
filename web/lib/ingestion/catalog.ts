import type { Product, ProductImageMetadata, ProductProvenance, PriceObservation } from '../data.ts';
import type { NormalizedPrice, SourceMetadata } from './types.ts';

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

function normalizeImage(url: string | undefined, alt: string | undefined, sourceFileId: string): CatalogImageMetadata {
  const fallbackLabel = 'תמונת מוצר אינה זמינה';
  const meaningfulAlt = text(alt);
  if (!url || !meaningfulAlt) return { status: 'missing', alt: meaningfulAlt ?? fallbackLabel, fallbackLabel, sourceFileId };
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('unsupported image protocol');
    return { url: parsed.toString(), status: 'candidate', alt: meaningfulAlt, fallbackLabel, sourceFileId };
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
    image: normalizeImage(record.imageUrl, record.imageAlt ?? productName, source.sourceFileId),
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
