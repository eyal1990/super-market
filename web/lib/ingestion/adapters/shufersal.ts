import { downloadSourceFile, fetchWithRetry, IngestionError } from '../core';
import type {
  AdapterDiscoveryMetadata,
  DiscoveryInput,
  DownloadedSourceFile,
  DocumentKind,
  RetailerSourceAdapter,
  SourceFile,
} from '../types';
import { parseCerberusPrices, parseCerberusPromotions, parseCerberusStores } from './cerberus';

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
  fetchImpl?: typeof fetch;
  listFiles?: (input: DiscoveryInput) => Promise<SourceFile[]>;
  download?: (file: SourceFile, signal?: AbortSignal) => Promise<DownloadedSourceFile>;
}

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
  const storeId = /(?:STORE|BRANCH)[_-]?(\d{3,})/i.exec(fileName)?.[1];
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

export function createShufersalAdapter(options: ShufersalAdapterOptions = {}): RetailerSourceAdapter {
  return {
    retailerId: 'shufersal',
    metadata: shufersalDiscoveryMetadata,
    async discoverFiles(input) {
      if (options.listFiles) return await options.listFiles(input);
      if (!options.listingUrl) throw new IngestionError('Shufersal discovery needs listFiles or listingUrl', 'DISCOVERY_NOT_CONFIGURED');
      const response = await fetchWithRetry(options.listingUrl, { signal: input.signal }, undefined, options.fetchImpl ?? fetch);
      if (!response.ok) throw new IngestionError(`Shufersal listing returned HTTP ${response.status}`, `HTTP_${response.status}`, response.status >= 500);
      const files = listingFiles(await response.text(), options.listingUrl);
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
