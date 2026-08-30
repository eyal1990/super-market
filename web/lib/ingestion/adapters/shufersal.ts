import { downloadSourceFile, fetchWithRetry, IngestionError } from '../core.ts';
import type {
  AdapterDiscoveryMetadata,
  DiscoveryInput,
  DownloadedSourceFile,
  DocumentKind,
  RetailerSourceAdapter,
  SourceFile,
} from '../types.ts';
import { parseCerberusPrices, parseCerberusPromotions, parseCerberusStores } from './cerberus.ts';

export const shufersalDiscoveryMetadata: AdapterDiscoveryMetadata = {
  adapterId: 'shufersal',
  retailerId: 'shufersal',
  displayName: 'Shufersal transparency portal',
  sourceFamily: 'retailer-portal',
  endpointHints: ['https://prices.shufersal.co.il/'],
  supportedDocumentKinds: ['stores', 'price_full', 'price_incremental', 'promo_full', 'promo_incremental'],
  gzipExpected: true,
  requiresAuthentication: false,
  limitations: [
    'The portal may require a session cookie and paginated category requests; inject listFiles when the portal flow changes.',
    'Download links can redirect to Azure Blob Storage and may be geo-restricted.',
    'Uppercase SAP-style XML is supported through case-insensitive, namespace-tolerant helpers, but schemas still need fixture verification.',
  ],
};

export interface ShufersalAdapterOptions {
  listingUrl?: string;
  /** Maximum number of paginated transparency pages to inspect per run. */
  maxListingPages?: number;
  fetchImpl?: typeof fetch;
  listFiles?: (input: DiscoveryInput) => Promise<SourceFile[]>;
  download?: (file: SourceFile, signal?: AbortSignal) => Promise<DownloadedSourceFile>;
}

export type ShufersalCoverageDiagnostic = {
  status: 'pagination-incomplete' | 'file-set-ready-records-unverified';
  hasStoreSnapshot: boolean;
  priceFullBranchIds: string[];
  promoFullBranchIds: string[];
  duplicatePriceFullBranchIds: string[];
  missingPromoFullBranchIds: string[];
  limitations: string[];
};

function classify(fileUri: string): SourceFile | undefined {
  let url: URL;
  try { url = new URL(fileUri); } catch { return undefined; }
  const fileName = decodeURIComponent(url.pathname.split('/').pop() || '');
  const upper = fileName.toUpperCase();
  let documentKind: DocumentKind | undefined;
  if (/STORE|BRANCH/.test(upper)) documentKind = 'stores';
  else if (/PROMOFULL|PROMOTIONFULL/.test(upper)) documentKind = 'promo_full';
  else if (/PROMO|PROMOTION/.test(upper)) documentKind = 'promo_incremental';
  else if (/PRICEFULL/.test(upper)) documentKind = 'price_full';
  else if (/PRICE/.test(upper)) documentKind = 'price_incremental';
  if (!documentKind) return undefined;
  const storeId = /(?:STORE|BRANCH)[_-]?(\d{3,})/i.exec(fileName)?.[1]
    ?? /-\d{3}-(\d{3})-20\d{6}/i.exec(fileName)?.[1];
  return {
    id: `shufersal:${documentKind}:${fileName}:${url.pathname}`,
    retailerId: 'shufersal',
    documentKind,
    uri: fileUri,
    fileName,
    storeId,
  };
}

function listingFiles(listing: string, baseUrl: string): SourceFile[] {
  const links = [...listing.matchAll(/(?:href\s*=\s*["']([^"']+)|\b(https?:\/\/[^\s"']+\.(?:xml|gz)(?:\?[^\s"']*)?))/gi)].map((match) => match[1] ?? match[2]);
  const files = links.map((link) => classify(new URL(link, baseUrl).toString())).filter((file): file is SourceFile => Boolean(file));
  return [...new Map(files.map((file) => [file.id, file])).values()];
}

function listingPageLinks(listing: string, baseUrl: string): string[] {
  const base = new URL(baseUrl);
  return [...listing.matchAll(/href\s*=\s*["']([^"']+)["']/gi)]
    .map((match) => {
      try { return new URL(match[1]!, base); } catch { return undefined; }
    })
    .filter((url): url is URL => url !== undefined)
    .filter((url) => url.origin === base.origin && /(?:^|[?&])page=\d+/i.test(url.search) && !/(?:\.gz|\.xml)$/i.test(url.pathname))
    .map((url) => url.toString());
}

/**
 * Check the discovery result before a worker spends bandwidth downloading
 * branch files. This deliberately proves only file-set readiness; record
 * counts, permissions, and product completeness still belong to the catalog
 * manifest gate.
 */
export function diagnoseShufersalCoverage(files: readonly SourceFile[], listingPagesExhausted = false): ShufersalCoverageDiagnostic {
  const sourceFiles = files.filter((file) => file.retailerId === 'shufersal');
  const branchFiles = (kind: DocumentKind) => sourceFiles.filter((file) => file.documentKind === kind && Boolean(file.storeId));
  const priceFull = branchFiles('price_full');
  const promoFull = branchFiles('promo_full');
  const priceFullBranchIds = [...new Set(priceFull.map((file) => file.storeId!))].sort();
  const promoFullBranchIds = [...new Set(promoFull.map((file) => file.storeId!))].sort();
  const duplicatePriceFullBranchIds = priceFullBranchIds.filter((branchId) => priceFull.filter((file) => file.storeId === branchId).length > 1);
  const missingPromoFullBranchIds = priceFullBranchIds.filter((branchId) => !promoFullBranchIds.includes(branchId));
  const hasStoreSnapshot = sourceFiles.some((file) => file.documentKind === 'stores');
  const ready = listingPagesExhausted && hasStoreSnapshot && priceFullBranchIds.length > 0 && duplicatePriceFullBranchIds.length === 0;
  return {
    status: ready ? 'file-set-ready-records-unverified' : 'pagination-incomplete',
    hasStoreSnapshot,
    priceFullBranchIds,
    promoFullBranchIds,
    duplicatePriceFullBranchIds,
    missingPromoFullBranchIds,
    limitations: [
      ...(listingPagesExhausted ? [] : ['listing pagination was not proven exhausted']),
      ...(!hasStoreSnapshot ? ['the all-branch store snapshot is missing'] : []),
      ...(!priceFullBranchIds.length ? ['no branch pricefull files were discovered'] : []),
      ...(duplicatePriceFullBranchIds.length ? ['duplicate pricefull files require deterministic publication selection'] : []),
      ...(missingPromoFullBranchIds.length ? ['some branches have no promofull file; promotion coverage is incomplete'] : []),
      'downloaded record counts, schema validity, source rights, and completeness manifest are still unverified',
    ],
  };
}

export function createShufersalAdapter(options: ShufersalAdapterOptions = {}): RetailerSourceAdapter {
  return {
    retailerId: 'shufersal',
    metadata: shufersalDiscoveryMetadata,
    async discoverFiles(input) {
      if (options.listFiles) return await options.listFiles(input);
      if (!options.listingUrl) throw new IngestionError('Shufersal discovery needs listFiles or listingUrl', 'DISCOVERY_NOT_CONFIGURED');
      const maxPages = Math.max(1, Math.min(500, options.maxListingPages ?? 100));
      const pending = [options.listingUrl];
      const visited = new Set<string>();
      const discovered = new Map<string, SourceFile>();
      while (pending.length && visited.size < maxPages) {
        const pageUrl = pending.shift()!;
        if (visited.has(pageUrl)) continue;
        visited.add(pageUrl);
        const response = await fetchWithRetry(pageUrl, { signal: input.signal }, undefined, options.fetchImpl ?? fetch);
        if (!response.ok) throw new IngestionError(`Shufersal listing returned HTTP ${response.status}`, `HTTP_${response.status}`, response.status >= 500);
        const listing = await response.text();
        for (const file of listingFiles(listing, pageUrl)) discovered.set(file.id, file);
        for (const link of listingPageLinks(listing, pageUrl)) if (!visited.has(link) && !pending.includes(link)) pending.push(link);
      }
      if (pending.length) throw new IngestionError(`Shufersal listing exceeded maxListingPages (${maxPages})`, 'DISCOVERY_INCOMPLETE');
      const files = [...discovered.values()];
      const kinds = input.documentKinds ? new Set(input.documentKinds) : undefined;
      return files.filter((file) => !kinds || kinds.has(file.documentKind));
    },
    async downloadFile(file, signal) {
      if (options.download) return options.download(file, signal);
      return downloadSourceFile(file, { fetchImpl: options.fetchImpl, signal });
    },
    parseStores: parseCerberusStores,
    parsePrices: parseCerberusPrices,
    parsePromotions: parseCerberusPromotions,
  };
}

export const shufersalAdapter = createShufersalAdapter();
