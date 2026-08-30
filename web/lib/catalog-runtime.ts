/**
 * Server-side catalog boundary for API consumers.
 *
 * The browser-facing fixture remains the safe development default. A valid
 * configured snapshot takes precedence, while a failed refresh may continue
 * serving the loader's last valid configured snapshot. The loader owns the
 * endpoint cache and in-flight request deduplication; this module only maps
 * that result to the Product shape used by the application.
 */
import { catalogCompleteness as fixtureCompleteness, normalizeSearch, products as fixtureProducts, type Product } from './data.ts';
import { catalogProductIdentity, loadConfiguredCatalog, type CatalogProductRecord, type CatalogSourceLoadOptions, type CatalogSourceLoadResult } from './ingestion/catalog.ts';
import type { NormalizedPromotion } from './ingestion/types.ts';

export type RuntimeCatalog = {
  products: Product[];
  records: CatalogProductRecord[];
  completeness: CatalogSourceLoadResult['completeness'] | typeof fixtureCompleteness;
  source: 'configured' | 'fixture';
  fallbackUsed: boolean;
  warnings: string[];
};

/** Search the catalog selected for this request, including configured products. */
export function searchRuntimeProducts(query: string, catalogProducts: readonly Product[]): Product[] {
  const normalizedQuery = normalizeSearch(query);
  if (!normalizedQuery) return [...catalogProducts];
  return catalogProducts.filter((product) => normalizeSearch(`${product.name} ${product.brand} ${product.category} ${product.barcode} ${product.aliases.join(' ')}`).includes(normalizedQuery));
}

export type RuntimeCatalogPromotion = {
  id: string;
  kind: 'public' | 'club';
  label: string;
  startsAt: string | null;
  endsAt: string | null;
  minimumQuantity: number | null;
  discountNis: number | null;
  discountPercent: number | null;
  promotionalPriceNis: number | null;
  clubId: string | null;
  retailerId: string;
  storeId: string;
  retailerItemIds: string[];
  source: {
    sourceFileId: string;
    sourceUri: string;
    checksum: string;
    downloadedAt: string;
    publishedAt: string | null;
  };
};

function branchPromotionPayload(promotion: NormalizedPromotion): RuntimeCatalogPromotion {
  return {
    id: promotion.promotionId,
    kind: promotion.isClubOnly ? 'club' : 'public',
    label: promotion.description,
    startsAt: promotion.startsAt ?? null,
    endsAt: promotion.endsAt ?? null,
    minimumQuantity: promotion.minimumQuantity ?? null,
    discountNis: promotion.discountNis ?? null,
    discountPercent: promotion.discountPercent ?? null,
    promotionalPriceNis: promotion.promotionalPriceNis ?? null,
    clubId: promotion.clubId ?? null,
    retailerId: promotion.retailerId,
    storeId: promotion.storeId!,
    retailerItemIds: [...promotion.retailerItemIds],
    source: {
      sourceFileId: promotion.source.sourceFileId,
      sourceUri: promotion.source.sourceUri,
      checksum: promotion.source.checksum,
      downloadedAt: promotion.source.downloadedAt,
      publishedAt: promotion.source.publishedAt ?? null,
    },
  };
}

/**
 * Return only branch-scoped promotions from the validated records. Global
 * promotions remain in Product.promotions; nulls here mean the source omitted
 * that field, rather than an invented validity window or discount.
 */
export function getRuntimeBranchPromotions(catalog: RuntimeCatalog, product: Product): Record<string, RuntimeCatalogPromotion[]> {
  const byBranch = new Map<string, Map<string, RuntimeCatalogPromotion>>();
  for (const record of catalog.records) {
    const materializedId = catalogProductIdentity(record).replace(/[^a-z0-9:_-]+/gi, '-');
    if (materializedId !== product.id) continue;
    for (const promotion of record.promotions) {
      if (promotion.storeId !== record.storeId) continue;
      const branch = byBranch.get(record.storeId) ?? new Map<string, RuntimeCatalogPromotion>();
      branch.set(promotion.promotionId, branchPromotionPayload(promotion));
      byBranch.set(record.storeId, branch);
    }
  }
  return Object.fromEntries([...byBranch.entries()].sort(([left], [right]) => left.localeCompare(right, 'en-US')).map(([storeId, promotions]) => [storeId, [...promotions.values()].sort((left, right) => left.id.localeCompare(right.id, 'en-US'))]));
}

/**
 * Resolve the catalog for a server request. A configured result is usable
 * whenever it contains validated records, even when fallbackUsed is true:
 * that flag means the loader retained a previously valid snapshot after a
 * failed refresh, not that the records are unsafe.
 */
export async function loadRuntimeCatalog(options: CatalogSourceLoadOptions = {}): Promise<RuntimeCatalog> {
  const configured = await loadConfiguredCatalog(options);
  if (configured.records.length > 0 && configured.products.length > 0) {
    return {
      products: configured.products,
      records: configured.records,
      completeness: configured.completeness,
      source: 'configured',
      fallbackUsed: configured.fallbackUsed,
      warnings: configured.warnings,
    };
  }

  return {
    products: fixtureProducts,
    records: [],
    completeness: fixtureCompleteness,
    source: 'fixture',
    fallbackUsed: true,
    warnings: configured.warnings,
  };
}
