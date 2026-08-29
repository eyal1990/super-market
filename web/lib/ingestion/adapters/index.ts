import type { AdapterDiscoveryMetadata, RetailerSourceAdapter } from '../types';
import { cerberusAdapter, cerberusDiscoveryMetadata, createCerberusAdapter, type CerberusAdapterOptions } from './cerberus';
import { createShufersalAdapter, shufersalAdapter, shufersalDiscoveryMetadata, type ShufersalAdapterOptions } from './shufersal';

export { cerberusAdapter, cerberusDiscoveryMetadata, createCerberusAdapter, shufersalAdapter, shufersalDiscoveryMetadata, createShufersalAdapter };
export type { CerberusAdapterOptions, ShufersalAdapterOptions };

export const adapterDiscoveryCatalog: readonly AdapterDiscoveryMetadata[] = [cerberusDiscoveryMetadata, shufersalDiscoveryMetadata];

export function createAdapterRegistry(options: { cerberus?: CerberusAdapterOptions; shufersal?: ShufersalAdapterOptions } = {}): Map<string, RetailerSourceAdapter> {
  return new Map([
    ['cerberus', createCerberusAdapter(options.cerberus)],
    ['shufersal', createShufersalAdapter(options.shufersal)],
  ]);
}
