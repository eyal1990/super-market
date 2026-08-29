import { downloadSourceFile, fetchWithRetry, IngestionError } from '../core';
import type {
  AdapterDiscoveryMetadata,
  DiscoveryInput,
  DownloadedSourceFile,
  DocumentKind,
  NormalizedPrice,
  NormalizedPromotion,
  NormalizedStore,
  ParseContext,
  RetailerSourceAdapter,
  SourceFile,
} from '../types';
import { decodeXmlBytes, elementText, findXmlNodes, parseXmlDocument, xmlAttribute, xmlDate, xmlDescendantText, xmlNumber, xmlText, type XmlNode } from '../xml';

export const cerberusDiscoveryMetadata: AdapterDiscoveryMetadata = {
  adapterId: 'cerberus',
  retailerId: 'cerberus',
  displayName: 'Cerberus shared retailer feed',
  sourceFamily: 'cerberus-ftp',
  endpointHints: ['ftp://url.retail.publishedprices.co.il', 'https://url.retail.publishedprices.co.il'],
  supportedDocumentKinds: ['stores', 'price_full', 'price_incremental', 'promo_full', 'promo_incremental'],
  gzipExpected: true,
  requiresAuthentication: true,
  limitations: [
    'The shared endpoint is FTP/TLS-oriented; the built-in downloader only handles HTTP(S). Inject an FTP downloader for production.',
    'File names and store identifiers vary by chain and must be verified against current listings.',
    'Some sources may be geo-blocked, delayed, or rate-limited outside Israel.',
  ],
};

export interface CerberusAdapterOptions {
  baseUrl?: string;
  listingUrl?: string;
  fetchImpl?: typeof fetch;
  listFiles?: (input: DiscoveryInput) => Promise<SourceFile[]>;
  download?: (file: SourceFile, signal?: AbortSignal) => Promise<DownloadedSourceFile>;
}

function normalized(value: string | undefined): string | undefined {
  return value?.replace(/\s+/g, ' ').trim() || undefined;
}

function field(node: XmlNode, names: readonly string[]): string | undefined {
  return normalized(xmlText(node, names) ?? xmlDescendantText(node, names));
}

function sourceContext(file: DownloadedSourceFile, context?: ParseContext): ParseContext {
  if (context) return context;
  const now = new Date();
  return {
    source: file,
    metadata: {
      retailerId: file.source.retailerId,
      adapterId: file.source.retailerId === 'shufersal' ? 'shufersal' : cerberusDiscoveryMetadata.adapterId,
      sourceFileId: file.source.id,
      sourceUri: file.source.uri,
      fileName: file.source.fileName,
      documentKind: file.source.documentKind,
      publishedAt: file.source.publishedAt,
      downloadedAt: file.downloadedAt,
      checksum: file.checksum,
    },
    now,
    warn: () => undefined,
  };
}

function parseRoot(file: DownloadedSourceFile): XmlNode {
  return parseXmlDocument(decodeXmlBytes(file.body), { maxCharacters: Math.max(file.body.byteLength * 4, 1_000_000) });
}

function sourceRecordId(context: ParseContext) {
  return context.metadata;
}

function recordStoreId(node: XmlNode, file: DownloadedSourceFile): string | undefined {
  return normalized(xmlAttribute(node, ['storeid', 'store', 'branchid', 'code'])
    ?? field(node, ['storeid', 'store', 'branchid', 'branchcode', 'storecode'])
    ?? file.source.storeId);
}

function recordNodes(root: XmlNode, preferred: readonly string[], fallback: readonly string[]): XmlNode[] {
  const found = findXmlNodes(root, preferred);
  if (found.length) return found;
  return root.children.filter((child) => fallback.includes(child.localName));
}

export async function* parseCerberusStores(file: DownloadedSourceFile, contextArg?: ParseContext): AsyncIterable<NormalizedStore> {
  const context = sourceContext(file, contextArg);
  const root = parseRoot(file);
  const nodes = recordNodes(root, ['store', 'branch', 'shop'], ['store', 'branch', 'shop']);
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    const storeId = recordStoreId(node, file) ?? `unknown-${index + 1}`;
    if (storeId.startsWith('unknown-')) context.warn(`Store record ${index + 1} has no source identifier`);
    const name = field(node, ['storename', 'branchname', 'name']) ?? storeId;
    const latitude = xmlNumber(field(node, ['latitude', 'lat']));
    const longitude = xmlNumber(field(node, ['longitude', 'lon', 'lng']));
    yield {
      retailerId: file.source.retailerId,
      storeId,
      chainId: field(node, ['chainid', 'chain', 'subchainid']),
      name,
      address: field(node, ['address', 'street', 'streetname']),
      city: field(node, ['city', 'town']),
      postalCode: field(node, ['zipcode', 'postalcode', 'zip']),
      latitude,
      longitude,
      isActive: !/inactive|closed|false|0/i.test(field(node, ['status', 'active']) ?? ''),
      source: sourceRecordId(context),
    };
  }
}

function priceNodes(root: XmlNode): XmlNode[] {
  return recordNodes(root, ['item', 'product', 'itemprice', 'priceitem', 'productprice'], ['item', 'product', 'priceitem']);
}

export async function* parseCerberusPrices(file: DownloadedSourceFile, contextArg?: ParseContext): AsyncIterable<NormalizedPrice> {
  const context = sourceContext(file, contextArg);
  const root = parseRoot(file);
  const nodes = priceNodes(root);
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    const storeId = recordStoreId(node, file);
    const retailerItemId = field(node, ['itemcode', 'itemid', 'retaileritemid', 'productcode', 'code', 'sku']);
    const priceNis = xmlNumber(field(node, ['price', 'itemprice', 'saleprice', 'currentprice']));
    if (!storeId || !retailerItemId || priceNis === undefined) {
      context.warn(`Skipped price record ${index + 1}: missing store, item identifier, or numeric price`);
      continue;
    }
    const status = field(node, ['status', 'itemstatus', 'available']);
    yield {
      retailerId: file.source.retailerId,
      storeId,
      barcode: field(node, ['barcode', 'ean', 'gtin']),
      retailerItemId,
      productName: field(node, ['productname', 'itemname', 'name', 'description']),
      priceNis,
      unitPriceNis: xmlNumber(field(node, ['unitprice', 'priceperunit', 'unitmeasureprice'])),
      unitOfMeasure: field(node, ['unitofmeasure', 'measure', 'unit']),
      quantity: xmlNumber(field(node, ['quantity', 'qty', 'packquantity'])),
      isAvailable: status ? !/inactive|unavailable|false|0|out/i.test(status) : undefined,
      isWeighted: /true|yes|weighted|שקיל/i.test(field(node, ['weighted', 'isweighted', 'weightflag']) ?? ''),
      observedAt: xmlDate(field(node, ['updatedat', 'updated', 'priceupdated', 'timestamp'])) ?? context.now.toISOString(),
      source: sourceRecordId(context),
    };
  }
}

function promotionNodes(root: XmlNode): XmlNode[] {
  return recordNodes(root, ['promotion', 'promo', 'promotionitem'], ['promotion', 'promo']);
}

export async function* parseCerberusPromotions(file: DownloadedSourceFile, contextArg?: ParseContext): AsyncIterable<NormalizedPromotion> {
  const context = sourceContext(file, contextArg);
  const root = parseRoot(file);
  const nodes = promotionNodes(root);
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    const promotionId = field(node, ['promotionid', 'promoid', 'id', 'code']) ?? `unknown-${index + 1}`;
    const items = [...new Set(findXmlNodes(node, ['itemcode', 'itemid', 'productcode', 'barcode', 'ean']).map(elementText).filter((value): value is string => Boolean(value)))];
    const clubId = field(node, ['clubid', 'clubcode', 'membershipid']);
    const clubFlag = field(node, ['clubonly', 'isclub', 'club', 'eligibility']);
    yield {
      retailerId: file.source.retailerId,
      storeId: recordStoreId(node, file),
      promotionId,
      description: field(node, ['description', 'promotiondescription', 'name']) ?? promotionId,
      startsAt: xmlDate(field(node, ['startdate', 'starttime', 'validfrom'])),
      endsAt: xmlDate(field(node, ['enddate', 'endtime', 'validto'])),
      minimumQuantity: xmlNumber(field(node, ['minquantity', 'minimumquantity', 'quantity'])),
      discountNis: xmlNumber(field(node, ['discount', 'discountamount'])),
      discountPercent: xmlNumber(field(node, ['discountpercent', 'discountpercentage'])),
      promotionalPriceNis: xmlNumber(field(node, ['promotionalprice', 'saleprice', 'discountedprice'])),
      clubId,
      isClubOnly: Boolean(clubId) || /club|member|מועדון/i.test(clubFlag ?? ''),
      retailerItemIds: items,
      source: sourceRecordId(context),
    };
  }
}

function documentKindFromName(fileName: string): DocumentKind | undefined {
  const name = fileName.toLowerCase();
  if (/stores?/.test(name)) return 'stores';
  if (/promofull|promotionfull/.test(name)) return 'promo_full';
  if (/(^|[^a-z])promo(?!full)|promotion(?!full)/.test(name)) return 'promo_incremental';
  if (/pricefull/.test(name)) return 'price_full';
  if (/(^|[^a-z])price(?!full)/.test(name)) return 'price_incremental';
  return undefined;
}

function sourceFromUri(uri: string, retailerId: string): SourceFile | undefined {
  let parsed: URL;
  try { parsed = new URL(uri); } catch { return undefined; }
  const fileName = decodeURIComponent(parsed.pathname.split('/').pop() || '');
  const documentKind = documentKindFromName(fileName);
  if (!documentKind) return undefined;
  const storeMatch = /(?:store|branch|price|promo)[_-]?(\d{3,})/i.exec(fileName);
  const dateMatch = /(20\d{2}[-_]?\d{2}[-_]?\d{2})/.exec(fileName);
  return {
    id: `cerberus:${documentKind}:${fileName}:${parsed.pathname}`,
    retailerId,
    documentKind,
    uri,
    fileName,
    storeId: storeMatch?.[1],
    publishedAt: dateMatch ? xmlDate(dateMatch[1].replace(/_/g, '-').replace(/(\d{4})-(\d{2})(\d{2})/, '$1-$2-$3')) : undefined,
  };
}

function listingLinks(listing: string, baseUrl: string, retailerId: string): SourceFile[] {
  const hrefs = [...listing.matchAll(/(?:href\s*=\s*["']([^"']+)|\b(https?:\/\/[^\s"']+\.(?:xml|gz)(?:\?[^\s"']*)?))/gi)].map((match) => match[1] ?? match[2]);
  const files: SourceFile[] = [];
  for (const href of hrefs) {
    const source = sourceFromUri(new URL(href, baseUrl).toString(), retailerId);
    if (source) files.push(source);
  }
  return [...new Map(files.map((file) => [file.id, file])).values()];
}

function filterFiles(files: SourceFile[], input: DiscoveryInput): SourceFile[] {
  const kinds = input.documentKinds ? new Set(input.documentKinds) : undefined;
  return files.filter((file) => file.retailerId === input.retailerId && (!kinds || kinds.has(file.documentKind)) && (!input.since || !file.publishedAt || file.publishedAt >= input.since.toISOString()) && (!input.until || !file.publishedAt || file.publishedAt <= input.until.toISOString()));
}

export function createCerberusAdapter(options: CerberusAdapterOptions = {}): RetailerSourceAdapter {
  const retailerId = 'cerberus';
  const baseUrl = options.baseUrl ?? 'ftp://url.retail.publishedprices.co.il';
  return {
    retailerId,
    metadata: cerberusDiscoveryMetadata,
    async discoverFiles(input) {
      if (options.listFiles) return filterFiles(await options.listFiles(input), input);
      if (!options.listingUrl) throw new IngestionError('Cerberus discovery needs listFiles or an HTTP listingUrl', 'DISCOVERY_NOT_CONFIGURED');
      const response = await fetchWithRetry(options.listingUrl, { signal: input.signal }, undefined, options.fetchImpl ?? fetch);
      if (!response.ok) throw new IngestionError(`Cerberus listing returned HTTP ${response.status}`, `HTTP_${response.status}`, response.status >= 500);
      const listing = await response.text();
      return filterFiles(listingLinks(listing, options.listingUrl ?? baseUrl, retailerId), input);
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

export const cerberusAdapter = createCerberusAdapter();
