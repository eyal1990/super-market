export const DOCUMENT_KINDS = [
  'stores',
  'price_full',
  'price_incremental',
  'promo_full',
  'promo_incremental',
] as const;

export type DocumentKind = (typeof DOCUMENT_KINDS)[number];
export type Compression = 'none' | 'gzip';
export type IngestionRunStatus = 'completed' | 'partial' | 'failed';

export interface DiscoveryInput {
  retailerId: string;
  documentKinds?: readonly DocumentKind[];
  since?: Date;
  until?: Date;
  runKey?: string;
  signal?: AbortSignal;
  now?: Date;
}

export interface SourceFile {
  id: string;
  retailerId: string;
  documentKind: DocumentKind;
  uri: string;
  fileName: string;
  storeId?: string;
  publishedAt?: string;
  contentType?: string;
  contentEncoding?: string;
  sizeBytes?: number;
  checksum?: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface DownloadedSourceFile {
  source: SourceFile;
  body: Uint8Array;
  compression: Compression;
  compressedSizeBytes: number;
  sizeBytes: number;
  contentType?: string;
  checksum: string;
  downloadedAt: string;
}

export interface SourceMetadata {
  retailerId: string;
  adapterId: string;
  sourceFileId: string;
  sourceUri: string;
  fileName: string;
  documentKind: DocumentKind;
  publishedAt?: string;
  downloadedAt: string;
  checksum: string;
}

export interface ParseContext {
  source: DownloadedSourceFile;
  metadata: SourceMetadata;
  now: Date;
  warn(message: string): void;
}

export interface NormalizedStore {
  retailerId: string;
  storeId: string;
  chainId?: string;
  name: string;
  address?: string;
  city?: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
  isActive?: boolean;
  source: SourceMetadata;
}

export interface NormalizedPrice {
  retailerId: string;
  storeId: string;
  barcode?: string;
  retailerItemId: string;
  productName?: string;
  priceNis: number;
  unitPriceNis?: number;
  unitOfMeasure?: string;
  quantity?: number;
  isAvailable?: boolean;
  isWeighted?: boolean;
  observedAt: string;
  source: SourceMetadata;
}

export interface NormalizedPromotion {
  retailerId: string;
  storeId?: string;
  promotionId: string;
  description: string;
  startsAt?: string;
  endsAt?: string;
  minimumQuantity?: number;
  discountNis?: number;
  discountPercent?: number;
  promotionalPriceNis?: number;
  clubId?: string;
  isClubOnly: boolean;
  retailerItemIds: string[];
  source: SourceMetadata;
}

export interface AdapterDiscoveryMetadata {
  adapterId: string;
  retailerId: string;
  displayName: string;
  sourceFamily: 'cerberus-ftp' | 'retailer-portal';
  endpointHints: readonly string[];
  supportedDocumentKinds: readonly DocumentKind[];
  gzipExpected: boolean;
  requiresAuthentication: boolean;
  limitations: readonly string[];
}

export interface RetailerSourceAdapter {
  readonly retailerId: string;
  readonly metadata: AdapterDiscoveryMetadata;
  discoverFiles(input: DiscoveryInput): Promise<SourceFile[]>;
  downloadFile(file: SourceFile, signal?: AbortSignal): Promise<DownloadedSourceFile>;
  parseStores(file: DownloadedSourceFile, context?: ParseContext): AsyncIterable<NormalizedStore>;
  parsePrices(file: DownloadedSourceFile, context?: ParseContext): AsyncIterable<NormalizedPrice>;
  parsePromotions(file: DownloadedSourceFile, context?: ParseContext): AsyncIterable<NormalizedPromotion>;
}

export interface IngestionCounts {
  documents: number;
  stores: number;
  prices: number;
  promotions: number;
  skippedDocuments: number;
}

export interface IngestionFailure {
  sourceFileId?: string;
  fileName?: string;
  code: string;
  message: string;
  retryable: boolean;
}

export interface IngestionRunResult {
  runKey: string;
  retailerId: string;
  adapterId: string;
  status: IngestionRunStatus;
  idempotencyKey: string;
  replayed: boolean;
  startedAt: string;
  finishedAt: string;
  counts: IngestionCounts;
  warnings: string[];
  failures: IngestionFailure[];
  processedDocumentIds: string[];
}

export interface IngestionDocumentContext {
  runKey: string;
  source: DownloadedSourceFile;
  signal?: AbortSignal;
}

export interface IngestionSink {
  beginDocument?(context: IngestionDocumentContext): Promise<void>;
  upsertStores?(records: AsyncIterable<NormalizedStore>, context: IngestionDocumentContext): Promise<number>;
  upsertPrices?(records: AsyncIterable<NormalizedPrice>, context: IngestionDocumentContext): Promise<number>;
  upsertPromotions?(records: AsyncIterable<NormalizedPromotion>, context: IngestionDocumentContext): Promise<number>;
  commitDocument?(context: IngestionDocumentContext): Promise<void>;
  rollbackDocument?(context: IngestionDocumentContext, error: unknown): Promise<void>;
}

export interface IdempotencyStore {
  getRun(runKey: string): Promise<IngestionRunResult | null>;
  saveRun(result: IngestionRunResult): Promise<void>;
  isDocumentProcessed?(sourceFileId: string, checksum?: string): Promise<boolean>;
}

export interface RetryPolicy {
  attempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterRatio: number;
}

export interface DownloadPolicy {
  timeoutMs: number;
  maxCompressedBytes: number;
  maxUncompressedBytes: number;
  retry: RetryPolicy;
}

export const DEFAULT_DOWNLOAD_POLICY: DownloadPolicy = {
  timeoutMs: 30_000,
  maxCompressedBytes: 50 * 1024 * 1024,
  maxUncompressedBytes: 200 * 1024 * 1024,
  retry: { attempts: 3, baseDelayMs: 500, maxDelayMs: 8_000, jitterRatio: 0.2 },
};
