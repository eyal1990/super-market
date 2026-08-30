import type { AdapterDiscoveryMetadata, RetailerSourceAdapter } from '../types.ts';
import { cerberusAdapter, cerberusDiscoveryMetadata, createCerberusAdapter, type CerberusAdapterOptions } from './cerberus.ts';
import { createShufersalAdapter, diagnoseShufersalCoverage, shufersalAdapter, shufersalDiscoveryMetadata, type ShufersalAdapterOptions, type ShufersalCoverageDiagnostic } from './shufersal.ts';

export { cerberusAdapter, cerberusDiscoveryMetadata, createCerberusAdapter, diagnoseShufersalCoverage, shufersalAdapter, shufersalDiscoveryMetadata, createShufersalAdapter };
export type { CerberusAdapterOptions, ShufersalAdapterOptions, ShufersalCoverageDiagnostic };

export const adapterDiscoveryCatalog: readonly AdapterDiscoveryMetadata[] = [cerberusDiscoveryMetadata, shufersalDiscoveryMetadata];

export function createAdapterRegistry(options: { cerberus?: CerberusAdapterOptions; shufersal?: ShufersalAdapterOptions } = {}): Map<string, RetailerSourceAdapter> {
  return new Map([
    ['cerberus', createCerberusAdapter(options.cerberus)],
    ['shufersal', createShufersalAdapter(options.shufersal)],
  ]);
}

/**
 * Build the production-shaped registry from environment configuration. The
 * shared Cerberus endpoint still needs an injected FTP/TLS downloader when its
 * listing is not exposed over HTTP; leaving the URL unset keeps local startup
 * fixture-friendly instead of making a network dependency implicit.
 */
export function createConfiguredAdapterRegistry(env: NodeJS.ProcessEnv = process.env): Map<string, RetailerSourceAdapter> {
  return createAdapterRegistry({
    cerberus: {
      listingUrl: env.CERBERUS_LISTING_URL?.trim() || undefined,
      baseUrl: env.CERBERUS_FTP_HOST?.trim() ? `ftp://${env.CERBERUS_FTP_HOST.trim()}` : undefined,
    },
    shufersal: { listingUrl: env.SHUFERSAL_LISTING_URL?.trim() || undefined },
  });
}
