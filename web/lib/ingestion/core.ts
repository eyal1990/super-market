import { createHash } from 'node:crypto';
import {
  DEFAULT_DOWNLOAD_POLICY,
  type DownloadPolicy,
  type DownloadedSourceFile,
  type IngestionCounts,
  type IngestionFailure,
  type IngestionRunResult,
  type IngestionSink,
  type ParseContext,
  type RetailerSourceAdapter,
  type RetryPolicy,
  type SourceFile,
} from './types';
import type { DiscoveryInput } from './types';

export class IngestionError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'IngestionError';
  }
}

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function abortError(signal?: AbortSignal): IngestionError {
  return new IngestionError(signal?.aborted ? 'Operation cancelled' : 'Operation timed out', 'TIMEOUT', true);
}

function retryDelay(response: Response | undefined, attempt: number, policy: RetryPolicy): number {
  const retryAfter = response?.headers.get('retry-after');
  const serverDelay = retryAfter ? Number(retryAfter) * 1_000 : Number.NaN;
  const exponential = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** attempt);
  const jitter = exponential * policy.jitterRatio * Math.random();
  return Math.min(policy.maxDelayMs, Number.isFinite(serverDelay) ? serverDelay : exponential + jitter);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(abortError(signal));
    }, { once: true });
  });
}

export async function fetchWithRetry(
  input: RequestInfo | URL,
  init: RequestInit = {},
  policy: Pick<DownloadPolicy, 'timeoutMs' | 'retry'> = DEFAULT_DOWNLOAD_POLICY,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  let lastError: unknown;
  const attempts = Math.max(1, Math.floor(policy.retry.attempts));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, policy.timeoutMs);
    const signal = init.signal ? AbortSignal.any([init.signal, controller.signal]) : controller.signal;
    try {
      const response = await fetchImpl(input, { ...init, signal });
      if (!RETRYABLE_STATUS.has(response.status) || attempt === attempts - 1) return response;
      await sleep(retryDelay(response, attempt, policy.retry), init.signal ?? undefined);
    } catch (error) {
      if (init.signal?.aborted) throw abortError(init.signal);
      lastError = timedOut ? abortError() : error;
      if (attempt === attempts - 1) break;
      await sleep(retryDelay(undefined, attempt, policy.retry), init.signal ?? undefined);
    } finally {
      clearTimeout(timeout);
    }
  }
  if (lastError instanceof IngestionError) throw lastError;
  throw new IngestionError(lastError instanceof Error ? lastError.message : 'Request failed after retries', 'NETWORK_RETRY_EXHAUSTED', true);
}

export async function readBoundedBody(response: Response, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new IngestionError(`Response exceeds ${maxBytes} byte limit`, 'MAX_COMPRESSED_SIZE', false);
  }
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maxBytes) throw new IngestionError('Response exceeded byte limit', 'MAX_COMPRESSED_SIZE', false);
    return bytes;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel('maximum response size exceeded');
        throw new IngestionError(`Response exceeds ${maxBytes} byte limit`, 'MAX_COMPRESSED_SIZE', false);
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}

export function isGzip(bytes: Uint8Array, fileName = '', contentType = '', contentEncoding = ''): boolean {
  const magic = bytes.byteLength >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
  return magic || /(?:\.gz|gzip)$/i.test(fileName) || /gzip/i.test(contentType) || /gzip/i.test(contentEncoding);
}

async function gunzipBounded(bytes: Uint8Array, maxBytes: number): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new IngestionError('Gzip decompression is unavailable in this runtime', 'GZIP_UNSUPPORTED', false);
  }
  const source = new Blob([new Uint8Array(bytes)]).stream();
  const stream = source.pipeThrough(new DecompressionStream('gzip'));
  return readBoundedBody(new Response(stream), maxBytes);
}

export async function decodeSourceBody(
  bytes: Uint8Array,
  source: Pick<SourceFile, 'fileName' | 'contentType' | 'contentEncoding'>,
  maxUncompressedBytes = DEFAULT_DOWNLOAD_POLICY.maxUncompressedBytes,
): Promise<{ body: Uint8Array; compression: 'none' | 'gzip' }> {
  if (!isGzip(bytes, source.fileName, source.contentType ?? '', source.contentEncoding ?? '')) {
    return { body: bytes, compression: 'none' };
  }
  return { body: await gunzipBounded(bytes, maxUncompressedBytes), compression: 'gzip' };
}

export async function downloadSourceFile(
  source: SourceFile,
  options: { fetchImpl?: typeof fetch; policy?: Partial<DownloadPolicy>; signal?: AbortSignal } = {},
): Promise<DownloadedSourceFile> {
  let url: URL;
  try { url = new URL(source.uri); } catch { throw new IngestionError(`Invalid source URI: ${source.uri}`, 'INVALID_URI'); }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new IngestionError(`No built-in downloader for ${url.protocol}`, 'UNSUPPORTED_TRANSPORT');
  }
  const policy: DownloadPolicy = {
    ...DEFAULT_DOWNLOAD_POLICY,
    ...options.policy,
    retry: { ...DEFAULT_DOWNLOAD_POLICY.retry, ...options.policy?.retry },
  };
  const response = await fetchWithRetry(source.uri, { signal: options.signal }, policy, options.fetchImpl ?? fetch);
  if (!response.ok) throw new IngestionError(`Source returned HTTP ${response.status}`, `HTTP_${response.status}`, RETRYABLE_STATUS.has(response.status));
  const compressed = await readBoundedBody(response, policy.maxCompressedBytes);
  const decoded = await decodeSourceBody(compressed, {
    fileName: source.fileName,
    contentType: source.contentType ?? response.headers.get('content-type') ?? undefined,
    contentEncoding: source.contentEncoding ?? response.headers.get('content-encoding') ?? undefined,
  }, policy.maxUncompressedBytes);
  return {
    source,
    body: decoded.body,
    compression: decoded.compression,
    compressedSizeBytes: compressed.byteLength,
    sizeBytes: decoded.body.byteLength,
    contentType: response.headers.get('content-type') ?? source.contentType,
    checksum: sha256Hex(decoded.body),
    downloadedAt: new Date().toISOString(),
  };
}

function emptyCounts(): IngestionCounts {
  return { documents: 0, stores: 0, prices: 0, promotions: 0, skippedDocuments: 0 };
}

function failureFrom(error: unknown, source?: SourceFile): IngestionFailure {
  const ingestionError = error instanceof IngestionError ? error : undefined;
  return {
    sourceFileId: source?.id,
    fileName: source?.fileName,
    code: ingestionError?.code ?? 'INGESTION_ERROR',
    message: error instanceof Error ? error.message : 'Unknown ingestion error',
    retryable: ingestionError?.retryable ?? false,
  };
}

async function forwardAndCount<T>(
  records: AsyncIterable<T>,
  upsert: ((records: AsyncIterable<T>) => Promise<number>) | undefined,
): Promise<number> {
  let count = 0;
  const countedRecords = (async function* () {
    for await (const record of records) {
      count += 1;
      yield record;
    }
  }());
  if (upsert) await upsert(countedRecords);
  else for await (const record of countedRecords) { void record; }
  return count;
}

export function createRunKey(adapterId: string, now = new Date()): string {
  return `${adapterId}:${now.toISOString()}`;
}

export async function runIngestion(
  adapter: RetailerSourceAdapter,
  input: DiscoveryInput,
  sink?: IngestionSink,
  options: { idempotencyStore?: { getRun(key: string): Promise<IngestionRunResult | null>; saveRun(result: IngestionRunResult): Promise<void>; isDocumentProcessed?(id: string, checksum?: string): Promise<boolean> } } = {},
): Promise<IngestionRunResult> {
  const started = input.now ?? new Date();
  const runKey = input.runKey ?? createRunKey(adapter.metadata.adapterId, started);
  const previous = await options.idempotencyStore?.getRun(runKey);
  if (previous) return { ...previous, replayed: true };
  const result: IngestionRunResult = {
    runKey,
    retailerId: adapter.retailerId,
    adapterId: adapter.metadata.adapterId,
    status: 'completed',
    idempotencyKey: runKey,
    replayed: false,
    startedAt: started.toISOString(),
    finishedAt: started.toISOString(),
    counts: emptyCounts(),
    warnings: [],
    failures: [],
    processedDocumentIds: [],
  };
  let files: SourceFile[];
  try {
    files = await adapter.discoverFiles(input);
  } catch (error) {
    result.status = 'failed';
    result.failures.push(failureFrom(error));
    result.finishedAt = new Date().toISOString();
    await options.idempotencyStore?.saveRun(result);
    return result;
  }
  const unique = [...new Map(files.map((file) => [file.id, file])).values()];
  for (const source of unique) {
    let document: DownloadedSourceFile | undefined;
    try {
      document = await adapter.downloadFile(source, input.signal);
      if (await options.idempotencyStore?.isDocumentProcessed?.(source.id, document.checksum)) {
        result.counts.skippedDocuments += 1;
        continue;
      }
      const warnings: string[] = [];
      const context: ParseContext = {
        source: document,
        metadata: {
          retailerId: adapter.retailerId,
          adapterId: adapter.metadata.adapterId,
          sourceFileId: source.id,
          sourceUri: source.uri,
          fileName: source.fileName,
          documentKind: source.documentKind,
          publishedAt: source.publishedAt,
          downloadedAt: document.downloadedAt,
          checksum: document.checksum,
        },
        now: started,
        warn: (message) => warnings.push(message),
      };
      const sinkContext = { runKey, source: document, signal: input.signal };
      await sink?.beginDocument?.(sinkContext);
      const documentCounts = { stores: 0, prices: 0, promotions: 0 };
      if (source.documentKind === 'stores') {
        documentCounts.stores = await forwardAndCount(adapter.parseStores(document, context), sink?.upsertStores ? (records) => sink.upsertStores!(records, sinkContext) : undefined);
      } else if (source.documentKind === 'price_full' || source.documentKind === 'price_incremental') {
        documentCounts.prices = await forwardAndCount(adapter.parsePrices(document, context), sink?.upsertPrices ? (records) => sink.upsertPrices!(records, sinkContext) : undefined);
      } else {
        documentCounts.promotions = await forwardAndCount(adapter.parsePromotions(document, context), sink?.upsertPromotions ? (records) => sink.upsertPromotions!(records, sinkContext) : undefined);
      }
      await sink?.commitDocument?.(sinkContext);
      result.counts.stores += documentCounts.stores;
      result.counts.prices += documentCounts.prices;
      result.counts.promotions += documentCounts.promotions;
      result.counts.documents += 1;
      result.processedDocumentIds.push(source.id);
      result.warnings.push(...warnings);
    } catch (error) {
      if (document) {
        const sinkContext = { runKey, source: document, signal: input.signal };
        try { await sink?.rollbackDocument?.(sinkContext, error); } catch { /* rollback must not hide the source failure */ }
      }
      result.failures.push(failureFrom(error, source));
    }
  }
  result.status = result.failures.length === 0 ? 'completed' : result.processedDocumentIds.length ? 'partial' : 'failed';
  result.finishedAt = new Date().toISOString();
  await options.idempotencyStore?.saveRun(result);
  return result;
}
