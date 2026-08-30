import type { NormalizedPrice } from './types.ts';

export type CatalogProductRecord = {
  retailerId: string;
  storeId: string;
  retailerItemId: string;
  barcode?: string;
  productName?: string;
  priceNis: number;
  unitPriceNis?: number;
  unitOfMeasure?: string;
  quantity?: number;
  isAvailable?: boolean;
  isWeighted?: boolean;
  observedAt: string;
  sourceFileId: string;
};

export type CatalogImportResult = {
  records: CatalogProductRecord[];
  duplicateCount: number;
  skippedCount: number;
  warnings: string[];
};

function identity(record: NormalizedPrice) {
  return [record.retailerId, record.storeId, record.barcode || record.retailerItemId].join(':');
}

/**
 * Converts a complete or incremental price stream into a deterministic,
 * branch-level snapshot. A malformed row is skipped; callers can keep the
 * prior snapshot when skipped rows make a source incomplete.
 */
export async function importCatalogPrices(records: AsyncIterable<NormalizedPrice>): Promise<CatalogImportResult> {
  const byIdentity = new Map<string, CatalogProductRecord>();
  const warnings: string[] = [];
  let duplicateCount = 0;
  let skippedCount = 0;
  for await (const record of records) {
    if (!record.retailerId || !record.storeId || !record.retailerItemId || !Number.isFinite(record.priceNis) || record.priceNis < 0 || !record.observedAt) {
      skippedCount += 1;
      warnings.push('דילוג על שורת קטלוג חסרה או לא תקינה');
      continue;
    }
    const key = identity(record);
    if (byIdentity.has(key)) duplicateCount += 1;
    const normalized: CatalogProductRecord = {
      retailerId: record.retailerId,
      storeId: record.storeId,
      retailerItemId: record.retailerItemId,
      barcode: record.barcode,
      productName: record.productName,
      priceNis: record.priceNis,
      unitPriceNis: record.unitPriceNis,
      unitOfMeasure: record.unitOfMeasure,
      quantity: record.quantity,
      isAvailable: record.isAvailable,
      isWeighted: record.isWeighted,
      observedAt: record.observedAt,
      sourceFileId: record.source.sourceFileId,
    };
    const existing = byIdentity.get(key);
    if (!existing || new Date(normalized.observedAt).getTime() >= new Date(existing.observedAt).getTime()) byIdentity.set(key, normalized);
  }
  return { records: [...byIdentity.values()].sort((left, right) => `${left.storeId}:${left.retailerItemId}`.localeCompare(`${right.storeId}:${right.retailerItemId}`)), duplicateCount, skippedCount, warnings };
}

export function catalogImportIsSafe(result: CatalogImportResult, minimumRecords = 1) {
  return result.records.length >= minimumRecords && result.skippedCount === 0;
}
